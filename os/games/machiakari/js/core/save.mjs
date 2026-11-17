// 保存: 街を文字列（JSON）にする。マスの配列は、同じ値が続く所を縮めて（ランレングス）base64 にする
import { LAYERS } from './city.mjs';

export const SAVE_VERSION = 1;

function rle(bytes) {
  const out = [];
  for (let x = 0; x < bytes.length;) {
    const v = bytes[x];
    let n = 1;
    while (n < 255 && x + n < bytes.length && bytes[x + n] === v) n++;
    out.push(n, v);
    x += n;
  }
  return Uint8Array.from(out);
}
function unrle(packed, len) {
  const out = new Uint8Array(len);
  let p = 0;
  for (let x = 0; x + 1 < packed.length; x += 2) { out.fill(packed[x + 1], p, p + packed[x]); p += packed[x]; }
  if (p !== len) throw new Error('保存の中身が壊れています');
  return out;
}
function toB64(bytes) {
  let s = '';
  for (let x = 0; x < bytes.length; x += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(x, x + 0x8000));
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str), out = new Uint8Array(s.length);
  for (let x = 0; x < s.length; x++) out[x] = s.charCodeAt(x);
  return out;
}

export function serialize(s) {
  const meta = {}, layers = {};
  for (const [k, v] of Object.entries(s)) {
    if (k in LAYERS) layers[k] = toB64(rle(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)));
    else if (k !== 'rev') meta[k] = v;
  }
  return JSON.stringify({ v: SAVE_VERSION, meta, layers });
}

export function deserialize(str) {
  const o = JSON.parse(str);
  if (!o || o.v !== SAVE_VERSION) throw new Error(`保存の版が違います（${o && o.v}）`);
  const s = { ...o.meta, rev: 1 };
  const n = s.N * s.N;
  for (const [k, T] of Object.entries(LAYERS)) {
    if (!o.layers[k]) throw new Error(`保存に「${k}」がありません`);
    const bytes = unrle(fromB64(o.layers[k]), n * T.BYTES_PER_ELEMENT);
    s[k] = new T(bytes.buffer);
  }
  return s;
}
