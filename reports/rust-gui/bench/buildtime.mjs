// 3 つの版のビルド時間と、依存している crate の数を測る。ほかの重い処理と同時に走らせないこと。
// 使い方（プロジェクトの最上位で）: node reports/rust-gui/bench/buildtime.mjs [tauri,egui,gpui]
// 結果は reports/rust-gui/data/build-times.json に書く。
// crate のダウンロードは済んでいる前提で、コンパイルの時間だけを測る。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const R = (...p) => path.join(ROOT, ...p);
const OUT = R('reports/rust-gui/data/build-times.json');

const APPS = {
  tauri: { dir: 'reports/rust-gui/src/tauri-app/src-tauri', main: 'src/main.rs', release: ['tauri', 'build', '--no-bundle'], debug: ['tauri', 'build', '--debug', '--no-bundle'] },
  egui: { dir: 'reports/rust-gui/src/egui-app', main: 'src/main.rs', release: ['build', '--release'], debug: ['build'] },
  gpui: { dir: 'reports/rust-gui/src/gpui-app', main: 'src/main.rs', release: ['build', '--release'], debug: ['build'] },
};
const which = (process.argv[2] ?? 'tauri,egui,gpui').split(',');
const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

function cargo(app, args, targetDir) {
  const t0 = Date.now();
  const r = spawnSync('cargo', args, {
    cwd: R(APPS[app].dir),
    env: { ...process.env, CARGO_TARGET_DIR: targetDir },
    encoding: 'utf8',
    shell: false,
  });
  const sec = (Date.now() - t0) / 1000;
  if (r.status !== 0) throw new Error(`${app} ${args.join(' ')} failed\n${r.stderr.slice(-2000)}`);
  return sec;
}

for (const app of which) {
  const a = APPS[app];
  const out = (results[app] = { measuredAt: new Date().toISOString() });
  // 依存している crate の数（Windows で使うものだけ、重複を除く）
  const tree = spawnSync('cargo', ['tree', '-e', 'normal,build', '--prefix', 'none', '--target', 'x86_64-pc-windows-msvc'], {
    cwd: R(a.dir),
    encoding: 'utf8',
  });
  out.crates = new Set(tree.stdout.split('\n').map((l) => l.replace(/ \(\*\)$/, '').replace(/ \(proc-macro\)$/, '').trim()).filter(Boolean)).size;

  const rel = R(`runtime/rust-gui/bt/${app}-release`);
  fs.rmSync(rel, { recursive: true, force: true });
  out.cleanReleaseSec = cargo(app, a.release, rel);
  console.log(`${app}: clean release ${out.cleanReleaseSec}s`);

  const dbg = R(`runtime/rust-gui/bt/${app}-debug`);
  fs.rmSync(dbg, { recursive: true, force: true });
  out.cleanDebugSec = cargo(app, a.debug, dbg);
  console.log(`${app}: clean debug ${out.cleanDebugSec}s`);

  // 1 行足して、もう一度デバッグビルド。終わったら元に戻す
  const mainPath = path.join(R(a.dir), a.main);
  const orig = fs.readFileSync(mainPath, 'utf8');
  try {
    fs.writeFileSync(mainPath, orig + '\n// build-time probe\n');
    out.incrDebugSec = cargo(app, a.debug, dbg);
  } finally {
    fs.writeFileSync(mainPath, orig);
  }
  console.log(`${app}: incremental debug ${out.incrDebugSec}s, crates ${out.crates}`);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
}
console.log(JSON.stringify(results, null, 1));
