// 講座の課を、画面なしの Chrome で自動で確かめる道具。
// 課ごとに、終わりの状態で答え合わせが全部通るか、始めの状態で 1 つ以上通らないか（何もしなくても合格にならないか）を見る。
// プレビューの組み立ては OS の作業場と同じ（os/js/core/workshop.mjs の buildPreview）、答え合わせは os/js/core/course.mjs。
//
// 使い方: node tools/yugure-lessons-check.mjs [課の id ...]
//   結果は logs/lessons-check.json と、画面への 1 行ずつの表示

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPreview, RUNTIME } from '../os/js/core/workshop.mjs';
import { captureScript, checkerScript, composeState } from '../os/js/core/course.mjs';

const ROOT = join(import.meta.dirname, '..');
const LESSONS = join(ROOT, 'os', 'course', 'yugure', 'lessons');
const OUT = join(ROOT, 'build', 'lesson-check');
const { openChrome, sleep } = await import(pathToFileURL('D:/soft/agent-skills/real-webgpu-game/scripts/lib/chrome.mjs').href);

// フォルダの中のファイルを { 相対パス: 文字 } にする
function readTree(dir) {
  const files = {};
  if (!existsSync(dir)) return files;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[relative(dir, full).split(sep).join('/')] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return files;
}

const course = JSON.parse(readFileSync(join(LESSONS, 'course.json'), 'utf8'));
const order = course.parts.flatMap((p) => p.lessons.map((l) => l.id));
const lessons = order.map((id) => ({
  id,
  meta: JSON.parse(readFileSync(join(LESSONS, id, 'lesson.json'), 'utf8')),
  start: readTree(join(LESSONS, id, 'start')),
  end: readTree(join(LESSONS, id, 'end')),
}));
const only = process.argv.slice(2);

// 課の状態から、答え合わせのスクリプトを入れたプレビューの文書を作る
function previewHtml(files, lesson) {
  const root = course.project;
  const map = Object.fromEntries(Object.entries(files).map(([p, text]) => [`${root}/${p}`, { text }]));
  const built = buildPreview(map, root, `${root}/${lesson.meta.page}`, { runtime: captureScript() + RUNTIME });
  if (built.missing.length) throw new Error(`${lesson.id}: 見つからないファイル ${built.missing.join(', ')}`);
  const checker = checkerScript(lesson.meta.checks, root, files);
  // 置き換えは関数で渡す（文字で渡すと、確かめのスクリプトの中の $$ や $' が特別な意味になって壊れる）
  return /<\/body>/i.test(built.html) ? built.html.replace(/<\/body>/i, () => `${checker}</body>`) : built.html + checker;
}

mkdirSync(OUT, { recursive: true });
const chrome = await openChrome({ width: 1200, height: 900, gpuFlags: false });
const report = [];
let failures = 0;
try {
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    if (only.length && !only.includes(lesson.id)) continue;
    const row = { id: lesson.id, title: lesson.meta.title };
    for (const phase of ['end', 'start']) {
      const file = join(OUT, `${lesson.id}-${phase}.html`);
      writeFileSync(file, previewHtml(composeState(lessons, i, phase), lesson));
      await chrome.navigate(pathToFileURL(file).href);
      const results = await chrome.waitFor('window.__courseCheck', 30000, 100).catch(() => null);
      row[phase] = results ? results.map((r) => ({ label: r.label, ok: r.ok, ...(r.error ? { error: r.error } : {}) })) : 'timeout';
    }
    const endOk = Array.isArray(row.end) && row.end.every((r) => r.ok);
    const hasEnd = Object.keys(lesson.end).length > 0;
    const startFails = Array.isArray(row.start) && row.start.some((r) => !r.ok);
    row.ok = endOk && (!hasEnd || startFails);
    if (!row.ok) failures++;
    report.push(row);
    const bad = Array.isArray(row.end) ? row.end.filter((r) => !r.ok).map((r) => `${r.label}${r.error ? `（${r.error}）` : ''}`) : [row.end];
    console.log(`${row.ok ? 'OK ' : 'NG '} ${lesson.id} ${lesson.meta.title}${bad.length ? ' / 終わりで通らない: ' + bad.join('、') : ''}${hasEnd && !startFails ? ' / 始めの状態でも全部通ってしまう' : ''}`);
  }
} finally {
  await chrome.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'lessons-check.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ lessons: report.length, failures }));
process.exit(failures ? 1 : 0);
