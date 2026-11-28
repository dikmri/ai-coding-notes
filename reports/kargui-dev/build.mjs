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

/** 第 9 章の実行ファイルの大きさ（タスク帳を release で組み立てて測った） */
const EXE = "タスク帳の実行ファイルは 1,391,616 バイト（1.39 MB）で、前の版（7492df6）の 1,372,160 バイトより 19,456 バイト増えました。どちらも同じ手順で release で組み立てて測りました。";

const CHAPTERS = [
  { href: "01-frame.html", no: "第 1 章", title: "1 フレームの中で起きること", text: "入力が届いてから画面に出るまで。ビューを何回も呼ぶ理由、前のフレームの配置で当たりを決める理由。", thumb: "shots/list" },
  { href: "02-widgets.html", no: "第 2 章", title: "0.1 から 0.2 へ、部品をそろえた順番", text: "13 のフレームワークに学んで足す部品を決め、土台から作った。部品の写真と、足すのにかかった時間。", thumb: "shots/more_widgets" },
  { href: "03-apps.html", no: "第 3 章", title: "ふつうのアプリで見つけたこと", text: "メモ帳・家計簿・ファイルの閲覧を書いて見つかった不足と、起動が 14 ms 遅くなった理由。", thumb: "apps/expenses" },
  { href: "04-release.html", no: "第 4 章", title: "CI を初めて回した日と 0.2.0", text: "手元で通る試験が CI で落ちた 2 つの理由と、使い方を壊す変更を調べてから版を出す手順。", thumb: "shots/dialog" },
  { href: "05-drag-and-drop.html", no: "第 5 章", title: "ドラッグ＆ドロップ", text: "型で受け取る物を決める書き方、エクスプローラーから落とすファイル、本物の窓で見つかった不具合、並べ方の決まり。", thumb: "shots/drag_and_drop" },
  { href: "06-motion.html", no: "第 6 章", title: "動き（アニメーション）", text: "数を 1 つ返す書き方、OS の「アニメーション効果」に従う作り、試験台で動きを切る理由、起動のたびに 6 フレーム描いていた不具合。", thumb: "motion/open-060" },
  { href: "07-fonts.html", no: "第 7 章", title: "書体", text: "Font の 3 つの形と書体の探し方、入力欄の書体が 1 フレーム遅れて伝わる理由、作者の記録から見つけた行の間の不具合。", thumb: "fonts/lines" },
  { href: "08-pickers.html", no: "第 8 章", title: "色と時刻の選択", text: "時刻をます目にした理由、濃淡の面を絵で描く方法、作者の記録から見つけた打つ途中の番号と、引っ張っても選べない入力欄。", thumb: "pickers/time" },
  { href: "09-rich-text.html", no: "第 9 章", title: "書式付きの文字", text: "範囲を表示だけにした理由、1 つの段落として並べて部分ごとに色を付ける仕組み、見えないコードの背景と Linux で落ちた試験。", thumb: "rich/sample" },
  { href: "10-linux.html", no: "第 10 章", title: "Linux の窓（Wayland と X11）", text: "検証用の Linux の PC と AI が画面を操作する道具、境目のファイル 1 つで窓を開く作り、タッチパッドの取りこぼし、後から足したクリップボード・日本語入力・読み上げ・ファイルのダイアログ・複数の窓・GNOME の題の帯・X11 の窓。", thumb: "linux/settings" },
  { href: "11-v030.html", no: "第 11 章", title: "0.3.0 の仕上げと、作者の手の確かめ", text: "0.3.0 の範囲、6 つの宿題、部品の見本、X11 の IBus。作者の 5 回の確かめで見つけた、幅が増え続けるつまみ・押せない棒・二重に見えた棒・消える焦点。", thumb: "v030/gallery-table" },
  { href: "12-dock.html", no: "第 12 章", title: "ドッキング", text: "4 つの見本から決めた形、並べ方の木をアプリが持つ作り、マウスを使わない操作。小さな的に落とせなかった記録から、ポインターのいる場所で決める形に変えた話。", thumb: "dock/layout" },
  { href: "13-floating.html", no: "第 13 章", title: "浮いた枠", text: "窓の中に浮かせる形から作った理由、枠の下へ届いたホイールを描く順で隠す直し方。作者の記録から見つけた、F6 が枠を飛ばした理由と、元の場所へ戻らなかったパネル。", thumb: "dock2/float" },
  { href: "14-windows.html", no: "第 14 章", title: "別の窓", text: "Wayland では出さないと決めた理由、別の窓をアプリの App::window から同じ ui.dock で描く書き方、OS ごとに違う窓の場所の形と、最小化した窓の場所を覚えない理由。", thumb: "dock3/main" },
  { href: "15-titlebar.html", no: "第 15 章", title: "題の帯", text: "題の帯に部品を置ける形を選んだ理由、OS によって帯の中にも窓のいちばん上の行にもなる書き方、Windows に帯の場所を答える仕組み。作者の 4 回の確かめで見つけた、起動の直後に止まる・窓のメニューが出ない・窓の処理が二重に呼ばれる不具合。", thumb: "titlebar/windows" },
  { href: "16-tray.html", no: "第 16 章", title: "トレイ", text: "OS が描くメニューを kargui のメニューと同じ書き方で作る方法、OS ごとの知らせの届き方、Wayland で隠した窓が戻らなかった理由。作者の確かめで見つけた、アイコンを押しても届かなかった不具合と、手元でそれを見落とした確かめ方。", thumb: "tray/gallery" },
  { href: "17-notify.html", no: "第 17 章", title: "通知", text: "トーストを選んだ理由、キーで頼んでキーで答えを受け取る書き方、インストールしないアプリがトーストに名前を出す登録、OS ごとの違い。自分では押せなかったトーストのボタンを、作者の手の確かめで確かめた話。", thumb: "notify/gallery" },
  { href: "18-contrast.html", no: "第 18 章", title: "ハイコントラスト", text: "OS のハイコントラストに従う範囲を、作者が寝ている間に決めた理由。配色の写し方、強制した見本の写真で見つけた 3 つの不具合、検証機のポータル、作者の手の確かめが 1 回目に動かなかった理由。", thumb: "contrast/black" },
  { href: "19-icon.html", no: "第 19 章", title: "既定のアイコン", text: "アイコンを渡さないアプリに出す kargui のアイコン。3 つの案を計算で描いて比べ、16 画素でも読める 1 つを選んだ。画像のファイルを読まずに大きさごとに描く理由と、その時間。", thumb: "icon/sheet" },
  { href: "20-locale.html", no: "第 20 章", title: "多言語（kargui が出す文字）", text: "題の帯のボタンやドッキングのメニューなど、kargui が自分で出す 18 語を、OS の言語で英語か日本語にした。OS ごとの言語の読み方、試験を PC の言語に左右させない工夫、読み上げの木に出ない名前の確かめ方。", thumb: "locale/dock-ja" },
  { href: "21-x11.html", no: "第 21 章", title: "本物の X サーバーと切り分け", text: "Hyprland を通らない X サーバーを 2 つ用意し、X11 にだけある所を試した。開いたまま倍率を追う仕組み、日本語入力の答えを待つ間に消えた Ctrl、最小化した窓の描き直しと中身の処理、開くたびにずれた窓。", thumb: "x11real/dpi96" },
  { href: "22-long-text.html", no: "第 22 章", title: "長い文字の入力欄", text: "2 MB の文字を貼った入力欄が重かった原因 5 つ。見えない字を描く、行の位置を数え直す、古い版を残す、キャレットの位置を毎回足す、全文を並べ直す。メモ帳のキー 1 つが約 68 秒から 10〜15 ミリ秒になった。", thumb: "bigtext/notepad" },
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
  "08-pickers.html": {
    time: () => figure("pickers/time", "時刻の欄の下に、時のます目（00 から 23）と分のます目（00 から 55 まで 5 分ずつ）が出ている。9 時と 30 分が選ばれている", "時刻の選択。時を選ぶと分へ移り、分を選ぶと閉じる（日本語の言葉、試験台で撮った）。", { flat: true }),
    color: () => figure("pickers/color", "色の欄の下に、彩度と明るさの面、色相の帯、不透明度の帯、色の番号の欄、16 色の見本が出ている", "色の選択（<code>.alpha()</code> 付き）。面と帯は、色を計算した絵を画像として描く。", { flat: true }),
  },
  "09-rich-text.html": {
    sample: () => figure("rich/sample", "2 行の段落。「元に戻せません」は太字、「Ctrl+Z」は等幅で薄い背景、「バックアップの仕組み」は主の色に下線のリンク、「1,980」は取り消し線、「1,280」は赤い太字、「（税込み、日曜まで）」は小さい弱い字で「日曜まで」は斜体", "上のコードに値段の行を足した段落（試験台で 2 倍で撮った）。部分ごとに太字・コード・リンク・取り消し線・色・小さい斜体が付いている。", { flat: true }),
    wrapped: () => figure("rich/wrapped", "「詳しくは」の後のリンクが 2 行にまたがり、1 行目と 2 行目のそれぞれに焦点の枠が出ている", "2 行にまたがるリンクに Tab で焦点を当てた所。枠は行ごとに描く（幅 300 の窓、試験台で 2 倍で撮った）。", { flat: true }),
    underline: () => `${figure("rich/underline-before", "直す前。1 行目の終わりのリンク「how」の下線が、後ろの空白の下まで伸びている", "直す前。1 行目の「how」の下線が、行末の空白の下まで伸びている（英語の写真の右上を 2 倍に拡大）。", { flat: true })}
  ${figure("rich/underline-after", "直した後。1 行目のリンク「how」の下線は、how の右端で止まっている", "直した後。下線は「how」の右端で止まる。", { flat: true })}`,
    exe: () => EXE,
  },
  "10-linux.html": {
    deps: () =>
      bars("c-deps", "Wayland の窓に要る依存の数", "少ないほど軽い。Linux で cargo tree で数えた", [
        // 値の文字は短くする（幅 320 の画面で棒の外へはみ出した。括弧の中身は、すぐ上の本文と見出しにある）
        { name: "smithay-client-toolkit を使う形", v: "old", value: 57, label: "57 個" },
        { name: "今回の形（低い層を直接）", v: "new", value: 32, label: "32 個" },
      ]),
    settings: () =>
      figure(
        "linux/settings",
        "Linux の Hyprland の上の、kargui の設定の見本の窓。名前の欄に kargui テストと打ってあり、テーマ・書体・文字の大きさ・強調の色などが並ぶ",
        "Linux の検証機（Hyprland、1.5 倍）で開いた設定の見本。物理ピクセル 1890×1005 で描いている（画面を撮って窓の部分を切り出した。暗い表示の時は、見本のテーマをダークにした写真）。",
        { flat: true },
      ),
    split: () =>
      figure(
        "linux/split",
        "左に端末、右に kargui の設定の見本が並び、見本は半分の幅に縮んで中身が並び直している",
        "隣に端末を開くと、Hyprland が画面を 2 つに分け、kargui の窓は論理 624×670 に狭まる。中身は Windows と同じく並び直す。",
        { flat: true },
      ),
    popups: () => `${figure("linux/picker", "強調の色の欄の上に、彩度と明るさの面・色相の帯・番号の欄・16 色の見本が開いている", "色の選択。下に入りきらないので、欄の上に開く。", { flat: true })}
  ${figure("linux/menu", "家計簿の表の 2026-11-12 の行が選ばれ、その上に削除と書かれたメニューが開いている", "家計簿の見本の行を右クリックした所。行に付けたメニューが、押した位置に開く。", { flat: true })}`,
    clipboard: () => `${figure("linux/clipboard", "左に kargui の設定の見本、右に端末。見本の名前の欄の realkbd を写し、端末に貼った realkbd が出ている", "kargui の名前の欄で写した文字を、SUPER＋Enter で開いた端末に Ctrl+Shift+V で貼った所（本物のキーボードと同じ道で AI が操作した）。", { flat: true })}
  ${figure("linux/today", "家計簿の見本の日付の暦。2026 年 11 月で、23 日に丸が付いている", "家計簿の見本の暦。今日の丸が、地元の日付（11 月 23 日）に付く。", { flat: true })}`,
    ime: () =>
      figure(
        "linux/ime-candidates",
        "家計簿の見本のメモ欄に、下線付きのとうきょうが打ってあり、その真下に Tabキーで選択・東京・東京都・東京駅と並んだ候補の窓が開いている",
        "家計簿の見本のメモ欄で「とうきょう」と打った所。変換中の文字に下線が付き、Mozc の候補の窓が文字の真下に出る（AI が本物のキーボードと同じ道で打った）。",
        { flat: true },
      ),
    clauses: () =>
      figure(
        "linux/ime-clauses",
        "メモ欄が上下に 2 つ。どちらも東京明日は東京に行くと書かれている。上は明日はに太い下線、下は東京にに太い下線が付いている",
        "上は「明日は」を変換している所、下は → で「東京に」へ移った所。太い下線が今変換している文節で、先頭の「東京」は確定済みの文字。上では「東京に行く」が 1 本の細い下線になる。",
        { flat: true },
      ),
    portal: () => `${figure(
      "linux/portal-save",
      "GTK の名前を付けて保存のダイアログ。名前の欄に tokyo memo.txt、場所は tmp の kargui-dialog で、saved copy.txt と tokyo memo.txt が並び、右下の種類はテキスト",
      "メモ帳の見本で /tmp/kargui-dialog のファイルを開いた後の「名前を付けて保存」。ポータルのダイアログが、開いたファイルのフォルダから始まる（名前と種類は、メモ帳が頼んだ物）。",
      { flat: true },
    )}
  ${figure(
    "linux/os-dark",
    "暗い表示の設定の見本。テーマはシステムが選ばれ、名前・メール・書体・文字の大きさなどが並ぶ",
    "OS を暗い方の設定（color-scheme が prefer-dark）にして開いた設定の見本。テーマの「システム」は、ポータルから読んだ OS の設定に従う。",
    { flat: true },
  )}`,
    second: () =>
      figure(
        "linux/second-window",
        "ファイルの閲覧の見本の上に、AGENTS.md のプロパティの窓が重なっている。名前・大きさ・更新日・場所と、閉じるボタンが並ぶ",
        "ファイルの閲覧の見本で、ファイルの行を右クリックして「プロパティ」を選んだ所。2 つ目の窓が主の窓の上に開く（作業場 9 の、窓を浮かせる規則の上）。",
        { flat: true },
      ),
    drop: () =>
      figure(
        "linux/drop-files",
        "左に GTK の窓（ここからファイルを引っ張る、の文字）、右に kargui のメモ帳。メモ帳の本文の欄が青い枠で囲まれている",
        "左の GTK の窓からファイルを引っ張って、右のメモ帳の上へ動かしている所。受け取れる本文の欄を、主の色の枠で囲む（Windows と同じ見せ方）。",
        { flat: true },
      ),
    workspace: () =>
      figure(
        "linux/ime-workspace",
        "メモ欄に soraumi そら うみ と書かれ、うみにだけ下線が付き、その下に海の候補が出ている",
        "「そら」と打った途中で別の作業場へ移り、戻ってから「うみ」と打った所。「そら」は確定して残り、「うみ」は新しい変換になる（先頭の soraumi は、前の試しで入った文字）。",
        { flat: true },
      ),
    csd: () => `${figure(
      "linux/gnome-title-bar",
      "GNOME の上のファイルの閲覧の見本。一番上の帯の真ん中に題、右端に最小化・最大化・閉じるのボタンが並び、窓の縁に細い線がある",
      "GNOME で開いたファイルの閲覧の見本。題の帯は kargui が描いている（ボタンの並びは、GNOME の設定を最小化・最大化・閉じるの 3 つにした時の物）。",
      { flat: true },
    )}
  ${figure(
    "linux/gnome-second-window",
    "暗い表示のファイルの閲覧の見本の上に、LICENSE のプロパティの窓が重なっている。どちらの窓にも題の帯があり、プロパティの窓の縁に細い線がある",
    "暗い表示で、プロパティの窓を開いた所。2 つ目の窓にも題の帯を描く。前面に無い主の窓は、題を薄くする。縁の線は、重なった窓の境を見せるために引いた。",
    { flat: true },
  )}`,
    menu: () =>
      figure(
        "linux/gnome-window-menu",
        "最大化したメモ帳の題の帯の下に、スクリーンショットを撮る・隠す・元に戻す・移動などが並んだ暗いメニューが開いている",
        "題の帯を右クリックすると、GNOME の窓のメニューが押した位置に出る（メニューは GNOME が描く）。最大化しているので「元に戻す」がある。",
        { flat: true },
      ),
    x11ime: () =>
      figure(
        "linux/x11-ime",
        "X11 のメモ帳の本文に、太い下線の TOKYO があり、その真下に 1. 東京、2. TOKYO［アルファベット］などが並ぶ候補の窓が開いている",
        "X11 の窓（Hyprland の XWayland）で「とうきょう」を変換した所。fcitx5 の D-Bus から届いた変換中の文字を kargui が描き、文字を打つ位置を知らせたので、候補の窓が真下に出る。",
        { flat: true },
      ),
    x11dialog: () =>
      figure(
        "linux/x11-dialog",
        "X11 のメモ帳の上に、メモを開くの GTK のダイアログが重なっている。最近開いたファイルに tokyo memo.txt などが並ぶ",
        "X11 の窓から「開く」を選んだ所。ポータルに親の窓（x11:番号）を渡すので、ダイアログはメモ帳に結び付いて開く。",
        { flat: true },
      ),
    dialog: () =>
      figure(
        "linux/gnome-dialog",
        "メモ帳の本文が暗くなり、真ん中にこのアプリについてのダイアログが出ている。一番上の題の帯は暗くならず、ボタンも見える",
        "メモ帳で「このアプリについて」を出した所。暗くするのは帯の下だけにしたので、ダイアログを出したままでも帯で窓を動かし、閉じられる。",
        { flat: true },
      ),
  },
  "07-fonts.html": {
    fonts: () => figure("fonts/lines", "複数行の入力欄が 3 つ並ぶ。左から UI の書体、等幅、BIZ UDP ゴシック。どれも同じ行の間で並んでいる", "同じ文を 3 つの書体で出した複数行の入力欄。左から UI の書体（Yu Gothic UI）、<code>.monospace()</code>（BIZ UD ゴシック）、<code>.font(Font::family(\"BIZ UDPGothic\"))</code>。試験台で撮った。", { flat: true }),
    linesfix: () => `${figure("fonts/lines-before", "直す前。等幅と BIZ UDP ゴシックの欄は行がくっつき、欄の高さも低い", "直す前（dd6474e）。等幅と BIZ UDP ゴシックは、行の高さが文字の大きさと同じ 14 ピクセル。", { flat: true })}
  ${figure("fonts/lines", "直した後。3 つの欄とも同じ行の間と高さ", "直した後（b8e9d93）。UI の書体の行の高さに広げ、字を行の真ん中に置く。", { flat: true })}`,
  },
  "12-dock.html": {
    layout: () =>
      figure(
        "dock/layout",
        "左に Files のまとまり、右上に Editor と Notes のタブのまとまり、右下に Output のまとまり。どのタブの横にも小さな閉じるボタンがある",
        "<code>ui.dock(&amp;mut dock).grow().closable()</code> で並べたパネル（600×360 の窓を試験台で 2 倍で撮った）。まとまりの間の線が仕切り。",
        { flat: true },
      ),
    compare: () => `<div class="pair">
  ${figure("dock/before", "前の版。Notes のタブを引っ張っている。Editor のまとまりの真ん中に十字の形の 5 つの四角、全体の左・右・下・見出しの帯の下に 1 つずつ四角が出ている", "前の版（小さな的）。右の的に乗ると、まとまりの右半分を塗る。十字の的とは別に、外側の的が全体の端に出る。", { flat: true })}
  ${figure("dock/after", "今の版。Notes のタブを Editor のまとまりの右寄りまで引っ張っている。四角は無く、まとまりの右半分が薄い青で塗られている", "今の版（場所で決める）。同じ所まで引っ張ると、四角を狙わなくても右半分が塗られる。", { flat: true })}
</div>`,
  },
  "13-floating.html": {
    float: () =>
      figure(
        "dock2/float",
        "左に Files、右上に Editor、右下に Output のまとまり。Editor の上に、Notes のタブだけの枠が重なっている。枠のタブの左に縦 2 列の点、枠の右下の角に点がある",
        "Notes のまとまりを浮かせた所（600×360 の窓を試験台で 2 倍で撮った）。タブの左の点で枠を動かし、右下の点で大きさを変える。",
        { flat: true },
      ),
    menu: () =>
      figure(
        "dock2/menu",
        "浮いた枠の Notes のタブの右クリックのメニュー。Dock、Move into group、区切りの線、Close が並ぶ",
        "浮いた枠のタブのメニュー。「Dock」で元の場所へ戻し、「Move into group」でほかのまとまりへ入れる。",
        { flat: true },
      ),
    drop: () =>
      figure(
        "dock2/drop",
        "Output のタブを引っ張り、Notes の枠の上に乗せている。枠の全体が薄い青で塗られ、ポインターの所に Output と書いた小さな箱がある",
        "Output のタブを枠の上へ引っ張っている所。枠のどこに乗せても枠の全体が塗られ、離すとタブとして入る。",
        { flat: true },
      ),
  },
  "14-windows.html": {
    windows: () => `<div class="pair">
  ${figure("dock3/main", "主の窓。左に Files、右上に Editor、右下に Output のまとまり。Editor のまとまりにあった Notes のタブは無い", "主の窓。Notes を別の窓に出したので、Editor のまとまりは Editor だけになった（600×360 の窓を試験台で 2 倍で撮った）。", { flat: true })}
  ${figure("dock3/window", "別の窓。Notes のタブだけのまとまりが、窓いっぱいに出ている", "別の窓（300×180）。中は Notes のまとまりだけで、動かす印や大きさを変える印は無い（窓は OS が動かす）。", { flat: true })}
</div>`,
    menu: () =>
      figure(
        "dock3/menu",
        "Editor のまとまりの Notes のタブの右クリックのメニュー。Move to a new group、Move into group、Float、Move to a new window、区切りの線、Close が並ぶ",
        "木のまとまりのタブのメニュー。「Float」の下に「Move to a new window」が足された（Wayland では出ない）。",
        { flat: true },
      ),
  },
  "15-titlebar.html": {
    gallery: () =>
      figure(
        "titlebar/gallery",
        "部品の見本の窓。いちばん上の帯の左に太字の「部品の見本」と「暗い色」のボタン、右端に最小化・最大化・閉じるのボタンがある。その下に部品の一覧とボタンのページ",
        "部品の見本の本物の窓（Windows 11、900×651）。題の帯の左に「部品の見本」の文字と「暗い色」のボタンを置いた。右端の 3 つのボタンも kargui が描く。",
        { flat: true },
      ),
    forms: () =>
      [
        figure(
          "titlebar/windows",
          "帯の左に太字の Notes と Search の入力欄、右端に最小化・最大化・閉じるのボタン。帯の下に Shopping list と Ideas for the weekend の 2 行",
          "Windows（<code>custom_title_bar</code> が true）。kargui が帯を描き、部品は帯の左、3 つのボタンは右端に並ぶ。520×130 の窓を試験台で 2 倍で撮った。",
          { flat: true },
        ),
        figure(
          "titlebar/gnome",
          "帯の左に太字の Notes と Search の入力欄、右端に閉じるのボタンだけ。窓の四方の縁に線がある",
          "GNOME（合成が題の帯を描かない Wayland）。kargui は <code>custom_title_bar</code> にかかわらず帯を描く。ボタンは GNOME の設定に合わせる（この写真は閉じるだけ）。縁の線も kargui が引く。",
          { flat: true },
        ),
        figure(
          "titlebar/plain",
          "帯は無く、窓のいちばん上の行に太字の Notes と Search の入力欄。その下に Shopping list と Ideas for the weekend の 2 行",
          "OS や合成が帯を描く所（X11、帯を描く Wayland、<code>custom_title_bar</code> が false の Windows）。部品は窓のいちばん上の行になる。",
          { flat: true },
        ),
      ].join("\n"),
    close: () =>
      figure(
        "titlebar/close",
        "Windows の形の帯。右端の閉じるのボタンが赤く塗られ、白い × の印がある",
        "閉じるのボタンに乗った時。赤（#c42b1c）に白の印。ボタンは、乗った時と押した時だけ塗る。",
        { flat: true },
      ),
    reentrant: () =>
      bars(
        "c-reentrant",
        "メニューの間に二重に入った知らせ（722 回）",
        "作者の 3 回目の記録。5 回開いたメニューの合計。空き時間は WM_ENTERIDLE、項目の選び直しは WM_MENUSELECT、始めと終わりはメニューを開く・閉じる時の 6 種類、説明の無い物は 0x00AE と 0x0094、ボタンを離れたは WM_NCMOUSELEAVE、ポインターは WM_SETCURSOR と WM_NCHITTEST",
        [
          ["空き時間", 641],
          ["項目の選び直し", 26],
          ["始めと終わり", 30],
          ["説明の無い物", 14],
          ["ポインター", 6],
          ["ボタンを離れた", 5],
        ].map(([name, value]) => ({ name, v: "now", value, label: `${value} 回` })),
      ),
  },
  "16-tray.html": {
    gallery: () =>
      figure(
        "tray/gallery",
        "部品の見本のトレイのページ。通知領域にアイコンを出す、閉じるボタンでトレイに隠れる（灰色）、窓を隠す（灰色）、トレイのアイコンを押した回数 0、説明の文が並ぶ",
        "見本の 24 ページ目「トレイ」（Windows 11 の本物の窓、900×651）。「通知領域にアイコンを出す」に印を付けると、アイコンが出て、下の 2 つが押せるようになる。",
        { flat: true },
      ),
    menu: () =>
      figure(
        "tray/menu",
        "トレイのアイコンの右クリックのメニュー。Show window、印の付いた Mute、区切りの線、右に矢印のある Recent、灰色の Disabled、Quit が並ぶ",
        "Windows のトレイのメニュー（確かめのアプリ）。OS が描くので、Windows 11 のメニューの見た目になる。印の付く項目・区切り・入れ子・押せない項目が使える。",
        { flat: true },
      ),
    linux: () =>
      figure(
        "tray/linux",
        "検証機の上の帯の右端。赤い角の丸い四角のアイコン（kargui の無地のアイコン）と、キーボードの形のアイコンが並ぶ",
        "検証機の上の帯（Quickshell）に出た kargui のアイコン（左。アプリが画像を渡さない時の無地のアイコン）。右は日本語入力（fcitx5）のアイコン。帯の右端だけを切り出し、3 倍にした。",
        { flat: true },
      ),
  },
  "17-notify.html": {
    gallery: () =>
      figure(
        "notify/gallery",
        "部品の見本の通知のページ。通知を出す、音の無い通知、ボタン付きの通知の 3 つのボタン。出した通知 0、最後に押された所 まだ無い、説明の文が並ぶ",
        "見本の 25 ページ目「通知」（Windows 11 の本物の窓、900×651）。3 つのボタンで通知を出し、押された所をページに出す。日本語の書体では、レジストリの場所の <code>\\</code> が ¥ で表示される。",
        { flat: true },
      ),
    linux: () =>
      figure(
        "notify/linux",
        "暗い色の通知の枠。太字の kargui notify check と、その下に A silent notification with two buttons",
        "検証機の通知の係（mako）に出た通知（確かめのアプリ）。mako はボタンを枠に並べず、命令やメニューで選ぶ形。枠の中だけを切り出した。",
        { flat: true },
      ),
  },
  "18-contrast.html": {
    pair: () => `<div class="pair">
  ${figure("contrast/black", "黒い地の部品の見本のボタンのページ。白い文字と白い縁のボタン、水色に塗った主な操作、水色の下線の付いたリンク。押せない状態の 3 つのボタンは、緑の縁と緑の文字", "暗い方（Windows の古典の High Contrast Black の色）。押せない 3 つは GrayText の緑で描く。", { flat: true })}
  ${figure("contrast/white", "白い地の部品の見本の文字の入力のページ。黒い縁の 3 つの入力欄に、濃い赤のヒント。左の一覧の選んだ行は、薄い紫の地に濃い紫の縁", "明るい方（High Contrast White の色）。ヒントは GrayText の濃い赤、選んだ行には強調の紫の縁。", { flat: true })}
</div>`,
    ratio: () =>
      `<div class="pair">
  ${bars("c-ratio-gray", "押せない文字と背景の対比", "大きいほど読みやすい。WCAG の文字の目安は 4.5", [
        { name: "ふつう 明", v: "old", value: 3.0, label: "3.0 : 1" },
        { name: "ふつう 暗", v: "old", value: 3.9, label: "3.9 : 1" },
        { name: "高対比 黒", v: "new", value: 14.0, label: "14.0 : 1" },
        { name: "高対比 白", v: "new", value: 14.0, label: "14.0 : 1" },
      ], 21)}
  ${bars("c-ratio-border", "縁と背景の対比", "部品の境の見えやすさ。WCAG の目安は 3", [
        { name: "ふつう 明", v: "old", value: 1.5, label: "1.5 : 1" },
        { name: "ふつう 暗", v: "old", value: 1.8, label: "1.8 : 1" },
        { name: "高対比 黒", v: "new", value: 21, label: "21 : 1" },
        { name: "高対比 白", v: "new", value: 21, label: "21 : 1" },
      ], 21)}
</div>`,
    linux: () =>
      figure(
        "contrast/linux",
        "白い地の部品の見本の窓。選んだ行に濃い紫の縁、紫に塗った主な操作、押せない 3 つは濃い赤の縁と文字。右端のスクロールバーのつまみは黒",
        "検証機（Hyprland）で、GNOME のハイコントラストの設定をポータル経由で読んで開いた見本。kargui の明るい方の配色になる。窓の上半分だけを切り出した。",
        { flat: true },
      ),
  },
  "19-icon.html": {
    sheet: () =>
      figure(
        "icon/sheet",
        "3 つの案のアイコンを 3 段に並べた一覧。上の段は光の線の小文字の k、中の段は重なった 3 枚の窓、下の段は 5 × 5 の光の粒で描いた K。左半分は暗い地、右半分は明るい地の上に、大きい物から小さい物の順に並ぶ",
        "3 つの案（上から A「光の k」、B「重なる窓」、C「光の粒の k」）。左は暗い地、右は明るい地。どちらも 256・64・32・16 画素で描き、右の 2 つは 32 画素と 16 画素を 4 倍に拡大した。",
        { flat: true },
      ),
    real: () => `<div class="pair">
  ${figure("icon/title", "暗い題の帯の左上に、紺の角丸の地に光の線の k のアイコンと、家計簿（kargui）の文字", "Windows の家計簿の見本の題の帯（4 倍に拡大）。小さいアイコンの大きさ（この PC では 16 画素）で描いた。", { flat: true })}
  ${figure("icon/tray", "暗い帯の上に、光の線の k のアイコンと、灰色のキーボードの形のアイコンが並ぶ", "検証機の上の帯のトレイ（4 倍に拡大）。左が kargui のアイコン、右は日本語入力。", { flat: true })}
</div>`,
    time: () =>
      bars("c-icon-time", "1 枚を描く時間（ミリ秒）", "20 回の中央値。この PC の release。48 画素以下は 1 画素を 8 × 8、64 画素以上は 4 × 4 の点で数える", [
        { name: "16 画素", v: "new", value: 0.932, label: "0.9 ms" },
        { name: "32 画素", v: "new", value: 4.127, label: "4.1 ms" },
        { name: "48 画素", v: "new", value: 8.751, label: "8.8 ms" },
        { name: "64 画素", v: "new", value: 4.083, label: "4.1 ms" },
        { name: "256 画素", v: "old", value: 61.418, label: "61.4 ms" },
      ]),
  },
  "20-locale.html": {
    dock: () => `<div class="pair">
  ${figure("locale/dock-en", "ドッキングのタブの右クリックのメニュー。Move to a new group の入れ子に Left・Right・Above・Below、その下に Move into group、Float、Move to a new window、Close", "英語（試験台で 2 倍に描いた）。", { flat: true })}
  ${figure("locale/dock-ja", "同じメニューの日本語。新しいグループへ移動の入れ子に左・右・上・下、その下にグループへ移動、フロート、新しいウィンドウへ移動、閉じる", "日本語。入れ子の向きの言葉まで、表から取る。", { flat: true })}
</div>`,
    windows: () =>
      figure(
        "locale/windows",
        "部品の見本の日付と時刻のページを上下に 2 つ並べた絵。上は日付を選ぶ・時刻を選ぶ、下は Pick a date・Pick a time",
        "Windows の見本の「日付と時刻」のページ（本物の窓の一部）。上は OS の言語（日本語）のまま、下は <code>--locale en</code>。",
        { flat: true },
      ),
    linux: () =>
      figure(
        "locale/linux",
        "検証機の部品の見本の窓を上下に 2 つ並べた絵。上は日付を選ぶ・時刻を選ぶ、下は Pick a date・Pick a time",
        "検証機（Hyprland、<code>LANG=ja_JP.UTF-8</code>）の同じページ。上は OS の言語のまま、下は <code>--locale en</code>。見本の窓だけを切り出した。",
        { flat: true },
      ),
  },
  "21-x11.html": {
    dpi: () => `<div class="pair">
  ${figure("x11real/dpi96", "openbox の枠の付いた部品の見本の窓。小さく、左に部品の一覧、右にボタンのページ", "<code>Xft.dpi</code> が 96（倍率 1）。最小の 600 × 400 まで縮めた窓（本物の Xorg）。", { flat: true })}
  ${figure("x11real/dpi192", "同じ窓を 2 倍の画素で描いた絵。文字とボタンが大きく、並び方は左の絵と同じ", "そのまま 192（倍率 2）に変えた。論理の大きさは同じで、画素は 1200 × 800。", { flat: true })}
</div>`,
    drop: () =>
      figure(
        "x11real/drop",
        "メモ帳の窓。本文に「落としたファイルの中身」「X11 の XDND」の 2 行があり、下の欄に「落とした メモ.txt 開きました」と出ている",
        "XDND の知らせを送る道具で、日本語と空白を含む名前のファイルをメモ帳に落とした（Xvfb）。",
        { flat: true },
      ),
    background: () =>
      bars("c-bg-work", "別のスレッドの計算の量（1 秒あたり）", "見えている 5 秒と最小化の 5 秒を 3 回。切り替えた直後の 1 秒を外した平均。Windows と X11 は別の PC なので、OS の間では比べない", [
        { name: "Win 見える", v: "old", value: 6057, label: "6,057" },
        { name: "Win 最小化", v: "new", value: 6082, label: "6,082" },
        { name: "X11 見える", v: "old", value: 4822, label: "4,822" },
        { name: "X11 最小化", v: "new", value: 4837, label: "4,837" },
      ]),
    dock: () =>
      figure(
        "x11real/dock",
        "部品の見本のドッキングのページの上に、「メモ」という題の小さな窓が重なっている",
        "「新しいウィンドウへ移動」で、メモのパネルを別の窓に出した（Xvfb と openbox）。",
        { flat: true },
      ),
  },
  "22-long-text.html": {
    memory: () =>
      bars("c-bigtext-mem", "記憶（キーを 3 つ打った後、MB）", "検証機の X11。2 MB の文字を貼ってからキーを 3 つ打った時のプロセスの記憶", [
        { name: "家計簿 前", v: "old", value: 704, label: "704 MB" },
        { name: "家計簿 後", v: "new", value: 158, label: "158 MB" },
        { name: "メモ帳 前", v: "old", value: 739, label: "739 MB" },
        { name: "メモ帳 後", v: "new", value: 165, label: "165 MB" },
      ]),
    notepad: () =>
      figure(
        "bigtext/notepad",
        "メモ帳の窓。abcdefghij を繰り返す行が並び、最後の行に bbb とキャレット。下の欄に 39217 行・2000019 文字",
        "直した後のメモ帳（検証機の Xvfb）。2 MB を貼ってから b を 3 つ打った。",
        { flat: true },
      ),
  },
  "11-v030.html": {
    gallery: () =>
      figure(
        "v030/gallery-table",
        "部品の見本の表のページ。左に部品の一覧があり表が選ばれている。右の表は都市・人口・地方の 3 列で、都市の見出しに上向きの矢印があり、名古屋・大阪・札幌・東京・福岡の順に並んでいる。人口と地方の列の左の端に縦の線がある",
        "見本の「表」のページ。都市の見出しを押して並べ替え、Shift+→ を 3 回押して都市を広げた所（人口の列が 30 狭くなった）。人口と地方のつまみ（縦の線）は、列の左の端にある。760×470 の窓を試験台で 2 倍で撮った。",
        { flat: true },
      ),
    ghost: () => `<div class="pair">
  ${figure("v030/ghost-before", "直す前。30 行目から 36 行目が見える一覧の右端に、灰色のつまみが 3 つ縦に並んでいる", "直す前。入れ物の中の一覧を下へ 10 回、上へ 2 回動かした所。本物のつまみは一番上の 1 つで、下の 2 つは古いつまみの絵（直した 1 行を戻した写しを、試験台で 2 倍で撮った）。", { flat: true })}
  ${figure("v030/ghost-after", "直した後。同じ一覧の右端に、灰色のつまみが 1 つだけある", "直した後。同じ操作で、つまみは 1 つだけ。全部描き直した絵と 1 画素も違わない。", { flat: true })}
</div>`,
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
