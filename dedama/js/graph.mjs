// 出玉グラフ（差玉の線グラフ）。横軸は 10:00〜22:00、縦軸は差玉。1 画素 = 1 列で描く。
import { Columns, yRange, chainColor, chainLabel } from './logic.mjs';
import { drawText, signed } from './pixtext.mjs';

export class Graph {
  constructor({ x, y, w, h, endT }) {
    Object.assign(this, { x, y, w, h, endT });
    this.reset();
  }
  reset() {
    this.cols = new Columns(this.endT, this.w);
    this.lo = -5000; this.hi = 5000; this.step = 5000;
    this.minSeen = 0; this.maxSeen = 0;
    this.labels = []; // 終わった連チャンの札 { i, sa, chain }
    this.peak = null; // 今の連チャンの山 { i, sa, chain }
    this.nSamples = 0;
  }
  // samples（[t, sa, chain] の配列）のうち、まだ入れていない分を入れる
  sync(samples) {
    for (let k = this.nSamples; k < samples.length; k++) this.add(samples[k]);
    this.nSamples = samples.length;
  }
  add(s) {
    const [, sa, chain] = s;
    this.cols.add(s);
    if (sa < this.minSeen) this.minSeen = sa;
    if (sa > this.maxSeen) this.maxSeen = sa;
    const i = this.cols.count - 1;
    if (chain >= 1) {
      if (!this.peak || chain > this.peak.chain || sa > this.peak.sa) this.peak = { i, sa: Math.max(sa, this.peak?.sa ?? -Infinity), chain: Math.max(chain, this.peak?.chain ?? 0) };
    } else if (this.peak) {
      if (this.peak.chain >= 2) this.labels.push(this.peak);
      this.peak = null;
    }
  }
  // 目盛りの幅をなめらかに追う（急に変えると線が跳んで見える）
  ease(dt) {
    const r = yRange(this.minSeen * 1.08, this.maxSeen * 1.08);
    const k = 1 - Math.exp(-dt * 4);
    this.lo += (r.lo - this.lo) * k; this.hi += (r.hi - this.hi) * k; this.step = r.step;
    if (Math.abs(r.lo - this.lo) < 1) this.lo = r.lo;
    if (Math.abs(r.hi - this.hi) < 1) this.hi = r.hi;
  }
  Y(sa) { return Math.round(this.y + this.h - 1 - ((sa - this.lo) / (this.hi - this.lo)) * (this.h - 1)); }
  X(i) { return this.x + i; }
  tip() {
    const i = Math.max(0, this.cols.count - 1);
    return { x: this.X(i), y: this.Y(this.cols.count ? this.cols.last[i] : 0) };
  }

  draw(ctx, clock, { liveChain = 0, compact = false } = {}) {
    const { x, y, w, h } = this;
    ctx.fillStyle = '#0a0c24'; ctx.fillRect(x, y, w, h);
    // 横の目盛り
    const first = Math.ceil(this.lo / this.step) * this.step;
    for (let v = first; v <= this.hi; v += this.step) {
      const yy = this.Y(v);
      if (yy < y || yy >= y + h) continue;
      if (v === 0) { ctx.fillStyle = '#4a4470'; ctx.fillRect(x, yy, w, 1); }
      else {
        ctx.fillStyle = v === 10000 ? '#7a5a10' : v === -10000 ? '#1a4f8c' : '#1c2250';
        for (let xx = x; xx < x + w; xx += 3) ctx.fillRect(xx, yy, 1, 1);
      }
      // 数字は線の上。上の端に近い線だけ線の下に描く（上の帯に重ねない）
      if (!compact) drawText(ctx, v === 0 ? '0' : signed(v), x + 2, yy - 11 < y ? yy + 2 : yy - 11, { size: 10, color: v === 10000 ? '#ffd84a' : v === -10000 ? '#63c6ff' : '#5a5f9a' });
    }
    if (!compact) {
      if (this.hi >= 10000 && this.Y(10000) > y + 10) drawText(ctx, '万発', x + w - 2, this.Y(10000) - 11, { size: 10, color: '#ffd84a', align: 'right' });
      if (this.lo <= -10000 && this.Y(-10000) < y + h - 2) drawText(ctx, '逆万発', x + w - 2, this.Y(-10000) - 11, { size: 10, color: '#63c6ff', align: 'right' });
    }
    // 縦の目盛り（2 時間ごと）
    for (let hr = 2; hr < 12; hr += 2) {
      const xx = x + Math.round((hr / 12) * w);
      ctx.fillStyle = '#161a40';
      for (let yy = y; yy < y + h; yy += 3) ctx.fillRect(xx, yy, 1, 1);
    }
    // 線（影 → 本体）
    const c = this.cols, n = c.count;
    let prevY = this.Y(0);
    const spans = [];
    for (let i = 0; i < n; i++) {
      const yTop = Math.min(prevY, this.Y(c.max[i])), yBot = Math.max(prevY, this.Y(c.min[i]));
      spans.push([yTop, yBot]);
      prevY = this.Y(c.last[i]);
    }
    ctx.fillStyle = '#000000';
    for (let i = 0; i < n; i++) { const [a, b] = spans[i]; ctx.fillRect(this.X(i) + 1, a + 1, 1, Math.max(2, b - a + 1)); }
    for (let i = 0; i < n; i++) {
      const [a, b] = spans[i];
      ctx.fillStyle = chainColor(c.chain[i], i / 36 + clock * 0.6);
      ctx.fillRect(this.X(i), a, 1, Math.max(2, b - a + 1));
    }
    // 終わった連チャンの札
    if (!compact) {
      for (const L of this.labels) this.chainTag(ctx, L, clock, false);
      if (this.peak && this.peak.chain >= 2) this.chainTag(ctx, { ...this.peak, chain: Math.max(this.peak.chain, liveChain) }, clock, true);
    }
    // 線の先（ゆっくり点滅。1 秒に 1 回）
    if (n && !compact && (clock % 1) < 0.6) {
      const t = this.tip();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(t.x - 1, t.y - 1, 3, 3);
    }
  }
  chainTag(ctx, L, clock, live) {
    const label = chainLabel(L.chain);
    const px = this.X(L.i), py = this.Y(L.sa) - (live ? 16 + Math.round(Math.sin(clock * 6) * 1.5) : 14);
    const color = chainColor(L.chain, clock * 0.8);
    drawText(ctx, label, Math.max(this.x + 12, Math.min(this.x + this.w - 12, px)), Math.max(this.y + 1, py), { size: live ? 12 : 10, color, outline: '#000000', align: 'center', bold: live });
  }
}
