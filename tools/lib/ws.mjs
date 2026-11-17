// WebSocket（RFC 6455）の最小限: 手順の返事の鍵と、枠の組み立て・読み取り。
// tools/serve.mjs（受ける側）が使う。橋渡し（tools/mcp-bridge.mjs）とブラウザは、それぞれの WebSocket を使う。
import { createHash, randomBytes } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const acceptKey = (key) => createHash('sha1').update(key + GUID).digest('base64');

// 枠を1つ組み立てる。opcode: 1 文字 / 2 バイト列 / 8 閉じる / 9 ping / 10 pong。mask は送る側が手元の機械（クライアント）のとき
export function encodeFrame(data, { opcode = 1, mask = false } = {}) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const len = payload.length, m = mask ? 0x80 : 0;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, m | len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = m | 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = m | 127; head.writeBigUInt64BE(BigInt(len), 2); }
  if (!mask) return Buffer.concat([head, payload]);
  const key = randomBytes(4), body = Buffer.alloc(len);
  for (let i = 0; i < len; i++) body[i] = payload[i] ^ key[i & 3];
  return Buffer.concat([head, key, body]);
}

// 届いたバイト列から、そろった枠を全部読む。途中までの枠は rest として返す（次に届いた分と合わせて読み直す）
export function decodeFrames(buf, { maxPayload = 16 * 1024 * 1024 } = {}) {
  const frames = [];
  let off = 0;
  while (buf.length - off >= 2) {
    const b0 = buf[off], b1 = buf[off + 1];
    let len = b1 & 0x7f, p = off + 2;
    if (len === 126) { if (buf.length - p < 2) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) {
      if (buf.length - p < 8) break;
      const big = buf.readBigUInt64BE(p);
      if (big > BigInt(maxPayload)) throw new Error('枠が大きすぎます');
      len = Number(big); p += 8;
    }
    if (len > maxPayload) throw new Error('枠が大きすぎます');
    const masked = !!(b1 & 0x80);
    let key = null;
    if (masked) { if (buf.length - p < 4) break; key = buf.subarray(p, p + 4); p += 4; }
    if (buf.length - p < len) break;
    const payload = Buffer.from(buf.subarray(p, p + len));
    if (key) for (let i = 0; i < len; i++) payload[i] ^= key[i & 3];
    const opcode = b0 & 0x0f;
    frames.push({ fin: !!(b0 & 0x80), opcode, masked, payload, text: opcode === 1 ? payload.toString('utf8') : undefined });
    off = p + len;
  }
  return { frames, rest: buf.subarray(off) };
}
