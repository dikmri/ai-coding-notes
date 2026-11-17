// 作ったアプリ（コードの作業場で OS に登録したもの）を、OS の窓として開く。
// 中身は作業場のプレビューと同じく、allow-same-origin を付けない sandbox の iframe で動かす。
// window.arcadia の setTitle は窓の題名、setStatus は窓の状態の帯になる。誤りは状態の帯とログに出す。
import { createHost, build, walk, loadRegistry } from '../userhost.mjs';

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log } = os;
  const id = String(args.id || '');
  const app = (await loadRegistry(fs)).find((r) => r.id === id);
  if (!app) throw new Error(`「${id}」は登録されていません。コードの作業場で「OS に登録」を押してください`);
  if (!(await fs.exists(app.root))) throw new Error(`プロジェクトのフォルダ「${app.root}」が見つかりません`);
  const files = await walk(fs, app.root);
  let entry = `${app.root}/${app.entry || 'index.html'}`;
  const win = wm.open({
    app: 'user:' + id, icon: 'icons/userapp.svg', className: 'app-user', title: app.name, w: app.w || 640, h: app.h || 480, ...rect, args: { id },
    render(w) {
      w.body.innerHTML = `<div class="ua-main"><iframe class="ua-frame" sandbox="allow-scripts allow-modals" aria-label="${os.esc(app.name)}"></iframe></div>
        <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="size-grip"></div></div>`;
    },
  });
  const status = (t, kind = '') => { const f = win.body.querySelector('.status-field[data-status]'); f.textContent = t; f.dataset.kind = kind; };
  const host = createHost(os, {
    root: app.root, dataName: id, entry: () => entry, files: () => files, readText: (p) => fs.readText(p),
    onConsole: (level, text) => { if (level === 'error') { status('誤り: ' + text.split('\n')[0].slice(0, 120), 'error'); log('userapp.error', { id }, 'error: ' + text.slice(0, 200)); } },
    onTitle: (t) => win.setTitle(t ? `${t} - ${app.name}` : app.name),
    onStatus: (t) => status(t),
    onNavigate: (p) => { entry = p; load(); },
  });
  async function load() {
    const built = await build(fs, app.root, entry, files);
    const f = document.createElement('iframe');
    f.className = 'ua-frame'; f.setAttribute('sandbox', 'allow-scripts allow-modals'); f.setAttribute('aria-label', app.name);
    win.body.querySelector('.ua-frame').replaceWith(f);
    host.attach(f); f.srcdoc = built.html;
    if (built.missing.length) status(`見つからないファイルがあります: ${built.missing.map((m) => m.slice(app.root.length + 1)).join('、')}`, 'error');
    log('userapp.run', { id, entry: entry.slice(app.root.length + 1), missing: built.missing.length }, 'ok');
  }
  win.cleanup = () => host.dispose();
  await load();
  return win;
}
