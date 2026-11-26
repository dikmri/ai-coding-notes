// 1 行版の Lean ファイル（OneLineRH.lean）を、Lean を動かさずに読むための部品。Node.js 用
//   parseProofSources … `def proofSources : Array (String × String) := #[("パス","中身"), …]` の文字列を取り出す
//   gitBlobSha1       … git がファイルの中身から作る識別子（blob の SHA-1）
//   scanLean          … 検査を抜ける書き方（axiom・sorry・native_decide など）をコメントを除いて探す
import { createHash } from 'node:crypto';

// Lean の文字列リテラルを s[i]（" の位置）から読む。対応: \n \t \r \\ \" \' \xHH \uHHHH、\ + 改行（次の行の先頭の空白ごと消える）
function readString(s, i, unknown) {
  if (s[i] !== '"') throw new SyntaxError(`${i} 文字目は文字列の始まりではない`);
  i++;
  let out = '';
  for (;;) {
    const ch = s[i];
    if (ch === undefined) throw new SyntaxError('文字列が閉じていない');
    if (ch === '"') return { value: out, end: i + 1 };
    if (ch !== '\\') { out += ch; i++; continue; }
    const e = s[i + 1];
    const simple = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'" };
    if (e in simple) { out += simple[e]; i += 2; }
    else if (e === 'x') { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 4), 16)); i += 4; }
    else if (e === 'u') { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16)); i += 6; }
    else if (e === '\n') { i += 2; while (s[i] === ' ' || s[i] === '\t') i++; }
    else { unknown.add(e); out += e; i += 2; }
  }
}

/**
 * @param {string} src OneLineRH.lean の全文
 * @returns {{ entries: {path: string, content: string}[], header: string, trailer: string, unknownEscapes: string[] }}
 *   header は配列より前（コメントと import と def の頭）、trailer は配列より後（書き出すプログラム）
 */
export function parseProofSources(src) {
  const head = 'def proofSources : Array (String × String) := #[';
  const start = src.indexOf(head);
  if (start < 0) throw new SyntaxError('proofSources の配列が見つからない');
  const unknown = new Set();
  const entries = [];
  let i = start + head.length;
  for (;;) {
    while (src[i] === ' ' || src[i] === ',' || src[i] === '\n') i++;
    if (src[i] === ']') { i++; break; }
    if (src[i] !== '(') throw new SyntaxError(`${i} 文字目に組の始まり ( がない`);
    const a = readString(src, i + 1, unknown);
    if (src[a.end] !== ',') throw new SyntaxError(`${a.end} 文字目にカンマがない`);
    const b = readString(src, a.end + 1, unknown);
    if (src[b.end] !== ')') throw new SyntaxError(`${b.end} 文字目に組の終わり ) がない`);
    entries.push({ path: a.value, content: b.value });
    i = b.end + 1;
  }
  return { entries, header: src.slice(0, start), trailer: src.slice(i), unknownEscapes: [...unknown] };
}

/** git の blob の識別子。`git hash-object <ファイル>` と同じ値 */
export function gitBlobSha1(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

// コメント（-- から行末、入れ子になる /- … -/）を空白に置き換える。行の数は変えない。文字列の中は飛ばす
function stripComments(text) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], d = text[i + 1];
    if (depth > 0) {
      if (c === '/' && d === '-') { depth++; out += '  '; i++; }
      else if (c === '-' && d === '/') { depth--; out += '  '; i++; }
      else out += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (c === '/' && d === '-') { depth = 1; out += '  '; i++; continue; }
    if (c === '-' && d === '-') { while (i < text.length && text[i] !== '\n') { out += ' '; i++; } i--; continue; }
    if (c === '"') {
      // 文字列は中身を残す（#eval の引数などを見落とさないため）。閉じる " まで進む
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
      continue;
    }
    out += c;
  }
  return out;
}

/** 探す書き方。どれも「証明を検査せずに通す」か「定理の意味を変える」ことができる */
export const SCAN_RULES = {
  axiom: { re: /^\s*(?:@\[[^\]]*\]\s*)?(?:(?:private|protected|noncomputable|unsafe)\s+)*axiom\b/, what: '公理の追加（axiom）' },
  sorry: { re: /\bsorry\b/, what: '証明の省略（sorry）' },
  admit: { re: /\badmit\b/, what: '証明の省略（admit）' },
  nativeDecide: { re: /native_decide|ofReduceBool|trustCompiler/, what: 'コンパイラの計算を信じる（native_decide）' },
  skipKernel: { re: /skipKernelTC|debug\.skip/, what: 'カーネルの検査を止める設定' },
  unsafe: { re: /implemented_by|@\[\s*extern\b|\bunsafe\b|^\s*(?:private\s+)?opaque\b/, what: '中身を差し替える指定（implemented_by・extern・unsafe・opaque）' },
  syntax: { re: /^\s*(?:@\[[^\]]*\]\s*)?(?:scoped\s+|local\s+|scoped\[[^\]]*\]\s+)?(?:notation\d*|macro|macro_rules|syntax|elab|elab_rules|infixl?|infixr|prefix|postfix)\b/, what: '記法や構文を作る命令' },
  eval: { re: /#eval|#exit|\brun_cmd\b|\brun_tac\b|\brun_elab\b|^\s*(?:builtin_)?initialize\b/, what: '読み込み時にプログラムを動かす命令' },
  importOther: { re: /^import\s+(?!Mathlib\b|Lib\.|New\.|Statements\b|Main\b)/, what: 'Mathlib とこの証明の外からの import' },
};

/**
 * @param {{path: string, content: string}[]} files
 * @returns {Record<keyof SCAN_RULES, string[]>} 規則ごとの「パス:行: 行の中身」
 */
export function scanLean(files) {
  const hits = Object.fromEntries(Object.keys(SCAN_RULES).map((k) => [k, []]));
  for (const f of files) {
    if (!f.path.endsWith('.lean')) continue;
    const lines = f.content.split('\n');
    const code = stripComments(f.content).split('\n');
    code.forEach((line, n) => {
      for (const [k, { re }] of Object.entries(SCAN_RULES)) {
        if (re.test(line)) hits[k].push(`${f.path}:${n + 1}: ${lines[n].trim().slice(0, 160)}`);
      }
    });
  }
  return hits;
}
