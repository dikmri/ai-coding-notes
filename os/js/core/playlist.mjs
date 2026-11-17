// 音楽プレーヤーの再生の一覧: .m3u の読み書き、鳴らせるファイルの見分け、次の曲の決め方（くり返しと順番を混ぜる）、並べ替え。
// 画面には触らない純粋な関数だけを置く（テストは tests/os-playlist.test.mjs）。
import { normalize, extname } from './path.mjs';

export const AUDIO_EXTS = ['.wav', '.mp3', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.flac', '.weba', '.webm', '.sng'];
export const isPlayable = (name) => AUDIO_EXTS.includes(extname(String(name)).toLowerCase());

// .m3u: 1行に1つのパス。# で始まる行は注釈。相対のパスは一覧のあるフォルダから読む
export function parseM3U(text, baseDir = '/') {
  return String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => normalize(l.startsWith('/') ? l : baseDir.replace(/\/$/, '') + '/' + l));
}
export const toM3U = (paths) => '#EXTM3U\n' + paths.map((p) => p + '\n').join('');

// state: { order: 曲の番号を鳴らす順に並べたもの, index: 今の曲の番号, repeat: 'none' | 'one' | 'all' }
// 曲が終わったときの次の曲の番号。止めるときは -1
export function afterEnd({ order, index, repeat = 'none' }) {
  if (!order.length) return -1;
  if (repeat === 'one') return index;
  const p = order.indexOf(index);
  if (p >= 0 && p + 1 < order.length) return order[p + 1];
  return repeat === 'all' ? order[0] : -1;
}
// 前・次のボタン（端では反対の端へ回る）
export function step({ order, index }, dir) {
  if (!order.length) return -1;
  const p = Math.max(0, order.indexOf(index));
  return order[(p + dir + order.length) % order.length];
}
// 順番を混ぜる: 今の曲（current）を先頭に置き、ほかは混ぜて1回ずつ
export function shuffleOrder(n, current, rng = Math.random) {
  const rest = [...Array(n).keys()].filter((i) => i !== current);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return current >= 0 && current < n ? [current, ...rest] : rest;
}
// 並べ替え: i 番目を dir（-1 で上、1 で下）へ1つ動かす
export function moveItem(list, i, dir) {
  const j = i + dir;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return { list: [...list], to: i };
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return { list: out, to: j };
}
