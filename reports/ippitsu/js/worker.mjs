// 線を起こして筆の列を作る重い処理を、画面とは別のスレッドで行う。
// 受け取る: { id, rgba(ArrayBuffer), w, h, options }
// 返す: { id, ok, ms, info, pts(x,y,幅 の並び), off(筆ごとの始まり), stage, kind(0=線 1=斜線), len, ink }
import { drawPlan } from './pipeline.mjs';

self.onmessage = (e) => {
  const { id, rgba, w, h, options } = e.data;
  try {
    const t0 = performance.now();
    const plan = drawPlan(new Uint8ClampedArray(rgba), w, h, options);
    const n = plan.strokes.length;
    let total = 0;
    for (const s of plan.strokes) total += s.points.length;
    const pts = new Float32Array(total * 3), off = new Uint32Array(n + 1);
    const stage = new Uint8Array(n), kind = new Uint8Array(n), level = new Uint8Array(n), len = new Float32Array(n);
    let k = 0;
    plan.strokes.forEach((s, i) => {
      off[i] = k / 3;
      for (const p of s.points) { pts[k++] = p.x; pts[k++] = p.y; pts[k++] = p.w; }
      stage[i] = s.stage; kind[i] = s.kind === 'hatch' ? 1 : s.kind === 'dot' ? 2 : s.kind === 'fill' ? 3 : 0; level[i] = s.level ?? 0; len[i] = s.length;
    });
    off[n] = k / 3;
    const ink = plan.layers.ink;
    const info = {
      mode: plan.mode, w, h, stages: plan.stages, stageCounts: plan.stageCounts, hatchCount: plan.hatchCount,
      totalLength: plan.totalLength, recorded: plan.recorded, regions: plan.regions, timings: plan.timings,
    };
    self.postMessage({ id, ok: true, ms: performance.now() - t0, info, pts, off, stage, kind, level, len, ink },
      [pts.buffer, off.buffer, stage.buffer, kind.buffer, level.buffer, len.buffer, ink.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.stack || err) });
  }
};
