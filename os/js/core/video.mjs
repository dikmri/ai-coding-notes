// 動画の編集の計算: 計画（.fvid）の形、タイムライン（ある時刻に何が映り何が鳴るか、重なりとつなぎ目の重み）、
// 分ける・切り詰める・動かす・並べ替える・スナップ、時刻の文字、時間の目盛り、.fvid の検証、元に戻す・やり直し、
// 録った WebM に長さを書き込む処理。画面には触らない純粋な関数だけを置く（テストは tests/os-video.test.mjs）。
//
// 計画の形:
//   { kind: 'future-os-video', version: 1, settings: { size, fps }, media: [素材], tracks: [段], clips: [クリップ] }
//   素材:   { id, path, kind: 'video'|'image'|'audio', name, duration（秒。画像は null）, w?, h? }
//   段:     { id, kind: 'text'|'video'|'audio', name, volume?, mute? }。並びは画面の上から下の順。映像は下の段から上の段へ重ねる
//   クリップ（素材）: { id, track, media, start, dur, in（素材の中の始まりの秒）, volume, fadeIn, fadeOut, join: 'cut'|'cross' }
//   クリップ（文字）: { id, track, start, dur, text, size（出力の高さの %）, color, x, y（0〜1 の割合）, outline, fadeIn, fadeOut, join }
// 時刻はすべて秒。小さな誤差がたまらないよう、変える計算の結果は 100 万分の 1 秒にそろえる。
import { basename, extname } from './path.mjs';

export const KIND = 'future-os-video';
export const VERSION = 1;
export const MIN_DUR = 0.1; // クリップの最小の長さ（秒）
export const IMAGE_DUR = 3; // 画像を置いたときの長さ（秒）
export const TEXT_DUR = 3;
export const SIZES = [
  { id: '720p', w: 1280, h: 720, label: '1280×720（横）' },
  { id: '1080p', w: 1920, h: 1080, label: '1920×1080（横）' },
  { id: 'tall', w: 1080, h: 1920, label: '1080×1920（縦）' },
  { id: 'square', w: 1080, h: 1080, label: '1080×1080（正方形）' },
];
export const FPS = [24, 25, 30, 60];
export const VIDEO_EXTS = ['.webm', '.mp4', '.m4v', '.mov', '.ogv'];
export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
export const AUDIO_EXTS = ['.wav', '.mp3', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.flac', '.weba'];
export const MEDIA_EXTS = [...VIDEO_EXTS, ...IMAGE_EXTS, ...AUDIO_EXTS];

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function mediaKind(path) {
  const e = extname(String(path)).toLowerCase();
  return VIDEO_EXTS.includes(e) ? 'video' : IMAGE_EXTS.includes(e) ? 'image' : AUDIO_EXTS.includes(e) ? 'audio' : null;
}
export const sizeOf = (id) => { const s = SIZES.find((x) => x.id === id) || SIZES[0]; return { w: s.w, h: s.h }; };
// 段の種類が、素材の種類（または 'text'）を受け付けるか。映像は音の段にも置ける（音だけを使う）
export function accepts(trackKind, kind) {
  if (trackKind === 'text') return kind === 'text';
  if (trackKind === 'video') return kind === 'video' || kind === 'image';
  if (trackKind === 'audio') return kind === 'audio' || kind === 'video';
  return false;
}

export const defaultTracks = () => [
  { id: 't1', kind: 'text', name: '文字' },
  { id: 'v2', kind: 'video', name: '映像 2', volume: 1, mute: false },
  { id: 'v1', kind: 'video', name: '映像 1', volume: 1, mute: false },
  { id: 'a1', kind: 'audio', name: '音 1', volume: 1, mute: false },
  { id: 'a2', kind: 'audio', name: '音 2', volume: 1, mute: false },
];
export const newProject = () => ({ kind: KIND, version: VERSION, settings: { size: '720p', fps: 30 }, media: [], tracks: defaultTracks(), clips: [] });
export const clipDefaults = () => ({ in: 0, volume: 1, fadeIn: 0, fadeOut: 0, join: 'cut' });
export const textDefaults = () => ({ text: '文字', size: 8, color: '#ffffff', x: 0.5, y: 0.85, outline: true, fadeIn: 0, fadeOut: 0, join: 'cut' });

export const clipEnd = (c) => r6(c.start + c.dur);
export const trackOf = (p, id) => p.tracks.find((t) => t.id === id) || null;
export const mediaOf = (p, id) => p.media.find((m) => m.id === id) || null;
export const clipOf = (p, id) => p.clips.find((c) => c.id === id) || null;
// クリップの種類: 文字か、素材の種類（video / image / audio）
export const clipKind = (p, c) => (c.media ? mediaOf(p, c.media)?.kind || null : 'text');
export const duration = (p) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
// 種類ごとの主な段: 映像と画像は映像 1（いちばん下の映像の段）、音は音 1、文字は文字の段
export function mainTrack(p, kind) {
  const list = p.tracks.filter((t) => accepts(t.kind, kind) && (kind !== 'video' || t.kind === 'video'));
  if (!list.length) return null;
  return (kind === 'video' || kind === 'image') ? list.at(-1) : list[0];
}
export function nextId(p, prefix = 'c') {
  let n = 0;
  for (const x of [...p.clips, ...p.media]) { const m = new RegExp('^' + prefix + '(\\d+)$').exec(x.id); if (m) n = Math.max(n, +m[1]); }
  return prefix + (n + 1);
}
const copy = (p) => structuredClone(p);
const trackEnd = (p, trackId) => p.clips.filter((c) => c.track === trackId).reduce((m, c) => Math.max(m, clipEnd(c)), 0);

/* ---------- ある時刻に映るもの・鳴るもの ---------- */
// フェードの重み: 始めの fadeIn 秒は黒から、終わりの fadeOut 秒は黒へ
export function fadeGain(c, t) {
  let g = 1;
  if (c.fadeIn > 0) g = Math.min(g, (t - c.start) / c.fadeIn);
  if (c.fadeOut > 0) g = Math.min(g, (clipEnd(c) - t) / c.fadeOut);
  return clamp(g, 0, 1);
}
// 1 つの段で時刻 t にかかるクリップと、その重み。後から始まるクリップが上に出る。
// 重なった所は、上のクリップのつなぎ目が 'cross' ならクロスフェード（上は 0→1、下の音は 1→0）、'cut' なら下を隠して音も止める
function layer(p, track, t) {
  const on = p.clips.filter((c) => c.track === track.id && c.start <= t && t < clipEnd(c)).sort((a, b) => a.start - b.start || p.clips.indexOf(a) - p.clips.indexOf(b));
  const items = on.map((c) => ({ clip: c, track, src: r6((c.in || 0) + (t - c.start)), alpha: 1, gain: 1 }));
  for (let i = 1; i < items.length; i++) {
    const hi = items[i].clip;
    for (let j = 0; j < i; j++) {
      const lo = items[j];
      if (hi.join === 'cross') {
        const ovEnd = Math.min(clipEnd(lo.clip), clipEnd(hi));
        const w = clamp((t - hi.start) / Math.max(1e-6, ovEnd - hi.start), 0, 1);
        items[i].alpha *= w; items[i].gain *= w; lo.gain *= 1 - w;
      } else { lo.alpha = 0; lo.gain = 0; }
    }
  }
  for (const it of items) { const f = fadeGain(it.clip, t); it.alpha *= f; it.gain *= f; }
  return items;
}
// 時刻 t の合成の材料。video: 下の段から上の段へ描く順。text: 文字。audio: 鳴らすもの（gain はクリップの音量まで。段の音量は含めない）
export function activeAt(p, t) {
  const video = [], text = [], audio = [];
  const vTracks = p.tracks.filter((tr) => tr.kind === 'video');
  for (const tr of [...vTracks].reverse()) for (const it of layer(p, tr, t)) video.push(it);
  for (const tr of p.tracks) {
    if (tr.kind === 'text') for (const it of layer(p, tr, t)) text.push({ clip: it.clip, track: tr, alpha: fadeGain(it.clip, t) });
    else for (const it of layer(p, tr, t)) {
      if (clipKind(p, it.clip) === 'image') continue;
      audio.push({ clip: it.clip, track: tr, src: it.src, gain: r6(it.gain * (it.clip.volume ?? 1)) });
    }
  }
  return { video, text, audio };
}
// これから ahead 秒の間に始まる、映像と音のクリップ（先に位置を合わせておくため）
export const upcoming = (p, t, ahead) => p.clips.filter((c) => c.start > t && c.start <= t + ahead && ['video', 'audio'].includes(clipKind(p, c)));

/* ---------- 編集（どれも新しい計画を返し、元の計画は変えない） ---------- */
export function placeMedia(p, mediaId, trackId, start) {
  const m = mediaOf(p, mediaId);
  if (!m) return null;
  const tr = trackId ? trackOf(p, trackId) : mainTrack(p, m.kind);
  if (!tr || !accepts(tr.kind, m.kind)) return null;
  const q = copy(p), id = nextId(p);
  const dur = m.kind === 'image' || !num(m.duration) ? IMAGE_DUR : m.duration;
  q.clips.push({ ...clipDefaults(), id, track: tr.id, media: m.id, start: r6(Math.max(0, start ?? trackEnd(p, tr.id))), dur: r6(Math.max(MIN_DUR, dur)) });
  return { project: q, id };
}
export function addText(p, start, text = '文字') {
  const tr = mainTrack(p, 'text');
  if (!tr) return null;
  const q = copy(p), id = nextId(p);
  q.clips.push({ ...textDefaults(), id, track: tr.id, start: r6(Math.max(0, start)), dur: TEXT_DUR, text });
  return { project: q, id };
}
export function removeClip(p, id) { const q = copy(p); q.clips = q.clips.filter((c) => c.id !== id); return q; }
// 時刻 t で 2 つに分ける。前の半分は元の id、後ろの半分は newId。フェードの始めとつなぎ目は前に、フェードの終わりは後ろに残す
export function splitClip(p, id, t, newId) {
  const c = clipOf(p, id);
  if (!c || t - c.start < MIN_DUR - 1e-9 || clipEnd(c) - t < MIN_DUR - 1e-9) return null;
  const q = copy(p), i = q.clips.findIndex((x) => x.id === id), a = q.clips[i];
  const b = { ...structuredClone(a), id: newId, start: r6(t), dur: r6(clipEnd(c) - t), fadeIn: 0, join: 'cut' };
  if (a.media && clipKind(p, a) !== 'image') b.in = r6((a.in || 0) + (t - a.start));
  a.dur = r6(t - a.start); a.fadeOut = 0;
  q.clips.splice(i + 1, 0, b);
  return q;
}
// 端をつまんで切り詰める・伸ばす。映像と音は素材の始めと終わりの外へ伸ばせない。画像と文字は自由（0 秒より前へは伸ばさない）
export function trimClip(p, id, edge, t) {
  const q = copy(p), c = clipOf(q, id);
  if (!c) return q;
  const kind = clipKind(q, c), m = c.media ? mediaOf(q, c.media) : null;
  const limited = (kind === 'video' || kind === 'audio') && num(m?.duration);
  const end = clipEnd(c);
  if (edge === 'start') {
    const lo = limited ? Math.max(0, c.start - (c.in || 0)) : 0;
    const s = r6(clamp(t, lo, end - MIN_DUR));
    if (limited) c.in = r6((c.in || 0) + (s - c.start));
    c.dur = r6(end - s); c.start = s;
  } else {
    const hi = limited ? c.start + (m.duration - (c.in || 0)) : Infinity;
    c.dur = r6(clamp(t, c.start + MIN_DUR, hi) - c.start);
  }
  return q;
}
// 動かす。trackId を渡すと、受け付ける段ならそこへ移す
export function moveClip(p, id, start, trackId) {
  const q = copy(p), c = clipOf(q, id);
  if (!c) return q;
  c.start = r6(Math.max(0, start));
  if (trackId && trackId !== c.track) { const tr = trackOf(q, trackId); if (tr && accepts(tr.kind, clipKind(q, c))) c.track = tr.id; }
  return q;
}
// 同じ段で隣（dir: -1 前、+1 後ろ）のクリップと順番を入れ替える。2 つの間のすき間（重なり）は保つ
export function reorderClip(p, id, dir) {
  const c = clipOf(p, id);
  if (!c) return null;
  const list = p.clips.filter((x) => x.track === c.track).sort((a, b) => a.start - b.start);
  const k = list.indexOf(c), o = list[k + (dir < 0 ? -1 : 1)];
  if (!o) return null;
  const [first, second] = dir < 0 ? [o, c] : [c, o];
  const s = first.start, gap = second.start - clipEnd(first);
  const q = copy(p);
  clipOf(q, second.id).start = r6(s);
  clipOf(q, first.id).start = r6(Math.max(0, s + second.dur + gap));
  return q;
}
// 前のクリップへ d 秒重ねてクロスフェードにする。同じ段の後ろのクリップもいっしょに詰める
export function crossfadeWithPrev(p, id, d) {
  const c = clipOf(p, id);
  if (!c) return null;
  const prev = p.clips.filter((x) => x.track === c.track && x.id !== c.id && x.start < c.start).sort((a, b) => clipEnd(b) - clipEnd(a) || b.start - a.start)[0];
  if (!prev) return null;
  const len = clamp(d, MIN_DUR, Math.min(prev.dur, c.dur));
  const shift = r6(c.start - (clipEnd(prev) - len));
  const q = copy(p);
  for (const x of q.clips) if (x.track === c.track && x.start >= c.start) x.start = r6(Math.max(0, x.start - shift));
  clipOf(q, id).join = 'cross';
  return q;
}

/* ---------- スナップ ---------- */
// 吸い付く先: 0 秒、ほかのクリップの始めと終わり、再生位置
export function snapTargets(p, { exclude = null, playhead = null } = {}) {
  const s = new Set([0]);
  for (const c of p.clips) if (c.id !== exclude) { s.add(r6(c.start)); s.add(clipEnd(c)); }
  if (num(playhead)) s.add(r6(playhead));
  return [...s].sort((a, b) => a - b);
}
export function snapValue(t, targets, tol) {
  let best = null, bd = tol;
  for (const x of targets) { const d = Math.abs(x - t); if (d <= bd) { bd = d; best = x; } }
  return best === null ? { t, to: null } : { t: best, to: best };
}
// クリップを動かすとき: 始めと終わりのうち、吸い付く先に近い方を合わせる
export function snapMove(start, dur, targets, tol) {
  const a = snapValue(start, targets, tol), b = snapValue(start + dur, targets, tol);
  const da = a.to === null ? Infinity : Math.abs(a.to - start), db = b.to === null ? Infinity : Math.abs(b.to - (start + dur));
  if (da === Infinity && db === Infinity) return { start, to: null };
  return da <= db ? { start: r6(a.to), to: a.to } : { start: r6(b.to - dur), to: b.to };
}

/* ---------- 表示の計算 ---------- */
export function fmtTime(sec) {
  const cs = Math.floor(Math.max(0, sec) * 100 + 1e-6), s = Math.floor(cs / 100), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${h ? h + ':' + p2(m) : m}:${p2(s % 60)}.${p2(cs % 100)}`;
}
// n コマ進める（戻す）。いまの時刻をいちばん近いコマにそろえてから
export const frameStep = (t, fps, n) => Math.max(0, (Math.round(t * fps) + n) / fps);
export const quantize = (t, fps) => Math.round(t * fps) / fps;
const STEPS = [[0.1, 0.02], [0.25, 0.05], [0.5, 0.1], [1, 0.25], [2, 0.5], [5, 1], [10, 2], [15, 5], [30, 10], [60, 15], [120, 30], [300, 60], [600, 120]];
// 時間の目盛り: 大きな目盛りの間が 70 画素以上になる、いちばん細かい間隔
export function rulerStep(pps) {
  const s = STEPS.find(([major]) => major * pps >= 70) || STEPS.at(-1);
  return { major: s[0], minor: s[1] };
}
// 縦横の比を保って dw×dh の中に収める四角
export function fitRect(sw, sh, dw, dh) {
  const k = Math.min(dw / sw, dh / sh), w = sw * k, h = sh * k;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}
// 文字のクリップの置き場所（画素）。大きさは出力の高さの %、x・y は文字のかたまりの中心の割合
export function textBox(c, W, H) {
  const px = Math.round((c.size / 100) * H);
  return { px, x: c.x * W, y: c.y * H, lines: String(c.text).split('\n'), lineH: px * 1.25 };
}
// 音の波形の表示: n 個の区間ごとの、いちばん大きい振れ幅
export function peaks(samples, n) {
  const out = [], k = samples.length / n;
  for (let i = 0; i < n; i++) { let m = 0; for (let j = Math.floor(i * k); j < Math.floor((i + 1) * k); j++) m = Math.max(m, Math.abs(samples[j])); out.push(m); }
  return out;
}
const pad = (n) => String(n).padStart(2, '0');
export const defaultName = (d) => `動画 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.webm`;
// MediaRecorder で録れる WebM の形式（音つき）。使えなければ空の文字
export function pickMime(isSupported) {
  for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) if (isSupported(m)) return m;
  return '';
}

/* ---------- 保存と読み込み ---------- */
export const serialize = (p) => JSON.stringify(p, null, 1);
// .fvid を確かめて、使える形にそろえる。読めないもの（形が違う・新しい版）は ok: false。
// 一部がおかしいときは、その素材やクリップを外して warnings に理由を書く。数は範囲に収める
export function validateProject(j) {
  const errors = [], warnings = [];
  if (!j || typeof j !== 'object' || Array.isArray(j) || j.kind !== KIND) return { ok: false, errors: ['動画の編集の計画ファイルではありません。'], warnings };
  if (!num(j.version) || j.version > VERSION) return { ok: false, errors: ['新しい版の動画の編集で作られた計画なので、開けません。'], warnings };
  const p = newProject();
  const st = j.settings || {};
  if (SIZES.some((s) => s.id === st.size)) p.settings.size = st.size; else warnings.push('出力の大きさが分からないので、1280×720 にしました。');
  if (FPS.includes(st.fps)) p.settings.fps = st.fps; else warnings.push('コマの速さが分からないので、30 コマ/秒にしました。');
  for (const t of Array.isArray(j.tracks) ? j.tracks : []) {
    const mine = p.tracks.find((x) => x.id === t?.id);
    if (!mine) continue;
    if (typeof t.name === 'string' && t.name.trim()) mine.name = t.name.slice(0, 40);
    if ('volume' in mine && num(t.volume)) mine.volume = clamp(t.volume, 0, 2);
    if ('mute' in mine) mine.mute = t.mute === true;
  }
  const ids = new Set();
  for (const m of Array.isArray(j.media) ? j.media : []) {
    const kind = m && ['video', 'image', 'audio'].includes(m.kind) ? m.kind : null;
    if (!m || typeof m.id !== 'string' || ids.has(m.id) || typeof m.path !== 'string' || !m.path.startsWith('/') || !kind) { warnings.push('形の正しくない素材を 1 つ外しました。'); continue; }
    ids.add(m.id);
    const o = { id: m.id, path: m.path, kind, name: typeof m.name === 'string' ? m.name : basename(m.path), duration: kind !== 'image' && num(m.duration) && m.duration > 0 ? m.duration : null };
    if (num(m.w) && num(m.h)) { o.w = m.w; o.h = m.h; }
    p.media.push(o);
  }
  const cids = new Set();
  for (const c of Array.isArray(j.clips) ? j.clips : []) {
    const name = typeof c?.id === 'string' ? c.id : '?';
    const tr = c && trackOf(p, c.track);
    if (!c || typeof c.id !== 'string' || cids.has(c.id)) { warnings.push(`クリップ「${name}」は id が正しくないので外しました。`); continue; }
    if (!tr) { warnings.push(`クリップ「${name}」は知らない段にあるので外しました。`); continue; }
    if (!num(c.start) || !num(c.dur)) { warnings.push(`クリップ「${name}」は時刻が数でないので外しました。`); continue; }
    const base = { id: c.id, track: tr.id };
    const time = { start: r6(Math.max(0, c.start)), dur: r6(Math.max(MIN_DUR, c.dur)) };
    const common = { fadeIn: num(c.fadeIn) ? clamp(c.fadeIn, 0, 60) : 0, fadeOut: num(c.fadeOut) ? clamp(c.fadeOut, 0, 60) : 0, join: c.join === 'cross' ? 'cross' : 'cut' };
    let o;
    if (tr.kind === 'text') {
      const d = textDefaults();
      o = { ...base, ...time, text: typeof c.text === 'string' ? c.text.slice(0, 500) : d.text, size: num(c.size) ? clamp(c.size, 1, 50) : d.size,
        color: typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toLowerCase() : d.color,
        x: num(c.x) ? clamp(c.x, 0, 1) : d.x, y: num(c.y) ? clamp(c.y, 0, 1) : d.y, outline: c.outline !== false, ...common };
    } else {
      const m = mediaOf(p, c.media);
      if (!m) { warnings.push(`クリップ「${name}」の素材が計画に無いので外しました。`); continue; }
      if (!accepts(tr.kind, m.kind)) { warnings.push(`クリップ「${name}」は段の種類に合わないので外しました。`); continue; }
      o = { ...base, media: m.id, ...time, in: num(c.in) ? Math.max(0, c.in) : 0, volume: num(c.volume) ? clamp(c.volume, 0, 2) : 1, ...common };
    }
    cids.add(c.id);
    p.clips.push(o);
  }
  return { ok: true, errors, warnings, project: p };
}
// 仮想ドライブに無い素材と、それを使うクリップの id
export function missing(p, present) {
  const media = p.media.filter((m) => !present.has(m.path)).map((m) => m.id);
  return { media, clips: p.clips.filter((c) => c.media && media.includes(c.media)).map((c) => c.id) };
}

/* ---------- 元に戻す・やり直し ---------- */
// 変える前の状態を push で積む。undo(いまの状態) は 1 つ前を返し、いまの状態をやり直しの側へ移す
export class History {
  constructor(limit = 200) { this.limit = limit; this.u = []; this.r = []; }
  push(s) { this.u.push(s); if (this.u.length > this.limit) this.u.shift(); this.r = []; }
  undo(cur) { if (!this.u.length) return null; this.r.push(cur); return this.u.pop(); }
  redo(cur) { if (!this.r.length) return null; this.u.push(cur); return this.r.pop(); }
  clear() { this.u = []; this.r = []; }
  get undoCount() { return this.u.length; }
  get redoCount() { return this.r.length; }
}

/* ---------- WebM の長さ ----------
   MediaRecorder の WebM には長さ（Segment > Info > Duration）が書かれていないため、video 要素が長さを Infinity と言い、位置を動かせない。
   録り終えたあとで Info の中に Duration（8 バイトの小数、単位は TimecodeScale。ふつうはミリ秒）を書き足す。 */
const ID = { EBML: 0x1a45dfa3, Segment: 0x18538067, Info: 0x1549a966, Duration: 0x4489, TimecodeScale: 0x2ad7b1, SeekHead: 0x114d9b74, Cluster: 0x1f43b675 };
function readId(b, o) {
  const x = b[o]; let len = 0;
  for (let k = 0; k < 4; k++) if (x & (0x80 >> k)) { len = k + 1; break; }
  if (!len || o + len > b.length) return null;
  let v = 0; for (let k = 0; k < len; k++) v = v * 256 + b[o + k];
  return { id: v, len };
}
function readSize(b, o) {
  const x = b[o]; let len = 0;
  for (let k = 0; k < 8; k++) if (x & (0x80 >> k)) { len = k + 1; break; }
  if (!len || o + len > b.length) return null;
  let v = x & (0xff >> len), ones = v === 0xff >> len;
  for (let k = 1; k < len; k++) { v = v * 256 + b[o + k]; if (b[o + k] !== 0xff) ones = false; }
  return { size: ones ? -1 : v, len };
}
// 大きさを len バイトの可変長の整数で書く（入らなければ null）
function sizeBytes(v, len) {
  if (v >= 2 ** (7 * len) - 1) return null;
  const out = new Uint8Array(len); let n = v;
  for (let k = len - 1; k >= 0; k--) { out[k] = n % 256; n = Math.floor(n / 256); }
  out[0] |= 0x80 >> (len - 1);
  return out;
}
// 要素の頭（id と大きさ）を読む
function head(b, o) {
  const i = readId(b, o); if (!i) return null;
  const s = readSize(b, o + i.len); if (!s) return null;
  return { id: i.id, at: o, sizeAt: o + i.len, sizeLen: s.len, size: s.size, data: o + i.len + s.len };
}
// Segment と Info の場所を探す。見つからなければ null
function locate(b) {
  const h = head(b, 0);
  if (!h || h.id !== ID.EBML || h.size < 0) return null;
  const seg = head(b, h.data + h.size);
  if (!seg || seg.id !== ID.Segment) return null;
  const segEnd = seg.size < 0 ? b.length : seg.data + seg.size;
  let seek = false;
  for (let o = seg.data; o < segEnd;) {
    const e = head(b, o);
    if (!e || e.id === ID.Cluster || e.size < 0) return null;
    if (e.id === ID.SeekHead) seek = true;
    if (e.id === ID.Info) {
      let scale = 1e6, dur = null;
      for (let k = e.data; k < e.data + e.size;) {
        const c = head(b, k); if (!c || c.size < 0) break;
        if (c.id === ID.TimecodeScale) { let v = 0; for (let z = 0; z < c.size; z++) v = v * 256 + b[c.data + z]; scale = v || 1e6; }
        if (c.id === ID.Duration) dur = c;
        k = c.data + c.size;
      }
      return { seg, info: e, scale, dur, seek };
    }
    o = e.data + e.size;
  }
  return null;
}
export function readWebmDuration(bytes) {
  const L = locate(bytes);
  if (!L || !L.dur) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset + L.dur.data, L.dur.size);
  const v = L.dur.size === 8 ? dv.getFloat64(0) : L.dur.size === 4 ? dv.getFloat32(0) : null;
  return v === null ? null : (v * L.scale) / 1e6;
}
// 長さ ms（ミリ秒）を書き込んだ新しいバイト列を返す。書けない形（WebM でない、SeekHead がある など）は元のまま返す
export function fixWebmDuration(bytes, ms) {
  const L = locate(bytes);
  if (!L) return bytes;
  const value = (ms * 1e6) / L.scale;
  if (L.dur) {
    const out = bytes.slice();
    const dv = new DataView(out.buffer, out.byteOffset + L.dur.data, L.dur.size);
    if (L.dur.size === 8) dv.setFloat64(0, value); else if (L.dur.size === 4) dv.setFloat32(0, value); else return bytes;
    return out;
  }
  if (L.seek) return bytes; // 位置の表を直さないといけないので、触らない
  const add = new Uint8Array(11); add[0] = 0x44; add[1] = 0x89; add[2] = 0x88; new DataView(add.buffer).setFloat64(3, value);
  const infoSize = sizeBytes(L.info.size + add.length, L.info.sizeLen) || sizeBytes(L.info.size + add.length, 8);
  const delta = add.length + infoSize.length - L.info.sizeLen;
  let segSize = null;
  if (L.seg.size >= 0) { segSize = sizeBytes(L.seg.size + delta, L.seg.sizeLen); if (!segSize) return bytes; }
  const infoEnd = L.info.data + L.info.size;
  const parts = [bytes.subarray(0, L.info.sizeAt), infoSize, bytes.subarray(L.info.data, infoEnd), add, bytes.subarray(infoEnd)];
  const out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0));
  let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
  if (segSize) out.set(segSize, L.seg.sizeAt);
  return out;
}
