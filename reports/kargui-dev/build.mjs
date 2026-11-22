// kargui 開発レポートの図・表・グラフを、data/ の数と img/ の画像から作り、各ページの <!-- gen:名前 --> の印の間へ入れる。
// 使い方: node reports/kargui-dev/build.mjs
// 章を足した・数を測り直した・画像を撮り直したら走らせる。画像の幅と高さは WebP のファイルの頭から読む。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(DIR, p), "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** WebP（VP8L・VP8X・VP8）の幅と高さ */
function webpSize(path) {
  const b = readFileSync(path);
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8L") {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  if (kind === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw new Error(`${path}: WebP の頭が読めない (${kind})`);
}

/** 明るい方と暗い方の画像（base-light.webp と base-dark.webp）。暗い方が無ければ明るい方だけ */
function picture(base, alt, { priority = false } = {}) {
  const light = `img/${base}-light.webp`;
  const dark = `img/${base}-dark.webp`;
  if (!existsSync(join(DIR, light))) throw new Error(`${light} が無い`);
  const [w, h] = webpSize(join(DIR, light));
  const load = priority ? ` fetchpriority="high"` : ` loading="lazy"`;
  const source = existsSync(join(DIR, dark)) ? `<source media="(prefers-color-scheme: dark)" srcset="${dark}">` : "";
  return `<picture>${source}<img src="${light}" alt="${esc(alt)}" width="${w}" height="${h}"${load} decoding="async"></picture>`;
}

function figure(base, alt, caption, opts = {}) {
  return `<figure class="shot${opts.flat ? " flat" : ""}">${picture(base, alt, opts)}<figcaption>${caption}</figcaption></figure>`;
}

/** 棒グラフ。rows: [{name, v（色の札）, value, label}]。max を省くと一番大きい値 */
function bars(id, title, hint, rows, max) {
  const top = max ?? Math.max(...rows.map((r) => r.value));
  const body = rows
    .map((r) => {
      const w = top > 0 ? Math.max(0, Math.min(100, (r.value / top) * 100)) : 0;
      return `      <div class="bar-row" data-v="${r.v}"><span class="bar-name">${esc(r.name)}</span><span class="bar-track"><span class="bar" style="--w: ${w.toFixed(1)}%"></span><span class="bar-val">${esc(r.label)}</span></span></div>`;
    })
    .join("\n");
  return `<figure class="bars" id="${id}">
    <figcaption><span class="bars-title">${esc(title)}</span>${hint ? `<span class="bars-hint">${esc(hint)}</span>` : ""}</figcaption>
    <div class="bar-rows">
${body}
    </div>
  </figure>`;
}

const fmt = (n) => n.toLocaleString("ja-JP");
const V = read("data/versions.json");
const versions = V.versions;
const vrows = (key, unit, digits = 0) =>
  versions.map((v) => ({ name: v.name, v: v.key, value: v[key], label: `${digits ? v[key].toFixed(digits) : fmt(v[key])}${unit}` }));

function versionsTable() {
  const rows = [
    ["コードの行数（crates/kargui/src）", "loc", (x) => fmt(x)],
    ["公開の項目（型・関数・欄など）", "api", (x) => fmt(x)],
    ["試験（#[test] の数）", "tests", (x) => fmt(x)],
    ["説明の動く例（doctest）", "doctests", (x) => fmt(x)],
    ["ガイドの章", "guide", (x) => `${x} 章`],
    ["部品の写真", "shots", (x) => `${x} 枚`],
    ["見本のアプリ", "examples", (x) => `${x} 本`],
    ["起動（表示まで、中央値）", "startup", (x) => `${x} ms`],
    ["1 万件を入れた起動", "items10k", (x) => `${x} ms`],
    ["メモリ（起動直後）", "mem", (x) => `${x.toFixed(1)} MB`],
    ["メモリ（1 万件）", "mem10k", (x) => `${x.toFixed(1)} MB`],
    ["実行ファイル（タスク帳）", "exe", (x) => `${x.toFixed(2)} MB`],
  ];
  const head = versions.map((v) => `<th scope="col" class="num"><span class="ver" data-v="${v.key}">${esc(v.name)}</span></th>`).join("");
  const body = rows
    .map(([label, key, f]) => `<tr><th scope="row">${label}</th>${versions.map((v) => `<td class="num" data-label="${esc(v.name)}">${f(v[key])}</td>`).join("")}</tr>`)
    .join("\n        ");
  return `<div class="table-wrap stack-table" tabindex="0" role="region" aria-labelledby="t-versions">
    <table>
      <caption id="t-versions">版ごとの数（${esc(V.measured)}）</caption>
      <thead><tr><th scope="col">項目</th>${head}</tr></thead>
      <tbody>
        ${body}
      </tbody>
    </table>
  </div>`;
}

function versionsBars() {
  return `<div class="pair">
  ${bars("c-loc", "コードの行数", "crates/kargui/src", vrows("loc", " 行"))}
  ${bars("c-api", "公開の項目", "rustdoc の JSON で数えた", vrows("api", " 個"))}
  ${bars("c-startup", "起動（ミリ秒）", "短いほど速い。同じ時に往復で測った中央値", vrows("startup", " ms"))}
  ${bars("c-mem", "メモリ（1 万件、MB）", "少ないほど軽い", vrows("mem10k", " MB", 1))}
</div>`;
}

function timeline() {
  const { commits } = read("data/commits.json");
  // 日本時間の 2 時間ごとに数える
  const jst = (t) => new Date((t + 9 * 3600) * 1000);
  const bin = (t) => {
    const d = jst(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() - (d.getUTCHours() % 2));
  };
  const first = bin(commits[0].t);
  const last = bin(commits.at(-1).t);
  const counts = new Map();
  for (const c of commits) counts.set(bin(c.t), (counts.get(bin(c.t)) ?? 0) + 1);
  const max = Math.max(...counts.values());
  const marks = { "11/21 22時": "0.1.0", "11/22 10時": "0.2.0" };
  const rows = [];
  for (let k = first; k <= last; k += 2 * 3600 * 1000) {
    const d = new Date(k);
    const name = `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.getUTCHours()}時`;
    const n = counts.get(k) ?? 0;
    const mark = marks[name] ? ` ・ ${marks[name]}` : "";
    rows.push(`    <div class="tl-row"><span class="tl-name">${name}</span><span class="tl-track"><span class="tl-bar" style="--w: ${((n / max) * 100).toFixed(1)}%"></span><span class="bar-val">${n} 件${mark}</span></span></div>`);
  }
  return `<figure>
  <div class="timeline" role="img" aria-label="2 時間ごとの commit の数。${commits.length} 件">
${rows.join("\n")}
  </div>
  <figcaption>2 時間ごとの commit の数（日本時間）。全部で ${commits.length} 件。0.1.0 と 0.2.0 の準備をした時間に印を付けた。</figcaption>
</figure>`;
}

const CHAPTERS = [
  { href: "01-frame.html", no: "第 1 章", title: "1 フレームの中で起きること", text: "入力が届いてから画面に出るまで。ビューを何回も呼ぶ理由、前のフレームの配置で当たりを決める理由。", thumb: "shots/list" },
  { href: "02-widgets.html", no: "第 2 章", title: "0.1 から 0.2 へ、部品をそろえた順番", text: "13 のフレームワークに学んで足す部品を決め、土台から作った。部品の写真と、足すのにかかった時間。", thumb: "shots/more_widgets" },
  { href: "03-apps.html", no: "第 3 章", title: "ふつうのアプリで見つけたこと", text: "メモ帳・家計簿・ファイルの閲覧を書いて見つかった不足と、起動が 14 ms 遅くなった理由。", thumb: "apps/expenses" },
  { href: "04-release.html", no: "第 4 章", title: "CI を初めて回した日と 0.2.0", text: "手元で通る試験が CI で落ちた 2 つの理由と、使い方を壊す変更を調べてから版を出す手順。", thumb: "shots/dialog" },
  { href: "05-drag-and-drop.html", no: "第 5 章", title: "ドラッグ＆ドロップ", text: "型で受け取る物を決める書き方、エクスプローラーから落とすファイル、本物の窓で見つかった不具合、並べ方の決まり。", thumb: "shots/drag_and_drop" },
  { href: "06-motion.html", no: "第 6 章", title: "動き（アニメーション）", text: "数を 1 つ返す書き方、OS の「アニメーション効果」に従う作り、試験台で動きを切る理由、起動のたびに 6 フレーム描いていた不具合。", thumb: "motion/open-060" },
];

function chapters() {
  return CHAPTERS.map(
    (c) => `<li><a href="${c.href}">${picture(c.thumb, "")}<p class="ch-no">${c.no}</p><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></a></li>`,
  ).join("\n    ");
}

function gallery() {
  const { shots } = read("data/gallery.json");
  return shots.map((s) => `<figure>${picture(`shots/${s.name}`, s.alt)}<figcaption>${s.caption}</figcaption></figure>`).join("\n    ");
}

const blocks = {
  "index.html": {
    hero: () => figure("apps/expenses", "家計簿の見本。入力の格子、表、棒グラフが並ぶ", "kargui だけで書いた家計簿（<code>examples/expenses</code>）。本物の窓のスクリーンショット。", { priority: true }),
    chapters,
    "versions-table": versionsTable,
    "versions-bars": versionsBars,
    timeline,
  },
  "02-widgets.html": {
    gallery,
    versions: () => `<div class="pair">
  ${bars("c-loc2", "コードの行数", "crates/kargui/src", vrows("loc", " 行"))}
  ${bars("c-api2", "公開の項目", "rustdoc の JSON で数えた", vrows("api", " 個"))}
  ${bars("c-tests2", "試験の数", "#[test] の数", vrows("tests", " 個"))}
  ${bars("c-guide2", "ガイドの章", "日本語が元・英語は訳", vrows("guide", " 章"))}
</div>`,
  },
  "03-apps.html": {
    apps: () => `<div class="pair">
  ${figure("apps/notepad", "メモ帳の見本。メニューバーと複数行の入力欄", "メモ帳（<code>examples/notepad</code>）")}
  ${figure("apps/files", "ファイルの閲覧の見本。左にフォルダーの木、右にファイルの表", "ファイルの閲覧（<code>examples/files</code>）")}
</div>
${figure("apps/expenses", "家計簿の見本", "家計簿（<code>examples/expenses</code>）。棒グラフは自由に描く面で描いている。")}`,
    shell32: () =>
      bars("c-shell32", "ファイルのダイアログを足した時の起動（ミリ秒）", "その時に測った中央値。タスク帳はダイアログを使わない", [
        { name: "足す前", v: "v010", value: 42, label: "42 ms" },
        { name: "足した直後", v: "now", value: 56, label: "56 ms（+14）" },
        { name: "遅らせた後", v: "v020", value: 44, label: "44 ms" },
      ]),
  },
  "04-release.html": {
    apicount: () =>
      bars("c-api4", "公開の項目の数", "rustdoc の JSON で数えた。消えた物は 0", vrows("api", " 個")),
  },
  "05-drag-and-drop.html": {
    ddshot: () => figure("shots/drag_and_drop", "To do の列から Done の列へカードを引っ張っている途中。Done の列が囲まれ、カードの影がポインターについている", "引っ張っている途中。受け取る「Done」の列を主の色で囲み、元のカードの名前を書いた箱がポインターについて動く。", { flat: true }),
    fill: () => `<div class="pair">
  ${bars("c-fill-old", "直す前: 3 つの Fill(1.0) の幅", "中身 250・80・80、全体 900", [
    { name: "1 列目", v: "old", value: 413, label: "413" },
    { name: "2 列目", v: "old", value: 243, label: "243" },
    { name: "3 列目", v: "old", value: 243, label: "243" },
  ], 420)}
  ${bars("c-fill-new", "直した後: 3 つの Fill(1.0) の幅", "同じ重みなら同じ幅", [
    { name: "1 列目", v: "new", value: 300, label: "300" },
    { name: "2 列目", v: "new", value: 300, label: "300" },
    { name: "3 列目", v: "new", value: 300, label: "300" },
  ], 420)}
</div>
<p class="small">並べ方の試験と同じ数字です。直す前の値は、試験を先に書いて今の作りで走らせた時に出た値です。</p>`,
    board: () => figure("apps/board", "カードの板の見本。3 つの列にカードが並び、どのカードにも「移す」ボタンがある", "カードの板（<code>examples/board</code>）。カードは引っ張っても、「移す」メニューからも移せる。"),
  },
  "06-motion.html": {
    film,
    curve,
    mem: () => `<div class="pair">
  ${bars("c-mem-ws", "使っているメモリ（MB）", "タスク帳の起動直後。少ないほど軽い", [
    { name: "動きの前", v: "old", value: 15.5, label: "15.5 MB" },
    { name: "直す前", v: "v020", value: 18.6, label: "18.6 MB（+3.1）" },
    { name: "直した後", v: "new", value: 15.5, label: "15.5 MB" },
  ], 20)}
  ${bars("c-mem-priv", "自分だけのメモリ（MB）", "ほかのアプリと分け合わない分", [
    { name: "動きの前", v: "old", value: 5.3, label: "5.3 MB" },
    { name: "直す前", v: "v020", value: 5.8, label: "5.8 MB（+0.5）" },
    { name: "直した後", v: "new", value: 5.3, label: "5.3 MB" },
  ], 7)}
</div>
<p class="small">reports/rust-gui/bench の startup で、2 つの版を同じ時に往復の順で測った（各 15 回）。動きの前は a15bb46、直す前は 6faa5d3、直した後は 34c0402。使っているメモリは working set、自分だけのメモリは private bytes。</p>`,
  },
};

/** 動きの途中を時間の順に並べる（試験台の時計を進めながら撮った写真） */
function film() {
  const steps = [0, 30, 60, 100, 160, 250];
  const cells = steps
    .map((ms) => {
      const alt = ms === 0 ? "押す前。自動で保存するのスイッチが切れていて、保存の間隔の行は無い" : ms === 250 ? "押してから 250 ms。保存の間隔の行が全部見えている" : `押してから ${ms} ms。保存の間隔の行が上から途中まで見えている`;
      return `    <figure>${picture(`motion/open-${String(ms).padStart(3, "0")}`, alt)}<figcaption>${ms === 0 ? "押す前" : `${ms} ms`}</figcaption></figure>`;
    })
    .join("\n");
  return `<figure>
  <div class="film">
${cells}
  </div>
  <figcaption>「自動で保存する」を入れた後の 250 ms。試験台の止めた時計を進めながら撮った。保存の間隔の行が上から現れ、下の「つづりを確かめる」も一緒に下がる。スイッチの丸は 167 ms で右端に着く。</figcaption>
</figure>`;
}

/** 動き方の曲線（3 次の減速）と、一定の速さの線を比べる SVG */
function curve() {
  const [x0, x1, y0, y1] = [70, 680, 250, 40];
  const px = (ms) => x0 + ((x1 - x0) * ms) / 250;
  const py = (v) => y0 - (y0 - y1) * v;
  const ease = (t) => 1 - (1 - t) ** 3;
  const pts = [];
  for (let ms = 0; ms <= 250; ms += 5) pts.push(`${px(ms).toFixed(1)},${py(ease(ms / 250)).toFixed(1)}`);
  const xt = [0, 50, 100, 125, 150, 200, 250].map((ms) => `<text class="tick" x="${px(ms)}" y="${y0 + 20}" text-anchor="middle">${ms}</text>`).join("");
  const yt = [0, 0.5, 1].map((v) => `<line class="grid-line" x1="${x0}" y1="${py(v)}" x2="${x1}" y2="${py(v)}"/><text class="tick" x="${x0 - 10}" y="${py(v) + 4}" text-anchor="end">${v * 100} %</text>`).join("");
  const mid = ease(0.5);
  return `<figure class="diagram">
    <svg viewBox="0 0 720 300" role="img" aria-labelledby="cv-title cv-desc">
      <title id="cv-title">250 ms の動きで、目標までどれだけ進んだか</title>
      <desc id="cv-desc">横が押してからの時間（0 から 250 ms）、縦が目標までの割合。kargui の曲線は初めが速く、125 ms で 88 % に着き、終わりはゆっくり 100 % に近づく。比べのための一定の速さの線は、125 ms で 50 %。</desc>
      ${yt}
      <line class="axis" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/>
      <line class="axis" x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1 - 10}"/>
      ${xt}
      <text class="sub" x="${x1}" y="${y0 + 40}" text-anchor="end">押してからの時間（ms）</text>
      <path class="linear" d="M${px(0)},${py(0)} L${px(250)},${py(1)}"/>
      <polyline class="curve" points="${pts.join(" ")}"/>
      <line class="grid-line" x1="${px(125)}" y1="${py(mid)}" x2="${px(125)}" y2="${y0}"/>
      <circle class="dot" cx="${px(125)}" cy="${py(mid).toFixed(1)}" r="5"/>
      <text class="curve-text" x="${px(125) + 12}" y="${py(mid) + 22}">125 ms で 88 %</text>
      <text class="curve-text" x="${x0 + 12}" y="${py(0.8)}">kargui（3 次の減速）</text>
      <text class="sub" x="${px(170)}" y="${py(170 / 250) + 30}">一定の速さ（比べ用）</text>
    </svg>
    <figcaption>250 ms の動きで、押してから目標までどれだけ進んだか。初めに大きく動くので、押したことがすぐ分かる。終わりはゆっくり止まる。</figcaption>
  </figure>`;
}

for (const [file, gens] of Object.entries(blocks)) {
  const path = join(DIR, file);
  let html = readFileSync(path, "utf8");
  for (const [name, make] of Object.entries(gens)) {
    const open = `<!-- gen:${name} -->`;
    const close = `<!-- /gen:${name} -->`;
    const start = html.indexOf(open);
    if (start < 0) throw new Error(`${file}: ${open} が無い`);
    const end = html.indexOf(close, start);
    const after = end < 0 ? start + open.length : end + close.length;
    html = html.slice(0, start) + `${open}\n${make()}\n${close}` + html.slice(after);
  }
  writeFileSync(path, html);
  console.log(`${file}: ${Object.keys(gens).join(", ")}`);
}
