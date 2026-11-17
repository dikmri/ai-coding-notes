// 画像と音のビューア: 画像は実際の大きさ・窓に合わせる・拡大縮小、WAV は再生
import { basename, extname } from '../core/path.mjs';

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm } = os;
  const path = args.path;
  if (!path) { const p = await os.fileDialog({ mode: 'open', dir: '/画像', exts: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.wav'], typeLabel: '画像と音' }); if (!p) return null; return launch(os, { path: p }, rect); }
  const blob = await fs.readBlob(path), url = URL.createObjectURL(blob), isWav = extname(path).toLowerCase() === '.wav';
  let zoom = 1, fit = true;
  const win = wm.open({
    app: 'viewer', icon: 'icons/viewer.svg', className: 'app-viewer', title: `${basename(path)} - 画像と音のビューア`, w: isWav ? 380 : 520, h: isWav ? 220 : 420, ...rect, args: { path },
    render(w) {
      w.body.innerHTML = `<div class="menu-bar" role="menubar">
        <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu"><div class="menu-item" data-command="open"><span class="label">開く(<u>O</u>)...</span></div><div class="menu-item" data-command="paint"${isWav ? ' aria-disabled="true"' : ''}><span class="label">お絵かきで編集(<u>D</u>)</span></div><div class="menu-item" data-command="wall"${isWav ? ' aria-disabled="true"' : ''}><span class="label">壁紙にする(<u>W</u>)</span></div><div class="menu-separator"></div><div class="menu-item" data-command="export"><span class="label">パソコンへ書き出す(<u>E</u>)</span></div><div class="menu-separator"></div><div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div></div></div>
        <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu"><div class="menu-item radio checked" data-radio="z" data-command="fit"${isWav ? ' aria-disabled="true"' : ''}><span class="label">窓に合わせる(<u>W</u>)</span></div><div class="menu-item radio" data-radio="z" data-command="actual"${isWav ? ' aria-disabled="true"' : ''}><span class="label">実際の大きさ(<u>A</u>)</span></div><div class="menu-separator"></div><div class="menu-item" data-command="in"${isWav ? ' aria-disabled="true"' : ''}><span class="label">拡大(<u>I</u>)</span><span class="shortcut">+</span></div><div class="menu-item" data-command="out"${isWav ? ' aria-disabled="true"' : ''}><span class="label">縮小(<u>O</u>)</span><span class="shortcut">-</span></div></div></div>
        <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu"><div class="menu-item" data-command="about"><span class="label">ビューアについて(<u>A</u>)</span></div></div></div></div>
        <div class="view-area fit" tabindex="0">${isWav ? '<audio controls></audio>' : '<img alt="">'}</div>
        <div class="status-bar"><div class="status-field" data-info></div><div class="status-field" style="width:120px" data-size></div><div class="status-field" style="width:70px" data-zoom></div><div class="size-grip"></div></div>`;
    },
  });
  win.cleanup = () => URL.revokeObjectURL(url);
  const area = win.body.querySelector('.view-area'), media = area.firstElementChild, st = (k, v) => { win.body.querySelector(`[data-${k}]`).textContent = v; };
  media.src = url;
  st('size', fs.human(blob.size));
  if (isWav) media.addEventListener('loadedmetadata', () => st('info', `長さ ${media.duration.toFixed(2)} 秒`));
  else media.addEventListener('load', () => { st('info', `${media.naturalWidth} × ${media.naturalHeight} 画素`); apply(); });
  function apply() {
    area.classList.toggle('fit', fit);
    media.style.width = fit ? '' : media.naturalWidth * zoom + 'px';
    st('zoom', fit ? '合わせる' : Math.round(zoom * 100) + '%');
  }
  const cmds = {
    open: async () => { const p = await os.fileDialog({ mode: 'open', dir: '/画像', exts: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.wav'], typeLabel: '画像と音' }); if (p) os.openFile(p, 'viewer'); },
    export: () => { const a = document.createElement('a'); a.href = url; a.download = basename(path); a.click(); },
    close: () => win.close(),
    paint: () => { if (!isWav) os.openFile(path, 'paint'); },
    wall: () => { if (isWav) return; os.saveSettings({ wallpaper: 'file:' + path }); os.log('viewer.wallpaper', { path }, 'ok'); },
    fit: () => { fit = true; apply(); }, actual: () => { fit = false; zoom = 1; apply(); },
    in: () => { fit = false; zoom = Math.min(16, zoom * 1.25); apply(); }, out: () => { fit = false; zoom = Math.max(0.05, zoom / 1.25); apply(); },
    about: () => os.msgbox({ title: 'ビューアについて', icon: 'info', text: 'Future OS 画像と音のビューア 1.0\n\nPNG・JPEG・GIF・SVG・WebP の画像と、WAV の音を表示します。' }),
  };
  win.body.addEventListener('w95:command', (e) => cmds[e.detail.command]?.());
  area.addEventListener('keydown', (e) => { if (e.key === '+') cmds.in(); if (e.key === '-') cmds.out(); });
  win.body.addEventListener('fos:drop-file', (e) => os.openFile(e.detail.path));
  return win;
}
