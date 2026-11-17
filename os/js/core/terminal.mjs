// 端末の計算: 字句の分け方（引用符と > >>）、パスの解決、補完、コマンドの実行。
// 仮想ドライブとアプリの起動は env で受け取るので、テストでは差し替えられる（tests/os-terminal.test.mjs）。
// 結果は「行」の並びで返す。1行は「切れ端」の並びで、切れ端は { t: 文字 } か、押せるパス { t, path, dir }、誤り { t, err: true }。
import { normalize, basename, dirname } from './path.mjs';

export const COMMANDS = {
  help: ['help [コマンド]', 'コマンドの一覧と使い方を出します。'],
  ls: ['ls [-l] [場所]', 'フォルダの中身を並べます。-l で大きさと更新日時も出します。'],
  cd: ['cd [場所]', '今のフォルダを変えます。場所を書かないと、ドライブの一番上へ戻ります。'],
  pwd: ['pwd', '今のフォルダを出します。'],
  cat: ['cat ファイル', '文書の中身を出します。'],
  echo: ['echo 文字 [> ファイル]', '文字を出します。> で上書き、>> で書き足します。'],
  mkdir: ['mkdir フォルダ', 'フォルダを作ります。'],
  touch: ['touch ファイル', '空の文書を作ります（もうあれば、そのままにします）。'],
  rm: ['rm 場所', 'ファイルやフォルダをゴミ箱へ移します。'],
  mv: ['mv 元 先', '動かすか、名前を変えます。先がフォルダなら、その中へ動かします。'],
  cp: ['cp 元 先', '写しを作ります。先がフォルダなら、その中へ写します。'],
  find: ['find [場所] 名前', '名前で探します。* と ? を使えます。'],
  tree: ['tree [場所]', 'フォルダの中を木の形で並べます。'],
  open: ['open ファイル', 'ファイルを、合うアプリで開きます。'],
  run: ['run [アプリ]', 'アプリを起動します。書かないと、起動できるアプリを並べます。'],
  date: ['date', '今の日付と時刻を出します。'],
  calc: ['calc 式', '式を計算します（電卓と同じ計算）。'],
  history: ['history', '打ったコマンドの履歴を出します。'],
  clear: ['clear', '画面を消します（Ctrl+L でも消せます）。'],
};
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const pad = (n) => String(n).padStart(2, '0');

/* ---------- 字句 ---------- */
export function tokenize(line) {
  const args = [];
  let redirect = null, cur = '', has = false, quote = null, pendingRedirect = null;
  const push = () => {
    if (!has) return;
    if (pendingRedirect) { redirect = { mode: pendingRedirect, path: cur }; pendingRedirect = null; } else args.push(cur);
    cur = ''; has = false;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; else cur += c; continue; }
    if (c === '"' || c === "'") { quote = c; has = true; continue; }
    if (c === ' ' || c === '\t' || c === '　') { push(); continue; }
    if (c === '>') { push(); pendingRedirect = line[i + 1] === '>' ? '>>' : '>'; if (pendingRedirect === '>>') i++; continue; }
    cur += c; has = true;
  }
  if (quote) return { error: '引用符が閉じていません。' };
  push();
  if (pendingRedirect) return { error: '書き出す先のファイル名がありません。' };
  return { args, redirect };
}

/* ---------- パス ---------- */
export function resolvePath(cwd, p) {
  if (!p || p === '~') return '/';
  if (p.startsWith('~/')) p = p.slice(1);
  return normalize(p.startsWith('/') ? p : (cwd === '/' ? '' : cwd) + '/' + p);
}

/* ---------- 補完 ---------- */
// partial で始まる候補が1つなら、その名前。いくつかなら共通の頭まで延ばし、候補を返す
export function completeWord(partial, candidates) {
  const hit = candidates.filter((c) => c.startsWith(partial)).sort();
  if (hit.length === 0) return { text: partial, options: [] };
  if (hit.length === 1) return { text: hit[0], options: [] };
  let p = hit[0];
  for (const h of hit) while (!h.startsWith(p)) p = p.slice(0, -1);
  return { text: p.length > partial.length ? p : partial, options: hit };
}

export function globToRegExp(g) {
  return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
}

/* ---------- 実行 ---------- */
const line = (...segs) => segs.map((s) => (typeof s === 'string' ? { t: s } : s));
const err = (t) => [{ t, err: true }];
const pathSeg = (e, label = e.name + (e.kind === 'dir' ? '/' : '')) => ({ t: label, path: e.path, dir: e.kind === 'dir' });
const human = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtDate = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}） ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export async function run(input, env) {
  const t = tokenize(input.trim());
  if (t.error) return { lines: [err(t.error)], cwd: env.cwd };
  const [cmd, ...a] = t.args;
  if (!cmd) return { lines: [], cwd: env.cwd };
  const res = { lines: [], cwd: env.cwd, clear: false };
  const out = (...segs) => res.lines.push(line(...segs));
  const fail = (s) => res.lines.push(err(s));
  const fs = env.fs, P = (p) => resolvePath(res.cwd, p);
  const mustExist = async (p) => { const s = await fs.stat(p); if (!s) fail(`そのファイルやフォルダはありません: ${p}`); return s; };
  // 先がフォルダなら、その中へ（mv と cp）
  const target = async (src, dst) => { const s = await fs.stat(dst); return s && s.kind === 'dir' ? normalize(dst + '/' + basename(src)) : dst; };
  try {
    switch (cmd) {
      case 'help': {
        if (a[0] && COMMANDS[a[0]]) { out(COMMANDS[a[0]][0]); out('  ' + COMMANDS[a[0]][1]); break; }
        for (const [k, [u, d]] of Object.entries(COMMANDS)) out(`${k.padEnd(8)} ${d}`);
        out('使い方は「help コマンド」で出ます。Tab で名前を補完、↑↓ で履歴、Ctrl+L で画面を消します。');
        break;
      }
      case 'pwd': out(res.cwd); break;
      case 'cd': {
        const p = P(a[0]), s = await fs.stat(p);
        if (!s || s.kind !== 'dir') fail(`そのフォルダがありません: ${a[0]}`); else res.cwd = p;
        break;
      }
      case 'ls': {
        // 場所を書かないときは今のフォルダ（resolvePath は空のパスを一番上と読むので '.' を渡す）
        const long = a.includes('-l'), where = P(a.find((x) => x !== '-l') ?? '.');
        const s = await mustExist(where); if (!s) break;
        const list = s.kind === 'dir' ? await fs.list(where) : [s];
        for (const e of list) {
          if (!long) { out(pathSeg(e)); continue; }
          const d = e.mtime ? new Date(e.mtime) : null;
          out(`${e.kind === 'dir' ? 'フォルダ' : 'ファイル'}  ${(e.kind === 'dir' ? '' : human(e.size)).padStart(9)}  ${d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '                '}  `, pathSeg(e));
        }
        break;
      }
      case 'cat': {
        if (!a.length) { fail('読むファイルを書いてください（例: cat メモ.txt）。'); break; }
        for (const f of a) { const s = await mustExist(P(f)); if (!s) continue; if (s.kind === 'dir') { fail(`フォルダは読めません: ${f}`); continue; } for (const l of (await fs.readText(P(f))).replace(/\n$/, '').split('\n')) out(l); }
        break;
      }
      case 'echo': out(a.join(' ')); break;
      case 'mkdir': for (const d of a) { if (await fs.stat(P(d))) fail(`もうあります: ${d}`); else await fs.mkdir(P(d)); } break;
      case 'touch': for (const f of a) if (!(await fs.stat(P(f)))) await fs.write(P(f), ''); break;
      case 'rm': {
        for (const f of a) {
          const p = P(f);
          if (p === '/' || p === fs.TRASH) { fail(`この場所は消せません: ${f}`); continue; }
          if (!(await mustExist(p))) continue;
          await fs.trash(p); out(`「${basename(p)}」をゴミ箱へ移しました。`);
        }
        break;
      }
      case 'mv': case 'cp': {
        if (a.length !== 2) { fail(`使い方: ${COMMANDS[cmd][0]}`); break; }
        const src = P(a[0]); if (!(await mustExist(src))) break;
        const dst = await target(src, P(a[1]));
        await (cmd === 'mv' ? fs.move(src, dst) : fs.copy(src, dst));
        break;
      }
      case 'find': {
        const [dirArg, pat] = a.length >= 2 ? a : [null, a[0]];
        if (!pat) { fail('探す名前を書いてください（例: find *.txt）。'); break; }
        const dir = P(dirArg ?? '.'), re = /[*?]/.test(pat) ? globToRegExp(pat) : null;
        let n = 0;
        for (const p of await fs.walk(dir)) {
          const name = basename(p);
          if (re ? re.test(name) : name.toLowerCase().includes(pat.toLowerCase())) { const s = await fs.stat(p); out(pathSeg({ ...s, path: p }, p)); n++; }
        }
        if (!n) out(`「${pat}」に合うものは見つかりませんでした。`);
        break;
      }
      case 'tree': {
        const root = P(a[0] ?? '.'), s = await mustExist(root); if (!s) break;
        out(pathSeg({ ...s, path: root, kind: 'dir' }, root));
        const walk = async (dir, prefix, depth) => {
          const list = await fs.list(dir);
          for (let i = 0; i < list.length; i++) {
            const e = list[i], last = i === list.length - 1;
            out(prefix + (last ? '└─ ' : '├─ '), pathSeg(e, e.name));
            if (e.kind === 'dir' && depth < 6) await walk(e.path, prefix + (last ? '   ' : '│  '), depth + 1);
          }
        };
        if (s.kind === 'dir') await walk(root, '', 1);
        break;
      }
      case 'open': {
        if (!a.length) { fail('開くファイルを書いてください（例: open 画像/海.png）。'); break; }
        for (const f of a) if (await mustExist(P(f))) { await env.open(P(f)); out(`「${basename(P(f))}」を開きました。`); }
        break;
      }
      case 'run': {
        if (!a.length) { for (const [id, name] of Object.entries(env.apps)) out(`${id.padEnd(10)} ${name}`); break; }
        const q = a.join(' ');
        const id = Object.keys(env.apps).find((k) => k === q) || Object.keys(env.apps).find((k) => env.apps[k] === q) || Object.keys(env.apps).find((k) => env.apps[k].includes(q));
        if (!id) { fail(`そのアプリはありません: ${q}（run だけを打つと一覧が出ます）`); break; }
        await env.launch(id); out(`「${env.apps[id]}」を起動しました。`);
        break;
      }
      case 'date': out(fmtDate(env.now())); break;
      case 'calc': {
        const r = env.evaluate(a.join(''));
        if (r.ok) out(String(r.value)); else fail(`計算できません: ${a.join(' ')}`);
        break;
      }
      case 'history': env.history.forEach((h, i) => out(`${i + 1}  ${h}`)); break;
      case 'clear': res.clear = true; break;
      default: fail(`そのコマンドはありません: ${cmd}（help で一覧を出せます）`);
    }
  } catch (e) { fail(e.message); }
  // > と >> は、出力を画面に出さずにファイルへ書く（誤りの行は画面に残す）
  if (t.redirect) {
    const p = P(t.redirect.path), body = res.lines.filter((l) => !l[0]?.err).map((l) => l.map((s) => s.t).join('')).join('\n');
    try {
      const old = t.redirect.mode === '>>' && (await fs.stat(p)) ? await fs.readText(p) : '';
      await fs.write(p, old + (old && !old.endsWith('\n') ? '\n' : '') + body + (body ? '\n' : ''));
      res.lines = res.lines.filter((l) => l[0]?.err);
    } catch (e) { res.lines.push(err(e.message)); }
  }
  return res;
}

// 今の行の、補完する言葉の位置と種類（最初の言葉ならコマンド、それより後ならパス）
export function wordAt(text) {
  // 閉じていない引用符があれば、その引用符から後ろを1つの言葉にする（空白を含む名前の途中で Tab を押したとき）
  let open = -1, quote = null;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (quote) { if (c === quote) { quote = null; open = -1; } } else if (c === '"' || c === "'") { quote = c; open = i; } }
  if (quote && open >= 0) return { word: text.slice(open), start: open, isCommand: text.slice(0, open).trim() === '' };
  const m = /(?:^|\s)(\S*)$/.exec(text);
  const word = m ? m[1] : '';
  const start = text.length - word.length;
  return { word, start, isCommand: text.slice(0, start).trim() === '' };
}
export { dirname, basename };
