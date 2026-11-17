// 同じファイルやフォルダを開いている窓を探す（窓を二重に開かないため）
import { normalize } from './path.mjs';

// アプリと場所の組を1つの文字列にする。場所が無ければ null（名前のない窓は重ならない）
export function openKey(app, path) {
  if (!app || !path) return null;
  return app + '\n' + normalize(path);
}

// wins の並びの先から、同じアプリで同じ場所を開いている窓を探す。無ければ null
// 窓の場所は win.args.path を見る（アプリの中で場所が変わると setArgs で書き換わる）
export function findWindow(wins, app, path) {
  const key = openKey(app, path);
  if (!key) return null;
  for (const w of wins) if (openKey(w.app, w.args && w.args.path) === key) return w;
  return null;
}
