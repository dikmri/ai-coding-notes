// 多重録音スタジオ: 音の段（トラック）を重ねて、録音・配置・ミックスする。
// 段: 足す・消す・名前・色、音量・左右（パン）・消音・単独・録音の待機。マスターの音量と音の大きさの表示。
// クリップ: 仮想ドライブの音を置く（「音を読み込む」とドロップ）、動かす・両端で切り詰める・再生位置で分ける・消す・コピーと貼り付け、
//   クリップごとの音量とフェード、波形。後に置いたクリップが上になり、下のクリップは隠れた所が鳴らない。
// 録音: 録音待機の段へ、ほかの段を鳴らしながらマイクから録る。録った音は /音楽/多重録音/ に WAV で残す。マイクの遅れの補正（ms）。
// 時間: テンポと拍子、小節と拍か秒の目盛り、メトロノームと録音の前のカウント、ループ、スナップ、拡大縮小とスクロール。
// ミックスダウン: 再生と同じ組み立て（daw-engine.mjs）を OfflineAudioContext で動かして WAV にする（仮想ドライブとパソコンへ）。
// 計画は .fdaw（JSON）。見つからない音は印を付けて知らせる。元に戻す・やり直し。計算は core/daw.mjs。
import * as D from '../core/daw.mjs';
import { errorText, levelKind } from '../core/recorder.mjs';
import { encodeWAV } from '../core/wav.mjs';
import { basename, dirname, stem, extname } from '../core/path.mjs';
import { createEngine, renderMix } from './daw-engine.mjs';

const TITLE = '多重録音スタジオ';
const ROW = 80; // 段の高さ（px）
const RULER_H = 34, LOOP_Y = 21; // 目盛りの高さと、その下のループの帯の始まり
const EDGE_PX = 7; // クリップの端をつかめる幅
const PEAK_BLOCK = 256; // 波形の区切り（標本）
const MIX_RATE = 44100;
const DIR = '/音楽/多重録音';
const AUDIO_EXTS = ['.wav', '.mp3', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.flac', '.weba'];
const SIGS = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 8], [7, 8], [12, 8]];
const SNAPS = [['0', 'なし'], ['bar', '小節'], ['1', '拍'], ['0.5', '半拍'], ['0.25', '4 分の 1 拍']];

const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="new"><span class="label">新規(<u>N</u>)</span></div>
    <div class="menu-item" data-command="open"><span class="label">開く(<u>O</u>)...</span><span class="shortcut">Ctrl+O</span></div>
    <div class="menu-item" data-command="save"><span class="label">上書き保存(<u>S</u>)</span><span class="shortcut">Ctrl+S</span></div>
    <div class="menu-item" data-command="saveas"><span class="label">名前を付けて保存(<u>A</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="import" data-status="仮想ドライブの音（WAV・MP3 など）を、選んだ段の再生位置に置きます。"><span class="label">音を読み込む(<u>I</u>)...</span><span class="shortcut">Ctrl+I</span></div>
    <div class="menu-item" data-command="demo" data-status="ドラム・ベース・和音の 3 つの音を作り、段に並べた計画にします。"><span class="label">見本の曲を作る(<u>D</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="mixdown" data-status="全部の段を 1 つの WAV にまとめて、仮想ドライブへ保存します。"><span class="label">ミックスダウン（WAV で保存）(<u>W</u>)...</span></div>
    <div class="menu-item" data-command="mixpc" data-status="全部の段を 1 つの WAV にまとめて、パソコンへ保存します。"><span class="label">パソコンへ書き出す(<u>X</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>C</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="undo"><span class="label">元に戻す(<u>U</u>)</span><span class="shortcut">Ctrl+Z</span></div>
    <div class="menu-item" data-command="redo"><span class="label">やり直し(<u>R</u>)</span><span class="shortcut">Ctrl+Y</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="copy"><span class="label">クリップをコピー(<u>C</u>)</span><span class="shortcut">Ctrl+C</span></div>
    <div class="menu-item" data-command="paste" data-status="コピーしたクリップを、選んだ段の再生位置に置きます。"><span class="label">貼り付け(<u>P</u>)</span><span class="shortcut">Ctrl+V</span></div>
    <div class="menu-item" data-command="split" data-status="選んだクリップ（無ければ選んだ段で再生位置にあるクリップ）を、再生位置で 2 つに分けます。"><span class="label">再生位置で分ける(<u>S</u>)</span><span class="shortcut">S</span></div>
    <div class="menu-item" data-command="delete"><span class="label">クリップを消す(<u>D</u>)</span><span class="shortcut">Del</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="clipprops"><span class="label">クリップの音量とフェード(<u>F</u>)...</span><span class="shortcut">Enter</span></div>
    <div class="menu-item" data-command="relink" data-status="選んだクリップの音を、仮想ドライブの別の音に差し替えます。見つからない音を指定し直すときに使います。"><span class="label">音を差し替える(<u>L</u>)...</span></div>
  </div></div>
  <div class="menu-title">段(<u>T</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="addtrack"><span class="label">段を足す(<u>A</u>)</span></div>
    <div class="menu-item" data-command="rename"><span class="label">名前を変える(<u>N</u>)</span><span class="shortcut">F2</span></div>
    <div class="menu-item" data-command="trackcolor"><span class="label">色を変える(<u>C</u>)...</span></div>
    <div class="menu-item" data-command="deltrack"><span class="label">段を消す(<u>D</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="arm" data-status="選んだ段を録音の待機にします。録音は待機の段に入ります（待機は 1 つの段だけ）。"><span class="label">録音の待機(<u>R</u>)</span></div>
  </div></div>
  <div class="menu-title">再生(<u>P</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="play"><span class="label">再生・停止(<u>P</u>)</span><span class="shortcut">Space</span></div>
    <div class="menu-item" data-command="home"><span class="label">先頭へ(<u>H</u>)</span><span class="shortcut">Home</span></div>
    <div class="menu-item" data-command="rec"><span class="label">録音(<u>R</u>)</span><span class="shortcut">R</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="loop"><span class="label">ループ（入・切）(<u>L</u>)</span><span class="shortcut">L</span></div>
    <div class="menu-item" data-command="loopclip" data-status="ループの範囲を、選んだクリップの始めから終わりにします。"><span class="label">ループを選んだクリップに合わせる(<u>K</u>)</span></div>
    <div class="menu-item" data-command="metro"><span class="label">メトロノーム（入・切）(<u>M</u>)</span><span class="shortcut">M</span></div>
    <div class="menu-item" data-command="snap"><span class="label">スナップ（入・切）(<u>G</u>)</span><span class="shortcut">G</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="recset" data-status="マイクの機器と、マイクの遅れの補正（ミリ秒）を決めます。"><span class="label">録音の設定(<u>I</u>)...</span></div>
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="zoomin"><span class="label">拡大(<u>I</u>)</span><span class="shortcut">+</span></div>
    <div class="menu-item" data-command="zoomout"><span class="label">縮小(<u>O</u>)</span><span class="shortcut">-</span></div>
    <div class="menu-item" data-command="fit"><span class="label">全体を見る(<u>F</u>)</span><span class="shortcut">F</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="ruler:bars" data-radio="ruler"><span class="label">小節と拍の目盛り(<u>B</u>)</span></div>
    <div class="menu-item" data-command="ruler:time" data-radio="ruler"><span class="label">秒の目盛り(<u>T</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="guide"><span class="label">はじめの案内を出す(<u>G</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="help"><span class="label">使い方(<u>H</u>)</span><span class="shortcut">F1</span></div>
    <div class="menu-item" data-command="about"><span class="label">多重録音スタジオについて(<u>A</u>)</span></div>
  </div></div>
</div>`;

const HELP = `・段（トラック）は、横に時間が流れる 1 本の帯です。左の欄で、名前・色・音量・左右・消音・単独・録音待機を決めます。
・「音を読み込む」（Ctrl+I）で、仮想ドライブの音を、選んだ段の再生位置に置きます。デスクトップのアイコンやパソコンのファイルを窓へドロップしても置けます。
・クリップは、つかんで横に動かすと時間が、縦に動かすと段が変わります。左右の端をつかむと切り詰め、上の角をつかむとフェード（だんだん大きく・小さく）です。
・ダブルクリックか Enter で、クリップの音量とフェードを数で決められます。
・S で再生位置で分け、Del で消し、Ctrl+C と Ctrl+V でコピーと貼り付けです。
・重なったクリップは、後に置いた（動かした）方が上で、上のクリップの所は下のクリップが鳴りません。
・録音: 段の「録音待機」を押してから、● 録音（R）を押します。ほかの段が鳴るので、合わせて演奏できます。「カウント」が入っていると、録る前に 1 小節数えます。
・録った音がほかの段より遅れて聞こえるときは、「再生」メニューの「録音の設定」で、マイクの遅れの補正を増やします。
・Space で再生と停止、Home で先頭へ、L でループ、M でメトロノーム、G でスナップ、+ と - で拡大と縮小、F で全体を見ます。
・目盛りの上の帯を押すと再生位置が動き、下の帯をドラッグするとループの範囲を決められます。
・テンポを変えても、クリップの置いた時刻（秒）は変わりません。目盛りとメトロノームとスナップが変わります。
・「ミックスダウン」で、全部の段を 1 つの WAV にまとめます。消音の段は入りません。`;

const fmtDb = (db) => (db <= D.MIN_DB ? '-∞ dB' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`);
const fmtPan = (p) => (Math.abs(p) < 0.005 ? '中央' : p < 0 ? `左 ${Math.round(-p * 100)}` : `右 ${Math.round(p * 100)}`);
const isAudio = (p) => AUDIO_EXTS.includes(extname(p).toLowerCase());
// 選んだマイクの機器（この機械だけの設定なので、計画のファイルには書かない）
const savedDevice = () => { try { return localStorage.getItem('fos-daw-device') || ''; } catch { return ''; } };
function tint(hex, k) {
  const n = parseInt(hex.slice(1), 16), m = (v) => Math.round(v + (255 - v) * k);
  return `rgb(${m(n >> 16)} ${m((n >> 8) & 255)} ${m(n & 255)})`;
}

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, esc } = os;
  let path = null, project = D.emptyProject(), dirty = false, demo = false;
  let sel = { track: project.tracks[0].id, clip: null }, armed = null, playhead = 0, scrollX = 0, guideHidden = false;
  let clipboard = null, pending = null, lastSnap = 1;
  const buffers = new Map(), missing = new Set(), loading = new Set();
  const history = D.createHistory(100);
  let lastMsg = '';

  const win = wm.open({
    app: 'daw', icon: 'icons/daw.svg', className: 'app-daw', w: 1120, h: 680, ...rect, args: {},
    render(w) {
      const id = (s) => `daw-${s}-${w.id}`;
      w.body.innerHTML = MENU + `
      <div class="daw-bar" role="toolbar" aria-label="録音と再生">
        <div class="daw-group">
          <button type="button" class="flat daw-btn" data-a="home" title="先頭へ（Home）">⏮ 先頭へ(<u>B</u>)</button>
          <button type="button" class="flat daw-btn daw-play" data-a="play" aria-pressed="false" title="再生と停止（Space）">▶ 再生(<u>Y</u>)</button>
          <button type="button" class="flat daw-btn" data-a="stop" title="停止（Space）">■ 停止(<u>S</u>)</button>
          <button type="button" class="flat daw-btn daw-recbtn" data-a="rec" aria-pressed="false" title="録音待機の段へ録音（R）">● 録音(<u>R</u>)</button>
        </div>
        <div class="daw-clock" title="再生位置"><div class="daw-pos" data-pos>1.1.00</div><div class="daw-sub" data-sub>0:00.000</div></div>
        <div class="daw-group">
          <label for="${id('bpm')}">テンポ(<u>O</u>)</label><input type="number" id="${id('bpm')}" data-bpm min="30" max="300" step="1">
          <label for="${id('sig')}">拍子(<u>J</u>)</label><select id="${id('sig')}" data-sig>${SIGS.map(([a, b]) => `<option value="${a}/${b}">${a}/${b}</option>`).join('')}</select>
        </div>
        <div class="daw-group">
          <label title="拍ごとにカチッと鳴らします（M）"><input type="checkbox" data-metro> メトロノーム(<u>M</u>)</label>
          <label title="録音の前に 1 小節数えます"><input type="checkbox" data-count> カウント(<u>C</u>)</label>
          <label title="ループの範囲をくり返します（L）。範囲は目盛りの下の帯をドラッグして決めます"><input type="checkbox" data-loop> ループ(<u>L</u>)</label>
        </div>
        <div class="daw-group">
          <label for="${id('snap')}">スナップ(<u>G</u>)</label><select id="${id('snap')}" data-snap>${SNAPS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
          <label for="${id('ruler')}">目盛り(<u>N</u>)</label><select id="${id('ruler')}" data-ruler><option value="bars">小節と拍</option><option value="time">秒</option></select>
        </div>
        <div class="daw-group daw-master">
          <label for="${id('master')}">マスター(<u>W</u>)</label><input type="range" id="${id('master')}" data-master min="-60" max="6" step="0.5"><output data-masterout for="${id('master')}">0.0 dB</output>
          <span class="daw-meter2" aria-hidden="true"><i><b data-ml></b></i><i><b data-mr></b></i></span>
        </div>
      </div>
      <div class="daw-main" data-main>
        <div class="daw-top">
          <div class="daw-corner"><button type="button" class="flat daw-add" data-a="addtrack">＋ 段を足す(<u>A</u>)</button></div>
          <canvas class="daw-ruler" data-rulercv aria-label="目盛り。上の帯を押すと再生位置が動き、下の帯をドラッグするとループの範囲を決めます"></canvas>
        </div>
        <div class="daw-body" data-body>
          <div class="daw-rows">
            <div class="daw-heads" data-heads role="list" aria-label="段"></div>
            <div class="daw-lanecol" data-lanecol>
              <canvas class="daw-lanes" data-lanes tabindex="0" role="application" aria-label="クリップを並べる所。押して選び、つかんで動かします。矢印キーで選んだクリップを動かします"></canvas>
              <div class="daw-playhead" data-ph aria-hidden="true"></div>
            </div>
          </div>
        </div>
        <div class="daw-bottom"><div class="daw-zoom"><button type="button" class="flat daw-mini" data-a="zoomout" aria-label="縮小（-）" title="縮小（-）">－</button><button type="button" class="flat daw-mini" data-a="zoomin" aria-label="拡大（+）" title="拡大（+）">＋</button><button type="button" class="flat daw-mini daw-fit" data-a="fit" title="曲の全体を見る（F）">全体</button><span data-zoominfo></span></div><div class="daw-hscroll" data-hscroll><div data-hspace></div></div></div>
        <section class="daw-guide" data-guide aria-labelledby="${id('gh')}" hidden>
          <h2 id="${id('gh')}">はじめての方へ</h2>
          <ol>
            <li><b>見本の曲を作る</b>: ドラム・ベース・和音の 3 つの段が並んだ曲ができます。Space で聞けます。</li>
            <li><b>音を読み込む</b>: 仮想ドライブの音（WAV・MP3 など）を、選んだ段の再生位置に置きます。デスクトップのアイコンを窓へドロップしても置けます。</li>
            <li><b>録音</b>: 段の「録音待機」を押してから「● 録音」（R）を押すと、ほかの段を鳴らしながらマイクから録ります。</li>
          </ol>
          <p>クリップは、つかんで動かし、左右の端で切り詰め、上の角でフェードを付けます。くわしくは F1 の「使い方」をご覧ください。</p>
          <div class="daw-guide-btns"><button type="button" class="daw-primary" data-a="demo">見本の曲を作る(<u>D</u>)</button><button type="button" data-a="import">音を読み込む(<u>I</u>)...</button><button type="button" data-a="guideclose">案内を閉じる(<u>K</u>)</button></div>
        </section>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field daw-st-sel" data-stsel></div><progress class="daw-prog" data-prog max="1" value="0" aria-label="ミックスダウンの進み具合" hidden></progress><div class="status-field daw-st-rate" data-strate></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      if (rec) await stopTransport();
      if (!dirty) return true;
      const a = await os.msgbox({ title: TITLE, text: `${docName()} は変更されています。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル' || !a) return false;
      if (a === 'はい') return await save();
      return true;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const lanes = q('[data-lanes]'), ruler = q('[data-rulercv]'), heads = q('[data-heads]'), body = q('[data-body]'), lanecol = q('[data-lanecol]');
  const hscroll = q('[data-hscroll]'), hspace = q('[data-hspace]'), ph = q('[data-ph]'), guide = q('[data-guide]'), prog = q('[data-prog]');
  const lx = lanes.getContext('2d'), rx = ruler.getContext('2d');
  const css = getComputedStyle(win.el), FONT = css.getPropertyValue('--fos-font').trim() || 'sans-serif';

  function say(t) { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; }
  const docName = () => (path ? basename(path) : demo ? '見本の曲' : '無題');
  const title = () => win.setTitle(`${rec ? '● ' : ''}${dirty ? '*' : ''}${docName()} - ${TITLE}`);
  const pps = () => project.zoom;
  const trackOf = (id) => project.tracks.find((t) => t.id === id) || null;
  const clipOf = (id) => project.clips.find((c) => c.id === id) || null;
  const snapStep = () => D.gridStep(project.snap, project.bpm, project.sig);
  const snapT = (t, e) => (e?.altKey ? t : D.snapTime(t, snapStep()));
  const fmtPos = (t) => (project.ruler === 'time' ? D.fmtSec(t) : D.fmtBBT(t, project.bpm, project.sig));

  /* ---------- 音の文脈 ---------- */
  let ac = null, eng = null, out = null, workletReady = false, audioErr = null;
  try {
    ac = new AudioContext({ latencyHint: 'interactive' });
    out = ac.createGain(); out.connect(ac.destination);
    eng = createEngine(ac, { output: out, meters: true });
  } catch (e) { audioErr = e.message; log('daw.audio', {}, 'error: ' + e.message); }
  const applyVolume = () => { if (out) { const s = os.getSettings(); out.gain.value = s.mute ? 0 : s.volume; } };
  applyVolume();
  const onSettings = () => applyVolume();
  os.events.addEventListener('settings', onSettings);

  /* ---------- 元に戻す ---------- */
  const snapshot = () => JSON.stringify(D.serialize(project));
  function push() { history.push(snapshot()); }
  function changed() { dirty = true; title(); }
  function beginEdit() { if (!pending) pending = snapshot(); }
  function endEdit() { if (!pending) return; history.push(pending); pending = null; changed(); }
  function restore(s) {
    const keep = { zoom: project.zoom, ruler: project.ruler, snap: project.snap };
    project = Object.assign(D.normalizeProject(JSON.parse(s)), keep);
    if (!trackOf(sel.track)) sel.track = project.tracks[0]?.id || null;
    if (!clipOf(sel.clip)) sel.clip = null;
    if (armed && !trackOf(armed)) armed = null;
    changed(); refresh(); restartIfPlaying();
  }
  function undo() { const s = history.undo(snapshot()); if (!s) { os.sound.play('error'); say('元に戻せる操作がありません。'); return; } restore(s); say('元に戻しました。'); log('daw.undo', {}, 'ok'); }
  function redo() { const s = history.redo(snapshot()); if (!s) { os.sound.play('error'); say('やり直せる操作がありません。'); return; } restore(s); say('やり直しました。'); log('daw.redo', {}, 'ok'); }

  /* ---------- 音の読み込み ---------- */
  async function loadSrc(src) {
    if (buffers.has(src)) return buffers.get(src);
    if (!ac) return null;
    loading.add(src);
    try {
      const blob = await fs.readBlob(src);
      const buffer = await ac.decodeAudioData(await blob.arrayBuffer());
      const chs = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
      const ent = { buffer, peaks: D.buildPeaks(chs, PEAK_BLOCK) };
      buffers.set(src, ent); missing.delete(src);
      log('daw.load', { src, sec: +buffer.duration.toFixed(3), ch: buffer.numberOfChannels }, 'ok');
      return ent;
    } catch (e) {
      log('daw.load', { src }, 'error: ' + (e?.message || e));
      return null;
    } finally { loading.delete(src); }
  }
  const putBuffer = (src, data, rate) => {
    const b = ac.createBuffer(1, data.length, rate); b.copyToChannel(data, 0);
    const ent = { buffer: b, peaks: D.buildPeaks([data], PEAK_BLOCK) };
    buffers.set(src, ent); missing.delete(src);
    return ent;
  };
  // 計画の音を全部読む。見つからない音は印を付ける。音の長さが記録と違えば、音に合わせる
  async function loadAll() {
    const srcs = [...new Set(project.clips.map((c) => c.src))];
    for (const s of srcs) {
      if (buffers.has(s)) continue;
      if (!(await fs.stat(s)) || !(await loadSrc(s))) missing.add(s);
      draw();
    }
    for (const c of project.clips) {
      const b = buffers.get(c.src)?.buffer;
      if (!b || Math.abs(b.duration - c.srcLen) < 1e-3) continue;
      c.srcLen = b.duration; c.offset = Math.min(c.offset, c.srcLen - D.MIN_LEN); c.length = Math.min(c.length, c.srcLen - c.offset);
      Object.assign(c, D.fixFades(c));
    }
    refresh();
    return srcs.filter((s) => missing.has(s));
  }

  /* ---------- 表示: 段の欄 ---------- */
  function headHTML(t) {
    const col = D.COLORS.find((c) => c.id === t.color) || D.COLORS[0], i = `${win.id}-${t.id}`;
    return `<div class="daw-head${t.id === sel.track ? ' selected' : ''}${armed === t.id ? ' armed' : ''}" data-track="${esc(t.id)}" role="listitem" aria-label="${esc(t.name)}" style="--c:${col.hex}">
      <div class="dh-row"><button type="button" class="flat dh-color" data-h="color" aria-label="段の色（${col.name}）を変える" title="段の色（${col.name}）"></button><input type="text" class="dh-name" data-h="name" value="${esc(t.name)}" aria-label="段の名前" spellcheck="false" maxlength="40"><button type="button" class="flat dh-del" data-h="del" aria-label="段「${esc(t.name)}」を消す" title="この段を消す">×</button></div>
      <div class="dh-row"><button type="button" class="flat dh-tg" data-h="mute" aria-pressed="${!!t.mute}" title="この段の音を消します">消音</button><button type="button" class="flat dh-tg" data-h="solo" aria-pressed="${!!t.solo}" title="この段だけを鳴らします（いくつでも選べます）">単独</button><button type="button" class="flat dh-tg dh-arm" data-h="arm" aria-pressed="${armed === t.id}" title="録音をこの段に入れます">録音待機</button><i class="dh-meter" aria-hidden="true"><b data-meter></b></i></div>
      <div class="dh-row dh-sl"><label for="dhv-${i}">音量</label><input type="range" id="dhv-${i}" data-h="vol" min="-60" max="6" step="0.5" value="${t.vol}" aria-valuetext="${fmtDb(t.vol)}" title="音量 ${fmtDb(t.vol)}（ダブルクリックで 0 dB）"><label for="dhp-${i}">左右</label><input type="range" id="dhp-${i}" data-h="pan" min="-100" max="100" step="5" value="${Math.round(t.pan * 100)}" aria-valuetext="${fmtPan(t.pan)}" title="左右 ${fmtPan(t.pan)}（ダブルクリックで中央）"></div>
    </div>`;
  }
  function renderHeads() {
    const keep = document.activeElement && heads.contains(document.activeElement) ? { track: document.activeElement.closest('[data-track]')?.dataset.track, h: document.activeElement.dataset.h } : null;
    heads.innerHTML = project.tracks.map(headHTML).join('');
    heads.style.minHeight = project.tracks.length * ROW + 'px';
    if (keep?.track) heads.querySelector(`[data-track="${CSS.escape(keep.track)}"] [data-h="${keep.h}"]`)?.focus({ preventScroll: true });
  }
  function syncControls() {
    q('[data-bpm]').value = project.bpm;
    q('[data-sig]').value = project.sig.join('/');
    q('[data-metro]').checked = project.metronome;
    q('[data-count]').checked = project.countIn > 0;
    q('[data-loop]').checked = project.loop.on;
    q('[data-snap]').value = String(project.snap);
    q('[data-ruler]').value = project.ruler;
    q('[data-master]').value = project.master;
    q('[data-master]').setAttribute('aria-valuetext', fmtDb(project.master));
    q('[data-masterout]').textContent = fmtDb(project.master);
    win.body.querySelectorAll('.menu-item[data-radio="ruler"]').forEach((m) => m.classList.toggle('checked', m.dataset.command === 'ruler:' + project.ruler));
    q('[data-zoominfo]').textContent = `拡大 ${Math.round(project.zoom)} px/秒`;
  }
  function updateSel() {
    const c = clipOf(sel.clip), t = trackOf(sel.track);
    q('[data-stsel]').textContent = c ? `${c.name}: ${fmtPos(c.start)}〜${fmtPos(D.clipEnd(c))}（${c.length.toFixed(2)} 秒）${missing.has(c.src) ? ' ・音が見つかりません' : ''}` : t ? `段: ${t.name}` : '段がありません';
    heads.querySelectorAll('.daw-head').forEach((h) => h.classList.toggle('selected', h.dataset.track === sel.track));
  }
  function refresh() {
    renderHeads(); syncControls(); updateSel(); title();
    guide.hidden = guideHidden || project.clips.length > 0 || !!rec;
    q('[data-strate]').textContent = ac ? `${ac.sampleRate} Hz ・ 段 ${project.tracks.length} ・ クリップ ${project.clips.length}` : '音を鳴らせません';
    draw(true);
  }

  /* ---------- 表示: 目盛りとクリップ（canvas） ---------- */
  let drawReq = 0;
  function draw(hs) { if (hs) updateHScroll(); if (!drawReq) drawReq = requestAnimationFrame(() => { drawReq = 0; drawNow(); }); }
  function fit(cv, cx, w, h) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px'; }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const X = (t) => (t - scrollX) * pps();
  function drawNow() {
    const W = Math.max(1, lanecol.clientWidth), H = Math.max(project.tracks.length * ROW, body.clientHeight - 2);
    fit(lanes, lx, W, H);
    fit(ruler, rx, Math.max(1, ruler.clientWidth), RULER_H);
    drawRuler(); drawLanes(W, H); placePlayhead(); updateClock();
  }
  function drawRuler() {
    const W = ruler.clientWidth, t1 = scrollX + W / pps();
    rx.fillStyle = '#f4eef8'; rx.fillRect(0, 0, W, RULER_H);
    rx.fillStyle = '#e9e0f2'; rx.fillRect(0, LOOP_Y, W, RULER_H - LOOP_Y);
    // ループの範囲（入っているときは濃く）
    const a = X(project.loop.start), b = X(project.loop.end);
    rx.fillStyle = project.loop.on ? '#6bf2e3' : '#d6cbe6'; rx.fillRect(a, LOOP_Y + 2, b - a, RULER_H - LOOP_Y - 4);
    rx.fillStyle = '#241734'; rx.fillRect(a, LOOP_Y + 1, 2, RULER_H - LOOP_Y - 2); rx.fillRect(b - 2, LOOP_Y + 1, 2, RULER_H - LOOP_Y - 2);
    rx.font = `11px ${FONT}`; rx.textBaseline = 'top';
    for (const tk of D.rulerTicks(scrollX, t1, pps(), project.ruler, project.bpm, project.sig)) {
      const x = Math.round(X(tk.t)) + 0.5;
      rx.fillStyle = tk.major ? '#241734' : '#8e7fa3';
      rx.fillRect(x - 0.5, tk.major ? 2 : 13, 1, tk.major ? LOOP_Y - 2 : LOOP_Y - 13);
      if (tk.label) { rx.fillStyle = '#241734'; rx.fillText(tk.label, x + 3, 3); }
    }
    rx.fillStyle = '#cbbce0'; rx.fillRect(0, RULER_H - 1, W, 1);
    const p = X(position());
    if (p >= -6 && p <= W + 6) { rx.fillStyle = '#ff5c97'; rx.beginPath(); rx.moveTo(p - 6, 0); rx.lineTo(p + 6, 0); rx.lineTo(p, 9); rx.closePath(); rx.fill(); rx.fillRect(p - 1, 0, 2, RULER_H); }
  }
  // クリップの画面での位置（lanes の中の座標）
  function clipRect(c) {
    const i = project.tracks.findIndex((t) => t.id === c.track);
    return { x0: X(c.start), x1: X(D.clipEnd(c)), y0: i * ROW + 4, h: ROW - 8, row: i };
  }
  function roundRect(cx, x, y, w, h, r) { cx.beginPath(); cx.roundRect ? cx.roundRect(x, y, w, h, r) : cx.rect(x, y, w, h); }
  function drawLanes(W, H) {
    lx.fillStyle = '#fffdf9'; lx.fillRect(0, 0, W, H);
    project.tracks.forEach((t, i) => {
      lx.fillStyle = t.id === sel.track ? '#eefcf9' : i % 2 ? '#faf6fd' : '#fffdf9'; lx.fillRect(0, i * ROW, W, ROW);
      lx.fillStyle = '#e2d8ee'; lx.fillRect(0, (i + 1) * ROW - 1, W, 1);
    });
    for (const tk of D.rulerTicks(scrollX, scrollX + W / pps(), pps(), project.ruler, project.bpm, project.sig)) { lx.fillStyle = tk.major ? '#ddd2ea' : '#f0e9f6'; lx.fillRect(Math.round(X(tk.t)), 0, 1, H); }
    if (project.loop.on) { lx.fillStyle = 'rgb(107 242 227 / 0.13)'; lx.fillRect(X(project.loop.start), 0, X(project.loop.end) - X(project.loop.start), H); }
    const parts = D.audibleParts(project.clips);
    for (const c of project.clips) drawClip(c, W, parts.get(c.id));
    if (rec && rec.started) drawLiveTake(W);
  }
  function drawClip(c, W, parts) {
    const r = clipRect(c);
    if (r.row < 0 || r.x1 < -2 || r.x0 > W + 2) return;
    const t = trackOf(c.track), hex = D.colorHex(t.color), w = Math.max(2, r.x1 - r.x0), selected = c.id === sel.clip, gone = missing.has(c.src);
    lx.save();
    roundRect(lx, r.x0, r.y0, w, r.h, 5); lx.fillStyle = gone ? '#fff0f5' : tint(hex, 0.62); lx.fill();
    lx.clip();
    if (gone) { lx.strokeStyle = '#ff8ec7'; lx.lineWidth = 2; for (let x = r.x0 - r.h; x < r.x1; x += 10) { lx.beginPath(); lx.moveTo(x, r.y0 + r.h); lx.lineTo(x + r.h, r.y0); lx.stroke(); } }
    lx.fillStyle = gone ? '#ff8ec7' : hex; lx.fillRect(r.x0, r.y0, w, 16);
    const top = r.y0 + 17, bot = r.y0 + r.h - 2, mid = (top + bot) / 2, amp = (bot - top) / 2 - 1;
    const ent = buffers.get(c.src);
    if (ent) {
      const sr = ent.buffer.sampleRate, g = D.dbToGain(c.gain), p = pps();
      lx.fillStyle = 'rgb(36 23 52 / 0.72)';
      const a = Math.max(0, Math.floor(r.x0)), b = Math.min(W, Math.ceil(r.x1));
      for (let px = a; px < b; px++) {
        const t0 = scrollX + px / p, s0 = (c.offset + t0 - c.start) * sr, s1 = s0 + sr / p;
        const [lo, hi] = D.peakSpan(ent.peaks, s0, s1), k = g * D.fadeWeight(c, t0 + 0.5 / p);
        const y1 = mid - Math.min(1, hi * k) * amp, y2 = mid - Math.max(-1, lo * k) * amp;
        lx.fillRect(px, y1, 1, Math.max(1, y2 - y1));
      }
    }
    // フェード: 影と線。選んだクリップには、つかむ所の四角
    lx.fillStyle = 'rgb(36 23 52 / 0.14)'; lx.strokeStyle = '#241734'; lx.lineWidth = 1.2;
    const fi = c.fadeIn * pps(), fo = c.fadeOut * pps();
    if (fi > 0.5) { lx.beginPath(); lx.moveTo(r.x0, top); lx.lineTo(r.x0 + fi, top); lx.lineTo(r.x0, bot); lx.closePath(); lx.fill(); lx.beginPath(); lx.moveTo(r.x0, bot); lx.lineTo(r.x0 + fi, top); lx.stroke(); }
    if (fo > 0.5) { lx.beginPath(); lx.moveTo(r.x1, top); lx.lineTo(r.x1 - fo, top); lx.lineTo(r.x1, bot); lx.closePath(); lx.fill(); lx.beginPath(); lx.moveTo(r.x1, bot); lx.lineTo(r.x1 - fo, top); lx.stroke(); }
    lx.font = `11px ${FONT}`; lx.textBaseline = 'top'; lx.fillStyle = '#241734';
    const label = gone ? `音が見つかりません: ${c.name}` : !ent ? `${c.name}（読み込み中）` : c.name;
    // 名前は、上のクリップに隠れていない所の頭に書く（左へスクロールしても見えるように、見えている所の左端より右）
    lx.fillText(label, Math.max(0, parts && parts.length ? X(parts[0][0]) : r.x0, r.x0) + 6, r.y0 + 2);
    if (c.gain && w > 120) { const s = fmtDb(c.gain), tw = lx.measureText(s).width; lx.fillText(s, r.x1 - tw - 12, r.y0 + 2); }
    lx.restore();
    roundRect(lx, r.x0, r.y0, w, r.h, 5); lx.lineWidth = selected ? 3 : 1.5; lx.strokeStyle = selected ? '#4b5fe8' : '#241734'; lx.stroke();
    if (selected) for (const hx of [r.x0 + fi, r.x1 - fo]) { lx.fillStyle = '#fff6e3'; lx.fillRect(hx - 4, r.y0 + 4, 8, 8); lx.strokeStyle = '#241734'; lx.lineWidth = 1.5; lx.strokeRect(hx - 4, r.y0 + 4, 8, 8); }
  }
  function drawLiveTake(W) {
    const i = project.tracks.findIndex((t) => t.id === rec.track);
    if (i < 0) return;
    const now = Math.max(rec.from, position()), x0 = X(rec.from), x1 = X(now), y0 = i * ROW + 4, h = ROW - 8;
    if (x1 < 0 || x0 > W) return;
    lx.save(); roundRect(lx, x0, y0, Math.max(2, x1 - x0), h, 5); lx.fillStyle = '#ffe1ec'; lx.fill(); lx.clip();
    lx.fillStyle = '#ff5c97'; lx.fillRect(x0, y0, x1 - x0, 16);
    const mid = y0 + 17 + (h - 19) / 2, amp = (h - 19) / 2 - 1;
    lx.fillStyle = 'rgb(36 23 52 / 0.72)';
    for (const p of rec.live) { const x = X(p.t), y1 = mid - p.hi * amp, y2 = mid - p.lo * amp; lx.fillRect(x, y1, Math.max(1, p.dur * pps()), Math.max(1, y2 - y1)); }
    lx.font = `11px ${FONT}`; lx.textBaseline = 'top'; lx.fillStyle = '#241734'; lx.fillText('● 録音中', x0 + 6, y0 + 2);
    lx.restore();
    roundRect(lx, x0, y0, Math.max(2, x1 - x0), h, 5); lx.lineWidth = 2; lx.strokeStyle = '#c2185b'; lx.stroke();
  }
  function placePlayhead() {
    const x = X(position());
    ph.hidden = x < -2 || x > lanecol.clientWidth + 2;
    ph.style.translate = `${Math.round(x) - 1}px 0`;
    ph.style.height = Math.max(project.tracks.length * ROW, body.clientHeight - 2) + 'px';
  }
  function updateClock() {
    const t = position(), counting = transport && t < transport.from - 1e-6;
    const big = project.ruler === 'time' ? D.fmtSec(Math.max(0, t)) : D.fmtBBT(t, project.bpm, project.sig);
    const small = project.ruler === 'time' ? D.fmtBBT(t, project.bpm, project.sig) : D.fmtSec(Math.max(0, t));
    q('[data-pos]').textContent = counting ? `カウント ${Math.floor((t - transport.from + transport.countIn) / D.beatSec(project.bpm)) + 1}` : big;
    q('[data-sub]').textContent = small;
  }
  // 横のスクロールの棒: 中身の幅は、曲の長さと今見ている所の先まで
  let hsLock = false;
  function updateHScroll() {
    const W = lanecol.clientWidth || 1, vis = W / pps();
    const total = Math.max(D.projectEnd(project), playhead, scrollX + vis, project.loop.on ? project.loop.end : 0) + vis * 0.6;
    hspace.style.width = Math.ceil(total * pps()) + 'px';
    hsLock = true; hscroll.scrollLeft = scrollX * pps();
    requestAnimationFrame(() => { hsLock = false; });
  }
  hscroll.addEventListener('scroll', () => { if (hsLock) return; scrollX = hscroll.scrollLeft / pps(); draw(); });
  function setScroll(t) { scrollX = Math.max(0, t); draw(true); }
  function setZoom(z, anchorT = scrollX + lanecol.clientWidth / 2 / pps(), anchorX = lanecol.clientWidth / 2) {
    project.zoom = Math.min(1000, Math.max(4, z));
    scrollX = Math.max(0, anchorT - anchorX / pps());
    syncControls(); draw(true);
  }
  function fitAll() {
    const end = Math.max(D.projectEnd(project), D.barSec(project.bpm, project.sig) * 4);
    setZoom((lanecol.clientWidth - 24) / (end * 1.04), 0, 0);
    say('曲の全体が見えるようにしました。');
  }
  new ResizeObserver(() => draw(true)).observe(lanecol);
  new ResizeObserver(() => draw()).observe(ruler);

  /* ---------- 再生 ---------- */
  let transport = null, rec = null, uiRaf = 0;
  function position() {
    if (!transport || !ac) return playhead;
    const t = ac.currentTime;
    let s = transport.segs[0];
    for (const x of transport.segs) if (x.at <= t) s = x;
    return Math.min(s.to, s.from + Math.max(0, t - s.at));
  }
  async function resumeAudio() { if (ac && ac.state === 'suspended') await ac.resume().catch(() => {}); }
  function addSeg(from, to, at) { transport.segs.push({ from, to, at }); eng.play(project, buffers, from, to, at); }
  async function startTransport(from, { recording = false, countIn = 0 } = {}) {
    if (!ac) { os.msgbox({ title: TITLE, text: `音を鳴らせません。\n\n${audioErr || 'このブラウザでは Web Audio が使えません。'}`, icon: 'error' }); return false; }
    await resumeAudio();
    if (transport) haltTransport();
    const end = D.projectEnd(project);
    if (!recording && !project.loop.on && end > 0 && from >= end - 1e-3) { from = 0; playhead = 0; say('最後まで来ていたので、頭から再生します。'); }
    const loop = !recording && project.loop.on && from < project.loop.end - 1e-3;
    const T = ac.currentTime + 0.08;
    eng.apply(project);
    transport = { segs: [], clickedUntil: T, recording, from, countIn, startCtx: T + countIn, loop, end, timer: 0 };
    addSeg(from - countIn, loop ? project.loop.end : Infinity, T);
    transport.timer = setInterval(tickTransport, 40);
    tickTransport();
    q('[data-a="play"]').setAttribute('aria-pressed', 'true');
    win.el.classList.add('playing');
    cancelAnimationFrame(uiRaf); uiRaf = requestAnimationFrame(uiLoop);
    return true;
  }
  function tickTransport() {
    const tr = transport;
    if (!tr) return;
    const now = ac.currentTime, last = tr.segs[tr.segs.length - 1];
    if (tr.loop) { const endCtx = last.at + (last.to - last.from); if (now > endCtx - 0.35) addSeg(project.loop.start, project.loop.end, endCtx); }
    // メトロノーム（カウントの間は、メトロノームが切りでも鳴らす）。0.3 秒先までを予約する
    const horizon = now + 0.3, countEnd = tr.countIn > 0 ? tr.from : -Infinity;
    if (horizon > tr.clickedUntil) {
      for (const s of tr.segs) {
        const sEnd = s.at + (s.to - s.from), a = Math.max(tr.clickedUntil, s.at), b = Math.min(horizon, sEnd);
        if (b <= a) continue;
        for (const c of D.clickTimes(s.from + (a - s.at), s.from + (b - s.at), project.bpm, project.sig)) if (project.metronome || c.t < countEnd - 1e-6) eng.click(s.at + (c.t - s.from), c.accent);
      }
      tr.clickedUntil = horizon;
    }
    eng.prune();
    if (!tr.loop && !tr.recording && tr.end > tr.from && position() >= tr.end + 0.05) { stopTransport(); playhead = tr.end; draw(); say('最後まで再生しました。'); }
  }
  function haltTransport() {
    if (!transport) return;
    clearInterval(transport.timer);
    const p = position();
    playhead = Math.max(0, p < transport.from ? transport.from : p); // カウントの途中で止めたら、録り始めの位置のまま
    eng.stopAll();
    transport = null;
  }
  async function stopTransport() {
    if (!transport) return;
    const wasRec = !!rec;
    haltTransport();
    q('[data-a="play"]').setAttribute('aria-pressed', 'false');
    win.el.classList.remove('playing');
    if (wasRec) await finishRecording();
    resetMeters(); draw(); updateSel();
    log('daw.stop', { at: +playhead.toFixed(3) }, 'ok');
  }
  async function play() {
    if (transport) { await stopTransport(); say('止めました。'); return; }
    if (await startTransport(playhead)) { say(project.loop.on ? 'ループの範囲をくり返して再生しています。Space で止めます。' : '再生しています。Space で止めます。'); log('daw.play', { from: +playhead.toFixed(3), loop: project.loop.on }, 'ok'); }
  }
  function restartIfPlaying() { if (transport && !transport.recording) { const p = position(); haltTransport(); playhead = p; startTransport(p); } }
  function setPlayhead(t) { playhead = Math.max(0, t); if (transport && !transport.recording) restartIfPlaying(); draw(); }
  function uiLoop() {
    if (!transport) { uiRaf = 0; return; }
    const p = position(), W = lanecol.clientWidth;
    // 再生位置が見えている所の右端を越えたら、先へ送る
    if (p >= 0 && (X(p) > W - 24 || X(p) < 0)) { scrollX = Math.max(0, p - 24 / pps()); updateHScroll(); drawNow(); }
    else if (rec && performance.now() - (rec.drawn || 0) > 90) { rec.drawn = performance.now(); drawNow(); }
    else { placePlayhead(); updateClock(); drawRuler(); }
    const lv = eng.levels();
    if (lv) {
      setMeter(q('[data-ml]'), lv.master[0]); setMeter(q('[data-mr]'), lv.master[1]);
      heads.querySelectorAll('.daw-head').forEach((h) => setMeter(h.querySelector('[data-meter]'), h.dataset.track === rec?.track ? Math.max(lv.tracks[h.dataset.track] || 0, rec.level) : lv.tracks[h.dataset.track] || 0));
    }
    if (rec) rec.level *= 0.9;
    uiRaf = requestAnimationFrame(uiLoop);
  }
  function setMeter(el, peak) { if (!el) return; el.style.width = (D.meterFrac(peak) * 100).toFixed(1) + '%'; el.dataset.kind = levelKind(peak); }
  function resetMeters() { win.body.querySelectorAll('[data-meter], [data-ml], [data-mr]').forEach((el) => { el.style.width = '0%'; }); }

  /* ---------- 録音 ---------- */
  let flushed = null;
  async function openMic(r) {
    const dev = savedDevice();
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(dev ? { deviceId: { exact: dev } } : {}) };
    r.stream = await navigator.mediaDevices.getUserMedia({ audio });
    if (!workletReady) { await ac.audioWorklet.addModule(new URL('./daw-worklet.mjs', import.meta.url)); workletReady = true; }
    r.src = ac.createMediaStreamSource(r.stream);
    r.node = new AudioWorkletNode(ac, 'fos-daw-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    r.mute = ac.createGain(); r.mute.gain.value = 0; // 処理を続けさせるために出口へつなぐが、マイクの音は出さない（ハウリングしないように）
    r.src.connect(r.node).connect(r.mute).connect(ac.destination);
    r.node.port.onmessage = (e) => {
      if (e.data === 'flushed') { flushed?.(); return; }
      const { frame, data } = e.data;
      r.chunks.push(e.data);
      let lo = 0, hi = 0;
      for (const v of data) { if (v < lo) lo = v; if (v > hi) hi = v; }
      r.level = Math.max(r.level, hi, -lo);
      if (r.startFrame != null && frame + data.length > r.startFrame) r.live.push({ t: r.from + (frame - r.startFrame) / ac.sampleRate, dur: data.length / ac.sampleRate, lo, hi });
    };
    r.stream.getAudioTracks()[0]?.addEventListener('ended', () => { if (rec === r) { say('マイクが外れたので、録音を止めました。'); stopTransport(); } });
  }
  function drain(r) {
    return new Promise((res) => {
      const t = setTimeout(res, 300);
      flushed = () => { clearTimeout(t); flushed = null; res(); };
      try { r.node.port.postMessage('flush'); } catch { res(); }
    });
  }
  function closeMic(r) { try { r.src?.disconnect(); r.node?.disconnect(); r.mute?.disconnect(); } catch { /* 片付けの失敗で止めない */ } r.stream?.getTracks().forEach((t) => t.stop()); }
  async function record() {
    if (rec) { await stopTransport(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { os.msgbox({ title: TITLE, text: 'このブラウザでは録音できません。', icon: 'error' }); return; }
    if (!ac) return;
    let t = trackOf(armed);
    if (!t) {
      t = trackOf(sel.track);
      if (!t) { push(); t = addTrackRaw(); changed(); }
      armed = t.id;
      say(`「${t.name}」を録音待機にしました。`);
    }
    if (transport) await stopTransport();
    await resumeAudio();
    const r = { chunks: [], live: [], level: 0, track: t.id, from: playhead, startFrame: null, started: false };
    try { await openMic(r); }
    catch (e) { closeMic(r); os.sound.play('error'); os.msgbox({ title: TITLE, text: errorText(e), icon: 'warning' }); log('daw.mic', { name: e.name }, 'error: ' + e.message); return; }
    rec = r;
    const countIn = project.countIn > 0 ? D.countInSec(project.countIn, project.bpm, project.sig) : 0;
    if (!(await startTransport(playhead, { recording: true, countIn }))) { closeMic(r); rec = null; return; }
    r.startFrame = Math.round(transport.startCtx * ac.sampleRate);
    r.started = true;
    q('[data-a="rec"]').setAttribute('aria-pressed', 'true');
    win.el.classList.add('recording');
    guide.hidden = true;
    renderHeads(); title();
    say(countIn ? `1 小節数えてから「${t.name}」に録音します。止めるときは Space か R を押します。` : `「${t.name}」に録音しています。止めるときは Space か R を押します。`);
    log('daw.record', { track: t.id, from: +r.from.toFixed(3), countIn, latencyMs: project.latencyMs }, 'ok');
  }
  async function finishRecording() {
    const r = rec;
    rec = null;
    q('[data-a="rec"]').setAttribute('aria-pressed', 'false');
    win.el.classList.remove('recording');
    await drain(r);
    closeMic(r);
    title();
    const rate = ac.sampleRate, s0 = r.startFrame + D.latencyFrames(project.latencyMs, rate);
    const lastEnd = r.chunks.reduce((m, c) => Math.max(m, c.frame + c.data.length), 0);
    if (r.startFrame == null || lastEnd - s0 < rate * 0.05) { say('ほとんど録れていなかったので、録音を残しませんでした。'); log('daw.take', { frames: Math.max(0, lastEnd - s0) }, 'ok 捨てた'); draw(); return; }
    const take = D.alignTake(r.chunks, s0, lastEnd);
    try {
      const name = await fs.freeName(DIR, D.takeName(new Date())), p = DIR + '/' + name;
      await fs.write(p, new Blob([encodeWAV([take], rate)], { type: 'audio/wav' }), 'audio/wav');
      putBuffer(p, take, rate);
      push();
      const c = D.newClip({ id: D.newId('c', project.clips), track: r.track, src: p, name: stem(p), start: r.from, srcLen: take.length / rate });
      project.clips.push(c);
      sel = { track: r.track, clip: c.id };
      changed(); refresh();
      say(`「${stem(p)}」を録りました（${(take.length / rate).toFixed(2)} 秒）。${DIR} に WAV で保存しました。`);
      log('daw.take', { path: p, sec: +(take.length / rate).toFixed(3), latencyMs: project.latencyMs, track: r.track }, 'ok');
    } catch (e) {
      os.msgbox({ title: TITLE, text: `録った音を保存できませんでした。\n\n${e.message}`, icon: 'error' });
      log('daw.take', {}, 'error: ' + e.message);
    }
  }

  /* ---------- 段の操作 ---------- */
  function addTrackRaw() {
    const used = new Set(project.tracks.map((t) => t.name));
    let n = project.tracks.length + 1; while (used.has(`段 ${n}`)) n++;
    const t = D.newTrack(D.newId('t', project.tracks), n, D.nextColor(project.tracks));
    t.name = `段 ${n}`;
    project.tracks.push(t);
    sel = { track: t.id, clip: null };
    return t;
  }
  function addTrack() {
    if (project.tracks.length >= 32) { os.sound.play('error'); say('段は 32 までです。'); return; }
    push(); const t = addTrackRaw(); changed(); refresh();
    heads.querySelector(`[data-track="${CSS.escape(t.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    say(`「${t.name}」を足しました。名前の欄で名前を変えられます。`); log('daw.addtrack', { id: t.id }, 'ok');
  }
  async function deleteTrack(id = sel.track) {
    const t = trackOf(id); if (!t) return;
    const n = project.clips.filter((c) => c.track === id).length;
    if (n) {
      const a = await os.msgbox({ title: TITLE, text: `段「${t.name}」と、その中のクリップ ${n} 個を消しますか?\n\n「元に戻す」で戻せます。`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
    }
    push();
    const i = project.tracks.indexOf(t);
    project.tracks = project.tracks.filter((x) => x.id !== id);
    project.clips = project.clips.filter((c) => c.track !== id);
    if (armed === id) armed = null;
    sel = { track: project.tracks[Math.min(i, project.tracks.length - 1)]?.id || null, clip: null };
    eng?.apply(project);
    changed(); refresh(); restartIfPlaying();
    say(`段「${t.name}」を消しました。`); log('daw.deltrack', { id, clips: n }, 'ok');
  }
  function toggleTrack(id, key) {
    const t = trackOf(id); if (!t) return;
    if (key === 'arm') { armed = armed === id ? null : id; renderHeads(); say(armed ? `「${t.name}」を録音待機にしました。● 録音（R）で録ります。` : '録音待機を外しました。'); log('daw.arm', { id, on: !!armed }, 'ok'); return; }
    push(); t[key] = !t[key]; changed();
    eng?.apply(project, true);
    renderHeads();
    say(key === 'mute' ? (t.mute ? `「${t.name}」の音を消しました。` : `「${t.name}」の音を戻しました。`) : t.solo ? `「${t.name}」を単独にしました。単独の段だけが鳴ります。` : `「${t.name}」の単独を外しました。`);
    log('daw.' + key, { id, on: t[key] }, 'ok');
  }
  function colorMenu(x, y, id = sel.track) {
    const t = trackOf(id); if (!t) return;
    popup(D.COLORS.map((c) => `<div class="menu-item${c.id === t.color ? ' checked radio' : ''}" data-command="color:${c.id}:${esc(id)}"><span class="label"><i class="daw-swatch" style="background:${c.hex}"></i>${c.name}</span></div>`).join(''), x, y);
  }
  function setColor(id, color) {
    const t = trackOf(id); if (!t || t.color === color) return;
    push(); t.color = color; changed(); renderHeads(); draw();
    say(`「${t.name}」の色を${D.COLORS.find((c) => c.id === color).name}にしました。`); log('daw.color', { id, color }, 'ok');
  }

  /* ---------- クリップの操作 ---------- */
  const replaceClip = (c) => { const i = project.clips.findIndex((x) => x.id === c.id); if (i >= 0) project.clips[i] = c; };
  const toTop = (id) => { const i = project.clips.findIndex((x) => x.id === id); if (i >= 0) project.clips.push(...project.clips.splice(i, 1)); };
  async function importPath(p, at = playhead, trackId = sel.track) {
    if (!isAudio(p)) { os.sound.play('error'); say(`「${basename(p)}」は音のファイルではありません（${AUDIO_EXTS.join('・')}）。`); return null; }
    say(`「${basename(p)}」を読み込んでいます…`);
    const ent = await loadSrc(p);
    if (!ent) { os.msgbox({ title: TITLE, text: `「${basename(p)}」を音として読めませんでした。\n\nファイルが壊れているか、このブラウザで読めない形式です。`, icon: 'warning' }); return null; }
    push();
    let t = trackOf(trackId);
    if (!t) t = addTrackRaw();
    if (!project.clips.some((c) => c.track === t.id) && /^段 \d+$/.test(t.name)) t.name = stem(p).slice(0, 40);
    const c = D.newClip({ id: D.newId('c', project.clips), track: t.id, src: p, name: stem(p), start: Math.max(0, at), srcLen: ent.buffer.duration });
    project.clips.push(c);
    sel = { track: t.id, clip: c.id };
    changed(); refresh(); restartIfPlaying();
    say(`「${c.name}」を「${t.name}」の ${fmtPos(c.start)} に置きました（${ent.buffer.duration.toFixed(2)} 秒）。`);
    log('daw.import', { path: p, track: t.id, at: +c.start.toFixed(3), sec: +ent.buffer.duration.toFixed(3) }, 'ok');
    return c;
  }
  async function importDialog() {
    const p = await os.fileDialog({ mode: 'open', dir: '/音楽', exts: AUDIO_EXTS, typeLabel: '音のファイル' });
    if (p) await importPath(p);
  }
  // パソコンからのファイル: 仮想ドライブの /音楽/多重録音 へ写してから置く
  async function importFiles(files, at, trackId) {
    let n = 0;
    for (const f of files) {
      if (!isAudio(f.name)) { say(`「${f.name}」は音のファイルではないので、置きませんでした。`); continue; }
      const p = DIR + '/' + (await fs.freeName(DIR, f.name));
      await fs.write(p, f, f.type || 'application/octet-stream');
      const c = await importPath(p, at, trackId);
      if (c) { n++; at = D.clipEnd(c); trackId = c.track; }
    }
    if (n) os.sound.play('drop');
    log('daw.dropfiles', { count: n }, 'ok');
  }
  function splitAt(t = playhead) {
    let targets = sel.clip ? [clipOf(sel.clip)] : D.clipsAt(project, t).map((x) => x.clip).filter((c) => c.track === sel.track);
    targets = targets.filter((c) => c && D.splitClip(c, t, 'x'));
    if (!targets.length) { os.sound.play('error'); say('再生位置にかかるクリップがありません。クリップを選び、再生位置をクリップの中に置いてから分けます。'); return; }
    push();
    for (const c of targets) {
      const [l, r] = D.splitClip(c, t, D.newId('c', project.clips));
      const i = project.clips.findIndex((x) => x.id === c.id);
      project.clips.splice(i, 1, l, r);
      sel.clip = r.id;
    }
    changed(); refresh(); restartIfPlaying();
    say(`再生位置（${fmtPos(t)}）で分けました。`); log('daw.split', { at: +t.toFixed(3), count: targets.length }, 'ok');
  }
  function deleteClip(id = sel.clip) {
    const c = clipOf(id);
    if (!c) { os.sound.play('error'); say('消すクリップを選んでください。'); return; }
    push(); project.clips = project.clips.filter((x) => x.id !== id); sel.clip = null;
    changed(); refresh(); restartIfPlaying();
    os.sound.play('trash'); say(`「${c.name}」を消しました。「元に戻す」で戻せます。`); log('daw.delete', { id }, 'ok');
  }
  function copyClip() {
    const c = clipOf(sel.clip);
    if (!c) { os.sound.play('error'); say('コピーするクリップを選んでください。'); return; }
    clipboard = { ...c }; say(`「${c.name}」をコピーしました。再生位置へ Ctrl+V で貼り付けます。`); log('daw.copy', { id: c.id }, 'ok');
  }
  function paste() {
    if (!clipboard) { os.sound.play('error'); say('先にクリップをコピーしてください。'); return; }
    push();
    let t = trackOf(sel.track) || trackOf(clipboard.track);
    if (!t) t = addTrackRaw();
    const c = { ...clipboard, id: D.newId('c', project.clips), track: t.id, start: Math.max(0, playhead) };
    project.clips.push(c); sel = { track: t.id, clip: c.id };
    changed(); refresh(); restartIfPlaying();
    say(`「${c.name}」を「${t.name}」の ${fmtPos(c.start)} に貼り付けました。`); log('daw.paste', { id: c.id, track: t.id, at: +c.start.toFixed(3) }, 'ok');
  }
  function nudge(dir, e) {
    const c = clipOf(sel.clip); if (!c) return false;
    const step = e.shiftKey ? 0.01 : snapStep() || 0.1;
    push(); const m = D.moveClip(c, D.snapTime(c.start + dir * step, e.shiftKey ? 0 : snapStep())); replaceClip(m); changed(); draw(true); updateSel(); restartIfPlaying();
    say(`「${c.name}」を ${fmtPos(m.start)} へ動かしました。`); log('daw.nudge', { id: c.id, start: +m.start.toFixed(3) }, 'ok');
    return true;
  }
  function moveToTrack(dir) {
    const c = clipOf(sel.clip); if (!c) return false;
    const i = project.tracks.findIndex((t) => t.id === c.track), t = project.tracks[i + dir];
    if (!t) return true;
    push(); replaceClip(D.moveClip(c, c.start, t.id)); toTop(c.id); sel.track = t.id; changed(); refresh(); restartIfPlaying();
    say(`「${c.name}」を「${t.name}」へ動かしました。`); log('daw.movetrack', { id: c.id, track: t.id }, 'ok');
    return true;
  }
  async function clipDialog(id = sel.clip) {
    const c = clipOf(id);
    if (!c) { os.sound.play('error'); say('クリップを選んでください。'); return; }
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog daw-dlg';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">クリップの音量とフェード</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる" data-close=""></button></div></div>
      <div class="window-body">
        <div class="fd-row"><label for="dcN">名前(<u>N</u>):</label><input type="text" id="dcN" maxlength="80" spellcheck="false"></div>
        <div class="fd-row"><label for="dcG">音量(<u>V</u>):</label><input type="range" id="dcG" min="-24" max="12" step="0.5"><output for="dcG" data-go></output></div>
        <div class="fd-row"><label for="dcI">フェードイン(<u>I</u>):</label><input type="number" id="dcI" min="0" step="0.01"><span>秒</span></div>
        <div class="fd-row"><label for="dcO">フェードアウト(<u>O</u>):</label><input type="number" id="dcO" min="0" step="0.01"><span>秒</span></div>
        <p class="daw-hint">長さは ${c.length.toFixed(2)} 秒です。フェードの合計は長さまでにそろえます。音量の 0 dB は元の大きさです。</p>
        <div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button></div>
      </div>`;
    document.body.append(dlg);
    const $ = (s) => dlg.querySelector(s), g = $('#dcG'), show = () => { $('[data-go]').textContent = fmtDb(+g.value); g.setAttribute('aria-valuetext', fmtDb(+g.value)); };
    $('#dcN').value = c.name; g.value = c.gain; $('#dcI').value = +c.fadeIn.toFixed(3); $('#dcO').value = +c.fadeOut.toFixed(3); $('#dcI').max = $('#dcO').max = c.length.toFixed(3);
    show(); g.addEventListener('input', show);
    const r = await w95.openDialog(dlg);
    const v = { name: $('#dcN').value.trim() || c.name, gain: +g.value, fadeIn: Math.max(0, +$('#dcI').value || 0), fadeOut: Math.max(0, +$('#dcO').value || 0) };
    dlg.remove();
    if (r !== 'ok') return;
    push(); replaceClip(D.fixFades({ ...c, ...v })); changed(); draw(); updateSel(); restartIfPlaying();
    say(`「${v.name}」の音量を ${fmtDb(v.gain)}、フェードを ${v.fadeIn.toFixed(2)} 秒と ${v.fadeOut.toFixed(2)} 秒にしました。`);
    log('daw.clipprops', { id: c.id, ...v }, 'ok');
  }
  async function relink(id = sel.clip) {
    const c = clipOf(id);
    if (!c) { os.sound.play('error'); say('差し替えるクリップを選んでください。'); return; }
    const p = await os.fileDialog({ mode: 'open', title: '音を差し替える', dir: (await fs.stat(dirname(c.src))) ? dirname(c.src) : '/音楽', exts: AUDIO_EXTS, typeLabel: '音のファイル' });
    if (!p) return;
    const ent = await loadSrc(p);
    if (!ent) { os.msgbox({ title: TITLE, text: `「${basename(p)}」を音として読めませんでした。`, icon: 'warning' }); return; }
    push();
    const old = c.src;
    let n = 0;
    project.clips = project.clips.map((x) => {
      if (x.src !== old) return x;
      n++;
      const srcLen = ent.buffer.duration, offset = Math.min(x.offset, srcLen - D.MIN_LEN);
      return D.fixFades({ ...x, src: p, srcLen, offset, length: Math.min(x.length, srcLen - offset) });
    });
    missing.delete(old);
    changed(); refresh(); restartIfPlaying();
    say(`クリップ ${n} 個の音を「${basename(p)}」に差し替えました。`); log('daw.relink', { from: old, to: p, count: n }, 'ok');
  }

  /* ---------- マウスで: 目盛り ---------- */
  const localXY = (el, e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  // ドラッグの間の動きと離したときは window で受ける（canvas の外まで動かしても、ポインターの捕まえが外れても続けられるように）
  function follow(onMove, onEnd) {
    const end = () => { removeEventListener('pointermove', onMove); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); onEnd(); };
    addEventListener('pointermove', onMove); addEventListener('pointerup', end); addEventListener('pointercancel', end);
  }
  ruler.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const { x, y } = localXY(ruler, e), t0 = scrollX + x / pps();
    // 目盛りを押したあとも、Space や S のキーがすぐ効くように、焦点をクリップの欄へ移す（既定の焦点の移動は止める）
    e.preventDefault();
    lanes.focus({ preventScroll: true });
    try { ruler.setPointerCapture(e.pointerId); } catch { /* つかまえられなくても、window で受けるので動かせる */ }
    if (y < LOOP_Y) {
      setPlayhead(snapT(t0, e));
      follow((ev) => { const p = localXY(ruler, ev); playhead = Math.max(0, snapT(scrollX + p.x / pps(), ev)); draw(); }, () => { setPlayhead(playhead); log('daw.seek', { at: +playhead.toFixed(3) }, 'ok'); });
      return;
    }
    // ループの帯: ドラッグで範囲を決めて入れる
    const a = Math.max(0, snapT(t0, e));
    let moved = false;
    const mv = (ev) => {
      const b = Math.max(0, snapT(scrollX + localXY(ruler, ev).x / pps(), ev));
      if (Math.abs(b - a) < D.MIN_LEN) return;
      if (!moved) { push(); moved = true; }
      project.loop = { on: true, start: Math.min(a, b), end: Math.max(a, b) };
      syncControls(); draw();
    };
    follow(mv, () => {
      if (!moved) { say('ループの範囲は、目盛りの下の帯を横にドラッグして決めます。'); return; }
      changed(); restartIfPlaying();
      say(`ループの範囲を ${fmtPos(project.loop.start)}〜${fmtPos(project.loop.end)} にしました。L で入・切します。`);
      log('daw.loopset', { start: +project.loop.start.toFixed(3), end: +project.loop.end.toFixed(3) }, 'ok');
    });
  });

  /* ---------- マウスで: クリップ ---------- */
  function hitTest(x, y) {
    for (let i = project.clips.length - 1; i >= 0; i--) {
      const c = project.clips[i], r = clipRect(c);
      if (r.row < 0 || x < r.x0 - 2 || x > r.x1 + 2 || y < r.y0 || y > r.y0 + r.h) continue;
      const fiX = r.x0 + c.fadeIn * pps(), foX = r.x1 - c.fadeOut * pps(), w = r.x1 - r.x0;
      let zone = 'move';
      if (y < r.y0 + 17 && w > 24) { if (Math.abs(x - fiX) <= 7 && x - r.x0 < w / 2) zone = 'fadeIn'; else if (Math.abs(x - foX) <= 7 && r.x1 - x < w / 2) zone = 'fadeOut'; }
      if (zone === 'move' && w > EDGE_PX * 3) { if (x - r.x0 < EDGE_PX) zone = 'trimL'; else if (r.x1 - x < EDGE_PX) zone = 'trimR'; }
      return { clip: c, zone };
    }
    return null;
  }
  const CURSOR = { move: 'grab', trimL: 'w-resize', trimR: 'e-resize', fadeIn: 'nwse-resize', fadeOut: 'nesw-resize' };
  const HINT = { move: 'つかんで動かします（縦に動かすと段が変わります。Alt を押しながらでスナップしません）。', trimL: '左の端: つかんで頭を切り詰めます。', trimR: '右の端: つかんで終わりを切り詰めます。', fadeIn: '左上の角: つかんで右へ動かすとフェードイン（だんだん大きく）です。', fadeOut: '右上の角: つかんで左へ動かすとフェードアウト（だんだん小さく）です。' };
  let drag = null, hoverZone = null;
  lanes.addEventListener('pointermove', (e) => {
    if (drag) return;
    const { x, y } = localXY(lanes, e), h = hitTest(x, y), z = h ? h.zone : null;
    lanes.style.cursor = z ? CURSOR[z] : 'crosshair';
    if (z !== hoverZone) { hoverZone = z; if (z) say(HINT[z]); }
  });
  lanes.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    lanes.focus({ preventScroll: true });
    const { x, y } = localXY(lanes, e), h = hitTest(x, y), ti = Math.floor(y / ROW), t = project.tracks[ti];
    if (h) {
      sel = { track: h.clip.track, clip: h.clip.id };
      if (rec) { draw(); updateSel(); say('録音中はクリップを動かせません。'); return; }
      drag = { mode: h.zone, id: h.clip.id, orig: { ...h.clip }, sx: e.clientX, sy: e.clientY, moved: false };
      lanes.style.cursor = h.zone === 'move' ? 'grabbing' : CURSOR[h.zone];
    } else {
      sel = { track: t ? t.id : sel.track, clip: null };
      setPlayhead(snapT(scrollX + x / pps(), e));
      drag = { mode: 'seek' };
    }
    try { lanes.setPointerCapture(e.pointerId); } catch { /* window で受けるので続けられる */ }
    follow(dragMove, dragEnd);
    draw(); updateSel();
  });
  function dragMove(e) {
    if (!drag) return;
    const { x, y } = localXY(lanes, e);
    if (drag.mode === 'seek') { playhead = Math.max(0, snapT(scrollX + x / pps(), e)); draw(); return; }
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
    if (!drag.moved) { push(); drag.moved = true; }
    const o = drag.orig, dt = (e.clientX - drag.sx) / pps();
    let c;
    if (drag.mode === 'move') {
      const ti = Math.max(0, Math.min(project.tracks.length - 1, Math.floor(y / ROW)));
      c = D.moveClip(o, snapT(o.start + dt, e), project.tracks[ti].id);
      sel.track = c.track;
    } else if (drag.mode === 'trimL') c = D.trimStart(o, snapT(o.start + dt, e));
    else if (drag.mode === 'trimR') c = D.trimEnd(o, snapT(D.clipEnd(o) + dt, e));
    else if (drag.mode === 'fadeIn') c = { ...o, fadeIn: Math.max(0, Math.min(o.length - o.fadeOut, o.fadeIn + dt)) };
    else c = { ...o, fadeOut: Math.max(0, Math.min(o.length - o.fadeIn, o.fadeOut - dt)) };
    replaceClip(c); draw(); updateSel();
  }
  function dragEnd() {
    const d = drag; drag = null;
    if (!d) return;
    if (d.mode === 'seek') { setPlayhead(playhead); return; }
    lanes.style.cursor = CURSOR[d.mode];
    if (!d.moved) return;
    const c = clipOf(d.id);
    if (d.mode === 'move' || d.mode.startsWith('trim')) toTop(d.id);
    changed(); refresh(); restartIfPlaying();
    const what = { move: '動かしました', trimL: '頭を切り詰めました', trimR: '終わりを切り詰めました', fadeIn: `フェードインを ${c.fadeIn.toFixed(2)} 秒にしました`, fadeOut: `フェードアウトを ${c.fadeOut.toFixed(2)} 秒にしました` }[d.mode];
    say(`「${c.name}」を${what}（${fmtPos(c.start)}〜${fmtPos(D.clipEnd(c))}）。`);
    log('daw.' + d.mode, { id: c.id, track: c.track, start: +c.start.toFixed(3), offset: +c.offset.toFixed(3), length: +c.length.toFixed(3), fadeIn: +c.fadeIn.toFixed(3), fadeOut: +c.fadeOut.toFixed(3) }, 'ok');
  }
  lanes.addEventListener('dblclick', (e) => { const { x, y } = localXY(lanes, e), h = hitTest(x, y); if (h) clipDialog(h.clip.id); });
  lanes.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const { x, y } = localXY(lanes, e), h = hitTest(x, y), t = project.tracks[Math.floor(y / ROW)];
    if (h) { sel = { track: h.clip.track, clip: h.clip.id }; draw(); updateSel(); }
    else if (t) { sel = { track: t.id, clip: null }; setPlayhead(snapT(scrollX + x / pps(), e)); updateSel(); }
    const it = (cmd, label, on = true) => `<div class="menu-item" data-command="${cmd}"${on ? '' : ' aria-disabled="true"'}><span class="label">${label}</span></div>`;
    popup(h
      ? it('split', '再生位置で分ける(<u>S</u>)') + it('copy', 'コピー(<u>C</u>)') + it('clipprops', '音量とフェード(<u>F</u>)...') + it('relink', '音を差し替える(<u>L</u>)...') + it('loopclip', 'ループをこのクリップに合わせる(<u>K</u>)') + '<div class="menu-separator"></div>' + it('delete', '消す(<u>D</u>)')
      : it('paste', '貼り付け(<u>P</u>)', !!clipboard) + it('import', '音を読み込む(<u>I</u>)...') + '<div class="menu-separator"></div>' + it('addtrack', '段を足す(<u>A</u>)'), e.clientX, e.clientY);
  });
  // ホイール: Ctrl で拡大縮小（指した所を中心に）、Shift か横のホイールで時間を送る。縦はそのまま段を送る
  lanecol.addEventListener('wheel', (e) => {
    if (e.ctrlKey) { e.preventDefault(); const { x } = localXY(lanes, e); setZoom(pps() * (e.deltaY < 0 ? 1.25 : 0.8), scrollX + x / pps(), x); return; }
    const dx = e.shiftKey ? e.deltaY : e.deltaX;
    if (Math.abs(dx) > 0) { e.preventDefault(); setScroll(scrollX + dx / pps()); }
  }, { passive: false });
  ruler.addEventListener('wheel', (e) => { e.preventDefault(); const { x } = localXY(ruler, e); if (e.ctrlKey) setZoom(pps() * (e.deltaY < 0 ? 1.25 : 0.8), scrollX + x / pps(), x); else setScroll(scrollX + (e.deltaX || e.deltaY) / pps()); }, { passive: false });

  /* ---------- 段の欄 ---------- */
  heads.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.daw-head'); if (!h || h.dataset.track === sel.track) return;
    sel = { track: h.dataset.track, clip: null }; updateSel(); draw();
  });
  heads.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-h]'), h = e.target.closest('.daw-head'); if (!b || !h) return;
    const id = h.dataset.track;
    if (b.dataset.h === 'del') deleteTrack(id);
    else if (b.dataset.h === 'color') { const r = b.getBoundingClientRect(); colorMenu(r.left, r.bottom, id); }
    else toggleTrack(id, b.dataset.h);
  });
  heads.addEventListener('input', (e) => {
    const el = e.target, h = el.closest('.daw-head'); if (!h || !el.matches('input[type=range]')) return;
    const t = trackOf(h.dataset.track); if (!t) return;
    beginEdit();
    if (el.dataset.h === 'vol') { t.vol = +el.value; el.setAttribute('aria-valuetext', fmtDb(t.vol)); el.title = `音量 ${fmtDb(t.vol)}（ダブルクリックで 0 dB）`; say(`「${t.name}」の音量: ${fmtDb(t.vol)}`); }
    else { t.pan = +el.value / 100; el.setAttribute('aria-valuetext', fmtPan(t.pan)); el.title = `左右 ${fmtPan(t.pan)}（ダブルクリックで中央）`; say(`「${t.name}」の左右: ${fmtPan(t.pan)}`); }
    eng?.apply(project, true);
  });
  heads.addEventListener('change', (e) => {
    const el = e.target, h = el.closest('.daw-head'); if (!h) return;
    const t = trackOf(h.dataset.track); if (!t) return;
    if (el.matches('input[type=range]')) { endEdit(); log('daw.' + el.dataset.h, { id: t.id, vol: t.vol, pan: t.pan }, 'ok'); return; }
    if (el.dataset.h === 'name') {
      const v = el.value.trim().slice(0, 40);
      if (!v || v === t.name) { el.value = t.name; return; }
      push(); const old = t.name; t.name = v; changed(); h.setAttribute('aria-label', v); updateSel();
      say(`段「${old}」の名前を「${v}」にしました。`); log('daw.rename', { id: t.id, name: v }, 'ok');
    }
  });
  heads.addEventListener('dblclick', (e) => {
    const el = e.target.closest('input[type=range]'), h = e.target.closest('.daw-head'); if (!el || !h) return;
    const t = trackOf(h.dataset.track); if (!t) return;
    push(); if (el.dataset.h === 'vol') t.vol = 0; else t.pan = 0; changed(); eng?.apply(project, true); renderHeads();
    say(el.dataset.h === 'vol' ? `「${t.name}」の音量を 0 dB に戻しました。` : `「${t.name}」の左右を中央に戻しました。`);
  });
  heads.addEventListener('keydown', (e) => { if (e.target.dataset.h === 'name' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.target.blur(); lanes.focus({ preventScroll: true }); } });
  // 段の欄と、クリップの欄は同じ箱の中で縦に一緒に動く

  /* ---------- 道具の帯 ---------- */
  const bar = q('.daw-bar');
  bar.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-bpm]')) {
      const v = Math.round(+el.value);
      if (!(v >= 30 && v <= 300)) { el.value = project.bpm; os.sound.play('error'); say('テンポは 30〜300 の数で入れてください。'); return; }
      if (v === project.bpm) return;
      push(); project.bpm = v; changed(); draw(); restartIfPlaying(); say(`テンポを ${v} にしました。クリップの時刻（秒）は変わりません。`); log('daw.bpm', { bpm: v }, 'ok');
    } else if (el.matches('[data-sig]')) {
      push(); project.sig = el.value.split('/').map(Number); changed(); draw(); say(`拍子を ${el.value} にしました。`); log('daw.sig', { sig: el.value }, 'ok');
    } else if (el.matches('[data-metro]')) setMetro(el.checked);
    else if (el.matches('[data-count]')) { project.countIn = el.checked ? 1 : 0; changed(); say(el.checked ? '録音の前に 1 小節数えます。' : '録音の前に数えません。'); }
    else if (el.matches('[data-loop]')) setLoop(el.checked);
    else if (el.matches('[data-snap]')) { project.snap = el.value === 'bar' ? 'bar' : +el.value; changed(); say(project.snap ? `スナップ: ${el.selectedOptions[0].textContent}の目盛りに合わせて動かします（Alt を押しながらで外します）。` : 'スナップを外しました。'); }
    else if (el.matches('[data-ruler]')) setRuler(el.value);
    else if (el.matches('[data-master]')) { endEdit(); log('daw.master', { db: project.master }, 'ok'); }
  });
  q('[data-master]').addEventListener('input', (e) => {
    beginEdit(); project.master = +e.target.value; q('[data-masterout]').textContent = fmtDb(project.master); e.target.setAttribute('aria-valuetext', fmtDb(project.master)); eng?.apply(project, true);
  });
  q('[data-master]').addEventListener('dblclick', () => { push(); project.master = 0; changed(); syncControls(); eng?.apply(project, true); });
  function setMetro(on) { project.metronome = on; changed(); syncControls(); say(on ? 'メトロノームを入れました。' : 'メトロノームを切りました。'); log('daw.metro', { on }, 'ok'); }
  function setLoop(on) { project.loop.on = on; changed(); syncControls(); draw(); restartIfPlaying(); say(on ? `ループ: ${fmtPos(project.loop.start)}〜${fmtPos(project.loop.end)} をくり返します。` : 'ループを切りました。'); log('daw.loop', { on }, 'ok'); }
  function setRuler(v) { project.ruler = v; syncControls(); draw(); updateSel(); say(v === 'time' ? '目盛りを秒にしました。' : '目盛りを小節と拍にしました。'); }
  function toggleSnap() { if (project.snap) { lastSnap = project.snap; project.snap = 0; } else project.snap = lastSnap || 1; changed(); syncControls(); say(project.snap ? 'スナップを入れました。' : 'スナップを外しました（自由な位置に置けます）。'); }

  /* ---------- 計画の保存と開く ---------- */
  async function save() {
    if (!path) return saveAs();
    try {
      await fs.write(path, D.serialize(project), 'application/json');
      dirty = false; os.addRecent(path); title(); say(`保存しました: ${path}`); log('daw.save', { path, tracks: project.tracks.length, clips: project.clips.length }, 'ok');
      return true;
    } catch (e) { os.msgbox({ title: TITLE, text: e.message, icon: 'error' }); log('daw.save', { path }, 'error: ' + e.message); return false; }
  }
  async function saveAs() {
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/音楽', name: path ? basename(path) : `${docName()}.fdaw`, exts: ['.fdaw'], typeLabel: '多重録音の計画' });
    if (!p) return false;
    path = p; demo = false; win.setArgs({ path });
    return save();
  }
  async function loadProject(p) {
    let next;
    try { next = D.normalizeProject(await fs.readJSON(p)); }
    catch (e) { os.msgbox({ title: TITLE, text: `「${basename(p)}」を開けませんでした。\n\n${e.message}`, icon: 'error' }); log('daw.open', { path: p }, 'error: ' + e.message); return false; }
    if (transport) await stopTransport();
    project = next; path = p; demo = false; dirty = false; history.clear(); armed = null; playhead = 0; scrollX = 0;
    sel = { track: project.tracks[0]?.id || null, clip: null };
    win.setArgs({ path }); os.addRecent(p);
    refresh();
    say(`「${basename(p)}」を開いています…`);
    const gone = await loadAll();
    eng?.apply(project);
    log('daw.open', { path: p, tracks: project.tracks.length, clips: project.clips.length, missing: gone.length }, 'ok');
    if (gone.length) {
      say(`見つからない音が ${gone.length} 個あります。印の付いたクリップを選び、「編集」の「音を差し替える」で指定し直せます。`);
      os.msgbox({ title: TITLE, icon: 'warning', text: `次の音が見つかりませんでした。該当するクリップに印を付けています（鳴りません）。\n\n${gone.map((s) => '・' + s).join('\n')}\n\nクリップを選んで「編集」→「音を差し替える」で、別の音を指定できます。` });
    } else say(`「${basename(p)}」を開きました（段 ${project.tracks.length} ・ クリップ ${project.clips.length}）。Space で再生します。`);
    return true;
  }
  async function openDialog() {
    const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/音楽', exts: ['.fdaw'], typeLabel: '多重録音の計画' });
    if (!p) return;
    // 何も置いていない新しい窓なら、この窓で開く。そうでなければ別の窓で開く
    if (!dirty && !path && !project.clips.length) await loadProject(p); else os.openFile(p, 'daw');
  }

  /* ---------- 見本の曲 ---------- */
  async function makeDemo() {
    if (!ac) return;
    if (project.clips.length) {
      const a = await os.msgbox({ title: TITLE, text: '今の計画を、見本の曲に置き換えますか?\n\n「元に戻す」で今の計画に戻せます。', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
    }
    if (transport) await stopTransport();
    say('見本の曲を作っています…');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const rate = 44100, bpm = 110, st = D.demoStems(rate, bpm);
      const paths = { drums: `${DIR}/見本 ドラム.wav`, bass: `${DIR}/見本 ベース.wav`, chords: `${DIR}/見本 和音.wav` };
      for (const k of ['drums', 'bass', 'chords']) {
        await fs.write(paths[k], new Blob([encodeWAV([st[k]], rate)], { type: 'audio/wav' }), 'audio/wav');
        putBuffer(paths[k], st[k], rate);
      }
      push();
      const keep = { zoom: project.zoom, ruler: project.ruler, snap: project.snap };
      project = Object.assign(D.demoProject(paths, bpm), keep);
      demo = !path; armed = null; playhead = 0; guideHidden = false;
      sel = { track: project.tracks[0].id, clip: null };
      eng.apply(project);
      changed(); refresh(); fitAll();
      say('見本の曲を作りました（ドラム・ベース・和音の 3 つの段）。Space で再生します。クリップをつかんで動かしてみてください。');
      log('daw.demo', { tracks: project.tracks.length, clips: project.clips.length, sec: +D.projectEnd(project).toFixed(3) }, 'ok');
    } catch (e) { os.msgbox({ title: TITLE, text: `見本の曲を作れませんでした。\n\n${e.message}`, icon: 'error' }); log('daw.demo', {}, 'error: ' + e.message); }
  }

  /* ---------- ミックスダウン ---------- */
  async function mixdown(toPC) {
    if (transport) await stopTransport();
    if (!project.clips.length) { os.sound.play('error'); say('書き出す音がありません。先に音を置くか、録音してください。'); return; }
    if (typeof OfflineAudioContext === 'undefined') { os.msgbox({ title: TITLE, text: 'このブラウザでは書き出せません（OfflineAudioContext が使えません）。', icon: 'error' }); return; }
    let useLoop = false;
    if (project.loop.on) {
      const a = await os.msgbox({ title: 'ミックスダウン', icon: 'info', text: `どこを書き出しますか?\n\n全体: 頭から最後のクリップの終わりまで\nループの範囲: ${fmtPos(project.loop.start)}〜${fmtPos(project.loop.end)}`, buttons: ['全体(&A)', 'ループの範囲(&L)', 'キャンセル'] });
      if (!a || a === 'キャンセル') return;
      useLoop = a === 'ループの範囲';
    }
    const base = path ? stem(path) : docName();
    let p = null;
    if (!toPC) { p = await os.fileDialog({ mode: 'save', dir: '/音楽', name: `${base}.wav`, exts: ['.wav'], typeLabel: 'WAV 音声' }); if (!p) return; }
    const range = D.mixRange(project, useLoop);
    prog.hidden = false; prog.value = 0;
    say('ミックスダウンしています…');
    try {
      const buf = await renderMix(project, buffers, range, MIX_RATE, (f) => { prog.value = f; });
      const blob = new Blob([encodeWAV([buf.getChannelData(0), buf.getChannelData(1)], MIX_RATE)], { type: 'audio/wav' });
      const lost = [...new Set(project.clips.filter((c) => missing.has(c.src)).map((c) => c.src))].length;
      const note = lost ? `見つからない音 ${lost} 個は無音にしました。` : '';
      if (toPC) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `${base}.wav`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        say(`${base}.wav をパソコンへ書き出しました（${buf.duration.toFixed(2)} 秒）。${note}`);
      } else {
        await fs.write(p, blob, 'audio/wav');
        say(`書き出しました: ${p}（${buf.duration.toFixed(2)} 秒、${fs.human(blob.size)}）。${note}`);
        os.notify?.({ title: 'ミックスダウンしました', text: basename(p), actionLabel: '音楽プレーヤーで開く', onAction: () => os.openFile(p, 'player') });
      }
      log('daw.mixdown', { path: p, toPC, loop: useLoop, start: +range.start.toFixed(3), end: +range.end.toFixed(3), frames: buf.length, bytes: blob.size }, 'ok');
    } catch (e) { os.msgbox({ title: TITLE, text: `書き出せませんでした。\n\n${e.message}`, icon: 'error' }); log('daw.mixdown', { path: p }, 'error: ' + e.message); }
    finally { prog.hidden = true; }
  }

  /* ---------- 録音の設定 ---------- */
  async function recSettings() {
    const est = ac ? Math.round(((ac.baseLatency || 0) + (ac.outputLatency || 0)) * 1000) : 0;
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog daw-dlg';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">録音の設定</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる" data-close=""></button></div></div>
      <div class="window-body">
        <div class="fd-row"><label for="drDev">入力(<u>I</u>):</label><select id="drDev"><option value="">いつものマイク</option></select></div>
        <div class="fd-row"><label for="drLat">マイクの遅れの補正(<u>L</u>):</label><input type="number" id="drLat" min="-500" max="1000" step="1"><span>ms</span></div>
        <p class="daw-hint">録った音が、ほかの段より遅れて聞こえるときは数を増やします（録った音を、その分だけ前へ詰めて置きます）。この機械の目安は約 ${est} ms です（音の出口と入口の遅れの合計）。次の録音から使います。</p>
        <div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button><button type="button" data-est>目安を入れる(<u>E</u>)</button></div>
      </div>`;
    document.body.append(dlg);
    const devSel = dlg.querySelector('#drDev'), lat = dlg.querySelector('#drLat');
    lat.value = project.latencyMs;
    dlg.querySelector('[data-est]').addEventListener('click', () => { lat.value = est; });
    try {
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      devSel.innerHTML += list.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'マイク ' + (i + 1))}</option>`).join('');
      devSel.value = savedDevice();
      if (devSel.selectedIndex < 0) devSel.value = '';
    } catch { /* 機器の一覧を読めない */ }
    const r = await w95.openDialog(dlg);
    const v = Math.round(+lat.value), dev = devSel.value;
    dlg.remove();
    if (r !== 'ok') return;
    try { localStorage.setItem('fos-daw-device', dev); } catch { /* 保存できない */ }
    if (Number.isFinite(v) && v !== project.latencyMs) { push(); project.latencyMs = Math.max(-500, Math.min(1000, v)); changed(); }
    say(`マイクの遅れの補正を ${project.latencyMs} ms にしました。`); log('daw.recset', { latencyMs: project.latencyMs, device: dev ? 'chosen' : 'default' }, 'ok');
  }

  /* ---------- 命令 ---------- */
  let popEl = null;
  function popup(html, x, y) {
    if (!popEl) { popEl = document.createElement('div'); popEl.className = 'menu daw-pop'; popEl.setAttribute('role', 'menu'); document.body.append(popEl); popEl.addEventListener('w95:command', (e) => run(e.detail.command, e.detail)); }
    popEl.innerHTML = html; os.sound.play('menu'); w95.popupMenu(popEl, x, y);
  }
  const cmds = {
    new: () => os.launch('daw'), open: openDialog, save, saveas: saveAs, import: importDialog, demo: makeDemo,
    mixdown: () => mixdown(false), mixpc: () => mixdown(true), close: () => win.close(),
    undo, redo, copy: copyClip, paste, split: () => splitAt(), delete: () => deleteClip(), clipprops: () => clipDialog(), relink: () => relink(),
    addtrack: addTrack, deltrack: () => deleteTrack(), arm: () => sel.track && toggleTrack(sel.track, 'arm'),
    rename: () => { const el = heads.querySelector(`[data-track="${CSS.escape(sel.track || '')}"] [data-h="name"]`); if (el) { el.focus(); el.select(); } },
    trackcolor: () => { const b = heads.querySelector(`[data-track="${CSS.escape(sel.track || '')}"] [data-h="color"]`); if (b) { const r = b.getBoundingClientRect(); colorMenu(r.left, r.bottom); } },
    play,
    // 停止: 鳴っていれば止める。止まっているときに押すと先頭へ戻る
    stop: async () => { if (transport) { await stopTransport(); say('止めました。'); } else { setPlayhead(0); setScroll(0); say('先頭へ戻しました。'); } },
    home: () => { setPlayhead(0); setScroll(0); say('先頭へ戻しました。'); }, rec: record,
    loop: () => setLoop(!project.loop.on), metro: () => setMetro(!project.metronome), snap: toggleSnap,
    loopclip: () => { const c = clipOf(sel.clip); if (!c) { os.sound.play('error'); say('クリップを選んでください。'); return; } push(); project.loop = { on: true, start: c.start, end: D.clipEnd(c) }; changed(); syncControls(); draw(); restartIfPlaying(); say(`ループの範囲を「${c.name}」に合わせました。`); },
    recset: recSettings, zoomin: () => setZoom(pps() * 1.5), zoomout: () => setZoom(pps() / 1.5), fit: fitAll,
    guide: () => { guideHidden = false; guide.hidden = false; guide.querySelector('button')?.focus(); }, guideclose: () => { guideHidden = true; guide.hidden = true; lanes.focus({ preventScroll: true }); },
    help: () => os.msgbox({ title: `${TITLE}の使い方`, icon: 'info', text: HELP }),
    about: () => os.msgbox({ title: `${TITLE}について`, icon: 'info', text: `Future OS ${TITLE} 1.0\n\n音の段を重ねて、録音・配置・ミックスします。\n再生とミックスダウンは同じ計算（Web Audio）なので、聞いたとおりの音で書き出せます。\n見本の曲の音は、このアプリが自分で合成しています。` }),
  };
  function run(c, d = {}) {
    if (c.startsWith('ruler:')) return setRuler(c.slice(6));
    if (c.startsWith('color:')) { const [, color, id] = c.split(':'); return setColor(id, color); }
    log('daw.command', { command: c }, 'ok');
    return cmds[c]?.(d);
  }
  win.body.addEventListener('w95:command', (e) => run(e.detail.command, e.detail));
  win.body.addEventListener('click', (e) => { const b = e.target.closest('button[data-a]'); if (b && !b.disabled) run(b.dataset.a); });

  /* ---------- キー ---------- */
  win.body.addEventListener('keydown', (e) => {
    if (e.isComposing || e.defaultPrevented) return;
    const t = e.target, k = e.key, low = k.length === 1 ? k.toLowerCase() : k, ctrl = e.ctrlKey || e.metaKey;
    const typing = t.matches('input[type=text], input[type=number], input:not([type]), select, textarea');
    const onRange = t.matches('input[type=range]'), onLanes = t === lanes;
    let done = true;
    if (k === 'F1') cmds.help();
    else if (ctrl && low === 's') save();
    else if (ctrl && low === 'o') openDialog();
    else if (ctrl && low === 'i') importDialog();
    else if (typing) done = false;
    else if (ctrl && low === 'z') (e.shiftKey ? redo : undo)();
    else if (ctrl && low === 'y') redo();
    else if (ctrl && low === 'c') copyClip();
    else if (ctrl && low === 'v') paste();
    else if (ctrl || e.altKey) done = false;
    else if (k === ' ' && !t.matches('button, input[type=checkbox]')) play();
    else if (k === 'F2') cmds.rename();
    else if (onRange && ['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(k)) done = false;
    else if (k === 'Home') cmds.home();
    else if (k === 'End') { setPlayhead(D.projectEnd(project)); say('最後のクリップの終わりへ動かしました。'); }
    else if (low === 'r' && !e.repeat) record();
    else if (low === 'l') setLoop(!project.loop.on);
    else if (low === 'm') setMetro(!project.metronome);
    else if (low === 'g') toggleSnap();
    else if (low === 's') splitAt();
    else if (low === 'f') fitAll();
    else if (k === '+' || k === '=' || k === ';') setZoom(pps() * 1.5);
    else if (k === '-') setZoom(pps() / 1.5);
    else if ((k === 'Delete' || k === 'Backspace') && onLanes) deleteClip();
    else if (k === 'Enter' && onLanes && sel.clip) clipDialog();
    else if (k === 'Escape' && onLanes) { if (transport) stopTransport(); else { sel.clip = null; draw(); updateSel(); } }
    else if (onLanes && (k === 'ArrowLeft' || k === 'ArrowRight')) { const dir = k === 'ArrowLeft' ? -1 : 1; if (!nudge(dir, e)) setPlayhead(D.snapTime(playhead + dir * (snapStep() || D.beatSec(project.bpm)), snapStep())); }
    else if (onLanes && (k === 'ArrowUp' || k === 'ArrowDown')) {
      const dir = k === 'ArrowUp' ? -1 : 1;
      if (!moveToTrack(dir)) { const i = project.tracks.findIndex((x) => x.id === sel.track), n = project.tracks[i + dir]; if (n) { sel = { track: n.id, clip: null }; draw(); updateSel(); say(`段「${n.name}」を選びました。`); } }
    }
    else done = false;
    if (done) e.preventDefault();
  });

  /* ---------- ドロップ ---------- */
  // デスクトップのアイコン: 音なら選んだ段の再生位置へ置き、.fdaw なら開く
  win.body.addEventListener('fos:drop-file', (e) => {
    const p = e.detail.path;
    if (isAudio(p)) importPath(p);
    else if (extname(p).toLowerCase() === '.fdaw') { if (!dirty && !path && !project.clips.length) loadProject(p); else os.openFile(p, 'daw'); }
    else { os.sound.play('error'); say(`「${basename(p)}」は音のファイルではありません。`); }
  });
  // パソコンのファイル: 落とした所の段と時刻に置く
  const main = q('[data-main]');
  main.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.stopPropagation(); main.classList.add('drop-ok'); } });
  main.addEventListener('dragleave', (e) => { if (e.target === main || !main.contains(e.relatedTarget)) main.classList.remove('drop-ok'); });
  main.addEventListener('drop', (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); e.stopPropagation(); main.classList.remove('drop-ok');
    const r = lanes.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const t = x >= 0 ? project.tracks[Math.floor(y / ROW)] : null;
    importFiles([...e.dataTransfer.files], x >= 0 ? Math.max(0, snapT(scrollX + x / pps(), e)) : playhead, t ? t.id : sel.track);
  });

  win.body.addEventListener('fos:resize', () => draw(true));
  win.cleanup = () => {
    cancelAnimationFrame(uiRaf); cancelAnimationFrame(drawReq);
    if (transport) clearInterval(transport.timer);
    if (rec) closeMic(rec);
    try { eng?.dispose(); } catch { /* 片付けの失敗で止めない */ }
    if (ac) ac.close().catch(() => {});
    popEl?.remove();
    os.events.removeEventListener('settings', onSettings);
  };
  // 確かめの道具（tools/daw-check.mjs）が中の状態を読むための入口。画面の操作には使わない
  win.el.dawDebug = {
    project: () => JSON.parse(snapshot()), sel: () => ({ ...sel }), armed: () => armed, playhead: () => position(), playing: () => !!transport, recording: () => !!rec,
    missing: () => [...missing], dirty: () => dirty, path: () => path, loaded: () => [...buffers.keys()], undoSize: () => history.size(),
    clipBox: (id) => { const c = clipOf(id); if (!c) return null; const r = clipRect(c), b = lanes.getBoundingClientRect(); return { left: b.left + r.x0, right: b.left + r.x1, top: b.top + r.y0, bottom: b.top + r.y0 + r.h }; },
    timeX: (t) => lanes.getBoundingClientRect().left + X(t), rowY: (i) => lanes.getBoundingClientRect().top + i * ROW + ROW / 2,
  };

  if (args.path) await loadProject(args.path);
  refresh();
  if (audioErr) say(`音を鳴らせません（${audioErr}）。並べることと保存はできます。`);
  else if (!args.path) say('はじめに「見本の曲を作る」か「音を読み込む」を押してください。Space で再生、R で録音です。');
  log('daw.launch', { path: args.path || null, audio: !audioErr }, 'ok');
  return win;
}
