// 世界の計算（kanenaki/sim/）を動かす module の Web Worker。1 人用（設計書 §15）。
// 画面 → ここ: C2S の物（{ t, ... }）を postMessage で受ける。
// ここ → 画面: { out: [S2C の JSON の文字列...], logs: [[level, 1 行]...] } を、計算 1 回ごと・命令 1 つごとにまとめて送る。
//              起動の終わりに { ready, ms, warnings }、起動に失敗したら { fatal }。
// 記録は画面へ渡し、画面が localhost なら POST /__log で logs/app.log へ書く（Worker からは直接書かない）。
import { loadData } from '../sim/data.mjs';
import { World } from '../sim/world.mjs';
import { logLine } from '../shared/schema.mjs';

const DEBUG = new URLSearchParams(self.location.search).get('debug') === '1';
const METRICS_EVERY_MS = 10000;

let pendingLogs = [];
let batch = null;
const flushOut = () => {
  const out = batch ?? [];
  batch = null;
  const logs = pendingLogs;
  pendingLogs = [];
  if (out.length || logs.length) self.postMessage({ out, logs });
};
const errText = (err) => String(err?.stack ?? err).replace(/\s+/g, ' ').slice(0, 1500);
const log = {
  server(e, a, r = 'ok') { pendingLogs.push(['info', logLine(`sim.${e}`, a, r)]); },
  client(e, a, r = 'ok') { pendingLogs.push(['info', logLine(`sim.${e}`, a, r)]); },
  warn(e, a) { pendingLogs.push(['warn', logLine(`sim.${e}`, a, 'warn')]); },
  error(e, a, err) { pendingLogs.push(['error', logLine(`sim.${e}`, a, err ? `error:${errText(err)}` : 'error')]); },
};
self.addEventListener('error', (e) => { log.error('worker.exception', { msg: String(e.message), at: `${e.filename ?? ''}:${e.lineno ?? 0}` }); flushOut(); });
self.addEventListener('unhandledrejection', (e) => { log.error('worker.rejection', {}, e.reason); flushOut(); });

// 画面とのつながり（World の conn）。World.flush が cork → send… → uncork の順に呼ぶ
const conn = {
  cork() { batch ??= []; },
  send(m) { (batch ??= []).push(m); return true; },
  uncork() { flushOut(); },
};

const waiting = [];
let world = null, session = null;
self.onmessage = (ev) => {
  if (!world) { waiting.push(ev.data); return; }
  handle(ev.data);
};
function handle(m) {
  try { world.receive(session, m); } catch (e) { log.error('worker.receive', { t: m?.t }, e); }
  if (pendingLogs.length) flushOut();
}

try {
  const t0 = performance.now();
  const data = await loadData({ fallbackUrl: null, warn: (e, a) => log.warn(e, a) });
  world = new World({ data, log, rng: Math.random, debug: DEBUG, now: Date.now() });
  session = world.connect(conn);
  let metricsAt = performance.now() + METRICS_EVERY_MS;
  world.afterLoop = () => {
    if (performance.now() >= metricsAt) { metricsAt = performance.now() + METRICS_EVERY_MS; log.server('metrics', world.metrics()); }
    if (pendingLogs.length) flushOut();
  };
  world.start();
  const ms = Math.round(performance.now() - t0);
  log.server('boot', { ms, debug: DEBUG, maps: Object.keys(data.maps).length, skills: Object.keys(data.skills).length, warnings: data.warnings });
  self.postMessage({ ready: true, ms, warnings: data.warnings });
  flushOut();
  for (const m of waiting.splice(0)) handle(m);
} catch (e) {
  log.error('worker.boot', {}, e);
  flushOut();
  self.postMessage({ fatal: String(e?.message ?? e) });
}
