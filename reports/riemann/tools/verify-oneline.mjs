// 1 行版のリーマン予想の証明（OneLineRH.lean）を、Lean を動かさずに確かめる。Node.js 18 以上
//   1. 1 行版を読み、文字列に詰められたファイルを自分で取り出す（ファイルには書かない）
//   2. 取り出した中身から git の識別子（SHA-1）を作り、元の証明（lsernau/grh-lean の grh-compact）の識別子と比べる
//   3. 検査を抜ける書き方（axiom・sorry・native_decide など）を、コメントを除いて探す
//   4. 証明している定理の述べ方と、Mathlib の RiemannHypothesis の定義を表示する
// 使い方: node reports/riemann/tools/verify-oneline.mjs [--file OneLineRH.lean]
//   --file を付けないときは GitHub から約 7.7 MB を読む（メモリの中だけで使い、保存しない）
import { readFileSync } from 'node:fs';
import { parseProofSources, gitBlobSha1, scanLean, SCAN_RULES } from '../js/oneline.mjs';

const MINIMAL = { repo: '1337isnot1337/riemann-hypothesis-minimal', commit: 'a035fea0c2d86e6f6dbcfc5a11e596daba2e0a7a', path: 'OneLineRH.lean' };
const UPSTREAM = { repo: 'lsernau/grh-lean', commit: '72fead102f663d5c7a407964a13dc0cf9d977207', dir: 'grh-compact/' };
const MATHLIB = { repo: 'leanprover-community/mathlib4', commit: '56a005855ea17e0b0958f73ec801ae140b0a1679', path: 'Mathlib/NumberTheory/LSeries/RiemannZeta.lean' };

const args = process.argv.slice(2);
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
const say = (s = '') => console.log(s);
const fmt = (n) => n.toLocaleString('ja-JP');

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'user-agent': 'verify-oneline', accept: as === 'json' ? 'application/vnd.github+json' : '*/*' } });
  if (!res.ok) throw new Error(`${url} を読めない（HTTP ${res.status}）`);
  return as === 'json' ? res.json() : res.text();
}

// 1. 1 行版を読む
const src = fileArg
  ? readFileSync(fileArg, 'utf8')
  : await get(`https://raw.githubusercontent.com/${MINIMAL.repo}/${MINIMAL.commit}/${MINIMAL.path}`);
const lineCount = src.split('\n').filter((l, i, a) => i < a.length - 1 || l !== '').length;
say(`■ 1 行版 ${fileArg ?? `${MINIMAL.repo}@${MINIMAL.commit.slice(0, 7)}/${MINIMAL.path}`}`);
say(`  大きさ ${fmt(Buffer.byteLength(src))} バイト、${fmt(lineCount)} 行、1 行目の幅 ${fmt([...src.split('\n')[0]].length)} 文字`);

const { entries, header, trailer, unknownEscapes } = parseProofSources(src);
say(`  取り出したファイル ${fmt(entries.length)} 個（知らないエスケープ ${unknownEscapes.length ? unknownEscapes.join(' ') : 'なし'}）`);
say(`  配列の前: ${header.trim()}`);
say(`  配列の後（書き出すプログラム）: ${trailer.trim().slice(0, 140)}…`);
const badPaths = entries.filter((e) => e.path.includes('..') || /^([/\\]|[A-Za-z]:)/.test(e.path)).map((e) => e.path);
say(`  フォルダの外へ書き出すパス（.. や絶対パス）: ${badPaths.length ? badPaths.join(', ') : 'なし'}`);

// 2. 元の証明と比べる
const tree = await get(`https://api.github.com/repos/${UPSTREAM.repo}/git/trees/${UPSTREAM.commit}?recursive=1`, 'json');
if (tree.truncated) throw new Error('ファイルの一覧が途中で切れた');
const upstream = new Map(tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith(UPSTREAM.dir)).map((t) => [t.path.slice(UPSTREAM.dir.length), t.sha]));
let same = 0;
const differ = [], extra = [];
for (const e of entries) {
  const want = upstream.get(e.path);
  if (!want) extra.push(e.path);
  else if (want === gitBlobSha1(Buffer.from(e.content, 'utf8'))) same++;
  else differ.push(e.path);
}
const missing = [...upstream.keys()].filter((p) => !entries.some((e) => e.path === p));
say();
say(`■ 元の証明 ${UPSTREAM.repo}@${UPSTREAM.commit.slice(0, 7)}/${UPSTREAM.dir} との比べ（git の識別子 SHA-1）`);
say(`  元の証明のファイル ${fmt(upstream.size)} 個のうち、中身が 1 バイトも違わないもの ${fmt(same)} 個`);
say(`  違うもの ${differ.length ? differ.join(', ') : 'なし'}／1 行版にだけあるもの ${extra.length ? extra.join(', ') : 'なし'}／1 行版に無いもの ${missing.length ? missing.join(', ') : 'なし'}`);
const leanFiles = entries.filter((e) => e.path.endsWith('.lean'));
const leanLines = leanFiles.reduce((n, e) => n + e.content.split('\n').length - (e.content.endsWith('\n') ? 1 : 0), 0);
const allChars = entries.reduce((n, e) => n + [...e.content].length, 0);
say(`  Lean のファイル ${fmt(leanFiles.length)} 個、合わせて ${fmt(leanLines)} 行。全ファイルの文字数 ${fmt(allChars)} 文字`);

// 3. 抜け道を探す
say();
say('■ 検査を抜ける書き方（コメントの中は数えない）');
const hits = scanLean(entries);
for (const [k, { what }] of Object.entries(SCAN_RULES)) {
  const h = hits[k];
  const where = h.length ? `（${[...new Set(h.map((x) => x.split(':')[0]))].join(', ')}）` : '';
  say(`  ${what}: ${h.length} か所${where}`);
}
const opts = {};
for (const e of leanFiles) for (const m of e.content.matchAll(/set_option\s+([\w.]+)/g)) opts[m[1]] = (opts[m[1]] || 0) + 1;
say(`  使っている set_option: ${Object.entries(opts).map(([k, v]) => `${k} ×${v}`).join('、') || 'なし'}`);
const lakefile = entries.find((e) => e.path === 'lakefile.toml')?.content ?? '';
say(`  lakefile.toml の Lean への引数: ${(/moreLeanArgs\s*=\s*(.*)/.exec(lakefile) || [, 'なし'])[1]}`);

// 4. 定理の述べ方
say();
say('■ 証明している定理（src/Main.lean）');
for (const l of entries.find((e) => e.path === 'src/Main.lean').content.split('\n')) if (/^theorem /.test(l)) say(`  ${l}`);
say();
say('■ 述べ方の定義（src/Statements.lean。import は Mathlib だけ）');
for (const l of entries.find((e) => e.path === 'src/Statements.lean').content.trimEnd().split('\n')) say(`  ${l}`);
const ml = await get(`https://raw.githubusercontent.com/${MATHLIB.repo}/${MATHLIB.commit}/${MATHLIB.path}`);
const mlLines = ml.split('\n');
const at = mlLines.findIndex((l) => l.startsWith('def RiemannHypothesis'));
say();
say(`■ Mathlib の RiemannHypothesis（${MATHLIB.repo}@${MATHLIB.commit.slice(0, 7)}/${MATHLIB.path}:${at + 1}）`);
for (const l of mlLines.slice(at - 3, at + 2)) say(`  ${l}`);

const okAll = same === upstream.size && !differ.length && !extra.length && !missing.length && !badPaths.length && !unknownEscapes.length
  && ['axiom', 'admit', 'nativeDecide', 'skipKernel', 'unsafe', 'syntax', 'eval', 'importOther'].every((k) => hits[k].length === 0)
  && hits.sorry.every((h) => h.startsWith('Challenge.lean:'));
say();
say(okAll
  ? '結果: 1 行版の中身は元の証明と同じで、検査を抜ける書き方は見つからなかった（sorry は比べ用の Challenge.lean にだけある）。'
  : '結果: 元の証明と違う所か、検査を抜ける書き方が見つかった。上の行を確かめること。');
process.exit(okAll ? 0 : 1);
