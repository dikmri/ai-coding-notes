// 「わたあめサテライト」の受信解析コンソール（2 版の画面）。1920×1080 の Canvas に、時刻 t だけで 1 コマを描く（状態を持たない）。
// 再生ページは音の時計の t、動画の撮影は 1/60 秒ずつの t で同じ関数を呼ぶので、同じ絵になる。
// 動かない部分（枠・目盛り・消えている LED）は最初に 1 回だけ別の Canvas に描いておき、毎コマ貼ってから動く部分を描く。
import { between, lastBefore, sectionAt, chordIndexAt } from './data.mjs';

export const W = 1920;
export const H = 1080;
export const MONO = '"JetBrains Mono", "IBM Plex Sans JP", ui-monospace, Consolas, monospace';
const JP = '"IBM Plex Sans JP", "Yu Gothic UI", Meiryo, sans-serif';
const fm = (size, w = 500) => `${w} ${size}px ${MONO}`;
const fj = (size, w = 500) => `${w} ${size}px ${JP}`;

const C = {
  bg: '#090B0E', panel: '#0D1014', line: '#252B33', grid: '#161B21', grid2: '#1D232A',
  text: '#D6DDE5', dim: '#7C8792', faint: '#38414B', off: '#141A20',
  acc: '#3FD0FF', accMid: '#2A8FB3', accDim: '#123A4A', amb: '#FFB21E', ambDim: '#5A3F0C', hot: '#FF4D5E', keys: '#A9B4BF',
};
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const sharp = (s) => s.replace(/#/g, '♯').replace('Bb', 'B♭').replace('b5', '♭5').replace('b9', '♭9');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const pad2 = (n) => String(n).padStart(2, '0');
const tc = (t) => { const s = Math.max(0, t); return `${pad2(Math.floor(s / 60))}:${pad2(Math.floor(s % 60))}.${pad2(Math.floor((s % 1) * 100))}`; };
export const STEMS = [
  ['kick', 'KICK', 'キック'], ['snare', 'SNR', 'スネア'], ['hats', 'HAT', 'ハイハット'], ['perc', 'PRC', 'シェイカー'], ['bass', 'BASS', 'ベース'],
  ['chords', 'CHRD', '和音'], ['lead', 'BELL', '鈴'], ['chops', 'VOX', '声'], ['keys', 'KEYS', '鍵盤'], ['fx', 'FX', '効果音'],
];
const DRUM_LANE = 34;
const SEC_CODE = { intro: 'INTRO', verse: 'VERSE', build1: 'BUILD', build2: 'BUILD', drop1: 'DROP', drop2: 'DROP', break: 'BREAK', outro: 'OUTRO' };

// ------------------------------------------------------------------ 配置（x, y, w, h）
const P = {
  spec: [24, 172, 600, 348], scope: [24, 536, 600, 224], stereo: [24, 776, 600, 284],
  notes: [640, 172, 640, 348], seq: [640, 536, 640, 224], harm: [640, 776, 640, 284],
  ch: [1296, 172, 600, 448], loud: [1296, 636, 600, 224], log: [1296, 876, 600, 184],
};
const TITLES = {
  spec: ['SPECTRUM', '周波数', '48 BANDS · 40 Hz – 14 kHz'], scope: ['OSCILLOSCOPE', '波形', 'L / R · 21 ms · TRIG ↑'],
  stereo: ['STEREO FIELD', '左右の広がり', 'M / S · CORRELATION'], notes: ['NOTE MONITOR', '音符', 'PITCH × TIME · −2.6 s / +1.4 s'],
  seq: ['SEQUENCER', 'リズム', ''], harm: ['HARMONY', '和音', 'KEY D MAJOR'],
  ch: ['CHANNELS', '楽器ごとの音量', '10 STEMS · REL dB'], loud: ['LOUDNESS', 'ラウドネス', 'ITU-R BS.1770 · LUFS'], log: ['DOWNLINK LOG', '受信の記録', 'EVENTS'],
};

function panelFrame(ctx, key) {
  const [x, y, w, h] = P[key];
  const [title, jp, info] = TITLES[key];
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // 角の印
  ctx.strokeStyle = C.dim;
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + 0.5 * dx, cy + 9 * dy);
    ctx.lineTo(cx + 0.5 * dx, cy + 0.5 * dy);
    ctx.lineTo(cx + 9 * dx, cy + 0.5 * dy);
    ctx.stroke();
  }
  ctx.fillStyle = C.acc;
  ctx.fillRect(x + 12, y + 12, 6, 6);
  ctx.fillStyle = C.text;
  ctx.font = fm(13, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, x + 26, y + 16);
  const tw = ctx.measureText(title).width;
  ctx.fillStyle = C.dim;
  ctx.font = fj(12, 500);
  ctx.fillText(jp, x + 34 + tw, y + 16);
  ctx.font = fm(11, 500);
  ctx.textAlign = 'right';
  ctx.fillText(info, x + w - 12, y + 16);
  ctx.strokeStyle = C.grid2;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 30.5);
  ctx.lineTo(x + w - 1, y + 30.5);
  ctx.stroke();
  ctx.textBaseline = 'alphabetic';
}

// ------------------------------------------------------------------ 本体
export function createStage(data, opt = {}) {
  const S = data.score;
  const BEAT = S.beat, BAR = S.bar, STEP = BEAT / 4, END = S.bars * BAR;
  const bandHz = S.levels.bandHz;
  const NB = data.nBands;
  const bandsBuf = new Float32Array(NB);
  const allChops = [...data.chops, ...data.harmony].sort((a, b) => a.t - b.t);
  const keysNotes = S.notes.keys;
  const chipNotes = S.notes.chip;
  const bassNotes = S.notes.bass;
  const snares = data.drums.snare.filter((d) => d.vel >= 0.5);
  const fx = data.fxBy;

  // 小節ごとのリズムの格子（16 分に丸める）
  const grid = [];
  const put = (list, row, minVel = 0) => {
    for (const e of list) {
      if ((e.vel ?? 1) < minVel || e.radio) continue;
      const b = Math.floor(e.t / BAR + 1e-6);
      const s = Math.round((e.t - b * BAR) / STEP);
      const bb = s >= 16 ? b + 1 : b, ss = s % 16;
      (grid[bb] ||= [[], [], [], [], []]);
      const cell = grid[bb][row].find((c) => c.s === ss);
      if (cell) cell.v = Math.max(cell.v, e.vel ?? 1); else grid[bb][row].push({ s: ss, v: e.vel ?? 1, t: e.t });
    }
  };
  put(data.chops, 0);
  put(data.drums.kick, 1);
  put(data.drums.snare, 2, 0.3);
  put(data.drums.hat, 3);
  put(data.drums.perc, 4);

  // 受信の記録（出来事を 1 行ずつ）
  const events = [];
  for (const c of S.chords) events.push({ t: c.t0, k: 'CHORD', a: sharp(c.name).padEnd(10), b: sharp(c.roman) });
  for (const c of data.chops) events.push({ t: c.t, k: 'VOX', a: c.syl.padEnd(10), b: `${noteName(c.m)}  ${c.kana}` });
  for (const d of data.drums.kick) if (d.vel >= 0.85) events.push({ t: d.t, k: 'KICK', a: `vel ${d.vel.toFixed(2)}`.padEnd(10), b: '' });
  for (const d of snares) events.push({ t: d.t, k: 'SNARE', a: `vel ${d.vel.toFixed(2)}`.padEnd(10), b: '' });
  for (const e of S.fx) if (e.type !== 'pop') events.push({ t: e.t, k: 'FX', a: e.type.padEnd(10), b: '' });
  for (const s of S.sections) events.push({ t: s.t0, k: 'SECT', a: SEC_CODE[s.id].padEnd(10), b: `bar ${s.bar + 1}–${s.bar + s.bars}` });
  events.sort((a, b) => a.t - b.t);
  const kanaList = data.chops;

  // 進み具合の帯の値
  const OV_X = 132, OV_W = 1752, OV_N = 292;
  const overview = data.overview(OV_N);

  // 値の読み出し（ピークは過去のコマを見て、状態を持たずに求める）
  const lv = (name, t) => (t < 0 ? 0 : data.level(name, t));
  const peakOf = (fn, t, hold = 0.5, fall = 0.9, look = 1.2) => {
    let p = 0;
    for (let k = 0; k <= look * 30; k++) {
      const dt = k / 30;
      const v = fn(t - dt) - Math.max(0, dt - hold) * fall;
      if (v > p) p = v;
    }
    return p;
  };
  const lufsOf = (name, t) => lv(name, t) * 40 - 40;
  const meterCurve = (v) => Math.min(1, 0.93 * v ** 1.6);
  const specCurve = (v) => Math.min(1, 0.95 * v ** 1.6);

  // ---------------------------------------------------------------- 動かない部分
  const stat = document.createElement('canvas');
  stat.width = W;
  stat.height = H;
  {
    // 撮影モード（opt.cpu）は表示用の canvas も CPU なので、こちらもそろえる（GPU の絵を貼ると、最初のコマだけ描き方が変わった）
    const g = stat.getContext('2d', { willReadFrequently: !!opt.cpu });
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    // うっすらとした方眼
    g.strokeStyle = '#0E1216';
    g.lineWidth = 1;
    for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
    for (let y = 0; y < H; y += 24) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
    for (const k of Object.keys(P)) panelFrame(g, k);
    // 上の帯: 名前
    g.strokeStyle = C.acc;
    g.strokeRect(24.5, 24.5, 66, 46);
    g.fillStyle = C.acc;
    g.font = fm(13, 800);
    g.textAlign = 'center';
    g.fillText('WS-01', 57.5, 44);
    g.fillStyle = C.dim;
    g.font = fm(10, 500);
    g.fillText('DOWNLINK', 57.5, 60);
    g.textAlign = 'left';
    g.fillStyle = C.text;
    g.font = fm(27, 800);
    g.fillText('WATAAME SATELLITE', 106, 50);
    g.fillStyle = C.dim;
    g.font = fj(13, 500);
    g.fillText('わたあめサテライト ・ kawaii future bass ・ 作曲・音・画面: Claude', 108, 70);
    // 進み具合の帯の枠
    g.fillStyle = C.panel;
    g.fillRect(24, 90, 1872, 68);
    g.strokeStyle = C.line;
    g.strokeRect(24.5, 90.5, 1871, 67);
    g.fillStyle = C.text;
    g.font = fm(12, 700);
    g.fillText('TIMELINE', 38, 118);
    g.fillStyle = C.dim;
    g.font = fm(11, 500);
    g.fillText(`80 BARS · ${Math.floor(END / 60)}:${pad2(Math.round(END % 60))}`, 38, 138);
    const cw = OV_W / OV_N;
    for (let i = 0; i < OV_N; i++) {
      const h = 3 + 22 * overview[i];
      g.fillStyle = C.faint;
      g.fillRect(OV_X + i * cw, 128 - h, cw - 2, h * 2);
    }
    for (const s of S.sections) {
      const x = OV_X + (s.t0 / END) * OV_W;
      g.fillStyle = C.line;
      g.fillRect(x, 92, 1, 64);
      g.fillStyle = C.dim;
      g.font = fm(10, 700);
      g.fillText(SEC_CODE[s.id], x + 4, 103);
    }
    // スペクトル: 消えている LED と目盛り
    {
      const [x, y] = P.spec;
      const px = x + 52, py = y + 44, pw = 536, ph = 270, segs = 45;
      const bw = pw / NB;
      g.fillStyle = C.off;
      for (let b = 0; b < NB; b++) for (let s = 0; s < segs; s++) g.fillRect(px + b * bw + 1, py + ph - (s + 1) * 6 + 2, bw - 3, 4);
      g.fillStyle = C.dim;
      g.font = fm(10, 500);
      g.textAlign = 'right';
      for (let i = 0; i <= 4; i++) g.fillText(`${-i * 12}`, px - 8, py + 4 + (i / 4.5) * ph);
      g.textAlign = 'center';
      for (const f of [50, 100, 250, 500, 1000, 2500, 5000, 10000]) {
        let bi = 0;
        for (let b = 0; b < NB; b++) if (Math.abs(Math.log(bandHz[b] / f)) < Math.abs(Math.log(bandHz[bi] / f))) bi = b;
        g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, px + (bi + 0.5) * bw, py + ph + 18);
      }
      g.textAlign = 'left';
      g.fillText('dB', x + 12, py + 4);
      g.fillText('Hz', x + 12, py + ph + 18);
    }
    // オシロスコープの方眼
    {
      const [x, y, w, h] = P.scope;
      const px = x + 12, py = y + 40, pw = w - 24, ph = h - 52;
      g.strokeStyle = C.grid2;
      for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(px + (i / 8) * pw + 0.5, py); g.lineTo(px + (i / 8) * pw + 0.5, py + ph); g.stroke(); }
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(px, py + (i / 4) * ph + 0.5); g.lineTo(px + pw, py + (i / 4) * ph + 0.5); g.stroke(); }
    }
    // 左右の広がり: 円と軸
    {
      const [x, y] = P.stereo;
      const cx = x + 140, cy = y + 156, r = 112;
      g.strokeStyle = C.grid2;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx, cy, r / 2, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
      g.strokeStyle = C.faint;
      g.beginPath(); g.moveTo(cx - r * 0.7, cy - r * 0.7); g.lineTo(cx + r * 0.7, cy + r * 0.7); g.moveTo(cx + r * 0.7, cy - r * 0.7); g.lineTo(cx - r * 0.7, cy + r * 0.7); g.stroke();
      g.fillStyle = C.dim;
      g.font = fm(10, 700);
      g.textAlign = 'center';
      g.fillText('M', cx, cy - r - 6);
      g.fillText('L', cx - r * 0.78, cy - r * 0.78);
      g.fillText('R', cx + r * 0.78, cy - r * 0.78);
      g.fillText('S', cx + r + 10, cy + 4);
      g.textAlign = 'left';
      const rx = x + 290;
      g.font = fm(11, 700);
      for (const [label, yy] of [['CORRELATION', y + 58], ['WIDTH', y + 130], ['PEAK L', y + 190], ['PEAK R', y + 238]]) g.fillText(label, rx, yy);
      g.fillStyle = C.off;
      for (const yy of [y + 72, y + 144, y + 202, y + 250]) g.fillRect(rx, yy, 296, 12);
      g.fillStyle = C.dim;
      g.font = fm(10, 500);
      g.fillText('−1', rx, y + 100);
      g.textAlign = 'center';
      g.fillText('0', rx + 148, y + 100);
      g.textAlign = 'right';
      g.fillText('+1', rx + 296, y + 100);
      g.textAlign = 'left';
      g.fillStyle = C.faint;
      g.fillRect(rx + 148, y + 70, 1, 16);
    }
    // 音符のモニター: オクターブの線
    {
      const [x, y, w, h] = P.notes;
      const px = x + 48, py = y + 40, pw = w - 60, ph = h - 52 - DRUM_LANE;
      g.strokeStyle = C.grid2;
      g.strokeRect(px + 0.5, py + ph + 6.5, pw - 1, DRUM_LANE - 8);
      g.fillStyle = C.dim;
      g.font = fm(10, 700);
      g.textAlign = 'right';
      g.fillText('DRUM', px - 6, py + ph + 6 + DRUM_LANE / 2);
      for (let m = 36; m <= 96; m += 12) {
        const yy = py + ph - ((m - 26) / 76) * ph;
        g.strokeStyle = C.grid2;
        g.beginPath(); g.moveTo(px, yy + 0.5); g.lineTo(px + pw, yy + 0.5); g.stroke();
        g.fillStyle = C.dim;
        g.font = fm(10, 500);
        g.textAlign = 'right';
        g.fillText(noteName(m), px - 6, yy + 4);
      }
      g.textAlign = 'left';
    }
    // シーケンサー: 番号と空の升
    {
      const [x, y] = P.seq;
      const gx = x + 112, cw2 = 32;
      const rows = [['VOX', '声'], ['KICK', 'キック'], ['SNARE', 'スネア'], ['HAT', 'ハイハット'], ['PERC', 'シェイカー']];
      g.font = fm(10, 500);
      g.fillStyle = C.dim;
      g.textAlign = 'center';
      for (let s = 0; s < 16; s++) g.fillText(pad2(s + 1), gx + s * cw2 + cw2 / 2, y + 50);
      rows.forEach(([code, jp], r) => {
        const yy = y + 60 + r * 31;
        g.textAlign = 'left';
        g.fillStyle = C.text;
        g.font = fm(12, 700);
        g.fillText(code, x + 14, yy + 18);
        g.fillStyle = C.dim;
        g.font = fj(10, 500);
        g.fillText(jp, x + 58, yy + 18);
        for (let s = 0; s < 16; s++) {
          g.strokeStyle = s % 4 === 0 ? C.faint : C.grid2;
          g.strokeRect(gx + s * cw2 + 4.5, yy + 3.5, cw2 - 8, 22);
        }
      });
      g.textAlign = 'left';
    }
    // 和音: 12 音の帯の名前
    {
      const [x, y] = P.harm;
      const sx = x + 314;
      g.font = fm(10, 700);
      g.textAlign = 'center';
      for (let i = 0; i < 12; i++) {
        g.fillStyle = C.off;
        g.fillRect(sx + i * 26 + 1, y + 46, 23, 34);
        g.fillStyle = C.dim;
        g.fillText(NAMES[i].replace('#', '♯'), sx + i * 26 + 12.5, y + 94);
      }
      g.textAlign = 'left';
      g.fillStyle = C.dim;
      g.font = fm(10, 700);
      g.fillText('PITCH CLASS', sx, y + 40);
    }
    // チャンネル: 消えている LED
    {
      const [x, y] = P.ch;
      const segs = 38;
      for (let i = 0; i < STEMS.length; i++) {
        const mx = x + 26 + i * 56;
        g.fillStyle = C.off;
        for (let s = 0; s < segs; s++) g.fillRect(mx, y + 380 - (s + 1) * 9 + 2, 34, 7);
        g.fillStyle = C.text;
        g.font = fm(12, 700);
        g.textAlign = 'center';
        g.fillText(STEMS[i][1], mx + 17, y + 404);
        g.fillStyle = C.dim;
        g.font = fj(10, 500);
        g.fillText(STEMS[i][2], mx + 17, y + 422);
      }
      g.textAlign = 'left';
    }
    // ラウドネスの方眼
    {
      const [x, y] = P.loud;
      const gx = x + 250, gy = y + 46, gw = 336, gh = 150;
      g.strokeStyle = C.grid2;
      g.fillStyle = C.dim;
      g.font = fm(10, 500);
      g.textAlign = 'right';
      for (const v of [0, -6, -12, -18, -24, -30]) {
        const yy = gy + (-v / 30) * gh;
        g.beginPath(); g.moveTo(gx, yy + 0.5); g.lineTo(gx + gw, yy + 0.5); g.stroke();
        g.fillText(`${v}`, gx - 6, yy + 4);
      }
      g.textAlign = 'left';
      g.fillText('−12 s', gx, gy + gh + 16);
      g.textAlign = 'right';
      g.fillText('NOW', gx + gw, gy + gh + 16);
      g.textAlign = 'left';
      g.fillStyle = C.dim;
      g.font = fm(11, 700);
      g.fillText('MOMENTARY', x + 14, y + 52);
      g.fillText('SHORT-TERM', x + 14, y + 132);
    }
  }

  // ---------------------------------------------------------------- 動く部分
  function topBar(ctx, t) {
    const sec = sectionAt(S, t);
    // 区間の帯
    const sx0 = 700, sw = 640;
    for (const s of S.sections) {
      const x = sx0 + (s.t0 / END) * sw, w = ((s.t1 - s.t0) / END) * sw;
      const cur = s === sec, past = s.t1 <= t;
      ctx.fillStyle = cur ? 'rgba(63,208,255,0.16)' : past ? '#10161B' : C.panel;
      ctx.fillRect(x + 1, 28, w - 2, 40);
      ctx.strokeStyle = cur ? C.acc : C.line;
      ctx.strokeRect(x + 1.5, 28.5, w - 3, 39);
      if (cur) {
        ctx.fillStyle = C.acc;
        ctx.fillRect(x + 1, 64, (w - 2) * clamp((t - s.t0) / (s.t1 - s.t0)), 4);
      }
      ctx.fillStyle = cur ? C.text : past ? C.dim : C.faint;
      ctx.font = fm(12, 700);
      ctx.textAlign = 'center';
      ctx.fillText(SEC_CODE[s.id], x + w / 2, 52);
    }
    // 読み取り
    const b = Math.floor(t / BAR + 1e-9), beat = Math.floor((t % BAR) / BEAT);
    const boxes = [['TC', tc(Math.min(t, S.duration)), 164], ['BAR', `${String(Math.min(S.bars, b + 1)).padStart(3, '0')}.${beat + 1}`, 120], ['BPM', S.bpm.toFixed(1), 104], ['KEY', 'D MAJ', 104]];
    let x = 1904;
    for (let i = boxes.length - 1; i >= 0; i--) {
      const [label, val, w] = boxes[i];
      x -= w;
      ctx.fillStyle = C.panel;
      ctx.fillRect(x, 24, w - 8, 46);
      ctx.strokeStyle = C.line;
      ctx.strokeRect(x + 0.5, 24.5, w - 9, 45);
      ctx.fillStyle = C.dim;
      ctx.font = fm(10, 700);
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 8, 38);
      ctx.fillStyle = C.text;
      ctx.font = fm(21, 700);
      ctx.fillText(val, x + 8, 62);
      if (label === 'BAR') {
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = k === beat ? C.amb : C.faint;
          ctx.fillRect(x + w - 44 + k * 8, 32, 6, 6);
        }
      }
    }
    ctx.textAlign = 'left';
  }
  function timeline(ctx, t) {
    const cw = OV_W / OV_N;
    const pos = clamp(t / END);
    const n = Math.floor(pos * OV_N);
    ctx.fillStyle = C.accMid;
    for (let i = 0; i < n; i++) {
      const h = 3 + 22 * overview[i];
      ctx.fillRect(OV_X + i * cw, 128 - h, cw - 2, h * 2);
    }
    const px = OV_X + pos * OV_W;
    ctx.fillStyle = C.amb;
    ctx.fillRect(px - 1, 92, 2, 64);
    ctx.beginPath();
    ctx.moveTo(px - 6, 92);
    ctx.lineTo(px + 6, 92);
    ctx.lineTo(px, 99);
    ctx.fill();
  }
  function spectrum(ctx, t) {
    const [x, y] = P.spec;
    const px = x + 52, py = y + 44, pw = 536, ph = 270, segs = 45;
    const bw = pw / NB;
    const bands = Float32Array.from(data.bands(t, bandsBuf));
    const cols = [[C.acc, 0, 30], [C.amb, 30, 40], [C.hot, 40, 45]];
    for (const [col, a, z] of cols) {
      ctx.fillStyle = col;
      for (let b = 0; b < NB; b++) {
        const lit = Math.round(specCurve(bands[b]) * segs);
        for (let s = a; s < Math.min(lit, z); s++) ctx.fillRect(px + b * bw + 1, py + ph - (s + 1) * 6 + 2, bw - 3, 4);
      }
    }
    // ピーク（過去 0.9 秒の最大から、0.35 秒たつと下がり始める）
    const peaks = new Float32Array(NB);
    for (let k = 0; k <= 27; k++) {
      const dt = k / 30;
      if (t - dt < 0) break;
      const v = data.bands(t - dt, bandsBuf);
      const drop = Math.max(0, dt - 0.35) * 0.8;
      for (let b = 0; b < NB; b++) if (v[b] - drop > peaks[b]) peaks[b] = v[b] - drop;
    }
    ctx.fillStyle = '#FFFFFF';
    for (let b = 0; b < NB; b++) {
      const s = Math.round(specCurve(peaks[b]) * segs);
      if (s > 0) ctx.fillRect(px + b * bw + 1, py + ph - s * 6 + 2, bw - 3, 2);
    }
  }
  function scope(ctx, t, A) {
    const [x, y, w, h] = P.scope;
    const px = x + 12, py = y + 40, pw = w - 24, ph = h - 52, cy = py + ph / 2;
    if (!A) {
      ctx.fillStyle = C.dim;
      ctx.font = fm(14, 700);
      ctx.textAlign = 'center';
      ctx.fillText('NO SIGNAL', px + pw / 2, cy + 5);
      ctx.textAlign = 'left';
      return;
    }
    const n = 1008;
    let i0 = Math.round(t * A.sr) - 512;
    // 上がりながら 0 を横切る所にそろえる（波形が左右に流れて見えないように）
    for (let k = i0 + 256; k > i0 - 256 && k > 1; k--) {
      const a = A.L[k - 1] + A.R[k - 1], b = A.L[k] + A.R[k];
      if (a < 0 && b >= 0) { i0 = k - 128; break; }
    }
    const draw = (arr, col, alpha) => {
      ctx.strokeStyle = col;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let j = 0; j < n; j += 2) {
        const v = arr[i0 + j] || 0;
        const xx = px + (j / n) * pw, yy = cy - clamp(v, -1.1, 1.1) * (ph / 2) * 0.9;
        if (j === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    };
    draw(A.R, C.amb, 0.75);
    draw(A.L, C.acc, 1);
  }
  function stereo(ctx, t, A) {
    const [x, y] = P.stereo;
    const cx = x + 140, cy = y + 156, r = 112;
    const rx = x + 290;
    if (!A) return;
    const i0 = Math.max(0, Math.round(t * A.sr) - 1024);
    let sLL = 0, sRR = 0, sLR = 0, sM = 0, sS = 0;
    ctx.fillStyle = 'rgba(63,208,255,0.55)';
    for (let j = 0; j < 2048; j += 2) {
      const l = A.L[i0 + j] || 0, rr = A.R[i0 + j] || 0;
      sLL += l * l; sRR += rr * rr; sLR += l * rr;
      const m = (l + rr) * 0.7071, s = (l - rr) * 0.7071;
      sM += m * m; sS += s * s;
      ctx.fillRect(cx + clamp(s * 1.6, -1, 1) * r - 1, cy - clamp(m, -1, 1) * r - 1, 2, 2);
    }
    const corr = sLL > 1e-9 && sRR > 1e-9 ? sLR / Math.sqrt(sLL * sRR) : 0;
    const width = sM + sS > 1e-9 ? sS / (sM + sS) : 0;
    // 相関の針
    const nx = rx + 148 + corr * 148;
    ctx.fillStyle = corr >= 0 ? C.accMid : C.hot;
    ctx.fillRect(Math.min(rx + 148, nx), y + 72, Math.abs(nx - rx - 148), 12);
    ctx.fillStyle = C.amb;
    ctx.fillRect(nx - 1.5, y + 66, 3, 24);
    ctx.fillStyle = C.text;
    ctx.font = fm(18, 700);
    ctx.textAlign = 'right';
    ctx.fillText(`${corr >= 0 ? '+' : '−'}${Math.abs(corr).toFixed(2)}`, rx + 296, y + 58);
    // 広がり
    ctx.fillStyle = C.accMid;
    ctx.fillRect(rx, y + 144, 296 * clamp(width * 2), 12);
    ctx.fillStyle = C.text;
    ctx.fillText(`${Math.round(width * 100)}%`, rx + 296, y + 130);
    // ピーク（直近 0.3 秒の最大）
    const j1 = Math.round(t * A.sr), j0 = Math.max(0, j1 - Math.round(0.3 * A.sr));
    for (const [arr, yy] of [[A.L, y + 202], [A.R, y + 250]]) {
      let pk = 0;
      for (let j = j0; j < j1; j += 3) { const v = Math.abs(arr[j] || 0); if (v > pk) pk = v; }
      const dbv = pk > 1e-5 ? 20 * Math.log10(pk) : -60;
      ctx.fillStyle = dbv > -3 ? C.amb : C.acc;
      ctx.fillRect(rx, yy, 296 * clamp((dbv + 48) / 48), 12);
      ctx.fillStyle = C.text;
      ctx.font = fm(14, 700);
      ctx.fillText(`${dbv > -59 ? dbv.toFixed(1).replace('-', '−') : '−∞'} dBFS`, rx + 296, yy - 12);
    }
    ctx.textAlign = 'left';
  }
  function notes(ctx, t) {
    const [x, y, w, h] = P.notes;
    const px = x + 48, py = y + 40, pw = w - 60, ph = h - 52 - DRUM_LANE;
    const t0 = t - 2.6, t1 = t + 1.4, pps = pw / (t1 - t0);
    const X = (tt) => px + (tt - t0) * pps;
    const Y = (m) => py + ph - ((m - 26) / 76) * ph;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    const lane = (list, col, hgt, maxD = 99) => {
      ctx.fillStyle = col;
      for (const n of between(list, t0 - 2, t1)) {
        const d = Math.min(Math.max(n.d, 0.04), maxD);
        if (n.t + d < t0) continue;
        const on = t >= n.t && t < n.t + d;
        ctx.globalAlpha = on ? 1 : n.t > t ? 0.35 : 0.6;
        ctx.fillRect(X(n.t), Y(n.m) - hgt / 2, Math.max(2, d * pps - 1), hgt);
      }
      ctx.globalAlpha = 1;
    };
    lane(bassNotes, C.acc, 5);
    lane(keysNotes, C.keys, 3, 0.4);
    lane(chipNotes, C.accMid, 2);
    lane(allChops, C.amb, 4);
    // 鳴った声の音節
    ctx.font = fj(13, 600);
    ctx.fillStyle = C.amb;
    for (const n of between(allChops, t - 0.5, t + 1e-6)) {
      if (n.h) continue;
      ctx.globalAlpha = 1 - (t - n.t) / 0.5;
      ctx.fillText(n.kana, X(n.t), Y(n.m) - 7);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // ドラムの段（キック = 水色、スネア = 琥珀色、ハイハット = 灰色）
    const ly = py + ph + 8, lh = DRUM_LANE - 12;
    for (const [list, col, hh, off] of [[data.drums.hat, C.faint, 0.35, 0], [data.drums.kick, C.acc, 1, 0], [snares, C.amb, 0.7, 0]]) {
      for (const d of between(list, t0, t1)) {
        const xx = X(d.t);
        if (xx < px || xx > px + pw) continue;
        const hit = t >= d.t && t - d.t < 0.12;
        ctx.globalAlpha = d.t > t ? 0.35 : hit ? 1 : 0.75;
        ctx.fillStyle = hit ? '#FFFFFF' : col;
        const hgt = lh * hh * (0.5 + 0.5 * Math.min(1, d.vel));
        ctx.fillRect(xx, ly + (lh - hgt) / 2 + off, 3, hgt);
      }
    }
    ctx.globalAlpha = 1;
    // いまの線と拍の印
    ctx.fillStyle = C.amb;
    ctx.fillRect(X(t) - 0.5, py, 1.5, ph + DRUM_LANE);
    ctx.fillStyle = C.faint;
    for (let k = Math.ceil(t0 / BEAT); k * BEAT < t1; k++) {
      const xx = X(k * BEAT);
      ctx.fillRect(xx, py + ph + DRUM_LANE - 2, 1, k % 4 === 0 ? 6 : 3);
    }
  }
  function sequencer(ctx, t) {
    const [x, y, w] = P.seq;
    const gx = x + 112, cw2 = 32;
    const b = Math.floor(t / BAR + 1e-9);
    const rows = grid[b] || [[], [], [], [], []];
    const cur = Math.floor((t - b * BAR) / STEP);
    ctx.fillStyle = 'rgba(63,208,255,0.10)';
    ctx.fillRect(gx + cur * cw2 + 1, y + 36, cw2 - 2, 180);
    ctx.fillStyle = C.amb;
    ctx.fillRect(gx + cur * cw2 + 1, y + 36, cw2 - 2, 3);
    rows.forEach((cells, r) => {
      const yy = y + 60 + r * 31;
      for (const c of cells) {
        const done = c.s <= cur;
        const flash = done && t - c.t < 0.12 ? 1 - (t - c.t) / 0.12 : 0;
        ctx.globalAlpha = done ? 0.45 + 0.55 * clamp(c.v) : 0.22;
        ctx.fillStyle = flash > 0 ? '#FFFFFF' : r === 0 ? C.amb : C.acc;
        ctx.fillRect(gx + c.s * cw2 + 5, yy + 4, cw2 - 10, 21);
      }
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = C.dim;
    ctx.font = fm(11, 700);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`BAR ${String(b + 1).padStart(3, '0')} · ${SEC_CODE[sectionAt(S, t).id]} · 16 STEPS`, x + w - 12, y + 16);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }
  function harmony(ctx, t) {
    const [x, y, w] = P.harm;
    const idx = chordIndexAt(S, t);
    const ch = S.chords[idx], next = S.chords[idx + 1];
    ctx.fillStyle = t - ch.t0 < 0.12 ? '#FFFFFF' : C.text;
    ctx.font = fm(44, 800);
    ctx.fillText(sharp(ch.name), x + 14, y + 86);
    ctx.fillStyle = C.acc;
    ctx.font = fm(16, 700);
    ctx.fillText(sharp(ch.roman), x + 16, y + 112);
    ctx.fillStyle = C.dim;
    ctx.font = fm(12, 500);
    ctx.fillText(`ROOT ${noteName(ch.bass).replace('#', '♯')}`, x + 16, y + 136);
    if (next) ctx.fillText(`NEXT ${sharp(next.name)} · ${(next.t0 - t).toFixed(2)} s`, x + 120, y + 136);
    // 12 音の帯
    const sx = x + 314;
    const pcs = new Set(ch.notes.map((m) => m % 12));
    for (let i = 0; i < 12; i++) {
      if (pcs.has(i)) {
        ctx.fillStyle = C.acc;
        ctx.fillRect(sx + i * 26 + 1, y + 46, 23, 34);
      }
      if (ch.bass % 12 === i) {
        ctx.strokeStyle = C.amb;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + i * 26 + 2, y + 47, 21, 32);
        ctx.lineWidth = 1;
      }
    }
    // 和音の流れ（-3 秒〜+5 秒）
    const lx = x + 14, lw = w - 28, ly = y + 156, t0 = t - 3, pps = lw / 8;
    const X = (tt) => lx + (tt - t0) * pps;
    ctx.save();
    ctx.beginPath();
    ctx.rect(lx, ly, lw, 120);
    ctx.clip();
    for (let i = Math.max(0, idx - 5); i < Math.min(S.chords.length, idx + 10); i++) {
      const c = S.chords[i];
      const x0 = X(c.t0) + 1, x1 = X(c.t1) - 1;
      const cur = i === idx;
      ctx.fillStyle = cur ? 'rgba(63,208,255,0.18)' : c.t1 <= t ? '#10151A' : C.panel;
      ctx.fillRect(x0, ly, x1 - x0, 46);
      ctx.strokeStyle = cur ? C.acc : C.line;
      ctx.strokeRect(x0 + 0.5, ly + 0.5, x1 - x0 - 1, 45);
      if (x1 - x0 > 34) {
        ctx.fillStyle = cur ? C.text : C.dim;
        ctx.font = fm(x1 - x0 > 70 ? 13 : 10, 700);
        ctx.fillText(sharp(c.name), x0 + 6, ly + 20);
        if (x1 - x0 > 70) {
          ctx.font = fm(10, 500);
          ctx.fillText(sharp(c.roman), x0 + 6, ly + 37);
        }
      }
    }
    // ベースの線
    const BY = (m) => ly + 112 - ((m - 28) / 14) * 50;
    ctx.strokeStyle = C.acc;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    for (let i = Math.max(0, idx - 5); i < Math.min(S.chords.length, idx + 10); i++) {
      const c = S.chords[i];
      if (first) { ctx.moveTo(X(c.t0), BY(c.bass)); first = false; } else ctx.lineTo(X(c.t0), BY(c.bass));
      ctx.lineTo(X(c.t1), BY(c.bass));
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.restore();
    ctx.fillStyle = C.dim;
    ctx.font = fm(10, 700);
    ctx.fillText('BASS', lx, ly + 62);
    ctx.fillStyle = C.amb;
    ctx.fillRect(X(t) - 0.5, ly, 1.5, 120);
  }
  function channels(ctx, t) {
    const [x, y] = P.ch;
    const segs = 38;
    for (let i = 0; i < STEMS.length; i++) {
      const id = STEMS[i][0];
      const mx = x + 26 + i * 56;
      const lit = Math.round(meterCurve(lv(id, t)) * segs);
      for (let s = 0; s < lit; s++) {
        ctx.fillStyle = s >= 34 ? C.hot : s >= 28 ? C.amb : C.acc;
        ctx.fillRect(mx, y + 380 - (s + 1) * 9 + 2, 34, 7);
      }
      const pk = Math.round(meterCurve(peakOf((tt) => lv(id, tt), t, 0.6, 0.7, 1.4)) * segs);
      if (pk > 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(mx, y + 380 - pk * 9 + 2, 34, 2);
      }
    }
  }
  function loudness(ctx, t) {
    const [x, y] = P.loud;
    const m = lufsOf('lufsM', t), s = lufsOf('lufsS', t);
    const fmt = (v) => (v <= -39.9 ? '−∞' : v.toFixed(1).replace('-', '−'));
    ctx.fillStyle = C.text;
    ctx.font = fm(44, 800);
    ctx.fillText(fmt(m), x + 14, y + 100);
    ctx.font = fm(30, 700);
    ctx.fillText(fmt(s), x + 14, y + 172);
    ctx.fillStyle = C.dim;
    ctx.font = fm(11, 700);
    ctx.fillText('LUFS', x + 158, y + 100);
    ctx.fillText('LUFS', x + 130, y + 172);
    ctx.fillText(`TARGET ${S.lufs.toFixed(1).replace('-', '−')} INTEGRATED`, x + 14, y + 204);
    // 履歴（瞬間 = 水色、短時間 = 琥珀色）
    const gx = x + 250, gy = y + 46, gw = 336, gh = 150;
    const Yv = (v) => gy + clamp(-v / 30) * gh;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = C.ambDim;
    ctx.beginPath();
    ctx.moveTo(gx, Yv(S.lufs));
    ctx.lineTo(gx + gw, Yv(S.lufs));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [name, col] of [['lufsS', C.amb], ['lufsM', C.acc]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 168; i++) {
        const tt = t - 12 + (i / 168) * 12;
        const v = tt < 0 ? -40 : lufsOf(name, tt);
        const xx = gx + (i / 168) * gw, yy = Yv(v);
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }
  function downlink(ctx, t) {
    const [x, y, w] = P.log;
    // 受信した文字（声の音節）
    const k = lastBefore(kanaList, t);
    ctx.fillStyle = C.dim;
    ctx.font = fm(11, 700);
    ctx.fillText('DECODED ›', x + 14, y + 52);
    ctx.font = fj(22, 600);
    const recent = [];
    for (let i = k; i >= 0 && recent.length < 18; i--) recent.unshift(kanaList[i]);
    recent.forEach((c, i) => {
      const newest = i === recent.length - 1 && t - c.t < 0.4;
      ctx.fillStyle = newest ? C.amb : i > recent.length - 6 ? C.text : C.dim;
      ctx.fillText(c.kana, x + 96 + i * 26, y + 55);
    });
    ctx.fillStyle = C.faint;
    ctx.fillRect(x + 12, y + 70, w - 24, 1);
    // 出来事の行（下が新しい）
    const li = lastBefore(events, t);
    ctx.font = fm(12, 500);
    for (let r = 0; r < 5; r++) {
      const e = events[li - r];
      if (!e) break;
      const yy = y + 170 - r * 19;
      ctx.fillStyle = r === 0 ? C.text : r < 3 ? C.dim : C.faint;
      ctx.fillText(`${tc(e.t)}  ${e.k.padEnd(6)}${e.a}${e.b}`, x + 14, yy);
      if (r === 0 && t - e.t < 0.15) {
        ctx.fillStyle = C.amb;
        ctx.fillRect(x + 4, yy - 10, 3, 12);
      }
    }
  }
  function overlays(ctx, t, o) {
    // drop の始まり: 枠が琥珀色に光る（1 回だけ）
    for (const e of between(fx.impact || [], t - 0.5, t + 1e-6)) {
      const a = Math.exp(-(t - e.t) / 0.14) * e.vel;
      ctx.strokeStyle = `rgba(255,178,30,${0.9 * a})`;
      ctx.lineWidth = 2;
      for (const [px, py, pw, ph] of Object.values(P)) ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.lineWidth = 1;
    }
    // 区間が変わった知らせ
    const sec = sectionAt(S, t);
    const age = t - sec.t0;
    if (age >= 0 && age < 1.6 && !o.reduced) {
      const [x, y] = P.notes;
      ctx.globalAlpha = 1 - age / 1.6;
      ctx.fillStyle = C.amb;
      ctx.font = fm(22, 800);
      ctx.fillText(`▶ ${SEC_CODE[sec.id]}`, x + 60, y + 70);
      ctx.globalAlpha = 1;
    }
    // テープを止める演出: 色が抜けて、信号が途切れる
    const [ts0, ts1] = S.tapeStop;
    if (t >= ts0 && t < ts1 + 0.5) {
      const u = clamp((t - ts0) / (ts1 - ts0)) * (1 - clamp((t - ts1) / 0.5));
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = `rgba(128,128,128,${u})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(9,11,14,${0.45 * u})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,178,30,${u})`;
      ctx.font = fm(40, 800);
      ctx.textAlign = 'center';
      ctx.fillText('SIGNAL DROP', W / 2, H / 2);
      ctx.textAlign = 'left';
    }
  }

  return function draw(ctx, t, o = {}) {
    ctx.drawImage(stat, 0, 0);
    topBar(ctx, t);
    timeline(ctx, t);
    spectrum(ctx, t);
    scope(ctx, t, o.audio);
    stereo(ctx, t, o.audio);
    notes(ctx, t);
    sequencer(ctx, t);
    harmony(ctx, t);
    channels(ctx, t);
    loudness(ctx, t);
    downlink(ctx, t);
    overlays(ctx, t, o);
  };
}

// 書体を先に読んでおく（Canvas の文字は、読み終える前に描くと別の書体になる）
export async function loadFonts() {
  if (!document.fonts) return 'unsupported';
  const latin = 'WATAAME SATELLITE DOWNLINK ANALYZER 0123456789:.·−+%/›▶↑×–ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz♯♭ø∞';
  const jp = 'わたあめサテライト作曲・音画面周波数波形左右の広がり音符リズム和音楽器ごとの量ラウドネス受信記録キックスネアハイハットシェイカーベース鈴声鍵盤効果あいうえおらりるれろなにぬねのやゆよわぱぴぷぺぽはひふへほん';
  // JetBrains Mono に無い記号（♯ ▶ − ∞ など）は IBM Plex Sans JP で描かれる。その記号の入った部分も先に読む
  const sym = '·−–♯♭ø↑×›▶∞%/:.+-#';
  const t0 = performance.now();
  await Promise.all([
    ...[500, 700, 800].map((w) => document.fonts.load(`${w} 20px "JetBrains Mono"`, latin + sym)),
    ...[500, 600, 700, 800].map((w) => document.fonts.load(`${w} 20px "IBM Plex Sans JP"`, jp + sym + latin)),
  ]);
  await document.fonts.ready;
  return Math.round(performance.now() - t0);
}
