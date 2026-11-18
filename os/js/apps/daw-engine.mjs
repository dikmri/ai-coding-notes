// 多重録音スタジオの音の組み立て。再生（AudioContext）とミックスダウン（OfflineAudioContext）の両方がこの同じ関数を使うので、
// 聞いた音と書き出した音が同じ計算になる。どの音をいつ・どこから鳴らすかは core/daw.mjs の schedule が決める。
//
// つなぎ方: 音（BufferSource）→ クリップの音量とフェード（Gain）→ 上のクリップに隠れる端の短い傾き（Gain）
//   → 段の入口（2 チャンネルにそろえる）→ 段の音量（消音・単独を含む）→ 左右に分けてパンの倍率 → 合わせる（→ 音の大きさの表示）→ マスター → 出口
import * as D from '../core/daw.mjs';

export function createEngine(ctx, { output = ctx.destination, meters = false } = {}) {
  const master = ctx.createGain();
  master.connect(output);
  let mSplit = null, mL = null, mR = null, buf = null;
  if (meters) {
    mSplit = ctx.createChannelSplitter(2); mL = ctx.createAnalyser(); mR = ctx.createAnalyser();
    mL.fftSize = mR.fftSize = 1024; buf = new Float32Array(1024);
    master.connect(mSplit); mSplit.connect(mL, 0); mSplit.connect(mR, 1);
  }
  const tracks = new Map(); // 段の id → 音の部品
  let playing = []; // 鳴らす予定の音（止めるときに使う）
  const clickBufs = {};

  function trackNode(id) {
    if (tracks.has(id)) return tracks.get(id);
    // 段の入口は 2 チャンネルに決める。モノラルの音は左右に同じ音として広げる（speakers の決まり）
    const input = ctx.createGain(); input.channelCount = 2; input.channelCountMode = 'explicit'; input.channelInterpretation = 'speakers';
    const vol = ctx.createGain(), split = ctx.createChannelSplitter(2), gl = ctx.createGain(), gr = ctx.createGain(), merge = ctx.createChannelMerger(2);
    input.connect(vol).connect(split);
    split.connect(gl, 0); split.connect(gr, 1);
    gl.connect(merge, 0, 0); gr.connect(merge, 0, 1);
    let an = null;
    if (meters) { an = ctx.createAnalyser(); an.fftSize = 1024; merge.connect(an); }
    merge.connect(master);
    const n = { input, vol, gl, gr, merge, an };
    tracks.set(id, n);
    return n;
  }
  const setNow = (param, v, smooth) => { if (smooth) param.setTargetAtTime(v, ctx.currentTime, 0.015); else param.value = v; };
  // 段の音量・パン・消音・単独とマスターを、計画の値にそろえる（再生の途中でも、なめらかに変える）
  function apply(project, smooth = false) {
    for (const t of project.tracks) {
      const n = trackNode(t.id), [l, r] = D.panGains(t.pan);
      setNow(n.vol.gain, D.trackGain(t, project.tracks), smooth); setNow(n.gl.gain, l, smooth); setNow(n.gr.gain, r, smooth);
    }
    for (const [id, n] of tracks) if (!project.tracks.some((t) => t.id === id)) { n.merge.disconnect(); tracks.delete(id); }
    setNow(master.gain, D.dbToGain(project.master), smooth);
  }
  // 計画の [from, to) を、音の時刻 when から鳴らす。buffers: 音のパス → { buffer }。音の無いクリップは飛ばす
  function play(project, buffers, from, to, when) {
    const T = (t) => when + (t - from);
    let n = 0;
    for (const s of D.schedule(project, from, to)) {
      const b = buffers.get(s.src)?.buffer;
      if (!b || s.offset >= b.duration) continue;
      const src = ctx.createBufferSource(), g = ctx.createGain(), e = ctx.createGain();
      src.buffer = b;
      g.gain.setValueAtTime(s.env[0][1], T(s.env[0][0]));
      for (const [t, v] of s.env.slice(1)) g.gain.linearRampToValueAtTime(v, T(t));
      const edge = Math.min(D.EDGE, s.dur / 2), a = T(s.at), z = T(s.at + s.dur);
      if (s.edgeIn) { e.gain.setValueAtTime(0, a); e.gain.linearRampToValueAtTime(1, a + edge); }
      if (s.edgeOut) { e.gain.setValueAtTime(1, z - edge); e.gain.linearRampToValueAtTime(0, z); }
      src.connect(g).connect(e).connect(trackNode(s.track).input);
      src.start(a, s.offset, Math.min(s.dur, b.duration - s.offset));
      const item = { src, g, e };
      src.onended = () => { item.done = true; };
      playing.push(item);
      n++;
    }
    return n;
  }
  // メトロノームのカチッという音。マスターを通さず出口へ直接（ミックスダウンには入らない）
  function click(at, accent) {
    const key = accent ? 'a' : 'b';
    if (!clickBufs[key]) { const d = D.clickSamples(ctx.sampleRate, accent); clickBufs[key] = ctx.createBuffer(1, d.length, ctx.sampleRate); clickBufs[key].copyToChannel(d, 0); }
    const src = ctx.createBufferSource(), item = { src }; src.buffer = clickBufs[key]; src.connect(output); src.start(Math.max(ctx.currentTime, at));
    src.onended = () => { item.done = true; };
    playing.push(item);
  }
  function stopAll() {
    for (const p of playing) { try { p.src.stop(); } catch { /* まだ始まっていない・止まっている */ } p.src.disconnect(); p.g?.disconnect(); p.e?.disconnect(); }
    playing = [];
  }
  // 鳴り終わった音を、止める予定の一覧から外す（長く再生しても一覧がふくらまないように）
  function prune() { playing = playing.filter((p) => { if (p.done) { p.src.disconnect(); p.g?.disconnect(); p.e?.disconnect(); } return !p.done; }); }
  const peakOf = (an) => { an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) { const a = Math.abs(v); if (a > m) m = a; } return m; };
  function levels() {
    if (!meters) return null;
    const out = { master: [peakOf(mL), peakOf(mR)], tracks: {} };
    for (const [id, n] of tracks) out.tracks[id] = peakOf(n.an);
    return out;
  }
  function dispose() { stopAll(); for (const n of tracks.values()) n.merge.disconnect(); tracks.clear(); master.disconnect(); }
  return { apply, play, click, stopAll, prune, levels, dispose, master };
}

// ミックスダウン: 再生と同じ組み立てを OfflineAudioContext で作り、[start, end) を 2 チャンネルの音にする。
// onProgress(0〜1) は 1 秒分の計算ごとに呼ぶ（suspend で区切る）
export async function renderMix(project, buffers, range, rate = 44100, onProgress = () => {}) {
  const frames = D.mixFrames(range, rate);
  if (frames <= 0) throw new Error('書き出す音がありません。');
  const oc = new OfflineAudioContext(2, frames, rate);
  const eng = createEngine(oc);
  eng.apply(project);
  eng.play(project, buffers, range.start, range.end, 0);
  const len = frames / rate;
  for (let t = 1; t < len; t += 1) oc.suspend(t).then(() => { onProgress(t / len); oc.resume(); });
  const out = await oc.startRendering();
  onProgress(1);
  return out;
}
