// SID 風シンセ: 3つの声部の音色、共通のフィルター、16ステップのパターンを並び順でつなぐ打ち込み、
// パソコンの鍵盤で弾く・打ち込む、波形の表示、.sng の保存、WAV の書き出し
import { SidEngine, defaultSong, defaultVoice, keyToNote, normalizeSong } from '../core/sidengine.mjs';
import { noteName, TRI, SAW, PUL, NOI } from '../core/sid.mjs';
import { emptyPattern, songLength } from '../core/song.mjs';
import { encodeWAV } from '../core/wav.mjs';
import { basename, dirname, stem } from '../core/path.mjs';

const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="new"><span class="label">新規(<u>N</u>)</span></div>
    <div class="menu-item" data-command="open"><span class="label">開く(<u>O</u>)...</span><span class="shortcut">Ctrl+O</span></div>
    <div class="menu-item" data-command="save"><span class="label">上書き保存(<u>S</u>)</span><span class="shortcut">Ctrl+S</span></div>
    <div class="menu-item" data-command="saveas"><span class="label">名前を付けて保存(<u>A</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="wav" data-status="曲を WAV 形式の音声にして、仮想ドライブへ保存します。"><span class="label">WAV で書き出す(<u>W</u>)...</span></div>
    <div class="menu-item" data-command="wavpc" data-status="曲を WAV 形式の音声にして、パソコンへ保存します。"><span class="label">パソコンへ WAV を書き出す(<u>X</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>C</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="undo"><span class="label">元に戻す(<u>U</u>)</span><span class="shortcut">Ctrl+Z</span></div>
    <div class="menu-item" data-command="redo"><span class="label">やり直し(<u>R</u>)</span><span class="shortcut">Ctrl+Y</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="copy"><span class="label">パターンをコピー(<u>C</u>)</span><span class="shortcut">Ctrl+C</span></div>
    <div class="menu-item" data-command="paste"><span class="label">パターンに貼り付け(<u>P</u>)</span><span class="shortcut">Ctrl+V</span></div>
    <div class="menu-item" data-command="clear"><span class="label">パターンを空にする(<u>E</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="tr:1" data-status="カーソルのある声部の音を、このパターンの中だけ半音上げます。"><span class="label">この声部を半音上げる(<u>H</u>)</span><span class="shortcut">Ctrl+↑</span></div>
    <div class="menu-item" data-command="tr:-1"><span class="label">この声部を半音下げる(<u>J</u>)</span><span class="shortcut">Ctrl+↓</span></div>
    <div class="menu-item" data-command="tr:12"><span class="label">この声部を1オクターブ上げる(<u>K</u>)</span><span class="shortcut">Ctrl+Shift+↑</span></div>
    <div class="menu-item" data-command="tr:-12"><span class="label">この声部を1オクターブ下げる(<u>L</u>)</span><span class="shortcut">Ctrl+Shift+↓</span></div>
  </div></div>
  <div class="menu-title">パターン(<u>T</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="patnew"><span class="label">新しいパターン(<u>N</u>)</span></div>
    <div class="menu-item" data-command="patdup"><span class="label">このパターンを複製(<u>D</u>)</span></div>
    <div class="menu-item" data-command="patdel"><span class="label">このパターンを消す(<u>L</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="patadd" data-status="いま表示しているパターンを、並び順の最後に足します。"><span class="label">並び順の最後に足す(<u>A</u>)</span></div>
  </div></div>
  <div class="menu-title">再生(<u>P</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="play"><span class="label">曲を頭から再生(<u>S</u>)</span><span class="shortcut">F5</span></div>
    <div class="menu-item" data-command="loop"><span class="label">このパターンを繰り返す(<u>P</u>)</span><span class="shortcut">F6</span></div>
    <div class="menu-item" data-command="stop"><span class="label">停止(<u>T</u>)</span><span class="shortcut">F8</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item checked" data-toggle="check" data-command="follow"><span class="label">再生位置を追う(<u>F</u>)</span></div>
    <div class="menu-item checked" data-toggle="check" data-command="rec"><span class="label">鍵盤で打ち込む(<u>R</u>)</span></div>
  </div></div>
  <div class="menu-title">音色(<u>V</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="pre:lead"><span class="label">リード（矩形）(<u>L</u>)</span></div>
    <div class="menu-item" data-command="pre:arp"><span class="label">分散和音（細い矩形）(<u>A</u>)</span></div>
    <div class="menu-item" data-command="pre:bass"><span class="label">ベース（三角）(<u>B</u>)</span></div>
    <div class="menu-item" data-command="pre:brass"><span class="label">ブラス（ノコギリ）(<u>S</u>)</span></div>
    <div class="menu-item" data-command="pre:mix"><span class="label">合成波（三角＋ノコギリ）(<u>M</u>)</span></div>
    <div class="menu-item" data-command="pre:drum"><span class="label">ドラム（雑音）(<u>D</u>)</span></div>
    <div class="menu-item" data-command="pre:hat"><span class="label">ハイハット（短い雑音）(<u>H</u>)</span></div>
    <div class="menu-item" data-command="pre:bell"><span class="label">ベル（リング変調）(<u>E</u>)</span></div>
    <div class="menu-item" data-command="pre:metal"><span class="label">金属音（同期）(<u>K</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="pre:init"><span class="label">初めの音色に戻す(<u>I</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="help"><span class="label">使い方(<u>H</u>)</span><span class="shortcut">F1</span></div>
    <div class="menu-item" data-command="about"><span class="label">シンセについて(<u>A</u>)</span></div>
  </div></div>
</div>`;

const PRESETS = {
  lead: { wave: PUL, pw: 0.5, a: 0.004, d: 0.15, s: 0.65, r: 0.2, sync: false, ring: false },
  arp: { wave: PUL, pw: 0.15, a: 0.001, d: 0.08, s: 0.35, r: 0.06, sync: false, ring: false },
  bass: { wave: TRI, pw: 0.5, a: 0.002, d: 0.12, s: 0.7, r: 0.06, sync: false, ring: false },
  brass: { wave: SAW, pw: 0.5, a: 0.03, d: 0.25, s: 0.6, r: 0.2, sync: false, ring: false },
  mix: { wave: TRI | SAW, pw: 0.5, a: 0.005, d: 0.2, s: 0.5, r: 0.15, sync: false, ring: false },
  drum: { wave: NOI, pw: 0.5, a: 0.001, d: 0.09, s: 0, r: 0.04, sync: false, ring: false },
  hat: { wave: NOI, pw: 0.5, a: 0.001, d: 0.03, s: 0, r: 0.02, sync: false, ring: false },
  bell: { wave: TRI, pw: 0.5, a: 0.001, d: 0.6, s: 0, r: 0.6, sync: false, ring: true },
  metal: { wave: SAW, pw: 0.5, a: 0.002, d: 0.3, s: 0.4, r: 0.2, sync: true, ring: false },
};
const WAVES = [[TRI, '三角'], [SAW, 'ノコギリ'], [PUL, '矩形'], [NOI, '雑音']];
// つまみ: 0〜100 の位置と実際の値の行き来。時間と周波数は対数で割り振る
const logMap = (lo, hi) => ({ to: (x) => lo * (hi / lo) ** (x / 100), from: (v) => (100 * Math.log(v / lo)) / Math.log(hi / lo) });
const T = logMap(0.001, 2), CUT = logMap(30, 12000);
const ms = (v) => (v < 1 ? Math.round(v * 1000) + 'ms' : v.toFixed(1) + 's');
const KNOBS = [
  ['pw', '幅', (x) => 0.02 + (x / 100) * 0.96, (v) => ((v - 0.02) / 0.96) * 100, (v) => Math.round(v * 100) + '%'],
  ['a', '立上り', T.to, T.from, ms], ['d', '減衰', T.to, T.from, ms],
  ['s', '持続', (x) => x / 100, (v) => v * 100, (v) => Math.round(v * 100) + '%'], ['r', '余韻', T.to, T.from, ms],
];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let moduleFor = null; // AudioWorklet の読み込みは、音の文脈ごとに1回

// 曲のデータを整える処理は core/sidengine.mjs の normalizeSong（音楽プレーヤーと共通）
const normalize = normalizeSong;

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log } = os;
  let path = args.path || null, song = defaultSong(), dirty = false;
  if (path) {
    try { song = normalize(await fs.readJSON(path)); }
    catch (e) { os.msgbox({ title: 'SID 風シンセ', text: `曲を読めませんでした。\n\n${e.message}`, icon: 'error' }); path = null; }
  }
  let pat = song.order[0], cur = { voice: 0, step: 0 }, octave = 4, follow = true, rec = true, pos = null, clip = null;
  let clipLoop = false, loopPat = null, pending = null;
  const patAt = (p) => (p ? (clipLoop ? loopPat : song.order[p.order]) : null); // 再生中のパターンの名前
  const undo = [], redo = [];
  const win = wm.open({
    app: 'synth', icon: 'icons/synth.svg', className: 'app-synth', w: 900, h: 700, ...rect, args: path ? { path } : {},
    render(w) {
      w.body.innerHTML = MENU + `
      <div class="synth-top">
        <canvas class="lcd" aria-label="波形の表示"></canvas>
        <div class="col">
          <div class="row"><button type="button" data-command="play" title="曲を頭から再生 (F5)">▶ 再生</button><button type="button" data-command="loop" title="このパターンを繰り返す (F6・Space)">⟲ パターン</button><button type="button" data-command="stop" title="停止 (F8・Esc)">■ 停止</button></div>
          <div class="row"><label for="sy-bpm">速さ(<u>B</u>):</label><input type="number" id="sy-bpm" data-bpm min="40" max="300" style="width:56px"><span>BPM</span>
          <label for="sy-oct">オクターブ(<u>O</u>):</label><input type="number" id="sy-oct" data-oct min="0" max="8" style="width:40px"></div>
          <div class="row"><label for="sy-vol">音量:</label><input type="range" id="sy-vol" data-vol min="0" max="100" style="width:120px"></div>
        </div>
      </div>
      <div class="voices">${[0, 1, 2].map((v) => `<fieldset data-voice="${v}"><legend>声部 ${v + 1}</legend>
        <div class="waves">${WAVES.map(([b, n]) => `<label><input type="checkbox" data-wave="${b}"> ${n}</label>`).join('')}</div>
        <div class="knobs">${KNOBS.map(([k, n]) => `<label for="sy-${v}-${k}">${n}</label><input type="range" id="sy-${v}-${k}" data-knob="${k}" min="0" max="100" step="0.5"><output data-out="${k}"></output>`).join('')}</div>
        <div class="waves"><label title="1つ前の声部が1周するたびに、この声部の波形を頭に戻します"><input type="checkbox" data-flag="sync"> 同期</label><label title="三角波を、1つ前の声部で裏返して金属的な音にします"><input type="checkbox" data-flag="ring"> リング</label><label><input type="checkbox" data-flag="filter"> フィルター</label><label><input type="checkbox" data-flag="mute"> 消音</label></div>
      </fieldset>`).join('')}</div>
      <div class="filter-row"><span>フィルター:</span><label><input type="checkbox" data-fmode="lp"> 低い音を通す</label><label><input type="checkbox" data-fmode="bp"> 帯域</label><label><input type="checkbox" data-fmode="hp"> 高い音を通す</label>
        <label for="sy-cut">遮断:</label><input type="range" id="sy-cut" data-cut min="0" max="100" step="0.5" style="width:120px"><output data-cutout style="width:52px"></output>
        <label for="sy-res">鋭さ:</label><input type="range" id="sy-res" data-res min="0" max="100" style="width:80px"></div>
      <div class="seq-bar"><label for="sy-pat">パターン(<u>P</u>):</label><select id="sy-pat" data-pat></select>
        <button type="button" data-command="patnew">新規</button><button type="button" data-command="patdup">複製</button>
        <label for="sy-order">並び順(<u>R</u>):</label><input type="text" id="sy-order" data-order style="width:160px" spellcheck="false" title="パターンの文字を空白で区切って並べます。例: A A B A">
        <label><input type="checkbox" data-rec> 鍵盤で打ち込む(<u>W</u>)</label></div>
      <div class="seq-wrap"><table class="seq" role="grid" aria-label="打ち込みの表。矢印キーで動き、Z〜M と Q〜P の鍵盤で音を入れる"></table></div>
      <div class="status-bar"><div class="status-field" data-s1>表を押してから Z〜M・Q〜P の鍵盤で音を入れます。1 で音を止め、Del で空にします。</div><div class="status-field" style="width:200px" data-s2></div><div class="status-field" style="width:120px" data-s3></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      if (!dirty) return true;
      const a = await os.msgbox({ title: 'SID 風シンセ', text: `${path ? basename(path) : '無題'} は変更されています。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return await save();
      return true;
    },
  });
  const B = (s) => win.body.querySelector(s), st = (k, v) => { B(`[data-${k}]`).textContent = v; };
  const table = B('table.seq'), lcd = B('canvas.lcd'), lx = lcd.getContext('2d');
  const title = () => win.setTitle(`${dirty ? '*' : ''}${path ? basename(path) : '無題'} - SID 風シンセ`);

  /* ----- 音を鳴らす仕組み（AudioWorklet）----- */
  let node = null, analyser = null, out = null, wave = null, audioErr = null;
  try {
    const ac = os.sound.unlock();
    if (!ac?.audioWorklet) throw new Error('このブラウザでは AudioWorklet が使えません。');
    if (moduleFor !== ac) { await ac.audioWorklet.addModule(new URL('./sid-worklet.mjs', import.meta.url)); moduleFor = ac; }
    node = new AudioWorkletNode(ac, 'fos-sid', { numberOfInputs: 0, outputChannelCount: [2] });
    analyser = ac.createAnalyser(); analyser.fftSize = 1024; wave = new Float32Array(analyser.fftSize);
    out = ac.createGain();
    node.connect(analyser).connect(out).connect(ac.destination);
    node.port.onmessage = ({ data }) => { if (data.type === 'pos') onPos(data.pos); };
  } catch (e) {
    audioErr = e.message; log('synth.audio', {}, 'error: ' + e.message);
  }
  const send = (m) => node?.port.postMessage(m);
  const plain = () => JSON.parse(JSON.stringify(song));
  let lastSound = 0, held = new Map();

  /* ----- 表示 ----- */
  function cellText(n) { return n === -1 ? '===' : typeof n === 'number' ? noteName(n) : '···'; }
  const cellLabel = (v, i, n) => `声部${v + 1} ステップ${i + 1} ${n === -1 ? '止める' : typeof n === 'number' ? noteName(n) : '空'}`;
  const cellAt = (v, i) => table.querySelector(`td[data-v="${v}"][data-i="${i}"]`);
  // 表を作り直す（パターンの切り替え・貼り付け・元に戻すなど）。フォーカスは今いるセル1つだけに置く
  function drawTable() {
    const keep = table.contains(document.activeElement), p = song.patterns[pat];
    let h = '<tr><th scope="col"></th>' + Array.from({ length: 16 }, (_, i) => `<th scope="col">${i + 1}</th>`).join('') + '</tr>';
    for (let v = 0; v < 3; v++) {
      h += `<tr><th scope="row">声部${v + 1}</th>` + p[v].map((n, i) => {
        const here = cur.voice === v && cur.step === i;
        return `<td role="gridcell" data-v="${v}" data-i="${i}" tabindex="${here ? 0 : -1}" aria-selected="${here}" aria-label="${cellLabel(v, i, n)}" class="${i % 4 === 0 ? 'beat' : ''}${here ? ' cur' : ''}${pos && patAt(pos) === pat && pos.step === i ? ' play' : ''}">${cellText(n)}</td>`;
      }).join('') + '</tr>';
    }
    table.innerHTML = h;
    if (keep) focusCur();
    statusCell();
  }
  function statusCell() { st('s2', `声部${cur.voice + 1} ・ ステップ ${cur.step + 1} ・ ${cellText(song.patterns[pat][cur.voice][cur.step])}`); }
  function updateCell(v, i) { const td = cellAt(v, i), n = song.patterns[pat][v][i]; if (!td) return; td.textContent = cellText(n); td.setAttribute('aria-label', cellLabel(v, i, n)); statusCell(); }
  // 今いるセルを動かす。表を作り直さないので、打ち込みの途中でフォーカスが外れない
  function setCursor(v, i, focus) {
    const old = cellAt(cur.voice, cur.step), voiceChanged = v !== cur.voice;
    if (old) { old.classList.remove('cur'); old.tabIndex = -1; old.setAttribute('aria-selected', 'false'); }
    cur = { voice: v, step: i };
    const td = cellAt(v, i);
    if (td) { td.classList.add('cur'); td.tabIndex = 0; td.setAttribute('aria-selected', 'true'); }
    if (focus || table.contains(document.activeElement)) focusCur();
    statusCell(); if (voiceChanged) drawControls();
  }
  function focusCur() {
    const td = cellAt(cur.voice, cur.step); if (!td) return;
    td.focus({ preventScroll: true });
    // 表の欄の中だけをずらして見せる（scrollIntoView は、はみ出しを隠したデスクトップまでずらすことがあるため使わない）
    const wrap = table.parentElement, r = td.getBoundingClientRect(), w = wrap.getBoundingClientRect(), head = table.querySelector('th[scope=row]')?.offsetWidth || 0;
    if (r.left < w.left + head) wrap.scrollLeft -= w.left + head - r.left;
    else if (r.right > w.right) wrap.scrollLeft += r.right - w.right;
    if (r.top < w.top) wrap.scrollTop -= w.top - r.top; else if (r.bottom > w.bottom) wrap.scrollTop += r.bottom - w.bottom;
  }
  function drawControls() {
    B('[data-bpm]').value = song.bpm; B('[data-oct]').value = octave; B('[data-vol]').value = Math.round(song.volume * 100);
    win.body.querySelectorAll('fieldset[data-voice]').forEach((fsEl) => {
      const p = song.voices[+fsEl.dataset.voice];
      fsEl.querySelectorAll('[data-wave]').forEach((c) => { c.checked = !!(p.wave & +c.dataset.wave); });
      fsEl.querySelectorAll('[data-flag]').forEach((c) => { c.checked = !!p[c.dataset.flag]; });
      for (const [k, , , from, fmt] of KNOBS) { fsEl.querySelector(`[data-knob="${k}"]`).value = from(p[k]); fsEl.querySelector(`[data-out="${k}"]`).textContent = fmt(p[k]); }
      fsEl.querySelector('legend').textContent = `声部 ${+fsEl.dataset.voice + 1}${+fsEl.dataset.voice === cur.voice ? ' ◀' : ''}`;
    });
    win.body.querySelectorAll('[data-fmode]').forEach((c) => { c.checked = !!song.filter[c.dataset.fmode]; });
    B('[data-cut]').value = CUT.from(song.filter.cutoff); B('[data-cutout]').textContent = Math.round(song.filter.cutoff) + 'Hz';
    B('[data-res]').value = Math.round(song.filter.res * 100);
    B('[data-pat]').innerHTML = Object.keys(song.patterns).sort().map((k) => `<option${k === pat ? ' selected' : ''}>${k}</option>`).join('');
    B('[data-order]').value = song.order.join(' ');
    B('[data-rec]').checked = rec;
    win.body.querySelector('.menu-item[data-command="rec"]').classList.toggle('checked', rec);
    win.body.querySelector('.menu-item[data-command="follow"]').classList.toggle('checked', follow);
    const len = songLength(song);
    st('s3', `曲の長さ ${Math.floor(len / 60)}:${String(Math.floor(len % 60)).padStart(2, '0')}`);
  }
  function refresh() { drawTable(); drawControls(); title(); drawLCD(); }

  // 波形の表示（液晶風）。鳴っている間だけ描き直す
  let raf = 0;
  function drawLCD() {
    const r = lcd.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), W = Math.max(1, r.width), H = Math.max(1, r.height);
    if (lcd.width !== Math.round(W * dpr)) { lcd.width = Math.round(W * dpr); lcd.height = Math.round(H * dpr); }
    lx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lx.fillStyle = '#1e2a8c'; lx.fillRect(0, 0, W, H);
    lx.fillStyle = '#2c3aa8';
    for (let y = 22; y < H; y += 6) for (let x = 2; x < W; x += 6) lx.fillRect(x, y, 1, 1);
    lx.fillStyle = '#bfe3ff'; lx.font = '12px "MS Gothic", ui-monospace, monospace'; lx.textBaseline = 'top';
    const ord = pos ? `${String(pos.order + 1).padStart(2, '0')}/${String(song.order.length).padStart(2, '0')}` : `--/${String(song.order.length).padStart(2, '0')}`;
    lx.fillText(`${pos ? '▶ PLAY' : '■ STOP'}  PAT ${pos ? patAt(pos) ?? pat : pat}  ORD ${ord}  STEP ${pos ? String(pos.step + 1).padStart(2, '0') : '--'}  BPM ${song.bpm}  OCT ${octave}`, 6, 5);
    if (audioErr) { lx.fillStyle = '#ffd27f'; lx.fillText('音を鳴らせません: ' + audioErr, 6, 30); return; }
    lx.strokeStyle = '#e8f6ff'; lx.lineWidth = 1.5; lx.beginPath();
    const mid = 22 + (H - 26) / 2, amp = (H - 28) / 2;
    if (analyser) {
      analyser.getFloatTimeDomainData(wave);
      let s0 = 0; // 上がりながら 0 を横切る所から描くと、波形が止まって見える
      for (let i = 1; i < wave.length / 2; i++) if (wave[i - 1] < 0 && wave[i] >= 0) { s0 = i; break; }
      const n = wave.length / 2;
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * W, y = mid - wave[s0 + i] * amp * 1.6; i ? lx.lineTo(x, y) : lx.moveTo(x, y); }
    } else { lx.moveTo(0, mid); lx.lineTo(W, mid); }
    lx.stroke();
  }
  function animate() {
    cancelAnimationFrame(raf);
    const loop = () => { drawLCD(); if (pos || held.size || performance.now() - lastSound < 1500) raf = requestAnimationFrame(loop); else { raf = 0; drawLCD(); } };
    raf = requestAnimationFrame(loop);
  }
  new ResizeObserver(() => drawLCD()).observe(lcd);

  /* ----- 再生 ----- */
  function onPos(p) {
    const was = pos; pos = p;
    if (p && follow && !clipLoop && song.order[p.order] && song.order[p.order] !== pat) { pat = song.order[p.order]; drawTable(); drawControls(); }
    // 再生中の列だけを付け替える（表を作り直すと打ち込み中のカーソルがちらつく）
    table.querySelectorAll('td.play').forEach((td) => td.classList.remove('play'));
    if (p && patAt(p) === pat) table.querySelectorAll(`td[data-i="${p.step}"]`).forEach((td) => td.classList.add('play'));
    if (!p && was) { lastSound = performance.now(); log('synth.stopped', {}, 'ok'); }
    if (p && !raf) animate();
  }
  function play(mode) {
    if (!node) { os.msgbox({ title: 'SID 風シンセ', text: `音を鳴らせません。\n\n${audioErr}\n\nWAV の書き出しは使えます。`, icon: 'warning' }); return; }
    os.sound.unlock();
    clipLoop = mode === 'loop'; loopPat = pat;
    send({ type: 'play', song: plain(), opt: mode === 'loop' ? { loop: true, pattern: pat } : { loop: true } });
    log('synth.play', { mode, pat }, 'ok');
    animate();
  }
  function stop() { send({ type: 'stop' }); }
  function changed(what) {
    dirty = true; title();
    if (what === 'params') send({ type: 'params', song: plain() });
    else if (pos) { const s = plain(); send({ type: 'params', song: s }); send({ type: 'update', song: s }); }
  }
  function push() { undo.push(JSON.stringify({ song, pat })); if (undo.length > 100) undo.shift(); redo.length = 0; }
  // つまみ: 動かし始めの状態を覚えておき、離した時に1回分の「元に戻す」にする
  function beginEdit() { if (!pending) pending = JSON.stringify({ song, pat }); }
  function endEdit() { if (!pending) return; undo.push(pending); if (undo.length > 100) undo.shift(); redo.length = 0; pending = null; }
  function restore(s) { const d = JSON.parse(s); song = d.song; pat = song.patterns[d.pat] ? d.pat : song.order[0]; refresh(); changed('params'); changed('notes'); }
  function preview(v, n) {
    if (n == null || n < 0) return;
    send({ type: 'on', voice: v, note: n });
    setTimeout(() => { if (![...held.values()].some((h) => h.voice === v)) send({ type: 'off', voice: v }); }, 220);
    lastSound = performance.now(); if (!raf) animate();
  }

  /* ----- 保存と書き出し ----- */
  async function save() {
    if (!path) return saveAs();
    try { await fs.write(path, plain()); dirty = false; os.addRecent(path); title(); st('s1', `保存しました: ${path}`); log('synth.save', { path }, 'ok'); return true; }
    catch (e) { os.msgbox({ title: 'SID 風シンセ', text: e.message, icon: 'error' }); return false; }
  }
  async function saveAs() {
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/音楽', name: path ? basename(path) : '無題.sng', exts: ['.sng'], typeLabel: 'SID 風の曲' });
    if (!p) return false;
    path = p; win.setArgs({ path });
    return save();
  }
  async function renderWAV() {
    const sr = 44100, e = new SidEngine(sr);
    e.setParams(song); e.play(song, { loop: false });
    const n = Math.ceil((songLength(song) + 1.5) * sr), buf = new Float32Array(n);
    for (let i = 0; i < n; i += sr) {
      e.render(buf, i, Math.min(sr, n - i));
      st('s1', `WAV を作っています… ${Math.round((Math.min(n, i + sr) / n) * 100)}%`);
      await new Promise((r) => setTimeout(r)); // 画面が固まらないよう、1秒分ずつ区切る
    }
    return new Blob([encodeWAV([buf], sr)], { type: 'audio/wav' });
  }
  const base = () => (path ? stem(path) : '無題');

  /* ----- 命令 ----- */
  function setCell(v, i, n) { push(); song.patterns[pat][v][i] = n; changed('notes'); updateCell(v, i); }
  // 打ち込んだあとに次のステップへ進む（最後のステップの次は頭へ戻る）
  function move(dv, di) { setCursor((cur.voice + dv + 3) % 3, (cur.step + di + 16) % 16); }
  function nextLetter() { return [...LETTERS].find((c) => !song.patterns[c]); }
  const cmds = {
    new: () => os.launch('synth'),
    open: async () => { const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/音楽', exts: ['.sng'], typeLabel: 'SID 風の曲' }); if (p) os.openFile(p, 'synth'); },
    save, saveas: saveAs,
    wav: async () => {
      const p = await os.fileDialog({ mode: 'save', dir: '/音楽', name: base() + '.wav', exts: ['.wav'], typeLabel: 'WAV 音声' });
      if (!p) return;
      const blob = await renderWAV(); await fs.write(p, blob);
      st('s1', `書き出しました: ${p}（${fs.human(blob.size)}）`); os.sound.play('notify'); log('synth.wav', { path: p, bytes: blob.size }, 'ok');
    },
    wavpc: async () => {
      const blob = await renderWAV(), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = base() + '.wav'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      st('s1', `${base()}.wav をパソコンへ書き出しました。`); log('synth.wavpc', { bytes: blob.size }, 'ok');
    },
    close: () => win.close(),
    undo: () => { if (!undo.length) { os.sound.play('error'); return; } redo.push(JSON.stringify({ song, pat })); restore(undo.pop()); },
    redo: () => { if (!redo.length) { os.sound.play('error'); return; } undo.push(JSON.stringify({ song, pat })); restore(redo.pop()); },
    copy: () => { clip = JSON.stringify(song.patterns[pat]); st('s1', `パターン ${pat} をコピーしました。`); },
    paste: () => { if (!clip) return; push(); song.patterns[pat] = JSON.parse(clip); changed('notes'); drawTable(); st('s1', `パターン ${pat} に貼り付けました。`); },
    clear: () => { push(); song.patterns[pat] = emptyPattern(); changed('notes'); drawTable(); },
    patnew: () => { const c = nextLetter(); if (!c) return; push(); song.patterns[c] = emptyPattern(); pat = c; changed('notes'); refresh(); },
    patdup: () => { const c = nextLetter(); if (!c) return; push(); song.patterns[c] = JSON.parse(JSON.stringify(song.patterns[pat])); pat = c; changed('notes'); refresh(); },
    patdel: async () => {
      if (Object.keys(song.patterns).length < 2) { os.sound.play('error'); st('s1', 'パターンが1つしか無いので消せません。'); return; }
      const a = await os.msgbox({ title: 'パターンを消す', text: `パターン ${pat} を消して、並び順からも外しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
      push(); delete song.patterns[pat]; song.order = song.order.filter((k) => k !== pat);
      if (!song.order.length) song.order = [Object.keys(song.patterns).sort()[0]];
      pat = song.order[0]; changed('notes'); refresh();
    },
    patadd: () => { push(); song.order.push(pat); changed('notes'); drawControls(); },
    play: () => play('song'), loop: () => play('loop'), stop,
    follow: (d) => { follow = d.checked; },
    rec: (d) => { rec = d.checked; drawControls(); },
    help: () => os.msgbox({ title: 'SID 風シンセの使い方', icon: 'info', text: '・表を押してから、Z〜M（下の段）と Q〜P（上の段）の鍵盤で音を入れます。上の段は1オクターブ上です。\n・1 で音を止める印（===）、Del で空（···）にします。空は前の音を伸ばします。\n・- でオクターブを下げ、その右のキー（^ か =）で上げます。\n・Space でパターンを繰り返し再生・停止、F5 で曲を頭から再生します。\n・並び順の欄に A A B A のように書くと、その順で曲になります。無い文字のパターンは新しく作ります。\n・音色メニューで、カーソルのある声部に見本の音色を入れられます。\n・ファイル メニューの「WAV で書き出す」で、曲を音声にできます。' }),
    about: () => os.msgbox({ title: 'シンセについて', icon: 'info', text: 'Future OS SID 風シンセ 1.0\n\n80年代の家庭用パソコンの音源チップのしくみ（3つの声部・合成波形・同期・リング変調・共通のフィルター）を、AudioWorklet で計算しています。\nWAV の書き出しも同じ計算なので、聞いたとおりの音になります。' }),
  };
  win.body.addEventListener('w95:command', (e) => {
    const c = e.detail.command;
    if (c.startsWith('tr:')) transpose(+c.slice(3));
    else if (c.startsWith('pre:')) preset(c.slice(4));
    else cmds[c]?.(e.detail);
  });
  win.body.querySelector('.synth-top').addEventListener('click', (e) => { const bt = e.target.closest('button[data-command]'); if (bt) cmds[bt.dataset.command]?.(); });
  win.body.querySelector('.seq-bar').addEventListener('click', (e) => { const bt = e.target.closest('button[data-command]'); if (bt) cmds[bt.dataset.command]?.(); });
  function transpose(k) {
    push();
    const row = song.patterns[pat][cur.voice];
    song.patterns[pat][cur.voice] = row.map((n) => (typeof n === 'number' && n >= 0 ? Math.max(0, Math.min(127, n + k)) : n));
    changed('notes'); drawTable();
  }
  function preset(name) {
    push();
    song.voices[cur.voice] = name === 'init' ? { ...defaultVoice(), filter: song.voices[cur.voice].filter, mute: song.voices[cur.voice].mute } : { ...song.voices[cur.voice], ...PRESETS[name] };
    changed('params'); drawControls(); preview(cur.voice, (octave + 1) * 12);
  }

  /* ----- 音色のつまみ ----- */
  const voicesEl = B('.voices');
  voicesEl.addEventListener('pointerdown', (e) => { const f = e.target.closest('fieldset[data-voice]'); if (f && +f.dataset.voice !== cur.voice) { cur.voice = +f.dataset.voice; drawTable(); drawControls(); } });
  voicesEl.addEventListener('input', (e) => {
    const f = e.target.closest('fieldset[data-voice]'); if (!f) return;
    beginEdit();
    const v = song.voices[+f.dataset.voice], t = e.target;
    if (t.dataset.knob) { const k = KNOBS.find((q) => q[0] === t.dataset.knob); v[k[0]] = k[2](+t.value); f.querySelector(`[data-out="${k[0]}"]`).textContent = k[4](v[k[0]]); }
    changed('params');
  });
  voicesEl.addEventListener('change', (e) => {
    const f = e.target.closest('fieldset[data-voice]'); if (!f) return;
    const vi = +f.dataset.voice, v = song.voices[vi], t = e.target;
    beginEdit();
    if (t.dataset.wave) { v.wave = t.checked ? v.wave | +t.dataset.wave : v.wave & ~+t.dataset.wave; if (!v.wave) st('s1', '波形が1つも選ばれていないので、この声部は鳴りません。'); }
    if (t.dataset.flag) v[t.dataset.flag] = t.checked;
    endEdit(); changed('params');
    if (t.dataset.wave || t.dataset.flag === 'sync' || t.dataset.flag === 'ring') preview(vi, (octave + 1) * 12);
  });
  const filterRow = B('.filter-row');
  filterRow.addEventListener('input', (e) => {
    const t = e.target;
    beginEdit();
    if (t.dataset.cut != null) { song.filter.cutoff = CUT.to(+t.value); B('[data-cutout]').textContent = Math.round(song.filter.cutoff) + 'Hz'; }
    if (t.dataset.res != null) song.filter.res = +t.value / 100;
    changed('params');
  });
  filterRow.addEventListener('change', (e) => { const t = e.target; beginEdit(); if (t.dataset.fmode) song.filter[t.dataset.fmode] = t.checked; endEdit(); changed('params'); });
  B('[data-vol]').addEventListener('input', (e) => { beginEdit(); song.volume = +e.target.value / 100; changed('params'); });
  B('[data-vol]').addEventListener('change', endEdit);
  B('[data-bpm]').addEventListener('change', (e) => { const v = Math.round(+e.target.value); if (!(v >= 40 && v <= 300)) { e.target.value = song.bpm; os.sound.play('error'); st('s1', '速さは 40〜300 の数で入れてください。'); return; } push(); song.bpm = v; changed('notes'); drawControls(); });
  B('[data-oct]').addEventListener('change', (e) => { octave = Math.max(0, Math.min(8, Math.round(+e.target.value) || 0)); drawControls(); drawLCD(); });
  B('[data-pat]').addEventListener('change', (e) => { pat = e.target.value; drawTable(); drawLCD(); });
  B('[data-rec]').addEventListener('change', (e) => { rec = e.target.checked; drawControls(); });
  B('[data-order]').addEventListener('change', (e) => {
    const letters = (e.target.value.toUpperCase().match(/[A-Z]/g) || []);
    if (!letters.length) { e.target.value = song.order.join(' '); os.sound.play('error'); st('s1', '並び順には、パターンの文字を1つ以上書いてください。'); return; }
    push();
    const made = [...new Set(letters.filter((c) => !song.patterns[c]))];
    for (const c of made) song.patterns[c] = emptyPattern();
    song.order = letters; changed('notes'); drawControls();
    st('s1', made.length ? `新しいパターン ${made.join('・')} を作りました。` : `並び順: ${letters.length} 個のパターン`);
  });

  /* ----- 表の操作と鍵盤 ----- */
  table.addEventListener('pointerdown', (e) => {
    const td = e.target.closest('td[data-v]'); if (!td) return;
    e.preventDefault(); // 既定のフォーカスの移動は止めて、setCursor で今いるセルへ移す
    setCursor(+td.dataset.v, +td.dataset.i, true);
  });
  table.addEventListener('dblclick', (e) => { const td = e.target.closest('td[data-v]'); if (td) preview(+td.dataset.v, song.patterns[pat][+td.dataset.v][+td.dataset.i]); });
  table.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const k = e.key;
    if (e.ctrlKey && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); transpose((k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1)); return; }
    if (e.ctrlKey && k.toLowerCase() === 'c') { e.preventDefault(); cmds.copy(); return; }
    if (e.ctrlKey && k.toLowerCase() === 'v') { e.preventDefault(); cmds.paste(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const arrow = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[k];
    if (arrow) {
      // 表の端では回り込まず、キーも横取りしない（表の欄のスクロールなど、ブラウザの動きに任せる）
      const v = cur.voice + arrow[0], i = cur.step + arrow[1];
      if (v < 0 || v > 2 || i < 0 || i > 15) return;
      e.preventDefault(); setCursor(v, i, true);
    }
    else if (k === 'Home') { e.preventDefault(); setCursor(cur.voice, 0, true); }
    else if (k === 'End') { e.preventDefault(); setCursor(cur.voice, 15, true); }
    else if (k === 'Delete') { e.preventDefault(); setCell(cur.voice, cur.step, null); }
    else if (k === 'Backspace') { e.preventDefault(); move(0, -1); setCell(cur.voice, cur.step, null); }
    else if (e.code === 'Digit1' && rec) { e.preventDefault(); setCell(cur.voice, cur.step, -1); move(0, 1); }
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); octave = Math.max(0, octave - 1); drawControls(); drawLCD(); }
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') { e.preventDefault(); octave = Math.min(8, octave + 1); drawControls(); drawLCD(); }
    else {
      const n = keyToNote(e.code, octave);
      if (n == null) return;
      e.preventDefault();
      if (e.repeat) return;
      held.set(e.code, { voice: cur.voice });
      send({ type: 'on', voice: cur.voice, note: n }); lastSound = performance.now(); if (!raf) animate();
      if (rec) { setCell(cur.voice, cur.step, n); move(0, 1); }
      else st('s2', `声部${cur.voice + 1} ・ ${noteName(n)}`);
    }
  });
  table.addEventListener('keyup', (e) => {
    const h = held.get(e.code); if (!h) return;
    held.delete(e.code);
    if (![...held.values()].some((q) => q.voice === h.voice)) send({ type: 'off', voice: h.voice });
    lastSound = performance.now();
  });
  // 表からフォーカスが外れたら、押しっぱなしの音を止める（表を作り直す間の一瞬は外れても戻るので、少し待って確かめる）
  table.addEventListener('focusout', () => setTimeout(() => {
    if (table.contains(document.activeElement)) return;
    for (const h of held.values()) send({ type: 'off', voice: h.voice });
    held.clear();
  }));
  // 窓のどこでも効くキー（文字を入れる欄の中を除く）
  win.body.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input[type=text], input[type=number], select, textarea');
    if (e.key === 'F5') { e.preventDefault(); play('song'); }
    else if (e.key === 'F6') { e.preventDefault(); play('loop'); }
    else if (e.key === 'F8' || (e.key === 'Escape' && pos)) { e.preventDefault(); stop(); }
    else if (e.key === 'F1') { e.preventDefault(); cmds.help(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); cmds.open(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); cmds.undo(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); cmds.redo(); }
    else if (e.key === ' ' && !typing && !e.target.matches('button, input[type=checkbox]')) { e.preventDefault(); pos ? stop() : play('loop'); }
  });
  win.body.addEventListener('fos:drop-file', (e) => os.openFile(e.detail.path));

  win.cleanup = () => {
    cancelAnimationFrame(raf);
    try { send({ type: 'stop' }); node?.disconnect(); analyser?.disconnect(); out?.disconnect(); } catch { /* 片付けの失敗で止めない */ }
  };
  send({ type: 'params', song: plain() });
  refresh();
  if (audioErr) st('s1', '音を鳴らせません（' + audioErr + '）。打ち込みと WAV の書き出しは使えます。');
  setCursor(0, 0, true);
  log('synth.open', { path, audio: !audioErr }, 'ok');
  return win;
}
