// 音の実験室: 「音のことば」で音楽を書いて、その場で鳴らす（ライブコーディング）。
// 動かす（Ctrl+Enter）と、鳴っている loop を止めずに、次のくり返しの頭から新しい中身に入れ替える。誤りがあれば前の版を鳴らし続ける。
// エディタは色分け（CSS の Custom Highlight API）・行番号・Tab の字下げ・鳴っている行の印。音は自分の AudioContext の時刻で先読みして予約する。
// 合成の声と打楽器は Web Audio の部品でその場で作る（音のファイルは使わない）。WAV の書き出しは同じ関数を OfflineAudioContext で使う。
// 計算（字句・構文・実行・書き換えの切り替え・見本・説明書）は core/livecode.mjs。
import * as L from '../core/livecode.mjs';
import { encodeWAV } from '../core/wav.mjs';
import { basename, dirname, stem } from '../core/path.mjs';

const TITLE = '音の実験室';
const COLORED = ['kw', 'opt', 'func', 'builtin', 'note', 'num', 'comment', 'bad'];
const LINE_H = 20, PAD = 8; // エディタの 1 行の高さと上の余白（CSS と合わせる）
const STORE = 'fos-livecode';
const BLANK = '# 新しい音\n# Ctrl+Enter で鳴らします。Esc で止めます。\n\ntempo 120\n\nloop a {\n  play C4\n  rest 1\n}\n';

const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="new"><span class="label">新規(<u>N</u>)</span></div>
    <div class="menu-item" data-command="open"><span class="label">開く(<u>O</u>)...</span><span class="shortcut">Ctrl+O</span></div>
    <div class="menu-item" data-command="save"><span class="label">上書き保存(<u>S</u>)</span><span class="shortcut">Ctrl+S</span></div>
    <div class="menu-item" data-command="saveas"><span class="label">名前を付けて保存(<u>A</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="wav" data-status="何小節かを WAV 形式の音声にして、仮想ドライブへ保存します。"><span class="label">WAV で書き出す(<u>W</u>)...</span></div>
    <div class="menu-item" data-command="wavpc" data-status="何小節かを WAV 形式の音声にして、パソコンへ保存します。"><span class="label">パソコンへ WAV を書き出す(<u>X</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>C</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="undo"><span class="label">元に戻す(<u>U</u>)</span><span class="shortcut">Ctrl+Z</span></div>
    <div class="menu-item" data-command="redo"><span class="label">やり直し(<u>R</u>)</span><span class="shortcut">Ctrl+Y</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="indent"><span class="label">字下げを深くする(<u>I</u>)</span><span class="shortcut">Tab</span></div>
    <div class="menu-item" data-command="outdent"><span class="label">字下げを戻す(<u>D</u>)</span><span class="shortcut">Shift+Tab</span></div>
    <div class="menu-item" data-command="comment" data-status="選んだ行の頭に # を付けて、鳴らさないメモにします。もう一度で戻します。"><span class="label">行をコメントにする(<u>M</u>)</span><span class="shortcut">Ctrl+/</span></div>
  </div></div>
  <div class="menu-title">演奏(<u>P</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="run" data-status="書いた音を鳴らします。鳴っている間に押すと、次のくり返しの頭から入れ替えます。"><span class="label">動かす(<u>R</u>)</span><span class="shortcut">Ctrl+Enter</span></div>
    <div class="menu-item" data-command="stop"><span class="label">止める(<u>T</u>)</span><span class="shortcut">Esc</span></div>
  </div></div>
  <div class="menu-title">見本(<u>M</u>)<div class="menu" role="menu">
    ${L.EXAMPLES.map((x, i) => `<div class="menu-item" data-command="ex:${x.id}"><span class="label">${x.name}(<u>${i + 1}</u>)</span></div>`).join('')}
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="help"><span class="label">ことばの説明書(<u>H</u>)</span><span class="shortcut">F1</span></div>
    <div class="menu-item" data-command="about"><span class="label">音の実験室について(<u>A</u>)</span></div>
  </div></div>
</div>`;
// 早見表（押すと、カーソルの所に入る）
const QUICK = [
  ['play C4', '音を鳴らす'], ['rest 1', '1 拍待つ'], ['sample kick', '打楽器'], ['chord C4 major', '和音'],
  ['repeat 4 {\n  \n}', 'くり返す'], ['synth saw', '音色を変える'], ['fx echo', 'こだま'], ['play pick [C4 E4 G4]', 'でたらめに選ぶ'],
];

/* ---------- 色分け: 窓が いくつあっても、名前ごとに 1 つの Highlight にまとめて登録する ---------- */
const PAINT = new Map();
function flushHighlights() {
  if (!('highlights' in CSS)) return; // 使えないブラウザでは、色の付かない文字のまま読める
  for (const name of [...COLORED, 'err']) {
    const ranges = [];
    for (const p of PAINT.values()) if (p[name]) ranges.push(...p[name]);
    const key = 'lc-' + name;
    if (!ranges.length) { CSS.highlights.delete(key); continue; }
    const h = new Highlight(...ranges); h.priority = name === 'err' ? 2 : 1;
    CSS.highlights.set(key, h);
  }
}

/* ---------- 音を作る部品（鳴らすときと WAV の書き出しで同じものを使う） ---------- */
// 音の文脈ごとの持ち物: 雑音（種を決めた乱数なので、書き出すたびに同じ音になる）、残響の応答、ひずみの曲線
function makeKit(ctx) {
  const sr = ctx.sampleRate, rnd = L.makeRng(20261119);
  const noise = ctx.createBuffer(1, sr, sr), d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  let impulse = null;
  const curves = new Map();
  return {
    noise,
    impulse() {
      if (impulse) return impulse;
      const n = Math.round(sr * 2.4), r = L.makeRng(7);
      impulse = ctx.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) { const c = impulse.getChannelData(ch); for (let i = 0; i < n; i++) c[i] = (r() * 2 - 1) * (1 - i / n) ** 3; }
      return impulse;
    },
    curve(amount) {
      const k = Math.round(amount * 20) / 20;
      if (!curves.has(k)) { const c = new Float32Array(1024), g = 1 + k * 15; for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.tanh(g * x) / Math.tanh(g); } curves.set(k, c); }
      return curves.get(k);
    },
  };
}
// 全体の出口: 入口 → 音の大きさをそろえる圧縮 → 音量 →（波形を見る部品）→ スピーカー
function makeMaster(ctx, withAnalyser) {
  const input = ctx.createGain(), comp = ctx.createDynamicsCompressor(), vol = ctx.createGain();
  comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  input.connect(comp).connect(vol);
  let analyser = null;
  if (withAnalyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.7; vol.connect(analyser).connect(ctx.destination); }
  else vol.connect(ctx.destination);
  return { input, vol, analyser };
}
// loop ごとの効果の通り道。fx の並びの順につなぐ
function makeBus(ctx, kit, dest, fx, spb) {
  const input = ctx.createGain(), nodes = [input];
  let node = input;
  const add = (n) => { nodes.push(n); return n; };
  for (const f of fx) {
    if (f.type === 'lowpass' || f.type === 'highpass') {
      const b = add(ctx.createBiquadFilter()); b.type = f.type; b.frequency.value = f.value; b.Q.value = 0.9;
      node.connect(b); node = b;
    } else if (f.type === 'echo') {
      const out = add(ctx.createGain()), dl = add(ctx.createDelay(5)), fb = add(ctx.createGain()), tone = add(ctx.createBiquadFilter()), wet = add(ctx.createGain());
      dl.delayTime.value = Math.min(4.9, f.value * spb); fb.gain.value = 0.45; wet.gain.value = 0.6; tone.type = 'lowpass'; tone.frequency.value = 3600;
      node.connect(out); node.connect(dl); dl.connect(tone); tone.connect(fb); fb.connect(dl); tone.connect(wet); wet.connect(out);
      node = out;
    } else if (f.type === 'reverb') {
      const out = add(ctx.createGain()), conv = add(ctx.createConvolver()), wet = add(ctx.createGain()), dry = add(ctx.createGain());
      conv.buffer = kit.impulse(); wet.gain.value = f.value * 0.9; dry.gain.value = 1 - f.value * 0.4;
      node.connect(dry); dry.connect(out); node.connect(conv); conv.connect(wet); wet.connect(out);
      node = out;
    } else if (f.type === 'distort') {
      const ws = add(ctx.createWaveShaper()), post = add(ctx.createGain());
      ws.curve = kit.curve(f.value); ws.oversample = '2x'; post.gain.value = 1 / (1 + f.value * 3); // ひずませると大きくなる分を下げる
      node.connect(ws); ws.connect(post); node = post;
    }
  }
  node.connect(dest);
  return { input, nodes };
}
const VOL = { sine: 0.3, tri: 0.3, square: 0.13, saw: 0.15, pluck: 0.3, bell: 0.22, pad: 0.1 };
// 1 つの音（note か sample）を、ev.time に鳴るよう予約する
function playEvent(ctx, kit, dest, ev) {
  if (!(ev.amp > 0)) return;
  const t = Math.max(ev.time, ctx.currentTime);
  let out = dest;
  if (ev.pan) { const p = ctx.createStereoPanner(); p.pan.value = ev.pan; p.connect(dest); out = p; }
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  // 雑音は 1 秒の音をくり返して使う。始める位置を時刻で変えて、毎回まったく同じ音にならないようにする
  const noise = (dur) => { const s = ctx.createBufferSource(); s.buffer = kit.noise; s.loop = true; s.start(t, (ev.time * 7.31) % 0.4, dur + 0.05); return s; };
  // 鳴り始めて、すぐ消える形（打楽器）。v から 0.001 まで指数で下げる
  const hit = (g, v, len) => { g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + len); };
  if (ev.kind === 'sample') {
    const r = ev.rate || 1, a = ev.amp;
    switch (ev.name) {
      case 'kick': {
        const o = osc('sine', 160 * r), g = gain();
        o.frequency.setValueAtTime(160 * r, t); o.frequency.exponentialRampToValueAtTime(44 * r, t + 0.12 / r);
        hit(g, 0.95 * a, 0.45 / r); o.connect(g).connect(out); o.start(t); o.stop(t + 0.5 / r);
        const n = noise(0.02), hp = ctx.createBiquadFilter(), ng = gain(); hp.type = 'highpass'; hp.frequency.value = 1800;
        hit(ng, 0.25 * a, 0.015); n.connect(hp).connect(ng).connect(out);
        break;
      }
      case 'snare': {
        const n = noise(0.25 / r), bp = ctx.createBiquadFilter(), ng = gain(); bp.type = 'highpass'; bp.frequency.value = 1300 * r;
        hit(ng, 0.5 * a, 0.2 / r); n.connect(bp).connect(ng).connect(out);
        const o = osc('triangle', 190 * r), g = gain();
        o.frequency.setValueAtTime(200 * r, t); o.frequency.exponentialRampToValueAtTime(150 * r, t + 0.06);
        hit(g, 0.45 * a, 0.1 / r); o.connect(g).connect(out); o.start(t); o.stop(t + 0.12 / r);
        break;
      }
      case 'hat': case 'openhat': {
        const len = (ev.name === 'hat' ? 0.05 : 0.35) / r;
        const n = noise(len), hp = ctx.createBiquadFilter(), ng = gain(); hp.type = 'highpass'; hp.frequency.value = Math.min(16000, (ev.name === 'hat' ? 7000 : 6500) * r);
        hit(ng, (ev.name === 'hat' ? 0.35 : 0.28) * a, len); n.connect(hp).connect(ng).connect(out);
        break;
      }
      case 'clap': {
        const n = noise(0.25 / r), bp = ctx.createBiquadFilter(), ng = gain(); bp.type = 'bandpass'; bp.frequency.value = 1200 * r; bp.Q.value = 1.1;
        // 手を何人かで打ったように、短い音を 3 回重ねてから消す
        for (const k of [0, 0.011, 0.022]) { ng.gain.setValueAtTime(0.6 * a, t + k); ng.gain.exponentialRampToValueAtTime(0.06 * a + 0.001, t + k + 0.01); }
        ng.gain.setValueAtTime(0.55 * a, t + 0.033); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.033 + 0.18 / r);
        n.connect(bp).connect(ng).connect(out);
        break;
      }
      case 'tom': {
        const o = osc('sine', 190 * r), g = gain();
        o.frequency.setValueAtTime(190 * r, t); o.frequency.exponentialRampToValueAtTime(100 * r, t + 0.25 / r);
        hit(g, 0.8 * a, 0.4 / r); o.connect(g).connect(out); o.start(t); o.stop(t + 0.45 / r);
        break;
      }
      case 'rim': {
        const o = osc('triangle', 1650 * r), g = gain(); hit(g, 0.35 * a, 0.045); o.connect(g).connect(out); o.start(t); o.stop(t + 0.06);
        const n = noise(0.03), hp = ctx.createBiquadFilter(), ng = gain(); hp.type = 'highpass'; hp.frequency.value = 4000;
        hit(ng, 0.22 * a, 0.02); n.connect(hp).connect(ng).connect(out);
        break;
      }
      default: break;
    }
    return;
  }
  // 合成の声
  const f = ev.freq, dur = Math.max(0.02, ev.dur), amp = ev.amp * (VOL[ev.synth] ?? 0.2);
  switch (ev.synth) {
    case 'pluck': {
      const g = gain(), lp = ctx.createBiquadFilter(), o1 = osc('sawtooth', f), o2 = osc('square', f * 1.003);
      lp.type = 'lowpass'; lp.Q.value = 1;
      lp.frequency.setValueAtTime(Math.min(16000, f * 9), t); lp.frequency.exponentialRampToValueAtTime(Math.min(16000, f * 1.6), t + 0.25);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0005, t + dur + 0.05);
      const m = gain(0.5); o1.connect(lp); o2.connect(m).connect(lp); lp.connect(g).connect(out);
      for (const o of [o1, o2]) { o.start(t); o.stop(t + dur + 0.08); }
      break;
    }
    case 'bell': {
      const c = osc('sine', f), m = osc('sine', f * 3.5), mg = gain(), g = gain();
      mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + dur + 0.3);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0005, t + dur + 0.35);
      m.connect(mg).connect(c.frequency); c.connect(g).connect(out);
      for (const o of [c, m]) { o.start(t); o.stop(t + dur + 0.4); }
      break;
    }
    case 'pad': {
      const g = gain(), lp = ctx.createBiquadFilter(), a = Math.min(0.4, dur * 0.35), r = Math.min(0.6, dur * 0.35);
      lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, Math.max(900, f * 5)); lp.Q.value = 0.5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + a); g.gain.setValueAtTime(amp, t + dur - r); g.gain.linearRampToValueAtTime(0, t + dur);
      for (const cents of [-9, 0, 9]) { const o = osc('sawtooth', f); o.detune.value = cents; o.connect(lp); o.start(t); o.stop(t + dur + 0.02); }
      lp.connect(g).connect(out);
      break;
    }
    default: {
      // sine・tri・square・saw: 立ち上がり → 少し下がって保つ → 消える
      const o = osc(ev.synth === 'tri' ? 'triangle' : ev.synth === 'saw' ? 'sawtooth' : ev.synth === 'square' ? 'square' : 'sine', f), g = gain();
      const a = 0.005, r = Math.min(0.12, dur * 0.4), dd = Math.max(0, Math.min(0.1, (dur - a - r) / 2));
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + a); g.gain.linearRampToValueAtTime(amp * 0.8, t + a + dd);
      g.gain.setValueAtTime(amp * 0.8, t + dur - r); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
    }
  }
}
// 止まっている間も画面を固めないよう、長い計算の途中で順番を譲る（scheduler.yield が無ければ setTimeout）
const yieldNow = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, esc } = os;
  let path = args.path || null, docName = null, text = null;
  if (path) {
    try { text = await fs.readText(path); docName = basename(path); }
    catch (e) { os.msgbox({ title: TITLE, text: `ファイルを読めませんでした。\n\n${e.message}`, icon: 'error' }); log('livecode.open', { path }, 'error: ' + e.message); path = null; }
  }
  if (text == null) {
    if (args.blank) { text = BLANK; docName = '無題'; }
    else { text = L.EXAMPLES[0].code; docName = `${L.EXAMPLES[0].name}（見本）`; }
  }
  let saved = text, lastMsg = '', escTab = false;
  let store = {}; try { store = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { /* 読めない */ }
  let volume = typeof store.volume === 'number' ? store.volume : 0.8, scopeMode = store.scope === 'spec' ? 'spec' : 'wave';
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify({ volume, scope: scopeMode, bars: store.bars })); } catch { /* 保存できない */ } };

  const win = wm.open({
    app: 'livecode', icon: 'icons/livecode.svg', className: 'app-livecode', title: TITLE, w: 1000, h: 660, ...rect, args: path ? { path } : {},
    render(w) {
      w.body.innerHTML = MENU + `
      <div class="lc-bar" role="toolbar" aria-label="演奏の操作">
        <button type="button" class="flat lc-btn lc-run" data-a="run" title="動かす (Ctrl+Enter)">▶ 動かす(<u>R</u>)</button>
        <button type="button" class="flat lc-btn" data-a="stop" title="止める (Esc)" disabled>■ 止める(<u>T</u>)</button>
        <span class="lc-tempo" data-tempo aria-label="速さ">♩ = 120</span>
        <label class="lc-vol" for="lcVol-${w.id}">音量(<u>V</u>):</label><input type="range" id="lcVol-${w.id}" data-vol min="0" max="100" step="1">
        <span class="lc-gap"></span>
        <button type="button" class="flat lc-btn" data-a="help" title="ことばの説明書 (F1)">説明書(<u>B</u>)</button>
      </div>
      <div class="lc-err" data-err hidden><span class="lc-err-mark" aria-hidden="true">!</span><span class="lc-err-text" data-errtext></span><button type="button" class="flat lc-mini" data-a="goerr">その行へ(<u>G</u>)</button></div>
      <div class="lc-body">
        <section class="lc-edit" aria-label="エディタ">
          <div class="lc-gutter" aria-hidden="true" data-gutter></div>
          <div class="lc-code">
            <div class="lc-marks" aria-hidden="true" data-marks></div>
            <pre class="lc-pre" aria-hidden="true"><code data-hl></code></pre>
            <textarea class="lc-ta" data-ta spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="音のことば。Ctrl+Enter で動かし、Esc で止めます。Tab で字下げ、Esc のあとの Tab でエディタの外へ移ります。"></textarea>
          </div>
        </section>
        <aside class="lc-side" aria-label="音の様子と早見表">
          <div class="lc-head"><span>音の形</span><button type="button" class="flat lc-mini" data-a="scope" aria-pressed="false">波形(<u>W</u>)</button></div>
          <canvas class="lc-scope" data-scope role="img" aria-label="鳴っている音の形"></canvas>
          <div class="lc-head"><span>動いている loop</span><span class="lc-dim" data-nloops></span></div>
          <ul class="lc-loops" data-loops></ul>
          <div class="lc-head"><span>早見表</span><span class="lc-dim">押すと入ります</span></div>
          <ul class="lc-quick">${QUICK.map(([code, what], i) => `<li><button type="button" class="flat lc-q" data-insert="${i}"><code>${esc(code.split('\n')[0])}${code.includes('\n') ? ' }' : ''}</code><span>${what}</span></button></li>`).join('')}</ul>
        </aside>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:110px" data-pos></div><div class="status-field" style="width:170px" data-play></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      if (!dirty()) return true;
      const a = await os.msgbox({ title: TITLE, text: `${docName} は変更されています。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return await save();
      return true;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const ta = q('[data-ta]'), hl = q('[data-hl]'), pre = q('.lc-pre'), gutter = q('[data-gutter]'), marks = q('[data-marks]'), scope = q('[data-scope]'), sx = scope.getContext('2d');
  const dirty = () => ta.value !== saved;
  const title = () => win.setTitle(`${dirty() ? '*' : ''}${docName} - ${TITLE}`);
  function say(t, kind = '') { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; const f = q('.status-field[data-status]'); f.textContent = m; f.dataset.kind = kind; }

  /* ---------- 音を鳴らす仕組み ---------- */
  let ac = null, kit = null, master = null, liveRoot = null, audioErr = null, timer = 0, raf = 0, lastSound = 0, runN = 0;
  const engine = new L.Engine(), buses = new Map(), timeline = new Map(), rec = [], runs = [];
  let ranText = null, errInfo = null, lastWav = null;
  function ensureAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    try {
      ac = new AudioContext({ latencyHint: 'interactive' });
      kit = makeKit(ac); master = makeMaster(ac, true); applyVolume();
      log('livecode.audio', { rate: ac.sampleRate }, 'ok');
      return true;
    } catch (e) { audioErr = e.message; ac = null; log('livecode.audio', {}, 'error: ' + e.message); return false; }
  }
  function applyVolume() { if (!master) return; const s = os.getSettings(); master.vol.gain.value = s.mute ? 0 : volume * s.volume; }
  const onSettings = () => applyVolume();
  os.events.addEventListener('settings', onSettings);
  // loop と効果の組ごとの通り道。効果が変わったら新しく作り、前のものは余韻が消えてから外す
  function busFor(it) {
    const key = `${it.loop}|${JSON.stringify(it.fx)}|${it.fx.some((f) => f.type === 'echo') ? it.spb : ''}`;
    let b = buses.get(key);
    if (!b) { b = makeBus(ac, kit, liveRoot, it.fx, it.spb); buses.set(key, b); }
    b.until = it.time + it.beats * it.spb;
    return b;
  }
  function dropOldBuses() {
    const now = ac.currentTime;
    for (const [k, b] of buses) if (b.until + 12 < now) { for (const n of b.nodes) n.disconnect(); buses.delete(k); }
  }
  function schedule(its) {
    const now = ac.currentTime;
    for (const it of its) {
      const bus = busFor(it);
      rec.push({ kind: 'iter', loop: it.loop, iter: it.iter, ver: it.ver, time: it.time, beats: it.beats, fx: it.fx.map((f) => ({ ...f })) });
      let arr = timeline.get(it.loop); if (!arr) timeline.set(it.loop, (arr = []));
      for (const ev of it.events) {
        arr.push(ev);
        if (ev.kind === 'rest') continue;
        rec.push({ kind: ev.kind, loop: ev.loop, iter: ev.iter, ver: it.ver, time: ev.time, midi: ev.midi, name: ev.name, synth: ev.synth, dur: ev.dur, line: ev.line });
        if (ev.time < now - 0.05) continue; // 遅れすぎた音は鳴らさない（窓が隠れて時計が止まっていたときなど）
        playEvent(ac, kit, bus.input, ev);
      }
    }
    if (rec.length > 6000) rec.splice(0, rec.length - 5000);
  }
  function tick() {
    if (!engine.playing || !ac) return;
    const now = ac.currentTime;
    schedule(engine.advance(now + (document.hidden ? 1.6 : 0.3)));
    if (engine.errors.length) {
      for (const er of engine.errors) {
        const where = er.loop ? `loop「${er.loop}」` : 'loop の外の命令';
        showError(er, null, `${where}を止めました。${L.formatError(er)}`);
        log('livecode.runtime', { loop: er.loop, line: er.line, col: er.col }, 'error: ' + er.message);
      }
      engine.errors = [];
    }
    dropOldBuses();
    // 1 回だけの命令しか無く、それも鳴り終えたら、止まった状態に戻す
    if (!engine.loops.size) {
      const end = Math.max(0, ...[...timeline.values()].flat().map((e) => e.time + e.dur));
      if (now > end + 0.3) finish('鳴り終えました。Ctrl+Enter でもう一度鳴らします。');
    }
  }
  function newLiveRoot() { liveRoot = ac.createGain(); liveRoot.connect(master.input); }
  function fadeOut() {
    const r = liveRoot; if (!r) return;
    r.gain.setTargetAtTime(0, ac.currentTime, 0.015);
    setTimeout(() => { try { r.disconnect(); } catch { /* 外し済み */ } }, 250);
    liveRoot = null;
    for (const b of buses.values()) setTimeout(() => b.nodes.forEach((n) => n.disconnect()), 260);
    buses.clear();
  }
  function finish(msg) {
    engine.stop(); clearInterval(timer); timer = 0; fadeOut(); timeline.clear();
    lastSound = performance.now(); paintNow(); drawLoops(); drawPlayState();
    if (msg) say(msg);
  }

  /* ---------- 動かす・止める ---------- */
  function run() {
    const src = ta.value, r = L.compile(src);
    runN++;
    if (!r.ok) {
      showError(r.error, src);
      runs.push({ n: runN, at: ac ? ac.currentTime : 0, ok: false, line: r.error.line, col: r.error.col, message: r.error.message, playing: engine.playing });
      log('livecode.run', { line: r.error.line, col: r.error.col }, 'error: ' + r.error.message);
      say(engine.playing ? '誤りがあるので、前の版を鳴らし続けています。直してから、もう一度 Ctrl+Enter を押します。' : '誤りがあるので、鳴らせません。赤い印の行を直してから、もう一度 Ctrl+Enter を押します。', 'error');
      return false;
    }
    const p = r.program;
    if (!p.loops.length && !p.once.length) { clearError(); say('鳴らす命令がありません。loop 名前 { … } の中に play や sample と rest を書きます。'); return false; }
    if (!ensureAudio()) { os.msgbox({ title: TITLE, text: `音を鳴らせません。\n\n${audioErr}\n\nWAV の書き出しは使えます。`, icon: 'warning' }); return false; }
    clearError();
    const was = engine.playing;
    if (!was) { newLiveRoot(); rec.length = 0; }
    engine.run(p, ac.currentTime, { lead: 0.12 });
    runs.push({ n: runN, at: ac.currentTime, ok: true, ver: engine.ver, loops: p.loops.map((l) => l.name), tempo: p.tempo, playing: was });
    ranText = src;
    if (!timer) timer = setInterval(tick, 25);
    tick(); animate(); drawPlayState();
    showTempo(p.tempo);
    const n = p.loops.length;
    say(was ? '書き換えました。それぞれの loop は、次のくり返しの頭から新しい中身になります。'
      : n ? `鳴らしています（loop ${n} つ）。書き換えて Ctrl+Enter を押すと、鳴らしたまま入れ替わります。Esc で止めます。`
        : 'loop の外の命令を 1 回だけ鳴らしています。くり返すときは loop 名前 { … } の中に書きます。');
    log('livecode.run', { loops: p.loops.map((l) => l.name), tempo: p.tempo, update: was }, 'ok');
    return true;
  }
  // 速さの表示。鳴らす前は、書いてある文字を解析して出す（誤りがあれば前の表示のまま）
  function showTempo(t) {
    if (t == null) { const r = L.compile(ta.value); if (!r.ok) return; t = r.program.tempo; }
    q('[data-tempo]').textContent = `♩ = ${Math.round(t * 10) / 10}`;
  }
  function stop() {
    if (!engine.playing) return;
    finish('止めました。Ctrl+Enter でもう一度鳴らします。');
    log('livecode.stop', {}, 'ok');
  }
  function drawPlayState() {
    const on = engine.playing, n = engine.status().length;
    q('[data-a="stop"]').disabled = !on;
    q('[data-play]').textContent = on ? `▶ 鳴っています${n ? `（loop ${n}）` : ''}` : '■ 止まっています';
    q('.lc-run').classList.toggle('on', on);
  }

  /* ---------- 誤りの印 ---------- */
  function showError(e, src, label) {
    errInfo = { ...e, src };
    q('[data-errtext]').textContent = label || L.formatError(e);
    q('[data-err]').hidden = false;
    paintMarks(); paint();
  }
  function clearError() { errInfo = null; q('[data-err]').hidden = true; paintMarks(); paint(); }
  function gotoLine(line, col = 1, len = 0) {
    const lines = ta.value.split('\n'); let i = 0;
    for (let k = 0; k < Math.max(0, line - 1) && k < lines.length; k++) i += lines[k].length + 1;
    const s = i + Math.max(0, col - 1);
    ta.focus({ preventScroll: true }); ta.setSelectionRange(s, s + len);
    const top = (line - 1) * LINE_H;
    if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - LINE_H * 2) ta.scrollTop = Math.max(0, top - LINE_H * 4);
    syncScroll(); caret();
  }

  /* ---------- エディタ: 色分け・行番号・印 ---------- */
  let paintQueued = 0, gutterLines = 0;
  function paint() {
    paintQueued = 0;
    const src = ta.value;
    hl.textContent = src + '\n\n\n'; // 長い行で文字の欄にだけ横のスクロールバーが出ても、色の層が同じだけ送れるように
    const n = src.split('\n').length;
    if (n !== gutterLines) { gutterLines = n; gutter.innerHTML = Array.from({ length: n }, (_, i) => `<div>${i + 1}</div>`).join('') + '<div></div><div></div><div></div>'; paintMarks(); }
    syncScroll();
    const node = hl.firstChild, groups = {};
    if (node && src.length < 200000) {
      for (const t of L.tokenize(src)) {
        if (!COLORED.includes(t.type)) continue;
        const r = new Range(); r.setStart(node, t.start); r.setEnd(node, t.end);
        (groups[t.type] ||= []).push(r);
      }
      // 誤りの字句には波線（書き換える前の文字のときだけ。位置がずれるため）
      if (errInfo && errInfo.src === src && errInfo.start != null && errInfo.start < src.length) {
        const r = new Range(); r.setStart(node, errInfo.start); r.setEnd(node, Math.min(src.length, errInfo.start + errInfo.len)); groups.err = [r];
      }
    }
    PAINT.set(win.id, groups);
    flushHighlights();
  }
  const schedulePaint = () => { if (!paintQueued) paintQueued = requestAnimationFrame(paint); };
  function syncScroll() {
    pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop;
    marks.style.translate = `0 ${-ta.scrollTop}px`;
  }
  // 行の帯: 誤りの行（赤）と、鳴っている行（水色）。行番号にも同じ印を付ける
  let nowLines = new Set();
  function paintMarks() {
    const bars = [];
    if (errInfo && errInfo.line) bars.push(`<div class="lc-bar-err" style="top:${PAD + (errInfo.line - 1) * LINE_H}px"></div>`);
    for (const l of nowLines) bars.push(`<div class="lc-bar-now" style="top:${PAD + (l - 1) * LINE_H}px"></div>`);
    marks.innerHTML = bars.join('');
    gutter.querySelectorAll('.err, .now').forEach((d) => d.classList.remove('err', 'now'));
    if (errInfo && errInfo.line) gutter.children[errInfo.line - 1]?.classList.add('err');
    for (const l of nowLines) gutter.children[l - 1]?.classList.add('now');
  }
  // 今 鳴っている行: loop ごとに、今の時刻より前で いちばん新しい時刻の命令（同じ時刻のものは全部）
  function paintNow() {
    const next = new Set();
    if (engine.playing && ac && ta.value === ranText) {
      const t = ac.currentTime;
      for (const arr of timeline.values()) {
        while (arr.length > 2 && arr[1].time + arr[1].dur < t - 4) arr.shift(); // 古い印を捨てる
        let i = arr.length - 1; while (i >= 0 && arr[i].time > t) i--;
        if (i < 0) continue;
        const T = arr[i].time; let end = 0;
        for (let j = i; j >= 0 && arr[j].time === T; j--) { next.add(arr[j].line); end = Math.max(end, arr[j].time + arr[j].dur); }
        if (t > end + 0.05 && i === arr.length - 1) for (let j = i; j >= 0 && arr[j].time === T; j--) next.delete(arr[j].line);
      }
    }
    if (next.size === nowLines.size && [...next].every((l) => nowLines.has(l))) return;
    nowLines = next; paintMarks();
  }
  function caret() {
    const before = ta.value.slice(0, ta.selectionStart).split('\n');
    q('[data-pos]').textContent = `${before.length} 行 ${before[before.length - 1].length + 1} 列`;
  }
  // 文字を入れる（execCommand なら「元に戻す」が効く。使えなければ setRangeText）
  function insert(t) { if (!document.execCommand?.('insertText', false, t)) ta.setRangeText(t, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
  // 計算した新しい文字に置き換える。変わった所だけを入れ直して、元に戻せるようにする
  function replaceText(next, s, e) {
    const old = ta.value; let a = 0, b = 0;
    while (a < old.length && a < next.length && old[a] === next[a]) a++;
    while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
    ta.setSelectionRange(a, old.length - b); insert(next.slice(a, next.length - b));
    ta.setSelectionRange(s, e); caret();
  }
  function indent(dir) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    if (dir > 0 && !ta.value.slice(s, e).includes('\n')) { insert('  '); return; }
    const r = L.indentLines(ta.value, s, e, dir); if (r.text !== ta.value) replaceText(r.text, r.start, r.end);
  }
  function comment() { const r = L.toggleComment(ta.value, ta.selectionStart, ta.selectionEnd); replaceText(r.text, r.start, r.end); }
  // Esc のあとでも、文字を入れたり押したりしたら、Tab は字下げに戻す
  ta.addEventListener('input', () => { escTab = false; schedulePaint(); title(); if (nowLines.size && ta.value !== ranText) paintNow(); });
  ta.addEventListener('pointerdown', () => { escTab = false; });
  ta.addEventListener('scroll', syncScroll);
  ta.addEventListener('keyup', caret); ta.addEventListener('click', caret);
  ta.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return; // かな漢字変換の途中のキーは、変換の操作
    // 鳴っているときの Esc は止めるだけ（窓のキーで行う）。止まっているときの Esc のあとの Tab で、エディタの外へ移れる
    if (e.key === 'Escape') { if (!engine.playing) escTab = true; return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      if (escTab) { escTab = false; return; }
      e.preventDefault(); indent(e.shiftKey ? -1 : 1); return;
    }
    escTab = false;
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      const s = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      e.preventDefault(); insert('\n' + L.nextIndent(ta.value.slice(s, ta.selectionStart)));
    } else if (e.key === '}' && !e.ctrlKey && !e.altKey) {
      // 空白だけの行で } を打つと、1 段 戻してから入れる
      const s = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1, before = ta.value.slice(s, ta.selectionStart);
      if (before.length >= 2 && /^ +$/.test(before) && ta.selectionStart === ta.selectionEnd) { e.preventDefault(); ta.setSelectionRange(ta.selectionStart - 2, ta.selectionStart); insert('}'); }
    } else if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); comment(); }
  });

  /* ---------- 音の形（波形かスペクトル）と、loop の一覧 ---------- */
  const wave = new Float32Array(2048), bins = new Uint8Array(1024);
  let listAt = 0;
  function cssVar(n, d) { return getComputedStyle(scope).getPropertyValue(n).trim() || d; }
  function drawScope() {
    const r = scope.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), W = Math.max(1, r.width), H = Math.max(1, r.height);
    if (scope.width !== Math.round(W * dpr) || scope.height !== Math.round(H * dpr)) { scope.width = Math.round(W * dpr); scope.height = Math.round(H * dpr); }
    sx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sx.fillStyle = cssVar('--lc-screen', '#1b1036'); sx.fillRect(0, 0, W, H);
    sx.fillStyle = 'rgb(255 255 255 / 0.08)';
    for (let x = 0; x < W; x += W / 8) sx.fillRect(Math.round(x), 0, 1, H);
    sx.fillRect(0, Math.round(H / 2), W, 1);
    const an = master?.analyser;
    if (scopeMode === 'spec') {
      if (an) an.getByteFrequencyData(bins);
      const n = 40, sr = ac ? ac.sampleRate : 48000, bw = W / n;
      sx.fillStyle = cssVar('--fos-sunset', '#ff8ec7');
      for (let i = 0; i < n; i++) {
        // 40 Hz〜16 kHz を対数で区切る
        const f0 = 40 * (400 ** (i / n)), f1 = 40 * (400 ** ((i + 1) / n));
        const b0 = Math.floor((f0 / (sr / 2)) * bins.length), b1 = Math.max(b0 + 1, Math.floor((f1 / (sr / 2)) * bins.length));
        let m = 0; for (let b = b0; b < b1 && b < bins.length; b++) m = Math.max(m, an ? bins[b] : 0);
        const h = (m / 255) * (H - 6);
        sx.fillRect(i * bw + 1, H - 3 - h, Math.max(1, bw - 2), h);
      }
    } else {
      sx.strokeStyle = cssVar('--fos-aqua', '#6bf2e3'); sx.lineWidth = 1.5; sx.beginPath();
      if (an) {
        an.getFloatTimeDomainData(wave);
        let s0 = 0; for (let i = 1; i < wave.length / 2; i++) if (wave[i - 1] < 0 && wave[i] >= 0) { s0 = i; break; } // 上がりながら 0 を横切る所から描く
        const n = wave.length / 2;
        for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * W, y = H / 2 - wave[s0 + i] * (H / 2 - 4) * 1.4; i ? sx.lineTo(x, y) : sx.moveTo(x, y); }
      } else { sx.moveTo(0, H / 2); sx.lineTo(W, H / 2); }
      sx.stroke();
    }
  }
  function drawLoops() {
    const list = engine.playing ? engine.status() : [], el = q('[data-loops]');
    q('[data-nloops]').textContent = list.length ? `${list.length} つ` : '';
    if (!list.length) { el.innerHTML = `<li class="lc-empty">${engine.playing ? 'loop の外の命令を 1 回だけ鳴らしています。' : '止まっています。Ctrl+Enter で鳴らします。'}</li>`; return; }
    const lines = new Map((engine.program?.loops || []).map((l) => [l.name, l.line])), t = ac ? ac.currentTime : 0;
    el.innerHTML = list.map((s) => {
      // 今 鳴っているくり返しの番号（先読みして計算した分は数えない）。まだ始まっていなければ、始まる時を出す
      const arr = timeline.get(s.name) || [];
      let i = arr.length - 1; while (i >= 0 && arr[i].time > t) i--;
      const started = i >= 0, state = s.ending ? 'このくり返しで止まります' : started ? '鳴っています' : '次の小節の頭から始まります';
      return `<li class="lc-loop${s.ending ? ' ending' : ''}" data-line="${lines.get(s.name) || 1}" title="押すと、この loop の行へ移ります"><b>${esc(s.name)}</b><span>${started ? `${arr[i].iter + 1} 回目` : '待っています'}</span><span>${state}</span></li>`;
    }).join('');
  }
  function animate() {
    if (raf) return;
    const loop = () => {
      if (!win.min) { drawScope(); paintNow(); }
      const t = performance.now();
      if (t - listAt > 200) { listAt = t; drawLoops(); drawPlayState(); }
      if (engine.playing || t - lastSound < 1500) raf = requestAnimationFrame(loop);
      else { raf = 0; drawScope(); drawLoops(); }
    };
    raf = requestAnimationFrame(loop);
  }
  new ResizeObserver(() => drawScope()).observe(scope);

  /* ---------- 保存と開く ---------- */
  async function save() {
    if (!path) return saveAs();
    try {
      const t = ta.value;
      await fs.write(path, t, 'text/plain;charset=utf-8');
      saved = t; os.addRecent(path); title(); say(`保存しました: ${path}`); log('livecode.save', { path, chars: t.length }, 'ok');
      return true;
    } catch (e) { os.msgbox({ title: TITLE, text: e.message, icon: 'error' }); log('livecode.save', { path }, 'error: ' + e.message); return false; }
  }
  async function saveAs() {
    const name = path ? basename(path) : `${docName.replace(/（見本）$/, '')}.oto`;
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/音楽', name, exts: ['.oto'], typeLabel: '音のことば' });
    if (!p) return false;
    path = p; docName = basename(p); win.setArgs({ path });
    return save();
  }
  async function loadExample(id) {
    const ex = L.EXAMPLES.find((x) => x.id === id); if (!ex) return;
    if (dirty()) {
      const a = await os.msgbox({ title: TITLE, text: `${docName} は変更されています。\n\n見本「${ex.name}」に入れ替えますか?（元に戻す で戻せます）`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
    }
    ta.focus(); ta.select(); insert(ex.code); // 元に戻す で前の文字に戻れるように、文字を入れる操作で入れ替える
    ta.setSelectionRange(0, 0); ta.scrollTop = 0; syncScroll();
    path = null; docName = `${ex.name}（見本）`; saved = ex.code; win.setArgs({}); title(); caret();
    if (!engine.playing) showTempo();
    say(`見本「${ex.name}」を入れました。Ctrl+Enter で鳴らします。`);
    log('livecode.example', { id }, 'ok');
  }

  /* ---------- WAV の書き出し ---------- */
  function askBars(tempo) {
    return new Promise((done) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'window dialog lc-dlg';
      dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">WAV で書き出す</div></div><div class="window-body">
        <p>今のことばを、始めから何小節か鳴らした音にします。1 小節は 4 拍です。</p>
        <div class="lc-askrow"><label for="lcBars">小節の数(<u>N</u>):</label><input id="lcBars" type="number" min="1" max="32" step="1" value="${store.bars || 4}"><span data-sec></span></div>
        <div class="button-row"><button type="button" class="default" data-ok>OK</button><button type="button" data-cancel>キャンセル</button></div></div>`;
      const input = dlg.querySelector('#lcBars'), sec = dlg.querySelector('[data-sec]');
      const show = () => { const b = Math.round(+input.value); sec.textContent = b >= 1 && b <= 32 ? `（${L.barsToSeconds(b, tempo).toFixed(1)} 秒）` : '（1〜32 にします）'; };
      const finish = (v) => { dlg.close(); dlg.remove(); done(v); };
      input.addEventListener('input', show);
      dlg.querySelector('[data-ok]').addEventListener('click', () => { const b = Math.round(+input.value); if (!(b >= 1 && b <= 32)) { os.sound.play('error'); input.focus(); return; } finish(b); });
      dlg.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); dlg.querySelector('[data-ok]').click(); } });
      document.body.append(dlg); dlg.showModal(); input.focus(); input.select(); show();
    });
  }
  // 鳴らすときと同じ計算（Engine → playEvent・makeBus）を OfflineAudioContext で描き出す
  async function renderRaw(program, bars) {
    const sr = 44100, secs = L.barsToSeconds(bars, program.tempo), tail = 2.5, lead = 0.02;
    const oc = new OfflineAudioContext(2, Math.ceil((secs + lead + tail) * sr), sr);
    const k = makeKit(oc), m = makeMaster(oc, false), root = oc.createGain(); root.connect(m.input);
    const eng = new L.Engine(); eng.run(program, 0, { lead });
    const its = eng.advance(secs + lead - 1e-6), bs = new Map();
    let deadline = performance.now() + 50, count = 0;
    for (const it of its) {
      const key = `${it.loop}|${JSON.stringify(it.fx)}|${it.spb}`;
      if (!bs.has(key)) bs.set(key, makeBus(oc, k, root, it.fx, it.spb));
      for (const ev of it.events) if (ev.kind !== 'rest' && ev.time < secs + lead) { playEvent(oc, k, bs.get(key).input, ev); count++; }
      if (performance.now() >= deadline) { await yieldNow(); deadline = performance.now() + 50; }
    }
    return { buf: await oc.startRendering(), count };
  }
  async function renderWAV(program, bars) {
    const { buf, count } = await renderRaw(program, bars), sr = buf.sampleRate;
    const chans = [buf.getChannelData(0), buf.getChannelData(1)];
    let peak = 0, sum = 0;
    for (const c of chans) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; sum += v * v; }
    const rms = Math.sqrt(sum / (chans[0].length * 2));
    return { blob: new Blob([encodeWAV(chans, sr)], { type: 'audio/wav' }), peak, rms, secs: buf.duration, notes: count };
  }
  async function exportWav(toPc) {
    const r = L.compile(ta.value);
    if (!r.ok) { showError(r.error, ta.value); say('誤りがあるので、書き出せません。赤い印の行を直します。', 'error'); return; }
    const bars = await askBars(r.program.tempo); if (!bars) return;
    store.bars = bars; persist();
    const base = path ? stem(path) : docName.replace(/（見本）$/, '');
    let p = null;
    if (!toPc) { p = await os.fileDialog({ mode: 'save', dir: '/音楽', name: base + '.wav', exts: ['.wav'], typeLabel: 'WAV 音声' }); if (!p) return; }
    say('WAV を作っています…');
    try {
      const out = await renderWAV(r.program, bars);
      lastWav = { path: p, bars, bytes: out.blob.size, peak: out.peak, rms: out.rms, secs: out.secs, notes: out.notes };
      if (toPc) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(out.blob); a.download = base + '.wav'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        say(`${base}.wav をパソコンへ書き出しました（${bars} 小節）。`); log('livecode.wavpc', { bars, bytes: out.blob.size, peak: out.peak }, 'ok');
      } else {
        await fs.write(p, out.blob);
        say(`書き出しました: ${p}（${bars} 小節・${fs.human(out.blob.size)}）`); os.sound.play('notify'); log('livecode.wav', { path: p, bars, bytes: out.blob.size, peak: out.peak }, 'ok');
      }
      if (out.peak < 1e-4) say('書き出しましたが、音が入っていません。play や sample があるか確かめます。', 'error');
    } catch (e) {
      os.msgbox({ title: TITLE, text: `WAV を書き出せませんでした。\n\n${e.message}`, icon: 'error' }); log('livecode.wav', { path: p }, 'error: ' + e.message);
    }
  }

  /* ---------- 説明書 ---------- */
  function help() {
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog lc-help';
    const names = (o) => Object.entries(o).map(([k, v]) => `<li><code>${k}</code> ${esc(Array.isArray(v) ? v[0] : v)}</li>`).join('');
    // 例の字下げは、いちばん浅い行に合わせて左へ寄せる（loop の中の字下げは残す）
    const dedent = (s) => { const ls = s.split('\n'), n = Math.min(...ls.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length)); return ls.map((l) => l.slice(n)).join('\n'); };
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">音のことばの説明書</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる" data-x></button></div></div>
      <div class="window-body"><div class="lc-help-body" tabindex="0">
        <h2>使い方</h2>
        <ol><li>左のエディタに、音のことばを書きます（初めは見本が入っています）。</li>
          <li><kbd>Ctrl</kbd>+<kbd>Enter</kbd>（または「動かす」）で鳴らします。<kbd>Esc</kbd> で止めます。</li>
          <li>鳴らしたまま書き換えて、もう一度 <kbd>Ctrl</kbd>+<kbd>Enter</kbd> を押すと、それぞれの loop が次のくり返しの頭から新しい中身になります。消した loop は、今のくり返しのあとで止まります。</li>
          <li>誤りがあると、行と列と説明が出て、前の版がそのまま鳴り続けます。</li></ol>
        <h2>命令の一覧</h2>
        <table class="lc-ref"><thead><tr><th scope="col">命令</th><th scope="col">説明</th><th scope="col">例</th></tr></thead><tbody>
          ${L.REFERENCE.map((r) => `<tr><th scope="row"><code>${esc(r.word)}</code></th><td>${esc(r.text)}</td><td><pre>${esc(dedent(r.example))}</pre></td></tr>`).join('')}
        </tbody></table>
        <h2>音の名前</h2>
        <p>C D E F G A B（ド レ ミ ファ ソ ラ シ）に、オクターブの数を付けます。C4 が真ん中のドです。# で半音上げ（D#3）、b で半音下げ（Bb2）。60 のような数（MIDI の番号）でも書けます。C4 + 7 のように足し引きできます。</p>
        <h2>音色（synth）</h2><ul class="lc-names">${names(L.SYNTHS)}</ul>
        <h2>打楽器（sample）</h2><ul class="lc-names">${names(L.SAMPLES)}</ul>
        <h2>効果（fx）</h2><ul class="lc-names">${names(L.FX)}</ul>
        <h2>和音（chord）と音階（scale）</h2><p>和音: ${Object.keys(L.CHORDS).map((k) => `<code>${k}</code>`).join(' ')}<br>音階: ${Object.keys(L.SCALES).map((k) => `<code>${k}</code>`).join(' ')}</p>
      </div>
      <div class="button-row"><button type="button" class="default" data-close-help>閉じる(<u>C</u>)</button></div></div>`;
    const finish = () => { dlg.close(); dlg.remove(); ta.focus(); };
    dlg.querySelector('[data-close-help]').addEventListener('click', finish);
    dlg.querySelector('[data-x]').addEventListener('click', finish);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(); });
    document.body.append(dlg); dlg.showModal(); dlg.querySelector('[data-close-help]').focus();
    log('livecode.help', {}, 'ok');
  }

  /* ---------- 命令 ---------- */
  const cmds = {
    new: () => os.launch('livecode', { blank: true }),
    open: async () => { const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/音楽', exts: ['.oto'], typeLabel: '音のことば' }); if (p) os.openFile(p, 'livecode'); },
    save, saveas: saveAs,
    wav: () => exportWav(false), wavpc: () => exportWav(true),
    close: () => win.close(),
    undo: () => { ta.focus(); document.execCommand('undo'); },
    redo: () => { ta.focus(); document.execCommand('redo'); },
    indent: () => { ta.focus(); indent(1); }, outdent: () => { ta.focus(); indent(-1); }, comment: () => { ta.focus(); comment(); },
    run: () => { run(); }, stop,
    help,
    about: () => os.msgbox({ title: '音の実験室について', icon: 'info', text: 'Future OS 音の実験室 1.0\n\n文字で音楽を書いて、その場で鳴らすアプリです。鳴らしたまま書き換えると、次のくり返しの頭から音が入れ替わります。\n音色と打楽器は、Web Audio の部品でその場で作っています。WAV の書き出しも同じ計算で音を作ります。' }),
  };
  win.body.addEventListener('w95:command', (e) => {
    const c = e.detail.command;
    if (c.startsWith('ex:')) loadExample(c.slice(3)); else cmds[c]?.(e.detail);
  });
  win.body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (a && !a.disabled) {
      const k = a.dataset.a;
      if (k === 'run') { run(); ta.focus(); }
      else if (k === 'stop') { stop(); ta.focus(); }
      else if (k === 'help') help();
      else if (k === 'goerr' && errInfo) gotoLine(errInfo.line, errInfo.col, errInfo.src === ta.value ? errInfo.len : 0);
      else if (k === 'scope') { scopeMode = scopeMode === 'wave' ? 'spec' : 'wave'; syncScopeButton(); persist(); drawScope(); }
      return;
    }
    const qb = e.target.closest('[data-insert]');
    if (qb) {
      const code = QUICK[+qb.dataset.insert][0], s = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1, ind = /^[ \t]*/.exec(ta.value.slice(s))[0];
      ta.focus();
      insert(code.split('\n').map((l, i) => (i ? ind + l : l)).join('\n'));
      say(`「${code.split('\n')[0]}」を入れました。`);
      return;
    }
    const li = e.target.closest('.lc-loop[data-line]');
    if (li && ranText === ta.value) gotoLine(+li.dataset.line);
  });
  function syncScopeButton() { const b = q('[data-a="scope"]'); b.innerHTML = scopeMode === 'wave' ? '波形(<u>W</u>)' : 'スペクトル(<u>W</u>)'; b.setAttribute('aria-pressed', String(scopeMode === 'spec')); scope.setAttribute('aria-label', scopeMode === 'wave' ? '鳴っている音の波形' : '鳴っている音の高さごとの強さ（スペクトル）'); }
  q('[data-vol]').value = Math.round(volume * 100);
  q('[data-vol]').addEventListener('input', (e) => { volume = +e.target.value / 100; applyVolume(); persist(); });
  // 窓のどこでも効くキー
  win.body.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'Escape' && engine.playing) { e.preventDefault(); stop(); }
    else if (e.key === 'F1') { e.preventDefault(); help(); }
    else if (e.ctrlKey && !e.altKey && k === 's') { e.preventDefault(); save(); }
    else if (e.ctrlKey && !e.altKey && k === 'o') { e.preventDefault(); cmds.open(); }
  });
  win.body.addEventListener('fos:drop-file', (e) => os.openFile(e.detail.path));

  win.cleanup = () => {
    cancelAnimationFrame(raf); clearInterval(timer); cancelAnimationFrame(paintQueued);
    os.events.removeEventListener('settings', onSettings);
    PAINT.delete(win.id); flushHighlights();
    engine.stop();
    if (ac) { ac.close().catch(() => {}); ac = null; }
    log('livecode.close', { path }, 'ok');
  };
  // 確かめの道具が読む口（予約した音の記録、動かした記録、書き出しの結果）
  win.lc = {
    rec, runs, engine, ctx: () => ac, lastWav: () => lastWav, text: () => ta.value, error: () => errInfo, nowLines: () => [...nowLines],
    // 書き出しと同じ道で描き出して、左の音の最大の振れ幅（peak）と、0.45〜1 秒の間の最大の振れ幅（tail: エコーの残り）を返す
    async render(src, bars = 1) {
      const r = L.compile(src); if (!r.ok) throw new Error(L.formatError(r.error));
      const { buf } = await renderRaw(r.program, bars), d = buf.getChannelData(0), sr = buf.sampleRate;
      let peak = 0, tail = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; if (i > 0.45 * sr && i < sr && v > tail) tail = v; }
      return { peak, tail };
    },
  };

  ta.value = text; ta.setSelectionRange(0, 0);
  syncScopeButton(); paint(); title(); caret(); drawScope(); drawLoops(); drawPlayState(); showTempo();
  say('Ctrl+Enter で鳴らします。Esc で止めます。F1 で説明書を開きます。');
  ta.focus({ preventScroll: true });
  log('livecode.open', { path, chars: text.length }, 'ok');
  return win;
}
