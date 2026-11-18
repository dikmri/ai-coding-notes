// 動画の編集: 仮想ドライブの動画・画像・音を素材の箱に入れ、タイムライン（文字・映像 2・映像 1・音 1・音 2 の段）に並べて 1 本の動画にする。
// クリップを置く・動かす・両端をつまんで切り詰める・再生位置で分ける・消す・同じ段で並べ替える。時間の目盛り、拡大と縮小、スナップ。
// 文字（テロップ）、フェード（黒から・黒へ）とクロスフェード、クリップの音量と段の音量。プレビューは canvas に合成して再生する。
// 書き出しは canvas.captureStream と Web Audio の音を合わせて MediaRecorder で WebM に録る（実際の時間と同じだけかかる）。
// 計画は .fvid（JSON）で保存して開ける。元に戻す・やり直し。計算は core/video.mjs（テストは tests/os-video.test.mjs）。
//
// WebCodecs の VideoEncoder を使えば実際の時間より速く書き出せるが、WebM の入れ物を自分で組む処理（と音の符号化）が要るので、
// この版では MediaRecorder だけを使う。どちらも外のライブラリは使わない。
import * as V from '../core/video.mjs';
import { encodeWAV } from '../core/wav.mjs';
import { basename, dirname, extname, stem } from '../core/path.mjs';

const DIR = '/ビデオ';
const LANE_H = { text: 34, video: 46, audio: 40 };
const SNAP_PX = 10; // スナップが効く距離（画素）
const PPS_MIN = 4, PPS_MAX = 600; // 1 秒あたりの画素の範囲
const KIND_LABEL = { video: '動画', image: '画像', audio: '音', text: '文字' };
const FONT = '"BIZ UDPGothic", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", sans-serif';
const BITRATE = { '720p': 6e6, '1080p': 10e6, tall: 10e6, square: 8e6 };
const POS = [['top', '上', 0.15], ['middle', '真ん中', 0.5], ['bottom', '下', 0.85]];
// 変えたあとで、設定の欄を描き直す項目（範囲に収めた値や、ほかの欄の値も変わるもの）
const RERENDER = new Set(['start', 'dur', 'in', 'fadeIn', 'fadeOut', 'join', 'xlen', 'pos', 'x', 'y']);

const item = (cmd, label, key = '', hint = '') => `<div class="menu-item" data-command="${cmd}"${hint ? ` data-status="${hint}"` : ''}><span class="label">${label}</span>${key ? `<span class="shortcut">${key}</span>` : ''}</div>`;
const SEP = '<div class="menu-separator"></div>';
const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    ${item('new', '新しい計画(<u>N</u>)', '', '素材の箱とタイムラインを空にして始めます。')}
    ${item('open', '計画を開く(<u>O</u>)...', 'Ctrl+O', '保存した計画（.fvid）を開きます。')}
    ${SEP}
    ${item('save', '上書き保存(<u>S</u>)', 'Ctrl+S', '計画（素材の場所・クリップ・文字・設定）を .fvid に保存します。')}
    ${item('saveas', '名前を付けて保存(<u>A</u>)...')}
    ${SEP}
    ${item('add', '素材を足す(<u>M</u>)...', '', '仮想ドライブの動画・画像・音を、素材の箱に入れます。')}
    ${item('sample', '見本の素材を作る(<u>X</u>)', '', '見本の動画・画像・音を作って /ビデオ/見本 に保存し、素材の箱に入れます。')}
    ${SEP}
    ${item('export', '動画を書き出す(<u>W</u>)...', '', 'WebM の動画にして仮想ドライブへ保存します。動画の長さと同じだけ時間がかかります。')}
    ${item('exportpc', 'パソコンへ書き出す(<u>E</u>)', '', 'WebM の動画をパソコンに保存します。')}
    ${SEP}
    ${item('close', '閉じる(<u>C</u>)')}
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    ${item('undo', '元に戻す(<u>U</u>)', 'Ctrl+Z')}
    ${item('redo', 'やり直し(<u>R</u>)', 'Ctrl+Y')}
    ${SEP}
    ${item('split', '分ける(<u>S</u>)', 'S', '選んだクリップ（選んでいなければ再生位置にかかる全部）を再生位置で 2 つにします。')}
    ${item('delete', '消す(<u>D</u>)', 'Delete')}
    ${SEP}
    ${item('earlier', '前へ(<u>B</u>)', 'Alt+←', '同じ段の前のクリップと順番を入れ替えます。')}
    ${item('later', '後ろへ(<u>N</u>)', 'Alt+→', '同じ段の後ろのクリップと順番を入れ替えます。')}
    ${SEP}
    ${item('text', '文字を足す(<u>T</u>)', 'T', '再生位置に文字（テロップ）を 3 秒足します。')}
  </div></div>
  <div class="menu-title">クリップ(<u>C</u>)<div class="menu" role="menu">
    ${item('fadein', '始めをフェード（黒から）(<u>I</u>)', '', '選んだクリップの始めの 1 秒を、黒（音は無音）から出します。')}
    ${item('fadeout', '終わりをフェード（黒へ）(<u>O</u>)', '', '選んだクリップの終わりの 1 秒を、黒（音は無音）へ消します。')}
    ${item('nofade', 'フェードを外す(<u>R</u>)')}
    ${SEP}
    ${item('cross', '前のクリップとクロスフェード(<u>X</u>)', '', '同じ段の前のクリップに 0.5 秒重ね、重なった所で混ぜます。')}
    ${item('cut', 'つなぎ目をカットにする(<u>C</u>)')}
  </div></div>
  <div class="menu-title">再生(<u>P</u>)<div class="menu" role="menu">
    ${item('toggle', '再生・停止(<u>P</u>)', 'Space')}
    ${item('home', '先頭へ(<u>H</u>)', 'Home')}
    ${item('end', '最後へ(<u>E</u>)', 'End')}
    ${SEP}
    ${item('prevf', '前のコマ(<u>B</u>)', '←')}
    ${item('nextf', '次のコマ(<u>N</u>)', '→')}
    ${item('back1', '1 秒戻る(<u>J</u>)', 'Shift+←')}
    ${item('fwd1', '1 秒進む(<u>K</u>)', 'Shift+→')}
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    ${item('zoomin', '拡大(<u>I</u>)', '+')}
    ${item('zoomout', '縮小(<u>O</u>)', '-')}
    ${item('fit', '全体を見る(<u>F</u>)', '0')}
    ${SEP}
    <div class="menu-item checked" data-toggle="check" data-command="snap"><span class="label">スナップ(<u>S</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    ${item('help', '使い方(<u>G</u>)')}
    ${item('about', '動画の編集について(<u>A</u>)')}
  </div></div>
</div>`;
// 道具の帯: [動作, 文字, 説明]。Alt の文字は、メニューの題（F・E・C・P・V・H）と重ならないものを選ぶ
const TOOLS = [
  ['素材', [['add', '素材を足す(<u>A</u>)...', '仮想ドライブの動画・画像・音を素材の箱に入れます'], ['sample', '見本の素材(<u>M</u>)', '見本の動画・画像・音を作って素材の箱に入れます'], ['text', '文字を足す(<u>T</u>)', '再生位置に文字（テロップ）を足します（T）']]],
  ['編集', [['split', '分ける(<u>K</u>)', '再生位置で 2 つに分けます（S）'], ['delete', '消す(<u>D</u>)', '選んだクリップを消します（Delete）'], ['earlier', '前へ(<u>B</u>)', '同じ段の前のクリップと入れ替えます（Alt+←）'], ['later', '後ろへ(<u>N</u>)', '同じ段の後ろのクリップと入れ替えます（Alt+→）']]],
  ['元に戻す', [['undo', '元に戻す(<u>U</u>)', 'Ctrl+Z'], ['redo', 'やり直し(<u>R</u>)', 'Ctrl+Y']]],
  ['表示', [['zoomin', '拡大(<u>I</u>)', 'タイムラインを拡大します（+、Ctrl+ホイール）'], ['zoomout', '縮小(<u>O</u>)', 'タイムラインを縮小します（-）'], ['fit', '全体(<u>Z</u>)', '全体を見ます（0）'], ['snap', 'スナップ(<u>G</u>)', 'ほかのクリップの端と再生位置へ吸い付かせます']]],
  ['書き出し', [['export', '書き出す(<u>W</u>)...', 'WebM の動画にして /ビデオ へ保存します']]],
];

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  let proj = V.newProject(), path = null, dirty = false, sel = null, binSel = null;
  let t = 0, playing = false, raf = 0, t0 = 0, w0 = 0, pps = 60, snap = true, lastMsg = '';
  let exporting = null, lastExport = null, editBase = null, drag = null, bdrag = null, busy = false, closed = false;
  const hist = new V.History(200);
  const res = new Map(); // 素材の id → { path, url, img, thumb, duration, w, h, missing, ready }
  const players = new Map(); // クリップの id → { el, media, node, gain, track }
  let ac = null, master = null, monitor = null;
  const trackGains = new Map();

  const win = wm.open({
    app: 'video', icon: 'icons/video.svg', className: 'app-video', title: '動画の編集', w: 1160, h: 740, ...rect, args: args.path ? { path: args.path } : {},
    render(w) {
      const toolBtn = ([a, label, tip]) => `<button type="button" class="flat vd-btn${a === 'export' ? ' vd-primary' : ''}" data-a="${a}" title="${tip}"${a === 'snap' ? ' aria-pressed="true"' : ''}>${label}</button>`;
      w.body.innerHTML = MENU + `<div class="vd-main">
        <div class="vd-tools" role="toolbar" aria-label="動画の編集の操作" focusgroup="toolbar wrap">
          ${TOOLS.map(([g, list], gi) => `${gi ? '<span class="vd-sep" role="separator" aria-orientation="vertical"></span>' : ''}<div class="vd-group" role="group" aria-label="${g}" data-group="${gi}">${list.map(toolBtn).join('')}</div>`).join('')}
        </div>
        <div class="vd-top">
          <section class="vd-bin" aria-labelledby="vdBinT-${w.id}" data-binbox>
            <h2 class="vd-panel-title" id="vdBinT-${w.id}">素材の箱</h2>
            <ul class="vd-bin-list" role="listbox" aria-labelledby="vdBinT-${w.id}" tabindex="0" data-bin></ul>
            <div class="vd-bin-btns"><button type="button" class="flat vd-btn" data-a="place" title="選んだ素材を、種類に合う段の終わりへ置きます（Enter、ダブルクリック）">置く(<u>X</u>)</button><button type="button" class="flat vd-btn" data-a="unbin" title="選んだ素材を箱から外します（ファイルは消えません）">外す(<u>S</u>)</button></div>
          </section>
          <section class="vd-stage" aria-label="プレビュー">
            <div class="vd-out" data-outbar>
              <label for="vdSize-${w.id}">出力:</label><select id="vdSize-${w.id}" data-size>${V.SIZES.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
              <label for="vdFps-${w.id}">コマの速さ:</label><select id="vdFps-${w.id}" data-fps>${V.FPS.map((f) => `<option value="${f}">${f} コマ/秒</option>`).join('')}</select>
            </div>
            <div class="vd-screen" data-screen>
              <canvas class="vd-canvas" data-canvas role="img" aria-label="プレビュー（再生位置の画面）"></canvas>
              <div class="vd-guide" data-guide>
                <p class="vd-guide-title">動画を作る 3 つの手順</p>
                <ol>
                  <li data-step="1">「素材を足す」で動画・画像・音を素材の箱に入れます。試すときは「見本の素材を作る」を押します。</li>
                  <li data-step="2">素材を下のタイムラインへドラッグします。ダブルクリックや「置く」でも置けます。</li>
                  <li data-step="3">Space で再生して確かめ、「書き出す」で WebM の動画にします。</li>
                </ol>
                <div class="vd-guide-btns"><button type="button" class="vd-guide-main" data-a="add">素材を足す(<u>A</u>)...</button><button type="button" data-a="sample">見本の素材を作る(<u>M</u>)</button></div>
              </div>
              <div class="vd-export" data-export hidden>
                <label class="vd-export-text" for="vdProg-${w.id}" data-exptext>書き出しています</label>
                <progress id="vdProg-${w.id}" max="1" value="0" data-prog></progress>
                <button type="button" class="flat vd-btn" data-a="export">やめる(<u>W</u>)</button>
              </div>
            </div>
            <div class="vd-transport" role="toolbar" aria-label="再生の操作" focusgroup="toolbar wrap" data-transport>
              <button type="button" class="flat vd-btn" data-a="home" title="先頭へ（Home）">先頭へ(<u>Q</u>)</button>
              <button type="button" class="flat vd-btn" data-a="prevf" title="前のコマ（←）">前のコマ(<u>J</u>)</button>
              <button type="button" class="flat vd-btn vd-play" data-a="toggle" title="再生・停止（Space）">再生(<u>L</u>)</button>
              <button type="button" class="flat vd-btn" data-a="nextf" title="次のコマ（→）">次のコマ(<u>Y</u>)</button>
              <span class="vd-time" role="timer" data-time aria-label="再生位置">0:00.00</span>
            </div>
          </section>
          <section class="vd-insp" aria-label="選んだものの設定" data-insp></section>
        </div>
        <div class="vd-tl" data-tl>
          <div class="vd-corner" aria-hidden="true">段</div>
          <canvas class="vd-ruler" data-ruler role="img" aria-label="時間の目盛り。押すと再生位置が動きます"></canvas>
          <div class="vd-heads" data-heads></div>
          <div class="vd-scroll" data-scroll><div class="vd-lanes" data-lanes tabindex="-1" role="group" aria-label="タイムライン"></div></div>
        </div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field vd-stpos" data-stpos></div><div class="status-field vd-stout" data-stout></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      if (exporting) {
        const a = await os.msgbox({ title: '動画の編集', text: '動画を書き出しています。\n\n書き出しをやめて閉じますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
        if (a !== 'はい') return false;
        cancelExport();
      }
      return confirmDiscard('閉じる前に');
    },
  });
  const q = (s) => win.body.querySelector(s);
  const cv = q('[data-canvas]'), ctx = cv.getContext('2d'), binEl = q('[data-bin]'), insp = q('[data-insp]'), heads = q('[data-heads]');
  const scroll = q('[data-scroll]'), lanes = q('[data-lanes]'), ruler = q('[data-ruler]'), rctx = ruler.getContext('2d'), tools = q('.vd-tools');
  const fps = () => proj.settings.fps;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  // 状態の帯の文。同じ文が続いても読み上げられるよう、末尾に空白を足して変える
  function say(text) { let m = text; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; }
  const setTitle = () => win.setTitle(`${dirty ? '*' : ''}${path ? basename(path) : '無題の動画'} - 動画の編集`);
  const setDirty = (v) => { dirty = v; setTitle(); };
  const isMissing = (c) => !!(c.media && res.get(c.media)?.missing);

  /* ---------- 素材（読み込み・長さ・見本の絵） ---------- */
  const once = (el, ok, ms = 8000) => new Promise((resolve, reject) => {
    const tm = setTimeout(() => { done(); reject(new Error('時間内に読めませんでした')); }, ms);
    const on = () => { done(); resolve(); }, err = () => { done(); reject(new Error(el.error?.message || '読めない形式です')); };
    const done = () => { clearTimeout(tm); el.removeEventListener(ok, on); el.removeEventListener('error', err); };
    el.addEventListener(ok, on); el.addEventListener('error', err);
  });
  function thumbOf(src, w, h) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 54;
    const g = c.getContext('2d'); g.fillStyle = '#140c24'; g.fillRect(0, 0, 96, 54);
    const f = V.fitRect(w || 96, h || 54, 96, 54); g.drawImage(src, f.x, f.y, f.w, f.h);
    return c.toDataURL('image/jpeg', 0.8);
  }
  function waveThumb(pk) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 54;
    const g = c.getContext('2d'); g.fillStyle = '#fff6e3'; g.fillRect(0, 0, 96, 54); g.fillStyle = '#241734';
    pk.forEach((v, i) => { const h = Math.max(1, v * 46); g.fillRect(4 + i * (88 / pk.length), 27 - h / 2, Math.max(1, 88 / pk.length - 0.5), h); });
    return c.toDataURL('image/png');
  }
  async function probe(r, m, blob) {
    if (m.kind === 'image') {
      const img = new Image(); img.src = r.url; await img.decode();
      r.img = img; r.w = img.naturalWidth || 640; r.h = img.naturalHeight || 360; r.thumb = thumbOf(img, r.w, r.h);
    } else if (m.kind === 'video') {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = r.url;
      await once(v, 'loadedmetadata');
      // MediaRecorder で録った WebM は長さが書かれていないことがある。いちばん後ろへ動かすと分かる
      if (!Number.isFinite(v.duration)) { const d = once(v, 'durationchange', 5000).catch(() => {}); v.currentTime = 1e7; await d; }
      r.duration = Number.isFinite(v.duration) ? v.duration : null; r.w = v.videoWidth; r.h = v.videoHeight;
      const s = once(v, 'seeked', 5000); v.currentTime = Math.min(0.5, (r.duration || 1) / 3); await s;
      r.thumb = thumbOf(v, r.w, r.h);
      v.removeAttribute('src'); v.load();
    } else {
      const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
      r.duration = buf.duration; r.thumb = waveThumb(V.peaks(buf.getChannelData(0), 40));
    }
  }
  // 素材を読む（仮想ドライブから）。見つからない・読めないときは missing にする
  function loadRes(m) {
    const old = res.get(m.id);
    if (old && old.path === m.path) return old;
    const r = { path: m.path, url: null, img: null, thumb: '', duration: m.duration, w: m.w || 0, h: m.h || 0, missing: false, reason: '' };
    res.set(m.id, r);
    r.ready = (async () => {
      let blob;
      try { blob = await fs.readBlob(m.path); } catch (e) { r.missing = true; r.reason = '見つかりません'; log('video.media', { path: m.path }, 'error: ' + e.message); return r; }
      r.url = URL.createObjectURL(blob);
      try { await probe(r, m, blob); log('video.media', { path: m.path, kind: m.kind, duration: r.duration, w: r.w, h: r.h }, 'ok'); }
      catch (e) { r.missing = true; r.reason = '読めません'; log('video.media', { path: m.path, kind: m.kind }, 'error: ' + e.message); }
      return r;
    })();
    return r;
  }
  function dropAll() {
    for (const id of [...players.keys()]) dropPlayer(id);
    for (const r of res.values()) if (r.url) URL.revokeObjectURL(r.url);
    res.clear();
  }
  // 仮想ドライブのファイルを素材の箱に入れる（まとめて 1 回の操作にする）。入れた素材の id を返す
  async function addMediaPaths(paths, { place = false } = {}) {
    const q2 = structuredClone(proj), added = [], bad = [];
    for (const p of paths) {
      const kind = V.mediaKind(p);
      if (!kind) { bad.push(`${basename(p)}（動画・画像・音ではありません）`); continue; }
      const had = q2.media.find((m) => m.path === p);
      if (had) { added.push(had.id); continue; }
      const m = { id: V.nextId(q2, 'm'), path: p, kind, name: basename(p), duration: null };
      const r = await loadRes(m).ready;
      if (r.missing) { res.delete(m.id); bad.push(`${basename(p)}（${r.reason}）`); continue; }
      if (kind !== 'image') m.duration = r.duration;
      if (r.w && r.h) { m.w = r.w; m.h = r.h; }
      q2.media.push(m); added.push(m.id);
    }
    if (bad.length) { sound.play('error'); os.msgbox({ title: '動画の編集', text: `次のファイルは素材にできませんでした。\n\n${bad.join('\n')}`, icon: 'warning' }); }
    if (q2.media.length !== proj.media.length) {
      let next = q2, placed = null;
      if (place && added.length) for (const id of added) { const r = V.placeMedia(next, id); if (r) { next = r.project; placed = r.id; } }
      binSel = added.at(-1) || binSel;
      commit(next, 'add', { count: added.length });
      if (placed) select(placed);
      say(`素材の箱に ${added.length} 個入れました。タイムラインへドラッグするか、ダブルクリックで置いてください。`);
    } else if (added.length) { binSel = added.at(-1); renderBin(); say('その素材は、もう箱に入っています。'); }
    return added;
  }

  /* ---------- 見本の素材（自分で描いた動き・絵・音） ---------- */
  function drawSampleFrame(g, s, total) {
    const W = g.canvas.width, H = g.canvas.height, k = s / total;
    const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
    sky.addColorStop(0, '#2b1055'); sky.addColorStop(0.55, '#ff8ec7'); sky.addColorStop(1, '#ffd37a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.62);
    // 太陽: 少しずつ昇る。下の方に横の切れ目
    const sy = H * 0.5 - k * H * 0.12, sr = H * 0.2;
    g.save(); g.beginPath(); g.arc(W * 0.5, sy, sr, 0, Math.PI * 2); g.clip();
    const sun = g.createLinearGradient(0, sy - sr, 0, sy + sr); sun.addColorStop(0, '#fff7c2'); sun.addColorStop(1, '#ff5c97');
    g.fillStyle = sun; g.fillRect(W * 0.5 - sr, sy - sr, sr * 2, sr * 2);
    g.fillStyle = '#ff8ec7'; for (let i = 0; i < 5; i++) g.fillRect(W * 0.5 - sr, sy + sr * (0.15 + i * 0.18), sr * 2, 2 + i * 1.5);
    g.restore();
    // 海の床: 手前へ流れる格子
    const top = H * 0.62; g.fillStyle = '#140c24'; g.fillRect(0, top, W, H - top);
    g.strokeStyle = '#6bf2e3'; g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { const z = (i + (s * 1.6) % 1) / 9, y = top + (H - top) * z * z; g.globalAlpha = 0.25 + z * 0.75; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.globalAlpha = 1;
    for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(W / 2 + i * 14, top); g.lineTo(W / 2 + i * 90, H); g.stroke(); }
    // 回る八角形の水晶
    const cx = W * 0.2 + k * W * 0.6, cy = H * 0.3 + Math.sin(s * 3) * 12, r = H * 0.09, rot = s * 1.8;
    g.save(); g.translate(cx, cy); g.rotate(rot); g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 1.3); }
    g.closePath(); g.fillStyle = 'rgba(207, 174, 255, 0.85)'; g.fill(); g.strokeStyle = '#241734'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.moveTo(0, -r * 1.3); g.lineTo(0, r * 1.3); g.moveTo(-r, 0); g.lineTo(r, 0); g.lineWidth = 1.5; g.stroke(); g.restore();
    // 時刻（分けた所が分かるように）
    g.font = `700 ${Math.round(H * 0.09)}px ui-monospace, monospace`; g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.lineWidth = 5; g.strokeStyle = '#241734'; g.strokeText(s.toFixed(2), W - 14, H - 10); g.fillStyle = '#fff6e3'; g.fillText(s.toFixed(2), W - 14, H - 10);
    g.font = `700 ${Math.round(H * 0.05)}px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.strokeText('見本の動画', 14, 12); g.fillText('見本の動画', 14, 12);
  }
  function sampleImage() {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 1280, 720); bg.addColorStop(0, '#cfaeff'); bg.addColorStop(1, '#6bf2e3');
    g.fillStyle = bg; g.fillRect(0, 0, 1280, 720);
    g.fillStyle = '#fff6e3'; g.fillRect(0, 520, 1280, 200);
    g.strokeStyle = '#cbbce0'; g.lineWidth = 2;
    for (let x = 0; x <= 1280; x += 80) { g.beginPath(); g.moveTo(x, 520); g.lineTo(640 + (x - 640) * 2.2, 720); g.stroke(); }
    g.beginPath(); g.arc(640, 300, 150, 0, Math.PI * 2); g.fillStyle = '#ffd37a'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#241734'; g.stroke();
    // 2 本の柱と、その上に渡した梁（門）
    for (const x of [300, 900]) { g.fillStyle = '#f4eef8'; g.fillRect(x, 170, 80, 350); g.strokeRect(x, 170, 80, 350); for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + i * 20, 180); g.lineTo(x + i * 20, 510); g.lineWidth = 2; g.stroke(); g.lineWidth = 6; } }
    g.fillStyle = '#ff8ec7'; g.fillRect(270, 130, 740, 50); g.strokeRect(270, 130, 740, 50);
    g.font = `700 72px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#241734'; g.strokeText('見本の画像', 640, 620); g.fillStyle = '#fff'; g.fillText('見本の画像', 640, 620);
    return c;
  }
  function sampleWav() {
    const rate = 44100, sec = 6, n = rate * sec, d = new Float32Array(n);
    const chords = [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63]];
    for (let i = 0; i < n; i++) {
      const s = i / rate, ci = Math.min(2, Math.floor(s / 2)), local = s - ci * 2;
      const env = Math.min(1, local / 0.05) * Math.exp(-local * 1.2);
      let v = 0; for (const f of chords[ci]) v += Math.sin(2 * Math.PI * f * s) + 0.3 * Math.sin(4 * Math.PI * f * s);
      d[i] = (v / 4) * env * 0.6;
    }
    return new Blob([encodeWAV([d], rate)], { type: 'audio/wav' });
  }
  async function recordSample(sec) {
    ensureAudio();
    if (ac.state === 'suspended') await ac.resume();
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d'); drawSampleFrame(g, 0, sec);
    const vs = c.captureStream(30), dest = ac.createMediaStreamDestination();
    // 音: やわらかい分散和音（三角波）を、録る間だけ鳴らす
    const start = ac.currentTime + 0.05, notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 587.33, 698.46];
    notes.forEach((f, i) => {
      const o = ac.createOscillator(), e = ac.createGain(), at = start + i * (sec / notes.length);
      o.type = 'triangle'; o.frequency.value = f; e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(0.18, at + 0.02); e.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
      o.connect(e).connect(dest); o.start(at); o.stop(at + 0.5);
    });
    const mime = V.pickMime((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error('このブラウザでは、動画を録れません（MediaRecorder の WebM が使えません）。');
    const rec = new MediaRecorder(new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]), { mimeType: mime, videoBitsPerSecond: 2e6 });
    const chunks = [], stopped = new Promise((r) => { rec.onstop = r; });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.start(250);
    const t1 = performance.now();
    await new Promise((done) => {
      const step = () => {
        const s = Math.min(sec, (performance.now() - t1) / 1000);
        drawSampleFrame(g, s, sec); say(`見本の動画を録っています… ${s.toFixed(1)} / ${sec} 秒`);
        if (s >= sec || closed) { done(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    rec.stop(); await stopped; vs.getTracks().forEach((x) => x.stop());
    const raw = new Uint8Array(await new Blob(chunks).arrayBuffer());
    return new Blob([V.fixWebmDuration(raw, sec * 1000)], { type: 'video/webm' });
  }
  async function makeSamples() {
    if (busy || exporting) return;
    busy = true; updateButtons();
    const dir = DIR + '/見本', saved = [];
    try {
      await fs.mkdir(dir);
      const put = async (name, blob, type) => { const p = dir + '/' + (await fs.freeName(dir, name)); await fs.write(p, blob, type); saved.push(p); return p; };
      say('見本の画像を描いています…');
      await put('見本の画像.png', await new Promise((r) => sampleImage().toBlob(r, 'image/png')), 'image/png');
      say('見本の音を作っています…');
      await put('見本の音.wav', sampleWav(), 'audio/wav');
      await put('見本の動画.webm', await recordSample(4), 'video/webm');
      log('video.sample', { paths: saved }, 'ok');
      busy = false;
      await addMediaPaths([saved[2], saved[0], saved[1]]);
      say('見本の動画・画像・音を素材の箱に入れました。タイムラインへドラッグするか、ダブルクリックで置いてください。');
    } catch (e) {
      log('video.sample', { paths: saved }, 'error: ' + e.message);
      if (!closed) os.msgbox({ title: '動画の編集', text: `見本の素材を作れませんでした。\n\n${e.message}`, icon: 'error' });
    } finally { busy = false; updateButtons(); }
  }

  /* ---------- 音の通り道: クリップ → クリップの音量 → 段の音量 → 全体 → (聞く音量 → スピーカー) と (書き出し) ---------- */
  function ensureAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
    ac = new AudioContext();
    master = ac.createGain(); monitor = ac.createGain();
    master.connect(monitor).connect(ac.destination);
    applyVolume();
    for (const pl of players.values()) connectPlayer(pl);
    log('video.audio', { rate: ac.sampleRate }, 'ok');
  }
  // 聞く音量: OS の音量と消音に従う。書き出す間は鳴らさない
  function applyVolume() { if (!monitor) return; const s = os.getSettings(); monitor.gain.value = exporting || s.mute ? 0 : s.volume; }
  const onSettings = () => applyVolume();
  os.events.addEventListener('settings', onSettings);
  function trackGain(id) {
    let g = trackGains.get(id);
    if (!g) { g = ac.createGain(); g.connect(master); trackGains.set(id, g); }
    return g;
  }
  function applyTrackGains() { if (!ac) return; for (const tr of proj.tracks) if (tr.kind !== 'text') trackGain(tr.id).gain.value = tr.mute ? 0 : tr.volume; }
  function connectPlayer(pl) {
    if (!ac || pl.node) return;
    pl.node = ac.createMediaElementSource(pl.el); pl.gain = ac.createGain(); pl.gain.gain.value = 0;
    pl.node.connect(pl.gain);
  }
  const onFrame = () => { if (!playing) requestDraw(); };
  // クリップごとに 1 つの video / audio 要素を持つ（同じ素材を 2 つのクリップで同時に使えるように）
  function player(id) {
    const c = V.clipOf(proj, id);
    if (!c?.media) return null;
    const m = V.mediaOf(proj, c.media), r = res.get(m?.id);
    if (!m || !r || r.missing || !r.url) return null;
    let pl = players.get(id);
    if (pl && pl.media === m.id && pl.url === r.url) return pl;
    if (pl) dropPlayer(id);
    const el = document.createElement(m.kind === 'audio' ? 'audio' : 'video');
    el.preload = 'auto'; el.playsInline = true; el.src = r.url;
    el.addEventListener('seeked', onFrame); el.addEventListener('loadeddata', onFrame);
    pl = { el, media: m.id, url: r.url, node: null, gain: null, track: null };
    players.set(id, pl); connectPlayer(pl);
    return pl;
  }
  function dropPlayer(id) {
    const pl = players.get(id); if (!pl) return;
    pl.el.pause(); pl.el.removeAttribute('src'); pl.el.load();
    try { pl.node?.disconnect(); pl.gain?.disconnect(); } catch { /* つないでいない */ }
    players.delete(id);
  }
  // 時刻 tm に合わせて、要素の位置・再生・音量をそろえる。run が true なら鳴らす
  function sync(tm, run) {
    const a = V.activeAt(proj, tm), want = new Map();
    for (const it of a.video) if (V.clipKind(proj, it.clip) === 'video' && !isMissing(it.clip)) want.set(it.clip.id, { src: it.src, gain: 0, vis: it.alpha > 0 });
    for (const it of a.audio) if (!isMissing(it.clip)) { const w = want.get(it.clip.id) || { src: it.src, gain: 0, vis: false }; w.gain = it.gain; want.set(it.clip.id, w); }
    applyTrackGains();
    for (const [id, w] of want) {
      const pl = player(id); if (!pl) continue;
      const c = V.clipOf(proj, id);
      if (pl.gain) { pl.gain.gain.value = w.gain; if (pl.track !== c.track) { pl.gain.disconnect(); pl.gain.connect(trackGain(c.track)); pl.track = c.track; } }
      if (!w.vis && w.gain <= 0) { if (!pl.el.paused) pl.el.pause(); continue; }
      const drift = Math.abs(pl.el.currentTime - w.src);
      if (run) {
        if (pl.el.paused) { if (drift > 0.04) pl.el.currentTime = w.src; pl.el.play().catch((e) => log('video.play', { clip: id }, 'error: ' + e.message)); }
        else if (drift > 0.3) pl.el.currentTime = w.src;
      } else {
        if (!pl.el.paused) pl.el.pause();
        if (drift > 0.5 / fps()) pl.el.currentTime = w.src;
      }
    }
    for (const [id, pl] of players) {
      if (want.has(id)) continue;
      if (!V.clipOf(proj, id)) { dropPlayer(id); continue; }
      if (!pl.el.paused) pl.el.pause();
      if (pl.gain) pl.gain.gain.value = 0;
    }
    // もうすぐ始まるクリップは、先に始まりの位置へ動かしておく
    for (const c of V.upcoming(proj, tm, 0.8)) {
      if (isMissing(c)) continue;
      const pl = player(c.id);
      if (pl && pl.el.paused && Math.abs(pl.el.currentTime - (c.in || 0)) > 0.04) pl.el.currentTime = c.in || 0;
    }
  }

  /* ---------- プレビュー（canvas に合成） ---------- */
  function drawMissing(m, alpha, W, H) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#2d1b46'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255, 92, 151, 0.45)'; ctx.lineWidth = H / 40;
    for (let x = -H; x < W; x += H / 6) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(H / 16)}px ${FONT}`; ctx.fillText('素材が見つかりません', W / 2, H / 2 - H / 20);
    ctx.font = `${Math.round(H / 24)}px ${FONT}`; ctx.fillText(m?.name || '', W / 2, H / 2 + H / 20);
    ctx.restore();
  }
  function drawText(c, alpha, W, H) {
    const b = V.textBox(c, W, H);
    if (!b.px || alpha <= 0 || !c.text) return;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.font = `700 ${b.px}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const y0 = b.y - ((b.lines.length - 1) * b.lineH) / 2;
    b.lines.forEach((ln, i) => {
      const y = y0 + i * b.lineH;
      if (c.outline) { ctx.lineWidth = Math.max(2, b.px * 0.16); ctx.strokeStyle = '#241734'; ctx.strokeText(ln, b.x, y); }
      ctx.fillStyle = c.color; ctx.fillText(ln, b.x, y);
    });
    ctx.restore();
  }
  function draw() {
    const { w: W, h: H } = V.sizeOf(proj.settings.size);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const a = V.activeAt(proj, t);
    for (const it of a.video) {
      if (it.alpha <= 0) continue;
      const m = V.mediaOf(proj, it.clip.media), r = res.get(m?.id);
      if (!r || r.missing) { drawMissing(m, it.alpha, W, H); continue; }
      let src = null, sw = 0, sh = 0;
      if (m.kind === 'image') { src = r.img; sw = r.w; sh = r.h; }
      else { const pl = players.get(it.clip.id); if (pl && pl.el.readyState >= 2) { src = pl.el; sw = pl.el.videoWidth; sh = pl.el.videoHeight; } }
      if (!src || !sw || !sh) continue;
      const f = V.fitRect(sw, sh, W, H);
      ctx.globalAlpha = it.alpha; ctx.drawImage(src, f.x, f.y, f.w, f.h);
    }
    ctx.globalAlpha = 1;
    for (const it of a.text) drawText(it.clip, it.alpha, W, H);
  }
  let drawQueued = false;
  function requestDraw() {
    if (playing || drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; if (!playing && !closed) { sync(t, false); draw(); } });
  }

  /* ---------- 再生 ---------- */
  function setTime(x, { follow = false } = {}) {
    t = clamp(V.quantize(x, fps()), 0, V.duration(proj));
    if (playing) { t0 = t; w0 = performance.now(); sync(t, true); }
    placePlayhead(follow); requestDraw(); updateButtons();
  }
  function play() {
    const dur = V.duration(proj);
    if (!dur) { sound.play('error'); say('タイムラインにクリップがありません。素材をタイムラインへ置いてください。'); return false; }
    ensureAudio();
    if (t >= dur - 1e-3) t = 0;
    playing = true; t0 = t; w0 = performance.now();
    sync(t, true); updateButtons(); loop();
    log('video.play', { t, dur }, 'ok');
    if (!exporting) say('再生しています。Space で止まります。');
    return true;
  }
  function stop(quiet) {
    if (!playing) return;
    playing = false; cancelAnimationFrame(raf); raf = 0;
    t = clamp(V.quantize(t, fps()), 0, V.duration(proj));
    for (const pl of players.values()) pl.el.pause();
    updateButtons(); placePlayhead(); requestDraw();
    log('video.stop', { t }, 'ok');
    if (!quiet) say('止めました。');
  }
  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (!playing) return;
      const dur = V.duration(proj);
      t = t0 + (performance.now() - w0) / 1000;
      if (t >= dur) {
        t = dur; draw(); placePlayhead(true);
        if (exporting) { exporting.end(); return; }
        stop(true); say('最後まで再生しました。'); return;
      }
      sync(t, true); draw(); placePlayhead(true);
      if (exporting) exporting.progress(t, dur);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  const toggle = () => (playing ? stop() : play());

  /* ---------- 書き出し（WebM） ---------- */
  function setInert(on) {
    for (const el of [q('.menu-bar'), q('[data-binbox]'), q('[data-outbar]'), q('[data-transport]'), insp, q('[data-tl]'), q('[data-guide]'), ...tools.querySelectorAll('.vd-group:not([data-group="4"])')]) el.inert = on;
  }
  // 録り始める前に、先頭で映る要素の位置合わせが終わるのを待つ（最大 3 秒）
  async function prepare() {
    sync(0, false);
    const until = performance.now() + 3000;
    while (performance.now() < until) {
      const a = V.activeAt(proj, 0), ids = [...a.video, ...a.audio].map((x) => x.clip.id);
      if (ids.every((id) => { const pl = players.get(id); return !pl || (pl.el.readyState >= 2 && !pl.el.seeking); })) break;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  async function exportVideo(target = 'drive') {
    if (exporting) { cancelExport(); return; }
    if (busy) return;
    const dur = V.duration(proj);
    if (!dur) { sound.play('error'); say('書き出すクリップがありません。素材をタイムラインへ置いてください。'); return; }
    const mime = typeof MediaRecorder !== 'undefined' && cv.captureStream ? V.pickMime((m) => MediaRecorder.isTypeSupported(m)) : '';
    if (!mime) { os.msgbox({ title: '動画の編集', text: 'このブラウザでは、動画を書き出せません（MediaRecorder の WebM が使えません）。', icon: 'error' }); log('video.export', {}, 'error: no MediaRecorder'); return; }
    const missingN = proj.clips.filter(isMissing).length;
    if (missingN) {
      const a = await os.msgbox({ title: '動画の編集', text: `素材が見つからないクリップが ${missingN} 個あります。その所は「素材が見つかりません」の絵になります。\n\nこのまま書き出しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
    }
    const base = path ? stem(path) : '動画';
    let out = null;
    if (target === 'drive') {
      if (!(await fs.exists(DIR))) await fs.mkdir(DIR);
      out = await os.fileDialog({ mode: 'save', dir: DIR, name: base + '.webm', exts: ['.webm'], typeLabel: 'WebM 動画' });
      if (!out) return;
    }
    stop(true); ensureAudio();
    if (ac.state === 'suspended') await ac.resume();
    const key = V.serialize(proj), { w: W, h: H } = V.sizeOf(proj.settings.size);
    const panel = q('[data-export]'), prog = q('[data-prog]'), text = q('[data-exptext]');
    exporting = { canceled: false };
    // Esc でやめる（入力の行き先が窓の外にあっても効くように、ページ全体で受ける。箱が開いているときは箱に任せる）
    const onEsc = (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { e.preventDefault(); cancelExport(); } };
    document.addEventListener('keydown', onEsc);
    applyVolume(); setInert(true); panel.hidden = false; q('[data-guide]').hidden = true; updateButtons();
    panel.querySelector('button').focus({ preventScroll: true });
    prog.max = dur; prog.value = 0; text.textContent = '書き出す準備をしています…';
    say('書き出しています。動画の長さと同じだけ時間がかかります。Esc でやめられます。');
    log('video.export.start', { target, path: out, dur, w: W, h: H, fps: fps(), mime }, 'ok');
    let vs = null, dest = null;
    try {
      t = 0; placePlayhead();
      await prepare(); draw();
      vs = cv.captureStream(fps()); dest = ac.createMediaStreamDestination(); master.connect(dest);
      const rec = new MediaRecorder(new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]), { mimeType: mime, videoBitsPerSecond: BITRATE[proj.settings.size] || 6e6, audioBitsPerSecond: 160000 });
      const chunks = [], stopped = new Promise((r) => { rec.onstop = r; });
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const finished = new Promise((resolve) => {
        exporting.end = () => resolve('end');
        exporting.cancel = () => resolve('cancel');
        exporting.progress = (tm, d) => { prog.value = tm; text.textContent = `書き出しています ${V.fmtTime(tm)} / ${V.fmtTime(d)}（このタブを表示したままにしてください）`; };
      });
      rec.start(500);
      const started = performance.now();
      if (exporting.canceled) exporting.cancel(); else play();
      const how = await finished;
      const ms = performance.now() - started;
      if (playing) stop(true);
      if (rec.state !== 'inactive') rec.stop();
      await stopped;
      if (how === 'cancel') { say('書き出しをやめました。'); log('video.export.cancel', { at: t }, 'ok'); return; }
      text.textContent = '仕上げています…';
      const raw = new Uint8Array(await new Blob(chunks).arrayBuffer());
      const blob = new Blob([V.fixWebmDuration(raw, dur * 1000)], { type: 'video/webm' });
      const name = (out ? basename(out) : base + '.webm');
      lastExport = { key, blob, name, path: out, size: blob.size, ms: Math.round(ms), dur };
      if (target === 'drive') {
        await fs.write(out, blob, 'video/webm');
        os.addRecent(out);
        say(`「${basename(out)}」に書き出しました（${fs.human(blob.size)}）。`);
        log('video.export.done', { path: out, size: blob.size, ms: Math.round(ms), dur }, 'ok');
        os.notify?.({ title: '動画を書き出しました', text: basename(out), actionLabel: 'パソコンへ書き出す', onAction: () => download(lastExport) });
      } else {
        download(lastExport);
        log('video.export.done', { target: 'pc', size: blob.size, ms: Math.round(ms), dur }, 'ok');
      }
    } catch (e) {
      say('書き出せませんでした。'); log('video.export', { target }, 'error: ' + e.message);
      os.msgbox({ title: '動画の編集', text: `書き出せませんでした。\n\n${e.message}`, icon: 'error' });
    } finally {
      document.removeEventListener('keydown', onEsc);
      try { if (dest) master.disconnect(dest); } catch { /* つないでいない */ }
      vs?.getTracks().forEach((x) => x.stop());
      exporting = null; applyVolume(); setInert(false); panel.hidden = true; updateGuide(); updateButtons(); requestDraw();
    }
  }
  function cancelExport() {
    if (!exporting) return;
    exporting.canceled = true;
    if (playing) stop(true);
    exporting.cancel?.();
  }
  function download(x) {
    if (!x) return;
    const a = document.createElement('a'), url = URL.createObjectURL(x.blob);
    a.href = url; a.download = x.name; win.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    say(`「${x.name}」をパソコンへ書き出しました（ブラウザのダウンロードの場所）。`);
    log('video.download', { name: x.name, size: x.blob.size }, 'ok');
  }
  // パソコンへ書き出す: 最後に書き出した動画が今の計画と同じなら、それをそのまま渡す。違えば書き出してから渡す
  function exportPC() {
    if (lastExport && lastExport.key === V.serialize(proj)) download(lastExport);
    else exportVideo('pc');
  }

  /* ---------- 計画の変更・元に戻す ---------- */
  function commit(next, op, info = {}) {
    hist.push(V.serialize(proj));
    proj = next; setDirty(true);
    if (sel && !V.clipOf(proj, sel)) sel = null;
    refresh();
    log('video.' + op, info, 'ok');
  }
  function afterHistory(msg) {
    editBase = null;
    if (sel && !V.clipOf(proj, sel)) sel = null;
    if (binSel && !V.mediaOf(proj, binSel)) binSel = null;
    for (const m of proj.media) if (!res.has(m.id)) loadRes(m).ready.then(() => { if (!closed) refresh(); });
    setDirty(true); refresh(); sound.play('op'); say(msg);
  }
  function undo() {
    const s = hist.undo(V.serialize(proj));
    if (!s) { sound.play('error'); say('元に戻せる操作がありません。'); return; }
    proj = JSON.parse(s); afterHistory('元に戻しました。'); log('video.undo', { left: hist.undoCount }, 'ok');
  }
  function redo() {
    const s = hist.redo(V.serialize(proj));
    if (!s) { sound.play('error'); say('やり直せる操作がありません。'); return; }
    proj = JSON.parse(s); afterHistory('やり直しました。'); log('video.redo', { left: hist.redoCount }, 'ok');
  }
  // 入力欄で変えている間は計画を直接変え、変え終わったとき（change）に 1 回だけ元に戻す記録を積む
  function beginEdit() { if (editBase === null) editBase = V.serialize(proj); }
  function finishEdit(what, info) {
    if (editBase !== null && V.serialize(proj) !== editBase) { hist.push(editBase); setDirty(true); log('video.' + what, info, 'ok'); }
    editBase = null;
    updateButtons();
  }
  function selected() { return sel ? V.clipOf(proj, sel) : null; }
  function split() {
    const c = selected();
    const list = c && c.start < t && t < V.clipEnd(c) ? [c] : proj.clips.filter((x) => x.start < t && t < V.clipEnd(x));
    let next = proj, n = 0, last = null;
    for (const x of list) { const id = V.nextId(next); const r = V.splitClip(next, x.id, t, id); if (r) { next = r; n++; last = id; } }
    if (!n) { sound.play('error'); say('再生位置にかかるクリップがありません。クリップの途中に再生位置を置いてから分けてください。'); return; }
    commit(next, 'split', { t, count: n }); if (last) select(last);
    sound.play('select'); say(`${V.fmtTime(t)} で ${n} 個のクリップを分けました。`);
  }
  function del() {
    const c = selected();
    if (!c) { sound.play('error'); say('消すクリップを、タイムラインで押して選んでください。'); return; }
    commit(V.removeClip(proj, c.id), 'delete', { id: c.id }); sound.play('trash'); say('クリップを消しました。');
  }
  function reorder(dir) {
    const c = selected();
    if (!c) { sound.play('error'); say('並べ替えるクリップを選んでください。'); return; }
    const r = V.reorderClip(proj, c.id, dir);
    if (!r) { sound.play('error'); say(dir < 0 ? 'このクリップより前には、同じ段のクリップがありません。' : 'このクリップより後ろには、同じ段のクリップがありません。'); return; }
    commit(r, 'reorder', { id: c.id, dir }); sound.play('select');
    const n = V.clipOf(proj, c.id);
    say(`クリップを${dir < 0 ? '前' : '後ろ'}のクリップと入れ替えました（${V.fmtTime(n.start)} から）。`);
    clipEl(c.id)?.focus({ preventScroll: true });
  }
  function addText() {
    const r = V.addText(proj, t, '文字を入れてください');
    commit(r.project, 'text', { t }); select(r.id); sound.play('select');
    say('文字を足しました。右の「文字」の欄で書き換えてください。');
    const ta = insp.querySelector('[data-f="text"]'); if (ta) { ta.focus(); ta.select(); }
  }
  function setFade(which) {
    const c = selected();
    if (!c) { sound.play('error'); say('フェードを付けるクリップを選んでください。'); return; }
    const q2 = structuredClone(proj), x = V.clipOf(q2, c.id), d = Math.min(1, x.dur / 2);
    if (which === 'in') x.fadeIn = d; else if (which === 'out') x.fadeOut = d; else { x.fadeIn = 0; x.fadeOut = 0; }
    commit(q2, 'fade', { id: c.id, which, d });
    say(which === 'none' ? 'フェードを外しました。' : `${which === 'in' ? '始め' : '終わり'}に ${d} 秒のフェードを付けました。`);
  }
  function setJoin(kind, len = 0.5) {
    const c = selected();
    if (!c) { sound.play('error'); say('つなぎ目を変えるクリップを選んでください。'); return false; }
    if (kind === 'cut') { const q2 = structuredClone(proj); V.clipOf(q2, c.id).join = 'cut'; commit(q2, 'join', { id: c.id, kind }); say('つなぎ目をカットにしました。'); return true; }
    const r = V.crossfadeWithPrev(proj, c.id, len);
    if (!r) { sound.play('error'); say('同じ段で前にクリップが無いので、クロスフェードにできません。'); return false; }
    commit(r, 'join', { id: c.id, kind, len }); say(`前のクリップと ${len} 秒重ねて、クロスフェードにしました。`);
    return true;
  }
  function placeSel() {
    if (!binSel) { sound.play('error'); say('素材の箱で、置く素材を選んでください。'); return; }
    const r = V.placeMedia(proj, binSel);
    if (!r) { sound.play('error'); return; }
    commit(r.project, 'place', { media: binSel, id: r.id }); select(r.id);
    const c = V.clipOf(proj, r.id), tr = V.trackOf(proj, c.track);
    sound.play('drop'); say(`「${V.mediaOf(proj, binSel).name}」を${tr.name}の ${V.fmtTime(c.start)} に置きました。`);
    reveal(c.start);
  }
  async function unbin() {
    const m = binSel && V.mediaOf(proj, binSel);
    if (!m) { sound.play('error'); say('素材の箱で、外す素材を選んでください。'); return; }
    const used = proj.clips.filter((c) => c.media === m.id);
    if (used.length) {
      const a = await os.msgbox({ title: '動画の編集', text: `「${m.name}」はタイムラインで ${used.length} 個のクリップに使われています。\n\nクリップもいっしょに消して、箱から外しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
    }
    const q2 = structuredClone(proj);
    q2.media = q2.media.filter((x) => x.id !== m.id); q2.clips = q2.clips.filter((c) => c.media !== m.id);
    binSel = null; commit(q2, 'unbin', { media: m.id, clips: used.length }); sound.play('trash');
    say(`「${m.name}」を素材の箱から外しました（ファイルは仮想ドライブに残っています）。`);
  }

  /* ---------- 表示: 素材の箱 ---------- */
  function renderBin() {
    binEl.innerHTML = proj.media.length ? proj.media.map((m) => {
      const r = res.get(m.id), miss = r?.missing;
      return `<li class="vd-bin-item${miss ? ' missing' : ''}" role="option" id="vdm-${win.id}-${m.id}" aria-selected="${m.id === binSel}" data-mid="${m.id}" title="${esc(m.path)}">
        <span class="vd-thumb" data-kind="${m.kind}">${r?.thumb ? `<img src="${r.thumb}" alt="">` : ''}</span>
        <span class="vd-bin-text"><span class="vd-bin-name">${esc(m.name)}</span><span class="vd-bin-meta">${KIND_LABEL[m.kind]} ・ ${miss ? r.reason : m.kind === 'image' ? '長さは自由' : V.fmtTime(m.duration || 0)}</span></span></li>`;
    }).join('') : '<li class="vd-bin-empty">素材はまだありません。「素材を足す」で入れるか、ここへファイルを落としてください。</li>';
    binEl.setAttribute('aria-activedescendant', binSel && V.mediaOf(proj, binSel) ? `vdm-${win.id}-${binSel}` : '');
  }
  function selectBin(id) {
    binSel = id;
    binEl.querySelectorAll('.vd-bin-item').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.mid === id)));
    binEl.setAttribute('aria-activedescendant', id ? `vdm-${win.id}-${id}` : '');
    updateButtons();
  }

  /* ---------- 表示: タイムライン ---------- */
  const clipEl = (id) => lanes.querySelector(`.vd-clip[data-id="${CSS.escape(id)}"]`);
  const timeAtX = (clientX) => (clientX - lanes.getBoundingClientRect().left) / pps;
  function overlapWithPrev(c) {
    const prev = proj.clips.filter((x) => x.track === c.track && x.id !== c.id && x.start < c.start && V.clipEnd(x) > c.start).sort((a, b) => V.clipEnd(b) - V.clipEnd(a))[0];
    return prev ? Math.min(V.clipEnd(prev), V.clipEnd(c)) - c.start : 0;
  }
  function clipHTML(c) {
    const k = V.clipKind(proj, c) || 'video', m = c.media ? V.mediaOf(proj, c.media) : null, r = m && res.get(m.id), miss = r?.missing;
    const name = k === 'text' ? (String(c.text).split('\n')[0] || '（空の文字）') : (m?.name || '?');
    const xf = c.join === 'cross' ? overlapWithPrev(c) : 0;
    const label = `${KIND_LABEL[k]}「${name}」 ${V.fmtTime(c.start)} から 長さ ${V.fmtTime(c.dur)}${miss ? '（素材が見つかりません）' : ''}`;
    return `<div class="vd-clip${miss ? ' missing' : ''}" role="option" tabindex="0" aria-selected="${c.id === sel}" data-id="${c.id}" data-kind="${k}" style="left:${(c.start * pps).toFixed(1)}px;width:${Math.max(6, c.dur * pps).toFixed(1)}px" aria-label="${esc(label)}" title="${esc(label)}">`
      + (xf > 0 ? `<i class="vd-xf" style="width:${(xf * pps).toFixed(1)}px"></i>` : '')
      + (c.fadeIn > 0 ? `<i class="vd-fade" data-side="in" style="width:${(c.fadeIn * pps).toFixed(1)}px"></i>` : '')
      + (c.fadeOut > 0 ? `<i class="vd-fade" data-side="out" style="width:${(c.fadeOut * pps).toFixed(1)}px"></i>` : '')
      + (r?.thumb && k !== 'audio' && c.dur * pps > 60 ? `<img class="vd-clip-thumb" src="${r.thumb}" alt="">` : '')
      + `<span class="vd-clip-label">${miss ? '見つかりません: ' : ''}${esc(name)}</span><span class="vd-grip" data-edge="start" aria-hidden="true"></span><span class="vd-grip" data-edge="end" aria-hidden="true"></span></div>`;
  }
  function renderHeads() {
    heads.innerHTML = proj.tracks.map((tr) => `<div class="vd-head" data-track="${tr.id}" style="--h:${LANE_H[tr.kind]}px"><span class="vd-head-name">${esc(tr.name)}</span>${tr.kind === 'text' ? '' :
      `<span class="vd-head-ctl"><input type="range" min="0" max="150" step="5" value="${Math.round(tr.volume * 100)}" data-tvol="${tr.id}" aria-label="${esc(tr.name)}の音量" aria-valuetext="${Math.round(tr.volume * 100)}%" title="${esc(tr.name)}の音量 ${Math.round(tr.volume * 100)}%"><label title="${esc(tr.name)}の音を消します"><input type="checkbox" data-tmute="${tr.id}"${tr.mute ? ' checked' : ''}>消音</label></span>`}</div>`).join('');
  }
  function renderTimeline() {
    const focused = document.activeElement?.closest?.('.vd-clip')?.dataset.id;
    const dur = V.duration(proj);
    lanes.style.width = Math.max(scroll.clientWidth, Math.ceil((dur + 10) * pps)) + 'px';
    lanes.innerHTML = proj.tracks.map((tr) => `<div class="vd-lane" role="listbox" aria-label="${esc(tr.name)}の段" data-track="${tr.id}" data-kind="${tr.kind}" style="--h:${LANE_H[tr.kind]}px">${proj.clips.filter((c) => c.track === tr.id).sort((a, b) => a.start - b.start).map(clipHTML).join('')}</div>`).join('')
      + `<div class="vd-end" style="left:${(dur * pps).toFixed(1)}px" aria-hidden="true"></div><div class="vd-snapline" data-snapline hidden></div><div class="vd-playhead" data-playhead></div>`;
    if (focused) clipEl(focused)?.focus({ preventScroll: true });
    placePlayhead();
  }
  function showSnap(at) {
    const s = lanes.querySelector('[data-snapline]');
    if (!s) return;
    s.hidden = at === null || at === undefined;
    if (!s.hidden) s.style.left = (at * pps).toFixed(1) + 'px';
  }
  function drawRuler() {
    const w = ruler.clientWidth, h = ruler.clientHeight, dpr = devicePixelRatio || 1;
    if (!w || !h) return;
    if (ruler.width !== Math.round(w * dpr) || ruler.height !== Math.round(h * dpr)) { ruler.width = Math.round(w * dpr); ruler.height = Math.round(h * dpr); }
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rctx.fillStyle = '#eae0f5'; rctx.fillRect(0, 0, w, h);
    const { major, minor } = V.rulerStep(pps), x0 = scroll.scrollLeft, a = x0 / pps, b = (x0 + w) / pps;
    rctx.strokeStyle = '#6e5d85'; rctx.fillStyle = '#241734'; rctx.font = `11px ${FONT}`; rctx.textBaseline = 'top'; rctx.lineWidth = 1;
    for (let k = Math.floor(a / minor); k * minor <= b + minor; k++) {
      const tt = k * minor, x = Math.round(tt * pps - x0) + 0.5, isMajor = Math.abs(tt / major - Math.round(tt / major)) < 1e-6;
      rctx.beginPath(); rctx.moveTo(x, h); rctx.lineTo(x, h - (isMajor ? 10 : 4)); rctx.stroke();
      if (isMajor) rctx.fillText(V.fmtTime(tt).replace(/\.00$/, ''), x + 3, 2);
    }
    // 全体の終わり と 再生位置
    const xe = V.duration(proj) * pps - x0;
    if (xe >= 0 && xe <= w) { rctx.fillStyle = '#4b5fe8'; rctx.fillRect(xe - 1, 0, 2, h); }
    const xp = t * pps - x0;
    if (xp >= -8 && xp <= w + 8) { rctx.fillStyle = '#ff5c97'; rctx.strokeStyle = '#241734'; rctx.beginPath(); rctx.moveTo(xp - 6, h - 12); rctx.lineTo(xp + 6, h - 12); rctx.lineTo(xp, h); rctx.closePath(); rctx.fill(); rctx.stroke(); }
  }
  function placePlayhead(follow) {
    const ph = lanes.querySelector('[data-playhead]');
    if (ph) ph.style.left = (t * pps).toFixed(1) + 'px';
    if (follow) { const x = t * pps, l = scroll.scrollLeft, w = scroll.clientWidth; if (x < l || x > l + w - 30) scroll.scrollLeft = Math.max(0, x - w * 0.2); }
    drawRuler();
    const dur = V.duration(proj);
    q('[data-time]').textContent = V.fmtTime(t);
    q('.status-field[data-stpos]').textContent = `位置 ${V.fmtTime(t)} / 長さ ${V.fmtTime(dur)}`;
  }
  function reveal(time) { const x = time * pps; if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 40) scroll.scrollLeft = Math.max(0, x - 60); }
  function zoom(f, anchorX) {
    const r = scroll.getBoundingClientRect(), ax = anchorX ?? (t * pps >= scroll.scrollLeft && t * pps <= scroll.scrollLeft + r.width ? r.left + t * pps - scroll.scrollLeft : r.left);
    const ta = (ax - r.left + scroll.scrollLeft) / pps;
    const np = clamp(pps * f, PPS_MIN, PPS_MAX);
    if (np === pps) { sound.play('error'); return; }
    pps = np; renderTimeline();
    scroll.scrollLeft = Math.max(0, ta * pps - (ax - r.left));
    drawRuler(); say(`タイムラインを 1 秒 ${Math.round(pps)} 画素で表示しています。`);
  }
  function fit() {
    const dur = V.duration(proj);
    pps = clamp((scroll.clientWidth - 40) / Math.max(5, dur), PPS_MIN, PPS_MAX);
    renderTimeline(); scroll.scrollLeft = 0; drawRuler();
  }
  // 画面の y の位置にある段（無ければ近い方の端の段）
  function laneAt(clientY) {
    const ls = [...lanes.querySelectorAll('.vd-lane')];
    for (const l of ls) { const r = l.getBoundingClientRect(); if (clientY >= r.top && clientY < r.bottom) return l.dataset.track; }
    if (!ls.length) return null;
    return clientY < ls[0].getBoundingClientRect().top ? ls[0].dataset.track : ls.at(-1).dataset.track;
  }

  /* ---------- 表示: 選んだものの設定 ---------- */
  const numField = (f, label, v, o = {}) => `<label class="vd-field"><span>${label}</span><input type="number" data-f="${f}" value="${+(+v).toFixed(2)}" step="${o.step ?? 0.05}" min="${o.min ?? 0}"${o.max !== undefined ? ` max="${o.max}"` : ''}><span class="vd-unit">${o.unit ?? '秒'}</span></label>`;
  const rangeField = (f, label, v, min, max, unit = '%') => `<label class="vd-field vd-wide-in"><span>${label}</span><input type="range" data-f="${f}" min="${min}" max="${max}" value="${Math.round(v)}" aria-valuetext="${Math.round(v)}${unit}"><output class="vd-unit" data-out="${f}">${Math.round(v)}${unit}</output></label>`;
  function renderInspector() {
    const c = selected();
    if (!c) {
      const dur = V.duration(proj);
      insp.innerHTML = `<h2 class="vd-panel-title">選んだものの設定</h2>
        <p class="vd-note">タイムラインのクリップを押すと、ここで長さ・音量・フェード・つなぎ目を変えられます。文字のクリップは、文字・大きさ・色・位置も変えられます。</p>
        <dl class="vd-sum"><dt>全体の長さ</dt><dd>${V.fmtTime(dur)}</dd><dt>クリップ</dt><dd>${proj.clips.length} 個</dd><dt>素材</dt><dd>${proj.media.length} 個</dd></dl>
        <p class="vd-note">クリップの両端をつまむと切り詰められます。S で再生位置で分け、Delete で消します。</p>`;
      return;
    }
    const k = V.clipKind(proj, c), m = c.media ? V.mediaOf(proj, c.media) : null, r = m && res.get(m.id);
    const silent = k === 'image', audioOnly = k === 'audio' || V.trackOf(proj, c.track)?.kind === 'audio';
    const name = k === 'text' ? '文字のクリップ' : m?.name || '';
    const fadeWord = audioOnly ? ['無音から', '無音へ'] : ['黒から', '黒へ'];
    const ov = overlapWithPrev(c);
    let html = `<h2 class="vd-panel-title"><span class="vd-insp-name" title="${esc(name)}">${esc(name)}</span><span class="vd-kind" data-kind="${k}">${KIND_LABEL[k] || ''}</span></h2>`;
    if (r?.missing) html += `<p class="vd-warn">この素材は${r.reason}（${esc(m.path)}）。同じ場所へ戻してから計画を開き直すと使えます。</p>`;
    if (k === 'text') {
      const pos = POS.find((p) => Math.abs(p[2] - c.y) < 0.01 && Math.abs(c.x - 0.5) < 0.01)?.[0] || '';
      html += `<label class="vd-field vd-wide"><span>文字</span><textarea data-f="text" rows="2" spellcheck="false">${esc(c.text)}</textarea></label>`
        + rangeField('size', '大きさ', c.size, 2, 30)
        + `<label class="vd-field vd-wide-in"><span>色</span><input type="color" data-f="color" value="${c.color}"><span class="vd-unit"></span></label>`
        + `<label class="vd-field vd-check"><input type="checkbox" data-f="outline"${c.outline ? ' checked' : ''}>縁取り（読みやすくする）</label>`
        + `<label class="vd-field vd-wide-in"><span>位置</span><select data-f="pos"><option value=""${pos ? '' : ' selected'}>自由</option>${POS.map(([v, l]) => `<option value="${v}"${pos === v ? ' selected' : ''}>${l}</option>`).join('')}</select><span class="vd-unit"></span></label>`
        + rangeField('x', '横', c.x * 100, 0, 100) + rangeField('y', '縦', c.y * 100, 0, 100);
    }
    // 段: ドラッグしなくても、受け付ける段へ移せるように
    const tracks = proj.tracks.filter((x) => V.accepts(x.kind, k));
    if (tracks.length > 1) html += `<label class="vd-field vd-wide-in"><span>段</span><select data-f="track">${tracks.map((x) => `<option value="${x.id}"${x.id === c.track ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select><span class="vd-unit"></span></label>`;
    html += numField('start', '始まり', c.start) + numField('dur', k === 'text' ? '出る時間' : '長さ', c.dur, { min: V.MIN_DUR, max: k === 'video' || k === 'audio' ? +(m.duration - (c.in || 0)).toFixed(2) : undefined });
    if ((k === 'video' || k === 'audio') && m?.duration) html += numField('in', '素材の中の始まり', c.in || 0, { max: +Math.max(0, m.duration - c.dur).toFixed(2) });
    if (k !== 'text' && !silent) html += rangeField('volume', '音量', (c.volume ?? 1) * 100, 0, 200);
    html += numField('fadeIn', `始めのフェード（${fadeWord[0]}）`, c.fadeIn, { max: +c.dur.toFixed(2) }) + numField('fadeOut', `終わりのフェード（${fadeWord[1]}）`, c.fadeOut, { max: +c.dur.toFixed(2) });
    if (k !== 'text') {
      html += `<label class="vd-field vd-wide-in"><span>つなぎ目</span><select data-f="join"><option value="cut"${c.join === 'cut' ? ' selected' : ''}>カット</option><option value="cross"${c.join === 'cross' ? ' selected' : ''}>クロスフェード</option></select><span class="vd-unit"></span></label>`;
      if (c.join === 'cross') html += numField('xlen', '重ねる長さ', ov || 0.5, { min: V.MIN_DUR });
      html += `<p class="vd-note">${c.join === 'cross' ? (ov > 0 ? `前のクリップと ${V.fmtTime(ov)} 重なっている所で、絵と音を混ぜます。` : '前のクリップと重なっていないので、混ぜる所がありません。') : '前のクリップと重なった所では、このクリップが上に出ます。クロスフェードを選ぶと、前のクリップへ重ねて混ぜます。'}</p>`;
    }
    insp.innerHTML = html;
  }
  // 入力欄の値を、選んだクリップに当てる
  function applyField(f, el) {
    const c = selected();
    if (!c) return;
    const raw = el.type === 'checkbox' ? el.checked : el.type === 'number' || el.type === 'range' ? +el.value : el.value;
    if (typeof raw === 'number' && !Number.isFinite(raw)) return;
    const m = c.media ? V.mediaOf(proj, c.media) : null;
    switch (f) {
      case 'start': proj = V.moveClip(proj, c.id, raw); break;
      case 'dur': proj = V.trimClip(proj, c.id, 'end', c.start + raw); break;
      case 'in': c.in = clamp(raw, 0, Math.max(0, (m?.duration ?? Infinity) - c.dur)); break;
      case 'volume': c.volume = clamp(raw / 100, 0, 2); break;
      case 'fadeIn': case 'fadeOut': c[f] = clamp(raw, 0, c.dur); break;
      case 'join':
        if (raw === 'cross') { const r = V.crossfadeWithPrev(proj, c.id, overlapWithPrev(c) || 0.5); if (!r) { el.value = 'cut'; sound.play('error'); say('同じ段で前にクリップが無いので、クロスフェードにできません。'); return; } proj = r; }
        else c.join = 'cut';
        break;
      case 'xlen': { const r = V.crossfadeWithPrev(proj, c.id, raw); if (r) proj = r; break; }
      case 'text': c.text = String(raw).slice(0, 500); break;
      case 'size': c.size = clamp(raw, 1, 50); break;
      case 'color': if (/^#[0-9a-f]{6}$/i.test(raw)) c.color = raw.toLowerCase(); break;
      case 'outline': c.outline = !!raw; break;
      case 'x': case 'y': c[f] = clamp(raw / 100, 0, 1); break;
      case 'pos': { const p = POS.find((x) => x[0] === raw); if (p) { c.x = 0.5; c.y = p[2]; } break; }
      case 'track': proj = V.moveClip(proj, c.id, c.start, raw); break;
      default: return;
    }
    const out = insp.querySelector(`[data-out="${f}"]`); if (out) { out.textContent = Math.round(raw) + '%'; el.setAttribute('aria-valuetext', out.textContent); }
    renderTimeline(); requestDraw();
  }

  /* ---------- 表示: まとめて ---------- */
  function updateGuide() {
    const g = q('[data-guide]');
    g.hidden = proj.clips.length > 0 || !!exporting;
    g.querySelector('[data-step="1"]').classList.toggle('done', proj.media.length > 0);
  }
  function updateButtons() {
    const c = selected(), under = proj.clips.some((x) => x.start < t && t < V.clipEnd(x)), hasClips = proj.clips.length > 0;
    const dis = { split: !under, delete: !c, earlier: !c, later: !c, undo: !hist.undoCount, redo: !hist.redoCount, place: !binSel, unbin: !binSel, sample: busy || !!exporting, add: busy, export: !exporting && (!hasClips || busy), toggle: !hasClips, home: !hasClips, prevf: !hasClips, nextf: !hasClips };
    win.body.querySelectorAll('.vd-btn[data-a]').forEach((b) => { const d = !!dis[b.dataset.a]; if (d) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); });
    const menuDis = { split: !under, delete: !c, earlier: !c, later: !c, undo: !hist.undoCount, redo: !hist.redoCount, fadein: !c, fadeout: !c, nofade: !c, cross: !c, cut: !c, export: !hasClips, exportpc: !hasClips, toggle: !hasClips };
    win.body.querySelectorAll('.menu-item[data-command]').forEach((mi) => { if (mi.dataset.command in menuDis) mi.setAttribute('aria-disabled', String(!!menuDis[mi.dataset.command])); });
    const pb = q('[data-a="toggle"]'); pb.innerHTML = playing ? '停止(<u>L</u>)' : '再生(<u>L</u>)';
    const eb = tools.querySelector('[data-a="export"]'); eb.innerHTML = exporting ? 'やめる(<u>W</u>)' : '書き出す(<u>W</u>)...'; eb.title = exporting ? '書き出しをやめます（Esc）' : 'WebM の動画にして /ビデオ へ保存します';
    q('[data-a="snap"]').setAttribute('aria-pressed', String(snap));
    win.body.querySelector('.menu-item[data-command="snap"]')?.classList.toggle('checked', snap);
    const { w, h } = V.sizeOf(proj.settings.size);
    q('.status-field[data-stout]').textContent = `${w}×${h} ・ ${fps()} コマ/秒`;
    q('[data-size]').value = proj.settings.size; q('[data-fps]').value = String(fps());
  }
  function refresh() {
    const had = win.body.contains(document.activeElement);
    renderBin(); renderHeads(); renderTimeline(); renderInspector(); updateGuide(); updateButtons(); requestDraw(); setTitle();
    // 描き直しで入力の行き先の要素が消えたら（消したクリップなど）、窓の中へ戻す。キーの操作（Ctrl+Z など）を続けられるように
    if (had && !win.body.contains(document.activeElement)) ((sel && clipEl(sel)) || lanes).focus({ preventScroll: true });
  }
  function select(id) {
    if (sel !== id) editBase = null;
    sel = id;
    lanes.querySelectorAll('.vd-clip').forEach((el) => el.setAttribute('aria-selected', String(el.dataset.id === id)));
    renderInspector(); updateButtons();
  }

  /* ---------- 計画の保存と読み込み ---------- */
  async function confirmDiscard(when) {
    if (!dirty) return true;
    const a = await os.msgbox({ title: '動画の編集', text: `${when}、計画に保存していない変更があります。\n\n保存しますか?`, icon: 'warning', buttons: [{ label: '保存する(&S)', value: 'save' }, { label: '保存しない(&N)', value: 'discard' }, { label: 'キャンセル', value: 'cancel', cancel: true }] });
    if (a === 'save') return save(false);
    return a === 'discard';
  }
  async function save(as) {
    let p = path;
    if (as || !p) {
      if (!(await fs.exists(DIR))) await fs.mkdir(DIR);
      p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : DIR, name: path ? basename(path) : '無題の動画.fvid', exts: ['.fvid'], typeLabel: '動画の編集の計画' });
      if (!p) return false;
    }
    try {
      await fs.write(p, V.serialize(proj), 'application/json');
      path = p; setDirty(false); win.setArgs({ path: p }); os.addRecent(p);
      say(`「${basename(p)}」に計画を保存しました。`); log('video.save', { path: p, clips: proj.clips.length, media: proj.media.length }, 'ok');
      return true;
    } catch (e) { os.msgbox({ title: '動画の編集', text: e.message, icon: 'error' }); log('video.save', { path: p }, 'error: ' + e.message); return false; }
  }
  async function openPlan(p, ask = true) {
    if (ask && !(await confirmDiscard('開く前に'))) return false;
    let j;
    try { j = await fs.readJSON(p); }
    catch (e) { os.msgbox({ title: '動画の編集', text: `「${basename(p)}」を読めませんでした。\n\n${e.message}`, icon: 'error' }); log('video.openplan', { path: p }, 'error: ' + e.message); return false; }
    const r = V.validateProject(j);
    if (!r.ok) { os.msgbox({ title: '動画の編集', text: `「${basename(p)}」を開けませんでした。\n\n${r.errors.join('\n')}`, icon: 'error' }); log('video.openplan', { path: p }, 'error: ' + r.errors[0]); return false; }
    stop(true); dropAll();
    proj = r.project; path = p; hist.clear(); sel = null; binSel = null; t = 0; editBase = null; lastExport = null;
    setDirty(false); win.setArgs({ path: p }); os.addRecent(p);
    say(`「${basename(p)}」を読んでいます…`);
    await Promise.all(proj.media.map((m) => loadRes(m).ready));
    // 素材の長さは、実際のファイルに合わせる（計画を変えたことにはしない）
    for (const m of proj.media) { const x = res.get(m.id); if (!x.missing && m.kind !== 'image' && x.duration) m.duration = x.duration; }
    fit(); refresh();
    const miss = proj.media.filter((m) => res.get(m.id)?.missing);
    log('video.openplan', { path: p, clips: proj.clips.length, media: proj.media.length, missing: miss.length, warnings: r.warnings.length }, 'ok');
    say(`「${basename(p)}」を開きました。${miss.length ? `見つからない素材が ${miss.length} 個あります。` : ''}`);
    if (miss.length || r.warnings.length) {
      const lines = [];
      if (miss.length) lines.push(`見つからない素材が ${miss.length} 個あります。タイムラインでは赤い斜線のクリップです。`, ...miss.slice(0, 8).map((m) => '・' + m.path), ...(miss.length > 8 ? [`ほか ${miss.length - 8} 個`] : []), '素材を同じ場所へ戻してから開き直すと、使えるようになります。');
      if (r.warnings.length) lines.push('', '読めなかった所があります。', ...r.warnings.slice(0, 6).map((w) => '・' + w));
      sound.play('notify'); os.msgbox({ title: '動画の編集', text: lines.join('\n'), icon: 'warning' });
    }
    return true;
  }
  async function newPlan() {
    if (!(await confirmDiscard('新しくする前に'))) return;
    stop(true); dropAll();
    proj = V.newProject(); path = null; hist.clear(); sel = null; binSel = null; t = 0; editBase = null; lastExport = null;
    setDirty(false); win.setArgs({ path: undefined }); pps = 60; refresh();
    say('新しい計画にしました。「素材を足す」か「見本の素材を作る」から始めます。'); log('video.new', {}, 'ok');
  }
  async function pickMedia() {
    const dir = (await fs.exists(DIR)) ? DIR : '/';
    const p = await os.fileDialog({ mode: 'open', dir, exts: V.MEDIA_EXTS, typeLabel: '動画・画像・音' });
    if (p) await addMediaPaths([p]);
  }
  async function pickPlan() {
    const dir = (await fs.exists(DIR)) ? DIR : '/';
    const p = await os.fileDialog({ mode: 'open', dir, exts: ['.fvid'], typeLabel: '動画の編集の計画' });
    if (p) await openPlan(p);
  }

  /* ---------- 命令 ---------- */
  const cmds = {
    new: newPlan, open: pickPlan, save: () => save(false), saveas: () => save(true), add: pickMedia, sample: makeSamples,
    export: () => exportVideo('drive'), exportpc: exportPC, close: () => win.close(),
    undo, redo, split, delete: del, earlier: () => reorder(-1), later: () => reorder(1), text: addText, place: placeSel, unbin,
    fadein: () => setFade('in'), fadeout: () => setFade('out'), nofade: () => setFade('none'), cross: () => setJoin('cross', 0.5), cut: () => setJoin('cut'),
    toggle, home: () => setTime(0, { follow: true }), end: () => setTime(V.duration(proj), { follow: true }),
    prevf: () => { stop(true); setTime(V.frameStep(t, fps(), -1), { follow: true }); }, nextf: () => { stop(true); setTime(V.frameStep(t, fps(), 1), { follow: true }); },
    back1: () => setTime(t - 1, { follow: true }), fwd1: () => setTime(t + 1, { follow: true }),
    zoomin: () => zoom(1.5), zoomout: () => zoom(1 / 1.5), fit,
    snap: () => { snap = !snap; updateButtons(); sound.play(snap ? 'toggleOn' : 'toggleOff'); say(snap ? 'スナップを入れました。クリップの端と再生位置へ吸い付きます。' : 'スナップを切りました。'); },
    help: () => os.msgbox({ title: '動画の編集の使い方', icon: 'info', text: '1. 「素材を足す」で動画・画像・音を素材の箱に入れます（「見本の素材」で試せます）。\n2. 素材をタイムラインの段へドラッグします。ダブルクリックや「置く」でも置けます。\n3. クリップをドラッグで動かし、両端をつまんで切り詰めます。S で再生位置で分け、Delete で消します。\n4. 「文字を足す」でテロップを入れ、右の欄で文字・大きさ・色・位置を変えます。\n5. 右の欄でフェード（黒から・黒へ）とクロスフェード、音量を決めます。\n6. Space で再生して確かめ、「書き出す」で WebM の動画にします。\n\n計画（.fvid）を保存すると、続きから直せます。' }),
    about: () => os.msgbox({ title: '動画の編集について', icon: 'info', text: 'Future OS 動画の編集 1.0\n\n素材をタイムラインに並べ、文字とつなぎ目を付けて、WebM の動画にします。\nプレビューは canvas に合成して再生し、書き出しは MediaRecorder で録ります（外のライブラリは使っていません）。' }),
  };
  function cmd(name, detail) {
    if (exporting && name !== 'export' && name !== 'close') return;
    if (busy && ['sample', 'add', 'export', 'exportpc', 'open', 'new'].includes(name)) return;
    cmds[name]?.(detail);
  }
  win.body.addEventListener('w95:command', (e) => cmd(e.detail.command, e.detail));
  win.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    cmd(b.dataset.a);
  });
  // 道具の帯と再生のボタンは、マウスで押しても入力の行き先を奪わない（押したあとの Space で同じボタンを押さないように）
  for (const bar of [tools, q('[data-transport]')]) {
    bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    // focusgroup が使えないブラウザでは、矢印キーで動く 1 つのタブ位置を自分で作る
    if (!('focusGroup' in HTMLElement.prototype)) {
      const items = [...bar.querySelectorAll('button')];
      items.forEach((b, i) => { b.tabIndex = i ? -1 : 0; });
      bar.addEventListener('focusin', ({ target }) => { if (items.includes(target)) items.forEach((b) => { b.tabIndex = b === target ? 0 : -1; }); });
      bar.addEventListener('keydown', (e) => {
        const i = items.indexOf(e.target);
        if (i < 0) return;
        const rtl = getComputedStyle(bar).direction === 'rtl', steps = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };
        let j = null;
        if (e.key in steps) j = (i + steps[e.key] + items.length) % items.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = items.length - 1;
        if (j === null) return;
        e.preventDefault(); e.stopPropagation(); items[j].focus();
      });
    }
  }
  q('[data-size]').addEventListener('change', (e) => { const q2 = structuredClone(proj); q2.settings.size = e.target.value; commit(q2, 'settings', { size: e.target.value }); say(`出力の大きさを ${V.SIZES.find((s) => s.id === e.target.value).label} にしました。`); });
  q('[data-fps]').addEventListener('change', (e) => { const q2 = structuredClone(proj); q2.settings.fps = +e.target.value; commit(q2, 'settings', { fps: +e.target.value }); say(`コマの速さを ${e.target.value} コマ/秒にしました。`); });

  /* ---------- 選んだものの設定の入力 ---------- */
  insp.addEventListener('focusin', (e) => { if (e.target.matches('[data-f]')) beginEdit(); });
  insp.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (!f || e.target.type === 'number' || e.target.tagName === 'SELECT') return;
    beginEdit(); applyField(f, e.target);
  });
  insp.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    beginEdit(); applyField(f, e.target); finishEdit('field', { f, v: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
    // 範囲に収めた値や、つられて変わる欄を見せるため、入力の欄を描き直す。
    // 描き直すのは Tab などで移った先が決まってから（そのとき入力の行き先がある欄へ戻す）
    if (RERENDER.has(f)) setTimeout(() => {
      if (closed) return;
      const now = insp.contains(document.activeElement) ? document.activeElement.dataset.f : null;
      renderInspector();
      if (now) insp.querySelector(`[data-f="${now}"]`)?.focus({ preventScroll: true });
    }, 0);
  });
  insp.addEventListener('focusout', (e) => { if (!insp.contains(e.relatedTarget)) editBase = null; });

  /* ---------- 段の音量と消音 ---------- */
  heads.addEventListener('input', (e) => {
    const id = e.target.dataset.tvol;
    if (!id) return;
    beginEdit(); const tr = V.trackOf(proj, id); tr.volume = +e.target.value / 100; e.target.title = `${tr.name}の音量 ${e.target.value}%`; e.target.setAttribute('aria-valuetext', e.target.value + '%'); applyTrackGains();
  });
  heads.addEventListener('change', (e) => {
    const vol = e.target.dataset.tvol, mute = e.target.dataset.tmute;
    if (!vol && !mute) return;
    beginEdit();
    const tr = V.trackOf(proj, vol || mute);
    if (vol) tr.volume = +e.target.value / 100; else tr.mute = e.target.checked;
    applyTrackGains(); finishEdit('track', { track: tr.id, volume: tr.volume, mute: tr.mute });
    say(mute ? `${tr.name}の音を${tr.mute ? '消しました' : '戻しました'}。` : `${tr.name}の音量を ${Math.round(tr.volume * 100)}% にしました。`);
  });

  /* ---------- タイムラインのマウス操作: 再生位置・クリップを動かす・切り詰める ----------
     ドラッグの間だけ、ページ全体（window）で pointermove・pointerup・pointercancel を受ける。
     押した 1 本のポインターだけを追う（ほかのポインターの動きは無視する） */
  function follow(e, { move, up, cancel }) {
    const id = e.pointerId;
    const mv = (ev) => { if (ev.pointerId === id) move(ev); };
    const end = (ev) => { if (ev.pointerId !== id) return; stop(); up(ev); };
    const cc = (ev) => { if (ev.pointerId !== id) return; stop(); cancel(ev); };
    const stop = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', end); removeEventListener('pointercancel', cc); };
    addEventListener('pointermove', mv); addEventListener('pointerup', end); addEventListener('pointercancel', cc);
    return stop;
  }
  function cancelDrag() {
    if (!drag) return;
    const d = drag; drag = null;
    d.stop?.();
    document.documentElement.classList.remove('vd-dragging'); showSnap(null);
    if (d.base && d.moved) { proj = d.base; refresh(); say('ドラッグをやめて、元の位置に戻しました。'); }
  }
  const rulerTime = (x) => (x - ruler.getBoundingClientRect().left + scroll.scrollLeft) / pps;
  function scrubStart(e, at) {
    drag = { kind: 'scrub' };
    drag.stop = follow(e, {
      move: (ev) => setTime(at(ev.clientX)),
      up: () => { drag = null; log('video.seek', { t }, 'ok'); say(`再生位置を ${V.fmtTime(t)} にしました。`); },
      cancel: () => { drag = null; },
    });
    setTime(at(e.clientX));
  }
  ruler.addEventListener('pointerdown', (e) => { if (e.button === 0 && !exporting && !drag) { e.preventDefault(); scrubStart(e, rulerTime); } });
  function dragMove(e) {
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.hypot(dx, e.clientY - drag.y0) < 3) return;
    drag.moved = true; document.documentElement.classList.add('vd-dragging');
    const targets = snap ? V.snapTargets(drag.base, { exclude: drag.clip, playhead: t }) : [], tol = SNAP_PX / pps;
    let to = null;
    if (drag.kind === 'move') {
      const c = V.clipOf(drag.base, drag.clip);
      // コマの区切りにそろえてから、吸い付く先を探す（吸い付いたときは、その端にぴったり合わせる）
      let s = V.quantize(Math.max(0, drag.start + dx / pps), fps());
      if (snap) { const r = V.snapMove(s, c.dur, targets, tol); s = r.start; to = r.to; }
      proj = V.moveClip(drag.base, drag.clip, s, laneAt(e.clientY));
    } else {
      let v = V.quantize((drag.edge === 'start' ? drag.start : drag.end) + dx / pps, fps());
      if (snap) { const r = V.snapValue(v, targets, tol); v = r.t; to = r.to; }
      proj = V.trimClip(drag.base, drag.clip, drag.edge, v);
    }
    renderTimeline(); showSnap(to); requestDraw();
    const c = V.clipOf(proj, drag.clip);
    say(`始まり ${V.fmtTime(c.start)} ・ 長さ ${V.fmtTime(c.dur)}${to !== null ? '（吸い付きました）' : ''}`);
  }
  function dragEnd() {
    const d = drag; drag = null;
    document.documentElement.classList.remove('vd-dragging'); showSnap(null);
    if (d.moved && V.serialize(proj) !== d.baseS) {
      hist.push(d.baseS); setDirty(true); refresh();
      const c = V.clipOf(proj, d.clip), tr = V.trackOf(proj, c.track);
      log('video.' + (d.kind === 'move' ? 'move' : 'trim'), { id: d.clip, edge: d.edge, start: c.start, dur: c.dur, track: c.track }, 'ok');
      say(d.kind === 'move' ? `クリップを${tr.name}の ${V.fmtTime(c.start)} へ動かしました。` : `クリップを ${V.fmtTime(c.start)} から長さ ${V.fmtTime(c.dur)} にしました。`);
    } else { proj = d.base; if (d.moved) refresh(); }
  }
  lanes.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || exporting || drag) return;
    const el = e.target.closest('.vd-clip');
    e.preventDefault(); // 文字の選択を始めない（入力の行き先は自分で移す）
    if (!el) { select(null); lanes.focus({ preventScroll: true }); scrubStart(e, timeAtX); return; }
    const id = el.dataset.id, edge = e.target.closest('[data-edge]')?.dataset.edge || null, c = V.clipOf(proj, id);
    select(id); el.focus({ preventScroll: true });
    drag = { kind: edge ? 'trim' : 'move', edge, clip: id, base: proj, baseS: V.serialize(proj), x0: e.clientX, y0: e.clientY, start: c.start, end: V.clipEnd(c), moved: false };
    drag.stop = follow(e, { move: dragMove, up: dragEnd, cancel: () => cancelDrag() });
  });
  lanes.addEventListener('dblclick', (e) => { const el = e.target.closest('.vd-clip'); if (el) { setTime(V.clipOf(proj, el.dataset.id).start); } });
  lanes.addEventListener('focusin', (e) => { const el = e.target.closest('.vd-clip'); if (el && el.dataset.id !== sel) select(el.dataset.id); });
  // ホイール: Ctrl で拡大・縮小、そのままなら横へ送る
  const onWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { zoom(e.deltaY < 0 ? 1.25 : 1 / 1.25, e.clientX); return; }
    scroll.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  };
  scroll.addEventListener('wheel', onWheel, { passive: false });
  ruler.addEventListener('wheel', onWheel, { passive: false });
  scroll.addEventListener('scroll', () => drawRuler());

  /* ---------- 素材の箱: 選ぶ・置く・タイムラインへドラッグ ---------- */
  // 落とせる所: タイムラインの段の上で、素材の種類を受け付ける段
  function dropTarget(mid, x, y) {
    const r = scroll.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    const m = V.mediaOf(proj, mid), tr = V.trackOf(proj, laneAt(y));
    if (!tr || !V.accepts(tr.kind, m.kind)) return { track: tr?.id || null, ok: false };
    let tm = V.quantize(Math.max(0, timeAtX(x)), fps()), to = null;
    if (snap) { const s = V.snapMove(tm, m.kind === 'image' ? V.IMAGE_DUR : m.duration || V.IMAGE_DUR, V.snapTargets(proj, { playhead: t }), SNAP_PX / pps); tm = s.start; to = s.to; }
    return { track: tr.id, ok: true, t: tm, to };
  }
  function binEnd(b, e, cancel) {
    bdrag = null;
    document.documentElement.classList.remove('vd-dragging'); b.ghost?.remove(); showSnap(null);
    lanes.querySelectorAll('.drop-ok, .drop-no').forEach((l) => l.classList.remove('drop-ok', 'drop-no'));
    if (!b.moved || cancel) return;
    const d = dropTarget(b.mid, e.clientX, e.clientY), m = V.mediaOf(proj, b.mid);
    if (!d) { say('タイムラインの段の上で離すと、そこへ置けます。'); return; }
    if (!d.ok) { sound.play('error'); say(`${KIND_LABEL[m.kind]}は、その段には置けません。${m.kind === 'audio' ? '音の段' : '映像の段'}へ置いてください。`); log('video.place', { media: b.mid, track: d.track }, 'error: 段の種類が合わない'); return; }
    const r = V.placeMedia(proj, b.mid, d.track, d.t);
    commit(r.project, 'place', { media: b.mid, track: d.track, t: d.t, id: r.id }); select(r.id); sound.play('drop');
    say(`「${m.name}」を${V.trackOf(proj, d.track).name}の ${V.fmtTime(d.t)} に置きました。`);
  }
  binEl.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.vd-bin-item');
    if (!li || e.button !== 0 || exporting || bdrag) return;
    e.preventDefault(); binEl.focus({ preventScroll: true }); // 文字の選択を始めない
    selectBin(li.dataset.mid);
    const m = V.mediaOf(proj, li.dataset.mid), r = res.get(m.id);
    if (r?.missing) return;
    const b = bdrag = { mid: m.id, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
    b.stop = follow(e, {
      move: (ev) => {
        if (!b.moved && Math.hypot(ev.clientX - b.x0, ev.clientY - b.y0) < 5) return;
        if (!b.moved) {
          b.moved = true; document.documentElement.classList.add('vd-dragging');
          b.ghost = document.createElement('div'); b.ghost.className = 'vd-ghost'; b.ghost.textContent = m.name;
          win.body.append(b.ghost);
        }
        b.ghost.style.left = ev.clientX + 'px'; b.ghost.style.top = ev.clientY + 'px';
        const d = dropTarget(b.mid, ev.clientX, ev.clientY);
        lanes.querySelectorAll('.vd-lane').forEach((l) => { l.classList.toggle('drop-ok', !!d?.ok && l.dataset.track === d.track); l.classList.toggle('drop-no', !!d && !d.ok && l.dataset.track === d.track); });
        showSnap(d?.ok ? d.to : null);
      },
      up: (ev) => binEnd(b, ev, false),
      cancel: (ev) => binEnd(b, ev, true),
    });
  });
  binEl.addEventListener('dblclick', (e) => { const li = e.target.closest('.vd-bin-item'); if (li) { selectBin(li.dataset.mid); placeSel(); } });
  binEl.addEventListener('keydown', (e) => {
    const ids = proj.media.map((m) => m.id), i = ids.indexOf(binSel);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); if (ids.length) selectBin(ids[clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, ids.length - 1)] ?? ids[0]); binEl.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); placeSel(); }
    else if (e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); unbin(); }
  });

  /* ---------- キーボード ---------- */
  win.body.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (exporting) return; // 書き出しの間の Esc は exportVideo の中で受ける
    if (drag && e.key === 'Escape') { e.preventDefault(); cancelDrag(); return; }
    if (bdrag && e.key === 'Escape') { e.preventDefault(); const b = bdrag; b.stop(); binEnd(b, e, true); say('素材を置くのをやめました。'); return; }
    const typing = !!e.target.closest('input, textarea, select, [contenteditable="true"]');
    const textish = e.target.matches('textarea, input[type="text"], input[type="number"], input:not([type]), [contenteditable="true"]');
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    const run = (name) => { e.preventDefault(); cmd(name); };
    if (ctrl && !e.altKey) {
      if (textish && ['z', 'y'].includes(k)) return; // 文字の入力欄の中の元に戻すは、入力欄に任せる
      if (k === 'z' && !e.shiftKey) run('undo');
      else if (k === 'y' || (k === 'z' && e.shiftKey)) run('redo');
      else if (k === 's') run('save');
      else if (k === 'o') run('open');
      return;
    }
    if (typing) return;
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { run(e.key === 'ArrowLeft' ? 'earlier' : 'later'); return; }
    if (e.altKey || e.metaKey) return;
    if (e.target.closest('[role="toolbar"]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    if (e.key === ' ' && !e.target.closest('button')) run('toggle');
    else if (e.key === 'Home') run('home');
    else if (e.key === 'End') run('end');
    else if (e.key === 'ArrowLeft') run(e.shiftKey ? 'back1' : 'prevf');
    else if (e.key === 'ArrowRight') run(e.shiftKey ? 'fwd1' : 'nextf');
    else if (e.key === 'Delete' || e.key === 'Backspace') run('delete');
    else if (k === 's') run('split');
    else if (k === 't') run('text');
    else if (k === '+' || k === ';' || k === '=') run('zoomin');
    else if (k === '-') run('zoomout');
    else if (k === '0') run('fit');
    else if (e.key === 'Escape') { if (playing) { e.preventDefault(); stop(); } else if (sel) { e.preventDefault(); select(null); } }
  });

  /* ---------- ファイルを落とす ---------- */
  win.body.addEventListener('dragover', (e) => {
    if (exporting || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; q('[data-binbox]').classList.add('drop-ok');
  });
  win.body.addEventListener('dragleave', (e) => { if (!win.body.contains(e.relatedTarget)) q('[data-binbox]').classList.remove('drop-ok'); });
  win.body.addEventListener('drop', async (e) => {
    q('[data-binbox]').classList.remove('drop-ok');
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length || exporting) return;
    e.preventDefault();
    if (!(await fs.exists(DIR))) await fs.mkdir(DIR);
    const paths = [];
    for (const f of files) {
      const ext = extname(f.name).toLowerCase();
      if (ext !== '.fvid' && !V.mediaKind(f.name)) { say(`「${f.name}」は動画・画像・音ではないので、入れませんでした。`); continue; }
      const p = DIR + '/' + (await fs.freeName(DIR, f.name));
      await fs.write(p, f, f.type);
      if (ext === '.fvid') { await openPlan(p); return; }
      paths.push(p);
    }
    log('video.import', { count: paths.length }, 'ok');
    if (paths.length) await addMediaPaths(paths);
  });
  // デスクトップや ファイル マネージャ から、仮想ドライブのファイルを落としたとき
  win.body.addEventListener('fos:drop-file', (e) => {
    const p = e.detail.path;
    if (extname(p).toLowerCase() === '.fvid') openPlan(p);
    else if (V.mediaKind(p)) addMediaPaths([p]);
    else os.openFile(p);
  });
  // 窓の中の、入力を受けない所（プレビューなど）を押したら、キーボードの操作（Space など）をこの窓で受ける
  win.body.addEventListener('pointerdown', (e) => {
    const f = e.target.closest('input, textarea, select, button, a, [tabindex]');
    if (!f || f === win.body) win.body.focus({ preventScroll: true });
  });

  /* ---------- 片付けと始まり ---------- */
  const ro = new ResizeObserver(() => { renderTimeline(); });
  ro.observe(scroll);
  win.cleanup = () => {
    closed = true;
    if (exporting) cancelExport();
    stop(true); cancelAnimationFrame(raf); ro.disconnect();
    os.events.removeEventListener('settings', onSettings);
    dropAll();
    if (ac) { ac.close().catch(() => {}); ac = null; }
    log('video.close', { path }, 'ok');
  };
  win.body.tabIndex = -1;
  // 確かめの道具（tools/video-check.mjs）が中の状態を読むための窓口
  win.video = {
    state: () => ({ clips: proj.clips.map((c) => ({ ...c })), media: proj.media.map((m) => ({ ...m, missing: !!res.get(m.id)?.missing })), tracks: proj.tracks.map((x) => ({ ...x })), settings: { ...proj.settings },
      sel, binSel, t, playing, exporting: !!exporting, busy, pps, snap, dirty, path, undo: hist.undoCount, redo: hist.redoCount, duration: V.duration(proj), lastExport: lastExport && { name: lastExport.name, path: lastExport.path, size: lastExport.size, ms: lastExport.ms, dur: lastExport.dur } }),
    project: () => JSON.parse(V.serialize(proj)),
    setTime: (x) => setTime(x),
    select: (id) => select(id),
    xOf: (time) => lanes.getBoundingClientRect().left + time * pps,
    laneY: (trackId) => { const r = lanes.querySelector(`.vd-lane[data-track="${trackId}"]`)?.getBoundingClientRect(); return r ? r.top + r.height / 2 : null; },
    pixel: (x, y) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data),
    ready: () => Promise.all([...res.values()].map((r) => r.ready)),
  };
  refresh(); placePlayhead();
  win.body.focus({ preventScroll: true });
  say('「素材を足す」か「見本の素材を作る」から始めます。素材をタイムラインへドラッグすると、動画になります。');
  log('video.launch', { path: args.path || null }, 'ok');
  if (args.path) {
    if (extname(args.path).toLowerCase() === '.fvid') await openPlan(args.path, false);
    else await addMediaPaths([args.path]);
  }
  return win;
}
