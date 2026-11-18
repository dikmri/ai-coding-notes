// 一覧のカードの静止画（tools/thumbs.mjs）の計算だけの部分。テストは tests/thumbs.test.mjs。
// 静止画は 1 枚ずつのファイルにせず、何枚かを 1 枚の画像（シート）に並べる。
// 共有ページ（claude.ai の Artifact）は 1 版に置けるファイルが 511 個までなので、項目の数（470 ほど）× 明暗の 2 組では足りないため。
// 項目が増えたり変わったりしても、変わらない絵の位置は動かさない。撮り直すのは変わった項目だけで、書き換えるのはその項目のシートだけ。
import { createHash } from 'node:crypto';

// 1 枚の絵の大きさ（16:10、カードの絵の枠と同じ比）とシートの並び（横 4 × 縦 2）
// 撮るときの iframe の大きさは 600×375。一覧のカードの iframe（カードの 2 倍の大きさを半分に縮める）とほぼ同じ見え方になる
// 絵は 400×250。カードの絵の枠は幅 270〜330px なので、画面の拡大率 125% までは粗くならない。
// 大きくすると、一覧を下まで流したあとに Chrome が展開して残しておく画像のメモリが増える（480×300 で GPU のプロセスが 280MB ほど増えた）
export const LAYOUT = { w: 400, h: 250, cols: 4, rows: 2, perSheet: 8, view: { w: 600, h: 375 } };

// 項目の絵に関わる中身（コードと読み込むデータ）の指紋。見出しや説明が変わっても撮り直さない
export function entryHash(e) {
  const body = JSON.stringify([e.src?.html ?? '', e.src?.css ?? '', e.src?.js ?? '', e.data ?? []]);
  return createHash('sha1').update(body).digest('hex').slice(0, 10);
}

// シートの中の場所の番号 → 左上の位置
export function tileRect(slot, L = LAYOUT) {
  const col = slot % L.cols, row = Math.floor(slot / L.cols);
  return { x: col * L.w, y: row * L.h, w: L.w, h: L.h, col, row };
}

// 置き場所を決める。
// prev: 前の目録（{ at: { id: [シート, 場所, 指紋] } }）か null
// list: 今の項目の並び [{ id, hash, skip }]。skip（許可の要る項目など）は絵を持たない
// opts.force: 全部を撮り直す（位置は保つ）。opts.only: この id だけを撮り直す
// 戻り値: { at: 新しい置き場所, capture: 撮る id の並び, dirty: 書き換えるシートの番号の集まり, sheetCount }
export function planThumbs(prev, list, { force = false, only = null, perSheet = LAYOUT.perSheet } = {}) {
  const old = prev?.at || {};
  const want = new Map(list.filter((x) => !x.skip).map((x) => [x.id, x]));
  const at = {}, capture = [], dirty = new Set(), used = new Set();
  const key = (s, i) => s * perSheet + i;
  // 1. 前からある項目は同じ場所に置く。消えた項目と skip になった項目の場所は空ける
  for (const [id, [s, i, h]] of Object.entries(old)) {
    const now = want.get(id);
    if (!now) { dirty.add(s); continue; }
    at[id] = [s, i, now.hash];
    used.add(key(s, i));
    const redo = force || (only ? only.includes(id) : now.hash !== h);
    if (redo) { capture.push(id); dirty.add(s); }
  }
  // 2. 新しい項目は、並びの順に、いちばん前の空きへ入れる
  let next = 0;
  for (const x of list) {
    if (x.skip || at[x.id]) continue;
    while (used.has(next)) next++;
    const s = Math.floor(next / perSheet), i = next % perSheet;
    at[x.id] = [s, i, x.hash];
    used.add(next);
    capture.push(x.id);
    dirty.add(s);
  }
  const sheetCount = used.size ? Math.floor(Math.max(...used) / perSheet) + 1 : 0;
  // 目録の並びを今の項目の順にそろえる（差分を読みやすくするため）
  const ordered = {};
  for (const x of list) if (at[x.id]) ordered[x.id] = at[x.id];
  // 撮る順も今の項目の並びにそろえる
  const order = new Map(list.map((x, n) => [x.id, n]));
  capture.sort((a, b) => order.get(a) - order.get(b));
  return { at: ordered, capture, dirty, sheetCount };
}

// 目録（js/thumbs.js）は、ページが <script> で読むので JS の 1 文にする
const HEAD = '// 一覧のカードの静止画の目録。node tools/thumbs.mjs が作る。手で直さない\n';
export function formatManifest(m) {
  const at = Object.entries(m.at).map(([id, v]) => `${JSON.stringify(id)}:${JSON.stringify(v)}`).join(',\n');
  const { at: _, ...rest } = m;
  const head = JSON.stringify(rest).slice(0, -1);
  return `${HEAD}window.DEKIRU_THUMBS = ${head},"at":{\n${at}\n}};\n`;
}
export function parseManifest(text) {
  const m = /window\.DEKIRU_THUMBS = (\{[\s\S]*\});\s*$/.exec(text || '');
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
