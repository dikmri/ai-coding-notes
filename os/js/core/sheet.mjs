// 表計算の計算: セルの番地、打った値の読み取り、数式の字句と構文の解析・評価・関数、誤りの値、
// 参照のずらし（コピー・行と列の挿入と削除・切り取りの移動）、依存の関係と循環の検出、オートフィル、並べ替え、
// 数の表示の書式、CSV（RFC 4180）の読み書き、保存の形（.fsheet の JSON）の検証。
// 画面には触らない純粋な計算だけを置く（テストは tests/os-sheet.test.mjs）。
// 数式は eval や new Function を使わず、ここの字句解析と構文解析（再帰下降）で読み、木をたどって計算する。
//
// 決まり（LibreOffice Calc と同じにしたもの）
// ・^ は左から計算する（2^3^2 = 64）。符号の - は ^ より先（-2^2 = 4）。
// ・日付は 1899-12-30 から数えた日数、時刻は 1 日を 1 とした小数。
// ・空のセルは、計算では 0、文字をつなぐときは空の文字。範囲の中の文字と空は SUM などで数えない。
// ・1 つの数をオートフィルで伸ばすと 1 ずつ増える。

export const FORMAT = 'future-os-sheet';
export const DEF_ROWS = 1000, DEF_COLS = 52, DEF_W = 88, DEF_H = 24;
const MAX_ROWS = 100000, MAX_COLS = 702, KEYW = 1024; // セルの鍵は 行 * KEYW + 列
const key = (r, c) => r * KEYW + c;
const rowOf = (k) => Math.floor(k / KEYW), colOf = (k) => k % KEYW;

/* ---------- 番地 ---------- */
export function colName(c) {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export function colIndex(name) {
  let n = 0;
  for (const ch of String(name).toUpperCase()) {
    const k = ch.charCodeAt(0) - 64;
    if (k < 1 || k > 26) return -1;
    n = n * 26 + k;
  }
  return n - 1;
}
export const addr = (r, c) => colName(c) + (r + 1);
const ADDR_RE = /^\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6})$/;
export function parseAddr(s) {
  const m = ADDR_RE.exec(String(s ?? '').trim());
  return m ? { r: +m[2] - 1, c: colIndex(m[1]) } : null;
}
export const normRect = (x) => ({ r1: Math.min(x.r1, x.r2), c1: Math.min(x.c1, x.c2), r2: Math.max(x.r1, x.r2), c2: Math.max(x.c1, x.c2) });
export function parseRangeText(s) {
  const [a, b, extra] = String(s ?? '').split(':');
  if (extra !== undefined) return null;
  const p = parseAddr(a), q = b === undefined ? p : parseAddr(b);
  return p && q ? normRect({ r1: p.r, c1: p.c, r2: q.r, c2: q.c }) : null;
}
export const rangeText = (x) => (x.r1 === x.r2 && x.c1 === x.c2 ? addr(x.r1, x.c1) : addr(x.r1, x.c1) + ':' + addr(x.r2, x.c2));
const inside = (x, r, c) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2;

/* ---------- 日付 ---------- */
// 暦の日付と通し日数の行き来（整数だけで計算し、時間帯の影響を受けない）
function daysFromCivil(y, m, d) {
  y -= m <= 2;
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}
function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153), d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9);
  return { y: yoe + era * 400 + (m <= 2), m, d };
}
const EPOCH = 25569; // 1970-01-01 の日付の数
export const dateSerial = (y, m, d) => daysFromCivil(y, m, d) + EPOCH;
export function serialParts(v) {
  let day = Math.floor(v), secs = Math.round((v - day) * 86400);
  if (secs >= 86400) { secs -= 86400; day++; }
  const { y, m, d } = civilFromDays(day - EPOCH);
  return { y, m, d, hh: Math.floor(secs / 3600), mm: Math.floor(secs / 60) % 60, ss: secs % 60 };
}
const nowSerial = (n) => dateSerial(n.y, n.m, n.d) + ((n.hh || 0) * 3600 + (n.mm || 0) * 60 + (n.ss || 0)) / 86400;
// 手元の時計の今（画面では Temporal があればそちらを渡す）
export function localNow() {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), hh: t.getHours(), mm: t.getMinutes(), ss: t.getSeconds() };
}
const pad2 = (n) => String(n).padStart(2, '0');
const dateText = (v) => { const p = serialParts(v); return `${p.y}/${pad2(p.m)}/${pad2(p.d)}`; };

/* ---------- 打った値の読み取り ---------- */
const toHalf = (s) => s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');
const NUM_RE = /^([+-])?(\d{1,3}(?:,\d{3})+|\d*)(\.\d*)?(?:[eE]([+-]?\d+))?$/;
const DATE_RE = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
// 返す値: { value, hint? }。value は 数・文字・真偽値・null（空）。hint は表示の書式の候補（日付なら日付の表示）
export function parseLiteral(input) {
  const raw = String(input ?? '');
  if (raw === '') return { value: null };
  if (raw[0] === "'") return { value: raw.slice(1) };
  const s = toHalf(raw).trim();
  let m = DATE_RE.exec(s);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const v = dateSerial(y, mo, d), back = serialParts(v);
      if (back.m === mo && back.d === d) {
        if (m[4] === undefined) return { value: v, hint: { num: 'date' } };
        const hh = +m[4], mm = +m[5], ss = +(m[6] || 0);
        if (hh < 24 && mm < 60 && ss < 60) return { value: v + (hh * 3600 + mm * 60 + ss) / 86400, hint: { num: 'datetime' } };
      }
    }
  }
  const pct = s.endsWith('%'), body = pct ? s.slice(0, -1).trim() : s;
  m = NUM_RE.exec(body);
  if (m && /\d/.test((m[2] || '') + (m[3] || ''))) {
    const sep = m[2].includes(','), dec = m[3] ? m[3].length - 1 : 0;
    let v = Number((m[1] || '') + m[2].replace(/,/g, '') + (m[3] || '') + (m[4] !== undefined ? 'e' + m[4] : ''));
    if (Number.isFinite(v)) {
      if (pct) return { value: v / 100, hint: { num: 'percent', dec } };
      return sep ? { value: v, hint: { num: 'number', sep: true, dec } } : { value: v };
    }
  }
  if (/^(true|false)$/i.test(s)) return { value: /^t/i.test(s) };
  return { value: raw };
}

/* ---------- 誤りの値 ---------- */
export class SheetError {
  constructor(code) { this.code = code; }
  toString() { return this.code; }
}
const CODES = ['#DIV/0!', '#REF!', '#NAME?', '#VALUE!', '#CYCLE!', '#N/A', '#NUM!', '#ERROR!'];
export const ERR = Object.freeze(Object.fromEntries(CODES.map((c) => [c, Object.freeze(new SheetError(c))])));
export const isErr = (v) => v instanceof SheetError;
const EXPLAIN = {
  '#DIV/0!': '0 で割っています。割る数のセルが空や 0 になっていないか確かめてください。',
  '#REF!': '指しているセルがありません。消した行や列、表の外を指しています。',
  '#NAME?': '知らない関数か名前です。関数の名前のつづりと、文字を " で囲んだかを確かめてください。',
  '#VALUE!': '計算できない値です。文字に数を足していないか確かめてください。',
  '#CYCLE!': '式が回り回って自分自身を指しています（循環参照）。どれかの式を直してください。',
  '#N/A': '探している値が見つかりません。',
  '#NUM!': '計算の結果が数として扱えません（大きすぎる、負の数の平方根など）。',
  '#ERROR!': '式の書き方に誤りがあります。',
};
export const explain = (code) => EXPLAIN[code] || '';

/* ---------- 字句の解析 ---------- */
class SyntaxErr extends Error {}
const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d{0,6})(?![A-Za-z0-9_.(])/;
const refOf = (m) => ({ r: +m[4] - 1, c: colIndex(m[2]), ar: !!m[3], ac: !!m[1] });
export const refText = (x) => (x.ac ? '$' : '') + colName(x.c) + (x.ar ? '$' : '') + (x.r + 1);
// 字の並びを、数・文字列・誤り・参照・範囲・関数・名前・記号に分ける。どの字句も前の空白（ws）を持ち、書き戻すと元の式になる
function lex(src) {
  const toks = [];
  let i = 0;
  for (;;) {
    const ws = /^\s*/.exec(src.slice(i))[0];
    i += ws.length;
    if (i >= src.length) return { toks, tail: ws };
    const rest = src.slice(i);
    let m, t;
    if ((m = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(rest))) t = { t: 'num', s: m[0], v: parseFloat(m[0]), n: m[0].length };
    else if (rest[0] === '"') {
      let j = 1, v = '';
      for (;;) {
        if (j >= rest.length) throw new SyntaxErr('文字列を閉じる " がありません');
        if (rest[j] === '"') { if (rest[j + 1] === '"') { v += '"'; j += 2; continue; } j++; break; }
        v += rest[j++];
      }
      t = { t: 'str', s: rest.slice(0, j), v, n: j };
    } else if ((m = /^#(DIV\/0!|REF!|NAME\?|VALUE!|CYCLE!|N\/A|NUM!|ERROR!)/i.exec(rest))) t = { t: 'err', s: m[0].toUpperCase(), v: m[0].toUpperCase(), n: m[0].length };
    else if ((m = REF_RE.exec(rest))) {
      const a = refOf(m), m2 = rest[m[0].length] === ':' ? REF_RE.exec(rest.slice(m[0].length + 1)) : null;
      t = m2 ? { t: 'range', a, b: refOf(m2), n: m[0].length + 1 + m2[0].length } : { t: 'ref', a, n: m[0].length };
    } else if ((m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest))) {
      const up = m[0].toUpperCase(), call = /^\s*\(/.test(rest.slice(m[0].length));
      if (call) t = { t: 'fn', s: up, name: up, n: m[0].length };
      else if (up === 'TRUE' || up === 'FALSE') t = { t: 'bool', s: up, v: up === 'TRUE', n: m[0].length };
      else t = { t: 'name', s: m[0], n: m[0].length };
    } else if ((m = /^(<=|>=|<>|[-+*/^&=<>%(),;])/.exec(rest))) t = { t: 'op', s: m[0], n: m[0].length };
    else throw new SyntaxErr(`「${rest[0]}」は式に使えません`);
    t.ws = ws;
    toks.push(t);
    i += t.n;
  }
}
const tokText = (t) => t.ws + (t.t === 'ref' ? refText(t.a) : t.t === 'range' ? refText(t.a) + ':' + refText(t.b) : t.s);

/* ---------- 構文の解析 ---------- */
const CMP = new Set(['=', '<>', '<', '>', '<=', '>=']);
function parse(toks) {
  let p = 0;
  const isOp = (s) => toks[p] && toks[p].t === 'op' && toks[p].s === s;
  const where = () => (toks[p] ? `「${toks[p].s ?? tokText(toks[p]).trim()}」の位置が正しくありません` : '式が途中で終わっています');
  const bin = (sub, ops) => () => {
    let a = sub();
    while (toks[p] && toks[p].t === 'op' && ops.has(toks[p].s)) { const op = toks[p++].s; a = { t: 'bin', op, a, b: sub() }; }
    return a;
  };
  function primary() {
    const t = toks[p++];
    if (!t) throw new SyntaxErr('式が途中で終わっています');
    switch (t.t) {
      case 'num': case 'str': case 'bool': return { t: t.t, v: t.v };
      case 'err': return { t: 'err', v: t.v };
      case 'ref': return { t: 'ref', ...t.a };
      case 'range': return { t: 'range', r1: Math.min(t.a.r, t.b.r), c1: Math.min(t.a.c, t.b.c), r2: Math.max(t.a.r, t.b.r), c2: Math.max(t.a.c, t.b.c) };
      case 'name': return { t: 'name', name: t.s };
      case 'fn': {
        p++; // (
        const args = [];
        if (!isOp(')')) for (;;) { args.push(expr()); if (isOp(',') || isOp(';')) { p++; continue; } break; }
        if (!isOp(')')) throw new SyntaxErr(`${t.name} の ) が足りません`);
        p++;
        const f = FUNCS[t.name];
        if (f && (args.length < f.min || args.length > f.max)) throw new SyntaxErr(`${t.name} に渡す値の数が合いません（${f.min === f.max ? f.min : f.min + (f.max > 99 ? ' 個以上' : '〜' + f.max)} 個）`);
        return { t: 'fn', name: t.name, args };
      }
      case 'op':
        if (t.s === '(') { const x = expr(); if (!isOp(')')) throw new SyntaxErr(') が足りません'); p++; return x; }
    }
    p--;
    throw new SyntaxErr(where());
  }
  function postfix() { let x = primary(); while (isOp('%')) { p++; x = { t: 'pct', x }; } return x; }
  function unary() { if (isOp('-') || isOp('+')) { const op = toks[p++].s; return { t: 'un', op, x: unary() }; } return postfix(); }
  const power = bin(unary, new Set(['^']));
  const mult = bin(power, new Set(['*', '/']));
  const additive = bin(mult, new Set(['+', '-']));
  const concat = bin(additive, new Set(['&']));
  const expr = bin(concat, CMP);
  const ast = expr();
  if (p < toks.length) throw new SyntaxErr(where());
  return ast;
}
// 式（= で始まる文字）を読み、計算の木と、指しているセル・範囲の一覧を返す。書き方の誤りは error に入れる
export function compile(formula) {
  try {
    const { toks } = lex(String(formula).slice(1));
    const ast = parse(toks), refs = [], ranges = [];
    (function walk(n) {
      if (n.t === 'ref') refs.push({ r: n.r, c: n.c });
      else if (n.t === 'range') ranges.push({ r1: n.r1, c1: n.c1, r2: n.r2, c2: n.c2 });
      else if (n.t === 'fn') n.args.forEach(walk);
      else if (n.t === 'bin') { walk(n.a); walk(n.b); } else if (n.t === 'un' || n.t === 'pct') walk(n.x);
    })(ast);
    return { ast, refs, ranges, error: null };
  } catch (e) {
    if (e instanceof SyntaxErr) return { ast: null, refs: [], ranges: [], error: e.message };
    throw e;
  }
}
// 打った文字を整える。＝ で始まる式は、文字列の外の全角の英数字を半角にし、関数の名前と参照を大文字にする
export function normalizeInput(input) {
  let s = String(input ?? '');
  if (s[0] === '＝') s = '=' + s.slice(1);
  if (s[0] !== '=') return s;
  s = s.split('"').map((part, i) => (i % 2 ? part : toHalf(part))).join('"');
  try { const { toks, tail } = lex(s.slice(1)); return '=' + toks.map(tokText).join('') + tail; } catch { return s; }
}

/* ---------- 参照のずらし ---------- */
// 式の中の参照だけを書き換える。fn(ref) は新しい参照か null（#REF! にする）、fr(range) は新しい範囲 {a, b} か null
function rewrite(formula, fn, fr) {
  if (String(formula)[0] !== '=') return formula;
  let lexed;
  try { lexed = lex(formula.slice(1)); } catch { return formula; }
  const out = lexed.toks.map((t) => {
    if (t.t === 'ref') { const a = fn(t.a); return t.ws + (a ? refText(a) : '#REF!'); }
    if (t.t === 'range') { const g = fr(t.a, t.b); return t.ws + (g ? refText(g.a) + ':' + refText(g.b) : '#REF!'); }
    return tokText(t);
  });
  return '=' + out.join('') + lexed.tail;
}
const LIMIT = { rows: DEF_ROWS, cols: DEF_COLS };
const within = (x, lim) => x.r >= 0 && x.c >= 0 && x.r < lim.rows && x.c < lim.cols;
// コピーして貼るとき: 相対の行と列だけ dr, dc 動かす（$ の付いた方は動かさない）
export function shiftFormula(formula, dr, dc, lim = LIMIT) {
  const mv = (x) => { const y = { ...x, r: x.ar ? x.r : x.r + dr, c: x.ac ? x.c : x.c + dc }; return within(y, lim) ? y : null; };
  return rewrite(formula, mv, (a, b) => { const x = mv(a), y = mv(b); return x && y ? { a: x, b: y } : null; });
}
const AX = (axis) => (axis === 'row' ? 'r' : 'c');
// 行（列）を at の位置に n 個入れたとき: at より後ろを指す参照を n ずらす。範囲は端ごとに見るので、間に入れると広がる
export function adjustInsert(formula, axis, at, n, lim = LIMIT) {
  const k = AX(axis);
  const mv = (x) => { const y = x[k] >= at ? { ...x, [k]: x[k] + n } : x; return within(y, lim) ? y : null; };
  return rewrite(formula, mv, (a, b) => { const x = mv(a), y = mv(b); return x && y ? { a: x, b: y } : null; });
}
// 行（列）を at から n 個消したとき: 消えた所を指す参照は #REF!、後ろは詰める。範囲は残った部分に縮め、全部消えたら #REF!
export function adjustDelete(formula, axis, at, n) {
  const k = AX(axis), end = at + n;
  const one = (x) => (x[k] < at ? x : x[k] >= end ? { ...x, [k]: x[k] - n } : null);
  return rewrite(formula, one, (a, b) => {
    const lo = Math.min(a[k], b[k]), hi = Math.max(a[k], b[k]);
    if (lo >= at && hi < end) return null;
    const first = a[k] <= b[k] ? a : b, last = first === a ? b : a;
    const nl = lo < at ? lo : lo >= end ? lo - n : at, nh = hi < at ? hi : hi >= end ? hi - n : at - 1;
    return { a: { ...first, [k]: nl }, b: { ...last, [k]: nh } };
  });
}
// 範囲 src を dr, dc 動かしたとき（切り取って貼る）: src の中を指す参照だけ動かす。範囲は両端が src の中のときだけ動かす
export function adjustMove(formula, src, dr, dc, lim = LIMIT) {
  const mv = (x) => { if (!inside(src, x.r, x.c)) return x; const y = { ...x, r: x.r + dr, c: x.c + dc }; return within(y, lim) ? y : null; };
  return rewrite(formula, mv, (a, b) => {
    if (!inside(src, a.r, a.c) || !inside(src, b.r, b.c)) return { a, b };
    const x = mv(a), y = mv(b);
    return x && y ? { a: x, b: y } : null;
  });
}

/* ---------- 値の変換と比べ方 ---------- */
class RangeVal {
  constructor(n, ctx) { Object.assign(this, { r1: n.r1, c1: n.c1, r2: n.r2, c2: n.c2, ctx }); }
  get h() { return this.r2 - this.r1 + 1; }
  get w() { return this.c2 - this.c1 + 1; }
  at(i, j) { return this.ctx.get(this.r1 + i, this.c1 + j); }
  *values() { for (let r = this.r1; r <= this.r2; r++) for (let c = this.c1; c <= this.c2; c++) yield this.ctx.get(r, c); }
}
const scalar = (v) => (v instanceof RangeVal ? (v.h === 1 && v.w === 1 ? v.at(0, 0) : ERR['#VALUE!']) : v);
// 計算に使う数。空は 0、真偽値は 1 と 0、数として読める文字は数、それ以外は #VALUE!
function num(v) {
  if (typeof v === 'number') return v;
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErr(v)) return v;
  const p = parseLiteral(v).value;
  return typeof p === 'number' ? p : ERR['#VALUE!'];
}
// 15 けたで丸めた数の文字（0.1+0.2 を 0.3 にする）
export const numText = (v) => { const r = Number(v.toPrecision(15)); return Object.is(r, -0) ? '0' : String(r); };
const text = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? numText(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v === null ? '' : v);
function bool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null) return false;
  if (isErr(v)) return v;
  return /^true$/i.test(v) ? true : /^false$/i.test(v) ? false : ERR['#VALUE!'];
}
const COLL = new Intl.Collator('ja');
const rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
// 比べ方: 数 < 文字 < 真偽値。文字は大文字と小文字を区別しない。空は相手に合わせて 0・空の文字・FALSE とみる
export function compareValues(a, b) {
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ta = rank(a), tb = rank(b);
  if (ta !== tb) return ta - tb;
  if (ta === 1) { const x = a.toUpperCase(), y = b.toUpperCase(); return x === y ? 0 : COLL.compare(x, y) || (x < y ? -1 : 1); }
  return a === b ? 0 : a < b ? -1 : 1;
}
const cmpOp = (op, c) => (op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0);
const finite = (x) => (Number.isFinite(x) ? x : ERR['#NUM!']);
function binop(op, a, b) {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (op === '&') return text(a) + text(b);
  if (CMP.has(op)) return cmpOp(op, compareValues(a, b));
  const x = num(a), y = num(b);
  if (isErr(x)) return x;
  if (isErr(y)) return y;
  if (op === '+') return finite(x + y);
  if (op === '-') return finite(x - y);
  if (op === '*') return finite(x * y);
  if (op === '/') return y === 0 ? ERR['#DIV/0!'] : finite(x / y);
  if (x === 0 && y < 0) return ERR['#DIV/0!'];
  return finite(Math.pow(x, y));
}
// 0.5 は 0 から遠い方へ丸める。1.005 を 1.01 にするため、10 進の指数の文字で桁を動かす
export function roundTo(x, d) {
  if (!Number.isFinite(x)) return x;
  const shift = (v, k) => { const [m, e] = String(v).split('e'); return Number(m + 'e' + ((+e || 0) + k)); };
  const r = shift(Math.round(shift(Math.abs(x), d)), -d);
  return x < 0 && r !== 0 ? -r : r;
}

/* ---------- 関数 ---------- */
// 範囲と値を順に読み、数だけを集める。範囲の文字・真偽値・空は飛ばす。直接書いた値は数にする（できなければ #VALUE!）
function numbers(args) {
  const out = [];
  for (const a of args) {
    if (a instanceof RangeVal) { for (const v of a.values()) { if (isErr(v)) return v; if (typeof v === 'number') out.push(v); } }
    else { if (a === null) continue; const x = num(a); if (isErr(x)) return x; out.push(x); }
  }
  return out;
}
const withNums = (fn) => (args) => { const n = numbers(args); return isErr(n) ? n : fn(n); };
function bools(args) {
  const out = [];
  for (const a of args) {
    if (a instanceof RangeVal) { for (const v of a.values()) { if (isErr(v)) return v; if (typeof v === 'boolean' || typeof v === 'number') out.push(bool(v)); } }
    else { const b = bool(a); if (isErr(b)) return b; out.push(b); }
  }
  return out.length ? out : ERR['#VALUE!'];
}
const one1 = (fn) => (args) => { const v = scalar(args[0]); return isErr(v) ? v : fn(v); };
const num1 = (fn) => one1((v) => { const x = num(v); return isErr(x) ? x : fn(x); });
const txt1 = (fn) => one1((v) => fn(text(v)));
// SUMIF・COUNTIF の条件。">=10" や "<>りんご"、* と ? の当てはめ（~ で記号そのもの）、空の条件は空のセル
function wildcard(s) {
  let re = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '~' && i + 1 < s.length) re += s[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else re += ch === '*' ? '[\\s\\S]*' : ch === '?' ? '[\\s\\S]' : ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'iu');
}
export function makeCriteria(c) {
  if (isErr(c)) return c;
  const asNum = (v) => (typeof v === 'number' ? v : typeof v === 'string' && typeof parseLiteral(v).value === 'number' ? parseLiteral(v).value : null);
  if (typeof c === 'number') return (v) => asNum(v) === c;
  if (typeof c === 'boolean') return (v) => v === c;
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(c === null ? '' : String(c));
  const op = m[1] || '=', rhs = m[2], lit = parseLiteral(rhs).value;
  if (rhs === '') return op === '<>' ? (v) => v !== null && v !== '' : op === '=' ? (v) => v === null || v === '' : () => false;
  if (typeof lit === 'number') return (v) => { const x = asNum(v); return x === null ? op === '<>' : cmpOp(op, x === lit ? 0 : x < lit ? -1 : 1); };
  if (typeof lit === 'boolean') return (v) => (typeof v === 'boolean' ? cmpOp(op, compareValues(v, lit)) : op === '<>');
  if (op === '=' || op === '<>') { const re = wildcard(rhs); return (v) => (typeof v === 'string' && re.test(v)) === (op === '='); }
  return (v) => typeof v === 'string' && cmpOp(op, compareValues(v, rhs));
}
const VARIADIC = 255;
export const FUNCS = {
  SUM: { min: 1, max: VARIADIC, fn: withNums((n) => n.reduce((s, x) => s + x, 0)), help: '数を足します。例: =SUM(B2:B8)' },
  AVERAGE: { min: 1, max: VARIADIC, fn: withNums((n) => (n.length ? n.reduce((s, x) => s + x, 0) / n.length : ERR['#DIV/0!'])), help: '数の平均を出します。例: =AVERAGE(B2:B8)' },
  MIN: { min: 1, max: VARIADIC, fn: withNums((n) => (n.length ? Math.min(...n) : 0)), help: 'いちばん小さい数を出します。' },
  MAX: { min: 1, max: VARIADIC, fn: withNums((n) => (n.length ? Math.max(...n) : 0)), help: 'いちばん大きい数を出します。' },
  COUNT: {
    min: 1, max: VARIADIC, help: '数の入ったセルを数えます。',
    fn: (args) => { let n = 0; for (const a of args) { if (a instanceof RangeVal) { for (const v of a.values()) if (typeof v === 'number') n++; } else if (a !== null && !isErr(a) && !isErr(num(a))) n++; } return n; },
  },
  COUNTA: {
    min: 1, max: VARIADIC, help: '空でないセルを数えます。',
    fn: (args) => { let n = 0; for (const a of args) { if (a instanceof RangeVal) { for (const v of a.values()) if (v !== null) n++; } else if (a !== null) n++; } return n; },
  },
  ROUND: {
    min: 1, max: 2, help: '指定の桁で四捨五入します。例: =ROUND(B9, 0)',
    fn: (args) => { const x = num(scalar(args[0])), d = args.length > 1 ? num(scalar(args[1])) : 0; return isErr(x) ? x : isErr(d) ? d : roundTo(x, Math.trunc(d)); },
  },
  ABS: { min: 1, max: 1, fn: num1(Math.abs), help: '符号を取った大きさを出します。' },
  IF: {
    min: 2, max: 3, lazy: true, help: '条件で答えを選びます。例: =IF(B2>100, "多い", "少ない")',
    fn: (nodes, ctx, ev) => { const c = bool(scalar(ev(nodes[0], ctx))); if (isErr(c)) return c; return c ? ev(nodes[1], ctx) : nodes.length > 2 ? ev(nodes[2], ctx) : false; },
  },
  AND: { min: 1, max: VARIADIC, fn: (args) => { const b = bools(args); return isErr(b) ? b : b.every(Boolean); }, help: '全部が正しいとき TRUE です。' },
  OR: { min: 1, max: VARIADIC, fn: (args) => { const b = bools(args); return isErr(b) ? b : b.some(Boolean); }, help: 'どれかが正しいとき TRUE です。' },
  NOT: { min: 1, max: 1, fn: one1((v) => { const b = bool(v); return isErr(b) ? b : !b; }), help: 'TRUE と FALSE を入れ替えます。' },
  CONCAT: {
    min: 1, max: VARIADIC, help: '文字をつなぎます。例: =CONCAT(A2, "さん")',
    fn: (args) => { let s = ''; for (const a of args) { if (a instanceof RangeVal) { for (const v of a.values()) { if (isErr(v)) return v; s += text(v); } } else { if (isErr(a)) return a; s += text(a); } } return s; },
  },
  LEN: { min: 1, max: 1, fn: txt1((s) => [...s].length), help: '文字の数を数えます。' },
  UPPER: { min: 1, max: 1, fn: txt1((s) => s.toUpperCase()), help: '英字を大文字にします。' },
  LOWER: { min: 1, max: 1, fn: txt1((s) => s.toLowerCase()), help: '英字を小文字にします。' },
  TODAY: { min: 0, max: 0, fn: (args, ctx) => dateSerial(ctx.now().y, ctx.now().m, ctx.now().d), help: '今日の日付です。' },
  NOW: { min: 0, max: 0, fn: (args, ctx) => nowSerial(ctx.now()), help: '今の日付と時刻です。' },
  VLOOKUP: {
    min: 3, max: 4, help: '表の左の列で値を探し、同じ行の値を出します。例: =VLOOKUP("りんご", A2:C9, 3, FALSE)',
    fn: (args) => {
      const k = scalar(args[0]), rv = args[1];
      if (isErr(k)) return k;
      if (!(rv instanceof RangeVal)) return ERR['#VALUE!'];
      const ci = num(scalar(args[2]));
      if (isErr(ci)) return ci;
      const col = Math.trunc(ci);
      if (col < 1) return ERR['#VALUE!'];
      if (col > rv.w) return ERR['#REF!'];
      const approx = args.length > 3 ? bool(scalar(args[3])) : true;
      if (isErr(approx)) return approx;
      if (k === null) return ERR['#N/A'];
      let hit = -1;
      for (let i = 0; i < rv.h; i++) {
        const v = rv.at(i, 0);
        if (v === null || isErr(v) || rank(v) !== rank(k)) continue;
        const c = compareValues(v, k);
        if (!approx) { if (c === 0) { hit = i; break; } } else if (c <= 0) hit = i; else break;
      }
      if (hit < 0) return ERR['#N/A'];
      const out = rv.at(hit, col - 1);
      return out === null ? 0 : out;
    },
  },
  SUMIF: {
    min: 2, max: 3, help: '条件に合う行の数を足します。例: =SUMIF(A2:A9, "食べ物", C2:C9)',
    fn: (args, ctx) => {
      const rv = args[0], sr = args.length > 2 ? args[2] : args[0];
      if (!(rv instanceof RangeVal) || !(sr instanceof RangeVal)) return ERR['#VALUE!'];
      const ok = makeCriteria(scalar(args[1]));
      if (isErr(ok)) return ok;
      let s = 0;
      for (let i = 0; i < rv.h; i++) for (let j = 0; j < rv.w; j++) {
        if (!ok(rv.at(i, j))) continue;
        const x = ctx.get(sr.r1 + i, sr.c1 + j);
        if (isErr(x)) return x;
        if (typeof x === 'number') s += x;
      }
      return s;
    },
  },
  COUNTIF: {
    min: 2, max: 2, help: '条件に合うセルを数えます。例: =COUNTIF(C2:C9, ">=500")',
    fn: (args) => {
      const rv = args[0];
      if (!(rv instanceof RangeVal)) return ERR['#VALUE!'];
      const ok = makeCriteria(scalar(args[1]));
      if (isErr(ok)) return ok;
      let n = 0;
      for (const v of rv.values()) if (ok(v)) n++;
      return n;
    },
  },
};
FUNCS.CONCATENATE = { ...FUNCS.CONCAT, help: 'CONCAT と同じです。' };

/* ---------- 評価 ---------- */
function evalNode(n, ctx) {
  switch (n.t) {
    case 'num': case 'str': case 'bool': return n.v;
    case 'err': return ERR[n.v];
    case 'name': return ERR['#NAME?'];
    case 'ref': return ctx.get(n.r, n.c);
    case 'range': return new RangeVal(n, ctx);
    case 'pct': { const x = num(scalar(evalNode(n.x, ctx))); return isErr(x) ? x : x / 100; }
    case 'un': { const x = num(scalar(evalNode(n.x, ctx))); return isErr(x) ? x : n.op === '-' ? -x : x; }
    case 'bin': return binop(n.op, scalar(evalNode(n.a, ctx)), scalar(evalNode(n.b, ctx)));
    case 'fn': {
      const f = FUNCS[n.name];
      if (!f) return ERR['#NAME?'];
      if (f.lazy) return f.fn(n.args, ctx, evalNode);
      // 関数に渡すセル 1 つの参照は 1×1 の範囲として渡す（SUM(A1) で A1 の文字を数えないように）
      return f.fn(n.args.map((a) => (a.t === 'ref' ? new RangeVal({ r1: a.r, c1: a.c, r2: a.r, c2: a.c }, ctx) : evalNode(a, ctx))), ctx);
    }
  }
  return ERR['#VALUE!'];
}
function topValue(v) {
  v = scalar(v);
  if (v === null) return 0;
  if (typeof v === 'number') return finite(v);
  return v;
}

/* ---------- 表示の書式 ---------- */
// 指数の書き方（1.5E-08）。d は小数点の下の桁の数（後ろの 0 は省く）
export function expText(v, d = 5) {
  const [m, e] = v.toExponential(d).split('e');
  return (m.includes('.') ? m.replace(/\.?0+$/, '') : m) + 'E' + (e[0] === '-' ? '-' : '+') + e.replace(/^[+-]/, '').padStart(2, '0');
}
// 標準の表示: sig けたまで（既定は 10。狭い列では画面の側で減らす）。とても大きい数と小さい数は指数で書く
export function generalText(v, sig = 10) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e11 || a < 1e-6) return expText(v, 5);
  return String(Number(v.toPrecision(sig)));
}
const group = (s) => s.replace(/^(\d+)/, (d) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
export function fixedText(v, dec = 0, sep = false) {
  const r = roundTo(v, dec);
  let s = Math.abs(r).toFixed(dec);
  if (sep) s = group(s);
  return (r < 0 && /[1-9]/.test(s) ? '-' : '') + s;
}
export const NUM_KINDS = ['general', 'number', 'percent', 'date', 'md', 'datejp', 'datetime'];
export function formatValue(v, fmt) {
  if (v === null || v === undefined) return '';
  if (isErr(v)) return v.code;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  const kind = fmt?.num || 'general', dec = fmt?.dec ?? (kind === 'number' && !fmt?.sep ? 2 : 0);
  if (kind === 'number') return fixedText(v, dec, !!fmt.sep);
  if (kind === 'percent') return fixedText(v * 100, dec, false) + '%';
  if (kind !== 'general' && v >= 0 && v < 2958466) {
    const p = serialParts(v);
    if (kind === 'date') return `${p.y}/${pad2(p.m)}/${pad2(p.d)}`;
    if (kind === 'md') return `${p.m}/${p.d}`;
    if (kind === 'datejp') return `${p.y}年${p.m}月${p.d}日`;
    if (kind === 'datetime') return `${p.y}/${pad2(p.m)}/${pad2(p.d)} ${pad2(p.hh)}:${pad2(p.mm)}`;
  }
  return Object.is(v, -0) ? '0' : generalText(v);
}
export const alignOf = (v, fmt) => fmt?.align || (typeof v === 'number' ? 'right' : typeof v === 'boolean' || isErr(v) ? 'center' : 'left');
// 打った値と式から、付けるとよい表示の書式（日付を打ったら日付の表示、=TODAY() も日付）
export function formatHint(input) {
  const s = String(input ?? '');
  if (s[0] === '=') return /^=\s*TODAY\s*\(\s*\)\s*$/i.test(s) ? { num: 'date' } : /^=\s*NOW\s*\(\s*\)\s*$/i.test(s) ? { num: 'datetime' } : null;
  return parseLiteral(s).hint || null;
}
const decimalsOf = (v) => { if (typeof v !== 'number' || !Number.isFinite(v)) return 0; const s = numText(v); if (s.includes('e')) return 0; const i = s.indexOf('.'); return i < 0 ? 0 : Math.min(10, s.length - i - 1); };

/* ---------- オートフィル ---------- */
const LISTS = [
  ['日', '月', '火', '水', '木', '金', '土'],
  ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
  ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
  ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
  ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
];
const casedLike = (word, sample) => (sample === sample.toUpperCase() ? word : sample === sample.toLowerCase() ? word.toLowerCase() : word[0] + word.slice(1).toLowerCase());
// 等しい差で並んでいるか。並んでいれば差を、いなければ null
function stepOf(ns, dir, mod = 0) {
  if (ns.length === 1) return dir;
  const d0 = ns[1] - ns[0], st = mod ? ((d0 % mod) + mod) % mod : d0;
  for (let i = 2; i < ns.length; i++) { const d = ns[i] - ns[i - 1]; if (mod ? ((d % mod) + mod) % mod !== st : Math.abs(d - st) > 1e-9 * Math.max(1, Math.abs(st))) return null; }
  return st;
}
// inputs: 伸ばす向きに並べた元のセルの中身。count 個の続きを { input, from }（from は元の何番目か）で返す。
// dir は 1 つだけのとき増やす向き（下と右は 1、上と左は -1）
export function fillSeries(inputs, count, dir = 1) {
  const k = inputs.length, cyc = (i) => ({ input: inputs[i % k] || '', from: i % k });
  const out = (fn) => Array.from({ length: count }, (_, i) => ({ input: fn(i + 1), from: k - 1 }));
  const plain = inputs.every((s) => s && s[0] !== '=');
  if (k && plain) {
    const lits = inputs.map((s) => parseLiteral(s));
    if (lits.every((p) => typeof p.value === 'number')) {
      const ns = lits.map((p) => p.value), st = stepOf(ns, dir);
      if (st !== null) {
        const isDate = /^date/.test(lits[k - 1].hint?.num || '');
        return out((i) => { const v = ns[k - 1] + st * i; return isDate ? dateText(v) : numText(v); });
      }
    } else if (lits.every((p) => typeof p.value === 'string')) {
      const ups = inputs.map((s) => s.toUpperCase());
      for (const list of LISTS) {
        const idx = ups.map((s) => list.indexOf(s));
        if (idx.every((i) => i >= 0)) {
          const st = stepOf(idx, dir, list.length);
          if (st !== null) return out((i) => casedLike(list[(((idx[k - 1] + st * i) % list.length) + list.length) % list.length], inputs[k - 1]));
        }
      }
      const parts = inputs.map((s) => /^([\s\S]*?)(\d+)(\D*)$/.exec(s));
      if (parts.every((m) => m && m[1] === parts[0][1] && m[3] === parts[0][3])) {
        const ns = parts.map((m) => +m[2]), st = stepOf(ns, dir), w = parts[k - 1][2].length;
        if (st !== null) return out((i) => parts[0][1] + String(Math.abs(ns[k - 1] + st * i)).padStart(w, '0') + parts[0][3]);
      }
    }
  }
  return Array.from({ length: count }, (_, i) => cyc(i));
}

/* ---------- CSV（RFC 4180） ---------- */
// 引用符で囲んだ欄の中の , と改行と ""（引用符そのもの）を読む。行の終わりは CRLF・LF・CR のどれでもよい。先頭の BOM は捨てる
export function parseCSV(textIn, delim = ',') {
  let s = String(textIn ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const rows = [];
  let row = [], field = '', q = false, any = false;
  for (let i = 0; i < s.length;) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { q = true; any = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; any = true; i++; continue; }
    if (ch === '\r' || ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; any = false; i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1; continue; }
    field += ch; any = true; i++;
  }
  if (any || row.length) { row.push(field); rows.push(row); }
  return rows;
}
// , と " と改行、前後の空白を含む欄だけを " で囲む。行は CRLF で区切り、最後の行にも CRLF を付ける
export function toCSV(rows, delim = ',') {
  const field = (f) => { const s = String(f ?? ''); return s.includes(delim) || /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return rows.map((r) => r.map(field).join(delim)).join('\r\n') + (rows.length ? '\r\n' : '');
}

/* ---------- 保存の形の検証 ---------- */
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const FMT_RULES = {
  b: (v) => v === true,
  color: (v) => typeof v === 'string' && COLOR_RE.test(v),
  bg: (v) => typeof v === 'string' && COLOR_RE.test(v),
  align: (v) => ['left', 'center', 'right'].includes(v),
  num: (v) => NUM_KINDS.includes(v),
  dec: (v) => Number.isInteger(v) && v >= 0 && v <= 10,
  sep: (v) => v === true,
  bd: (v) => typeof v === 'string' && /^t?r?b?l?$/.test(v) && v !== '',
};
// 書式の中の読めない項目を捨てる。返す値: { fmt（空なら null）, dropped（捨てた数）}
export function cleanFormat(f) {
  if (f === undefined || f === null) return { fmt: null, dropped: 0 };
  if (typeof f !== 'object' || Array.isArray(f)) return { fmt: null, dropped: 1 };
  const fmt = {};
  let dropped = 0;
  for (const [k, v] of Object.entries(f)) { if (FMT_RULES[k]?.(v)) fmt[k] = k === 'color' || k === 'bg' ? v.toLowerCase() : v; else dropped++; }
  return { fmt: Object.keys(fmt).length ? fmt : null, dropped };
}
const SIDES = 'trbl';
const sidesText = (set) => [...SIDES].filter((s) => set.has(s)).join('');

/* ---------- 元に戻す ---------- */
export class History {
  constructor(limit = 100) { this.limit = limit; this.u = []; this.r = []; }
  push(snap) { this.u.push(snap); if (this.u.length > this.limit) this.u.shift(); this.r = []; }
  undo(current) { if (!this.u.length) return null; this.r.push(current); return this.u.pop(); }
  redo(current) { if (!this.r.length) return null; this.u.push(current); return this.r.pop(); }
  clear() { this.u = []; this.r = []; }
  discard() { this.u.pop(); } // 何も変わらなかった操作の写しを捨てる
  get undoCount() { return this.u.length; }
  get redoCount() { return this.r.length; }
}

/* ---------- 表 ---------- */
export class Sheet {
  constructor({ rows = DEF_ROWS, cols = DEF_COLS, now = localNow } = {}) {
    this.rows = rows; this.cols = cols; this.now = now;
    this.cells = new Map(); // 鍵 → { input, fmt }
    this.values = new Map(); // 鍵 → 計算した値（空は持たない）
    this.colW = new Map(); this.rowH = new Map();
    this.formulas = new Map(); // 式のセル → compile() の結果
    this.rev = new Map(); // セル → それを 1 つの参照で指す式のセル
    this.rangeHolders = new Set(); // 範囲を指す式のセル
    this.lastRecalc = 0; // 直前の計算で計算し直した式の数
    this.ctx = { get: (r, c) => (r < 0 || c < 0 || r >= this.rows || c >= this.cols ? ERR['#REF!'] : this.values.get(key(r, c)) ?? null), now: () => this.now() };
  }
  get limits() { return { rows: this.rows, cols: this.cols }; }

  /* 読む */
  cell(r, c) { return this.cells.get(key(r, c)) || null; }
  input(r, c) { return this.cell(r, c)?.input ?? ''; }
  fmt(r, c) { return this.cell(r, c)?.fmt || null; }
  value(r, c) { return this.values.get(key(r, c)) ?? null; }
  display(r, c) { return formatValue(this.value(r, c), this.fmt(r, c)); }
  width(c) { return this.colW.get(c) ?? DEF_W; }
  height(r) { return this.rowH.get(r) ?? DEF_H; }
  setWidth(c, w) { if (w === DEF_W || w == null) this.colW.delete(c); else this.colW.set(c, Math.round(w)); }
  setHeight(r, h) { if (h === DEF_H || h == null) this.rowH.delete(r); else this.rowH.set(r, Math.round(h)); }
  // A1 の形で読み書きする近道（テストと見本の表で使う）
  put(a, input) { const p = parseAddr(a); this.set(p.r, p.c, input); return this; }
  val(a) { const p = parseAddr(a); return this.value(p.r, p.c); }
  text(a) { const p = parseAddr(a); return this.display(p.r, p.c); }
  inputAt(a) { const p = parseAddr(a); return this.input(p.r, p.c); }
  fmtAt(a) { const p = parseAddr(a); return this.fmt(p.r, p.c); }
  // 選んだセルの誤りの説明（状態の帯に出す）。誤りでなければ空の文字
  problem(r, c) {
    const comp = this.formulas.get(key(r, c));
    if (comp?.error) return `${EXPLAIN['#ERROR!']}${comp.error}。`;
    const v = this.value(r, c);
    return isErr(v) ? explain(v.code) : '';
  }

  /* 書く（中の仕組み） */
  _unlink(k) {
    const comp = this.formulas.get(k);
    if (!comp) return;
    for (const p of comp.refs) this.rev.get(key(p.r, p.c))?.delete(k);
    this.rangeHolders.delete(k);
    this.formulas.delete(k);
  }
  _link(k, comp) {
    this.formulas.set(k, comp);
    for (const p of comp.refs) { const pk = key(p.r, p.c); if (!this.rev.has(pk)) this.rev.set(pk, new Set()); this.rev.get(pk).add(k); }
    if (comp.ranges.length) this.rangeHolders.add(k);
  }
  _write(r, c, input, fmt) {
    const k = key(r, c);
    this._unlink(k);
    input = input || '';
    if (!input && !fmt) { this.cells.delete(k); this.values.delete(k); return k; }
    this.cells.set(k, { input, fmt: fmt || null });
    if (input[0] === '=') { this._link(k, compile(input)); this.values.delete(k); }
    else { const v = parseLiteral(input).value; if (v === null) this.values.delete(k); else this.values.set(k, v); }
    return k;
  }
  _apply(writes) { this.recalc(writes.map((w) => this._write(w.r, w.c, w.input, w.fmt))); }

  /* 書く */
  // 1 つのセルに打つ。日付や 25% のように形のある値は、表示の書式も付ける（まだ数の書式が無いとき）
  _typed(r, c, input) {
    input = normalizeInput(input);
    let fmt = this.fmt(r, c);
    const h = input ? formatHint(input) : null;
    if (h && !fmt?.num) fmt = { ...(fmt || {}), ...h };
    return { r, c, input, fmt };
  }
  set(r, c, input) { this._apply([this._typed(r, c, input)]); }
  // まとめて打つ（オートSUM など）。計算し直すのは最後に 1 回
  setMany(list) { this._apply(list.map(({ r, c, input }) => this._typed(r, c, input))); }
  // 書式を範囲に足す。値が null か false の項目は外す。とても広い範囲は、使っている所までにする
  _cellsIn(x) {
    const area = (x.r2 - x.r1 + 1) * (x.c2 - x.c1 + 1);
    if (area > 20000) { const u = this.usedRange(); if (!u) return []; x = { r1: x.r1, c1: x.c1, r2: Math.min(x.r2, u.r2), c2: Math.min(x.c2, u.c2) }; }
    const out = [];
    for (let r = x.r1; r <= x.r2; r++) for (let c = x.c1; c <= x.c2; c++) out.push([r, c]);
    return out;
  }
  setFormat(x, patch) {
    this._apply(this._cellsIn(x).map(([r, c]) => {
      const f = { ...(this.fmt(r, c) || {}) };
      for (const [k, v] of Object.entries(patch)) { if (v === null || v === false || v === undefined) delete f[k]; else f[k] = v; }
      return { r, c, input: this.input(r, c), fmt: Object.keys(f).length ? f : null };
    }));
  }
  // 枠線: all は全部のセルの 4 辺、outer は外側の辺だけ、bottom は下の辺、none は外す
  setBorder(x, kind) {
    this._apply(this._cellsIn(x).map(([r, c]) => {
      const f = { ...(this.fmt(r, c) || {}) }, set = new Set(kind === 'none' ? '' : f.bd || '');
      if (kind === 'all') for (const s of SIDES) set.add(s);
      if (kind === 'outer') { if (r === x.r1) set.add('t'); if (r === x.r2) set.add('b'); if (c === x.c1) set.add('l'); if (c === x.c2) set.add('r'); }
      if (kind === 'bottom' && r === x.r2) set.add('b');
      const bd = sidesText(set);
      if (bd) f.bd = bd; else delete f.bd;
      return { r, c, input: this.input(r, c), fmt: Object.keys(f).length ? f : null };
    }));
  }
  // 小数の桁を増やす・減らす。標準の表示なら、今の値の桁から数値の表示に変える
  changeDecimals(x, delta) {
    this._apply(this._cellsIn(x).filter(([r, c]) => typeof this.value(r, c) === 'number').map(([r, c]) => {
      const f = { ...(this.fmt(r, c) || {}) };
      if (!f.num || f.num === 'general') { f.num = 'number'; f.dec = decimalsOf(this.value(r, c)); }
      if (f.num === 'number' || f.num === 'percent') f.dec = Math.max(0, Math.min(10, (f.dec ?? (f.num === 'number' && !f.sep ? 2 : 0)) + delta));
      return { r, c, input: this.input(r, c), fmt: f };
    }));
  }
  // 消す: contents は中身だけ、formats は書式だけ、all は両方
  clear(x, what = 'contents') {
    const writes = [];
    for (const [k, cell] of this.cells) {
      const r = rowOf(k), c = colOf(k);
      if (!inside(x, r, c)) continue;
      writes.push({ r, c, input: what === 'formats' ? cell.input : '', fmt: what === 'contents' ? cell.fmt : null });
    }
    this._apply(writes);
  }

  /* 計算し直す */
  _dependents(k) {
    const out = [...(this.rev.get(k) || [])];
    if (this.rangeHolders.size) {
      const r = rowOf(k), c = colOf(k);
      for (const f of this.rangeHolders) if (this.formulas.get(f).ranges.some((g) => inside(g, r, c))) out.push(f);
    }
    return out;
  }
  _precedents(comp, set) {
    const out = [];
    for (const p of comp.refs) { const k = key(p.r, p.c); if (set.has(k)) out.push(k); }
    for (const g of comp.ranges) {
      if ((g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) <= set.size) { for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const k = key(r, c); if (set.has(k)) out.push(k); } }
      else for (const k of set) if (inside(g, rowOf(k), colOf(k))) out.push(k);
    }
    return out;
  }
  // 変わったセルから、それを（回り回って）指す式だけを集めて計算し直す
  recalc(changed) {
    const affected = new Set(), stack = [];
    for (const k of changed) { if (this.formulas.has(k)) affected.add(k); stack.push(k); }
    while (stack.length) for (const d of this._dependents(stack.pop())) if (!affected.has(d)) { affected.add(d); stack.push(d); }
    this._evaluate(affected);
  }
  recalcAll() { this._evaluate(new Set(this.formulas.keys())); }
  // 式どうしの指し合いを強連結成分（Tarjan の方法、繰り返しで書く）に分ける。
  // 成分は指される側から順に出てくるので、その順に計算する。2 つ以上の成分と、自分を指す式は循環
  _evaluate(set) {
    const index = new Map(), low = new Map(), onStack = new Set(), stack = [], order = [], succ = new Map();
    const next = (v) => { if (!succ.has(v)) succ.set(v, this._precedents(this.formulas.get(v), set)); return succ.get(v); };
    let idx = 0;
    const visit = (v) => { index.set(v, idx); low.set(v, idx); idx++; stack.push(v); onStack.add(v); };
    for (const v0 of set) {
      if (index.has(v0)) continue;
      visit(v0);
      const work = [[v0, 0]];
      while (work.length) {
        const top = work[work.length - 1], [v, i] = top, s = next(v);
        if (i < s.length) {
          top[1]++;
          const w = s[i];
          if (!index.has(w)) { visit(w); work.push([w, 0]); }
          else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
          continue;
        }
        work.pop();
        if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
        if (low.get(v) === index.get(v)) { const comp = []; let w; do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v); order.push(comp); }
      }
    }
    let n = 0;
    for (const comp of order) {
      const cyc = comp.length > 1 || next(comp[0]).includes(comp[0]);
      for (const k of comp) { n++; this.values.set(k, cyc ? ERR['#CYCLE!'] : this._evalOne(k)); }
    }
    this.lastRecalc = n;
  }
  _evalOne(k) {
    const comp = this.formulas.get(k);
    if (!comp.ast) return ERR['#ERROR!'];
    try { return topValue(evalNode(comp.ast, this.ctx)); } catch (e) { if (e instanceof RangeError) return ERR['#VALUE!']; throw e; }
  }
  // 全部を読み直す（行と列の挿入・削除、移動、元に戻すのあと）
  _rebuild() {
    this.formulas.clear(); this.rev.clear(); this.rangeHolders.clear(); this.values.clear();
    for (const [k, cell] of this.cells) {
      if (cell.input[0] === '=') this._link(k, compile(cell.input));
      else { const v = parseLiteral(cell.input).value; if (v !== null) this.values.set(k, v); }
    }
    this.recalcAll();
  }
  _rewriteAll(fn) { for (const cell of this.cells.values()) if (cell.input[0] === '=') cell.input = fn(cell.input); }

  /* 行と列 */
  _insert(axis, at, n) {
    const isRow = axis === 'row', size = isRow ? this.rows : this.cols, pos = isRow ? rowOf : colOf;
    for (const k of this.cells.keys()) if (pos(k) >= size - n) return { ok: false, error: `表の${isRow ? '一番下の行' : '一番右の列'}に中身があるため、${isRow ? '行' : '列'}を入れられません。` };
    this._rewriteAll((f) => adjustInsert(f, axis, at, n, this.limits));
    const moved = new Map();
    for (const [k, cell] of this.cells) { const r = rowOf(k), c = colOf(k); moved.set(isRow ? key(r >= at ? r + n : r, c) : key(r, c >= at ? c + n : c), cell); }
    this.cells = moved;
    const sizes = isRow ? this.rowH : this.colW, ns = new Map();
    for (const [i, v] of sizes) if (i + (i >= at ? n : 0) < size) ns.set(i >= at ? i + n : i, v);
    if (isRow) this.rowH = ns; else this.colW = ns;
    this._rebuild();
    return { ok: true };
  }
  _delete(axis, at, n) {
    const isRow = axis === 'row';
    this._rewriteAll((f) => adjustDelete(f, axis, at, n));
    const moved = new Map();
    for (const [k, cell] of this.cells) {
      const r = rowOf(k), c = colOf(k), p = isRow ? r : c;
      if (p >= at && p < at + n) continue;
      moved.set(isRow ? key(p >= at + n ? r - n : r, c) : key(r, p >= at + n ? c - n : c), cell);
    }
    this.cells = moved;
    const sizes = isRow ? this.rowH : this.colW, ns = new Map();
    for (const [i, v] of sizes) { if (i >= at && i < at + n) continue; ns.set(i >= at + n ? i - n : i, v); }
    if (isRow) this.rowH = ns; else this.colW = ns;
    this._rebuild();
    return { ok: true };
  }
  insertRows(at, n = 1) { return this._insert('row', at, n); }
  insertCols(at, n = 1) { return this._insert('col', at, n); }
  deleteRows(at, n = 1) { return this._delete('row', at, n); }
  deleteCols(at, n = 1) { return this._delete('col', at, n); }

  /* コピー・貼り付け・移動 */
  copy(x) {
    const cells = [];
    for (let r = x.r1; r <= x.r2; r++) for (let c = x.c1; c <= x.c2; c++) { const cell = this.cell(r, c); if (cell) cells.push([r - x.r1, c - x.c1, cell.input, cell.fmt]); }
    return { src: { ...x }, h: x.r2 - x.r1 + 1, w: x.c2 - x.c1 + 1, cells };
  }
  // 貼る先 target の大きさが元の倍数なら敷き詰め、そうでなければ左上から元の大きさで貼る。式の相対参照は動いた分ずらす
  paste(blk, target) {
    const t = normRect(target);
    const th = t.r2 - t.r1 + 1, tw = t.c2 - t.c1 + 1;
    const ny = th % blk.h === 0 ? th / blk.h : 1, nx = tw % blk.w === 0 ? tw / blk.w : 1;
    const area = { r1: t.r1, c1: t.c1, r2: Math.min(this.rows - 1, t.r1 + blk.h * ny - 1), c2: Math.min(this.cols - 1, t.c1 + blk.w * nx - 1) };
    const writes = new Map();
    for (let r = area.r1; r <= area.r2; r++) for (let c = area.c1; c <= area.c2; c++) writes.set(key(r, c), { r, c, input: '', fmt: null });
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) for (const [dr, dc, input, fmt] of blk.cells) {
      const r = t.r1 + iy * blk.h + dr, c = t.c1 + ix * blk.w + dc;
      if (r >= this.rows || c >= this.cols) continue;
      const shifted = input[0] === '=' ? shiftFormula(input, r - (blk.src.r1 + dr), c - (blk.src.c1 + dc), this.limits) : input;
      writes.set(key(r, c), { r, c, input: shifted, fmt });
    }
    this._apply([...writes.values()]);
    return area;
  }
  // 切り取った範囲 src を、左上が (r, c) になる所へ動かす。src の中を指していた式は、表のどこにあっても付いてくる
  move(src, r, c) {
    const dr = r - src.r1, dc = c - src.c1;
    if (!dr && !dc) return { ...src };
    const h = src.r2 - src.r1, w = src.c2 - src.c1;
    if (r + h >= this.rows || c + w >= this.cols || r < 0 || c < 0) return null;
    this._rewriteAll((f) => adjustMove(f, src, dr, dc, this.limits));
    const moving = [];
    for (const [k, cell] of this.cells) if (inside(src, rowOf(k), colOf(k))) moving.push([rowOf(k) + dr, colOf(k) + dc, cell]);
    for (const [k] of [...this.cells]) { const rr = rowOf(k), cc = colOf(k); if (inside(src, rr, cc) || (rr >= r && rr <= r + h && cc >= c && cc <= c + w)) this.cells.delete(k); }
    for (const [rr, cc, cell] of moving) this.cells.set(key(rr, cc), cell);
    this._rebuild();
    return { r1: r, c1: c, r2: r + h, c2: c + w };
  }
  // 選んだ範囲を、見えている表示の文字のタブ区切り（ほかのアプリへ貼る用）にする
  toTSV(x) {
    const lines = [];
    for (let r = x.r1; r <= x.r2; r++) { const row = []; for (let c = x.c1; c <= x.c2; c++) row.push(this.display(r, c).replace(/[\t\r\n]+/g, ' ')); lines.push(row.join('\t')); }
    return lines.join('\r\n');
  }
  // 外から貼った文字（タブ区切り）を (r, c) から入れる。貼った範囲を返す
  pasteText(textIn, r, c) {
    const rows = parseCSV(String(textIn).replace(/(\r\n|\n|\r)$/, ''), '\t');
    const writes = [];
    rows.forEach((row, i) => row.forEach((f, j) => { if (r + i < this.rows && c + j < this.cols) { const input = normalizeInput(f), h = formatHint(input); writes.push({ r: r + i, c: c + j, input, fmt: h ? { ...(this.fmt(r + i, c + j) || {}), ...h } : this.fmt(r + i, c + j) }); } }));
    this._apply(writes);
    return { r1: r, c1: c, r2: r + Math.max(0, rows.length - 1), c2: c + Math.max(0, ...rows.map((x) => x.length - 1)) };
  }

  /* オートフィル: src を target（src を含み、1 つの向きに伸ばした範囲）まで伸ばす */
  fill(src, target) {
    const writes = [];
    const vertical = target.r1 < src.r1 || target.r2 > src.r2;
    const fwd = vertical ? target.r2 > src.r2 : target.c2 > src.c2;
    const count = vertical ? (fwd ? target.r2 - src.r2 : src.r1 - target.r1) : fwd ? target.c2 - src.c2 : src.c1 - target.c1;
    if (count <= 0) return;
    const lines = vertical ? [src.c1, src.c2] : [src.r1, src.r2];
    for (let line = lines[0]; line <= lines[1]; line++) {
      const pos = [];
      if (vertical) for (let r = src.r1; r <= src.r2; r++) pos.push([r, line]); else for (let c = src.c1; c <= src.c2; c++) pos.push([line, c]);
      if (!fwd) pos.reverse();
      const series = fillSeries(pos.map(([r, c]) => this.input(r, c)), count, fwd ? 1 : -1);
      series.forEach((o, i) => {
        const step = (i + 1) * (fwd ? 1 : -1), edge = fwd ? pos[pos.length - 1] : pos[pos.length - 1];
        const r = vertical ? edge[0] + step : edge[0], c = vertical ? edge[1] : edge[1] + step;
        const [fr, fc] = pos[o.from];
        const input = o.input[0] === '=' ? shiftFormula(o.input, r - fr, c - fc, this.limits) : o.input;
        writes.push({ r, c, input, fmt: this.fmt(fr, fc) });
      });
    }
    this._apply(writes);
  }

  /* 並べ替え: 範囲 x の行を、列 keyCol の値で並べる。空は向きによらず最後。式は移った行の分だけずらす */
  sort(x, keyCol, { desc = false, header = false } = {}) {
    const r1 = x.r1 + (header ? 1 : 0);
    if (r1 >= x.r2) return false;
    const rows = [];
    for (let r = r1; r <= x.r2; r++) { const cells = []; for (let c = x.c1; c <= x.c2; c++) cells.push(this.cell(r, c)); rows.push({ r, k: this.value(r, keyCol), cells }); }
    const order = (a, b) => {
      if (a.k === null || b.k === null) return (a.k === null) - (b.k === null);
      if (isErr(a.k) || isErr(b.k)) return isErr(a.k) - isErr(b.k);
      return compareValues(a.k, b.k) * (desc ? -1 : 1);
    };
    rows.sort(order);
    const writes = [];
    rows.forEach((row, i) => row.cells.forEach((cell, j) => {
      const r = r1 + i, c = x.c1 + j, input = cell?.input || '';
      writes.push({ r, c, input: input[0] === '=' ? shiftFormula(input, r - row.r, 0, this.limits) : input, fmt: cell?.fmt || null });
    }));
    this._apply(writes);
    return true;
  }

  /* 集計と探し */
  usedRange() {
    let r2 = -1, c2 = -1;
    for (const [k, cell] of this.cells) if (cell.input) { r2 = Math.max(r2, rowOf(k)); c2 = Math.max(c2, colOf(k)); }
    return r2 < 0 ? null : { r1: 0, c1: 0, r2, c2 };
  }
  stats(x) {
    let sum = 0, nums = 0, count = 0;
    for (const [k, v] of this.values) {
      if (!inside(x, rowOf(k), colOf(k))) continue;
      count++;
      if (typeof v === 'number') { sum += v; nums++; }
    }
    return { sum, nums, count, avg: nums ? sum / nums : null };
  }
  // オートSUM で足す範囲: 上に続く数、無ければ左に続く数
  autoSumRange(r, c) {
    const isNum = (rr, cc) => typeof this.value(rr, cc) === 'number';
    let a = r - 1;
    while (a >= 0 && isNum(a, c)) a--;
    if (a < r - 1) return { r1: a + 1, c1: c, r2: r - 1, c2: c };
    a = c - 1;
    while (a >= 0 && isNum(r, a)) a--;
    if (a < c - 1) return { r1: r, c1: a + 1, r2: r, c2: c - 1 };
    return null;
  }
  // (r, c) を含み、中身のあるセルが（斜めも含めて）続くまとまり。1 つのセルを選んで並べ替えるときに使う
  region(r, c) {
    const filled = (y, x) => y >= 0 && x >= 0 && y < this.rows && x < this.cols && !!this.cells.get(key(y, x))?.input;
    const g = { r1: r, c1: c, r2: r, c2: c };
    const rowHas = (y) => { for (let x = g.c1 - 1; x <= g.c2 + 1; x++) if (filled(y, x)) return true; return false; };
    const colHas = (x) => { for (let y = g.r1 - 1; y <= g.r2 + 1; y++) if (filled(y, x)) return true; return false; };
    for (let grown = true; grown;) {
      grown = false;
      if (g.r1 > 0 && rowHas(g.r1 - 1)) { g.r1--; grown = true; }
      if (g.r2 < this.rows - 1 && rowHas(g.r2 + 1)) { g.r2++; grown = true; }
      if (g.c1 > 0 && colHas(g.c1 - 1)) { g.c1--; grown = true; }
      if (g.c2 < this.cols - 1 && colHas(g.c2 + 1)) { g.c2++; grown = true; }
    }
    return g;
  }
  // 1 行目が文字だけで、2 行目に数などがあれば、1 行目は見出しとみる
  guessHeader(x) {
    if (x.r2 <= x.r1) return false;
    let allText = true, below = false;
    for (let c = x.c1; c <= x.c2; c++) {
      const v = this.value(x.r1, c), w = this.value(x.r1 + 1, c);
      if (v !== null && typeof v !== 'string') allText = false;
      if (w !== null && typeof w !== 'string') below = true;
    }
    return allText && below;
  }
  // Ctrl+矢印の行き先: 中身の続く端、空からは次の中身、何も無ければ表の端
  edge(r, c, dr, dc) {
    const ok = (y, x) => y >= 0 && x >= 0 && y < this.rows && x < this.cols;
    const filled = (y, x) => !!this.cells.get(key(y, x))?.input;
    let y = r + dr, x = c + dc;
    if (!ok(y, x)) return { r, c };
    if (filled(r, c) && filled(y, x)) { while (ok(y + dr, x + dc) && filled(y + dr, x + dc)) { y += dr; x += dc; } return { r: y, c: x }; }
    while (!filled(y, x) && ok(y + dr, x + dc)) { y += dr; x += dc; }
    return { r: y, c: x };
  }

  /* 写し（元に戻す用） */
  snapshot() { return { cells: [...this.cells].map(([k, c]) => [k, c.input, c.fmt]), colW: [...this.colW], rowH: [...this.rowH] }; }
  restore(s) {
    this.cells = new Map(s.cells.map(([k, input, fmt]) => [k, { input, fmt }]));
    this.colW = new Map(s.colW); this.rowH = new Map(s.rowH);
    this._rebuild();
  }

  /* 保存の形 */
  toJSON() {
    const cells = {};
    for (const k of [...this.cells.keys()].sort((a, b) => a - b)) {
      const cell = this.cells.get(k), o = {};
      if (cell.input) o.v = cell.input;
      if (cell.fmt) o.f = { ...cell.fmt };
      cells[addr(rowOf(k), colOf(k))] = o;
    }
    const colW = Object.fromEntries([...this.colW].sort((a, b) => a[0] - b[0]).map(([c, w]) => [colName(c), w]));
    const rowH = Object.fromEntries([...this.rowH].sort((a, b) => a[0] - b[0]).map(([r, h]) => [String(r + 1), h]));
    return { format: FORMAT, version: 1, rows: this.rows, cols: this.cols, colW, rowH, cells };
  }
  // 値は見えている形で書く（日付の表示の数は日付の文字、ほかの数は 15 けた）。式は計算した値になる
  toCSV() {
    const u = this.usedRange();
    if (!u) return '';
    const rows = [];
    for (let r = 0; r <= u.r2; r++) {
      const row = [];
      for (let c = 0; c <= u.c2; c++) {
        const v = this.value(r, c), f = this.fmt(r, c);
        row.push(typeof v === 'number' ? (/^date|^md/.test(f?.num || '') && v >= 0 ? formatValue(v, { num: v % 1 ? 'datetime' : 'date' }) : numText(v)) : formatValue(v, null));
      }
      rows.push(row);
    }
    return toCSV(rows);
  }
  // CSV を読んで新しい表にする。= や ' で始まる欄は式にせず文字のまま入れる
  static fromCSV(textIn, opts = {}) {
    const sh = new Sheet(opts), rows = parseCSV(textIn);
    rows.forEach((row, r) => row.forEach((f, c) => {
      if (r >= sh.rows || c >= sh.cols || f === '') return;
      const input = f[0] === '=' || f[0] === "'" ? "'" + f : f;
      sh._write(r, c, input, formatHint(input));
    }));
    sh.recalcAll();
    return sh;
  }
}

// .fsheet の JSON を確かめて表にする。形が違えば { ok: false, error }、読めない書式と幅は捨てて warnings に数える
export function fromJSON(obj, opts = {}) {
  const fail = (error) => ({ ok: false, error });
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return fail('ファイルの中身が表の形ではありません。');
  if (obj.format !== FORMAT) return fail('表計算のファイルではありません。');
  if (obj.version !== 1) return fail(typeof obj.version === 'number' && obj.version > 1 ? 'このファイルは新しい版の表計算で作られているため、開けません。' : '表計算のファイルの版が読めません。');
  const rows = obj.rows ?? DEF_ROWS, cols = obj.cols ?? DEF_COLS;
  if (!Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS || !Number.isInteger(cols) || cols < 1 || cols > MAX_COLS) return fail('表の行か列の数が大きすぎます。');
  for (const f of ['cells', 'colW', 'rowH']) if (obj[f] !== undefined && (typeof obj[f] !== 'object' || obj[f] === null || Array.isArray(obj[f]))) return fail(`「${f}」の形が違います。`);
  const sh = new Sheet({ ...opts, rows, cols });
  let warnings = 0;
  for (const [a, cell] of Object.entries(obj.cells || {})) {
    const p = /^[A-Z]{1,3}[1-9]\d*$/.test(a) ? parseAddr(a) : null;
    if (!p || p.r >= rows || p.c >= cols) return fail(`セルの番地「${a}」が読めません。`);
    if (!cell || typeof cell !== 'object' || Array.isArray(cell)) return fail(`セル ${a} の形が違います。`);
    const v = cell.v ?? '';
    if (typeof v !== 'string' || v.length > 32767) return fail(`セル ${a} の中身が文字ではありません。`);
    const { fmt, dropped } = cleanFormat(cell.f);
    warnings += dropped;
    sh._write(p.r, p.c, v, fmt);
  }
  for (const [name, w] of Object.entries(obj.colW || {})) { const c = colIndex(name); if (c >= 0 && c < cols && Number.isFinite(w) && w >= 16 && w <= 1000) sh.colW.set(c, Math.round(w)); else warnings++; }
  for (const [name, h] of Object.entries(obj.rowH || {})) { const r = +name - 1; if (Number.isInteger(r) && r >= 0 && r < rows && Number.isFinite(h) && h >= 12 && h <= 400) sh.rowH.set(r, Math.round(h)); else warnings++; }
  sh.recalcAll();
  return { ok: true, sheet: sh, warnings };
}
