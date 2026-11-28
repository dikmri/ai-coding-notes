// 一筆ずつ描くペン画のプレーヤー。画像を読み、Web Worker で筆の列を作り、Canvas に一筆ずつ描く。
// 画像はこのブラウザの中だけで処理する（送信しない）。手元で開いたときだけ操作の記録を logs/app.log へ送る。
import { log, watchErrors } from './log.mjs';
import { fillStroke as fillRibbon, fillDots, fillPolygon, drawSegment } from './render.mjs';
import { toSVG, addPngText, PROGRAM_NOTE } from './export.mjs';

const SAMPLES = {
  fisher: { src: 'img/sample-fisher.webp', name: '見本: 港の漁師（写真風）' },
  rain: { src: 'img/sample-rain.webp', name: '見本: 雨の街（カラーのイラスト）' },
  stairs: { src: 'img/sample-stairs.webp', name: '見本: 階段の少年（白黒の線画）' },
  street: { src: 'img/sample-street.webp', name: '見本: 猫の目線の通り（3DCG）' },
};
const MAX_SIDE = 1000;          // 処理する画像の長い辺（px）
const BASE_SECONDS = 45;        // 速さ ×1 で描き上がるまでの目安
const INK = '#141414';
const PEN_LIFT_PX = 3;          // 筆を持ち上げて次へ移る分（線の長さに換算）

const $ = (id) => document.getElementById(id);
const root = $('player');
if (root) start();

function start() {
  watchErrors();
  const el = {
    canvas: $('ip-canvas'), pen: $('ip-pen'), paper: root.querySelector('.ip-paper'), busy: $('ip-busy'),
    src: $('ip-src'), srcName: $('ip-src-name'), ink: $('ip-ink'), file: $('ip-file'), status: $('ip-status'),
    play: $('ip-play'), step: $('ip-step'), restart: $('ip-restart'), end: $('ip-end'),
    speed: $('ip-speed'), speedV: $('ip-speed-v'), detail: $('ip-detail'), detailV: $('ip-detail-v'),
    hatch: $('ip-hatch'), hatchV: $('ip-hatch-v'), hstyle: $('ip-hstyle'), png: $('ip-png'), svg: $('ip-svg'), fit: $('ip-fit'), fs: $('ip-fs'),
    mI: $('m-i'), mN: $('m-n'), gStroke: $('g-stroke'), gStrokeV: $('g-stroke-v'), gInk: $('g-ink'), gInkV: $('g-ink-v'),
    stages: $('m-stages'), cur: $('m-cur'), tip: $('m-tip'), proc: $('m-proc'), procTotal: $('m-proc-total'), kind: $('m-kind'),
  };
  const ctx = el.canvas.getContext('2d');
  const pctx = el.pen.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let worker = null, jobId = 0, source = null, srcURL = '', data = null, scale = 1, sampleKey = 'fisher';
  const st = { i: 0, j: 0, arc: 0, last: null, liftAt: null, playing: false, raf: 0, lastT: 0, visible: true, resumeOnShow: false, metersAt: 0 };

  const status = (text) => { el.status.textContent = text; };
  const fmt = (v) => Math.round(v).toLocaleString('ja-JP');
  const speedFactor = () => 2 ** (Number(el.speed.value) - 2); // 0..8 → ×0.25..×64

  // ---------------- 画像を読む
  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => onResult(e.data);
    worker.onerror = (e) => {
      log('worker.error', { msg: String(e.message || e) }, `error ${e.message || e}`);
      setBusy(false);
      status('処理の途中でエラーが起きました。別の画像で試してください。');
    };
    return worker;
  }

  async function loadBlob(blob, name, how) {
    const t0 = performance.now();
    log('load.start', { how, name, type: blob.type, bytes: blob.size });
    let bmp;
    try {
      bmp = await createImageBitmap(blob);
    } catch (err) {
      log('load.error', { how, name, type: blob.type }, `error ${err.message}`);
      status('この画像は読めませんでした。PNG・JPEG・WebP などの画像を選んでください。');
      return;
    }
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    source = { rgba: cx.getImageData(0, 0, w, h).data, w, h, name };
    if (srcURL) URL.revokeObjectURL(srcURL);
    srcURL = URL.createObjectURL(blob);
    el.src.src = srcURL;
    el.src.alt = `元の画像（${name}）`;
    el.srcName.textContent = `${w}×${h}`;
    log('load.done', { how, name, w, h, original: `${Math.round(w / k)}×${Math.round(h / k)}` }, `ok ${Math.round(performance.now() - t0)}ms`);
    processSource();
  }

  async function loadSample(key) {
    const s = SAMPLES[key];
    if (!s) return;
    sampleKey = key;
    for (const b of root.querySelectorAll('[data-sample]')) b.setAttribute('aria-pressed', String(b.dataset.sample === key));
    log('sample', { key });
    try {
      const res = await fetch(new URL(`../${s.src}`, import.meta.url));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadBlob(await res.blob(), s.name, 'sample');
    } catch (err) {
      log('sample.error', { key }, `error ${err.message}`);
      status('見本の画像を読めませんでした。');
    }
  }

  function options() {
    return { detail: Number(el.detail.value) / 10, hatch: Number(el.hatch.value) > 0, hatchDensity: Number(el.hatch.value) / 10, hatchStyle: el.hstyle.value };
  }

  function processSource() {
    if (!source) return;
    pause('process');
    const id = ++jobId;
    const opts = options();
    setBusy(true);
    status('線を起こしています…');
    const copy = source.rgba.slice().buffer;
    log('worker.post', { id, w: source.w, h: source.h, ...opts });
    ensureWorker().postMessage({ id, rgba: copy, w: source.w, h: source.h, options: opts }, [copy]);
  }

  function onResult(msg) {
    if (msg.id !== jobId) { log('worker.stale', { id: msg.id, current: jobId }); return; }
    if (!msg.ok) {
      setBusy(false);
      log('worker.fail', { id: msg.id }, `error ${msg.error.slice(0, 300)}`);
      status('線を起こせませんでした。別の画像で試してください。');
      return;
    }
    const n = msg.stage.length;
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + msg.len[i] + PEN_LIFT_PX;
    const stageStart = [];
    for (let i = 0, s = -1; i < n; i++) if (msg.stage[i] !== s) { s = msg.stage[i]; stageStart[s] = i; }
    data = { ...msg, n, cum, stageStart };
    KIND_OF.clear();
    for (let k = 0; k < n; k++) KIND_OF.set(msg.off[k], k);
    setBusy(false); // data を入れてから。先に呼ぶとボタンが無効のまま残る
    // 確かめの台本（tools/check.mjs）が読む値
    Object.assign(root.dataset, { strokes: String(n), hatch: String(msg.info.hatchCount), mode: msg.info.mode, ms: String(Math.round(msg.ms)), size: `${msg.info.w}x${msg.info.h}`, job: String(msg.id) });
    log('worker.done', { id: msg.id, mode: msg.info.mode, strokes: n, hatch: msg.info.hatchCount, w: msg.info.w, h: msg.info.h, timings: Object.fromEntries(Object.entries(msg.info.timings).map(([k, v]) => [k, Math.round(v)])) }, `ok ${Math.round(msg.ms)}ms`);
    root.style.setProperty('--ar', `${msg.info.w} / ${msg.info.h}`);
    root.style.setProperty('--arn', String(msg.info.w / msg.info.h));
    el.kind.textContent = msg.info.mode === 'lineart' ? '種類 線画' : '種類 写真・絵';
    drawInkLayer();
    buildStageMeters();
    updateLayerControls();
    buildProcMeters(msg.ms);
    status(`${fmt(n)} 筆の描き順ができました（${(msg.ms / 1000).toFixed(1)} 秒）。`);
    resize();
    restart('load');
    if (reduceMotion.matches) { finish('reduced-motion'); status(`${fmt(n)} 筆の描き順ができました。動きを減らす設定なので、描き上がりを表示しています。「再生」で最初から描きます。`); }
    else play('auto');
  }

  function setBusy(on) {
    el.busy.hidden = !on;
    for (const b of [el.play, el.step, el.restart, el.end, el.png, el.svg]) b.disabled = on || !data;
    root.toggleAttribute('aria-busy', on);
  }

  // ---------------- 描く
  function resize() {
    if (!data) return;
    const r = el.paper.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    for (const c of [el.canvas, el.pen]) { if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } }
    scale = W / data.info.w;
    redraw();
  }

  function clearPaper() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, el.canvas.width, el.canvas.height);
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }

  // 層の表示（筆の種類ごと。0 = 主線、1 = 斜線、2 = 点描、3 = ベタ）。非表示の層は描かずに進む
  const visible = [true, true, true, true, true]; // 4 = トーン
  // 筆 1 本を塗る。トーン（種類 4）は網点の円、ベタの縁（種類 3 の level 1）は輪郭の多角形、それ以外は線のリボン
  const KIND_OF = new Map();
  const isPoly = (k) => data.kind[k] === 3 && data.level[k] === 1;
  const isAtomic = (k) => data.kind[k] === 4 || isPoly(k); // 面ごとにまとめて描く筆
  function fillStroke(c, pts, a, b, s) {
    const k = data ? KIND_OF.get(a) ?? -1 : -1;
    if (k >= 0 && data.kind[k] === 4) fillDots(c, pts, a, b, s);
    else if (k >= 0 && isPoly(k)) fillPolygon(c, pts, a, b, s);
    else fillRibbon(c, pts, a, b, s);
  }
  const shown = (k) => visible[data.kind[k]] !== false;

  function redraw() {
    clearPaper();
    if (!data) return;
    const { pts, off } = data;
    for (let k = 0; k < st.i && k < data.n; k++) if (shown(k)) fillStroke(ctx, pts, off[k], off[k + 1], scale);
    if (st.i < data.n && st.j > 0 && shown(st.i)) {
      const a = data.off[st.i];
      for (let q = a + 1; q <= a + st.j; q++) segment(q - 1, q);
      if (st.last) { const p = (a + st.j) * 3; drawSegment(ctx, pts[p], pts[p + 1], pts[p + 2], st.last.x, st.last.y, st.last.w, scale); }
    }
    drawPen();
    updateMeters(true);
  }

  function segment(q0, q1) {
    const p = data.pts;
    drawSegment(ctx, p[q0 * 3], p[q0 * 3 + 1], p[q0 * 3 + 2], p[q1 * 3], p[q1 * 3 + 1], p[q1 * 3 + 2], scale);
  }

  // budget（画像の px）だけペンを進め、その分を描き足す
  function advance(budget) {
    const { pts, off, len, n } = data;
    while (budget > 0 && st.i < n) {
      const a = off[st.i], b = off[st.i + 1];
      const rest = len[st.i] - st.arc;
      // 非表示の層の筆は、時間だけ進めて描かない
      const show = shown(st.i);
      const drawSeg = show ? drawSegment : () => {};
      // トーンとベタの縁は面ごとに 1 枚: 時間がたまったら、面をまとめて描く
      if (isAtomic(st.i)) {
        if (budget >= rest) {
          if (show) fillStroke(ctx, pts, a, b, scale);
          budget -= rest + PEN_LIFT_PX;
          nextStroke(b - 1);
        } else { st.arc += budget; budget = 0; }
        continue;
      }
      if (st.j === 0 && st.arc === 0 && budget >= len[st.i] + PEN_LIFT_PX) {
        if (show) fillStroke(ctx, pts, a, b, scale); // 1 フレームで丸ごと描ける筆は 1 回で塗る
        budget -= len[st.i] + PEN_LIFT_PX;
        nextStroke(b - 1);
        continue;
      }
      if (budget >= rest) {
        let from = st.last;
        for (let q = a + st.j + 1; q < b; q++) {
          if (from) drawSeg(ctx, from.x, from.y, from.w, pts[q * 3], pts[q * 3 + 1], pts[q * 3 + 2], scale);
          else if (show) segment(q - 1, q);
          from = null;
        }
        if (b - a === 1 && show) fillStroke(ctx, pts, a, b, scale);
        budget -= rest + PEN_LIFT_PX;
        nextStroke(b - 1);
        continue;
      }
      // 途中まで: 点を順に進め、最後は区間の中で止める
      let remain = budget;
      budget = 0;
      let from = st.last ?? { x: pts[(a + st.j) * 3], y: pts[(a + st.j) * 3 + 1], w: pts[(a + st.j) * 3 + 2] };
      while (remain > 0 && a + st.j + 1 < b) {
        const q = a + st.j + 1;
        const nx = pts[q * 3], ny = pts[q * 3 + 1], nw = pts[q * 3 + 2];
        const d = Math.hypot(nx - from.x, ny - from.y);
        if (d <= remain) {
          drawSeg(ctx, from.x, from.y, from.w, nx, ny, nw, scale);
          remain -= d; st.arc += d; st.j++;
          from = { x: nx, y: ny, w: nw };
          st.last = null;
        } else {
          const u = remain / d;
          const m = { x: from.x + (nx - from.x) * u, y: from.y + (ny - from.y) * u, w: from.w + (nw - from.w) * u };
          drawSeg(ctx, from.x, from.y, from.w, m.x, m.y, m.w, scale);
          st.arc += remain; remain = 0;
          st.last = m;
        }
      }
    }
  }

  // 筆を描き終えた。ペンは持ち上げた位置（liftAt）にあり、描いている途中の位置（last）は無い
  function nextStroke(lastQ) {
    st.i++; st.j = 0; st.arc = 0; st.last = null;
    st.liftAt = { x: data.pts[lastQ * 3], y: data.pts[lastQ * 3 + 1], w: data.pts[lastQ * 3 + 2], lifted: true };
  }

  function penPos() {
    if (!data) return null;
    if (st.last) return st.last;
    if (st.liftAt && st.j === 0 && st.arc === 0) return st.liftAt;
    if (st.i >= data.n) return null;
    const p = data.off[st.i] * 3 + st.j * 3;
    return { x: data.pts[p], y: data.pts[p + 1], w: data.pts[p + 2] };
  }

  function drawPen() {
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, el.pen.width, el.pen.height);
    const p = penPos();
    if (!p || (st.i >= data.n)) return;
    const x = p.x * scale, y = p.y * scale, dpr = Math.min(2, devicePixelRatio || 1);
    pctx.strokeStyle = 'rgba(255, 90, 42, 0.35)';
    pctx.lineWidth = dpr;
    pctx.beginPath();
    pctx.moveTo(0, y); pctx.lineTo(el.pen.width, y);
    pctx.moveTo(x, 0); pctx.lineTo(x, el.pen.height);
    pctx.stroke();
    pctx.fillStyle = '#ff5a2a';
    pctx.beginPath();
    pctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
    pctx.fill();
  }

  function frame(t) {
    st.raf = 0;
    if (!st.playing || !data) return;
    const dt = Math.min(0.05, Math.max(0, (t - st.lastT) / 1000));
    st.lastT = t;
    const pxPerSec = Math.max(60, (data.cum[data.n] / BASE_SECONDS) * speedFactor());
    advance(dt * pxPerSec);
    drawPen();
    updateMeters(false);
    if (st.i >= data.n) { finish('end'); return; }
    st.raf = requestAnimationFrame(frame);
  }

  function play(how) {
    if (!data) return;
    if (st.i >= data.n) restart('replay');
    if (st.playing) return;
    st.playing = true;
    el.play.textContent = '一時停止';
    st.lastT = performance.now();
    if (st.visible) st.raf = requestAnimationFrame(frame);
    else st.resumeOnShow = true;
    log('play', { how, at: st.i, of: data.n, speed: speedFactor() });
  }

  function pause(how) {
    if (!st.playing) return;
    st.playing = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
    el.play.textContent = '再生';
    updateMeters(true);
    log('pause', { how, at: st.i, of: data?.n });
  }

  function restart(how) {
    pause('restart');
    st.i = 0; st.j = 0; st.arc = 0; st.last = null; st.liftAt = null;
    redraw();
    if (how !== 'load' && how !== 'replay') log('restart', { how });
  }

  function finish(how) {
    pause('finish');
    st.i = data.n; st.j = 0; st.arc = 0; st.last = null; st.liftAt = null;
    redraw();
    el.canvas.setAttribute('aria-label', `プログラムが一筆ずつ描いた線画。全 ${fmt(data.n)} 筆で描き上がった状態。`);
    log('finish', { how, strokes: data.n });
  }

  function stepOne() {
    if (!data || st.i >= data.n) return;
    pause('step');
    const rest = data.len[st.i] - st.arc + PEN_LIFT_PX;
    advance(rest + 1e-6);
    drawPen();
    updateMeters(true);
    log('step', { to: st.i, of: data.n });
  }

  // ---------------- 計器
  function buildStageMeters() {
    el.stages.replaceChildren(...data.info.stages.map((name, s) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="ip-sname"></span><span class="ip-scount"></span><span class="ip-bar" aria-hidden="true"><span></span></span>`;
      li.querySelector('.ip-sname').textContent = name;
      li.querySelector('.ip-scount').textContent = `${fmt(data.info.stageCounts[s])} 筆`;
      return li;
    }));
  }

  function buildProcMeters(workerMs) {
    const entries = Object.entries(data.info.timings).filter(([, v]) => v >= 0.5);
    const max = Math.max(...entries.map(([, v]) => v), 1);
    el.proc.replaceChildren(...entries.map(([name, v]) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="ip-pname"></span><span class="ip-bar" aria-hidden="true"><span></span></span><span class="ip-pval"></span>`;
      li.querySelector('.ip-pname').textContent = name;
      li.querySelector('.ip-bar > span').style.setProperty('--v', String(v / max));
      li.querySelector('.ip-pval').textContent = `${fmt(v)} ms`;
      return li;
    }));
    el.procTotal.textContent = `${fmt(workerMs)} ms`;
  }

  function updateMeters(force) {
    if (!data) return;
    const now = performance.now();
    if (!force && now - st.metersAt < 66) return;
    st.metersAt = now;
    const { n, cum, stage, kind, len, off, pts } = data;
    const done = Math.min(st.i, n);
    el.mI.textContent = String(done).padStart(String(n).length, '0');
    el.mN.textContent = String(n);
    const fStroke = n ? done / n : 0;
    const inkNow = Math.min(cum[n], cum[done] + st.arc);
    const fInk = cum[n] ? inkNow / cum[n] : 0;
    el.gStroke.style.setProperty('--v', String(fStroke));
    el.gStrokeV.textContent = `${(fStroke * 100).toFixed(1)}%`;
    el.gInk.style.setProperty('--v', String(fInk));
    el.gInkV.textContent = `${fmt(inkNow)} / ${fmt(cum[n])} px`;
    const curStage = done < n ? stage[done] : -1;
    [...el.stages.children].forEach((li, s) => {
      const a = data.stageStart[s] ?? 0, c = data.info.stageCounts[s];
      const f = c ? Math.min(1, Math.max(0, (done - a) / c)) : 0;
      li.querySelector('.ip-bar > span').style.setProperty('--v', String(f));
      if (s === curStage) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    const k = done < n ? done : n - 1;
    const set = (key, v) => { el.cur.querySelector(`[data-k="${key}"]`).textContent = v; };
    if (k >= 0) {
      const a = off[k], b = off[k + 1];
      let wMin = Infinity, wMax = 0;
      for (let q = a; q < b; q++) { wMin = Math.min(wMin, pts[q * 3 + 2]); wMax = Math.max(wMax, pts[q * 3 + 2]); }
      set('no', `${fmt(k + 1)}`);
      set('kind', kind[k] === 4 ? (data.level[k] ? `トーン ${data.level[k]}%` : 'グラデーショントーン')
        : kind[k] === 3 ? (data.level[k] ? 'ベタの縁（輪郭で整える）' : 'ベタ（筆）')
        : kind[k] === 2 ? '点描の点' : kind[k] === 1 ? `斜線 ${data.level[k] + 1} 段目` : `線（${data.info.stages[stage[k]]}）`);
      set('pts', `${fmt(b - a)} 個`);
      set('len', `${len[k].toFixed(1)} px`);
      set('w', isPoly(k) ? '—（面）' : `${wMin.toFixed(2)}〜${wMax.toFixed(2)} px`);
      set('from', `${pts[a * 3].toFixed(1)}, ${pts[a * 3 + 1].toFixed(1)}`);
      set('to', `${pts[(b - 1) * 3].toFixed(1)}, ${pts[(b - 1) * 3 + 1].toFixed(1)}`);
    }
    const p = penPos();
    const setT = (key, v) => { el.tip.querySelector(`[data-k="${key}"]`).textContent = v; };
    setT('x', p ? p.x.toFixed(1) : '—');
    setT('y', p ? p.y.toFixed(1) : '—');
    setT('w', p && !p.lifted && done < n ? `${p.w.toFixed(2)} px` : '—（持ち上げ中）');
    setT('v', st.playing ? `${fmt(Math.max(60, (cum[n] / BASE_SECONDS) * speedFactor()))} px/s` : '0 px/s');
  }

  // 起こした線の小さな絵。縮めるとき細い線がちらつかないよう、f×f 画素ずつ平均してから置く
  function drawInkLayer() {
    const { w, h } = data.info;
    const f = Math.max(1, Math.floor(Math.max(w, h) / 360));
    const tw = Math.max(1, Math.floor(w / f)), th = Math.max(1, Math.floor(h / f));
    el.ink.width = tw; el.ink.height = th;
    const ic = el.ink.getContext('2d');
    const img = ic.createImageData(tw, th);
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      let s = 0;
      for (let y = ty * f; y < ty * f + f; y++) for (let x = tx * f; x < tx * f + f; x++) s += data.ink[y * w + x];
      const v = Math.round(255 - (235 * s) / (f * f));
      const o = (ty * tw + tx) * 4;
      img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
    }
    ic.putImageData(img, 0, 0);
  }

  // ---------------- 書き出し（表示している層だけ）
  const LAYER_NAMES = ['主線', '斜線', '点描', 'ベタ', 'トーン'];
  const shownLayers = () => LAYER_NAMES.filter((_, k) => visible[k] && layerCount[k] > 0);
  function strokesForExport() {
    const out = [];
    for (let k = 0; k < data.n; k++) {
      if (!shown(k)) continue;
      const points = [];
      for (let q = data.off[k]; q < data.off[k + 1]; q++) points.push({ x: data.pts[q * 3], y: data.pts[q * 3 + 1], w: data.pts[q * 3 + 2] });
      out.push({ points, dots: data.kind[k] === 4, poly: isPoly(k) });
    }
    return out;
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const baseName = () => `ippitsu-${(source?.name || 'image').replace(/^見本: /, '').replace(/[\\/:*?"<>|（）() ]+/g, '-').replace(/-+$/, '')}`;

  async function exportPNG() {
    if (!data) return;
    const k = 2, c = document.createElement('canvas');
    c.width = data.info.w * k; c.height = data.info.h * k;
    const x = c.getContext('2d');
    x.fillStyle = INK;
    for (let i = 0; i < data.n; i++) if (shown(i)) fillStroke(x, data.pts, data.off[i], data.off[i + 1], k);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (!blob) { log('export.png', {}, 'error toBlob'); status('PNG を作れませんでした。'); return; }
    const bytes = addPngText(new Uint8Array(await blob.arrayBuffer()), 'Description', PROGRAM_NOTE);
    download(new Blob([bytes], { type: 'image/png' }), `${baseName()}.png`);
    log('export.png', { w: c.width, h: c.height, bytes: bytes.length, layers: shownLayers() });
    status(`透過 PNG（${c.width}×${c.height}、${shownLayers().join('・') || '何も表示していない'}）を書き出しました。`);
  }
  function exportSVG() {
    if (!data) return;
    const strokes = strokesForExport();
    const svg = toSVG(strokes, data.info.w, data.info.h);
    download(new Blob([svg], { type: 'image/svg+xml' }), `${baseName()}.svg`);
    log('export.svg', { strokes: strokes.length, bytes: svg.length, layers: shownLayers() });
    status(`SVG（${fmt(strokes.length)} 本、${shownLayers().join('・') || '何も表示していない'}）を書き出しました。`);
  }

  // ---------------- 層の表示の切り替え
  const layerBoxes = [...root.querySelectorAll('#ip-layers input[data-kind]')];
  const layerCount = [0, 0, 0, 0, 0];
  // 描き順ができたら、描いた層だけ選べるようにする（描いていない層は押せない）
  function updateLayerControls() {
    layerCount.fill(0);
    for (const k of data.kind) layerCount[k]++;
    for (const box of layerBoxes) {
      const k = Number(box.dataset.kind);
      box.disabled = layerCount[k] === 0;
      box.checked = visible[k];
    }
  }
  for (const box of layerBoxes) {
    box.addEventListener('change', () => {
      const k = Number(box.dataset.kind);
      visible[k] = box.checked;
      log('layer', { layer: LAYER_NAMES[k], on: box.checked, strokes: layerCount[k] });
      if (data) redraw();
    });
  }

  // ---------------- ページいっぱい・全画面
  function setFit(on, how) {
    root.classList.toggle('is-fit', on);
    document.documentElement.classList.toggle('ip-fit-open', on);
    el.fit.setAttribute('aria-pressed', String(on));
    el.fit.textContent = on ? 'ページに戻す' : 'ページいっぱい';
    log('fit', { on, how });
    requestAnimationFrame(resize);
  }
  el.fit.addEventListener('click', () => setFit(!root.classList.contains('is-fit'), 'button'));
  if (document.fullscreenEnabled && root.requestFullscreen) {
    el.fs.hidden = false;
    el.fs.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else { if (root.classList.contains('is-fit')) setFit(false, 'fullscreen'); await root.requestFullscreen({ navigationUI: 'hide' }); }
      } catch (err) { log('fullscreen.error', { msg: String(err) }, `error ${err.message}`); }
    });
    document.addEventListener('fullscreenchange', () => {
      const on = document.fullscreenElement === root;
      el.fs.textContent = on ? '全画面を終える' : '全画面';
      log('fullscreen', { on });
      requestAnimationFrame(resize);
    });
  }

  // ---------------- 操作
  el.play.addEventListener('click', () => (st.playing ? pause('button') : play('button')));
  el.step.addEventListener('click', stepOne);
  el.restart.addEventListener('click', () => { restart('button'); play('restart'); });
  el.end.addEventListener('click', () => data && finish('button'));
  el.png.addEventListener('click', exportPNG);
  el.svg.addEventListener('click', exportSVG);
  const syncRange = (input, out, text) => {
    out.textContent = text();
    input.setAttribute('aria-valuetext', text());
    input.style.setProperty('--control-value', input.value);
  };
  const speedText = () => { const f = speedFactor(); return `×${f < 1 ? f.toFixed(2).replace(/0$/, '') : f}`; };
  const hatchText = () => (Number(el.hatch.value) === 0 ? 'なし' : el.hatch.value);
  syncRange(el.speed, el.speedV, speedText);
  syncRange(el.detail, el.detailV, () => el.detail.value);
  syncRange(el.hatch, el.hatchV, hatchText);
  el.speed.addEventListener('input', () => { syncRange(el.speed, el.speedV, speedText); updateMeters(true); });
  el.speed.addEventListener('change', () => log('speed', { factor: speedFactor() }));
  el.detail.addEventListener('input', () => syncRange(el.detail, el.detailV, () => el.detail.value));
  el.hatch.addEventListener('input', () => syncRange(el.hatch, el.hatchV, hatchText));
  el.detail.addEventListener('change', () => { log('detail', { value: Number(el.detail.value) }); processSource(); });
  el.hatch.addEventListener('change', () => { log('hatch', { value: Number(el.hatch.value) }); processSource(); });
  el.hstyle.addEventListener('change', () => { log('hatchStyle', { value: el.hstyle.value }); processSource(); });
  for (const b of root.querySelectorAll('[data-sample]')) b.addEventListener('click', () => loadSample(b.dataset.sample));
  el.file.addEventListener('change', () => {
    const f = el.file.files?.[0];
    if (f) loadBlob(f, f.name, 'file');
    el.file.value = '';
  });
  const clearSamples = () => { for (const b of root.querySelectorAll('[data-sample]')) b.setAttribute('aria-pressed', 'false'); };
  el.file.addEventListener('click', () => log('file.open', {}));
  root.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); root.classList.add('is-drop'); } });
  root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget)) root.classList.remove('is-drop'); });
  root.addEventListener('drop', (e) => {
    root.classList.remove('is-drop');
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
    if (!f) return;
    e.preventDefault();
    log('drop', { name: f.name, type: f.type, bytes: f.size });
    clearSamples();
    loadBlob(f, f.name, 'drop');
  });
  document.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((it) => it.kind === 'file' && it.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (!f) return;
    e.preventDefault();
    log('paste', { type: f.type, bytes: f.size });
    clearSamples();
    loadBlob(f, '貼り付けた画像', 'paste');
  });
  el.file.addEventListener('change', clearSamples);
  // キーボード: プレーヤーの中にいるときだけ（記事の中ではスペースキーでページを送れるようにする）
  root.addEventListener('keydown', (e) => {
    if (e.target.closest('input, button, select, textarea, a')) { if (e.key === 'Escape' && root.classList.contains('is-fit')) setFit(false, 'escape'); return; }
    if (e.key === ' ') { e.preventDefault(); st.playing ? pause('key') : play('key'); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepOne(); }
    else if (e.key === 'Home') { e.preventDefault(); restart('key'); }
    else if (e.key === 'End') { e.preventDefault(); if (data) finish('key'); }
    else if (e.key === 'Escape' && root.classList.contains('is-fit')) setFit(false, 'escape');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('is-fit') && !root.contains(e.target)) setFit(false, 'escape'); });

  new ResizeObserver(() => resize()).observe(el.paper);
  // 画面の外にあるあいだは描くのを止める
  new IntersectionObserver(([entry]) => {
    st.visible = entry.isIntersecting;
    if (!st.visible && st.playing) { st.resumeOnShow = true; if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; log('offscreen', { at: st.i }); }
    else if (st.visible && st.playing && !st.raf) { st.lastT = performance.now(); st.raf = requestAnimationFrame(frame); log('onscreen', { at: st.i }); }
  }).observe(root);

  setBusy(false);
  log('open', { url: location.pathname, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, reduceMotion: reduceMotion.matches });
  loadSample(sampleKey);
}
