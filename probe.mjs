// Wispbyte の無料のサーバーの中身を測る小さな台本（ライブラリなし、Node.js だけ）
// GET /info   … OS・Node.js の版・CPU・メモリ・cgroup の上限・ディスク
// GET /bench?ms=2000 … 指定した時間だけ計算して、実際にもらえた CPU の割合を出す（短い時間だけ使う）
// WS  /ws     … 届いた文字をそのまま返す（往復時間を測る）
// 記録は logs/probe.log に 1 行ずつ（ISO時刻 イベント名 args={...} result=...）
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, statfsSync, mkdirSync, appendFileSync } from 'node:fs';
import os from 'node:os';

const PORT = Number(process.env.SERVER_PORT || process.argv[2] || 14150);
const LOG_DIR = new URL('./logs/', import.meta.url);
mkdirSync(LOG_DIR, { recursive: true });
const log = (event, args, result = 'ok') => {
  const line = `${new Date().toISOString()} ${event} args=${JSON.stringify(args ?? {})} result=${typeof result === 'string' ? result : JSON.stringify(result)}`;
  console.log(line);
  try { appendFileSync(new URL('probe.log', LOG_DIR), line + '\n'); } catch { /* 書けなくても続ける */ }
};
const read = (p) => { try { return readFileSync(p, 'utf8').trim(); } catch { return null; } };

function info() {
  let disk = null;
  try { const s = statfsSync(process.cwd()); disk = { totalMB: Math.round(s.blocks * s.bsize / 2 ** 20), freeMB: Math.round(s.bavail * s.bsize / 2 ** 20) }; } catch { /* 無い */ }
  return {
    node: process.version, platform: process.platform, arch: process.arch, kernel: os.release(),
    osRelease: read('/etc/os-release')?.split('\n').find((l) => l.startsWith('PRETTY_NAME')) ?? null,
    cpuModel: os.cpus()[0]?.model ?? null, cpuCount: os.cpus().length, availableParallelism: os.availableParallelism?.() ?? null,
    totalMemMB: Math.round(os.totalmem() / 2 ** 20), freeMemMB: Math.round(os.freemem() / 2 ** 20),
    cgroup: {
      cpuMax: read('/sys/fs/cgroup/cpu.max'), memoryMax: read('/sys/fs/cgroup/memory.max'), memoryCurrent: read('/sys/fs/cgroup/memory.current'),
      cpuStat: read('/sys/fs/cgroup/cpu.stat'), v1Quota: read('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'), v1Period: read('/sys/fs/cgroup/cpu/cpu.cfs_period_us'),
      v1MemLimit: read('/sys/fs/cgroup/memory/memory.limit_in_bytes'),
    },
    heapLimitMB: Math.round(process.constrainedMemory?.() ? process.constrainedMemory() / 2 ** 20 : 0),
    rssMB: Math.round(process.memoryUsage().rss / 2 ** 20), uptimeS: Math.round(process.uptime()), disk, port: PORT, cwd: process.cwd(),
  };
}

// 計算の速さ: 決まった計算を ms ミリ秒くり返し、回数と、もらえた CPU 時間 / 経過時間 を返す
function bench(ms) {
  const wall0 = performance.now(), cpu0 = process.cpuUsage();
  let n = 0, x = 0;
  while (performance.now() - wall0 < ms) { for (let i = 0; i < 10000; i++) x = (x * 1103515245 + 12345) % 2147483648; n++; }
  const wall = performance.now() - wall0, cpu = process.cpuUsage(cpu0);
  return { ms: Math.round(wall), loops: n, loopsPerCpuMs: +(n / ((cpu.user + cpu.system) / 1000)).toFixed(2), cpuShare: +(((cpu.user + cpu.system) / 1000) / wall).toFixed(3), x };
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('access-control-allow-origin', '*');
  if (url.pathname === '/info') {
    const body = info(); log('http.info', { from: req.socket.remoteAddress }); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(body, null, 2));
  }
  if (url.pathname === '/bench') {
    const ms = Math.min(5000, Math.max(100, Number(url.searchParams.get('ms')) || 2000));
    const r = bench(ms); log('http.bench', { ms }, r); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(r));
  }
  res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end('kanenaki probe: /info /bench /ws\n');
});

// 最小の WebSocket（text の枠だけ、届いた文字をそのまま返す）
server.on('upgrade', (req, socket) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') return socket.destroy();
  const key = req.headers['sec-websocket-key'];
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  log('ws.open', { from: req.socket.remoteAddress, origin: req.headers.origin ?? null });
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 0x0f, masked = buf[1] & 0x80; let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { return socket.destroy(); }
      const need = off + (masked ? 4 : 0) + len; if (buf.length < need) return;
      const mask = masked ? buf.subarray(off, off + 4) : null; const data = Buffer.from(buf.subarray(off + (masked ? 4 : 0), need));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(need);
      if (op === 8) { socket.end(); return; }
      if (op === 9) { socket.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; }
      if (op === 1) { const head = data.length < 126 ? Buffer.from([0x81, data.length]) : Buffer.from([0x81, 126, data.length >> 8, data.length & 255]); socket.write(Buffer.concat([head, data])); }
    }
  });
  socket.on('error', () => {});
  socket.on('close', () => log('ws.close', {}));
});

process.on('uncaughtException', (e) => log('process.exception', { msg: String(e?.message ?? e) }, 'error'));
server.listen(PORT, '0.0.0.0', () => log('probe.listen', { port: PORT, node: process.version }));
