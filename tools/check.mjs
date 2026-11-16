// 図鑑の項目データを検査する。使い方: node tools/check.mjs
// ・必須項目（id / 分類 / 見出し / 読み / 説明 / コード）の有無
// ・読みがひらがなだけか
// ・デモ用 JS が単独のスクリプトとして構文エラーにならないか
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const listed = [...html.matchAll(/<script src="(entries\/[^"]+)"/g)].map((m) => m[1]);
const onDisk = readdirSync(join(ROOT, 'entries')).filter((f) => f.endsWith('.js')).map((f) => 'entries/' + f);

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sandbox, { filename: 'registry.js' });

const errors = [];
for (const f of onDisk) if (!listed.includes(f)) errors.push(`${f} が index.html に読み込まれていません`);
for (const f of listed) {
  try { vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), sandbox, { filename: f }); }
  catch (e) { errors.push(`${f} の読み込みに失敗: ${e.message}`); }
}
const D = sandbox.dekiru;
for (const p of D.problems) errors.push(`登録: ${p.msg}`);
const entries = D.finalize();
const cats = new Map();
for (const e of entries) {
  const where = `${e.id}（${e.t}）`;
  cats.set(e.c, (cats.get(e.c) || 0) + 1);
  if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(e.id)) errors.push(`${where}: id の形式`);
  if (!e.t) errors.push(`${where}: 見出しがない`);
  if (!e.y || !/^[ぁ-ゖー・ 　a-z0-9]+$/.test(e.y)) errors.push(`${where}: 読みはひらがなで（${e.y}）`);
  if (!e.d || e.d.length < 8) errors.push(`${where}: 説明が短い`);
  if (!Array.isArray(e.tags) || e.tags.length < 2) errors.push(`${where}: タグは2つ以上`);
  if (![1, 2, 3].includes(e.lv)) errors.push(`${where}: lv は 1〜3`);
  if (!e.src.html && !e.src.css && !e.src.js) errors.push(`${where}: コードがない`);
  if (e.src.js) {
    try { new vm.Script(e.src.js, { filename: e.id + '.js' }); }
    catch (err) { errors.push(`${where}: JS の構文エラー ${err.message}`); }
  }
  if (/<\/script/i.test(e.src.html)) errors.push(`${where}: HTML に script を書かず js に書く`);
  if (e.perm && !e.nt) errors.push(`${where}: perm の項目は nt も付ける`);
  // 今日の話題: 日付と出典（http/https の URL）を必ず持つ。外部のライブラリや CDN を読み込まない
  if (e.c === 'trend') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) errors.push(`${where}: date は "YYYY-MM-DD" で`);
    if (!/^tr-\d{8}-[a-z0-9-]+$/.test(e.id)) errors.push(`${where}: 話題の id は tr-YYYYMMDD-名前 で`);
    // 出典は refs に持つ（src は registry がコードの入れ物に使っている）
    if (!Array.isArray(e.refs) || !e.refs.length || !e.refs.every((s) => s && s.title && /^https?:\/\//.test(s.url))) errors.push(`${where}: refs に出典（title と url）を1つ以上`);
  }
  if (/<script[^>]+src=|<link[^>]+href=["']https?:|import\(\s*['"]https?:|from\s+['"]https?:/i.test(e.code)) errors.push(`${where}: 外部のファイルを読み込まない（ブラウザだけで作る）`);
  // メガデモ: 1ファイル全体が決めた上限のバイト数に収まること
  if (e.c === 'demo') {
    if (![256, 1024, 4096].includes(e.size)) errors.push(`${where}: size は 256・1024・4096 のどれか`);
    else { const n = D.utf8Bytes(D.miniHtml(e)); if (n > e.size) errors.push(`${where}: ${n} バイトで上限 ${e.size} を超えている`); }
  }
}

console.log(`項目数: ${entries.length}`);
console.log([...cats].map(([c, n]) => `${c}:${n}`).join('  '));
if (errors.length) {
  console.log(`\n問題 ${errors.length} 件`);
  for (const e of errors) console.log(' - ' + e);
  process.exit(1);
}
console.log('問題なし');
