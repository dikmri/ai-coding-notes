// 音の実験室の計算（画面と音に関係しない部分）。テストは tests/os-livecode.test.mjs。
// 「音のことば」（.oto）の字句と構文の解析、誤りの位置と日本語の説明、音の名前と周波数、
// loop を 1 回進めたときに予約される音の列（runIteration）、鳴らしながら書き換えたときの切り替え（Engine）、
// エディタの字下げ、見本、説明書。eval や new Function は使わず、自分で字句と構文を読んで、木をたどって計算する。
//
// ことばの形（1 行に 1 つの命令。; でも区切れる。# から行の終わりはコメント）:
//   tempo 120                      速さ（1 分間の拍の数）。loop の外に 1 回だけ
//   seed 7                         乱数の種
//   set root = C3                  名前に値を入れる（loop の外なら全体、中ならそのくり返しの中）
//   synth saw                      音色（loop の外なら全体の初めの音色）
//   loop 名前 { ... }              くり返す流れ。いくつでも同時に鳴る
//   play C4 len 0.5 amp 0.8 pan 0 synth saw
//   chord C4 major len 2           和音
//   sample kick amp 1 pan 0 rate 1 打楽器（自分で合成する）
//   rest 0.5                       拍で待つ
//   repeat 4 { ... }               くり返す
//   fx echo 0.75 / fx lowpass 800  その loop の音全体に効果を掛ける（loop のすぐ中だけ）
// 値: 数、音の名前（C4・D#3・Bb2）、名前、[ ] の並び、( )、+ - * / %、pick 並び、cycle 並び、rand 下 上、
//     chord 根音 種類、scale 根音 種類、count（そのくり返しが何回目か。0 から）。

/* ---------- 名前の表 ---------- */
export const SYNTHS = { sine: '正弦波（やわらかい）', tri: '三角波（笛のよう）', square: '矩形波（ゲーム機のよう）', saw: 'ノコギリ波（明るくて太い）', pluck: 'はじく音（弦のよう）', bell: 'ベル（金属の響き）', pad: 'パッド（ふわっと広がる）' };
export const SAMPLES = { kick: 'バスドラム', snare: 'スネア', hat: 'ハイハット', openhat: '開いたハイハット', clap: '手拍子', tom: 'タム', rim: 'リム（縁をたたく音）' };
// 効果: [説明, 書かなかったときの値, 下限, 上限]
export const FX = {
  echo: ['こだま。数は遅らせる拍の長さ', 0.5, 0.05, 4],
  lowpass: ['高い音を削る。数は残す高さの上限（Hz）', 1000, 40, 18000],
  highpass: ['低い音を削る。数は残す高さの下限（Hz）', 400, 20, 12000],
  reverb: ['広い部屋の響き。数は響きの量（0〜1）', 0.4, 0, 1],
  distort: ['音をひずませる。数はひずみの強さ（0〜1）', 0.5, 0, 1],
};
export const CHORDS = { major: [0, 4, 7], minor: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8], power: [0, 7] };
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11, 12], minor: [0, 2, 3, 5, 7, 8, 10, 12], penta: [0, 2, 4, 7, 9, 12], minpenta: [0, 3, 5, 7, 10, 12],
  blues: [0, 3, 5, 6, 7, 10, 12], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};
const STATEMENTS = ['tempo', 'seed', 'set', 'loop', 'play', 'chord', 'sample', 'rest', 'repeat', 'synth', 'fx'];
const OPTIONS = ['len', 'amp', 'pan', 'rate'];
const FUNCS = ['pick', 'cycle', 'rand', 'scale'];
const BUILTINS = new Set([...Object.keys(SYNTHS), ...Object.keys(SAMPLES), ...Object.keys(FX), ...Object.keys(CHORDS), ...Object.keys(SCALES), 'count']);
export const LIMITS = { loops: 16, events: 4000, steps: 100000, tempo: [20, 300] };

/* ---------- 音の名前と周波数 ---------- */
const STEP = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NOTE_RE = /^([A-Ga-g])(#|b)?(-1|\d)$/;
// 音の名前を MIDI の番号にする（C4 = 60、A4 = 69）。読めなければ null
export function noteToMidi(name) {
  const m = NOTE_RE.exec(String(name));
  if (!m) return null;
  return STEP[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
}
export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiToName(m) { const n = Math.round(m); return SHARP[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); }
export const chordNotes = (root, type) => CHORDS[type].map((i) => root + i);
export const scaleNotes = (root, type) => SCALES[type].map((i) => root + i);
// 小節の数を秒にする（4 拍で 1 小節）
export const barsToSeconds = (bars, tempo) => (bars * 4 * 60) / tempo;

/* ---------- 誤り ---------- */
class LCError extends Error {
  constructor(tok, message) { super(message); this.line = tok.line; this.col = tok.col; this.len = Math.max(1, (tok.end ?? tok.start + 1) - tok.start); this.start = tok.start; }
}
const plain = (e) => ({ line: e.line, col: e.col, len: e.len, start: e.start, message: e.message });
const fail = (tok, msg) => { throw new LCError(tok, msg); };
export const formatError = (e) => `${e.line} 行 ${e.col} 列: ${e.message}`;
// 全角の英数字や記号（！〜～）と、全角の句読点
const WIDE = /[！-～、。「」]/;
// 書き間違いに近い名前を探す（文字の入れ替え・足し引きの数が 2 以下）
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function nearest(word, list) {
  let best = null, bd = 3;
  for (const w of list) { const dd = distance(word.toLowerCase(), w); if (dd < bd && dd <= Math.max(1, Math.floor(w.length / 2))) { bd = dd; best = w; } }
  return best;
}
const hint = (word, list) => { const n = nearest(word, list); return n ? `もしかして ${n} ですか? ` : ''; };

/* ---------- 字句 ---------- */
// 文字を字句の並びにする。誤りは出さない（色分けは書いている途中の文字にも使う）。
// 種類: kw（命令）opt（len など）func（pick など）builtin（音色・打楽器・効果・和音の名前、count）
//       note（音の名前）num name（名前）op（+ - * / % =）punct（{ } [ ] ( ) ,）comment nl（行の終わりと ;）bad（使えない文字）
const NOTE_Y = /[A-Ga-g](?:#|b)?(?:-1|\d)(?![\p{L}\p{N}_])/uy;
const NAME_Y = /[\p{L}_][\p{L}\p{N}_]*/uy;
const NUM_Y = /(?:\d+(?:\.\d*)?|\.\d+)/y;
export function tokenize(src) {
  const out = [];
  let i = 0, line = 1, ls = 0;
  const push = (type, start, end) => out.push({ type, text: src.slice(start, end), start, end, line, col: start - ls + 1 });
  const at = (re) => { re.lastIndex = i; return re.exec(src); };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { push('nl', i, i + 1); i++; line++; ls = i; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '　') { i++; continue; }
    if (c === ';') { push('nl', i, i + 1); i++; continue; }
    let m = at(NOTE_Y);
    if (m) { push('note', i, i + m[0].length); i += m[0].length; continue; }
    if (c === '#') { let j = src.indexOf('\n', i); if (j < 0) j = src.length; push('comment', i, j); i = j; continue; }
    if ((m = at(NUM_Y))) { push('num', i, i + m[0].length); i += m[0].length; continue; }
    if ((m = at(NAME_Y))) {
      const w = m[0];
      push(STATEMENTS.includes(w) ? 'kw' : OPTIONS.includes(w) ? 'opt' : FUNCS.includes(w) ? 'func' : BUILTINS.has(w) ? 'builtin' : 'name', i, i + w.length);
      i += w.length; continue;
    }
    if ('+-*/%='.includes(c)) { push('op', i, i + 1); i++; continue; }
    if ('{}[](),'.includes(c)) { push('punct', i, i + 1); i++; continue; }
    const cp = src.codePointAt(i), n = cp > 0xffff ? 2 : 1;
    push('bad', i, i + n); i += n;
  }
  return out;
}

/* ---------- 構文 ---------- */
const badChar = (t) => `「${t.text}」は使えない文字です。${WIDE.test(t.text) ? '全角の文字は、半角に切り替えて書いてください。' : '音のことばで使える記号は + - * / % = { } [ ] ( ) , ; # です。'}`;
class Parser {
  constructor(src) {
    this.toks = tokenize(src).filter((t) => t.type !== 'comment');
    const lines = src.split('\n');
    this.eof = { type: 'eof', text: '', line: lines.length, col: lines[lines.length - 1].length + 1, start: src.length, end: src.length + 1 };
    this.i = 0; this.depth = 0; this.cycles = 0;
  }
  // [ ] と ( ) の中では、行をまたいで書ける
  at() { while (this.depth > 0 && this.toks[this.i]?.type === 'nl') this.i++; return this.toks[this.i] || this.eof; }
  next() { const t = this.at(); this.i++; return t; }
  is(type, text) { const t = this.at(); return t.type === type && (text === undefined || t.text === text); }
  skipNl() { while (this.toks[this.i]?.type === 'nl') this.i++; }
  atEnd() { const t = this.at(); return t.type === 'nl' || t.type === 'eof' || (t.type === 'punct' && t.text === '}'); }
  endStmt(kind) {
    if (this.atEnd()) return;
    const t = this.at();
    if (t.type === 'bad') fail(t, badChar(t));
    if (kind === 'play' && (t.type === 'note' || t.type === 'num')) fail(t, `この行の続き「${t.text}」が読めません。いくつかの音を同時に鳴らすときは [C4 E4] のように [ ] で囲みます。`);
    if (t.type === 'opt') fail(t, `${kind} には ${t.text} は使えません。`);
    fail(t, `この行の続き「${t.text}」が読めません。1 行に 1 つの命令を書きます。`);
  }
  program() {
    const prog = { tempo: null, seed: null, synth: null, sets: [], loops: [], once: [] };
    for (;;) {
      this.skipNl();
      const t = this.at();
      if (t.type === 'eof') break;
      if (t.type === 'punct' && t.text === '}') fail(t, '対応する { の無い } です。');
      if (t.type === 'kw' && (t.text === 'tempo' || t.text === 'seed')) {
        if (prog[t.text]) fail(t, `${t.text} は 1 回だけ書けます（${prog[t.text].tok.line} 行目にもあります）。`);
        this.next();
        if (this.atEnd()) fail(t, `${t.text} のあとに数を書きます（例: ${t.text} ${t.text === 'tempo' ? 120 : 7}）。`);
        prog[t.text] = { tok: t, expr: this.expr() }; this.endStmt(t.text);
      } else if (t.type === 'kw' && t.text === 'set') prog.sets.push(this.set());
      else if (t.type === 'kw' && t.text === 'loop') prog.loops.push(this.loop(prog));
      else if (t.type === 'kw' && t.text === 'fx') fail(t, 'fx は loop の中に書きます。その loop の音全体に効果を掛けます。');
      else if (t.type === 'kw' && t.text === 'synth') { const s = this.statement({ inLoop: false }); prog.synth = s.name; }
      else prog.once.push(this.statement({ inLoop: false }));
    }
    return prog;
  }
  loop(prog) {
    const kw = this.next(), nameTok = this.at();
    if (nameTok.type === 'punct' && nameTok.text === '{') fail(nameTok, 'loop のあとに名前を書きます（例: loop drums {）。');
    if (nameTok.type !== 'name' && nameTok.type !== 'builtin') fail(nameTok.type === 'eof' || nameTok.type === 'nl' ? kw : nameTok, 'loop のあとに名前を書きます（例: loop drums {）。名前には英字か日本語を使い、音の名前（C4 など）や命令の名前は使えません。');
    this.next();
    const dup = prog.loops.find((l) => l.name === nameTok.text);
    if (dup) fail(nameTok, `loop「${nameTok.text}」が 2 つあります（${dup.tok.line} 行目にもあります）。名前を変えてください。`);
    if (prog.loops.length >= LIMITS.loops) fail(kw, `loop は ${LIMITS.loops} 個までです。`);
    const open = this.at();
    if (!(open.type === 'punct' && open.text === '{')) fail(open.type === 'nl' || open.type === 'eof' ? nameTok : open, `loop の名前のあとに、同じ行で { を書きます（例: loop ${nameTok.text} {）。`);
    this.next();
    this.cycles = 0;
    const body = this.block(open, { inLoop: true, top: true });
    this.endStmt('loop');
    return { name: nameTok.text, tok: kw, nameTok, body };
  }
  block(open, opts) {
    const body = [];
    for (;;) {
      this.skipNl();
      const t = this.at();
      if (t.type === 'eof') fail(open, 'この { に対応する } がありません。loop や repeat の終わりに } を書きます。');
      if (t.type === 'punct' && t.text === '}') { this.next(); return body; }
      body.push(this.statement(opts));
    }
  }
  set() {
    const kw = this.next(), n = this.at();
    if (n.type === 'note') fail(n, `「${n.text}」は音の名前なので、set の名前には使えません。`);
    if (n.type === 'kw' || n.type === 'opt' || n.type === 'func' || n.type === 'builtin') fail(n, `${n.text} は決まった名前なので、set では使えません。別の名前にしてください。`);
    if (n.type !== 'name') fail(n.type === 'nl' || n.type === 'eof' ? kw : n, 'set のあとに名前を書きます（例: set root = C3）。');
    this.next();
    if (!this.is('op', '=')) fail(this.atEnd() ? n : this.at(), 'set の名前のあとに = を書きます（例: set root = C3）。');
    const eq = this.next();
    if (this.atEnd()) fail(eq, '= のあとに値を書きます（例: set root = C3）。');
    const expr = this.expr();
    this.endStmt('set');
    return { k: 'set', tok: kw, name: n.text, nameTok: n, expr };
  }
  nameOf(kw, table, what, list) {
    const t = this.at();
    if (this.atEnd()) fail(kw, `${kw.text} のあとに${what}の名前を書きます。使えるもの: ${list}`);
    this.next();
    if (!(t.text in table)) fail(t, `「${t.text}」という${what}はありません。${hint(t.text, Object.keys(table))}使えるもの: ${list}`);
    return t;
  }
  options(kind, allowed) {
    const opts = {};
    for (;;) {
      const t = this.at();
      const isOpt = t.type === 'opt' || (t.type === 'kw' && t.text === 'synth');
      if (!isOpt) return opts;
      if (!allowed.includes(t.text)) fail(t, `${kind} には ${t.text} は使えません。使えるのは ${allowed.join('・')} です。`);
      if (opts[t.text]) fail(t, `${t.text} が 2 回あります。`);
      this.next();
      if (t.text === 'synth') { const n = this.nameOf(t, SYNTHS, '音色', Object.keys(SYNTHS).join(' ')); opts.synth = { tok: t, name: n.text }; continue; }
      if (this.atEnd() || this.at().type === 'opt') fail(t, `${t.text} のあとに数を書きます（例: ${t.text} ${t.text === 'pan' ? '-0.5' : '0.5'}）。`);
      opts[t.text] = { tok: t, expr: this.expr() };
    }
  }
  statement(opts) {
    const t = this.at();
    if (t.type === 'bad') fail(t, badChar(t));
    if (t.type === 'kw') {
      switch (t.text) {
        case 'play': {
          this.next();
          if (this.atEnd()) fail(t, 'play のあとに音の高さを書きます（例: play C4）。');
          const expr = this.expr(), o = this.options('play', ['len', 'amp', 'pan', 'synth']);
          this.endStmt('play');
          return { k: 'play', tok: t, expr, opts: o };
        }
        case 'chord': {
          const expr = this.expr(), o = this.options('chord', ['len', 'amp', 'pan', 'synth']);
          this.endStmt('play');
          return { k: 'play', tok: t, expr, opts: o };
        }
        case 'sample': {
          this.next();
          const n = this.nameOf(t, SAMPLES, '打楽器', Object.keys(SAMPLES).join(' '));
          const o = this.options('sample', ['amp', 'pan', 'rate']);
          this.endStmt('sample');
          return { k: 'sample', tok: t, name: n.text, opts: o };
        }
        case 'rest': {
          this.next();
          if (this.atEnd()) fail(t, 'rest のあとに待つ拍の数を書きます（例: rest 1）。');
          const expr = this.expr(); this.endStmt('rest');
          return { k: 'rest', tok: t, expr };
        }
        case 'repeat': {
          this.next();
          if (this.atEnd() || this.is('punct', '{')) fail(t, 'repeat のあとにくり返す回数を書きます（例: repeat 4 {）。');
          const expr = this.expr(), open = this.at();
          if (!(open.type === 'punct' && open.text === '{')) fail(open.type === 'nl' || open.type === 'eof' ? t : open, 'repeat の回数のあとに、同じ行で { を書きます（例: repeat 4 {）。');
          this.next();
          const body = this.block(open, { ...opts, top: false });
          this.endStmt('repeat');
          return { k: 'repeat', tok: t, expr, body };
        }
        case 'synth': {
          this.next();
          const n = this.nameOf(t, SYNTHS, '音色', Object.keys(SYNTHS).join(' '));
          this.endStmt('synth');
          return { k: 'synth', tok: t, name: n.text };
        }
        case 'set': return this.set();
        case 'fx': {
          if (!opts.top) fail(t, 'fx は repeat の中ではなく、loop のすぐ中に書きます。');
          this.next();
          const n = this.nameOf(t, FX, '効果', Object.keys(FX).join(' '));
          const expr = this.atEnd() ? null : this.expr();
          this.endStmt('fx');
          return { k: 'fx', tok: t, name: n.text, expr };
        }
        case 'loop': fail(t, opts.inLoop ? 'loop の中に loop は書けません。loop は外に並べます。' : 'loop の中に loop は書けません。');
        // falls through（fail は投げるので来ない）
        default: fail(t, `${t.text} は loop の外に書きます。`);
      }
    }
    if (t.type === 'opt') fail(t, `${t.text} は play や sample のあとに書きます（例: play C4 ${t.text} 0.5）。`);
    if (t.type === 'note' || t.type === 'num') fail(t, `「${t.text}」だけでは鳴りません。play ${t.text} のように書きます。`);
    if (t.type === 'name' || t.type === 'builtin' || t.type === 'func') {
      if (WIDE.test(t.text)) fail(t, `「${t.text}」は全角の文字です。半角に切り替えて書いてください。`);
      fail(t, `「${t.text}」という命令はありません。${hint(t.text, STATEMENTS)}使える命令: play chord sample rest repeat synth set fx`);
    }
    fail(t, `「${t.text}」から始まる命令はありません。`);
  }
  // 値の式: 足し引き ＜ 掛け割り ＜ 符号 ＜ 値
  expr() { return this.add(); }
  add() {
    let a = this.mul();
    while (this.is('op', '+') || this.is('op', '-')) { const op = this.next(); a = { k: 'bin', op: op.text, tok: op, a, b: this.mul() }; }
    return a;
  }
  mul() {
    let a = this.unary();
    while (this.is('op', '*') || this.is('op', '/') || this.is('op', '%')) { const op = this.next(); a = { k: 'bin', op: op.text, tok: op, a, b: this.unary() }; }
    return a;
  }
  unary() {
    if (this.is('op', '-')) { const t = this.next(); return { k: 'neg', tok: t, a: this.unary() }; }
    return this.primary();
  }
  primary() {
    const t = this.at();
    if (t.type === 'num') { this.next(); return { k: 'num', tok: t, v: +t.text }; }
    if (t.type === 'note') { this.next(); return { k: 'num', tok: t, v: noteToMidi(t.text) }; }
    if (t.type === 'name') {
      this.next();
      if (WIDE.test(t.text)) fail(t, `「${t.text}」は全角の文字です。半角に切り替えて書いてください。`);
      return { k: 'name', tok: t, name: t.text };
    }
    if (t.type === 'builtin' && t.text === 'count') { this.next(); return { k: 'count', tok: t }; }
    if (t.type === 'punct' && t.text === '(') {
      this.next(); this.depth++;
      const e = this.expr();
      if (!this.is('punct', ')')) fail(this.at().type === 'eof' ? t : this.at(), '( に対応する ) がありません。');
      this.depth--; this.next();
      return e;
    }
    if (t.type === 'punct' && t.text === '[') {
      this.next(); this.depth++;
      const items = [];
      for (;;) {
        const u = this.at();
        if (u.type === 'eof') fail(t, '[ に対応する ] がありません。');
        if (u.type === 'punct' && u.text === ']') break;
        if (u.type === 'punct' && u.text === ',') { this.next(); continue; }
        // 次の行の命令や } まで来たら、] を書き忘れている
        if ((u.type === 'punct' && u.text === '}') || (u.type === 'kw' && u.text !== 'chord')) fail(t, '[ に対応する ] がありません。');
        items.push(this.expr());
      }
      this.depth--; this.next();
      return { k: 'list', tok: t, items };
    }
    if (t.type === 'func' && (t.text === 'pick' || t.text === 'cycle')) {
      this.next();
      if (this.atEnd()) fail(t, `${t.text} のあとに並びを書きます（例: ${t.text} [C4 E4 G4]）。`);
      return { k: t.text, tok: t, a: this.primary(), id: t.text === 'cycle' ? this.cycles++ : 0 };
    }
    if (t.type === 'func' && t.text === 'rand') {
      this.next();
      if (this.atEnd()) fail(t, 'rand のあとに 2 つの数を書きます（例: rand 0.5 1）。');
      const a = this.unary();
      if (this.atEnd() || this.at().type === 'opt') fail(t, 'rand のあとに 2 つの数を書きます（例: rand 0.5 1）。');
      return { k: 'rand', tok: t, a, b: this.unary() };
    }
    if ((t.type === 'kw' && t.text === 'chord') || (t.type === 'func' && t.text === 'scale')) {
      const table = t.text === 'chord' ? CHORDS : SCALES, what = t.text === 'chord' ? '和音の種類' : '音階の種類';
      this.next();
      const ex = t.text === 'chord' ? 'chord C4 major' : 'scale C4 major';
      if (this.atEnd()) fail(t, `${t.text} のあとに、音と${what}を書きます（例: ${ex}）。`);
      const root = this.add(), ty = this.at();
      if (this.atEnd() || ty.type === 'opt') fail(t, `${t.text} の音のあとに${what}を書きます（例: ${ex}）。使えるもの: ${Object.keys(table).join(' ')}`);
      this.next();
      const type = t.text === 'chord' && ty.text === '7' ? 'dom7' : ty.text;
      if (!(type in table)) fail(ty, `「${ty.text}」という${what}はありません。${hint(ty.text, Object.keys(table))}使えるもの: ${Object.keys(table).join(' ')}`);
      return { k: t.text, tok: t, root, type };
    }
    if (t.type === 'bad') fail(t, badChar(t));
    if (this.atEnd()) fail(t.type === 'eof' || t.type === 'nl' ? this.toks[this.i - 1] || t : t, '数か音の名前が足りません。');
    fail(t, `「${t.text}」は数や音の名前として読めません。`);
    return null;
  }
}

// 名前が使う前に決まっているかを、書いた順にたどって確かめる
function checkNames(prog) {
  const undef = (e) => {
    const n = e.name;
    if (/^[A-Ga-g][#b]?$/.test(n)) fail(e.tok, `「${n}」は音の名前ですか? 音の名前には高さの数を付けます（例: ${n.toUpperCase()}4）。`);
    fail(e.tok, `「${n}」はまだ決めていない名前です。先に set ${n} = C4 のように決めます。${hint(n, [...STATEMENTS, ...OPTIONS, ...FUNCS])}`);
  };
  const expr = (e, scope) => {
    if (!e) return;
    if (e.k === 'name') { if (!scope.has(e.name)) undef(e); return; }
    for (const c of [e.a, e.b, e.root]) if (c) expr(c, scope);
    if (e.items) for (const c of e.items) expr(c, scope);
  };
  const body = (list, scope) => {
    for (const s of list) {
      expr(s.expr, scope);
      for (const o of Object.values(s.opts || {})) expr(o.expr, scope);
      if (s.k === 'set') scope.add(s.name);
      if (s.k === 'repeat') body(s.body, scope);
    }
  };
  const globals = new Set();
  for (const s of prog.sets) { expr(s.expr, globals); globals.add(s.name); }
  if (prog.tempo) expr(prog.tempo.expr, globals);
  if (prog.seed) expr(prog.seed.expr, globals);
  for (const l of prog.loops) body(l.body, new Set(globals));
  body(prog.once, new Set(globals));
}

/* ---------- 乱数（種を決めれば同じ並び） ---------- */
export function hashString(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rngFor = (seed, name) => makeRng(hashString(`${seed}:${name}`));

/* ---------- 計算 ---------- */
const fmtNum = (v) => (Array.isArray(v) ? `[${v.map(fmtNum).join(' ')}]` : String(Math.round(v * 1000) / 1000));
function num(v, e, what = 'ここ') {
  if (Array.isArray(v)) fail(e.tok, `${what}には数を 1 つ書きます（[ ] の並びは使えません）。`);
  if (!Number.isFinite(v)) fail(e.tok, '計算の答えが数になりません。');
  return v;
}
function evaluate(e, ctx) {
  switch (e.k) {
    case 'num': return e.v;
    case 'name': {
      if (ctx.vars.has(e.name)) return ctx.vars.get(e.name);
      if (ctx.globals.has(e.name)) return ctx.globals.get(e.name);
      return fail(e.tok, `「${e.name}」にはまだ値がありません。使う前に set で決めます。`);
    }
    case 'count': return ctx.count;
    case 'neg': { const v = evaluate(e.a, ctx); return Array.isArray(v) ? v.map((x) => -x) : -v; }
    case 'list': {
      const out = [];
      for (const it of e.items) { const v = evaluate(it, ctx); if (Array.isArray(v)) out.push(...v); else out.push(v); }
      return out;
    }
    case 'bin': {
      const a = evaluate(e.a, ctx), b = evaluate(e.b, ctx);
      if (Array.isArray(a) && Array.isArray(b)) fail(e.tok, '並びどうしの計算はできません。並びと数なら、並びの全部に計算します。');
      const f = (x, y) => {
        if ((e.op === '/' || e.op === '%') && y === 0) fail(e.tok, '0 で割ることはできません。');
        switch (e.op) { case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return x / y; default: return ((x % y) + y) % y; }
      };
      if (Array.isArray(a)) return a.map((x) => f(x, b));
      if (Array.isArray(b)) return b.map((y) => f(a, y));
      return f(a, b);
    }
    case 'pick': case 'cycle': {
      const v = evaluate(e.a, ctx);
      if (!Array.isArray(v)) fail(e.tok, `${e.k} には [C4 E4 G4] のような並びを渡します。`);
      if (!v.length) fail(e.tok, '空の並びからは選べません。');
      if (e.k === 'pick') return v[Math.floor(ctx.rng() * v.length)];
      const n = ctx.cycles.get(e.id) || 0;
      ctx.cycles.set(e.id, n + 1);
      return v[n % v.length];
    }
    case 'rand': {
      const a = num(evaluate(e.a, ctx), e.a, 'rand'), b = num(evaluate(e.b, ctx), e.b, 'rand');
      return a + ctx.rng() * (b - a);
    }
    case 'chord': case 'scale': {
      const r = num(evaluate(e.root, ctx), e.root, `${e.k} の音`);
      return e.k === 'chord' ? chordNotes(r, e.type) : scaleNotes(r, e.type);
    }
    default: return fail(e.tok, '読めない値です。');
  }
}
function inRange(v, lo, hi, tok, msg) { if (!(v >= lo && v <= hi)) fail(tok, msg); return v; }
function optNum(o, name, ctx, def, lo, hi, msg) {
  const x = o[name];
  if (!x) return def;
  return inRange(num(evaluate(x.expr, ctx), x.expr, name), lo, hi, x.expr.tok, msg);
}
function exec(list, ctx) {
  for (const s of list) {
    if (++ctx.steps > LIMITS.steps) fail(s.tok, '1 回のくり返しの計算が多すぎます。repeat の数を減らしてください。');
    switch (s.k) {
      case 'play': {
        const v = evaluate(s.expr, ctx), notes = Array.isArray(v) ? v : [v];
        const len = optNum(s.opts, 'len', ctx, 1, 1e-6, 64, 'len は 0 より大きく 64 以下の拍の数にします。');
        const amp = optNum(s.opts, 'amp', ctx, 1, 0, 4, 'amp は 0〜4 の数にします（1 がふつう）。');
        const pan = optNum(s.opts, 'pan', ctx, 0, -1, 1, 'pan は -1（左）〜 1（右）の数にします。');
        const synth = s.opts.synth ? s.opts.synth.name : ctx.synth;
        for (const n of notes) {
          if (!Number.isFinite(n) || n < 0 || n > 127) fail(s.expr.tok, `音の高さ ${fmtNum(n)} は使えません。0〜127（C-1〜G9）の間にします。`);
          ctx.events.push({ kind: 'note', beat: ctx.beat, midi: n, freq: midiToFreq(n), len, amp, pan, synth, line: s.tok.line, col: s.tok.col });
        }
        break;
      }
      case 'sample': {
        const amp = optNum(s.opts, 'amp', ctx, 1, 0, 4, 'amp は 0〜4 の数にします（1 がふつう）。');
        const pan = optNum(s.opts, 'pan', ctx, 0, -1, 1, 'pan は -1（左）〜 1（右）の数にします。');
        const rate = optNum(s.opts, 'rate', ctx, 1, 0.25, 4, 'rate は 0.25〜4 の数にします（1 がふつう。2 で高く短く）。');
        ctx.events.push({ kind: 'sample', beat: ctx.beat, name: s.name, amp, pan, rate, line: s.tok.line, col: s.tok.col });
        break;
      }
      case 'rest': {
        const v = inRange(num(evaluate(s.expr, ctx), s.expr, 'rest'), 0, 256, s.expr.tok, 'rest は 0〜256 の拍の数にします。');
        ctx.events.push({ kind: 'rest', beat: ctx.beat, len: v, line: s.tok.line, col: s.tok.col });
        ctx.beat += v;
        break;
      }
      case 'repeat': {
        const n = num(evaluate(s.expr, ctx), s.expr, 'repeat');
        if (!Number.isInteger(n) || n < 0 || n > 1000) fail(s.expr.tok, 'repeat の数は 0〜1000 の整数にします。');
        for (let i = 0; i < n; i++) exec(s.body, ctx);
        break;
      }
      case 'synth': ctx.synth = s.name; break;
      case 'set': ctx.vars.set(s.name, evaluate(s.expr, ctx)); break;
      case 'fx': {
        const [, def, lo, hi] = FX[s.name];
        const v = s.expr ? inRange(num(evaluate(s.expr, ctx), s.expr, 'fx'), lo, hi, s.expr.tok, `fx ${s.name} の数は ${lo}〜${hi} にします。`) : def;
        if (ctx.fx.length >= 4) fail(s.tok, 'fx は 1 つの loop に 4 つまでです。');
        ctx.fx.push({ type: s.name, value: v });
        break;
      }
      default: break;
    }
    if (ctx.events.length > LIMITS.events) fail(s.tok, '1 回のくり返しで鳴らす音が多すぎます。');
  }
}
// loop を 1 回進める。返す値: { events（拍の位置 beat と行の番号つき）, beats（1 回分の長さ）, fx } か { error }
export function runIteration(body, { globals, synth = 'sine', rng, count = 0, cycles = new Map() }) {
  const ctx = { beat: 0, events: [], vars: new Map(), globals, synth, rng, count, cycles, fx: [], steps: 0 };
  try { exec(body, ctx); }
  catch (e) { if (e instanceof LCError) return { error: plain(e) }; throw e; }
  return { events: ctx.events, beats: ctx.beat, fx: ctx.fx };
}

/* ---------- 解析と、1 回ずつ試しに動かして見つかる誤り ---------- */
// 返す値: { ok: true, program } か { ok: false, error: { line, col, len, start, message } }
export function compile(src) {
  try {
    const p = new Parser(String(src).replace(/\r\n?/g, '\n')).program();
    checkNames(p);
    const seedVal = p.seed ? num(evaluate(p.seed.expr, { vars: new Map(), globals: new Map(), count: 0, rng: () => 0, cycles: new Map() }), p.seed.expr, 'seed') : 1;
    const seed = Math.floor(seedVal);
    const globals = new Map(), gctx = { vars: globals, globals, count: 0, rng: rngFor(seed, '*globals'), cycles: new Map() };
    for (const s of p.sets) globals.set(s.name, evaluate(s.expr, gctx));
    let tempo = 120;
    if (p.tempo) {
      tempo = num(evaluate(p.tempo.expr, gctx), p.tempo.expr, 'tempo');
      inRange(tempo, LIMITS.tempo[0], LIMITS.tempo[1], p.tempo.expr.tok, `tempo は ${LIMITS.tempo[0]}〜${LIMITS.tempo[1]} の数で書きます（1 分間の拍の数）。`);
    }
    const program = { tempo, seed, synth: p.synth || 'sine', globals, loops: p.loops.map((l) => ({ name: l.name, line: l.tok.line, col: l.tok.col, body: l.body, tok: l.tok })), once: p.once, src };
    // 1 回目のくり返しを試しに計算して、計算の誤りと長さ 0 の loop を見つける（誤りがあれば前の版を鳴らし続けるため）
    for (const l of program.loops) {
      const r = runIteration(l.body, { globals, synth: program.synth, rng: rngFor(seed, l.name) });
      if (r.error) return { ok: false, error: r.error };
      if (!(r.beats > 0)) fail(l.tok, `loop「${l.name}」の 1 回分の長さが 0 拍です。rest を入れて、待つ長さを決めてください（rest が無いと、くり返しが止まらなくなります）。`);
    }
    const r = runIteration(program.once, { globals, synth: program.synth, rng: rngFor(seed, '*once') });
    if (r.error) return { ok: false, error: r.error };
    for (const l of program.loops) delete l.tok;
    return { ok: true, program };
  } catch (e) {
    if (e instanceof LCError) return { ok: false, error: plain(e) };
    throw e;
  }
}

/* ---------- 鳴らしながら書き換える仕組み ---------- */
// 時刻は秒（AudioContext の currentTime と同じ物差し）。advance(until) は、until 秒より前に始まるくり返しを
// 1 回分ずつまとめて計算して返す。run で新しい版を渡すと、同じ名前の loop は次のくり返しの頭から新しい中身になる。
// 消した loop は今のくり返しを鳴らし終えたら止まり、新しい loop は次の小節（4 拍）の頭から始まる。
export class Engine {
  constructor() { this.loops = new Map(); this.clock = null; this.program = null; this.errors = []; this.playing = false; this.seed = 1; this.onceN = 0; this.ver = 0; }
  beatAt(t) { return this.clock.b0 + ((t - this.clock.t0) * this.clock.bpm) / 60; }
  timeAt(b) { return this.clock.t0 + ((b - this.clock.b0) * 60) / this.clock.bpm; }
  #state(name, def, next, once = false) { return { name, def, ver: this.ver, next, count: 0, rng: rngFor(this.seed, once ? '*once' : name), cycles: new Map(), ending: false, reseed: false, once }; }
  // ver: run を呼んだ回数。くり返しには、その中身を渡した run の番号が付く（書き換えの切り替わりを確かめるため）
  run(program, now, { lead = 0.1 } = {}) {
    this.errors = [];
    this.ver++;
    if (!this.playing) {
      this.clock = { t0: now + lead, b0: 0, bpm: program.tempo };
      this.seed = program.seed; this.loops.clear();
      for (const l of program.loops) this.loops.set(l.name, this.#state(l.name, l.body, this.clock.t0));
      if (program.once.length) this.loops.set('*once' + ++this.onceN, this.#state('*once', program.once, this.clock.t0, true));
      this.playing = true;
    } else {
      if (program.tempo !== this.clock.bpm) this.clock = { t0: now, b0: this.beatAt(now), bpm: program.tempo };
      const reseed = program.seed !== this.seed;
      this.seed = program.seed;
      const names = new Set(program.loops.map((l) => l.name));
      for (const st of this.loops.values()) if (!st.once && !names.has(st.name)) st.ending = true;
      const bar = this.timeAt(Math.ceil(this.beatAt(now + 0.05) / 4 - 1e-9) * 4);
      for (const l of program.loops) {
        const st = this.loops.get(l.name);
        if (st) { st.def = l.body; st.ver = this.ver; st.ending = false; if (reseed) st.reseed = true; }
        else this.loops.set(l.name, this.#state(l.name, l.body, bar));
      }
      if (program.once.length) this.loops.set('*once' + ++this.onceN, this.#state('*once', program.once, this.timeAt(Math.ceil(this.beatAt(now + 0.05) - 1e-9)), true));
    }
    this.program = program;
  }
  advance(until) {
    const out = [];
    if (!this.playing) return out;
    for (let guard = 0; guard < 20000; guard++) {
      let st = null;
      for (const s of this.loops.values()) if (s.next < until && (!st || s.next < st.next)) st = s;
      if (!st) break;
      const key = [...this.loops].find(([, v]) => v === st)[0];
      if (st.ending) { this.loops.delete(key); continue; }
      if (st.reseed) { st.rng = rngFor(this.seed, st.once ? '*once' : st.name); st.reseed = false; }
      const spb = 60 / this.clock.bpm;
      const r = runIteration(st.def, { globals: this.program.globals, synth: this.program.synth, rng: st.rng, count: st.count, cycles: st.cycles });
      if (r.error || !(r.beats > 0 || st.once)) {
        this.errors.push({ loop: st.name, ...(r.error || { line: 0, col: 0, len: 1, message: `loop「${st.name}」の 1 回分の長さが 0 拍になりました。` }) });
        this.loops.delete(key); continue;
      }
      const loop = st.once ? '' : st.name, start = st.next;
      out.push({
        loop, iter: st.count, ver: st.ver, time: start, spb, beats: r.beats, fx: r.fx,
        events: r.events.map((e) => ({ ...e, loop, iter: st.count, time: start + e.beat * spb, dur: (e.len || 0) * spb })),
      });
      if (st.once) { this.loops.delete(key); continue; }
      st.next = start + r.beats * spb; st.count++;
    }
    return out;
  }
  stop() { this.loops.clear(); this.clock = null; this.playing = false; }
  // 動いている loop（1 回だけの部分は除く）
  status() { return [...this.loops.values()].filter((s) => !s.once).map((s) => ({ name: s.name, count: s.count, ending: s.ending, next: s.next })); }
}

/* ---------- エディタの字下げ ---------- */
// Enter のあとの字下げ: 前の行と同じだけ。{ で終わる行のあとは 2 つ深く
export function nextIndent(lineBefore) {
  const ind = /^[ \t]*/.exec(lineBefore)[0];
  return /\{\s*(#.*)?$/.test(lineBefore) ? ind + '  ' : ind;
}
// 選んだ行をまとめて字下げする（dir = 1）・戻す（dir = -1）。返す値: { text, start, end }（選び直す範囲）
export function indentLines(text, start, end, dir) {
  const ls = text.lastIndexOf('\n', start - 1) + 1;
  let le = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end); if (le < 0) le = text.length;
  const lines = text.slice(ls, le).split('\n');
  let s = start, e = end;
  const out = lines.map((l, i) => {
    const d = dir > 0 ? 2 : -Math.min(2, /^ */.exec(l)[0].length);
    // 行の頭から選んでいたときは、字下げしても選ぶ範囲の頭を行の頭に残す
    if (i === 0 && !(dir > 0 && start === ls)) s = Math.max(ls, start + d);
    e += d;
    return dir > 0 ? '  ' + l : l.slice(-d);
  });
  return { text: text.slice(0, ls) + out.join('\n') + text.slice(le), start: s, end: Math.max(s, e) };
}
// 選んだ行をコメントにする・戻す（Ctrl+/）。字下げのあとに「# 」を付け、全部の行に付いていれば外す
export function toggleComment(text, start, end) {
  const ls = text.lastIndexOf('\n', start - 1) + 1;
  let le = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end); if (le < 0) le = text.length;
  const lines = text.slice(ls, le).split('\n');
  const filled = lines.filter((l) => l.trim());
  const off = filled.length > 0 && filled.every((l) => /^\s*#/.test(l));
  let s = start, e = end;
  const out = lines.map((l, i) => {
    if (!l.trim()) return l;
    const ind = /^\s*/.exec(l)[0];
    let next;
    if (off) next = ind + l.slice(ind.length).replace(/^# ?/, '');
    else next = ind + '# ' + l.slice(ind.length);
    const d = next.length - l.length;
    if (i === 0 && start > ls + ind.length) s = Math.max(ls + ind.length, start + d);
    e += d;
    return next;
  });
  return { text: text.slice(0, ls) + out.join('\n') + text.slice(le), start: s, end: Math.max(s, e) };
}

/* ---------- 見本（どれもこのアプリのために書いたもの） ---------- */
export const EXAMPLES = [
  { id: 'first', name: '最初の一音', code: `# 最初の一音
# Ctrl+Enter で鳴らします。Esc で止めます。
# 音の名前（C4 など）や数を書き換えて、もう一度 Ctrl+Enter を押してみましょう。
# 鳴っている途中でも、次のくり返しの頭から新しい音に変わります。

tempo 100

loop はじめ {
  play C4 len 0.5
  rest 1
  play E4 len 0.5
  rest 1
  play G4 len 0.5
  rest 1
  play C5 len 1.5
  rest 1
}
` },
  { id: 'beat8', name: 'ドラムの 8 ビート', code: `# ドラムの 8 ビート
# sample で打楽器を鳴らします。kick はバスドラム、snare はスネア、hat はハイハットです。
# repeat 2 { ... } は、{ } の中を 2 回くり返します。
# 2 つの loop は同時に鳴ります。

tempo 112

loop ドラム {
  repeat 2 {
    sample kick
    sample hat amp 0.6
    rest 0.5
    sample hat amp 0.3
    rest 0.5
    sample snare
    sample hat amp 0.6
    rest 0.5
    sample hat amp 0.3
    rest 0.5
  }
}

# 2 小節に 1 回、終わりに開いたハイハットを足す
loop おかず {
  rest 7.5
  sample openhat amp 0.5
  rest 0.5
}
` },
  { id: 'chords', name: '和音とベース', code: `# 和音とベース
# chord は和音を鳴らします。major は明るい響き、minor は暗い響きです。
# set で名前を付けた並びを、cycle で 1 つずつ順に使います。

tempo 92
set 根音 = [C2 A1 F1 G1]

loop 和音 {
  synth pad
  chord C4 major len 3.8 amp 0.5
  rest 4
  chord A3 minor len 3.8 amp 0.5
  rest 4
  chord F3 major len 3.8 amp 0.5
  rest 4
  chord G3 major len 3.8 amp 0.5
  rest 4
}

loop ベース {
  synth saw
  fx lowpass 700
  set r = cycle 根音
  repeat 4 {
    play r len 0.4
    rest 0.5
    play r + 12 len 0.3 amp 0.6
    rest 0.5
  }
}
` },
  { id: 'random', name: 'ランダムな旋律', code: `# ランダムな旋律
# pick は並びの中から 1 つを選びます。scale C4 penta は、ド・レ・ミ・ソ・ラ・ド の並びです。
# seed の数を変えると、別の並びになります。同じ数なら、いつも同じ並びです。

tempo 126
seed 2026
set 音階 = scale C4 penta

loop 旋律 {
  synth pluck
  play pick 音階 len 0.3 amp rand 0.5 1
  rest 0.25
}

loop 拍子 {
  sample kick
  rest 1
  sample clap amp 0.6
  rest 1
}
` },
  { id: 'echo', name: 'エコー', code: `# エコー（こだま）
# fx echo は、その loop の音を少しずつ遅らせて重ねます。数は遅らせる拍の長さです。
# fx reverb は、広い部屋で鳴らしたような響きを足します。

tempo 96

loop ベル {
  synth bell
  fx echo 0.75
  play cycle [E5 G5 B5 D6] len 0.5 amp 0.7
  rest 2
}

loop 背景 {
  synth pad
  fx reverb 0.5
  chord E3 min7 len 7.5 amp 0.4
  rest 8
}
` },
  { id: 'count', name: '数えて変える', code: `# 数えて変える
# count は、その loop が何回目のくり返しか（0 から）を表します。
# % は割った余りです。count % 8 は 0, 1, 2 … 7 のあと 0 に戻ります。
# fx lowpass の数を count で変えると、音がだんだん明るくなります。

tempo 120

loop うねり {
  synth saw
  fx lowpass 300 + count % 8 * 400
  repeat 4 {
    play A2 len 0.2
    rest 0.25
    play A3 len 0.2 amp 0.5
    rest 0.25
  }
}

loop 刻み {
  sample hat amp 0.4
  rest 0.5
  sample rim amp 0.5 pan 0.4
  rest 0.5
}
` },
];

/* ---------- 説明書（ヘルプに出す。例はテストで解析できることを確かめる） ---------- */
export const REFERENCE = [
  { word: 'loop', text: 'くり返す流れを作ります。名前を付けて、{ } の中に命令を書きます。いくつ書いても同時に鳴ります。中には必ず rest が要ります。', example: 'loop drums {\n  sample kick\n  rest 1\n}' },
  { word: 'play', text: '音を鳴らします。高さは C4 のような音の名前か、60 のような数（MIDI の番号）です。[C4 E4 G4] と書くと同時に鳴ります。', example: '  play C4' },
  { word: 'rest', text: '拍の数だけ待ちます。待っている間も、前に鳴らした音は続きます。', example: '  rest 0.5' },
  { word: 'len amp pan', text: 'play・chord のあとに付けます。len は音の長さ（拍）、amp は大きさ（0〜4、1 がふつう）、pan は左右（-1 が左、1 が右）。', example: '  play C4 len 2 amp 0.5 pan -0.5' },
  { word: 'chord', text: `和音を鳴らします。種類: ${Object.keys(CHORDS).join(' ')}。`, example: '  chord A3 minor len 2' },
  { word: 'sample', text: `打楽器を鳴らします: ${Object.keys(SAMPLES).join(' ')}。amp と pan のほか、rate で高さと速さを変えます（2 で高く短く）。`, example: '  sample snare amp 0.7' },
  { word: 'synth', text: `音色を変えます: ${Object.keys(SYNTHS).join(' ')}。loop の外に書くと、全部の loop の初めの音色になります。play のあとに書くと、その音だけ変わります。`, example: '  synth saw\n  play C3 synth pluck' },
  { word: 'repeat', text: '{ } の中を、数の回数だけくり返します。', example: '  repeat 4 {\n    sample hat\n    rest 0.25\n  }' },
  { word: 'tempo', text: '速さを決めます。1 分間の拍の数（20〜300）です。書かなければ 120 です。loop の外に 1 回だけ書きます。', example: 'tempo 100' },
  { word: 'set', text: '名前に値を入れます。+ - * / %（割った余り）と ( ) で計算できます。音の名前は数として計算できます（C4 + 7 は G4）。', example: 'set root = C3 + 2' },
  { word: 'pick', text: '並びの中から 1 つを選びます。', example: '  play pick [C4 E4 G4]' },
  { word: 'cycle', text: '並びの中から、順に 1 つずつ使います。', example: '  play cycle [C4 E4 G4]' },
  { word: 'rand', text: '2 つの数の間の数を、でたらめに選びます。', example: '  play C4 amp rand 0.3 1' },
  { word: 'seed', text: '乱数の種です。種が同じなら、pick と rand はいつも同じ並びになります。', example: 'seed 7' },
  { word: 'scale', text: `音階を並びにします: ${Object.keys(SCALES).join(' ')}。`, example: '  play pick scale C4 minor' },
  { word: 'count', text: 'その loop が何回目のくり返しか（0 から）を表します。', example: '  play C4 + count % 12' },
  { word: 'fx', text: `その loop の音全体に効果を掛けます。loop のすぐ中に書きます: ${Object.entries(FX).map(([k, v]) => `${k}（${v[0]}）`).join('、')}。`, example: '  fx echo 0.75' },
  { word: '#', text: '# から行の終わりまでは、メモ（コメント）として読みません。', example: '  # ここはメモです' },
];
