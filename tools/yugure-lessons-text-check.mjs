// 講座の課の文（lesson.md）を機械で点検する道具。人が読む前に、写し間違いと形の崩れを拾う。
//   - 見出しが決まった順に並んでいるか（場面・今回の目標・手順・しくみ・答え合わせ・変えてみよう・次回への引き）
//   - 「手順」のコードの行が、その課の終わりの状態のファイルのどこかに同じ行としてあるか（写し間違い）
//   - 「答え合わせ」の箇条書きが、lesson.json の checks の label と同じか
//   - 使わない書き方（ダッシュ、定型の結び、リンクや画像、HTML のタグを地の文に書く）
//   - 長さ（地の文とコードを合わせた字数）
// 使い方: node tools/yugure-lessons-text-check.mjs [課の id ...]   結果は logs/lessons-text-check.json と画面
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { composeState } from '../os/js/core/course.mjs';

const ROOT = join(import.meta.dirname, '..');
const LESSONS = join(ROOT, 'os', 'course', 'yugure', 'lessons');
function readTree(dir) {
  const files = {};
  if (!existsSync(dir)) return files;
  const walk = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else files[relative(dir, f).split(sep).join('/')] = readFileSync(f, 'utf8'); } };
  walk(dir);
  return files;
}
const course = JSON.parse(readFileSync(join(LESSONS, 'course.json'), 'utf8'));
const order = course.parts.flatMap((p) => p.lessons.map((l) => l.id));
const lessons = order.map((id) => ({ id, meta: JSON.parse(readFileSync(join(LESSONS, id, 'lesson.json'), 'utf8')), start: readTree(join(LESSONS, id, 'start')), end: readTree(join(LESSONS, id, 'end')) }));
const only = process.argv.slice(2);
const HEADINGS = ['場面', '今回の目標', '手順', 'しくみ', '答え合わせ', '変えてみよう', '次回への引き'];
const BANNED = [[/——|――/, 'ダッシュ'], [/いかがでしたか|いかがでしたでしょうか|参考になれば/, '定型の結び'], [/ここで重要なのは|結論から言うと/, '意味のない前置き'], [/\]\(|!\[/, 'リンクか画像の書き方'], [/腹落ち|解像度を上げ|肌感|温度感|手触り/, 'あいまいな流行語'], [/命を吹き込/, '比喩的な動詞']];
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const report = [];
for (let i = 0; i < lessons.length; i++) {
  const l = lessons[i];
  if (only.length && !only.includes(l.id)) continue;
  const file = join(LESSONS, l.id, 'lesson.md');
  if (!existsSync(file)) { report.push({ id: l.id, missing: true }); console.log(`-- ${l.id} まだ無い`); continue; }
  const md = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const issues = [], notes = [];
  // 見出し
  const first = md.split('\n')[0];
  if (!first.startsWith(`# ${l.id} `)) issues.push(`1 行目が「# ${l.id} 題名」でない: ${first}`);
  if (first.startsWith(`# ${l.id} `) && first.slice(l.id.length + 3).trim() !== l.meta.title) notes.push(`題名が lesson.json（${l.meta.title}）と違う: ${first}`);
  const h2 = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  if (h2.join('|') !== HEADINGS.join('|')) issues.push(`## の見出しの並びが違う: ${h2.join('・')}`);
  // 節ごとに分ける
  const sections = {};
  let cur = '';
  for (const line of md.split('\n')) { const m = /^## (.+)$/.exec(line); if (m) { cur = m[1].trim(); sections[cur] = []; } else if (cur) sections[cur].push(line); }
  // 手順のコード
  const state = composeState(lessons, i, 'end');
  const allLines = new Set(Object.values(state).flatMap((t) => t.split('\n').map(norm)).filter(Boolean));
  const steps = (sections['手順'] || []).join('\n');
  let blocks = 0, badLines = [];
  for (const m of steps.matchAll(/```(\w*)\n([\s\S]*?)```/g)) {
    blocks++;
    for (const line of m[2].split('\n')) {
      const n = norm(line);
      if (!n || /^(…|\.\.\.|（略）|<!-- …|\/\/ …|\/\* … \*\/)$/.test(n)) continue;
      if (!allLines.has(n)) badLines.push(n);
    }
  }
  if (!blocks && Object.keys(l.end).length) notes.push('手順にコードの塊が無い');
  if (badLines.length) issues.push(`手順のコードで、終わりの状態に無い行 ${badLines.length} 行: ${badLines.slice(0, 6).map((x) => `「${x}」`).join(' ')}`);
  // 答え合わせ
  const listed = (sections['答え合わせ'] || []).filter((x) => /^- /.test(x)).map((x) => norm(x.slice(2)));
  const labels = l.meta.checks.map((c) => norm(c.label));
  const missingLabels = labels.filter((x) => !listed.includes(x));
  if (missingLabels.length) issues.push(`答え合わせに無い確かめの文: ${missingLabels.map((x) => `「${x}」`).join(' ')}`);
  // 変えてみよう
  const tries = (sections['変えてみよう'] || []).join('\n');
  const tryCount = (tries.match(/^### /gm) || []).length, answers = (tries.match(/^:::answer\s*$/gm) || []).length;
  if (tryCount < 2) notes.push(`変えてみようが ${tryCount} 個`);
  if (answers < tryCount) notes.push(`変えてみようの答えの箱が足りない（${answers} / ${tryCount}）`);
  if ((md.match(/^:::answer\s*$/gm) || []).length !== (md.match(/^:::\s*$/gm) || []).length) issues.push(':::answer と ::: の数が合わない');
  // 書き方
  const prose = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  for (const [re, what] of BANNED) { const m = prose.match(re); if (m) issues.push(`${what}: 「${m[0]}」`); }
  const tag = prose.match(/<[a-zA-Z][^>]*>/);
  if (tag) issues.push(`地の文に HTML のタグ: ${tag[0]}`);
  // 長い文（句点で区切って 80 字を超えるもの）
  const longs = prose.split('\n').filter((x) => !/^(#|\||- |\d+\. |> |:::)/.test(x)).flatMap((x) => x.split(/(?<=[。！？])/)).map((x) => x.trim()).filter((x) => x.length > 80);
  if (longs.length) notes.push(`80 字を超える文 ${longs.length} 個: 「${longs[0].slice(0, 40)}…」`);
  const chars = md.length;
  if (chars < 1000 && !l.id.startsWith('0-')) notes.push(`短い（${chars} 字）`);
  if (chars > 6000) notes.push(`長い（${chars} 字）`);
  report.push({ id: l.id, chars, blocks, issues, notes });
  console.log(`${issues.length ? 'NG' : 'OK'} ${l.id} ${chars} 字 コード ${blocks} 個${issues.length ? '\n   ' + issues.join('\n   ') : ''}${notes.length ? '\n   （気になる所）' + notes.join(' / ') : ''}`);
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'lessons-text-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.issues?.length).length, missing = report.filter((r) => r.missing).length;
console.log(JSON.stringify({ lessons: report.length, withIssues: bad, missing }));
