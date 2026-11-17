// 文字と色の見本帳: 記号や矢印などを分類ごとに格子で並べ、番号・HTML の書き方・UTF-8 を見てコピーする。
// 色は ARCADIA-91 の16色と自由な色を、HEX・rgb()・hsl() と見やすさの比（濃い紫の文字・真珠白の地に対して）で見る。
// 計算は core/chars.mjs と core/colors.mjs。窓は1つだけ開く。
import * as C from '../core/chars.mjs';
import * as K from '../core/colors.mjs';
import { spatialKeys, rove } from '../spatial.mjs';

const RECENT = 'fos-charmap-recent', MAX_RECENT = 40;
const loadRecent = () => { try { const r = JSON.parse(localStorage.getItem(RECENT) || '[]'); return Array.isArray(r) ? r.filter((c) => typeof c === 'string' && [...c].length === 1) : []; } catch { return []; } };
const saveRecent = (r) => { try { localStorage.setItem(RECENT, JSON.stringify(r.slice(0, MAX_RECENT))); } catch { /* 保存できない */ } };
const INK = '#241734', PAPER = '#fffdf9';

export async function launch(os, args = {}, rect = {}) {
  const { wm, log, sound, esc } = os;
  const open = wm.list().find((w) => w.app === 'charmap');
  if (open) { if (open.min) open.restore(); open.focus(); return open; }
  let recent = loadRecent(), cat = recent.length ? 'recent' : 'symbols', cur = null, color = K.ARCADIA[7].hex, lastMsg = '', msgTimer = 0;
  const win = wm.open({
    app: 'charmap', icon: 'icons/charmap.svg', className: 'app-charmap', title: '文字と色の見本帳', w: 640, h: 500, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="cm-wrap"><div class="tabs">
        <div class="tab-list" role="tablist"><button type="button" class="tab" aria-selected="true">文字</button><button type="button" class="tab">色</button></div>
        <div class="tab-page cm-page">
          <div class="cm-bar">
            <label for="cmCat">分類(<u>K</u>):</label><select id="cmCat"><option value="recent">最近使った文字</option>${C.CATEGORIES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
            <label for="cmQ">探す(<u>F</u>):</label><input type="text" id="cmQ" placeholder="U+2605 か 文字" autocomplete="off" spellcheck="false"><button type="button" data-find>探す</button>
          </div>
          <div class="cm-main">
            <div class="cm-grid" role="listbox" aria-label="文字の一覧" data-grid></div>
            <div class="cm-info" aria-live="off">
              <div class="cm-big" data-big></div>
              <dl class="cm-props">
                <dt>番号</dt><dd data-cp></dd><dt>HTML</dt><dd data-html></dd><dt>名前の参照</dt><dd data-named></dd><dt>UTF-8</dt><dd data-utf8></dd><dt>分類</dt><dd data-cat></dd>
              </dl>
              <div class="cm-actions"><button type="button" data-copy>コピー(<u>C</u>)</button><button type="button" data-add>集める(<u>A</u>)</button></div>
            </div>
          </div>
          <div class="cm-collect"><label for="cmPick">集めた文字(<u>S</u>):</label><input type="text" id="cmPick" autocomplete="off" spellcheck="false"><button type="button" class="default" data-copyall>まとめてコピー(<u>O</u>)</button><button type="button" data-clear>消す</button></div>
        </div>
        <div class="tab-page cm-page" hidden>
          <div class="cm-colors">
            <div class="cm-swatches" role="listbox" aria-label="ARCADIA-91 の16色" data-swatches>${K.ARCADIA.map((c) => `<div class="cm-sw" role="option" tabindex="-1" data-hex="${c.hex}" aria-label="${c.name}（${c.role}）" title="${c.name}（${c.role}）" style="--c:${c.hex}"></div>`).join('')}</div>
            <div class="cm-free"><label for="cmColor">自由な色(<u>P</u>):</label><input type="color" id="cmColor"><input type="text" id="cmHex" maxlength="7" spellcheck="false" aria-label="HEX の値"></div>
            <div class="cm-cinfo">
              <div class="cm-cname" data-cname></div>
              <div class="cm-previews"><div class="pv pv-on" data-pv1>あア Aa 文字</div><div class="pv pv-text" data-pv2>あア Aa 文字</div></div>
              <table class="cm-ratio"><tr><th>濃い紫の文字をこの色の上に</th><td data-r1></td></tr><tr><th>この色の文字を真珠白の上に</th><td data-r2></td></tr></table>
              <div class="cm-formats">${['hex', 'rgb', 'hsl'].map((k) => `<code data-f="${k}"></code><button type="button" data-copyf="${k}">コピー</button>`).join('')}</div>
              <div class="cm-near" data-near></div>
            </div>
          </div>
        </div>
      </div></div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const grid = q('[data-grid]'), catSel = q('#cmCat'), pick = q('#cmPick');
  function say(text) {
    clearTimeout(msgTimer);
    let m = text; if (m === lastMsg) m += ' '; lastMsg = m;
    q('[data-status]').textContent = m;
    msgTimer = setTimeout(() => { q('[data-status]').textContent = ''; lastMsg = ''; }, 4000);
  }
  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); say(`${what}をコピーしました。`); log('charmap.copy', { text: text.slice(0, 40) }, 'ok'); return true; }
    catch (e) { say('コピーできませんでした。'); log('clipboard.write', {}, 'error: ' + e.message); return false; }
  }
  const remember = (ch) => { recent = [ch, ...recent.filter((c) => c !== ch)].slice(0, MAX_RECENT); saveRecent(recent); };

  /* ---------- 文字 ---------- */
  function showGrid() {
    const list = cat === 'recent' ? recent : C.charsOf(cat);
    grid.innerHTML = list.length ? list.map((ch) => `<div class="ch" role="option" tabindex="-1" aria-selected="false" data-ch="${esc(ch)}" aria-label="${esc(ch)} ${C.cpLabel(ch.codePointAt(0))}">${esc(ch)}</div>`).join('') : '<p class="cm-empty">まだありません。文字をコピーするか集めると、ここに並びます。</p>';
    const first = grid.querySelector('.ch');
    if (first) { rove(grid, '.ch', first); select(first, false); } else showInfo(null);
  }
  function showInfo(ch) {
    cur = ch;
    q('[data-big]').textContent = ch || '';
    const set = (k, v) => { q(`[data-${k}]`).textContent = v; };
    if (!ch) { ['cp', 'html', 'named', 'utf8', 'cat'].forEach((k) => set(k, '')); return; }
    const cp = ch.codePointAt(0), r = C.htmlRefs(ch), c = C.categoryOf(cp);
    set('cp', `${C.cpLabel(cp)}（10進 ${cp}）`); set('html', `${r.hex}　${r.dec}`); set('named', r.named || '－'); set('utf8', C.utf8Hex(ch));
    set('cat', c ? C.CATEGORIES.find((x) => x.id === c).name : 'ほかの文字');
  }
  function select(el, withSound = true) {
    grid.querySelectorAll('[aria-selected="true"]').forEach((x) => x.setAttribute('aria-selected', 'false'));
    el.setAttribute('aria-selected', 'true');
    rove(grid, '.ch', el);
    showInfo(el.dataset.ch);
    if (withSound) sound.play('key', el.dataset.ch.codePointAt(0) % 10);
  }
  function collect(ch) { pick.value += ch; remember(ch); sound.play('select'); say(`「${ch}」を集めました。`); log('charmap.collect', { ch }, 'ok'); }
  grid.addEventListener('click', (e) => { const el = e.target.closest('.ch'); if (el) { el.focus(); select(el); } });
  grid.addEventListener('dblclick', (e) => { const el = e.target.closest('.ch'); if (el) collect(el.dataset.ch); });
  grid.addEventListener('keydown', (e) => {
    const el = e.target.closest('.ch'); if (!el) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); collect(el.dataset.ch); }
    if (e.ctrlKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copyCur(); }
  });
  spatialKeys(grid, '.ch', (el) => select(el));
  catSel.addEventListener('change', () => { cat = catSel.value; showGrid(); log('charmap.category', { cat }, 'ok'); });
  async function copyCur() { if (!cur) { sound.play('error'); return; } if (await copy(cur, `「${cur}」`)) { remember(cur); if (cat === 'recent') showGrid(); } }
  q('[data-copy]').addEventListener('click', copyCur);
  q('[data-add]').addEventListener('click', () => { if (cur) collect(cur); });
  q('[data-copyall]').addEventListener('click', async () => { if (!pick.value) { sound.play('error'); say('集めた文字がありません。'); return; } if (await copy(pick.value, '集めた文字')) [...pick.value].forEach(remember); });
  q('[data-clear]').addEventListener('click', () => { pick.value = ''; pick.focus(); });
  function find() {
    const cp = C.parseQuery(q('#cmQ').value);
    if (cp === null) { sound.play('error'); say('「U+2605」のような番号か、文字を1つ入れてください。'); return; }
    const ch = String.fromCodePoint(cp), c = C.categoryOf(cp);
    if (c) { cat = c; catSel.value = c; showGrid(); const el = grid.querySelector(`[data-ch="${CSS.escape(ch)}"]`); if (el) { el.focus(); select(el); el.scrollIntoView({ block: 'nearest' }); } }
    else { showInfo(ch); say(`${C.cpLabel(cp)} はこの見本帳の分類にない文字です。右に詳しく出しました。`); }
    log('charmap.find', { cp }, 'ok');
  }
  q('[data-find]').addEventListener('click', find);
  q('#cmQ').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); find(); } });

  /* ---------- 色 ---------- */
  const sws = q('[data-swatches]');
  function showColor(hex, from) {
    const f = K.formats(hex); if (!f) return;
    color = f.hex;
    const official = K.ARCADIA.find((c) => c.hex === color), near = K.nearest(color);
    q('[data-cname]').textContent = official ? `${official.name}（${official.role}）` : '自由な色';
    for (const k of ['hex', 'rgb', 'hsl']) q(`[data-f="${k}"]`).textContent = f[k];
    q('[data-pv1]').style.background = color; q('[data-pv2]').style.color = color;
    const r1 = K.contrast(INK, color), r2 = K.contrast(color, PAPER);
    q('[data-r1]').textContent = `${r1.toFixed(2)} : 1　${K.grade(r1)}`; q('[data-r2]').textContent = `${r2.toFixed(2)} : 1　${K.grade(r2)}`;
    q('[data-near]').innerHTML = official ? '' : `いちばん近い ARCADIA-91 の色: <button type="button" class="flat near-btn" data-near-hex="${near.hex}"><i style="background:${near.hex}"></i>${esc(near.name)}（${near.hex}）</button>`;
    if (from !== 'picker') q('#cmColor').value = color;
    if (from !== 'hex') q('#cmHex').value = color;
    sws.querySelectorAll('.cm-sw').forEach((s) => s.setAttribute('aria-selected', String(s.dataset.hex === color)));
  }
  function pickSwatch(el) { rove(sws, '.cm-sw', el); showColor(el.dataset.hex); sound.play('key', Math.round(K.rgbToHsl(K.parseHex(el.dataset.hex)).l / 11)); }
  sws.addEventListener('click', (e) => { const el = e.target.closest('.cm-sw'); if (el) { el.focus(); pickSwatch(el); } });
  spatialKeys(sws, '.cm-sw', pickSwatch);
  q('#cmColor').addEventListener('input', (e) => showColor(e.target.value, 'picker'));
  q('#cmHex').addEventListener('input', (e) => { if (K.parseHex(e.target.value)) showColor(e.target.value, 'hex'); });
  win.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copyf]'); if (b) copy(q(`[data-f="${b.dataset.copyf}"]`).textContent, `「${q(`[data-f="${b.dataset.copyf}"]`).textContent}」`);
    const n = e.target.closest('[data-near-hex]'); if (n) { showColor(n.dataset.nearHex); sound.play('select'); }
  });

  catSel.value = cat;
  showGrid();
  const firstSw = sws.querySelector('.cm-sw'); rove(sws, '.cm-sw', sws.querySelector(`[data-hex="${color}"]`) || firstSw);
  showColor(color);
  log('charmap.open', { recent: recent.length }, 'ok');
  return win;
}
