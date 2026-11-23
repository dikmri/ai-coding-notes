// 世界の計算のテストの共通の道具: 見本のデータで世界を作り、偽のつながりで命令を送る
import { normalize } from '../data.mjs';
import * as raw from './data.mjs';
import { World } from '../world.mjs';
import { logLine } from '../../shared/schema.mjs';
import { makeRng } from '../../shared/mapgen.mjs';

// 記録先を持たない記録（テスト用）。書いた行は lines に残す
export class MemoryLogger {
  constructor() { this.lines = []; this.errors = []; }
  server(e, a, r = 'ok') { this.lines.push(logLine(e, a, r)); }
  client(e, a, r = 'ok') { this.lines.push(logLine(e, a, r)); }
  warn(e, a) { this.lines.push(logLine(e, a, 'warn')); }
  error(e, a, err) { const l = logLine(e, a, `error:${String(err?.stack ?? err)}`); this.lines.push(l); this.errors.push(l); }
}

export function makeWorld(opts = {}) {
  const data = opts.data ?? normalize(raw);
  const log = new MemoryLogger();
  const W = new World({ data, log, rng: makeRng(opts.seed ?? 1), debug: opts.debug ?? true, now: 1_000_000 });
  return { W, log, data };
}

// 画面の代わり。送られた S2C を物に戻して持つ
export function fakeConn() {
  return {
    sent: [],
    send(m) { this.sent.push(JSON.parse(m)); return true; },
    of(t) { return this.sent.filter((m) => m.t === t); },
    last(t) { return this.of(t).at(-1); },
    clear() { this.sent.length = 0; },
  };
}

// つないで、hello と create まで済ませる。char を渡すと続きから入る
export function join(W, { char = null, name = null } = {}) {
  const c = fakeConn();
  const s = W.connect(c);
  c.msg = (o) => W.receive(s, o);
  c.msg({ t: 'hello', v: 1, ...(char ? { char } : {}) });
  if (s.state === 'lobby' && !s.player) c.msg({ t: 'create', ...(name ? { name } : {}) });
  W.step(1);
  return { c, s, p: s.player };
}

export function moveTo(W, p, mapId, x, y) {
  W.transfer(p, mapId, x, y, 'test');
  W.step(1);
}

export function spawnMonster(W, zone, id, x, y, extra = {}) {
  const m = W.makeMonster(W.data.monsters[id], { x, y, team: 'm', ...extra });
  zone.add(m);
  return m;
}
