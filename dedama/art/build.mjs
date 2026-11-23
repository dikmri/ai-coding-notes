// 絵をまとめて作る。node dedama/art/build.mjs [名前 ...]（名前を省くと全部）
// 結果（命令の数・時間・検証）は build/dedama-art.json に足す（レポートの数字に使う）。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildAsset, ROOT } from './lib.mjs';

const NAMES = ['hero', 'bust', 'doors', 'street', 'parlor', 'machines', 'meal-s', 'meal-a', 'meal-b', 'meal-c', 'meal-d', 'folks'];
const want = process.argv.slice(2).length ? process.argv.slice(2) : NAMES;
const logPath = join(ROOT, 'build', 'dedama-art.json');
mkdirSync(join(ROOT, 'build'), { recursive: true });
const record = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : {};

for (const name of want) {
  const mod = await import(`./assets/${name}.mjs`);
  const a = mod.asset;
  process.stdout.write(`${name} … `);
  const info = a.custom ? await a.custom() : buildAsset(a.name, a);
  record[name] = { ...info, at: new Date().toISOString() };
  console.log(`${info.ms} ms、命令 ${info.ops}、検証 ${info.validation?.ok ? 'ok' : JSON.stringify(info.validation)}、${(info.results || []).map((r) => `${r.out} ${r.w}x${r.h}`).join(' / ')}`);
}
writeFileSync(logPath, JSON.stringify(record, null, 2));
