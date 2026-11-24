// 結果の画面から開くページ: 大当り履歴（データカウンターのようにページを送る）と、累計データ（概要・台ごと・来店の記録）。
import { MACHINES, machineById } from '../sim/machines.mjs';
import { chainColor } from './logic.mjs';
import { roundsText, totals, unpackRows } from './record.mjs';
import { drawText, textWidth, signed, comma } from './pixtext.mjs';
import { W, H, clockText, panel } from './scenes.mjs';
import { sfx } from './audio.mjs';
import { log } from './log.mjs';

export const HIST_ROWS = 13, LIST_ROWS = 13;
const DIM = '#7e7593', SOFT = '#a9a1bb', INK = '#ffffff', GOLD = '#ffd84a', BLUE = '#63c6ff', EV = '#ff8a8a';
const shortName = (m) => (m ? m.name.replace(/^(P|CR|e) /, '') : '（いまは無い台）');
const yenColor = (v) => (v > 0 ? GOLD : v < 0 ? BLUE : INK);
const pct = (x) => `${Math.round(x * 100)}%`;
export function dateText(at) {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// 1 画素の線（dotted なら 1 画素おきに抜く）
function pxLine(ctx, x0, y0, x1, y1, color, dotted = false, thick = 1) {
  ctx.fillStyle = color;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    if (dotted && ((i >> 1) & 1)) continue;
    ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), thick, thick);
  }
}
function header(ctx, title, sub, page, pages) {
  const tw = drawText(ctx, title, 6, 3, { size: 12, color: GOLD, bold: true });
  if (sub) drawText(ctx, sub, 6 + tw + 10, 5, { size: 10, color: SOFT });
  drawText(ctx, `${page + 1}/${pages}`, W - 6, 5, { size: 10, color: SOFT, align: 'right' });
}
// 下の帯の ◀ ▶（押せる側だけ明るく）
function arrows(ctx, page, pages, t) {
  const on = (t % 1) < 0.6 ? GOLD : '#c8a020';
  drawText(ctx, '◀ 前', 6, 203, { size: 10, color: page > 0 ? on : '#3d3550' });
  drawText(ctx, '次 ▶', W - 6, 203, { size: 10, color: page < pages - 1 ? on : '#3d3550', align: 'right' });
}
// 表の列: [見出し, x, 揃え]
function columns(ctx, cols, y) {
  for (const [name, x, align] of cols) drawText(ctx, name, x, y, { size: 10, color: DIM, align });
  ctx.fillStyle = '#3d3550'; ctx.fillRect(4, y + 12, W - 8, 1);
}
function stripe(ctx, k, y) { if (k % 2) { ctx.fillStyle = '#14122a'; ctx.fillRect(4, y - 1, W - 8, 12); } }

export function makePages(G) {
  const S = {};
  // ページを送る共通の部分（scene に page・pages・announce がある）
  const pager = {
    turn(d) {
      const n = Math.max(0, Math.min(this.pages - 1, this.page + d));
      if (n === this.page) return false;
      this.page = n; this.onPage?.();
      sfx('blip');
      log('ui.page', { scene: G.sceneName, page: n, pages: this.pages });
      G.updatePager();
      this.announce();
      return true;
    },
  };

  // ---- 大当り履歴 ----
  // G.history = { rows, title, sub, back（戻る場面）, page }
  S.history = {
    ...pager,
    enter() {
      const h = G.history;
      this.t = 0; this.rows = h.rows; this.page = h.page ?? 0;
      this.pages = Math.max(1, Math.ceil(this.rows.length / HIST_ROWS));
      this.page = Math.min(this.page, this.pages - 1);
      const hits = this.rows.filter((r) => r.no != null);
      this.summary = {
        hits: hits.length, first: hits.filter((r) => r.from === '通常').length,
        payout: hits.reduce((a, r) => a + r.payout, 0), maxChain: hits.reduce((a, r) => Math.max(a, r.chain), 0),
        resets: this.rows.length - hits.length,
      };
      G.controls('history');
      log('scene.history', { rows: this.rows.length, ...this.summary, back: h.back });
      this.announce();
    },
    onPage() { G.history.page = this.page; },
    announce() {
      const s = this.summary;
      const from = this.page * HIST_ROWS + 1, to = Math.min(this.rows.length, from + HIST_ROWS - 1);
      G.announce?.(this.rows.length
        ? `大当り履歴（${G.history.title}・${G.history.sub}）。大当り ${s.hits} 回、初当り ${s.first} 回、最高 ${s.maxChain} 連。${from}〜${to} 行目、${this.page + 1}/${this.pages} ページ`
        : `大当り履歴（${G.history.title}・${G.history.sub}）。大当りはありませんでした`);
    },
    back() { sfx('blip'); G.go(G.history.back); },
    update(dt) { this.t += dt; },
    key(e) {
      if (e.key === 'ArrowLeft') { this.turn(-1); return true; }
      if (e.key === 'ArrowRight') { this.turn(1); return true; }
      if (e.key === 'Escape' || e.key === 'Backspace') { this.back(); return true; }
      return false;
    },
    click(x, y) { if (y >= 198) { if (x < 50) this.turn(-1); else if (x > W - 50) this.turn(1); } },
    draw(ctx) {
      ctx.fillStyle = '#0b0a12'; ctx.fillRect(0, 0, W, H);
      header(ctx, '大当り履歴', `${G.history.title}・${G.history.sub}`, this.page, this.pages);
      const cols = [['回', 18, 'right'], ['時刻', 24, 'left'], ['回転', 84, 'right'], ['状態', 92, 'left'], ['種別', 128, 'left'], ['R', 236, 'right'], ['出玉', 276, 'right'], ['連', 300, 'right'], ['当った時の差玉', 378, 'right']];
      columns(ctx, cols, 20);
      if (!this.rows.length) {
        drawText(ctx, '大当りはありませんでした', W / 2, 96, { size: 12, color: SOFT, align: 'center' });
      }
      const rows = this.rows.slice(this.page * HIST_ROWS, (this.page + 1) * HIST_ROWS);
      rows.forEach((r, k) => {
        const y = 36 + k * 12;
        stripe(ctx, k, y);
        const reset = r.no == null;
        const c = reset ? DIM : INK;
        const cc = reset ? DIM : chainColor(r.chain, this.t * 0.5);
        drawText(ctx, reset ? '−' : String(r.no), 18, y, { size: 10, color: SOFT, align: 'right' });
        drawText(ctx, clockText(r.t), 24, y, { size: 10, color: SOFT });
        // 通常時の当たり（初当り）の回転数は目立たせる（ハマりが分かる）
        drawText(ctx, comma(r.spins), 84, y, { size: 10, color: r.from === '通常' && !reset ? GOLD : c, align: 'right' });
        drawText(ctx, r.from, 92, y, { size: 10, color: r.from === '通常' ? c : cc });
        drawText(ctx, r.kind, 128, y, { size: 10, color: reset ? DIM : r.kind.startsWith('通常') ? SOFT : cc });
        drawText(ctx, r.tokkaku ? `突確 ${r.rounds}R` : roundsText(r.rounds), 236, y, { size: 10, color: c, align: 'right' });
        drawText(ctx, comma(r.payout), 276, y, { size: 10, color: c, align: 'right' });
        drawText(ctx, reset ? '−' : String(r.chain), 300, y, { size: 10, color: cc, align: 'right' });
        drawText(ctx, signed(r.sa), 378, y, { size: 10, color: r.sa >= 0 ? '#fff3a0' : '#b5ecff', align: 'right' });
      });
      const s = this.summary;
      drawText(ctx, `大当り ${s.hits} 回（初当り ${s.first}）・最高 ${s.maxChain} 連・出玉 ${comma(s.payout)} 発${s.resets ? `・空振り ${s.resets}` : ''}`, W / 2, 203, { size: 10, color: SOFT, align: 'center' });
      arrows(ctx, this.page, this.pages, this.t);
    },
  };

  // ---- 累計データ ----
  // ページ 0 = 概要（グラフ）、1 = 台ごと、2〜 = 来店の記録（新しい順、行を選んでその日の大当り履歴を開く）
  S.total = {
    ...pager,
    enter() {
      this.t = 0;
      this.list = G.records.read();
      this.sum = totals(this.list, MACHINES);
      const v = (G.totalView ??= { page: 0, sel: 0 });
      this.listPages = Math.max(1, Math.ceil(this.list.length / LIST_ROWS));
      this.pages = 2 + this.listPages;
      this.page = Math.min(v.page, this.pages - 1);
      this.confirming = false;
      G.controls('total');
      log('scene.total', { visits: this.sum.visits, yen: this.sum.yen, ev: this.sum.ev, wins: this.sum.wins, page: this.page, back: G.totalBack });
      this.announce();
    },
    onPage() { G.totalView.page = this.page; G.totalView.sel = 0; },
    // 来店の記録のページの k 行目（新しい順）
    visitAt(page, k) {
      const i = this.list.length - 1 - (page - 2) * LIST_ROWS - k;
      return i >= 0 && k < LIST_ROWS ? { rec: this.list[i], no: i + 1 } : null;
    },
    announce() {
      const s = this.sum;
      let text;
      if (this.page === 0) text = s.visits ? `累計データ。来店 ${s.visits} 回、収支 ${signed(s.yen)} 円、勝ち ${s.wins} 回・負け ${s.losses} 回、期待値の合計 ${signed(s.ev)} 円` : '累計データ。まだ記録がありません';
      else if (this.page === 1) text = `台ごとの成績。${s.byMachine.map((b) => `${shortName(machineById(b.id))} ${b.visits} 回 ${signed(b.yen)} 円`).join('、') || '記録なし'}`;
      else {
        const first = this.visitAt(this.page, 0);
        text = first ? `来店の記録（新しい順）。${first.no} 回目から。上下の矢印で選び、Enter でその日の大当り履歴` : '来店の記録はまだありません';
      }
      G.announce?.(`${text}。${this.page + 1}/${this.pages} ページ`);
    },
    back() { sfx('blip'); G.go(G.totalBack || 'title'); },
    select(d) {
      if (this.page < 2) return false;
      let n = 0;
      while (this.visitAt(this.page, n)) n++;
      if (!n) return false;
      G.totalView.sel = (G.totalView.sel + d + n) % n;
      const v = this.visitAt(this.page, G.totalView.sel);
      sfx('blip');
      G.announce?.(`${v.no} 回目 ${dateText(v.rec.at)} ${shortName(machineById(v.rec.m))} 収支 ${signed(v.rec.yen)} 円${v.rec.hist ? '' : '（大当り履歴は残っていません）'}`);
      return true;
    },
    open(k = G.totalView.sel) {
      const v = this.page >= 2 && this.visitAt(this.page, k);
      if (!v) return;
      G.totalView.sel = k;
      log('ui.total.open', { no: v.no, at: v.rec.at, m: v.rec.m, hist: !!v.rec.hist });
      if (!v.rec.hist) { sfx('blip'); G.announce?.('この来店の大当り履歴は残っていません（新しい 100 回分だけ残します）'); return; }
      sfx('decide');
      G.history = { rows: unpackRows(v.rec.hist), title: shortName(machineById(v.rec.m)), sub: `${v.no} 回目 ${dateText(v.rec.at)}`, back: 'total', page: 0 };
      G.go('history');
    },
    // 記録を消す: 1 回目で確かめ、2 回目で消す（画面の中で確かめる）
    clear() {
      if (!this.confirming) {
        this.confirming = true;
        const b = document.getElementById('btn-clear');
        if (b) b.textContent = '本当に消す（もう一度押す）';
        G.announce?.(`累計の記録 ${this.sum.visits} 回分を消します。消すならもう一度押してください。元には戻せません`);
        log('ui.total.clear', { step: 'confirm', visits: this.sum.visits });
        return;
      }
      G.records.clear();
      G.totalView = { page: 0, sel: 0 };
      this.enter();
      G.announce?.('累計の記録を消しました');
    },
    update(dt) { this.t += dt; },
    key(e) {
      if (e.key === 'ArrowLeft') { this.turn(-1); return true; }
      if (e.key === 'ArrowRight') { this.turn(1); return true; }
      if (e.key === 'ArrowUp') return this.select(-1);
      if (e.key === 'ArrowDown') return this.select(1);
      if (e.key === 'Enter' && this.page >= 2) { this.open(); return true; }
      if (e.key === 'Escape' || e.key === 'Backspace') { this.back(); return true; }
      return false;
    },
    click(x, y) {
      if (y >= 198) { if (x < 50) this.turn(-1); else if (x > W - 50) this.turn(1); return; }
      if (this.page >= 2 && y >= 35) {
        const k = Math.floor((y - 35) / 12);
        if (this.visitAt(this.page, k)) { if (k === G.totalView.sel) this.open(k); else { G.totalView.sel = k; this.select(0); } }
      }
    },
    draw(ctx) {
      ctx.fillStyle = '#0b0a12'; ctx.fillRect(0, 0, W, H);
      const s = this.sum;
      const title = ['累計データ', '台ごとの成績', '来店の記録'][Math.min(2, this.page)];
      header(ctx, title, s.visits ? `来店 ${s.visits} 回` : '', this.page, this.pages);
      if (this.page === 0) this.drawSummary(ctx, s);
      else if (this.page === 1) this.drawMachines(ctx, s);
      else this.drawVisits(ctx);
      arrows(ctx, this.page, this.pages, this.t);
    },
    drawSummary(ctx, s) {
      drawCumulative(ctx, s, 6, 20, 234, 118);
      // 右: 数字
      const lines = s.visits ? [
        ['来店', `${s.visits} 回`],
        ['勝ち・負け', `${s.wins}・${s.losses} 回`],
        ['勝率', pct(s.winRate)],
        ['投資', `${comma(s.invest)} 円`],
        ['回収', `${comma(s.back)} 円`],
        ['期待値', `${signed(s.ev)} 円`, EV],
        ['1 回の平均', `${signed(s.avg)} 円`, yenColor(s.avg)],
        ['最高の日', `${signed(s.best.yen)} 円`, yenColor(s.best.yen)],
        ['最悪の日', `${signed(s.worst.yen)} 円`, yenColor(s.worst.yen)],
        ['初当り', s.firstRate ? `1/${Math.round(s.firstRate)}` : '−'],
        ['最高', `${s.maxChain} 連`],
      ] : [];
      drawText(ctx, '累計の収支', 246, 20, { size: 10, color: SOFT });
      drawText(ctx, `${signed(s.yen)} 円`, 378, 32, { size: 14, color: yenColor(s.yen), bold: true, align: 'right' });
      lines.forEach(([k, v, color], i) => {
        drawText(ctx, k, 246, 50 + i * 12, { size: 10, color: DIM });
        drawText(ctx, v, 378, 50 + i * 12, { size: 10, color: color ?? INK, align: 'right' });
      });
      // 下: 収支 = 期待値 + 運
      if (!s.visits) {
        drawText(ctx, 'まだ記録がありません。1 日遊ぶと、ここに残ります', 6, 182, { size: 10, color: SOFT });
        return;
      }
      drawText(ctx, `実際の収支 ＝ 期待値 ${signed(s.ev)} 円 ＋ 運 ${signed(s.yen - s.ev)} 円`, 6, 182, { size: 10, color: INK });
      drawText(ctx, `期待値は 1 回あたり ${signed(s.ev / s.visits)} 円。続けるほど平均はここに近づく`, W / 2, 194, { size: 10, color: SOFT, align: 'center' });
    },
    drawMachines(ctx, s) {
      const cols = [['台', 6, 'left'], ['来店', 146, 'right'], ['勝ち', 174, 'right'], ['収支', 234, 'right'], ['期待値', 294, 'right'], ['初当り', 338, 'right'], ['最高', 378, 'right']];
      columns(ctx, cols, 20);
      if (!s.byMachine.length) drawText(ctx, 'まだ記録がありません', W / 2, 96, { size: 12, color: SOFT, align: 'center' });
      s.byMachine.forEach((b, k) => {
        const y = 36 + k * 12;
        stripe(ctx, k, y);
        drawText(ctx, shortName(machineById(b.id)), 6, y, { size: 10, color: INK });
        drawText(ctx, String(b.visits), 146, y, { size: 10, color: INK, align: 'right' });
        drawText(ctx, String(b.wins), 174, y, { size: 10, color: INK, align: 'right' });
        drawText(ctx, signed(b.yen), 234, y, { size: 10, color: yenColor(b.yen), align: 'right' });
        drawText(ctx, signed(b.ev), 294, y, { size: 10, color: EV, align: 'right' });
        drawText(ctx, b.first ? `1/${Math.round(b.ns / b.first)}` : '−', 338, y, { size: 10, color: INK, align: 'right' });
        drawText(ctx, `${b.maxChain} 連`, 378, y, { size: 10, color: chainColor(b.maxChain, this.t * 0.5), align: 'right' });
      });
    },
    drawVisits(ctx) {
      // 列の右端。大当り 3 桁・最高 100 連以上（LT の台）でも詰まらないように、最高の列を広めに取る
      const cols = [['回', 22, 'right'], ['日時', 28, 'left'], ['台', 90, 'left'], ['回転', 236, 'right'], ['大当り', 270, 'right'], ['最高', 310, 'right'], ['収支', 378, 'right']];
      columns(ctx, cols, 20);
      if (!this.list.length) { drawText(ctx, 'まだ記録がありません', W / 2, 96, { size: 12, color: SOFT, align: 'center' }); return; }
      for (let k = 0; k < LIST_ROWS; k++) {
        const v = this.visitAt(this.page, k);
        if (!v) break;
        const y = 36 + k * 12, r = v.rec, sel = k === G.totalView.sel;
        stripe(ctx, k, y);
        if (sel) { ctx.fillStyle = (this.t % 1) < 0.7 ? GOLD : '#c8a020'; ctx.fillRect(4, y - 1, 1, 12); ctx.fillRect(W - 5, y - 1, 1, 12); ctx.fillRect(4, y - 1, W - 8, 1); ctx.fillRect(4, y + 10, W - 8, 1); }
        const c = r.hist ? INK : SOFT;
        drawText(ctx, String(v.no), 22, y, { size: 10, color: SOFT, align: 'right' });
        drawText(ctx, dateText(r.at), 28, y, { size: 10, color: SOFT });
        drawText(ctx, shortName(machineById(r.m)), 90, y, { size: 10, color: c });
        drawText(ctx, comma(r.spins), 236, y, { size: 10, color: c, align: 'right' });
        drawText(ctx, String(r.hits), 270, y, { size: 10, color: c, align: 'right' });
        drawText(ctx, `${r.maxChain} 連`, 310, y, { size: 10, color: chainColor(r.maxChain, this.t * 0.5), align: 'right' });
        drawText(ctx, signed(r.yen), 378, y, { size: 10, color: yenColor(r.yen), align: 'right' });
      }
      drawText(ctx, '↑↓ で選んで Enter（クリック）で大当り履歴', W / 2, 203, { size: 10, color: SOFT, align: 'center' });
    },
  };
  return S;
}

// 累計の収支の折れ線（実線）と期待値の合計（点線）、その下に 1 回ごとの収支の棒
export function drawCumulative(ctx, s, x, y, w, h) {
  panel(ctx, x, y, w, h + 40, '#0a0c24', '#3d3550');
  const n = s.visits;
  if (!n) { drawText(ctx, '記録なし', x + w / 2, y + h / 2 - 5, { size: 10, color: DIM, align: 'center' }); return; }
  const all = [...s.running, ...s.expected];
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  if (hi - lo < 20000) { const mid = (hi + lo) / 2; lo = Math.min(lo, mid - 10000); hi = Math.max(hi, mid + 10000); }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const gx0 = x + 2, gw = w - 4, gy0 = y + 2, gh = h - 4;
  const X = (i) => Math.round(gx0 + (i / n) * (gw - 1));
  const Y = (v) => Math.round(gy0 + gh - 1 - ((v - lo) / (hi - lo)) * (gh - 1));
  // 0 の線と、上下の目盛り
  ctx.fillStyle = '#4a4470'; ctx.fillRect(gx0, Y(0), gw, 1);
  // 「0」は上下の目盛りに近いときは書かない（重なるので）
  if (Y(0) - 11 > gy0 + 12 && Y(0) - 11 < gy0 + gh - 23) drawText(ctx, '0', gx0 + 2, Y(0) - 11, { size: 10, color: DIM });
  drawText(ctx, signed(Math.round(hi / 1000) * 1000), gx0 + 2, gy0 + 1, { size: 10, color: DIM });
  drawText(ctx, signed(Math.round(lo / 1000) * 1000), gx0 + 2, gy0 + gh - 11, { size: 10, color: DIM });
  // 期待値（点線）、実際（太い実線。0 より上は金、下は水色）
  for (let i = 1; i <= n; i++) pxLine(ctx, X(i - 1), Y(s.expected[i - 1]), X(i), Y(s.expected[i]), EV, true);
  for (let i = 1; i <= n; i++) {
    const v = s.running[i];
    pxLine(ctx, X(i - 1), Y(s.running[i - 1]), X(i), Y(v), v >= 0 ? GOLD : BLUE, false, 2);
  }
  // 1 回ごとの収支の棒（帯の真ん中が 0）
  const by = y + h + 2, bh = 24, mid = by + bh / 2;
  ctx.fillStyle = '#3d3550'; ctx.fillRect(gx0, Math.round(mid), gw, 1);
  const diffs = s.running.slice(1).map((v, i) => v - s.running[i]);
  const maxAbs = Math.max(1, ...diffs.map(Math.abs));
  // i 回目の棒は、折れ線の点 i と点 i+1 の間の区画に収める（枠の外へ出さない）
  const bw = Math.max(1, Math.floor(gw / n) - 1);
  diffs.forEach((d, i) => {
    const bx = Math.min(gx0 + gw - bw, gx0 + Math.floor((i * gw) / n)), len = Math.max(1, Math.round((Math.abs(d) / maxAbs) * (bh / 2 - 1)));
    ctx.fillStyle = d >= 0 ? GOLD : BLUE;
    if (d >= 0) ctx.fillRect(bx, Math.round(mid) - len, bw, len); else ctx.fillRect(bx, Math.round(mid) + 1, bw, len);
  });
  // 凡例と横軸
  drawText(ctx, '━ 実際', x + w - 4, y + 3, { size: 10, color: GOLD, align: 'right' });
  drawText(ctx, '┅ 期待値', x + w - 4, y + 15, { size: 10, color: EV, align: 'right' });
  drawText(ctx, `1 回ごとの収支（${n} 回）`, x + w / 2, by + bh + 1, { size: 10, color: DIM, align: 'center' });
}
