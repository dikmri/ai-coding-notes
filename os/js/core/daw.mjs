// 多重録音スタジオの計算。画面にも音の部品にも触らない純粋な関数だけを置く（テストは tests/os-daw.test.mjs）。
// 時間と拍と小節の変換、クリップの編集（動かす・切り詰め・分ける）、重なり（後に置いたクリップが上で、下は隠れていない所だけ鳴る）、
// スナップ、ある時刻に鳴るクリップ、音量とパンの式、フェードの重みと音量の動きの点、鳴らす予定表（再生とミックスダウンで同じものを使う）、
// メトロノーム、.fdaw の検証、元に戻す、波形の縮め方、録音の切り出し、目盛り、見本の曲の合成。
//
// 時間はすべて秒。拍の長さは 60 / BPM 秒で、拍子の下の数の音符を 1 拍とする（6/8 なら 8 分音符を 1 拍として 6 拍）。
// クリップ: { id, track, src（仮想ドライブの音のパス）, name, start（置いた時刻）, offset（音の中の使い始め）, length, srcLen（音の全体の長さ）,
//            gain（dB）, fadeIn, fadeOut（秒） }

export const FORMAT = 'future-os-daw';
export const VERSION = 1;
export const MIN_LEN = 0.01; // クリップの最短の長さ（秒）
export const MIN_DB = -60; // これ以下は無音
export const EDGE = 0.004; // 上のクリップに隠れて切れる所に付ける、ごく短い音量の傾き（秒）。ぷつっと鳴らないように
const EPS = 1e-9;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const pad2 = (n) => String(n).padStart(2, '0');
const tidy = (v) => Math.round(v * 1e9) / 1e9; // 浮動小数点の端数（0.9000000000000001 など）を落とす

/* ---------- 時間と拍と小節 ---------- */
export const beatSec = (bpm) => 60 / bpm;
export const barSec = (bpm, sig) => beatSec(bpm) * sig[0];
export function secToBBT(sec, bpm, sig) {
  const beats = Math.max(0, sec) / beatSec(bpm) + EPS;
  const whole = Math.floor(beats), frac = beats - whole;
  return { bar: Math.floor(whole / sig[0]) + 1, beat: (whole % sig[0]) + 1, frac: frac < 1e-6 ? 0 : tidy(frac - EPS) };
}
export const bbtToSec = (bar, beat = 1, frac = 0, bpm, sig) => ((bar - 1) * sig[0] + (beat - 1) + frac) * beatSec(bpm);
export function fmtBBT(sec, bpm, sig) {
  const b = secToBBT(sec, bpm, sig);
  return `${b.bar}.${b.beat}.${pad2(Math.min(99, Math.floor(b.frac * 100 + 1e-6)))}`;
}
export function fmtSec(sec) {
  const ms = Math.round(Math.abs(sec) * 1000), m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${sec < 0 && ms ? '-' : ''}${m}:${pad2(s)}.${String(ms % 1000).padStart(3, '0')}`;
}
export const countInSec = (bars, bpm, sig) => (bars > 0 ? bars * barSec(bpm, sig) : 0);

/* ---------- スナップ ---------- */
// division: 'bar'（小節）、拍の数（1、0.5、0.25）、0（スナップなし）
export function gridStep(division, bpm, sig) {
  if (division === 'bar') return barSec(bpm, sig);
  return division > 0 ? beatSec(bpm) * division : 0;
}
export const snapTime = (sec, step) => (step > 0 ? tidy(Math.round(sec / step) * step) : sec);

/* ---------- 段とクリップ ---------- */
export const COLORS = [
  { id: 'mint', name: 'ミント', hex: '#6bf2e3' },
  { id: 'lavender', name: 'ラベンダー', hex: '#cfaeff' },
  { id: 'sunset', name: '夕焼け', hex: '#ff8ec7' },
  { id: 'apricot', name: '杏', hex: '#ffd37a' },
  { id: 'sky', name: '空', hex: '#8fd3ff' },
  { id: 'leaf', name: '若葉', hex: '#a8e88a' },
  { id: 'coral', name: '珊瑚', hex: '#ff9f8a' },
  { id: 'cobalt', name: '瑠璃', hex: '#8a9bff' },
];
export const colorHex = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).hex;
export const newTrack = (id, n, color) => ({ id, name: `段 ${n}`, color, vol: 0, pan: 0, mute: false, solo: false });
export function nextColor(tracks) {
  const used = new Set(tracks.map((t) => t.color));
  return (COLORS.find((c) => !used.has(c.id)) || COLORS[tracks.length % COLORS.length]).id;
}
// 'c12' のような id の、空いている次の番号
export function newId(prefix, items) {
  let n = 0;
  for (const it of items) { const m = new RegExp(`^${prefix}(\\d+)$`).exec(it.id); if (m) n = Math.max(n, +m[1]); }
  return prefix + (n + 1);
}
export function newClip({ id, track, src, name, start = 0, srcLen, offset = 0, length }) {
  return { id, track, src, name: name || '', start, offset, length: length ?? srcLen - offset, srcLen, gain: 0, fadeIn: 0, fadeOut: 0 };
}
export const clipEnd = (c) => c.start + c.length;
// フェードを長さに合わせる（負は 0、頭と終わりの合計が長さを越えたら同じ割合で縮める）
export function fixFades(c) {
  let fi = Math.max(0, num(c.fadeIn, 0)), fo = Math.max(0, num(c.fadeOut, 0));
  if (fi + fo > c.length) { const k = c.length / (fi + fo); fi *= k; fo *= k; }
  return { ...c, fadeIn: fi, fadeOut: fo };
}
export const moveClip = (c, start, track = c.track) => ({ ...c, start: Math.max(0, start), track });
export function trimStart(c, t) {
  const s = clamp(t, Math.max(0, c.start - c.offset), clipEnd(c) - MIN_LEN), d = s - c.start;
  return fixFades({ ...c, start: s, offset: c.offset + d, length: c.length - d });
}
export function trimEnd(c, t) {
  const e = clamp(t, c.start + MIN_LEN, c.start + c.srcLen - c.offset);
  return fixFades({ ...c, length: e - c.start });
}
// t の所で 2 つに分ける。端に近すぎる・外のときは null。フェードは外側にだけ残す
export function splitClip(c, t, newId2) {
  if (t < c.start + MIN_LEN - EPS || t > clipEnd(c) - MIN_LEN + EPS) return null;
  if (t <= c.start + EPS || t >= clipEnd(c) - EPS) return null;
  const left = fixFades({ ...c, length: t - c.start, fadeOut: 0 });
  const right = fixFades({ ...c, id: newId2, start: t, offset: c.offset + (t - c.start), length: clipEnd(c) - t, fadeIn: 0 });
  return [left, right];
}
export const overlapping = (a, b) => a.track === b.track && a.start < clipEnd(b) - EPS && b.start < clipEnd(a) - EPS;

/* ---------- 重なり: 後のクリップ（並びの後ろ）が上。下は隠れていない所だけ鳴る ---------- */
function subtract(parts, a, b) {
  const out = [];
  for (const [x, y] of parts) {
    if (b <= x || a >= y) { out.push([x, y]); continue; }
    if (a > x) out.push([x, a]);
    if (b < y) out.push([b, y]);
  }
  return out.filter(([x, y]) => y - x > EPS);
}
// クリップの id → 鳴る区間 [[始め, 終わり], ...]（段ごとに計算する）
export function audibleParts(clips) {
  const out = new Map(), byTrack = new Map();
  for (const c of clips) { if (!byTrack.has(c.track)) byTrack.set(c.track, []); byTrack.get(c.track).push(c); }
  for (const list of byTrack.values()) {
    for (let i = 0; i < list.length; i++) {
      let parts = [[list[i].start, clipEnd(list[i])]];
      for (let j = i + 1; j < list.length && parts.length; j++) parts = subtract(parts, list[j].start, clipEnd(list[j]));
      out.set(list[i].id, parts);
    }
  }
  return out;
}
// ある時刻に鳴るクリップと、その音の中の位置（秒）
export function clipsAt(project, t) {
  const parts = audibleParts(project.clips), out = [];
  for (const c of project.clips) if ((parts.get(c.id) || []).some(([x, y]) => t >= x - EPS && t < y - EPS)) out.push({ clip: c, pos: c.offset + (t - c.start) });
  return out;
}

/* ---------- 音量とパン ---------- */
export const dbToGain = (db) => (db <= MIN_DB ? 0 : 10 ** (db / 20));
export const gainToDb = (g) => (g <= 0 ? -Infinity : 20 * Math.log10(g));
// パン（-1 左 〜 0 中央 〜 1 右）: 中央は左右とも元の大きさ。寄せた側は元のまま、反対側を等しい力の曲線で小さくする
export function panGains(pan) {
  const th = ((clamp(num(pan, 0), -1, 1) + 1) * Math.PI) / 4;
  return [Math.min(1, Math.SQRT2 * Math.cos(th)), Math.min(1, Math.SQRT2 * Math.sin(th))];
}
// 鳴る段: 消音でなく、単独の段があるときは単独の段だけ（消音は単独より強い）
export function audible(track, tracks) {
  if (track.mute) return false;
  return !tracks.some((t) => t.solo) || !!track.solo;
}
export const trackGain = (track, tracks) => (audible(track, tracks) ? dbToGain(track.vol) : 0);
// 音の大きさの表示: 振れ幅 → -48〜0 dB を 0〜1 に
export function meterFrac(peak) { if (!(peak > 0)) return 0; return clamp((gainToDb(peak) + 48) / 48, 0, 1); }

/* ---------- フェード ---------- */
export function fadeWeight(c, t) {
  const end = clipEnd(c);
  if (t < c.start - EPS || t > end + EPS) return 0;
  let w = 1;
  if (c.fadeIn > 0 && t < c.start + c.fadeIn) w = Math.min(w, (t - c.start) / c.fadeIn);
  if (c.fadeOut > 0 && t > end - c.fadeOut) w = Math.min(w, (end - t) / c.fadeOut);
  return clamp(w, 0, 1);
}
// クリップの音量の動き（クリップの音量×フェード）の点 [[時刻, 倍率], ...]。点の間はまっすぐ変わる
export function clipEnvelope(c) {
  const g = dbToGain(c.gain), end = clipEnd(c), pts = [[c.start, c.fadeIn > 0 ? 0 : g]];
  if (c.fadeIn > 0) pts.push([c.start + c.fadeIn, g]);
  if (c.fadeOut > 0 && end - c.fadeOut > pts[pts.length - 1][0] + EPS) pts.push([end - c.fadeOut, g]);
  pts.push([end, c.fadeOut > 0 ? 0 : g]);
  return pts;
}
export function valueAt(points, t) {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    if (t <= t1) { const [t0, v0] = points[i - 1]; return t1 - t0 < EPS ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
  }
  return points[points.length - 1][1];
}
export function envelopeSlice(points, t0, t1) {
  return [[t0, valueAt(points, t0)], ...points.filter(([t]) => t > t0 + EPS && t < t1 - EPS), [t1, valueAt(points, t1)]];
}

/* ---------- 鳴らす予定表（再生とミックスダウンが同じものを使う） ---------- */
// [from, to) の範囲で鳴る部分ごとに { clipId, src, track, at（鳴り始めの時刻）, offset（音の中の位置）, dur, env（音量の動きの点）, edgeIn, edgeOut }。
// edgeIn / edgeOut は、上のクリップに隠れて切れる端（ごく短い傾きを付ける）。消音と単独は段の音量で扱うので、ここでは全部の段を並べる
export function schedule(project, from, to) {
  const parts = audibleParts(project.clips), out = [];
  for (const c of project.clips) {
    const env = clipEnvelope(c), end = clipEnd(c);
    for (const [x, y] of parts.get(c.id) || []) {
      const a = Math.max(x, from), b = Math.min(y, to);
      if (b - a <= EPS) continue;
      out.push({ clipId: c.id, src: c.src, track: c.track, at: a, offset: c.offset + (a - c.start), dur: b - a, env: envelopeSlice(env, a, b), edgeIn: x > c.start + EPS, edgeOut: y < end - EPS });
    }
  }
  return out;
}

/* ---------- メトロノーム ---------- */
export function clickTimes(from, to, bpm, sig) {
  const beat = beatSec(bpm), out = [];
  for (let k = Math.ceil(from / beat - EPS) || 0; k * beat < to - EPS; k++) out.push({ t: tidy(k * beat), accent: ((k % sig[0]) + sig[0]) % sig[0] === 0 });
  return out;
}
// カチッという短い音（小節の頭は高く強く）。終わりは 0 へ小さくして切る
export function clickSamples(rate, accent) {
  const n = Math.round(rate * 0.035), out = new Float32Array(n), f = accent ? 1760 : 1320, a = accent ? 0.9 : 0.55, att = Math.max(1, Math.round(rate * 0.001));
  for (let i = 0; i < n; i++) out[i] = a * Math.sin((2 * Math.PI * f * i) / rate) * Math.min(1, i / att) * (1 - i / n) ** 3;
  return out;
}

/* ---------- 計画（.fdaw） ---------- */
const SNAPS = ['bar', 1, 0.5, 0.25, 0];
export function emptyProject() {
  return {
    format: FORMAT, version: VERSION, bpm: 110, sig: [4, 4], master: 0, latencyMs: 0, metronome: false, countIn: 1,
    loop: { on: false, start: 0, end: barSec(110, [4, 4]) * 4 }, snap: 1, ruler: 'bars', zoom: 60,
    tracks: [newTrack('t1', 1, COLORS[0].id)], clips: [],
  };
}
const str = (v, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== FORMAT) throw new Error('このファイルは多重録音スタジオの計画（.fdaw）ではありません。');
  if (num(raw.version, 1) > VERSION) throw new Error('このファイルは新しい版の多重録音スタジオで作られたので、開けません。');
  if (!Array.isArray(raw.tracks) || !Array.isArray(raw.clips)) throw new Error('計画の中の段かクリップの並びが読めません。');
  const bpm = clamp(num(raw.bpm, 120), 30, 300);
  const s = Array.isArray(raw.sig) ? raw.sig : [];
  const sig = [clamp(Math.round(num(s[0], 4)), 1, 16), [2, 4, 8, 16].includes(s[1]) ? s[1] : 4];
  const lp = raw.loop && typeof raw.loop === 'object' ? raw.loop : {};
  let ls = Math.max(0, num(lp.start, 0)), le = Math.max(0, num(lp.end, barSec(bpm, sig) * 4));
  if (le < ls) [ls, le] = [le, ls];
  if (le - ls < MIN_LEN) le = ls + barSec(bpm, sig);
  const tracks = [], ids = new Set();
  raw.tracks.slice(0, 32).forEach((t, i) => {
    if (!t || typeof t !== 'object') return;
    let id = str(t.id, 20);
    if (!id || ids.has(id)) { let k = tracks.length + 1; while (ids.has('t' + k)) k++; id = 't' + k; }
    ids.add(id);
    tracks.push({
      id, name: str(t.name, 40) || `段 ${i + 1}`, color: COLORS.some((c) => c.id === t.color) ? t.color : COLORS[i % COLORS.length].id,
      vol: clamp(num(t.vol, 0), MIN_DB, 6), pan: clamp(num(t.pan, 0), -1, 1), mute: !!t.mute, solo: !!t.solo,
    });
  });
  const tids = new Set(tracks.map((t) => t.id)), clips = [], cids = new Set();
  for (const c of raw.clips) {
    if (!c || typeof c !== 'object' || !tids.has(c.track) || typeof c.src !== 'string' || !c.src.startsWith('/')) continue;
    let id = str(c.id, 20);
    if (!id || cids.has(id)) { let k = clips.length + 1; while (cids.has('c' + k)) k++; id = 'c' + k; }
    cids.add(id);
    const srcLen = Math.max(MIN_LEN, num(c.srcLen, num(c.offset, 0) + num(c.length, 0)));
    const offset = clamp(num(c.offset, 0), 0, srcLen - MIN_LEN);
    const length = clamp(num(c.length, srcLen - offset), MIN_LEN, srcLen - offset);
    clips.push(fixFades({
      id, track: c.track, src: c.src, name: str(c.name, 80) || c.src.slice(c.src.lastIndexOf('/') + 1),
      start: Math.max(0, num(c.start, 0)), offset, length, srcLen, gain: clamp(num(c.gain, 0), MIN_DB, 24), fadeIn: num(c.fadeIn, 0), fadeOut: num(c.fadeOut, 0),
    }));
  }
  return {
    format: FORMAT, version: VERSION, bpm, sig, master: clamp(num(raw.master, 0), MIN_DB, 6), latencyMs: clamp(num(raw.latencyMs, 0), -500, 1000),
    metronome: !!raw.metronome, countIn: clamp(Math.round(num(raw.countIn, 1)), 0, 4), loop: { on: !!lp.on, start: ls, end: le },
    snap: SNAPS.includes(raw.snap) ? raw.snap : 1, ruler: raw.ruler === 'time' ? 'time' : 'bars', zoom: clamp(num(raw.zoom, 60), 4, 1000),
    tracks, clips,
  };
}
// ファイルに書く形（実行中だけの印は書かない）
export function serialize(p) {
  return {
    format: FORMAT, version: VERSION, bpm: p.bpm, sig: [...p.sig], master: p.master, latencyMs: p.latencyMs, metronome: !!p.metronome, countIn: p.countIn,
    loop: { on: !!p.loop.on, start: p.loop.start, end: p.loop.end }, snap: p.snap, ruler: p.ruler, zoom: p.zoom,
    tracks: p.tracks.map((t) => ({ id: t.id, name: t.name, color: t.color, vol: t.vol, pan: t.pan, mute: !!t.mute, solo: !!t.solo })),
    clips: p.clips.map((c) => ({ id: c.id, track: c.track, src: c.src, name: c.name, start: c.start, offset: c.offset, length: c.length, srcLen: c.srcLen, gain: c.gain, fadeIn: c.fadeIn, fadeOut: c.fadeOut })),
  };
}
export const projectEnd = (p) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
export const mixRange = (p, useLoop) => (useLoop && p.loop.on ? { start: p.loop.start, end: p.loop.end } : { start: 0, end: projectEnd(p) });
export const mixFrames = (r, rate) => Math.round((r.end - r.start) * rate);

/* ---------- 元に戻す・やり直し（状態を JSON の文字で覚える） ---------- */
export function createHistory(limit = 100) {
  let undo = [], redo = [];
  return {
    push(s) { undo.push(s); if (undo.length > limit) undo.shift(); redo = []; },
    undo(cur) { if (!undo.length) return null; redo.push(cur); return undo.pop(); },
    redo(cur) { if (!redo.length) return null; undo.push(cur); return redo.pop(); },
    canUndo: () => undo.length > 0, canRedo: () => redo.length > 0, size: () => undo.length,
    clear() { undo = []; redo = []; },
  };
}

/* ---------- 波形 ---------- */
// block 標本ごとの最小と最大（チャンネルは全部まとめる）
export function buildPeaks(channels, block) {
  const len = channels[0].length, n = Math.ceil(len / block), min = new Float32Array(n), max = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let lo = Infinity, hi = -Infinity;
    const a = b * block, e = Math.min(len, a + block);
    for (const ch of channels) for (let i = a; i < e; i++) { const v = ch[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    min[b] = lo; max[b] = hi;
  }
  return { block, min, max };
}
// 標本の範囲 [s0, s1) のいちばん外側 [最小, 最大]
export function peakSpan(pk, s0, s1) {
  const b0 = Math.max(0, Math.floor(s0 / pk.block)), b1 = Math.min(pk.min.length, Math.ceil(s1 / pk.block));
  if (b0 >= b1) return [0, 0];
  let lo = Infinity, hi = -Infinity;
  for (let b = b0; b < b1; b++) { if (pk.min[b] < lo) lo = pk.min[b]; if (pk.max[b] > hi) hi = pk.max[b]; }
  return [lo, hi];
}

/* ---------- 録音 ---------- */
// 音の部品から届いた切れ端 [{ frame（最初の標本の番号）, data }] から、[start, end) の標本を取り出す（届いていない所は無音）
export function alignTake(chunks, start, end) {
  const out = new Float32Array(Math.max(0, end - start));
  for (const { frame, data } of chunks) {
    const a = Math.max(start, frame), b = Math.min(end, frame + data.length);
    if (b > a) out.set(data.subarray(a - frame, b - frame), a - start);
  }
  return out;
}
export const latencyFrames = (ms, rate) => { const x = (ms / 1000) * rate; return Math.sign(x) * Math.round(Math.abs(x)); };
export const takeName = (d) => `録音 ${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}.wav`;

/* ---------- 目盛り ---------- */
// [t0, t1] の目盛り [{ t, major, label }]。major（文字つき）は 50px（秒の目盛りは 70px）以上あける
export function rulerTicks(t0, t1, pps, mode, bpm, sig) {
  const out = [];
  if (mode === 'time') {
    const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => s * pps >= 70) || 600;
    const sub = (step / 5) * pps >= 8 ? step / 5 : (step / 2) * pps >= 8 ? step / 2 : 0;
    const label = (t) => { const m = Math.floor(t / 60 + EPS), s = t - m * 60; return step >= 1 ? `${m}:${pad2(Math.round(s))}` : `${m}:${pad2(Math.floor(s + EPS))}.${Math.round((s - Math.floor(s + EPS)) * 10) % 10}`; };
    if (sub) for (let k = Math.max(0, Math.ceil(t0 / sub - EPS)); k * sub <= t1 + EPS; k++) { const t = tidy(k * sub); if (Math.abs(t / step - Math.round(t / step)) > 1e-6) out.push({ t, major: false, label: null }); }
    for (let k = Math.max(0, Math.ceil(t0 / step - EPS)); k * step <= t1 + EPS; k++) { const t = tidy(k * step); out.push({ t, major: true, label: label(t) }); }
  } else {
    const bar = barSec(bpm, sig), beat = beatSec(bpm);
    const step = [1, 2, 4, 8, 16, 32, 64, 128, 256].find((s) => s * bar * pps >= 50) || 256;
    if (step === 1 && beat * pps >= 6) {
      for (let k = Math.max(0, Math.ceil(t0 / beat - EPS)); k * beat <= t1 + EPS; k++) if (k % sig[0]) out.push({ t: tidy(k * beat), major: false, label: null });
    } else if (step > 1 && bar * pps >= 6) {
      for (let k = Math.max(0, Math.ceil(t0 / bar - EPS)); k * bar <= t1 + EPS; k++) if (k % step) out.push({ t: tidy(k * bar), major: false, label: null });
    }
    for (let k = Math.max(0, Math.ceil(t0 / bar / step - EPS)) * step; k * bar <= t1 + EPS; k += step) out.push({ t: tidy(k * bar), major: true, label: String(k + 1) });
  }
  return out.sort((a, b) => a.t - b.t);
}

/* ---------- 見本の曲（自分で合成するオリジナルの 4 小節。ドラム・ベース・和音） ---------- */
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
// 鳴らした音の終わりが長さを越えたら、頭へ回して足す（並べてつなげたときに切れ目が出ないように）
function addWrapped(buf, at, data) { for (let i = 0; i < data.length; i++) buf[(at + i) % buf.length] += data[i]; }
function normalizeTo(buf, peak) { let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] *= peak / m; return buf; }
export function demoStems(rate, bpm = 110) {
  const len = Math.round(barSec(bpm, [4, 4]) * 4 * rate), step = beatSec(bpm) / 4, at = (bar, s) => Math.round((bar * 16 + s) * step * rate);
  const drums = new Float32Array(len), bass = new Float32Array(len), chords = new Float32Array(len), rand = rng(20261119);
  // ドラム: バスドラム（音の高さが下がるサイン波）、スネア（雑音と胴の音）、ハイハット（雑音の差分で高い音だけ）
  const kick = () => { const n = Math.round(rate * 0.32), d = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / rate; ph += (2 * Math.PI * (44 + 80 * Math.exp(-t * 28))) / rate; d[i] = Math.sin(ph) * Math.exp(-t * 11) * Math.min(1, i / 20); } return d; };
  const snare = () => { const n = Math.round(rate * 0.22), d = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / rate; d[i] = (rand() * 2 - 1) * 0.55 * Math.exp(-t * 24) + Math.sin(2 * Math.PI * 186 * t) * 0.45 * Math.exp(-t * 30); } return d; };
  const hat = (open) => { const n = Math.round(rate * (open ? 0.18 : 0.06)), d = new Float32Array(n); let prev = 0; for (let i = 0; i < n; i++) { const x = rand() * 2 - 1; d[i] = (x - prev) * 0.16 * Math.exp((-i / rate) * (open ? 16 : 70)); prev = x; } return d; };
  const K = [0, 7, 10], S = [4, 12], H = [0, 2, 4, 6, 8, 10, 12, 14];
  for (let b = 0; b < 4; b++) {
    for (const s of b === 3 ? [0, 7, 10, 13] : K) addWrapped(drums, at(b, s), kick());
    for (const s of S) addWrapped(drums, at(b, s), snare());
    if (b === 3) addWrapped(drums, at(b, 15), snare().map((v) => v * 0.5));
    for (const s of H) addWrapped(drums, at(b, s), hat(s === 14 && b % 2 === 1));
  }
  // 和音の流れ（1 小節ずつ）。ベースは根音、和音は 4 つの音
  const prog = [{ root: 41, notes: [53, 57, 60, 64] }, { root: 40, notes: [52, 55, 59, 62] }, { root: 38, notes: [53, 57, 60, 62] }, { root: 43, notes: [55, 59, 62, 64] }];
  // ベース: ノコギリ波を、だんだん閉じる低い音を通すフィルターに通す。8 分音符の刻みで、ところどころオクターブ上
  const pattern = [[0, 0], [2, 0], [4, 12], [6, 0], [8, 0], [10, 7], [12, 0], [14, 12]];
  prog.forEach((c, b) => {
    for (const [s, up] of pattern) {
      const n = Math.round(step * 2 * 0.9 * rate), d = new Float32Array(n), f = hz(c.root + up);
      let ph = 0, y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / rate; ph = (ph + f / rate) % 1;
        const cut = 180 + 900 * Math.exp(-t * 18), a = 1 - Math.exp((-2 * Math.PI * cut) / rate);
        y += a * (2 * ph - 1 - y);
        d[i] = y * Math.min(1, i / (rate * 0.004)) * Math.min(1, (n - i) / (rate * 0.012)) * (0.75 + 0.25 * Math.exp(-t * 8));
      }
      addWrapped(bass, at(b, s), d);
    }
  });
  // 和音: サイン波と 2 倍音を少しずらして重ねた柔らかい音。ゆっくり立ち上がり、次の小節へ少し残す
  prog.forEach((c, b) => {
    const n = Math.round((barSec(bpm, [4, 4]) + 0.35) * rate), d = new Float32Array(n);
    for (const note of c.notes) {
      const f = hz(note);
      for (let i = 0; i < n; i++) {
        const t = i / rate, env = Math.min(1, t / 0.18) * Math.min(1, (n - i) / (rate * 0.35));
        d[i] += env * (Math.sin(2 * Math.PI * f * t) + 0.6 * Math.sin(2 * Math.PI * f * 1.003 * t) + 0.18 * Math.sin(2 * Math.PI * 2 * f * t));
      }
    }
    addWrapped(chords, at(b, 0), d);
  });
  return { drums: normalizeTo(drums, 0.7), bass: normalizeTo(bass, 0.7), chords: normalizeTo(chords, 0.7) };
}
// 見本の計画: 3 つの段に、4 小節の音を 2 回ずつ並べる（8 小節）
export function demoProject(paths, bpm = 110) {
  const p = emptyProject(), bar = barSec(bpm, [4, 4]), len = bar * 4;
  p.bpm = bpm; p.loop = { on: false, start: 0, end: len };
  p.tracks = [
    { ...newTrack('t1', 1, 'apricot'), name: 'ドラム', vol: -5 },
    { ...newTrack('t2', 2, 'cobalt'), name: 'ベース', vol: -7 },
    { ...newTrack('t3', 3, 'lavender'), name: '和音', vol: -9, pan: -0.2 },
  ];
  const names = { drums: '見本 ドラム', bass: '見本 ベース', chords: '見本 和音' };
  let k = 0;
  ['drums', 'bass', 'chords'].forEach((key, i) => {
    for (const start of [0, len]) p.clips.push(newClip({ id: 'c' + ++k, track: p.tracks[i].id, src: paths[key], name: names[key], start, srcLen: len }));
  });
  return p;
}
