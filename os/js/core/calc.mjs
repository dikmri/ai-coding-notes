// 電卓の計算: 式の評価（四則演算・括弧・符号・パーセント）、表示の整え方、キーを押したときの状態の移り変わり。
// 画面には触らない純粋な関数だけを置く（テストは tests/os-calc.test.mjs）。
// 式は ASCII の + - * / ( ) % と数字・小数点で持ち、画面に出すときだけ ＋ − × ÷ に直す。

/* ---------- 式の評価 ---------- */
function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    const m = /^(\d+(\.\d*)?|\.\d+)/.exec(s.slice(i));
    if (m) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ('+-*/()%'.includes(c)) { out.push({ t: c }); i++; continue; }
    return null;
  }
  return out;
}

class CalcError extends Error { constructor(code) { super(code); this.code = code; } }

// expr := term (('+'|'-') term)*   term := unary (('*'|'/') unary)*   unary := '-' unary | postfix   postfix := primary '%'?
// 返す値は { v, pct }。pct は「その項がパーセントの数1つだけ」のとき true（200+10% を 220 にするため）
function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p], take = () => tokens[p++];
  function primary() {
    const t = take();
    if (!t) throw new CalcError('syntax');
    if (t.t === 'num') return t.v;
    if (t.t === '(') { const v = expr().v; if (take()?.t !== ')') throw new CalcError('syntax'); return v; }
    throw new CalcError('syntax');
  }
  function postfix() {
    const v = primary();
    if (peek()?.t === '%') { take(); return { v: v / 100, pct: true }; }
    return { v, pct: false };
  }
  function unary() {
    if (peek()?.t === '-') { take(); const r = unary(); return { v: -r.v, pct: r.pct }; }
    return postfix();
  }
  function term() {
    let left = unary(), only = true;
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = take().t, r = unary();
      if (op === '/' && r.v === 0) throw new CalcError('zero');
      left = { v: op === '*' ? left.v * r.v : left.v / r.v, pct: false };
      only = false;
    }
    return only ? left : { v: left.v, pct: false };
  }
  function expr() {
    let left = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = take().t, r = term();
      const add = r.pct ? left.v * r.v : r.v;
      left = { v: op === '+' ? left.v + add : left.v - add, pct: false };
    }
    return left;
  }
  const r = expr();
  if (p !== tokens.length) throw new CalcError('syntax');
  return r.v;
}

export function evaluate(s) {
  const tokens = tokenize(String(s));
  if (!tokens || !tokens.length) return { ok: false, error: 'syntax' };
  try {
    const v = parse(tokens);
    if (!Number.isFinite(v)) return { ok: false, error: 'range' };
    return { ok: true, value: v };
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, error: e.code };
    throw e;
  }
}

export const ERRORS = { zero: '0 では割れません。', syntax: '式が途中です。', range: '数が大きすぎます。' };

/* ---------- 表示 ---------- */
// 12 けたで丸めて、0.1 + 0.2 のような小数の誤差を見せない。とても大きい数と小さい数は指数で書く
export function format(v) {
  if (v === 0 || Object.is(v, -0)) return '0';
  const r = Number(v.toPrecision(12)), a = Math.abs(r);
  if (a >= 1e15 || a < 1e-6) return r.toExponential();
  return String(r);
}
// 整数の部分に3けたごとのコンマを入れる（指数の表記はそのまま）
export function group(s) {
  if (/e/.test(s)) return s;
  const [i, f] = s.split('.');
  const sign = i.startsWith('-') ? '-' : '', d = sign ? i.slice(1) : i;
  return sign + d.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f !== undefined ? '.' + f : '');
}
// 画面に出す式（演算子を記号にする）
export const pretty = (s) => String(s).replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/\+/g, '＋');

/* ---------- キーを押したときの状態 ---------- */
// expr: 打っている途中の式、last: 前の答え、fresh: 答えを出した直後か、error: 直前の誤り（ERRORS の鍵）
export const initial = () => ({ expr: '', last: null, fresh: false, error: null });
const OPS = '+-*/';
const tailNumber = (e) => /(\d+(\.\d*)?|\.\d+)$/.exec(e)?.[0] ?? '';
const openCount = (e) => [...e].reduce((n, c) => n + (c === '(' ? 1 : c === ')' ? -1 : 0), 0);
const valueText = (v) => (v < 0 ? '(-' + format(-v) + ')' : format(v));

// key: '0'〜'9' '.' '+' '-' '*' '/' '(' ')' '%' '=' 'Backspace' 'Escape' 'neg'（±）
// 返す値: { state, event, done? }。event は音と計算テープに使う（digit・op・eval・error・clear・edit・ignore）
export function press(state, key) {
  let s = { ...state };
  if (key === 'Enter') key = '=';
  if (key === 'Escape') return { state: initial(), event: 'clear' };
  if (s.error) {
    if (key === 'Backspace') return { state: { ...s, error: null }, event: 'clear' };
    s = { ...initial(), last: s.last };
  }
  const e = s.expr, end = e.slice(-1);
  const ret = (expr, event, extra = {}) => ({ state: { ...s, expr, fresh: false, error: null, ...extra }, event });

  if (/^\d$/.test(key)) {
    if (s.fresh) return ret(key, 'digit');
    if (end === ')' || end === '%') return { state: s, event: 'ignore' };
    if (tailNumber(e) === '0') return ret(e.slice(0, -1) + key, 'digit');
    return ret(e + key, 'digit');
  }
  if (key === '.') {
    if (s.fresh) return ret('0.', 'digit');
    const n = tailNumber(e);
    if (n.includes('.') || end === ')' || end === '%') return { state: s, event: 'ignore' };
    return ret(e + (n ? '.' : '0.'), 'digit');
  }
  if (OPS.includes(key)) {
    if (s.fresh) return ret(format(s.last) + key, 'op');
    if (!e) return ret(key === '-' ? '-' : '0' + key, 'op');
    if (end === '(') return key === '-' ? ret(e + key, 'op') : { state: s, event: 'ignore' };
    if (OPS.includes(end)) {
      if (key === '-' && (end === '*' || end === '/')) return ret(e + key, 'op');
      const base = e.replace(/[+\-*/]+$/, '');
      return ret((base || '0') + key, 'op');
    }
    return ret(e + key, 'op');
  }
  if (key === '(') {
    if (s.fresh) return ret('(', 'op');
    if (/[\d.)%]$/.test(e)) return ret(e + '*(', 'op');
    return ret(e + '(', 'op');
  }
  if (key === ')') {
    if (openCount(e) > 0 && /[\d.)%]$/.test(e)) return ret(e + ')', 'op');
    return { state: s, event: 'ignore' };
  }
  if (key === '%') {
    if (s.fresh) return ret(format(s.last) + '%', 'op');
    if (/[\d)]$/.test(e)) return ret(e + '%', 'op');
    return { state: s, event: 'ignore' };
  }
  if (key === 'neg') {
    if (s.fresh) return ret(s.last < 0 ? format(-s.last) : '(-' + format(s.last) + ')', 'edit');
    const wrapped = /\(-(\d+(?:\.\d*)?|\.\d+)\)$/.exec(e);
    if (wrapped) return ret(e.slice(0, -wrapped[0].length) + wrapped[1], 'edit');
    const n = tailNumber(e);
    if (!n) return { state: s, event: 'ignore' };
    return ret(e.slice(0, -n.length) + '(-' + n + ')', 'edit');
  }
  if (key === 'Backspace') {
    if (s.fresh || !e) return { state: s, event: 'ignore' };
    return ret(e.slice(0, -1), 'edit');
  }
  if (key === '=') {
    if (s.fresh || !e) return { state: s, event: 'ignore' };
    const closed = e + ')'.repeat(Math.max(0, openCount(e)));
    const r = evaluate(closed);
    if (!r.ok) return { state: { ...s, error: r.error }, event: 'error' };
    return { state: { expr: '', last: r.value, fresh: true, error: null }, event: 'eval', done: { expr: closed, value: r.value } };
  }
  return { state: s, event: 'ignore' };
}

// 計算テープの答えなどを、式に入れる。答えの直後・空・誤りのあとは新しい式、演算子のあとは続き、数のあとは置き換える
export function insertValue(state, v) {
  const t = valueText(v), e = state.expr;
  const set = (expr) => ({ ...state, expr, fresh: false, error: null });
  if (state.fresh || state.error || !e) return set(t);
  if (/[+\-*/(]$/.test(e)) return set(e + t);
  const n = tailNumber(e);
  if (n) return set(e.slice(0, -n.length).replace(/\(-$/, '') + t);
  return set(e + '*' + t);
}

export const tapeToText = (tape, stamp) => `電卓の計算テープ（${stamp}）\n\n` + tape.map((r) => `${pretty(r.expr)} = ${format(r.value)}`).join('\n') + '\n';
