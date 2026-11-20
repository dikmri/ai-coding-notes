// 共有ページ（claude.ai の Artifact）として公開するための HTML を作る。
// 使い方: node tools/build-artifact.mjs  → build/artifact/index.html
// ・公開時に <!doctype>・<html>・<head>・<body> と文字コード・画面幅の指定が自動で付くので、それらを外す
// ・共有ページの印（window.DEKIRU_SHARED）を足す。画面側はこれを見て、保存を「コピー」に替えるなどする
// CSS・JS・項目ファイルは書き換えず、公開時に同じ相対パスで一緒に載せる
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1];
const body = /<body>([\s\S]*?)<\/body>/.exec(html)?.[1];
if (!head || !body) throw new Error('index.html から head と body を取り出せませんでした');

const headOut = head.split('\n')
  .filter((l) => !/<meta (charset|name="viewport"|name="color-scheme")/.test(l))
  .join('\n').trim();
// Future OS（os/）と実験レポート（reports/）は共有ページに載せないので、公開版へのリンクにする
const bodyOut = body.trim()
  .replace('href="os/"', 'href="https://dikmri.github.io/ai-coding-notes/os/" target="_blank" rel="noopener"')
  .replace('href="reports/"', 'href="https://dikmri.github.io/ai-coding-notes/reports/" target="_blank" rel="noopener"');
const out = `${headOut}\n<script>window.DEKIRU_SHARED = true;</script>\n${bodyOut}\n`;

const outDir = join(ROOT, 'build', 'artifact');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), out);

// 一緒に載せるファイルの一覧（公開時の files 指定に使う）
const files = ['css/site.css', ...readdirSync(join(ROOT, 'js')).map((f) => 'js/' + f), ...readdirSync(join(ROOT, 'entries')).map((f) => 'entries/' + f)]
  .filter((f) => /\.(js|css)$/.test(f));
const referenced = [...out.matchAll(/(?:src|href)="((?:css|js|entries)\/[^"]+)"/g)].map((m) => m[1]);
const missing = referenced.filter((f) => !files.includes(f));
if (missing.length) throw new Error('参照しているのに見つからないファイル: ' + missing.join(', '));
// 項目が開いたときだけ読む大きなデータ（data/）も載せる。ページからは直接参照しないので、一覧に足す
const dataFiles = existsSync(join(ROOT, 'data')) ? readdirSync(join(ROOT, 'data')).filter((f) => f.endsWith('.js')).map((f) => 'data/' + f) : [];
// 一覧のカードの静止画（tools/thumbs.mjs が作るシート）も、画面の JS が目録 js/thumbs.js から組み立てて読むので、一覧に足す
const thumbFiles = existsSync(join(ROOT, 'thumbs')) ? readdirSync(join(ROOT, 'thumbs')).filter((f) => f.endsWith('.webp')).map((f) => 'thumbs/' + f) : [];
const all = [...referenced, ...dataFiles, ...thumbFiles];
writeFileSync(join(outDir, 'files.json'), JSON.stringify(Object.fromEntries(all.map((f) => [f, f])), null, 2));
console.log(`build/artifact/index.html を作りました（${(out.length / 1024).toFixed(1)} KB、一緒に載せるファイル ${all.length} 個。うちデータ ${dataFiles.length} 個、静止画 ${thumbFiles.length} 個）`);
