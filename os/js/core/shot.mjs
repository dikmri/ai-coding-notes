// 撮影用の入口の読み取り。?shot=アプリ,アプリ:パス,パス のように書くと、電源と起動の場面を飛ばし、指定の窓を開いた状態にする。
// Gemini に画面写真を見せるとき（tools/shoot.mjs で撮るとき）に使う。shot が無ければ null を返す（ふつうの起動）。
// apps を渡すと、知らないアプリ名の項目を捨てる。
export function parseShot(search, apps = null) {
  const q = new URLSearchParams(search);
  if (!q.has('shot')) return null;
  const out = [];
  for (const raw of (q.get('shot') || '').split(',')) {
    const item = raw.trim();
    if (!item) continue;
    if (item.startsWith('/')) { out.push({ app: null, path: item }); continue; }
    const i = item.indexOf(':');
    const app = i < 0 ? item : item.slice(0, i);
    const path = i < 0 ? null : item.slice(i + 1) || null;
    if (apps && !apps.includes(app)) continue;
    out.push({ app, path });
  }
  return out;
}
