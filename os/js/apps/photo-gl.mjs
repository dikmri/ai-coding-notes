// 写真の現像の WebGL2 の処理。式は core/photo.mjs の FRAG_SRC（developInto・renderCPU と同じ式）。
// ・プレビュー: 小さくした画像（proxy）から、canvas の大きさで描く
// ・書き出し: 元の大きさの画像（full）から、2048 画素四方の区画ごとに描いて読み出す（大きな画像でも描ける大きさの内で）
// ・ヒストグラム: 小さな区画に描いて読み出す
// 作れない（WebGL2 が無い、シェーダーが通らない）ときは createEngine が null を返し、アプリは 2D の代わりの処理を使う。
import { VERT_SRC, FRAG_SRC, uniforms, curveLUT, geometryMatrix } from '../core/photo.mjs';

const TILE = 2048;
const NAMES = ['uSrc', 'uLut', 'uSrcSize', 'uMx', 'uMy', 'uOutSize', 'uFrag', 'uWB', 'uGain', 'uSh', 'uHi', 'uBp', 'uWp', 'uK', 'uSat', 'uVib', 'uVig', 'uSharp', 'uSplit', 'uMono', 'uBypass'];

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const m = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error('シェーダーを作れませんでした: ' + m); }
  return sh;
}

export function createEngine(canvas, onLost) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, depth: false, stencil: false, alpha: true });
  if (!gl) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('シェーダーをつなげませんでした: ' + gl.getProgramInfoLog(prog));
  const U = Object.fromEntries(NAMES.map((n) => [n, gl.getUniformLocation(prog, n)]));
  const vao = gl.createVertexArray();
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const tex = { proxy: null, full: null }, size = { proxy: null, full: null }, lutTex = gl.createTexture();
  let lost = false, disposed = false, lastLut = '';
  // 自分で捨てたとき（dispose）も失われた知らせが来るので、そのときは知らせない
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; if (!disposed) onLost?.(); });

  function upload(slot, img) {
    if (img.width > maxTex || img.height > maxTex) throw new Error(`画像が大きすぎます（GPU は ${maxTex} 画素まで）。`);
    if (!tex[slot]) tex[slot] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex[slot]);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    size[slot] = { width: img.width, height: img.height };
  }
  function drop(slot) { if (tex[slot]) { gl.deleteTexture(tex[slot]); tex[slot] = null; size[slot] = null; } }
  function setLut(s) {
    const key = JSON.stringify(s.curve);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    if (key === lastLut) return;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 256, 1, 0, gl.RED, gl.FLOAT, curveLUT(s.curve));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    lastLut = key;
  }
  // 出力の一部（x0, y0 から w×h）を、今の描き先へ描く。flip = true は canvas へ（下の行から上へ）、false は読み出し用
  function draw(slot, s, outW, outH, opts, x0, y0, w, h, toCanvas) {
    const src = size[slot], M = geometryMatrix(s, src.width, src.height, outW, outH, opts), u = uniforms(s), W = u.uWB;
    gl.useProgram(prog); gl.bindVertexArray(vao); gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[slot]);
    setLut(s);
    gl.uniform1i(U.uSrc, 0); gl.uniform1i(U.uLut, 1);
    gl.uniform2f(U.uSrcSize, src.width, src.height);
    gl.uniform3f(U.uMx, M[0], M[1], M[2]); gl.uniform3f(U.uMy, M[3], M[4], M[5]);
    gl.uniform2f(U.uOutSize, outW, outH);
    gl.uniform3f(U.uFrag, x0, toCanvas ? y0 + h : y0, toCanvas ? -1 : 1);
    gl.uniformMatrix3fv(U.uWB, false, [W[0], W[3], W[6], W[1], W[4], W[7], W[2], W[5], W[8]]); // 行ごとの並びを、列ごとの並びにして渡す
    for (const k of ['uGain', 'uSh', 'uHi', 'uBp', 'uWp', 'uK', 'uSat', 'uVib', 'uVig', 'uSharp']) gl.uniform1f(U[k], u[k]);
    gl.uniform1f(U.uSplit, opts.split > 0 ? opts.split : 0);
    gl.uniform1i(U.uMono, u.uMono ? 1 : 0); gl.uniform1i(U.uBypass, opts.bypass ? 1 : 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // 区画ごとに描いて読み出し、乗算済みのアルファを元に戻して { width, height, data } にする
  function read(slot, s, outW, outH, opts = {}) {
    const out = new Uint8ClampedArray(outW * outH * 4), t = Math.min(TILE, maxTex);
    const ftex = gl.createTexture(), fb = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, ftex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, Math.min(t, outW), Math.min(t, outH));
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ftex, 0);
    try {
      for (let y0 = 0; y0 < outH; y0 += t) for (let x0 = 0; x0 < outW; x0 += t) {
        const w = Math.min(t, outW - x0), h = Math.min(t, outH - y0), buf = new Uint8Array(w * h * 4);
        draw(slot, s, outW, outH, opts, x0, y0, w, h, false);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        for (let y = 0; y < h; y++) {
          const row = buf.subarray(y * w * 4, (y + 1) * w * 4), at = ((y0 + y) * outW + x0) * 4;
          out.set(row, at);
          for (let i = 3; i < row.length; i += 4) {
            const a = row[i];
            if (a > 0 && a < 255) for (let k = 1; k <= 3; k++) out[at + i - k] = (row[i - k] * 255) / a;
          }
        }
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb); gl.deleteTexture(ftex);
    }
    return { width: outW, height: outH, data: out };
  }
  return {
    kind: 'webgl2', maxTex,
    get lost() { return lost || gl.isContextLost(); },
    setProxy: (img) => upload('proxy', img),
    // プレビュー: canvas を w×h にして描く
    preview(s, w, h, opts = {}) {
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      draw('proxy', s, w, h, opts, 0, 0, w, h, true);
    },
    readProxy: (s, w, h, opts) => read('proxy', s, w, h, opts),
    // 書き出し: 元の大きさの画像を GPU へ送って描き、終わったら捨てる
    exportFull(full, s, w, h) {
      upload('full', full);
      try { return read('full', s, w, h, {}); } finally { drop('full'); }
    },
    dispose() { disposed = true; drop('proxy'); drop('full'); gl.deleteTexture(lutTex); gl.deleteProgram(prog); gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}
