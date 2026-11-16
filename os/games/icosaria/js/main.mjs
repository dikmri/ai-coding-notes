// 蒼海と白柱のイコサリア: データを読み、題名の画面とゲームを回す。
// 320×180 の画面に描いてから整数倍にくっきり拡大し、文字は拡大後の画面に描く。
import { makeGfx } from './gfx.mjs';
import { makeAudio } from './audio.mjs';
import { makeInput } from './input.mjs';
import { makeWorld, VIEW_W, VIEW_H } from './world.mjs';
import { makeUi } from './ui.mjs';
// 水晶の形は Future OS の起動の演出と同じ計算を使う
import { icosahedron, rotX, rotY } from '../../../js/core/boot-math.mjs';
const ICO = icosahedron();

const log = (...a) => (window.dlog || (() => {}))(...a);
const FONT = '"Hiragino Kaku Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif';
const screen = document.getElementById('screen'), sg = screen.getContext('2d');
const low = document.createElement('canvas'); low.width = VIEW_W; low.height = VIEW_H;
const lg = low.getContext('2d');
let scale = 3;

async function load(name, fallback) {
  try { const r = await fetch('data/' + name, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  catch (e) { log('rpg.load', { name }, 'error: ' + e.message); return fallback; }
}

function fit() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  scale = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
  // 小さい窓では整数倍に収まらないので、少しだけ縮めた拡大も許す
  const css = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H) < 1 ? Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H) : scale;
  screen.style.width = VIEW_W * css + 'px'; screen.style.height = VIEW_H * css + 'px';
  screen.width = Math.round(VIEW_W * css * dpr); screen.height = Math.round(VIEW_H * css * dpr);
  scale = (VIEW_W * css * dpr) / VIEW_W;
}

const [game, maps, sprites, music, sfx] = await Promise.all([load('game.json', null), load('maps.json', null), load('sprites.json', { sprites: {} }), load('music.json', { tracks: [] }), load('sfx.json', { sfx: [] })]);
if (!game || !maps) {
  document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:auto 0 40%;text-align:center">ゲームのデータを読み込めませんでした。手元のサーバーで開いてください。</p>');
  throw new Error('data');
}
const gfx = makeGfx(sprites);
const audio = makeAudio(music, sfx);
const input = makeInput(window);
const ui = makeUi({ gfx, audio, canvas: screen });
const world = makeWorld({ gfx, audio, data: game, maps, ui });
ui.attach(world);
fit(); addEventListener('resize', fit);
log('rpg.boot', { sprites: Object.keys(sprites.sprites || {}).length, tracks: (music.tracks || []).length, sfx: (sfx.sfx || []).length }, 'ok');

// ---- 題名の画面 ----
let scene = 'title', choice = 0;
const titleTrack = () => audio.trackIds().find((id) => /title|horizon|水平/i.test(id)) || audio.trackIds()[0];
const unlock = () => { if (!audio.ready) { audio.unlock(); audio.playMusic(titleTrack()); } };
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
function drawTitle(t) {
  const g = lg;
  const sky = g.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#4a3b6e'); sky.addColorStop(0.45, '#bd6e92'); sky.addColorStop(0.62, '#ffc4b8'); sky.addColorStop(0.63, '#28a8a8'); sky.addColorStop(1, '#0d4f5c');
  g.fillStyle = sky; g.fillRect(0, 0, VIEW_W, VIEW_H);
  // 夕陽と海のきらめき
  g.fillStyle = '#ffe478'; g.beginPath(); g.arc(VIEW_W / 2, 112, 22, Math.PI, 0); g.fill();
  for (let i = 0; i < 40; i++) { const y = 116 + (i % 10) * 6, x = (i * 53 + t / 30) % VIEW_W; g.fillStyle = 'rgba(247,249,252,0.7)'; g.fillRect(x, y, 6 - (i % 3) * 2, 1); }
  // 遠くの島と柱
  g.fillStyle = '#535075';
  for (const [x, w] of [[30, 50], [250, 60]]) { g.fillRect(x, 108, w, 6); for (let k = 0; k < 4; k++) g.fillRect(x + 6 + k * (w / 4), 92, 4, 16); g.fillRect(x + 3, 90, w - 6, 3); }
  // 浮かぶ二十面体の水晶（面を奥から塗る）
  const cx = VIEW_W / 2, cy = 60 + Math.sin(t / 700) * 3, r = 17, cols = ['#b2f2e8', '#f299a9', '#ffe478', '#cfaeff'];
  const glow = g.createRadialGradient(cx, cy, 2, cx, cy, 34); glow.addColorStop(0, 'rgba(255,255,255,0.6)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.fillRect(cx - 34, cy - 34, 68, 68);
  const faces = ICO.f.map((f, i) => { const P = f.map((k) => rotX(rotY(ICO.v[k], t / 1300), 0.4)); return { P, z: (P[0][2] + P[1][2] + P[2][2]) / 3, i }; }).sort((a, b) => b.z - a.z);
  for (const f of faces) {
    const [a, b, c] = f.P, nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (nz > 0) continue;
    g.beginPath(); f.P.forEach((p, k) => (k ? g.lineTo(cx + p[0] * r, cy - p[1] * r) : g.moveTo(cx + p[0] * r, cy - p[1] * r))); g.closePath();
    g.fillStyle = cols[f.i % 4]; g.globalAlpha = 0.92; g.fill(); g.globalAlpha = 1; g.strokeStyle = '#f7f9fc'; g.stroke();
  }
  // 勇者の後ろ姿
  if (gfx.has('hero-up', 'idle-0')) g.drawImage(gfx.get('hero-up', 'idle-' + (Math.floor(t / 600) % 2)), VIEW_W / 2 - 8, 140);
}
function drawTitleText(g, s, t) {
  const W = VIEW_W * s;
  const text = (str, x, y, size, col, align = 'center', bold = true) => { g.font = `${bold ? 900 : 400} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'top'; g.lineWidth = Math.max(2, size / 5); g.strokeStyle = '#141322'; g.strokeText(str, x, y); g.fillStyle = col; g.fillText(str, x, y); };
  text('蒼海と白柱のイコサリア', W / 2, 10 * s, 16 * s, '#f7f9fc');
  text('ICOSARIA — TIDES OF THE TWENTY FACES', W / 2, 30 * s, 5 * s, '#b2f2e8', 'center', false);
  const items = world.hasSave() ? ['つづきから', 'はじめから'] : ['はじめから'];
  choice = Math.min(choice, items.length - 1);
  items.forEach((it, i) => text((i === choice ? '▶ ' : '　') + it, W / 2, (84 + i * 12) * s, 8 * s, i === choice ? '#ffe478' : '#f7f9fc'));
  text(audio.ready ? '↑↓ で選び、Enter か J で決める' : 'キーを押すかクリックすると音が鳴ります', W / 2, 162 * s, 4.5 * s, '#dce0ed', 'center', false);
  text('FUTURE OS // ARCADIA-91 付属ソフト', W / 2, 170 * s, 4 * s, '#b5b4cc', 'center', false);
  return items;
}

// ---- 毎コマ ----
let last = performance.now(), acc = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  input.poll();
  if (scene === 'title') {
    drawTitle(t);
    blit();
    const items = drawTitleText(sg, scale, t);
    if (input.take('up') || input.take('down')) { choice = (choice + 1) % items.length; audio.sfx('menu_move'); }
    if (input.take('interact') || input.take('attack')) {
      unlock(); audio.sfx('menu_ok');
      const pick = items[choice];
      scene = 'game';
      const opening = pick === 'つづきから' ? world.continueGame() : world.newGame();
      if (opening && opening.length) ui.say(opening.map((o) => ({ speaker: o.speaker, line: o.line })), () => ui.toast('東の石門から白砂の浜へ。Tab で調律盤（装備と煌刻術）'));
      input.clear();
    }
    input.clear();
  } else {
    if (!ui.advance(input)) {
      acc += dt;
      while (acc >= 1 / 60) { world.update(1 / 60, input); acc -= 1 / 60; }
    } else acc = 0;
    world.draw(lg);
    blit();
    ui.draw(sg, scale, input);
  }
  requestAnimationFrame(frame);
}
function blit() {
  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.imageSmoothingEnabled = false;
  sg.drawImage(low, 0, 0, screen.width, screen.height);
}
if (/debug/.test(location.search)) window.__icosaria = { world, audio, ui };
addEventListener('error', (e) => log('rpg.error', { msg: String(e.message).slice(0, 200) }, 'error'));
requestAnimationFrame(frame);
