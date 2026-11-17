// 起動の流れ: 電源ボタン → 起動の演出 → 仮想ドライブ → デスクトップ → 前回の窓を開き直す
import * as sound from './sound.mjs';
import * as fs from './fs.mjs';
import * as wm from './wm.mjs';
import { runBoot, drawWallpaper } from './boot.mjs';
import { seed } from './samples.mjs';
import * as shell from './shell.mjs';
import { parseShot } from './core/shot.mjs';

const $ = (s) => document.querySelector(s);
const log = (...a) => (window.dlog || (() => {}))(...a);
// 撮影用の入口（?shot=...）。電源と起動の場面を飛ばし、指定の窓だけを開く。前回の窓は開かず、窓の並びも保存しない
const shot = parseShot(location.search, Object.keys(shell.APPS));

async function info() {
  const u = await fs.usage();
  let webgl2 = false;
  try { webgl2 = !!document.createElement('canvas').getContext('webgl2'); } catch { /* 使えない */ }
  return {
    cores: navigator.hardwareConcurrency || 1,
    screen: `${screen.width}x${screen.height}`,
    dpr: +(devicePixelRatio || 1).toFixed(2),
    depth: screen.colorDepth || 24,
    rate: sound.context()?.sampleRate || 48000,
    webgl2,
    free: u.quota ? fs.human(u.quota - u.usage) : '不明',
    memKB: (navigator.deviceMemory || 64) * 1024,
  };
}

// 操作音: ボタン・メニュー・キー入力に、ひとつずつ音を付ける
function wireSounds() {
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // 自分で音を鳴らす部品（電卓のボタンなど）は、ここでは鳴らさない
    if (e.target.closest('button:not(:disabled), .menu-title, select, .tab') && !e.target.closest('[data-own-sound]')) sound.play('click');
  }, true);
  // チェックを入れる・外す音と、スライダーの刻みの音（値が 5% 動くごとに1回）
  document.addEventListener('change', (e) => { if (e.target.matches('input[type=checkbox], input[type=radio]')) sound.play(e.target.checked ? 'toggleOn' : 'toggleOff'); }, true);
  const lastTick = new WeakMap();
  document.addEventListener('input', (e) => {
    const r = e.target;
    if (!r.matches('input[type=range]')) return;
    const min = +r.min || 0, max = +r.max || 100, v = (r.value - min) / (max - min || 1);
    if (Math.abs(v - (lastTick.get(r) ?? -1)) < 0.05) return;
    lastTick.set(r, v); sound.play('tick', v);
  }, true);
  document.addEventListener('w95:command', () => sound.play('menu'));
  document.addEventListener('w95:select', () => sound.play('select'));
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.matches('textarea, input[type=text], input:not([type])') && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace')) sound.play('type');
  }, true);
}

async function start() {
  $('#power').hidden = true;
  if (shot) wm.setPersist(false);
  sound.unlock();
  const st = shell.getSettings();
  sound.configure({ volume: st.volume, mute: st.mute, ui: st.ui, keys: st.keys });
  // 起動の場面が始まる前に押された Esc も覚えておく（ドライブを開く間に押されると取りこぼすため）
  let early = false;
  const pre = (e) => { if (e.key === 'Escape') early = true; };
  addEventListener('keydown', pre, true);
  await fs.open();
  const inf = await info();
  removeEventListener('keydown', pre, true);
  log('os.boot', { skip: st.skipBoot, early }, 'start');
  if (shot) log('os.shot', { items: shot }, 'start');
  else if (!st.skipBoot && !early) await runBoot($('#boot'), inf);
  else sound.play('startup');
  $('#desk').hidden = false; $('#taskbar').hidden = false;
  drawWallpaper($('#wall'), st.wallpaper);
  const first = await seed(fs);
  shell.initDesktop();
  shell.initTaskbar();
  shell.initReminders();
  wireSounds();
  // AI の道具（MCP）からの操作を受け付ける設定なら、手元の配信の中継点へつなぐ（公開版では何もしない）
  try { if (JSON.parse(localStorage.getItem('fos-assistant') || '{}').mcp) import('./assistant/mcp.mjs').then((m) => m.start(shell.os)); } catch { /* 設定を読めない */ }
  // 前回開いていた窓を、同じ場所・同じファイルで開き直す
  for (const s of shot ? [] : wm.loadSession()) {
    const win = await shell.launch(s.app, s.args || {}, s.rect || {});
    if (!win) continue;
    if (s.rect) { Object.assign(win.el.style, { left: s.rect.x + 'px', top: s.rect.y + 'px', width: s.rect.w + 'px', height: s.rect.h + 'px' }); win.rect = { ...s.rect }; }
    if (s.max) wm.maximize(win, true);
    if (s.min) await wm.minimize(win);
  }
  if (shot) { for (const it of shot) await (it.path ? shell.openFile(it.path, it.app || undefined) : shell.launch(it.app)); }
  else if (first) shell.openFile('/ドキュメント/はじめに.txt');
  $('#icons').focus();
  log('os.boot', { first, windows: wm.list().length }, 'ok');
}

const boot = () => start().catch((e) => { log('os.boot', {}, 'error: ' + e.message); alert('起動できませんでした: ' + e.message); });
$('#powerBtn').addEventListener('click', boot);
if (shot) boot();
$('#rebootBtn').addEventListener('click', () => location.reload());
addEventListener('keydown', (e) => { if (!$('#power').hidden && e.key === 'Enter' && document.activeElement !== $('#powerBtn')) $('#powerBtn').click(); });
