// リズムマシンの計算（画面と音を使わない部分）。tests/os-drums.test.mjs で確かめている。
// 状態の形: { bpm, swing, volume, mode, current, song, kit, patterns }
//   bpm: 40〜240 の整数、swing: 0〜75（%）、volume: 0〜100（%）
//   mode: 'pattern'（今のパターンを繰り返す）か 'song'（曲の並びを通す）、current: 編集しているパターンの文字
//   song: パターンの文字の並び（例 ['A', 'A', 'B']）
//   kit: 打楽器 8 つの { vol: 0〜100, tune: -12〜12（半音）, decay: 25〜200（%）, mute, solo }
//   patterns: { A〜H: 8 段 × 16 ステップ }。ステップの値は 0（鳴らさない）、1（ふつう）、2（強く）
// 保存の形（.rhy の JSON）は serialize が作る。段は「.」「x」「X」の 16 文字にして、メモ帳で開いても読めるようにする。

export const FORMAT = 'fos-rhythm';
export const STEPS = 16;
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const INSTRUMENTS = [
  { id: 'kick', name: 'バスドラム', short: 'BD' },
  { id: 'snare', name: 'スネア', short: 'SD' },
  { id: 'clap', name: '手拍子', short: 'CP' },
  { id: 'chh', name: '閉じたハイハット', short: 'CH' },
  { id: 'ohh', name: '開いたハイハット', short: 'OH' },
  { id: 'ltom', name: '低いタム', short: 'LT' },
  { id: 'htom', name: '高いタム', short: 'HT' },
  { id: 'cow', name: 'カウベル', short: 'CB' },
];
export const CLOSED_HAT = 3, OPEN_HAT = 4;
export const LIMITS = { bpm: [40, 240], swing: [0, 75], volume: [0, 100], vol: [0, 100], tune: [-12, 12], decay: [25, 200] };
const DEFAULT_VOL = [85, 80, 70, 60, 55, 75, 75, 50];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// 数でなければ既定値、数なら整数に丸めて範囲に収める
const intIn = (v, [lo, hi], def) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : def);

/* ---------- パターン ---------- */
export const emptyPattern = () => INSTRUMENTS.map(() => Array(STEPS).fill(0));
export const isEmptyPattern = (p) => p.every((row) => row.every((v) => !v));
export const copyPattern = (p) => p.map((row) => [...row]);
// 押したとき: 鳴っていれば消し、消えていればふつうに鳴らす
export const toggleStep = (v) => (v ? 0 : 1);
// 強く打つ印（Shift+クリック・右クリック）: 強く⇔ふつう。消えている所は強くする
export const toggleAccent = (v) => (v === 2 ? 1 : 2);
// ステップの値から音の強さ（0〜1）。ふつうは強くの 7 割
export const stepGain = (v) => (v === 2 ? 1 : v === 1 ? 0.7 : 0);

/* ---------- 時刻 ---------- */
// 1 ステップは 16 分音符（4 分音符を 4 つに分けた長さ）
export const stepDuration = (bpm) => 60 / bpm / 4;
export const patternDuration = (bpm) => STEPS * stepDuration(bpm);
// スイング: 裏のステップ（2 つ目、4 つ目…）を「スイングの割合 × ステップの長さ ÷ 2」だけ遅らせる。
// 約 66.7% で、2 ステップの組の 2/3 の所に来る（3 連符のはね）。75% はそれより少し強い
export function swingOffset(step, bpm, swing) {
  return step % 2 === 1 ? (clamp(+swing || 0, ...LIMITS.swing) / 100) * stepDuration(bpm) / 2 : 0;
}
// パターンの頭から数えた、そのステップを鳴らす時刻（秒）
export const stepTime = (step, bpm, swing) => step * stepDuration(bpm) + swingOffset(step, bpm, swing);
// 再生の先読みで使う次の位置。time はスイングを入れない升目の時刻。テンポを変えると次のステップから効く
export function advance(pos, orderLength, bpm) {
  let { slot, step } = pos;
  step++;
  if (step >= STEPS) { step = 0; slot = (slot + 1) % Math.max(1, orderLength); }
  return { slot, step, time: pos.time + stepDuration(bpm) };
}

/* ---------- 打楽器のつまみ ---------- */
export const defaultKit = () => INSTRUMENTS.map((_, i) => ({ vol: DEFAULT_VOL[i], tune: 0, decay: 100, mute: false, solo: false }));
// 音量（%）を音の大きさにする。2 乗にして、つまみの下の方でも細かく変えられるようにする
export const levelOf = (percent) => (clamp(percent, 0, 100) / 100) ** 2;
// つまみの値から音の作り方: ratio は周波数の倍率（12 半音で 2 倍）、length は減衰の長さの倍率、level は音の大きさ
export function voiceSettings(k) {
  return { ratio: 2 ** (clamp(k.tune, ...LIMITS.tune) / 12), length: clamp(k.decay, ...LIMITS.decay) / 100, level: levelOf(k.vol) };
}
// 鳴らす打楽器: 消音したものは鳴らさない。単独が 1 つでもあれば、単独のものだけを鳴らす
export function audible(kit) {
  const anySolo = kit.some((k) => k.solo);
  return kit.map((k) => !k.mute && (!anySolo || k.solo));
}

/* ---------- 曲の並び ---------- */
// 文字の並びから A〜H を順に拾う。空白以外のほかの文字は ignored で返す（画面で知らせるため）
export function parseOrder(text) {
  const order = [], ignored = [];
  for (const ch of Array.from(String(text ?? ''))) {
    const c = ch.toUpperCase();
    if (LETTERS.includes(c)) order.push(c);
    else if (!/\s/.test(ch)) ignored.push(ch);
  }
  return { order, ignored };
}
// 鳴らすパターンの順。パターンの再生は今のパターンだけ。曲の並びが空なら今のパターン
export const playOrder = (s, mode) => (mode === 'song' && s.song.length ? [...s.song] : [s.current]);

// 書き出す音の一覧（WAV の書き出しで使う）。消音・単独・スイングを再生と同じに扱う
export function renderEvents(s, mode) {
  const order = playOrder(s, mode), d = stepDuration(s.bpm), on = audible(s.kit), events = [];
  order.forEach((name, slot) => {
    const p = s.patterns[name];
    for (let step = 0; step < STEPS; step++) {
      const t = slot * STEPS * d + stepTime(step, s.bpm, s.swing);
      for (let inst = 0; inst < INSTRUMENTS.length; inst++) {
        const v = p[inst][step];
        if (v && on[inst]) events.push({ time: t, inst, gain: stepGain(v), slot, step });
      }
    }
  });
  return { events, length: order.length * STEPS * d };
}

/* ---------- 初めの状態と見本 ---------- */
export function emptyRhythm() {
  return { bpm: 120, swing: 0, volume: 80, mode: 'pattern', current: 'A', song: ['A'], kit: defaultKit(), patterns: Object.fromEntries(LETTERS.map((c) => [c, emptyPattern()])) };
}
// 見本（このアプリのために作ったもの）。段は打楽器の順（バスドラム、スネア、手拍子、閉じたハイハット、開いたハイハット、低いタム、高いタム、カウベル）
const SAMPLES = {
  // A: 8 ビート。最後の裏で開いたハイハットを鳴らし、次の小節の頭の閉じたハイハットで止める
  A: ['X.......x.x.....', '....X.......X...', '................', 'X.x.x.x.X.x.x...', '..............x.', '................', '................', '................'],
  // B: 小節の終わりにタムの短いフィル
  B: ['X......x..x.....', '....X.......X...', '....x.......X...', 'X.x.x.x.X.x.....', '................', '..............xX', '.............x..', '................'],
  // C: 4 つ打ち。裏の開いたハイハットを、次の拍の閉じたハイハットで止める
  C: ['X...X...X...X...', '................', '....X.......X...', 'x...x...x...x...', '..x...x...x...X.', '................', '................', '.......x..x.....'],
};
export function sampleRhythm() {
  const s = emptyRhythm();
  s.bpm = 116;
  for (const [c, rows] of Object.entries(SAMPLES)) s.patterns[c] = rows.map(rowFrom);
  s.song = ['A', 'A', 'A', 'B', 'C', 'C', 'C', 'B'];
  return s;
}

/* ---------- 保存と読み込み ---------- */
const cellOf = (v) => (v === 2 || v === '2' || v === 'X' ? 2 : v === 1 || v === true || v === '1' || v === 'x' ? 1 : 0);
function rowFrom(src) {
  const cells = typeof src === 'string' ? Array.from(src) : Array.isArray(src) ? src : [];
  return Array.from({ length: STEPS }, (_, i) => cellOf(cells[i]));
}
const patternFrom = (src) => (Array.isArray(src) ? INSTRUMENTS.map((_, i) => rowFrom(src[i])) : emptyPattern());

export function serialize(s) {
  return {
    format: FORMAT, version: 1, bpm: s.bpm, swing: s.swing, volume: s.volume, mode: s.mode, current: s.current, song: [...s.song],
    kit: s.kit.map((k) => ({ vol: k.vol, tune: k.tune, decay: k.decay, mute: k.mute, solo: k.solo })),
    patterns: Object.fromEntries(LETTERS.map((c) => [c, s.patterns[c].map((row) => row.map((v) => '.xX'[v] || '.').join(''))])),
  };
}

// 読み込んだ JSON を確かめて状態にする。壊れた値は既定値に直し、範囲の外は収める。
// リズムのデータと読めないもの（オブジェクトでない、別の形式の印がある）は誤りにする
export function normalizeRhythm(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('リズムの並びのデータではありません。');
  if (o.format != null && o.format !== FORMAT) throw new Error(`リズムの並びのデータではありません（形式「${String(o.format).slice(0, 40)}」）。`);
  const d = emptyRhythm(), defKit = defaultKit();
  const cur = typeof o.current === 'string' ? o.current.trim().toUpperCase() : '';
  const current = LETTERS.includes(cur) ? cur : 'A';
  let song = [];
  if (typeof o.song === 'string') song = parseOrder(o.song).order;
  else if (Array.isArray(o.song)) song = o.song.map((c) => (typeof c === 'string' ? c.trim().toUpperCase() : '')).filter((c) => LETTERS.includes(c));
  const kit = defKit.map((def, i) => {
    const k = Array.isArray(o.kit) ? o.kit[i] : null;
    if (!k || typeof k !== 'object') return def;
    return { vol: intIn(k.vol, LIMITS.vol, def.vol), tune: intIn(k.tune, LIMITS.tune, def.tune), decay: intIn(k.decay, LIMITS.decay, def.decay), mute: k.mute === true, solo: k.solo === true };
  });
  const src = o.patterns && typeof o.patterns === 'object' ? o.patterns : {};
  return {
    bpm: intIn(o.bpm, LIMITS.bpm, d.bpm), swing: intIn(o.swing, LIMITS.swing, d.swing), volume: intIn(o.volume, LIMITS.volume, d.volume),
    mode: o.mode === 'song' ? 'song' : 'pattern', current, song: song.length ? song : [current], kit,
    patterns: Object.fromEntries(LETTERS.map((c) => [c, patternFrom(src[c])])),
  };
}

/* ---------- 元に戻す・やり直し ---------- */
// 中身は呼ぶ側が決める（ここでは状態を JSON にした文字を入れる）。push は編集の前の状態、undo と redo には今の状態を渡す
export function createHistory(limit = 100) {
  const back = [], fwd = [];
  return {
    push(snap) { back.push(snap); if (back.length > limit) back.shift(); fwd.length = 0; },
    undo(now) { if (!back.length) return null; fwd.push(now); return back.pop(); },
    redo(now) { if (!fwd.length) return null; back.push(now); return fwd.pop(); },
    get canUndo() { return back.length > 0; },
    get canRedo() { return fwd.length > 0; },
    clear() { back.length = 0; fwd.length = 0; },
  };
}
