// システム モニタの計算: フォルダごとの使用量、大きいファイル、割合、1秒あたりの描き直しの回数、窓の状態。
// 画面には触らない純粋な関数だけを置く（テストは tests/os-monitor.test.mjs）。

// entries: { path, kind, size } の並び。一番上のフォルダごとに合計して大きい順に並べる。一番上にじかに置いたファイルは1つにまとめる
export function folderUsage(entries) {
  const g = new Map();
  const get = (name, path) => { if (!g.has(path)) g.set(path, { name, path, bytes: 0, files: 0 }); return g.get(path); };
  for (const e of entries) {
    const parts = e.path.split('/').filter(Boolean);
    if (e.kind === 'dir') { if (parts.length === 1) get(parts[0], '/' + parts[0]); continue; }
    const row = parts.length === 1 ? get('（一番上のファイル）', '/') : get(parts[0], '/' + parts[0]);
    row.bytes += e.size || 0; row.files++;
  }
  return [...g.values()].sort((a, b) => b.bytes - a.bytes || b.files - a.files);
}
export const largest = (entries, n = 10) => entries.filter((e) => e.kind === 'file').sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, n);
export const percent = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
// 帯の幅（%）。0 でなければ、小さくても 1% は見せる
export const barWidth = (part, total) => (part > 0 ? Math.max(1, percent(part, total)) : 0);

// 描いた時刻を覚えて、直前の1秒に描いた回数を返す
export function fpsCounter() {
  let times = [];
  return {
    tick(t) { times.push(t); if (times.length > 400) times = times.slice(-240); },
    fps(now) { times = times.filter((x) => x > now - 1000 && x <= now); return times.length; },
  };
}
export const pushSample = (arr, v, max = 60) => [...arr, v].slice(-max);

export function winState(w, isActive) {
  if (w.min) return '最小化';
  if (w.max) return isActive ? '最大化（手前）' : '最大化';
  return isActive ? '手前' : 'ふつう';
}
