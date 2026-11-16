// 設定: 画面・音・ドライブ・バージョン情報。OK・キャンセル・適用で反映する
import { WALLPAPERS, drawWallpaper } from '../boot.mjs';

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm } = os;
  const open = wm.list().find((w) => w.app === 'settings');
  if (open) { open.focus(); return open; }
  const cur = os.getSettings();
  let draft = { ...cur };
  const win = wm.open({
    app: 'settings', icon: 'icons/settings.svg', className: 'dialog app-settings', title: '設定', w: 460, h: 430, resizable: false, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="window-body"><div class="tabs">
        <div class="tab-list" role="tablist"><button type="button" class="tab" aria-selected="true">画面</button><button type="button" class="tab">音</button><button type="button" class="tab">ドライブ</button><button type="button" class="tab">バージョン情報</button></div>
        <div class="tab-page"><div class="row" style="gap:11px;align-items:flex-start">
          <div class="col"><label for="wl">壁紙(<u>W</u>):</label><select id="wl" size="6" class="wall-list">${WALLPAPERS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
          <div class="col"><span>見本:</span><canvas class="preview" width="160" height="100"></canvas></div></div>
          <fieldset style="margin-top:11px"><legend>起動</legend><label><input type="checkbox" id="skip"> 起動の演出を飛ばす(<u>S</u>)</label></fieldset></div>
        <div class="tab-page" hidden>
          <fieldset><legend>音量</legend><div class="row" style="gap:6px;align-items:center"><label for="vol">小</label><input type="range" id="vol" min="0" max="100" style="flex:1"><span>大</span></div>
          <label style="margin-top:6px"><input type="checkbox" id="mute"> 消音(<u>M</u>)</label></fieldset>
          <fieldset style="margin-top:11px"><legend>鳴らす音</legend><div class="col"><label><input type="checkbox" id="ui"> 操作するときの音(<u>O</u>)</label><label><input type="checkbox" id="keys"> キーを打つ音(<u>K</u>)</label></div></fieldset>
          <div class="button-row" style="justify-content:flex-start;margin-top:11px"><button type="button" data-test>試し聞き(<u>T</u>)</button><button type="button" data-test2>起動音(<u>B</u>)</button></div></div>
        <div class="tab-page" hidden>
          <fieldset><legend>仮想ドライブ（このブラウザの IndexedDB）</legend><div class="col" style="gap:6px">
          <div class="meter"><i data-meter></i></div><div data-usage>計算しています...</div><div data-count></div></div></fieldset>
          <fieldset style="margin-top:11px"><legend>初期状態に戻す</legend><p>仮想ドライブのファイルを全部消して、最初の見本だけの状態に戻します。元には戻せません。</p>
          <div class="button-row" style="justify-content:flex-start"><button type="button" data-wipe>全部消す(<u>D</u>)...</button></div></fieldset></div>
        <div class="tab-page" hidden><div class="msgbox-body" style="padding:6px 0"><img src="icons/logo.svg" alt="" width="48" height="48" style="image-rendering:pixelated"><div class="col" style="gap:6px">
          <b style="font-weight:400">Future OS 98.7 ・ 出来る！エディション</b>
          <span>見た目は90年代のパソコン、中身は気の利いた Web の OS です。</span>
          <span>ライブラリを使わず、HTML・CSS・JavaScript だけで作っています。</span>
          <span data-ua></span><a href="../" target="_blank" rel="noopener">図鑑「出来る！HTML/CSS/JavaScript」</a></div></div></div>
      </div>
      <div class="button-row"><button type="button" class="default" data-ok>OK</button><button type="button" data-cancel>キャンセル</button><button type="button" data-apply disabled>適用(<u>A</u>)</button></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s), apply = q('[data-apply]');
  const prev = q('.preview');
  const sync = () => {
    q('#wl').value = draft.wallpaper; q('#skip').checked = draft.skipBoot; q('#vol').value = Math.round(draft.volume * 100);
    q('#mute').checked = draft.mute; q('#ui').checked = draft.ui; q('#keys').checked = draft.keys;
    prev.style.width = '160px'; prev.style.height = '100px'; drawWallpaper(prev, draft.wallpaper);
  };
  const change = (patch) => { draft = { ...draft, ...patch }; apply.disabled = false; sync(); };
  q('#wl').addEventListener('change', (e) => change({ wallpaper: e.target.value }));
  q('#skip').addEventListener('change', (e) => change({ skipBoot: e.target.checked }));
  q('#vol').addEventListener('input', (e) => change({ volume: e.target.value / 100 }));
  q('#mute').addEventListener('change', (e) => change({ mute: e.target.checked }));
  q('#ui').addEventListener('change', (e) => change({ ui: e.target.checked }));
  q('#keys').addEventListener('change', (e) => change({ keys: e.target.checked }));
  const tryWith = (name) => { const keep = os.getSettings(); os.sound.configure({ volume: draft.volume, mute: draft.mute, ui: true }); os.sound.play(name); os.sound.configure(keep); };
  q('[data-test]').addEventListener('click', () => tryWith('notify'));
  q('[data-test2]').addEventListener('click', () => tryWith('startup'));
  q('[data-apply]').addEventListener('click', () => { os.saveSettings(draft); apply.disabled = true; });
  q('[data-ok]').addEventListener('click', () => { os.saveSettings(draft); win.close(true); });
  q('[data-cancel]').addEventListener('click', () => win.close(true));
  q('[data-wipe]').addEventListener('click', async () => {
    const a = await os.msgbox({ title: '設定', text: '仮想ドライブのファイルを全部消して、最初の状態に戻します。\n\n元には戻せません。続けますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
    if (a !== 'はい') return;
    for (const w of wm.list()) if (w !== win) await w.close(true);
    await fs.wipe();
    const { seed } = await import('../samples.mjs');
    await seed(fs);
    os.sound.play('trash');
    usage();
  });
  async function usage() {
    const u = await fs.usage(), keys = await fs.walk('/');
    let files = 0, bytes = 0;
    for (const p of keys) { const s = await fs.stat(p); if (s && s.kind === 'file') { files++; bytes += s.size; } }
    q('[data-usage]').textContent = `使っている量: ${fs.human(u.usage)}　空き: ${u.quota ? fs.human(u.quota - u.usage) : '不明'}`;
    q('[data-count]').textContent = `ファイル ${files} 個、合計 ${fs.human(bytes)}（フォルダ ${keys.length - files} 個）`;
    q('[data-meter]').style.width = u.quota ? Math.max(1, (u.usage / u.quota) * 100) + '%' : '1%';
  }
  q('[data-ua]').textContent = `動いている所: ${navigator.userAgentData?.brands?.map((b) => b.brand).filter((b) => !/Not/.test(b)).join(' / ') || navigator.userAgent.split(') ').pop()}`;
  sync(); usage();
  if (typeof args.tab === 'number') { const t = win.body.querySelectorAll('.tab')[args.tab]; if (t) w95.selectTab(t); }
  return win;
}
