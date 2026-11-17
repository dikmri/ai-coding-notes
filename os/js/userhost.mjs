// 作ったページ（仮想ドライブの HTML・CSS・JavaScript）を動かすための共通の部品。
// コードの作業場のプレビュー、作ったアプリの窓（apps/userapp.mjs）、ブラウザの仮想ドライブの表示が使う。
// ページは allow-same-origin を付けない sandbox の iframe で動かし、OS とは MessageChannel の専用の口だけでやり取りする。
// 口は、ページの中の橋渡し（core/workshop.mjs の RUNTIME）が arcadia-hello で頼み、送り主が受け持つ iframe かを確かめてから渡す。
import * as W from './core/workshop.mjs';

export const TEXT_RE = /\.(html?|css|m?js|json|txt|md|svg|csv|xml)$/i;
export const isText = (p) => TEXT_RE.test(p);
const SOUNDS = new Set(['click', 'select', 'op', 'pin', 'notify', 'error', 'key', 'prism', 'crystal', 'solve', 'shutter', 'chime', 'equals', 'count']);
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'];

// フォルダの中のファイルを、下の階層まで全部集める
export async function walk(fs, dir) {
  const out = [];
  for (const e of await fs.list(dir)) { if (e.kind === 'dir') out.push(...(await walk(fs, e.path))); else out.push(e.path); }
  return out.sort((a, b) => a.localeCompare(b, 'ja'));
}
const dataUrlOf = (blob) => new Promise((ok, ng) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ng(r.error); r.readAsDataURL(blob); });
// プロジェクトのファイルを読み、プレビューの文書を作る。readText を渡すと、保存していない編集中の文字を使える
export async function build(fs, root, entry, files, readText = (p) => fs.readText(p)) {
  const map = {};
  for (const p of files) map[p] = isText(p) ? { text: await readText(p) } : { dataUrl: await dataUrlOf(await fs.readBlob(p)) };
  return W.buildPreview(map, root, entry, { runtime: W.RUNTIME });
}

// 1つの iframe を受け持つ橋渡し。iframe を作り直したら attach し直す。
// o: { root, entry()（今の入口）, files()（プロジェクトのファイルの一覧）, readText(path), dataName（保存の場所の名前）,
//      onConsole(level, text, file, line), onTitle(text), onStatus(text), onNavigate(path) }
export function createHost(os, o) {
  const { fs, sound, log } = os;
  let frame = null, port = null;
  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow || e.data?.type !== 'arcadia-hello' || port) return;
    const ch = new MessageChannel();
    port = ch.port1;
    port.onmessage = (m) => handle(m.data, ch.port1);
    frame.contentWindow.postMessage({ type: 'arcadia-port' }, '*', [ch.port2]);
  }
  addEventListener('message', onMessage);
  const dataFile = () => `/アプリデータ/${String(o.dataName || 'app').replace(/[\\/:*?"<>|]/g, '_')}/data.json`;
  async function handle(d, p) {
    if (!d || typeof d.op !== 'string' || p !== port) return;
    const reply = (result) => d.id && p.postMessage({ id: d.id, result });
    const fail = (error) => d.id && p.postMessage({ id: d.id, error });
    const a = d.args || {};
    try {
      switch (d.op) {
        case 'console': o.onConsole?.(LEVELS.includes(a.level) ? a.level : 'log', String(a.text ?? '').slice(0, 4000), a.file, a.line); return;
        case 'read': {
          const path = W.resolveIn(o.root, o.entry(), String(a.path || ''));
          if (!path || !o.files().includes(path)) return fail(`プロジェクトの中に「${a.path}」がありません`);
          if (isText(path)) return reply({ text: await o.readText(path), type: W.mimeOf(path) });
          const buf = new Uint8Array(await (await fs.readBlob(path)).arrayBuffer());
          let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          return reply({ base64: btoa(s), type: W.mimeOf(path) });
        }
        case 'navigate': {
          const path = W.resolveIn(o.root, o.entry(), String(a.href || ''));
          if (path && /\.html?$/i.test(path) && o.files().includes(path)) o.onNavigate?.(path);
          else o.onConsole?.('warn', `プロジェクトの中のページではありません: ${a.href}`);
          return;
        }
        case 'link': if (/^https?:\/\//i.test(a.href || '')) { os.launch('browser', { url: a.href }); o.onConsole?.('info', `OS のブラウザで開きました: ${a.href}`); } return;
        case 'setTitle': o.onTitle?.(String(a.text).slice(0, 80)); return reply(true);
        case 'setStatus': o.onStatus?.(String(a.text).slice(0, 200)); return reply(true);
        case 'sound': if (SOUNDS.has(a.name)) sound.play(a.name); return reply(true);
        case 'notify': os.notify?.({ title: String(a.title).slice(0, 60) || String(o.dataName || ''), text: String(a.text).slice(0, 200) }); return reply(true);
        case 'loadData': { let all = {}; try { all = await fs.readJSON(dataFile()); } catch { /* まだない */ } return reply(all[a.key] ?? null); }
        case 'saveData': {
          let all = {}; try { all = await fs.readJSON(dataFile()); } catch { /* まだない */ }
          all[a.key] = a.value; const json = JSON.stringify(all);
          if (json.length > 1e6) return fail('保存できるのは 1MB までです');
          await fs.write(dataFile(), json, 'application/json'); return reply(true);
        }
        default: return fail(`知らない操作です: ${d.op}`);
      }
    } catch (err) { log('userhost.op', { op: d.op }, 'error: ' + err.message); fail(err.message); }
  }
  return {
    attach(f) { frame = f; port = null; },
    dispose() { removeEventListener('message', onMessage); frame = null; port = null; },
  };
}

/* ---------- 作ったアプリの登録（/システム/登録アプリ.json） ---------- */
export const REGISTRY = '/システム/登録アプリ.json';
export async function loadRegistry(fs) { try { const r = await fs.readJSON(REGISTRY); return Array.isArray(r) ? r.filter((x) => x && x.id && x.root) : []; } catch { return []; } }
export async function saveRegistry(fs, list) { await fs.write(REGISTRY, JSON.stringify(list, null, 1), 'application/json'); }
