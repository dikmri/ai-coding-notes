// パズル「プリズム回廊」: 鏡とプリズムを回して、白い光を分け、曲げ、交わらせて、すべての水晶を指定の色で満たす。
// 全10面（好きな面から遊べる）、手数と記録（localStorage の fos-puzzle-best）、ヒント、矢印キーと Space/Enter・R での操作。
// 計算（光の道・交わり・解く計算・面のデータ）は core/puzzle.mjs。
import * as P from '../core/puzzle.mjs';

const BEST = 'fos-puzzle-best';
const loadBest = () => { try { const b = JSON.parse(localStorage.getItem(BEST) || '{}'); return b && typeof b === 'object' ? b : {}; } catch { return {}; } };
const saveBest = (b) => { try { localStorage.setItem(BEST, JSON.stringify(b)); } catch { /* 保存できない */ } };
const S = 48; // SVG の1マスの大きさ
const HEX = { white: '#ffffff', mint: '#6bf2e3', pink: '#ff8ec7', apricot: '#ffd37a' };
const CNAME = { white: '白', mint: 'ミント', pink: 'ピンク', apricot: 'アプリコット' };
const DIRS = ['上', '右', '下', '左'];

export async function launch(os, args = {}, rect = {}) {
  const { wm, log, sound, esc } = os;
  const one = wm.list().find((w) => w.app === 'puzzle');
  if (one) { one.focus(); return one; }
  let lv = Math.max(0, Math.min(P.LEVELS.length - 1, (args.lv | 0) || 0)), b, state, moves = 0, done = false, hintOn = 0, hintAt = -1, cur = 0, best = loadBest(), lastMsg = '', lastLit = 0;
  const win = wm.open({
    app: 'puzzle', icon: 'icons/puzzle.svg', className: 'app-puzzle', title: 'プリズム回廊', w: 820, h: 600, ...rect, args: { lv },
    render(w) {
      w.body.innerHTML = `<div class="pz-main">
        <nav class="pz-side" aria-label="面の一覧"><ol class="pz-levels" data-levels></ol></nav>
        <section class="pz-play" aria-labelledby="pzTitle-${w.id}">
          <div class="pz-head">
            <h2 class="pz-title" id="pzTitle-${w.id}" data-title></h2>
            <dl class="pz-stats"><div><dt>手数</dt><dd data-moves>0</dd></div><div><dt>記録</dt><dd data-best>—</dd></div><div><dt>目安</dt><dd data-par></dd></div></dl>
          </div>
          <div class="pz-board-wrap"><div class="pz-board" data-board></div></div>
          <p class="pz-clear" data-clear hidden></p>
          <p class="pz-hint" data-hint hidden></p>
          <div class="pz-actions">
            <button type="button" class="flat pz-btn" data-a="hint">ヒント(<u>H</u>)</button>
            <button type="button" class="flat pz-btn" data-a="reset">やり直し(<u>R</u>)</button>
            <button type="button" class="flat pz-btn pz-next" data-a="next" disabled>次の面へ(<u>N</u>)</button>
          </div>
        </section>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:150px" data-lit></div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  function say(t) { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; }

  /* ---------- 面の一覧 ---------- */
  function drawLevels() {
    q('[data-levels]').innerHTML = P.LEVELS.map((l, i) => {
      const r = best[i + 1];
      return `<li><button type="button" class="flat pz-lv${r ? ' cleared' : ''}" data-lv="${i}"${i === lv ? ' aria-current="true"' : ''}>
        <span class="pz-no">${i + 1}</span><span class="pz-name">${esc(l.title)}</span><span class="pz-rec">${r ? `${r <= l.par ? '★' : '☆'} ${r} 手` : ''}</span></button></li>`;
    }).join('');
  }

  /* ---------- 面を始める ---------- */
  function load(i, why = 'open') {
    lv = i; const l = P.LEVELS[lv];
    b = P.parse(l.map); state = P.initState(b); moves = 0; done = false; hintOn = 0; hintAt = -1; cur = b.pieces.length ? b.pieces[0].y * b.w + b.pieces[0].x : 0;
    q('[data-title]').textContent = `第${lv + 1}面 ${l.title}`;
    q('[data-par]').textContent = `${l.par} 手`;
    q('[data-hint]').hidden = true; q('[data-clear]').hidden = true;
    win.setArgs({ lv }); win.setTitle(`プリズム回廊 - 第${lv + 1}面`);
    buildBoard(); drawLevels(); draw();
    lastLit = P.trace(b, state).lit;
    log('puzzle.level', { lv: lv + 1, why }, 'ok');
  }
  // 盤: 絵は SVG、その上に透明なマスを grid として重ねる（クリック・矢印キー・フォーカスの枠・読み上げはマスで受ける）
  function buildBoard() {
    const board = q('[data-board]');
    board.style.setProperty('--w', b.w); board.style.setProperty('--h', b.h);
    let cells = '';
    for (let y = 0; y < b.h; y++) {
      cells += '<div role="row">';
      for (let x = 0; x < b.w; x++) { const i = y * b.w + x; cells += `<div role="gridcell" class="pz-cell" data-i="${i}" data-own-sound tabindex="${i === cur ? 0 : -1}"></div>`; }
      cells += '</div>';
    }
    board.innerHTML = `<svg class="pz-svg" viewBox="0 0 ${b.w * S} ${b.h * S}" aria-hidden="true" data-svg></svg><div class="pz-grid" role="grid" aria-label="盤（矢印キーでマスを選び、Space か Enter で回す）" aria-rowcount="${b.h}" aria-colcount="${b.w}" data-grid>${cells}</div>`;
  }

  /* ---------- 描く ---------- */
  function draw() {
    const r = P.trace(b, state), svg = q('[data-svg]');
    const hit = new Map(r.hits.map((h) => [h.y * b.w + h.x, h]));
    let floor = '', beams = '', parts = '';
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const c = b.cells[y * b.w + x], X = x * S, Y = y * S;
      if (c === '~') floor += `<rect x="${X}" y="${Y}" width="${S}" height="${S}" fill="#bff5ee"/><path d="M${X + 8} ${Y + 20}q6-5 12 0t12 0t12 0M${X + 8} ${Y + 32}q6-5 12 0t12 0t12 0" fill="none" stroke="#5cc9bd" stroke-width="2"/>`;
      else floor += `<rect x="${X}" y="${Y}" width="${S}" height="${S}" fill="${(x + y) % 2 ? '#e7dcf2' : '#f8f3fb'}"/>`;
    }
    // 光: 下に濃い紫の縁、上に色。マスの中心から次のマスの中心（または縁）まで
    for (const pass of [0, 1]) for (const s of r.segs) {
      const x0 = (s.x + 0.5) * S, y0 = (s.y + 0.5) * S, dx = [0, 1, 0, -1][s.d], dy = [-1, 0, 1, 0][s.d];
      const x1 = x0 + dx * s.len * S, y1 = y0 + dy * s.len * S;
      beams += pass === 0 ? `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#241734" stroke-opacity="0.55" stroke-width="9" stroke-linecap="round"/>`
        : `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${HEX[s.color]}" stroke-width="4.5" stroke-linecap="round"/>`;
    }
    for (const k of r.mixes) { const [x, y] = k.split(',').map(Number); beams += star((x + 0.5) * S, (y + 0.5) * S, 11, '#ffd37a'); }
    for (let i = 0; i < b.cells.length; i++) {
      const c = b.cells[i], x = (i % b.w) * S, y = Math.floor(i / b.w) * S, cx = x + S / 2, cy = y + S / 2;
      const pi = b.at.get(i);
      if (c === 'O') parts += `<circle cx="${cx}" cy="${cy}" r="15" fill="#cfaeff" stroke="#241734" stroke-width="2.5"/><path d="M${cx - 7} ${cy - 6}a9 9 0 0 1 8-6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`;
      else if ('>v<^'.includes(c)) { const d = '^>v<'.indexOf(c); parts += `<g transform="rotate(${d * 90} ${cx} ${cy})"><circle cx="${cx}" cy="${cy}" r="14" fill="#ffd37a" stroke="#241734" stroke-width="2.5"/><path d="M${cx} ${cy - 9}l7 11h-14z" fill="#241734"/></g>`; }
      else if (pi !== undefined && b.pieces[pi].kind === 'mirror') {
        const sl = state[pi] === 0, a = 9;
        const [x1, y1, x2, y2] = sl ? [x + a, y + S - a, x + S - a, y + a] : [x + a, y + a, x + S - a, y + S - a];
        parts += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#241734" stroke-width="9" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#eef6ff" stroke-width="4" stroke-linecap="round"/>`;
      } else if (pi !== undefined) {
        // プリズム: 平らな面（白い線）が正面。正面から入った白い光だけを分ける
        // 上向きの形を描いてから回す。上の辺に白い窓（光を受ける正面）、下に向かって細くなる三角
        parts += `<g transform="rotate(${state[pi] * 90} ${cx} ${cy})"><path d="M${x + 9} ${y + 11}h${S - 18}l${-(S - 18) / 2} ${S - 19}z" fill="#cfaeff" stroke="#241734" stroke-width="2.5" stroke-linejoin="round"/><path d="M${x + 17} ${y + 19}l7 11" stroke="#fff" stroke-width="2" stroke-linecap="round"/><rect x="${x + 8}" y="${y + 6}" width="${S - 16}" height="7" rx="2" fill="#ffffff" stroke="#241734" stroke-width="2"/></g>`;
      } else if (hit.has(i)) {
        const h = hit.get(i), f = HEX[h.color];
        parts += `${h.full ? `<circle cx="${cx}" cy="${cy}" r="21" fill="${f}" fill-opacity="0.45"/>` : ''}<path d="M${cx} ${cy - 16}l14 8v16l-14 8l-14-8v-16z" fill="${f}" fill-opacity="${h.full ? 1 : 0.55}" stroke="#241734" stroke-width="2.5" stroke-linejoin="round"${h.full ? '' : ' stroke-dasharray="4 3"'}/><path d="M${cx} ${cy - 16}v12l14-4M${cx} ${cy - 4}l-14-4M${cx} ${cy - 4}v20" fill="none" stroke="#241734" stroke-width="1.2" stroke-opacity="0.6"/>${h.full ? star(cx + 10, cy - 12, 6, '#ffffff') : ''}`;
      }
    }
    if (hintAt >= 0) { const p = b.pieces[hintAt]; parts += `<rect x="${p.x * S + 3}" y="${p.y * S + 3}" width="${S - 6}" height="${S - 6}" rx="8" fill="none" stroke="#ff5c97" stroke-width="3" stroke-dasharray="6 4"/>`; }
    svg.innerHTML = floor + beams + parts;
    // 読み上げの名前
    for (const el of q('[data-grid]').querySelectorAll('[role=gridcell]')) {
      const i = +el.dataset.i;
      el.setAttribute('aria-label', `${(i % b.w) + 1}列${Math.floor(i / b.w) + 1}行 ${cellName(i, hit)}`);
    }
    const lit = r.lit, all = r.hits.length;
    q('[data-lit]').textContent = `水晶 ${lit} / ${all}`;
    q('[data-moves]').textContent = `${moves} 手`;
    const rec = best[lv + 1]; q('[data-best]').textContent = rec ? `${rec} 手` : '—';
    q('[data-a="next"]').disabled = !done || lv === P.LEVELS.length - 1;
    return r;
  }
  function star(x, y, r, fill) { const k = r * 0.32; return `<path d="M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}z" fill="${fill}" stroke="#241734" stroke-width="1.5"/>`; }
  function cellName(i, hit) {
    const c = b.cells[i], pi = b.at.get(i);
    if (pi !== undefined) {
      const p = b.pieces[pi];
      return p.kind === 'mirror' ? `鏡（${state[pi] === 0 ? '／' : '＼'}）。押すと向きが変わる` : `プリズム（${DIRS[state[pi]]}向き）。押すと時計回りに回る`;
    }
    if (hit.has(i)) { const h = hit.get(i); return `${CNAME[h.color]}の水晶（${h.full ? '満たされている' : h.colors.size ? 'ちがう色が届いている' : 'まだ届いていない'}）`; }
    return { '.': '床', '~': '海', O: '柱', '>': '光源（右向き）', v: '光源（下向き）', '<': '光源（左向き）', '^': '光源（上向き）' }[c] || '床';
  }

  /* ---------- 操作 ---------- */
  function act(i) {
    const pi = b.at.get(i);
    if (pi === undefined) { say('このマスには、回せる部品がありません。'); return; }
    if (done) { say('この面は解けました。「やり直し」か「次の面へ」を押してください。'); return; }
    state = P.turn(b, state, pi); moves++;
    hintAt = -1; // 回したら、ヒントの囲みは消す
    const r = draw();
    log('puzzle.turn', { lv: lv + 1, piece: pi, to: state[pi], moves, lit: r.lit }, 'ok');
    if (r.lit > lastLit) sound.play('crystal', r.lit - 1); else sound.play('prism');
    lastLit = r.lit;
    if (r.won) return win1();
    const p = b.pieces[pi];
    say(p.kind === 'mirror' ? `鏡を ${state[pi] === 0 ? '／' : '＼'} にしました。` : `プリズムを${DIRS[state[pi]]}向きにしました。`);
  }
  function win1() {
    done = true;
    const l = P.LEVELS[lv], prev = best[lv + 1], first = !prev, better = prev && moves < prev;
    if (first || better) { best[lv + 1] = moves; saveBest(best); }
    const c = q('[data-clear]');
    c.textContent = `解けました！ ${moves} 手（目安 ${l.par} 手）。${moves <= l.par ? 'いちばん少ない手数です。' : 'もっと少ない手数でも解けます。'}${better ? ' 記録を縮めました。' : ''}`;
    c.hidden = false;
    setTimeout(() => sound.play('solve'), 180);
    draw(); drawLevels();
    say(lv === P.LEVELS.length - 1 ? '全10面の最後の面を解きました。' : '解けました。「次の面へ」で続けられます。');
    log('puzzle.solve', { lv: lv + 1, moves, par: l.par, best: best[lv + 1] }, 'ok');
    (lv < P.LEVELS.length - 1 ? q('[data-a="next"]') : q('[data-grid] [tabindex="0"]'))?.focus();
  }
  function reset() { load(lv, 'reset'); say('最初の向きに戻しました。'); sound.play('op'); focusCell(cur); }
  function hint() {
    const t = q('[data-hint]');
    if (done) { say('この面はもう解けています。'); return; }
    hintOn++;
    t.hidden = false;
    if (hintOn === 1) { t.textContent = 'ヒント: ' + P.LEVELS[lv].hint; say('ヒントを出しました。もう一度押すと、回す部品を1つ示します。'); }
    else {
      hintAt = P.hintPiece(b, state);
      if (hintAt >= 0) { const p = b.pieces[hintAt]; cur = p.y * b.w + p.x; draw(); focusCell(cur); say(`ピンクの点線で囲んだ${p.kind === 'mirror' ? '鏡' : 'プリズム'}（${p.x + 1}列${p.y + 1}行）を回してみましょう。`); }
    }
    log('puzzle.hint', { lv: lv + 1, step: hintOn, piece: hintAt }, 'ok');
  }
  function focusCell(i) {
    const grid = q('[data-grid]'); if (!grid) return;
    for (const el of grid.querySelectorAll('[role=gridcell]')) el.tabIndex = +el.dataset.i === i ? 0 : -1;
    const el = grid.querySelector(`[data-i="${i}"]`); el?.focus(); el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const acts = { hint, reset, next: () => { if (lv < P.LEVELS.length - 1) { load(lv + 1, 'next'); sound.play('select'); focusCell(cur); } } };
  win.body.addEventListener('click', (e) => {
    const lvB = e.target.closest('[data-lv]');
    if (lvB) { load(+lvB.dataset.lv, 'list'); sound.play('select'); say(`第${lv + 1}面を始めます。`); return; }
    const a = e.target.closest('[data-a]');
    if (a && !a.disabled) { acts[a.dataset.a](); return; }
    const cell = e.target.closest('.pz-cell');
    if (cell) { cur = +cell.dataset.i; focusCell(cur); act(cur); }
  });
  // 盤の中だけで受けるキー: 矢印でマスを動き（端では何もしない）、Space/Enter で回す、R でやり直す
  win.body.addEventListener('keydown', (e) => {
    const cell = e.target.closest?.('.pz-cell');
    if (!cell || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
    const i = +cell.dataset.i, x = i % b.w, y = Math.floor(i / b.w);
    const to = { ArrowUp: y > 0 ? i - b.w : -1, ArrowDown: y < b.h - 1 ? i + b.w : -1, ArrowLeft: x > 0 ? i - 1 : -1, ArrowRight: x < b.w - 1 ? i + 1 : -1 }[e.key];
    if (to !== undefined) { if (to >= 0) { e.preventDefault(); cur = to; focusCell(cur); } return; }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); act(i); return; }
    if (!e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); reset(); }
  });
  load(lv, 'open');
  say('鏡とプリズムを押して回し、すべての水晶を、その色の光で満たしましょう。');
  return win;
}
