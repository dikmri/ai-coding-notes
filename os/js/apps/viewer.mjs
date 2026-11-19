// 画像と音と動画のビューア: 画像は実際の大きさ・窓に合わせる・拡大縮小、音（WAV）と動画（WebM・MP4 など）は再生する
// 動画と同じ名前の .vtt（WebVTT）が同じフォルダにあれば、字幕として読み込む
import { basename, extname } from '../core/path.mjs';

const IMAGE = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'], AUDIO = ['.wav'], VIDEO = ['.webm', '.mp4', '.m4v', '.ogv'];
const OPEN_EXTS = [...IMAGE, ...AUDIO, ...VIDEO];
// 写真の現像が開ける画像（写真の現像は JPEG・PNG・WebP を扱う）
const DEVELOP = ['.png', '.jpg', '.jpeg', '.webp'];
const kindOf = (p) => { const x = extname(p).toLowerCase(); return VIDEO.includes(x) ? 'video' : AUDIO.includes(x) ? 'audio' : 'image'; };

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm } = os;
  const path = args.path;
  if (!path) { const p = await os.fileDialog({ mode: 'open', dir: '/画像', exts: OPEN_EXTS, typeLabel: '画像・音・動画' }); if (!p) return null; return launch(os, { path: p }, rect); }
  const blob = await fs.readBlob(path), url = URL.createObjectURL(blob), kind = kindOf(path), isImage = kind === 'image';
  const canDevelop = DEVELOP.includes(extname(path).toLowerCase());
  const off = (on) => (on ? '' : ' aria-disabled="true"');
  let zoom = 1, fit = true, captionUrl = null;
  const size = { image: [520, 420], audio: [380, 220], video: [680, 460] }[kind];
  const win = wm.open({
    app: 'viewer', icon: 'icons/viewer.svg', className: 'app-viewer', title: `${basename(path)} - 画像と音のビューア`, w: size[0], h: size[1], ...rect, args: { path },
    render(w) {
      w.body.innerHTML = `<div class="menu-bar" role="menubar">
        <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu"><div class="menu-item" data-command="open"><span class="label">開く(<u>O</u>)...</span></div><div class="menu-item" data-command="paint"${off(isImage)}><span class="label">お絵かきで編集(<u>D</u>)</span></div><div class="menu-item" data-command="develop"${off(canDevelop)} data-status="写真の現像で、明るさや色を整えます。元の画像は書き換えません。"><span class="label">写真の現像で開く(<u>R</u>)</span></div><div class="menu-item" data-command="wall"${off(isImage)}><span class="label">壁紙にする(<u>W</u>)</span></div><div class="menu-separator"></div><div class="menu-item" data-command="export"><span class="label">パソコンへ書き出す(<u>E</u>)</span></div><div class="menu-separator"></div><div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div></div></div>
        <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu"><div class="menu-item radio checked" data-radio="z" data-command="fit"${off(isImage)}><span class="label">窓に合わせる(<u>W</u>)</span></div><div class="menu-item radio" data-radio="z" data-command="actual"${off(isImage)}><span class="label">実際の大きさ(<u>A</u>)</span></div><div class="menu-separator"></div><div class="menu-item" data-command="in"${off(isImage)}><span class="label">拡大(<u>I</u>)</span><span class="shortcut">+</span></div><div class="menu-item" data-command="out"${off(isImage)}><span class="label">縮小(<u>O</u>)</span><span class="shortcut">-</span></div></div></div>
        <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu"><div class="menu-item" data-command="about"><span class="label">ビューアについて(<u>A</u>)</span></div></div></div></div>
        <div class="view-area fit" tabindex="0">${kind === 'video' ? `<video controls playsinline aria-label="${os.esc(basename(path))}"></video>` : kind === 'audio' ? '<audio controls></audio>' : '<img alt="">'}</div>
        <div class="status-bar"><div class="status-field" data-info></div><div class="status-field" style="width:120px" data-size></div><div class="status-field" style="width:70px" data-zoom></div><div class="size-grip"></div></div>`;
    },
  });
  win.cleanup = () => { URL.revokeObjectURL(url); if (captionUrl) URL.revokeObjectURL(captionUrl); };
  const area = win.body.querySelector('.view-area'), media = area.firstElementChild, st = (k, v) => { win.body.querySelector(`[data-${k}]`).textContent = v; };
  st('size', fs.human(blob.size));
  if (kind === 'video') {
    // 字幕: 同じフォルダの「同じ名前.vtt」
    const vtt = path.slice(0, path.length - extname(path).length) + '.vtt';
    if (await fs.exists(vtt).catch(() => false)) {
      captionUrl = URL.createObjectURL(new Blob([await fs.readBlob(vtt)], { type: 'text/vtt' }));
      const track = document.createElement('track');
      Object.assign(track, { kind: 'captions', src: captionUrl, srclang: 'ja', label: '日本語', default: true });
      media.append(track);
    }
    media.addEventListener('loadedmetadata', () => st('info', `${media.videoWidth} × ${media.videoHeight} ・ 長さ ${Number.isFinite(media.duration) ? media.duration.toFixed(2) + ' 秒' : '不明'}${captionUrl ? ' ・ 字幕あり' : ''}`));
    media.addEventListener('error', () => { st('info', 'この動画はこのブラウザで再生できません'); os.log('viewer.video', { path }, 'error: ' + (media.error?.message || media.error?.code)); });
    st('zoom', '');
    os.log('viewer.video', { path, captions: !!captionUrl }, 'ok');
  } else if (kind === 'audio') media.addEventListener('loadedmetadata', () => st('info', `長さ ${media.duration.toFixed(2)} 秒`));
  else media.addEventListener('load', () => { st('info', `${media.naturalWidth} × ${media.naturalHeight} 画素`); apply(); });
  media.src = url;
  function apply() {
    area.classList.toggle('fit', fit);
    media.style.width = fit ? '' : media.naturalWidth * zoom + 'px';
    st('zoom', fit ? '合わせる' : Math.round(zoom * 100) + '%');
  }
  const cmds = {
    open: async () => { const p = await os.fileDialog({ mode: 'open', dir: '/画像', exts: OPEN_EXTS, typeLabel: '画像・音・動画' }); if (p) os.openFile(p, 'viewer'); },
    export: () => { const a = document.createElement('a'); a.href = url; a.download = basename(path); a.click(); },
    close: () => win.close(),
    paint: () => { if (isImage) os.openFile(path, 'paint'); },
    develop: () => { if (!canDevelop) return; os.launch('photo', { path }); os.log('viewer.develop', { path }, 'ok'); },
    wall: () => { if (!isImage) return; os.saveSettings({ wallpaper: 'file:' + path }); os.log('viewer.wallpaper', { path }, 'ok'); },
    fit: () => { if (isImage) { fit = true; apply(); } }, actual: () => { if (isImage) { fit = false; zoom = 1; apply(); } },
    in: () => { if (isImage) { fit = false; zoom = Math.min(16, zoom * 1.25); apply(); } }, out: () => { if (isImage) { fit = false; zoom = Math.max(0.05, zoom / 1.25); apply(); } },
    about: () => os.msgbox({ title: 'ビューアについて', icon: 'info', text: 'Future OS 画像と音のビューア 1.1\n\nPNG・JPEG・GIF・SVG・WebP の画像、WAV の音、WebM・MP4 などの動画を表示します。\n動画と同じ名前の .vtt のファイルが同じフォルダにあれば、字幕として出します。' }),
  };
  win.body.addEventListener('w95:command', (e) => cmds[e.detail.command]?.());
  area.addEventListener('keydown', (e) => { if (e.key === '+') cmds.in(); if (e.key === '-') cmds.out(); });
  win.body.addEventListener('fos:drop-file', (e) => os.openFile(e.detail.path));
  return win;
}
