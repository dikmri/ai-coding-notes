// Gemini（Antigravity CLI の agy）にレビューを頼む道具。agy には読むだけの権限しか渡していない
// （~/.gemini/antigravity-cli/settings.json で write_file・command などを禁止）。直すのは Claude 側で行う。
//
// 使い方（プロジェクトの直下で）:
//   node tools/gemini-review.mjs diff [git の範囲] [-- パス...]   … 差分のレビュー（範囲を省くと、最後のコミットからの変更）
//   node tools/gemini-review.mjs files <ファイル...>               … ファイル全体のレビューとリファクタリング案
//   node tools/gemini-review.mjs visual <画像...>                  … 画面写真の見た目のレビュー
//   付け足し: --focus "見てほしい点"  --model モデル名  --name 保存名
// 結果: build/reviews/<日時>-<種類>.md（と .json）。記録: logs/gemini.log
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'tools/gemini-review.config.json'), 'utf8'));
const AGY = process.env.AGY_PATH || [join(process.env.LOCALAPPDATA || '', 'agy/bin/agy.exe')].find((p) => p && existsSync(p)) || 'agy';
const LOG = join(ROOT, 'logs/gemini.log');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function log(event, args, result) {
  mkdirSync(dirname(LOG), { recursive: true });
  appendFileSync(LOG, `${new Date().toISOString()} ${event} args=${JSON.stringify(args)} result=${typeof result === 'string' ? result : JSON.stringify(result)}\n`);
}
function parseArgs(argv) {
  const o = { mode: argv[0], rest: [], focus: '', model: CONFIG.model, name: '' };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--focus') o.focus = argv[++i] || '';
    else if (a === '--model') o.model = argv[++i] || o.model;
    else if (a === '--name') o.name = argv[++i] || '';
    else o.rest.push(a);
  }
  return o;
}
const COMMON = `あなたはこのプロジェクトのレビュー担当です。ファイルを書き換えたり、コマンドを実行したりしないでください（権限もありません）。指摘だけを返してください。
プロジェクトの前提:
- 「出来る！HTML/CSS/JavaScript」は、ライブラリやフレームワークを使わず、素の HTML・CSS・JavaScript だけで作る図鑑と、その中の Web の OS「Future OS」（os/ の下）。
- 画面の文字は日本語。キーボードだけでも操作でき、読み上げにも配慮する。古いブラウザ向けの回避策より、今の Web の標準の機能を使う。
- Future OS の窓の中は Windows 95/98 の決まり（灰色の面、2px の立体枠、MS UI Gothic 12px、メニューバーとアクセスキー、動きを付けない）に従う。起動画面・壁紙・音だけはレトロフューチャー。
指摘のしかた:
- 本当に直すべきものだけを、重さ（高・中・低）を付けて挙げる。好みの問題や、根拠のない推測は挙げない。
- 根拠となる箇所（ファイルと行、または画面のどこか）を具体的に書く。確かでないものは confidence を「要確認」にする。
- 指摘が無ければ findings を空にする。summary と各項目は日本語で書く。`;

function gitDiff(range, paths) {
  const args = ['diff', '--no-color', '--stat', '-p', range || 'HEAD~1', ...(paths.length ? ['--', ...paths] : [])];
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function buildPrompt(o) {
  const inDir = join(ROOT, 'runtime/review-input');
  mkdirSync(inDir, { recursive: true });
  if (o.mode === 'diff') {
    const sep = o.rest.indexOf('--'), range = sep === 0 ? '' : o.rest[0] || '', paths = sep >= 0 ? o.rest.slice(sep + 1) : o.rest.slice(1);
    const diff = gitDiff(range, paths);
    if (!diff.trim()) throw new Error('差分がありません');
    const file = join(inDir, `${stamp}.diff`);
    writeFileSync(file, diff);
    return { prompt: `${COMMON}\n\n依頼: 差分ファイル ${relative(ROOT, file).replace(/\\/g, '/')} を読み、変更点をレビューしてください。必要なら変更されたファイルの全体も読んでかまいません。不具合・見落とした場合分け・アクセシビリティ・性能・保守のしやすさを見てください。${o.focus ? '\n特に見てほしい点: ' + o.focus : ''}`, inputs: [file] };
  }
  if (o.mode === 'files') {
    if (!o.rest.length) throw new Error('ファイルを指定してください');
    return { prompt: `${COMMON}\n\n依頼: 次のファイルを読み、不具合と、読みやすさ・重複・分け方のリファクタリング案を挙げてください。大きな作り直しより、効果の大きい小さな改善を優先してください。\n${o.rest.map((f) => '- ' + f.replace(/\\/g, '/')).join('\n')}${o.focus ? '\n特に見てほしい点: ' + o.focus : ''}`, inputs: o.rest };
  }
  if (o.mode === 'visual') {
    if (!o.rest.length) throw new Error('画像を指定してください');
    return { prompt: `${COMMON}\n\n依頼: 次の画面写真を開いて見て、見た目の問題を挙げてください。位置や大きさのずれ、重なり、はみ出し、文字の読みにくさ（大きさ・色の差）、そろっていない余白、意図していなさそうな色、壊れた表示を探してください。file にはその画像のファイル名を、problem には画面のどのあたりかを書いてください。\n${o.rest.map((f) => '- ' + f.replace(/\\/g, '/')).join('\n')}${o.focus ? '\n特に見てほしい点: ' + o.focus : ''}`, inputs: o.rest };
  }
  throw new Error('種類は diff・files・visual のどれかです');
}
function runAgy(prompt, model) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'json', '--model', model, '--print-timeout', CONFIG.timeout || '10m', '--json-schema', join(ROOT, 'tools/gemini-review.schema.json')];
    const ch = spawn(AGY, args, { cwd: ROOT, windowsHide: true });
    let out = '', err = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { err += d; });
    ch.on('error', reject);
    ch.on('close', (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(`agy が終了コード ${code} で止まりました: ${err.slice(0, 500) || out.slice(0, 500)}`))));
  });
}
function toMarkdown(o, res, data) {
  const rows = (data.findings || []).map((f, i) => `### ${i + 1}. [${f.severity}] ${f.category}（${f.confidence}）\n- 場所: \`${f.file}${f.line ? ':' + f.line : ''}\`\n- 問題: ${f.problem}\n- 直し方: ${f.suggestion}\n`);
  return `# Gemini のレビュー（${o.mode}）\n\n- 日時: ${new Date().toISOString()}\n- モデル: ${o.model}\n- 対象: ${o.rest.join(' ') || '(最後のコミットからの変更)'}\n- 時間: ${res.duration_seconds ? res.duration_seconds.toFixed(1) + ' 秒' : '-'} ・ トークン: ${res.usage ? res.usage.total_tokens : '-'}\n\n## まとめ\n\n${data.summary || ''}\n\n## 指摘（${(data.findings || []).length} 件）\n\n${rows.join('\n') || '指摘はありません。\n'}`;
}

const o = parseArgs(process.argv.slice(2));
const t0 = Date.now();
try {
  const { prompt, inputs } = buildPrompt(o);
  log('gemini.request', { mode: o.mode, model: o.model, inputs: inputs.map((p) => relative(ROOT, p).replace(/\\/g, '/') || p) }, 'start');
  const { out, err } = await runAgy(prompt, o.model);
  const res = JSON.parse(out.slice(out.indexOf('{')));
  if (res.status !== 'SUCCESS') throw new Error('agy の状態: ' + res.status + ' ' + (res.error || err).toString().slice(0, 300));
  let data;
  try { data = typeof res.response === 'string' ? JSON.parse(res.response) : res.response; } catch { data = { summary: String(res.response), findings: [] }; }
  const dir = join(ROOT, 'build/reviews'), base = `${stamp}-${o.name || o.mode}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, base + '.json'), JSON.stringify({ request: { mode: o.mode, model: o.model, targets: o.rest, focus: o.focus }, result: res, data }, null, 2));
  writeFileSync(join(dir, base + '.md'), toMarkdown(o, res, data));
  const counts = { 高: 0, 中: 0, 低: 0 };
  for (const f of data.findings || []) counts[f.severity] = (counts[f.severity] || 0) + 1;
  log('gemini.response', { mode: o.mode, model: o.model, file: `build/reviews/${base}.md`, sec: Math.round((Date.now() - t0) / 1000), tokens: res.usage && res.usage.total_tokens }, counts);
  console.log(`保存: build/reviews/${base}.md`);
  console.log(`指摘: 高 ${counts.高} ・ 中 ${counts.中} ・ 低 ${counts.低}`);
} catch (e) {
  log('gemini.error', { mode: o.mode, model: o.model, sec: Math.round((Date.now() - t0) / 1000) }, 'error: ' + e.message);
  console.error('失敗: ' + e.message);
  process.exit(1);
}
