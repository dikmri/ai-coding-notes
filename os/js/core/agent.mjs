// AI アシスタント（イコちゃん）の計算: OS を操作する道具の一覧と引数の確かめ、確かめが要る操作の見分け、
// 窓の中の部品の一覧の文、歩く時間、秘密を伏せる、道具の説明の文。画面には触らない（テストは tests/os-agent.test.mjs）。
// 道具は、MCP の橋渡し（Claude Desktop など）と API キー（OS の中の対話の窓）の両方が使う同じ一式。

const s = (description) => ({ type: 'string', description });
const n = (description) => ({ type: 'number', description });
const b = (description) => ({ type: 'boolean', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

export const TOOLS = [
  { name: 'get_desktop_state', description: '開いている窓の一覧（windowId・アプリ・題名・使っている窓か）と、開けるアプリの一覧（appId と名前）を返す。まず最初にこれで画面のようすを確かめる。', params: obj({}) },
  { name: 'open_app', description: 'アシスタントがスタート メニューからアプリを開く。path を渡すと、そのファイルやフォルダを開く。開いた窓の windowId を返す。', params: obj({ appId: s('アプリの名前（get_desktop_state の apps の appId）'), path: s('開くファイルやフォルダの仮想ドライブのパス（なくてよい）') }, ['appId']) },
  { name: 'manage_window', description: '窓を手前に出す・閉じる・最小化・最大化・元の大きさに戻す・動かす・大きさを変える。', params: obj({ windowId: s('窓の windowId'), action: { type: 'string', enum: ['focus', 'close', 'minimize', 'maximize', 'restore', 'move', 'resize'], description: 'すること' }, x: n('move の左の位置（画素）'), y: n('move の上の位置（画素）'), w: n('resize の幅（画素）'), h: n('resize の高さ（画素）') }, ['windowId', 'action']) },
  { name: 'inspect_window', description: '窓の中の部品（ボタン・入力欄・選択の欄・タブ・文など）を、参照番号（ref）つきの一覧で読む。押す・打つ前に必ずこれで ref を確かめる。windowId を省くと使っている窓。', params: obj({ windowId: s('窓の windowId（なくてよい）') }) },
  { name: 'point_and_speak', description: 'アシスタントが部品を指さして、吹き出しで話す。ref か guideId を省くと話すだけ。利用者への説明に使う。', params: obj({ text: s('話す文（です・ます、短く）'), windowId: s('窓の windowId'), ref: s('部品の参照番号'), guideId: s('部品の案内用の名前（data-guide）') }, ['text']) },
  { name: 'click_element', description: '参照番号の部品を、アシスタントが歩いて行って押す。', params: obj({ windowId: s('窓の windowId'), ref: s('部品の参照番号'), double: b('ダブルクリックにするか') }, ['windowId', 'ref']) },
  { name: 'input_text', description: '参照番号の入力欄やエディタに文字を入れる（mode が append なら後ろに足す。ふだんは置き換える）。選択の欄なら選ぶ値。submit が true なら最後に Enter を押す。', params: obj({ windowId: s('窓の windowId'), ref: s('部品の参照番号'), value: s('入れる文字や選ぶ値'), mode: { type: 'string', enum: ['replace', 'append'], description: '置き換える（replace）か、後ろに足す（append）か' }, submit: b('最後に Enter を押すか') }, ['windowId', 'ref', 'value']) },
  { name: 'press_keys', description: '使っている窓でキーを押す。例: "Control+s"、"Enter"、"Escape"。空白で区切ると順に押す。', params: obj({ keys: s('押すキー') }, ['keys']) },
  { name: 'list_files', description: '仮想ドライブのフォルダの中の一覧を返す。', params: obj({ path: s('フォルダのパス（例: /ドキュメント）') }, ['path']) },
  { name: 'read_file', description: '仮想ドライブの文字のファイルを読む。文字でないファイルは種類と大きさだけを返す。', params: obj({ path: s('ファイルのパス') }, ['path']) },
  { name: 'write_file', description: '仮想ドライブに文字のファイルを書く（なければ作る）。今ある別の中身を書き換えるときは、利用者に確かめる。', params: obj({ path: s('ファイルのパス'), content: s('書く中身') }, ['path', 'content']) },
  { name: 'delete_file', description: '仮想ドライブのファイルやフォルダをゴミ箱へ移す（permanent が true なら完全に消す）。必ず利用者に確かめる。', params: obj({ path: s('パス'), permanent: b('完全に消すか') }, ['path']) },
  { name: 'open_file', description: '仮想ドライブのファイルを、決まったアプリ（appId を渡せばそのアプリ）で開く。', params: obj({ path: s('ファイルのパス'), appId: s('開くアプリ（なくてよい）') }, ['path']) },
  { name: 'open_url', description: 'OS のウェブブラウザで住所を開く。外のサイト（http・https）は、利用者に確かめてから開く。', params: obj({ url: s('住所（https://… や arcadia://start）') }, ['url']) },
];
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
export const toolNames = () => TOOLS.map((t) => t.name);

// 引数の確かめ（足りない引数、型、決まった値）
export function validateArgs(name, args = {}) {
  const t = BY_NAME.get(name);
  if (!t) return { ok: false, error: `知らない道具です: ${name}` };
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: '引数は名前と値の組で渡してください' };
  for (const k of t.params.required || []) if (args[k] === undefined || args[k] === null || args[k] === '') return { ok: false, error: `${k} がありません` };
  for (const [k, v] of Object.entries(args)) {
    const p = t.params.properties[k];
    if (!p) continue;
    if (p.type === 'number' ? typeof v !== 'number' || !Number.isFinite(v) : typeof v !== p.type) return { ok: false, error: `${k} は ${p.type} で渡してください` };
    if (p.enum && !p.enum.includes(v)) return { ok: false, error: `${k} は ${p.enum.join('・')} のどれかです` };
  }
  return { ok: true };
}

// 確かめが要る操作。ctx.exists: 書く先のファイルが今あるか。要らなければ null
export function confirmNeeded(name, args = {}, ctx = {}) {
  if (name === 'delete_file') {
    return args.permanent
      ? { kind: 'delete', text: `「${args.path}」を完全に消します。元に戻せません。` }
      : { kind: 'delete', text: `「${args.path}」をゴミ箱へ移します。ゴミ箱から元に戻せます。` };
  }
  if (name === 'write_file' && ctx.exists) return { kind: 'overwrite', text: `「${args.path}」を、今の中身ごと書き換えます。` };
  if (name === 'open_url' && /^https?:\/\//i.test(String(args.url || ''))) return { kind: 'external', text: `外のサイト「${args.url}」を開きます。住所に含まれる文字は、そのサイトに届きます。` };
  return null;
}

/* ---------- 窓の中の部品の一覧の文 ---------- */
const ROLE_JA = { button: 'ボタン', textbox: '入力欄', checkbox: 'チェックボックス', radio: '選択肢', combobox: '選択の欄', option: '項目', tab: 'タブ', link: 'リンク', menuitem: 'メニューの項目', slider: 'つまみ', gridcell: 'マス', heading: '見出し', text: '文', img: '絵', listitem: '一覧の項目', canvas: '描く面', region: '領域', window: '窓', spinbutton: '数の欄', listbox: '一覧' };
const cut = (t, max) => { const v = String(t ?? '').replace(/\s+/g, ' ').trim(); return v.length > max ? v.slice(0, max - 1) + '…' : v; };
// items: [{ ref, role, name, value, secret, disabled, checked, selected, expanded, depth }]
export function formatSnapshot(items) {
  return items.map((it) => {
    let line = `${'  '.repeat(it.depth || 0)}[${it.ref}] ${ROLE_JA[it.role] || it.role}「${cut(it.name, 120)}」`;
    if (it.secret) line += '= （伏せてあります）';
    else if (it.value !== undefined && it.value !== null && it.value !== '') line += `= "${cut(it.value, 80)}"`;
    const st = [];
    if (it.disabled) st.push('押せない');
    if (it.checked === true) st.push('入'); else if (it.checked === false) st.push('切');
    if (it.selected) st.push('選んでいる');
    if (it.expanded === true) st.push('開いている');
    return st.length ? `${line}（${st.join('、')}）` : line;
  }).join('\n');
}

// 歩く時間（ミリ秒）。normal は歩いて見せる、fast はさっと飛ぶ、instant は動きを省く
export function walkMs(from, to, speed = 'normal') {
  const d = Math.hypot((to.x ?? 0) - (from.x ?? 0), (to.y ?? 0) - (from.y ?? 0));
  if (d < 1 || speed === 'instant') return 0;
  if (speed === 'fast') return Math.round(Math.min(500, 120 + d * 0.15));
  return Math.round(Math.min(1600, 250 + d * 0.45));
}

// API キーらしい文字列を伏せる（記録や画面に出す前に通す）
export function maskSecrets(text) {
  return String(text)
    .replace(/(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{8,}/g, '（伏せた文字）')
    .replace(/(?<![A-Za-z0-9])sk-(?:proj-)?[A-Za-z0-9_-]{16,}/g, '（伏せた文字）')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '（伏せた文字）');
}

// 道具の呼び出しを、吹き出しと記録に出す短い文にする。info: { appName, targetName }
export function describeCall(name, a = {}, info = {}) {
  const tgt = info.targetName || '部品';
  switch (name) {
    case 'get_desktop_state': return '画面のようすを確かめます。';
    case 'open_app': return `「${info.appName || a.appId}」を開きます。`;
    case 'manage_window': return { focus: '窓を手前に出します。', close: '窓を閉じます。', minimize: '窓をしまいます。', maximize: '窓を大きくします。', restore: '窓を元の大きさに戻します。', move: '窓を動かします。', resize: '窓の大きさを変えます。' }[a.action] || '窓を操作します。';
    case 'inspect_window': return '窓の中を読みます。';
    case 'point_and_speak': return String(a.text || '');
    case 'click_element': return `「${tgt}」を押します。`;
    case 'input_text': return `「${info.targetName || 'その欄'}」に「${cut(a.value, 30)}」と入れます。`;
    case 'press_keys': return `${a.keys} を押します。`;
    case 'list_files': return `「${a.path}」の中を見ます。`;
    case 'read_file': return `「${a.path}」を読みます。`;
    case 'write_file': return `「${a.path}」に書きます。`;
    case 'delete_file': return a.permanent ? `「${a.path}」を完全に消します。` : `「${a.path}」をゴミ箱へ移します。`;
    case 'open_file': return `「${a.path}」を開きます。`;
    case 'open_url': return `「${a.url}」を開きます。`;
    default: return `${name} を使います。`;
  }
}
