// Claude と Gemini が GitHub の issue と PR でやり取りするための道具。Gemini の返事を issue や PR のコメントにする。
// GitHub への書き込みは gh（利用者のログイン）で行う。コメントの先頭に「Gemini の…」と書き、利用者本人の発言と区別する。
//
// 使い方（リポジトリの中で）:
//   node tools/gemini-pr.mjs ideas [--count 3] [--area os|site] [--shot 画像 ...] [--dry]
//       … コンセプト資料・ソース・画面写真から案を出し、issue（ラベル gemini-idea）にする
//   node tools/gemini-pr.mjs review <PR番号> [--shot 画像 ...] [--media 音や動画 ...]
//       … PR の差分を見てレビューを書く。終了コード 0 は合格、3 は直してほしい点あり
//   node tools/gemini-pr.mjs japanese <ファイル ...> [--dry]
//       … 画面に出る日本語を点検し、直す案を issue（ラベル gemini-japanese）にする
// 依頼と返事は build/gemini/ に、呼んだ記録は logs/gemini.log に残る。
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative } from 'node:path';
import * as G from './lib/gemini-core.mjs';
import { ROOT, MAIN, OUT, CONFIG, interact, moneyLine, log, stamp } from './lib/gemini-client.mjs';

const gh = (args, input) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, input, maxBuffer: 64 * 1024 * 1024 });
const ghJson = (args) => JSON.parse(gh(args));
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
const MAX_BODY = 60000;

function brief() {
  const p = resolve(MAIN, CONFIG.brief);
  if (!existsSync(p)) throw new Error('コンセプト資料がありません: ' + p);
  return readFileSync(p, 'utf8').replace(/^---[\s\S]*?---\s*/, '');
}
const ROLE = (job) => `あなたは「Future OS」と図鑑サイト「出来る！HTML/CSS/JavaScript」の共同開発者で、${job}を受け持ちます。実装は Claude（別の AI）が行います。
下のコンセプト資料の決まり（見た目・技術・日本語の書き方）に従って判断してください。返事はすべて日本語で、指定された JSON の形だけを返してください。
文章は、誰が何をするのかが分かる平易な日本語で書き、比喩的な動詞や流行語を使わないでください。

===== コンセプト資料 =====
${brief()}
===== ここまで =====
`;

function sourceDump(dirs, exts = /\.(m?js|css|html)$/, cap = 900_000) {
  let out = '', files = [];
  const walk = (d) => {
    for (const n of readdirSync(join(ROOT, d))) {
      const p = join(d, n), st = statSync(join(ROOT, p));
      if (st.isDirectory()) walk(p);
      else if (exts.test(n)) files.push(p.replace(/\\/g, '/'));
    }
  };
  dirs.forEach(walk);
  for (const f of files) {
    const t = readFileSync(join(ROOT, f), 'utf8');
    if (out.length + t.length > cap) { out += `\n--- ${f}（大きすぎるため省略）---\n`; continue; }
    out += `\n--- ${f} ---\n${t}`;
  }
  return { out, files };
}
function opts(args, flags, multi = []) {
  const o = { rest: [] };
  for (const m of multi) o[m] = [];
  for (let i = 0; i < args.length; i++) {
    const f = args[i].startsWith('--') ? args[i].slice(2) : null;
    if (f && multi.includes(f)) o[f].push(args[++i]);
    else if (f && flags.includes(f)) o[f] = args[++i];
    else if (f === 'dry') o.dry = true;
    else o.rest.push(args[i]);
  }
  return o;
}
function ensureLabels() {
  for (const [name, color, desc] of [['gemini-idea', '1D76DB', 'Gemini の提案'], ['gemini-japanese', 'FBCA04', 'Gemini の日本語の点検'], ['area:os', 'C0C0C0', 'Future OS'], ['area:site', 'BFD4F2', '図鑑サイト']]) {
    try { gh(['label', 'create', name, '--color', color, '--description', desc, '--force']); } catch { /* 作れなくても先へ進む */ }
  }
}
function issueCreate(title, body, labels, dry) {
  if (dry) { console.log(`\n[作らずに表示] ${title}\n${body}\n`); return null; }
  const f = join(OUT, `${stamp()}-issue.md`);
  writeFileSync(f, body.slice(0, MAX_BODY));
  const url = gh(['issue', 'create', '--title', title, '--body-file', f, ...labels.flatMap((l) => ['--label', l])]).trim();
  log('gemini.issue.create', { title, labels }, url);
  return url;
}

// ---- 案出し ----
const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '50字以内の題名' },
          area: { type: 'string', enum: ['os', 'site'] },
          kind: { type: 'string', enum: ['feature', 'design', 'usability', 'sound', 'asset', 'fix'] },
          size: { type: 'string', enum: ['S', 'M'] },
          why: { type: 'string', description: '作者の目指すものとどうつながるか' },
          what: { type: 'string', description: '何をどう変えるか。触るファイルの見当も書く' },
          acceptance: { type: 'array', items: { type: 'string' }, description: 'できたと言える条件。画面や操作で確かめられる形' },
          assets: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, prompt: { type: 'string' } }, required: ['name', 'prompt'] }, description: '画像素材が要るときだけ。画像を作るための説明文' },
        },
        required: ['title', 'area', 'kind', 'size', 'why', 'what', 'acceptance'],
      },
    },
  },
  required: ['ideas'],
};
async function ideas(args) {
  const o = opts(args, ['count', 'area'], ['shot']);
  const count = +(o.count || 3), area = o.area || 'os';
  const known = ghJson(['issue', 'list', '--state', 'all', '--label', 'gemini-idea', '--limit', '60', '--json', 'number,title,state']);
  // 全部のソースを渡すと 12 万トークンを超え、考える過程で出力の上限に届く。ファイルの一覧と、骨組みのファイルの中身だけを渡す
  const tree = sourceDump(area === 'os' ? ['os'] : ['js', 'css'], /\.(m?js|css|html|svg)$/, 0).files;
  const core = area === 'os'
    ? ['os/index.html', 'os/css/future.css', ...readdirSync(join(ROOT, 'os/js')).filter((f) => f.endsWith('.mjs')).map((f) => 'os/js/' + f)]
    : ['index.html', 'js/app.js', 'css/site.css'];
  const src = `ファイルの一覧（大きさ）:\n${tree.map((f) => `${f}（${statSync(join(ROOT, f)).size} バイト）`).join('\n')}\n` + core.map((f) => `\n--- ${f} ---\n${readFileSync(join(ROOT, f), 'utf8')}`).join('');
  const text = `${ROLE('案出しとデザイン')}
作者の目指すものに近づくための改善案を、${count} 件出してください。対象は ${area === 'os' ? 'Future OS（os/ 以下）' : '図鑑サイト（index.html・js・css）'} です。
- 今あるものとの重なりを避けてください。下の「これまでの案」と同じものは出さないでください。
- 1件は1回の PR で終わる大きさ（S か M）にしてください。
- 画面写真が付いているときは、見た目の問題も拾ってください。
- 「見た目はおもちゃっぽいのに、使うと気が利いている」と感じる工夫を優先してください。

===== これまでの案（番号・状態・題名）=====
${known.map((i) => `#${i.number} ${i.state} ${i.title}`).join('\n') || 'なし'}

===== 今のソース =====
${src}`;
  const r = await interact({ model: CONFIG.models.ideas, text, targets: o.shot, thinking: CONFIG.thinking, responseFormat: { type: 'text', mime_type: 'application/json', schema: IDEAS_SCHEMA }, name: 'ideas' });
  const j = G.parseJson(r.text);
  if (!j || !Array.isArray(j.ideas)) throw new Error('案を読めませんでした: ' + r.text.slice(0, 300));
  if (!o.dry) ensureLabels();
  const day = G.localDay(r.entry.ts);
  for (const it of j.ideas.slice(0, count)) {
    const body = `<!-- gemini-idea -->
**Gemini の提案**（${CONFIG.models.ideas}・${day}）・ 種類: ${it.kind} ・ 大きさ: ${it.size}

### なぜ
${it.why}

### 何をするか
${it.what}

### できたと言える条件
${it.acceptance.map((a) => `- [ ] ${a}`).join('\n')}
${it.assets?.length ? `\n### 必要な画像素材\n${it.assets.map((a) => `- **${a.name}**: ${a.prompt}`).join('\n')}\n` : ''}
<sub>${moneyLine(r.usd, r.led)}（${j.ideas.length} 件分）</sub>`;
    const url = issueCreate(it.title, body, ['gemini-idea', 'area:' + it.area], o.dry);
    if (url) console.log(url + '  ' + it.title);
  }
  console.log(`--- ${moneyLine(r.usd, r.led)}`);
}

// ---- レビュー ----
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'changes'], description: '直さないと困る点（must）が無ければ approve' },
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['must', 'should', 'nit'] },
      file: { type: 'string' }, line: { type: 'integer' },
      problem: { type: 'string' }, suggestion: { type: 'string' },
    }, required: ['severity', 'file', 'problem', 'suggestion'] } },
    japanese: { type: 'array', items: { type: 'object', properties: {
      where: { type: 'string' }, before: { type: 'string' }, after: { type: 'string' }, reason: { type: 'string' },
    }, required: ['where', 'before', 'after', 'reason'] } },
    ideas: { type: 'array', items: { type: 'string' }, description: 'この PR の範囲の外で、次にやるとよいこと' },
  },
  required: ['verdict', 'summary', 'findings', 'japanese'],
};
const SEV = { must: '必ず', should: 'できれば', nit: '細かい点' };
async function review(args) {
  const o = opts(args, [], ['shot', 'media']);
  const n = o.rest[0];
  if (!/^\d+$/.test(n || '')) throw new Error('PR の番号を書いてください');
  const pr = ghJson(['pr', 'view', n, '--json', 'number,title,body,headRefName,headRefOid,baseRefName,files,url,comments']);
  const diff = gh(['pr', 'diff', n]);
  const rounds = pr.comments.filter((c) => c.body.includes('<!-- gemini-review')).length;
  const round = rounds + 1;
  // 変わったファイルの全体（PR の先頭の版）。消したファイルと大きすぎるものは除く
  let full = '';
  for (const f of pr.files) {
    if (!/\.(m?js|css|html|json|md)$/.test(f.path) || f.deletions > 0 && f.additions === 0) continue;
    try {
      const t = git(['show', `${pr.headRefOid}:${f.path}`]);
      if (full.length + t.length < 600_000) full += `\n--- ${f.path} ---\n${t}`;
    } catch { /* 手元に無い版 */ }
  }
  const linked = [...String(pr.body).matchAll(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)].map((m) => m[1]);
  let issues = '';
  for (const i of linked) { try { const is = ghJson(['issue', 'view', i, '--json', 'number,title,body']); issues += `\n#${is.number} ${is.title}\n${is.body}\n`; } catch { /* 無い */ } }
  const talk = pr.comments.slice(-10).map((c) => `【${c.body.includes('<!-- gemini-review') ? 'Gemini のレビュー' : c.body.includes('<!-- claude-reply') ? 'Claude の返事' : 'コメント'}】\n${c.body.slice(0, 6000)}`).join('\n\n');
  const text = `${ROLE('レビュー')}
PR #${pr.number}「${pr.title}」をレビューしてください。これは ${round} 回目のレビューです。
- この PR が目的（下の issue）を果たしているか、壊しているものが無いか、コンセプト資料の決まりに合っているかを見てください。
- 画面写真や音が付いているときは、見た目と音も判断してください。
- 画面に出る日本語に不自然なところがあれば japanese に書いてください。
- 前のレビューで Claude が「直さない」と理由を書いた点は、理由に納得できない場合だけ、もう一度書いてください。
- この PR の範囲の外の改善は findings に入れず、ideas に書いてください。
- 直さないと困る点（must）が無ければ verdict を approve にしてください。

===== PR の説明 =====
${pr.body}

===== 目的の issue =====
${issues || 'なし'}

===== これまでのやり取り =====
${talk || 'なし'}

===== 差分 =====
${diff.slice(0, 400_000)}

===== 変わったファイルの全体 =====
${full}`;
  const r = await interact({ model: CONFIG.models.review, text, targets: [...o.shot, ...o.media], thinking: CONFIG.thinking, responseFormat: { type: 'text', mime_type: 'application/json', schema: REVIEW_SCHEMA }, name: `review-pr${n}-r${round}` });
  const j = G.parseJson(r.text);
  if (!j || !j.verdict) throw new Error('レビューを読めませんでした: ' + r.text.slice(0, 300));
  const body = `<!-- gemini-review round=${round} verdict=${j.verdict} -->
### Gemini のレビュー（${round} 回目・${CONFIG.models.review}）

**判定: ${j.verdict === 'approve' ? '取り込んでよい' : '直してほしい点あり'}**

${j.summary}
${j.findings.length ? `\n| 重さ | 場所 | 問題 | 直し方の案 |\n|---|---|---|---|\n${j.findings.map((f) => `| ${SEV[f.severity] || f.severity} | \`${cell(f.file)}${f.line ? ':' + f.line : ''}\` | ${cell(f.problem)} | ${cell(f.suggestion)} |`).join('\n')}\n` : ''}${j.japanese.length ? `\n#### 日本語\n\n| 場所 | 今の文 | 案 | 理由 |\n|---|---|---|---|\n${j.japanese.map((x) => `| ${cell(x.where)} | ${cell(x.before)} | ${cell(x.after)} | ${cell(x.reason)} |`).join('\n')}\n` : ''}${j.ideas?.length ? `\n#### この PR の外で、次にやるとよいこと\n\n${j.ideas.map((x) => `- ${x}`).join('\n')}\n` : ''}
<sub>${moneyLine(r.usd, r.led)}</sub>`;
  const f = join(OUT, `${r.base}.md`);
  writeFileSync(f, body.slice(0, MAX_BODY));
  gh(['pr', 'comment', n, '--body-file', f]);
  log('gemini.pr.review', { pr: +n, round, findings: j.findings.length, japanese: j.japanese.length }, j.verdict);
  console.log(JSON.stringify({ pr: +n, round, verdict: j.verdict, summary: j.summary, findings: j.findings, japanese: j.japanese, ideas: j.ideas || [], saved: relative(MAIN, f).replace(/\\/g, '/') }, null, 2));
  console.log(`--- ${moneyLine(r.usd, r.led)}`);
  process.exitCode = j.verdict === 'approve' ? 0 : 3;
}

// ---- 日本語の点検 ----
const JA_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    items: { type: 'array', items: { type: 'object', properties: {
      file: { type: 'string' }, line: { type: 'integer' },
      before: { type: 'string', description: '今の文（そのまま写す）' }, after: { type: 'string', description: '直した文' },
      reason: { type: 'string' }, severity: { type: 'string', enum: ['must', 'should'] },
    }, required: ['file', 'before', 'after', 'reason', 'severity'] } },
  },
  required: ['summary', 'items'],
};
async function japanese(args) {
  const o = opts(args, []);
  if (!o.rest.length) throw new Error('点検するファイルを書いてください');
  let src = '';
  for (const f of o.rest) {
    const lines = readFileSync(resolve(f), 'utf8').split('\n');
    src += `\n--- ${f} ---\n` + lines.map((l, i) => `${i + 1}: ${l}`).join('\n');
  }
  const text = `${ROLE('日本語の点検')}
下のファイルのうち、画面に出る日本語（ボタン・メニュー・メッセージ・説明文・見出し）を点検してください。コードの識別子やコメントは対象外です。
- 誤字、文法の誤り、意味が通りにくい文、コンセプト資料の「画面の日本語の書き方」に合わない文を拾ってください。
- before には今の文をそのまま写し、after には直した文を書いてください。line は行番号です。
- 好みの違いだけのものは拾わないでください。誤りや読みにくさが明らかなものは must、直したほうがよいものは should にしてください。
${src}`;
  const r = await interact({ model: CONFIG.models.japanese, text, thinking: 'medium', responseFormat: { type: 'text', mime_type: 'application/json', schema: JA_SCHEMA }, name: 'japanese' });
  const j = G.parseJson(r.text);
  if (!j || !Array.isArray(j.items)) throw new Error('点検の結果を読めませんでした: ' + r.text.slice(0, 300));
  console.log(`${j.summary}（${j.items.length} 件）`);
  if (!j.items.length) { console.log(`--- ${moneyLine(r.usd, r.led)}`); return; }
  if (!o.dry) ensureLabels();
  const day = G.localDay(r.entry.ts);
  const body = `<!-- gemini-japanese -->
**Gemini の日本語の点検**（${CONFIG.models.japanese}・${day}）

対象: ${o.rest.map((f) => '`' + f + '`').join('、')}

${j.summary}

| 済 | 重さ | 場所 | 今の文 | 案 | 理由 |
|---|---|---|---|---|---|
${j.items.map((x) => `| ☐ | ${x.severity === 'must' ? '必ず' : 'できれば'} | \`${cell(x.file)}${x.line ? ':' + x.line : ''}\` | ${cell(x.before)} | ${cell(x.after)} | ${cell(x.reason)} |`).join('\n')}

<sub>${moneyLine(r.usd, r.led)}</sub>`;
  const url = issueCreate(`日本語の点検: ${o.rest.join('、').slice(0, 60)}（${j.items.length} 件）`, body, ['gemini-japanese', o.rest.some((f) => f.replace(/\\/g, '/').startsWith('os/')) ? 'area:os' : 'area:site'], o.dry);
  if (url) console.log(url);
  console.log(`--- ${moneyLine(r.usd, r.led)}`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'ideas') await ideas(rest);
  else if (cmd === 'review') await review(rest);
  else if (cmd === 'japanese') await japanese(rest);
  else { console.error('使い方: node tools/gemini-pr.mjs ideas [--count 3] [--shot 画像] / review <PR番号> [--shot 画像] / japanese <ファイル ...>'); process.exit(1); }
} catch (e) {
  log('gemini.pr.error', { cmd }, 'error: ' + e.message);
  console.error('失敗: ' + e.message);
  process.exit(1);
}
