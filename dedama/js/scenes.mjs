// 場面: 題名 → 入店 → 台選び → 打つ → 閉店 → 退店 → 結果。
// 画面は 384×216 のドット。時間の単位は、場面の中は実時間の秒、出玉の計算はゲーム内の秒。
import { MACHINES } from '../sim/machines.mjs';
import { createSession, YEN_PER_BALL, MODE_LABEL } from '../sim/sim.mjs';
import { chainColor, chainLabel, mealTier, MEALS, SPEEDS, BASE_SPEED, todayRpk, milestoneCross } from './logic.mjs';
import { Graph } from './graph.mjs';
import { rampFrom, FxLayer } from './fx.mjs';
import { drawText, textWidth, signed, comma } from './pixtext.mjs';
import { art, frame, HERO, BUST } from './art.mjs';
import { sfx, startSad, stopSad, startAmbient, stopAmbient } from './audio.mjs';
import { log } from './log.mjs';

export const W = 384, H = 216, GROUND = 176, DOOR_X = 226, DOOR_W = 48;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- 共通の描き方 ----
function clockText(t) {
  const m = Math.floor(Math.min(t, 43200) / 60) + 600;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function panel(ctx, x, y, w, h, fill = '#14122a', border = '#5a5070') {
  ctx.fillStyle = border; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}
// 吹き出し（x は口元、y は頭の上）
function bubble(ctx, text, x, y, size = 12) {
  const tw = textWidth(text, { size }), w = tw + 10, h = size + 8;
  const bx = Math.round(Math.max(2, Math.min(W - w - 2, x - w / 2))), by = Math.round(y - h - 6);
  ctx.fillStyle = '#0b0a12'; ctx.fillRect(bx, by, w, h); ctx.fillRect(x - 2, by + h - 1, 5, 4); ctx.fillRect(x - 1, by + h + 3, 3, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + 1, by + 1, w - 2, h - 2); ctx.fillRect(x - 1, by + h - 1, 3, 3); ctx.fillRect(x, by + h + 2, 1, 2);
  drawText(ctx, text, bx + 5, by + 4, { size, color: '#0b0a12' });
}
function vertical(ctx, text, x, y, color) { [...text].forEach((ch, i) => drawText(ctx, ch, x, y + i * 9, { size: 9, color, align: 'center' })); }
function fade(ctx, a) { if (a <= 0) return; ctx.fillStyle = `rgba(4,3,10,${Math.min(1, a)})`; ctx.fillRect(0, 0, W, H); }
// 主人公の全身（足元が (x, ground)）
function hero(ctx, f, x, ground = GROUND, flip = false) {
  if (frame(ctx, 'hero', f, x - 16, ground - 32, { flip })) return;
  ctx.fillStyle = '#d0263a'; ctx.fillRect(x - 5, ground - 22, 10, 12);
  ctx.fillStyle = '#ffd5b5'; ctx.fillRect(x - 4, ground - 30, 8, 8);
  ctx.fillStyle = '#2f3a6a'; ctx.fillRect(x - 5, ground - 10, 4, 10); ctx.fillRect(x + 1, ground - 10, 4, 10);
}
function street(ctx, night = false, doorFrame = 0) {
  if (!frame(ctx, night ? 'streetNight' : 'street', 0, 0, 0)) {
    ctx.fillStyle = night ? '#0d1030' : '#9fd4ff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = night ? '#2a2438' : '#d6d0e0'; ctx.fillRect(150, 40, 200, 136);
    ctx.fillStyle = '#5a5070'; ctx.fillRect(0, GROUND, W, H - GROUND);
  }
  // 看板の名前と、のぼりの縦書き（夜はネオンの色）
  drawText(ctx, 'ドル箱会館', 256, 39, { size: 20, color: night ? '#ffa6e8' : '#ffd84a', outline: night ? '#ff5ad0' : '#4a0d1e', align: 'center', bold: true });
  vertical(ctx, '新台入替', 201, 123, night ? '#ffa6e8' : '#8c1a2b');
  vertical(ctx, '朝から全台', 305, 121, night ? '#b5ecff' : '#1a4f8c');
  if (!frame(ctx, 'doors', doorFrame, DOOR_X, GROUND - 44)) {
    ctx.fillStyle = '#63c6ff'; const g = doorFrame * 10;
    ctx.fillRect(DOOR_X, GROUND - 44, 24 - g, 44); ctx.fillRect(DOOR_X + 24 + g, GROUND - 44, 24 - g, 44);
  }
}
function folk(ctx, i, x, walking, t) {
  const f = i * 2 + (walking ? 1 : 0);
  if (frame(ctx, 'folks', f, x - 10, GROUND - 30 + (walking && Math.floor(t * 8) % 2 ? -1 : 0))) return;
  ctx.fillStyle = ['#3d3550', '#1f6b3a', '#6b4226', '#1a4f8c', '#4a0d1e'][i % 5]; ctx.fillRect(x - 4, GROUND - 24, 8, 24);
  ctx.fillStyle = '#e8a982'; ctx.fillRect(x - 3, GROUND - 28, 6, 5);
}
function speedLines(ctx, x, t) {
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 9; i++) {
    const yy = GROUND - 30 + ((i * 37 + Math.floor(t * 40) * 11) % 30), len = 12 + ((i * 53) % 18);
    ctx.fillRect(Math.round(x - 20 - len - ((i * 17) % 20)), yy, len, 1);
  }
}

// ---- 場面 ----
export function makeScenes(G) {
  const S = {};

  S.title = {
    enter() { this.t = 0; G.controls('title'); },
    update(dt) { this.t += dt; },
    draw(ctx) {
      street(ctx, false, 0);
      for (let i = 0; i < 5; i++) folk(ctx, i, 132 + i * 18, false, this.t);
      hero(ctx, HERO.idle[Math.floor(this.t * 2) % 2], 60);
      ctx.fillStyle = 'rgba(8,6,20,0.72)'; ctx.fillRect(0, 8, W, 58);
      drawText(ctx, '今日も打とーっと', W / 2, 14, { size: 28, color: '#ffd84a', outline: '#4a0d1e', align: 'center', bold: true });
      drawText(ctx, '出玉グラフを眺めて一喜一憂するだけのパチンコ', W / 2, 48, { size: 12, color: '#ffffff', align: 'center' });
    },
  };

  S.entry = {
    enter() { this.t = 0; this.chimed = false; this.dashed = false; this.bumped = false; G.controls('skip'); startAmbient(); },
    update(dt) {
      this.t += dt;
      const t = this.t;
      if (t > 1.2 && !this.chimed) { this.chimed = true; sfx('chime'); log('scene.entry.open', {}); }
      if (t > 4.4 && !this.dashed) { this.dashed = true; sfx('dash'); }
      if (t > 4.95 && !this.bumped) { this.bumped = true; sfx('bump'); G.shake(0.35, 3); }
      if (t > 6.6) G.go('select');
    },
    draw(ctx) {
      const t = this.t;
      const door = t < 1.2 ? 0 : t < 1.35 ? 1 : t < 5.6 ? 2 : t < 5.75 ? 1 : 0;
      street(ctx, false, door);
      drawText(ctx, t < 1.2 ? '9:59' : '10:00 開店', W - 6, 4, { size: 12, color: '#ffffff', outline: '#0b0a12', align: 'right' });
      // 開店待ちの人が順に入る
      for (let i = 0; i < 5; i++) {
        const start = 1.45 + (4 - i) * 0.32, x0 = 132 + i * 18;
        const x = t < start ? x0 : x0 + (t - start) * 70;
        if (x < DOOR_X + DOOR_W / 2) folk(ctx, i, x, t >= start, t);
      }
      // 主人公: 左から走ってきて、吹き出し、勢いをつけて飛び込む
      if (t > 2.0 && t < 4.95) {
        let x;
        if (t < 4.4) x = -14 + (t - 2.0) * 62;
        else x = -14 + 2.4 * 62 + (t - 4.4) * 420;
        if (t >= 4.4) speedLines(ctx, x, t);
        hero(ctx, HERO.run[Math.floor(t * (t < 4.4 ? 12 : 20)) % 6], Math.min(x, DOOR_X + 18));
        if (t > 2.35 && t < 4.4) bubble(ctx, '今日もパチンコ打とーっと♪', Math.max(70, Math.min(x, 260)), GROUND - 34);
      }
      if (t > 4.95 && t < 5.5) drawText(ctx, 'ドーン', DOOR_X + 24, GROUND - 70, { size: 16, color: '#ffd84a', outline: '#4a0d1e', align: 'center', bold: true });
      fade(ctx, t > 6.0 ? (t - 6.0) / 0.6 : 0);
    },
    skip() { G.go('select'); },
  };

  S.select = {
    enter() {
      this.t = 0;
      G.controls('select');
      this.rpk = MACHINES.map((m) => todayRpk(m, G.daySeed));
      log('scene.select.rpk', Object.fromEntries(MACHINES.map((m, i) => [m.id, this.rpk[i]])));
    },
    update(dt) { this.t += dt; },
    pick(i) {
      const n = (i + MACHINES.length) % MACHINES.length;
      if (n !== G.machineIndex) { G.machineIndex = n; sfx('blip'); log('ui.select', { machine: MACHINES[n].id }); }
    },
    key(e) {
      if (e.key === 'ArrowLeft') { this.pick(G.machineIndex - 1); return true; }
      if (e.key === 'ArrowRight') { this.pick(G.machineIndex + 1); return true; }
      if (e.key === 'Enter') { this.decide(); return true; }
      return false;
    },
    click(x, y) {
      if (y >= 34 && y < 34 + 104) {
        const i = Math.floor((x - 12) / 60);
        if (i >= 0 && i < MACHINES.length) { if (i === G.machineIndex) this.decide(); else this.pick(i); }
      }
    },
    decide() {
      sfx('decide');
      const m = MACHINES[G.machineIndex];
      log('ui.decide', { machine: m.id, rpk: this.rpk[G.machineIndex] });
      G.startPlay(m, this.rpk[G.machineIndex]);
    },
    draw(ctx) {
      if (!frame(ctx, 'parlor', 0, 0, 0)) { ctx.fillStyle = '#2a2438'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#4a0d1e'; ctx.fillRect(0, 138, W, 78); }
      drawText(ctx, 'どの台にする？', 8, 4, { size: 12, color: '#ffffff', outline: '#0b0a12' });
      drawText(ctx, '← → で選んで Enter', W - 8, 4, { size: 10, color: '#d6d0e0', outline: '#0b0a12', align: 'right' });
      for (let i = 0; i < MACHINES.length; i++) {
        const x = 12 + i * 60, y = 34, sel = i === G.machineIndex;
        const lift = sel ? -2 - Math.round(Math.sin(this.t * 4)) : 0;
        if (!frame(ctx, 'machines', i, x, y + lift)) {
          panel(ctx, x + 2, y + lift, 56, 104, '#1a1626', ['#d0263a', '#ff9a2e', '#1a4f8c', '#1f6b3a', '#c8a020', '#b24ad6'][i]);
          drawText(ctx, MACHINES[i].name.replace(/^(P|CR) /, '').slice(0, 4), x + 30, y + 40 + lift, { size: 10, color: '#ffffff', align: 'center' });
        }
        if (sel) {
          ctx.fillStyle = (this.t % 1) < 0.7 ? '#ffd84a' : '#c8a020';
          ctx.fillRect(x, y - 4 + lift, 60, 1); ctx.fillRect(x, y + 104 + lift, 60, 1); ctx.fillRect(x, y - 4 + lift, 1, 109); ctx.fillRect(x + 59, y - 4 + lift, 1, 109);
          ctx.fillRect(x + 27, y - 9 + lift, 7, 2); ctx.fillRect(x + 29, y - 7 + lift, 3, 2);
        }
      }
      // 台の札
      const m = MACHINES[G.machineIndex], r = this.rpk[G.machineIndex];
      panel(ctx, 6, 146, W - 12, 66, '#0b0a12ee', '#c8a020');
      drawText(ctx, m.name, 12, 150, { size: 14, color: '#ffd84a', bold: true });
      drawText(ctx, m.type, W - 12, 152, { size: 10, color: '#a9a1bb', align: 'right' });
      drawText(ctx, m.spec[0], 12, 168, { size: 10, color: '#ffffff' });
      drawText(ctx, m.spec[1], 12, 181, { size: 10, color: '#ffffff' });
      const judge = r >= m.border ? '回る！（ボーダー超え）' : r >= m.border - 1 ? 'まずまず' : '渋い……';
      drawText(ctx, `今日の回り: 千円で約 ${r} 回（ボーダー ${m.border}）  ${judge}`, 12, 195, { size: 10, color: r >= m.border ? '#8fe07a' : r >= m.border - 1 ? '#fff3a0' : '#ff9a9a' });
    },
  };

  S.play = {
    enter() {
      const P = G.play;
      this.t = 0; this.evIndex = 0; this.msg = []; this.lastFx = -9; this.face = 'normal'; this.faceUntil = 0; this.lastHitClock = -99;
      this.prevSa = 0; this.seen = new Set(); this.closing = 0; this.rain = null; this.sad = false; this.lastFirework = -9;
      this.weather = new FxLayer(280, 148, 6, 18); // 雨はグラフの中だけ
      P.graph = new Graph({ x: 6, y: 18, w: 280, h: 148, endT: P.session.endT });
      G.controls('play');
      this.say(`${clockText(0)} ${P.machine.name} で打ち始め。今日の回りは千円で約 ${P.rpk} 回`, '#ffffff');
    },
    say(text, color = '#ffffff') { this.msg.unshift({ text, color, at: G.clock }); this.msg.length = Math.min(this.msg.length, 3); },
    update(dt, raw = dt) {
      const P = G.play, s = P.session;
      this.t += dt;
      if (this.closing) {
        this.closing += dt;
        if (this.closing > 3.2) G.go('exit');
      } else if (!G.paused) {
        const gameDt = raw * BASE_SPEED * (G.speedOverride ?? SPEEDS[G.speedIndex]);
        s.advanceTo(s.state.t + gameDt);
        this.handleEvents();
        if (s.done) this.close();
      }
      P.graph.sync(s.samples);
      P.graph.ease(dt);
      this.weather.update(dt);
      // 万発・逆万発
      const sa = s.state.sa;
      for (const id of milestoneCross(this.prevSa, sa, this.seen)) this.milestone(id);
      this.prevSa = sa;
      // 逆万発の間は悲しい曲と雨。−9,000 を上回ったら止める（音が無効でも雨は同じ規則で止まる）
      if (sa <= -10000 && !this.sad && !this.closing) { this.sad = true; startSad(); this.startRain(); }
      if (sa > -9000 && this.sad) { this.sad = false; stopSad(); this.stopRain(); }
      // 顔
      if (G.clock > this.faceUntil) this.face = sa <= -10000 ? 'despair' : sa <= -4000 ? 'sad' : s.state.chain >= 5 ? 'joy' : s.state.chain >= 1 ? 'happy' : 'normal';
      G.updateSpeedText();
    },
    handleEvents() {
      const P = G.play, ev = P.session.events;
      for (; this.evIndex < ev.length; this.evIndex++) {
        const e = ev[this.evIndex];
        if (e.type === 'hit') this.onHit(e);
        else if (e.type === 'bonusEnd') {
          const sp = e.spins ? ` ${e.spins} 回` : '';
          if (e.next !== 'normal') this.say(`${clockText(e.t)} ${MODE_LABEL[e.next]}${e.next === 'kakuhen' ? '（次の当たりまで）' : sp} 突入`, chainColor(Math.max(1, e.chain), G.clock * 0.5));
          log('sim.bonusEnd', { t: Math.round(e.t), next: e.next, spins: e.spins, chain: e.chain });
        } else if (e.type === 'modeEnd') {
          if (e.result === 'out') {
            this.say(`${clockText(e.t)} ${e.mode === 'bonus' ? '通常へ' : `${MODE_LABEL[e.mode]} 終了……通常へ`}${e.chain >= 2 ? `（${e.chain} 連で終わり）` : ''}`, '#a9a1bb');
            if (e.chain >= 2) { this.face = P.session.state.sa >= 0 ? 'happy' : 'sad'; this.faceUntil = G.clock + 1.2; }
          } else this.say(`${clockText(e.t)} ${MODE_LABEL[e.mode]} 終了、${MODE_LABEL[e.to]} へ`, '#d6d0e0');
          log('sim.modeEnd', { t: Math.round(e.t), mode: e.mode, result: e.result, to: e.to, chain: e.chain });
        } else if (e.type === 'cash') {
          if (e.invest % 10000 === 0) this.say(`${clockText(e.t)} 投資 ${comma(e.invest)} 円`, '#ff9a9a');
          log('sim.cash', { t: Math.round(e.t), invest: e.invest });
        } else if (e.type === 'close') log('sim.close', { t: Math.round(e.t), sa: P.session.state.sa });
      }
    },
    onHit(e) {
      const P = G.play;
      const color = chainColor(e.chain, G.clock * 0.5);
      const kind = e.tokkaku ? '突確' : `${e.rounds}R`;
      const next = e.next === 'normal' ? '通常' : MODE_LABEL[e.next];
      this.say(`${clockText(e.t)} 大当たり！ ${kind}${e.payout ? `（約 ${comma(e.payout)} 発）` : ''} → ${next}${e.chain >= 2 ? `  ${chainLabel(e.chain)}` : ''}`, color);
      log('sim.hit', { t: Math.round(e.t), chain: e.chain, rounds: e.rounds, payout: e.payout, from: e.from, next: e.next, sa: P.session.state.sa });
      this.face = e.chain >= 5 ? 'joy' : 'happy'; this.faceUntil = G.clock + 1.5;
      sfx('hit', e.chain);
      // 光る効果は 0.4 秒に 1 回まで（1 秒に 3 回より多く光らせない）
      if (G.clock - this.lastFx >= 0.4) {
        this.lastFx = G.clock;
        const tip = P.graph.tip();
        G.fx.spawn('hit', tip.x, tip.y + 30, { palette: rampFrom(chainColor(e.chain, G.clock * 0.5)) });
      }
      if (e.chain >= 5 && e.chain % 5 === 0) {
        sfx('chain', e.chain);
        this.say(`${chainLabel(e.chain)}！！`, chainColor(e.chain, G.clock));
        if (e.chain >= 10) { const tip = P.graph.tip(); this.firework(Math.min(230, Math.max(60, tip.x)), rampFrom(chainColor(e.chain, 0.3), 7)); }
        log('milestone.chain', { chain: e.chain });
      }
    },
    milestone(id) {
      const P = G.play;
      if (id === 'gyaku') {
        this.say('逆万発……（−10,000 発）', '#63c6ff');
        log('milestone', { id, sa: P.session.state.sa, t: Math.round(P.session.state.t) });
        return;
      }
      const k = Number(id.slice(3));
      this.say(`${k} 万発 突破！！`, '#ffd84a');
      sfx('fanfare', (k - 1) * 2);
      G.fx.spawn('confetti', 146, 166);
      this.firework(146);
      this.face = 'joy'; this.faceUntil = G.clock + 4;
      log('milestone', { id, sa: P.session.state.sa, t: Math.round(P.session.state.t) });
    },
    // 花火は 1.5 秒に 1 回まで（強い光を 1 秒に 3 回より多く出さない）
    firework(x, palette) {
      if (G.clock - this.lastFirework < 1.5) return;
      this.lastFirework = G.clock;
      G.fx.spawn('firework', x, 150, { light: 0.6, ...(palette ? { palette } : {}) });
    },
    startRain() { if (!this.rain) this.rain = this.weather.spawn('rain', 140, 148, { density: 0.45, light: 0.4 }); },
    stopRain() { if (this.rain) { this.rain.stop(); this.rain = null; } },
    close() {
      if (this.closing) return;
      this.closing = 0.0001;
      this.sad = false; stopSad(); this.stopRain(); stopAmbient();
      sfx('closing');
      this.say('22:00 閉店のお時間です。本日もありがとうございました', '#ffffff');
      log('scene.play.close', { sa: G.play.session.state.sa, invest: G.play.session.state.invest });
    },
    key(e) {
      if (e.key === ' ') { G.togglePause(); return true; }
      if (e.key === 'ArrowRight' || e.key === ']') { G.setSpeed(G.speedIndex + 1); return true; }
      if (e.key === 'ArrowLeft' || e.key === '[') { G.setSpeed(G.speedIndex - 1); return true; }
      return false;
    },
    draw(ctx) {
      const P = G.play, s = P.session, st = s.state;
      ctx.fillStyle = '#0b0a12'; ctx.fillRect(0, 0, W, H);
      // 上の帯
      drawText(ctx, P.machine.name, 6, 2, { size: 12, color: '#ffd84a' });
      drawText(ctx, clockText(st.t), W - 6, 2, { size: 12, color: '#ffffff', align: 'right' });
      if (G.paused) drawText(ctx, '一時停止中', W - 52, 3, { size: 10, color: '#ff9a9a', align: 'right' });
      P.graph.draw(ctx, G.clock, { liveChain: st.chain });
      this.weather.draw(ctx);
      // データカウンター
      panel(ctx, 290, 18, 90, 148, '#0f0d22', '#3d3550');
      const lines = [
        ['総回転', comma(st.spinsTotal)],
        ['大当り', `${st.hitsTotal}`],
        ['初当り', `${st.firstHits}`],
        ['連チャン', st.chain ? `${st.chain}` : '−'],
        ['最高', `${st.maxChain} 連`],
        ['状態', st.inBonus ? `${st.bonusRounds - st.bonusRoundsLeft}/${st.bonusRounds}R` : MODE_LABEL[st.mode]],
        ['残り', st.mode === 'kakuhen' ? '次回まで' : st.mode !== 'normal' ? `${st.modeLeft} 回` : `${st.spinsSinceHit} 回転`],
        ['投資', `${comma(st.invest)}円`],
      ];
      lines.forEach(([k, v], i) => {
        drawText(ctx, k, 294, 22 + i * 13, { size: 10, color: '#7e7593' });
        drawText(ctx, v, 376, 22 + i * 13, { size: 10, color: k === '状態' && st.mode !== 'normal' ? chainColor(Math.max(1, st.chain), G.clock * 0.5) : '#ffffff', align: 'right' });
      });
      drawText(ctx, '差玉', 294, 128, { size: 10, color: '#7e7593' });
      drawText(ctx, signed(st.sa), 376, 140, { size: 14, color: st.sa >= 0 ? '#ffd84a' : '#63c6ff', align: 'right', bold: true });
      drawText(ctx, `${signed(st.sa * YEN_PER_BALL)}円`, 376, 155, { size: 10, color: st.sa >= 0 ? '#fff3a0' : '#b5ecff', align: 'right' });
      // 下の帯: 顔と知らせ
      const fi = BUST[this.face] ?? 0;
      const blink = this.face === 'normal' && (G.clock % 4) < 0.12;
      if (!frame(ctx, 'bust', blink ? BUST.blink : fi, 4, 168)) {
        ctx.fillStyle = '#ffd5b5'; ctx.fillRect(10, 174, 36, 36);
        drawText(ctx, { normal: '・_・', blink: '-_-', happy: '^o^', joy: '☆▽☆', sad: 'T_T', despair: '×_×' }[blink ? 'blink' : this.face], 28, 186, { size: 10, color: '#0b0a12', align: 'center' });
      }
      this.msg.forEach((m, i) => {
        const age = G.clock - m.at;
        drawText(ctx, m.text, 58, 172 + i * 14, { size: i === 0 ? 12 : 10, color: i === 0 ? m.color : '#7e7593' });
        if (i === 0 && age < 0.25) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(56, 171, W - 60, 14); }
      });
      if (this.closing) fade(ctx, (this.closing - 2.2) / 1);
    },
  };

  S.exit = {
    enter() {
      this.t = 0;
      const st = G.play.session.state;
      this.yen = st.sa * YEN_PER_BALL; this.win = this.yen > 0; this.tier = mealTier(this.yen);
      this.sounded = false; G.controls('skip');
      log('scene.exit', { yen: this.yen, tier: this.tier });
    },
    update(dt) {
      this.t += dt;
      if (this.t > 1.0 && !this.sounded) { this.sounded = true; sfx(this.win ? 'win' : 'lose'); if (this.win) G.fx.spawn('hit', DOOR_X + 90, GROUND, { palette: rampFrom('#ffd84a') }); }
      if (this.t > 5.6) G.go('result');
    },
    draw(ctx) {
      const t = this.t;
      street(ctx, true, t < 0.5 ? 0 : t < 0.65 ? 1 : t < 3.0 ? 2 : t < 3.15 ? 1 : 0);
      drawText(ctx, '22:00', W - 6, 4, { size: 12, color: '#ffffff', outline: '#0b0a12', align: 'right' });
      const x0 = DOOR_X + 24;
      if (t > 0.55) {
        const k = Math.min(1, (t - 0.55) / 0.7);
        if (this.win) {
          // 跳ねて飛び出す
          const x = x0 + k * 90, y = GROUND - Math.sin(k * Math.PI) * 40;
          hero(ctx, k < 1 ? HERO.jump[Math.floor(t * 8) % 2] : HERO.idle[Math.floor(t * 2) % 2], x, y);
          if (t > 1.4) bubble(ctx, this.tier === 'S' ? 'よっしゃー！ 寿司だ寿司！' : 'よっしゃー！ 勝った！', x, GROUND - 34);
        } else {
          // よろけて出てきて、ばったり
          const x = x0 + k * 70;
          hero(ctx, k < 1 ? HERO.fall[0] : HERO.fall[1], x, GROUND);
          if (t > 1.5) bubble(ctx, this.tier === 'D' ? '……飴、もらった' : this.tier === 'C' ? '……' : 'まあまあ、かな', x, GROUND - 26);
        }
      }
      fade(ctx, t > 5.0 ? (t - 5.0) / 0.6 : 0);
    },
    skip() { G.go('result'); },
  };

  S.result = {
    enter() {
      const P = G.play, st = P.session.state;
      this.t = 0;
      this.yen = st.sa * YEN_PER_BALL; this.tier = mealTier(this.yen); this.meal = MEALS[this.tier];
      G.controls('result');
      this.mealFx = new FxLayer(208, 136, 8, 8); // 金粉・紙吹雪・雨は晩ごはんの絵の中だけ
      if (this.tier === 'S') { this.mealFx.spawn('goldDust', 104, 132); this.mealFx.spawn('confetti', 104, 132); }
      if (this.tier === 'D') this.mealFx.spawn('rain', 104, 136, { density: 0.8 });
      if (this.tier === 'S' || this.tier === 'A') sfx('fanfare', 0); else if (this.tier === 'D') sfx('lose');
      log('result', { machine: P.machine.id, yen: this.yen, sa: st.sa, invest: st.invest, hits: st.hitsTotal, first: st.firstHits, maxChain: st.maxChain, tier: this.tier, spins: st.spinsTotal });
    },
    leave() { G.fx.clear(); this.mealFx?.clear(); },
    update(dt) { this.t += dt; this.mealFx.update(dt); },
    draw(ctx) {
      const P = G.play, st = P.session.state;
      ctx.fillStyle = '#0b0a12'; ctx.fillRect(0, 0, W, H);
      const key = `meal${this.tier}`;
      if (!frame(ctx, key, 0, 8, 8)) { panel(ctx, 8, 8, 208, 136, '#1a1626', '#5a5070'); drawText(ctx, this.meal.name, 112, 70, { size: 14, color: '#ffffff', align: 'center' }); }
      this.mealFx.draw(ctx);
      drawText(ctx, '今夜の晩ごはん', 8, 146, { size: 10, color: '#a9a1bb' });
      drawText(ctx, this.meal.name, 8, 158, { size: 12, color: '#ffd84a', bold: true });
      drawText(ctx, `「${this.meal.line}」`, 8, 174, { size: 12, color: '#ffffff' });
      // 左の列は幅 208（x 8〜216）。台の名前まで並べると右のグラフの下にもぐるので、名前はグラフの見出しへ回す
      drawText(ctx, `${comma(st.spinsTotal)} 回転・大当り ${st.hitsTotal} 回・最高 ${st.maxChain} 連`, 8, 190, { size: 10, color: '#a9a1bb' });
      drawText(ctx, `今日の回り 千円で約 ${P.rpk} 回・ボーダー ${P.machine.border}`, 8, 202, { size: 10, color: '#7e7593' });
      // 右: 収支
      drawText(ctx, '本日の収支', 226, 10, { size: 12, color: '#d6d0e0' });
      drawText(ctx, `${signed(this.yen)} 円`, 378, 28, { size: 20, color: this.yen >= 0 ? '#ffd84a' : '#63c6ff', align: 'right', bold: true, outline: '#0b0a12' });
      drawText(ctx, '差玉', 226, 60, { size: 10, color: '#7e7593' }); drawText(ctx, `${signed(st.sa)} 発`, 378, 60, { size: 10, color: '#ffffff', align: 'right' });
      drawText(ctx, '投資', 226, 74, { size: 10, color: '#7e7593' }); drawText(ctx, `${comma(st.invest)} 円`, 378, 74, { size: 10, color: '#ffffff', align: 'right' });
      drawText(ctx, '持ち玉の換金', 226, 88, { size: 10, color: '#7e7593' }); drawText(ctx, `${comma(st.mochi * YEN_PER_BALL)} 円`, 378, 88, { size: 10, color: '#ffffff', align: 'right' });
      drawText(ctx, '最高', 226, 102, { size: 10, color: '#7e7593' }); drawText(ctx, `${signed(st.maxSa)} / 最低 ${signed(st.minSa)}`, 378, 102, { size: 10, color: '#ffffff', align: 'right' });
      drawText(ctx, P.machine.name, 226, 118, { size: 10, color: '#d6d0e0' }); // グラフの見出しは台の名前
      drawMini(ctx, P.graph, 226, 132, 152, 66, G.clock);
    },
  };

  return S;
}

// 結果の画面の小さなグラフ（列を縮めて描く）
function drawMini(ctx, g, x, y, w, h, clock) {
  ctx.fillStyle = '#0a0c24'; ctx.fillRect(x, y, w, h);
  const lo = Math.min(-5000, g.minSeen), hi = Math.max(5000, g.maxSeen);
  const Y = (v) => Math.round(y + h - 1 - ((v - lo) / (hi - lo)) * (h - 1));
  ctx.fillStyle = '#4a4470'; ctx.fillRect(x, Y(0), w, 1);
  if (hi >= 10000) { ctx.fillStyle = '#7a5a10'; for (let xx = x; xx < x + w; xx += 3) ctx.fillRect(xx, Y(10000), 1, 1); }
  if (lo <= -10000) { ctx.fillStyle = '#1a4f8c'; for (let xx = x; xx < x + w; xx += 3) ctx.fillRect(xx, Y(-10000), 1, 1); }
  const c = g.cols, n = c.count;
  let prev = Y(0);
  for (let px = 0; px < w; px++) {
    const i0 = Math.floor((px / w) * c.width), i1 = Math.max(i0 + 1, Math.floor(((px + 1) / w) * c.width));
    if (i0 >= n) break;
    let mn = Infinity, mx = -Infinity, ch = 0, last = 0;
    for (let i = i0; i < Math.min(i1, n); i++) { mn = Math.min(mn, c.min[i]); mx = Math.max(mx, c.max[i]); ch = Math.max(ch, c.chain[i]); last = c.last[i]; }
    const top = Math.min(prev, Y(mx)), bot = Math.max(prev, Y(mn));
    ctx.fillStyle = chainColor(ch, px / 20 + clock * 0.6);
    ctx.fillRect(x + px, top, 1, Math.max(2, bot - top + 1));
    prev = Y(last);
  }
}
