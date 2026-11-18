// 本棚の見本の本 2 冊（どちらもこのアプリのために書いたオリジナル）。core/books.mjs の makeEpub で EPUB の形にする。
// 1 冊目は横書きの短い案内の本、2 冊目は縦書きでルビのある短い物語。表紙と図は SVG で描く。

const r = (base, ruby) => `<ruby>${base}<rp>（</rp><rt>${ruby}</rt><rp>）</rp></ruby>`;
const ps = (lines) => lines.map((l) => `<p>${l}</p>`).join('\n');

/* ---------- 1 冊目: 本棚のはじめかた（横書き） ---------- */
const GUIDE_COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6bf2e3"/><stop offset="0.55" stop-color="#cfaeff"/><stop offset="1" stop-color="#ff8ec7"/></linearGradient></defs>
<rect width="600" height="900" fill="url(#sky)"/>
<g fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2">
<path d="M0 640H600M0 700H600M0 770H600M0 850H600"/><path d="M300 600L-200 900M300 600L800 900M300 600L100 900M300 600L500 900"/>
</g>
<rect x="110" y="300" width="380" height="300" fill="#241734"/>
<rect x="122" y="312" width="356" height="276" fill="#fff6e3"/>
<rect x="122" y="440" width="356" height="12" fill="#241734"/>
<g stroke="#241734" stroke-width="4">
<rect x="140" y="340" width="34" height="100" fill="#ff5c97"/><rect x="178" y="352" width="28" height="88" fill="#ffd37a"/><rect x="210" y="330" width="40" height="110" fill="#4b5fe8"/>
<rect x="254" y="360" width="26" height="80" fill="#6bf2e3"/><rect x="284" y="344" width="36" height="96" fill="#cfaeff"/><rect x="340" y="372" width="70" height="26" fill="#ff8ec7" transform="rotate(-18 375 385)"/>
<rect x="420" y="336" width="34" height="104" fill="#ffd37a"/>
<rect x="140" y="480" width="30" height="96" fill="#6bf2e3"/><rect x="174" y="468" width="38" height="108" fill="#ff8ec7"/><rect x="216" y="488" width="28" height="88" fill="#4b5fe8"/>
<rect x="248" y="474" width="34" height="102" fill="#ffd37a"/><rect x="286" y="492" width="26" height="84" fill="#ff5c97"/><rect x="316" y="470" width="40" height="106" fill="#cfaeff"/>
<rect x="360" y="484" width="30" height="92" fill="#6bf2e3"/><rect x="394" y="476" width="32" height="100" fill="#ff8ec7"/><rect x="430" y="490" width="30" height="86" fill="#4b5fe8"/>
</g>
<text x="300" y="150" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="700" fill="#241734" letter-spacing="6">ARCADIA LIBRARY</text>
<text x="300" y="232" text-anchor="middle" font-family="sans-serif" font-size="58" font-weight="700" fill="#241734">本棚のはじめかた</text>
<text x="300" y="690" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#241734">EPUB の本を集めて読む</text>
<text x="300" y="820" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="700" fill="#241734">Future OS 図書係</text>
</svg>
`;
const KEYS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="190" viewBox="0 0 420 190">
<rect x="1" y="1" width="418" height="188" rx="12" fill="#fffdf9" stroke="#241734" stroke-width="2"/>
<text x="24" y="58" font-family="sans-serif" font-size="22" fill="#241734">横書きの本</text>
<rect x="200" y="28" width="56" height="44" rx="8" fill="#e5dff0" stroke="#241734" stroke-width="2"/><text x="228" y="60" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#241734">←</text>
<rect x="268" y="28" width="56" height="44" rx="8" fill="#6bf2e3" stroke="#241734" stroke-width="2"/><text x="296" y="60" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#241734">→</text>
<text x="336" y="58" font-family="sans-serif" font-size="20" fill="#241734">次へ</text>
<text x="24" y="146" font-family="sans-serif" font-size="22" fill="#241734">縦書きの本</text>
<rect x="200" y="116" width="56" height="44" rx="8" fill="#ff8ec7" stroke="#241734" stroke-width="2"/><text x="228" y="148" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#241734">←</text>
<rect x="268" y="116" width="56" height="44" rx="8" fill="#e5dff0" stroke="#241734" stroke-width="2"/><text x="296" y="148" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#241734">→</text>
<text x="336" y="146" font-family="sans-serif" font-size="20" fill="#241734">前へ</text>
</svg>
`;
const GUIDE_CSS = `/* 本棚のはじめかた */
body { font-family: sans-serif; line-height: 1.8; }
h1 { font-size: 1.5em; margin: 0 0 0.8em; padding-bottom: 0.2em; border-bottom: 3px solid #6bf2e3; }
h2 { font-size: 1.15em; margin: 1.4em 0 0.4em; }
p { margin: 0 0 0.8em; }
.note { padding: 0.4em 0.8em; border-left: 4px solid #ff8ec7; background: #fff6e3; }
kbd { padding: 0 0.3em; border: 1px solid #241734; border-radius: 4px; font-family: inherit; }
table { border-collapse: collapse; margin: 0.6em 0 1em; }
caption { font-weight: bold; text-align: left; padding-bottom: 0.3em; }
th, td { border: 1px solid #b5a3ce; padding: 0.2em 0.6em; vertical-align: top; }
th { background: #f4eef8; }
figure { margin: 1em 0; text-align: center; }
figure img { width: 100%; max-width: 22em; height: auto; }
figcaption { font-size: 0.9em; color: #6e5d85; }
dt { font-weight: bold; margin-top: 0.6em; }
dd { margin: 0 0 0 1.5em; }
`;
const GUIDE = {
  file: '本棚のはじめかた.epub',
  id: 'urn:arcadia:books:sample-guide-1',
  title: '本棚のはじめかた',
  author: 'Future OS 図書係',
  lang: 'ja',
  ppd: 'ltr',
  css: GUIDE_CSS,
  cover: { href: 'images/cover.svg', type: 'image/svg+xml', data: GUIDE_COVER },
  images: [{ href: 'images/keys.svg', type: 'image/svg+xml', data: KEYS_SVG }],
  chapters: [
    { id: 'c1', title: 'はじめに', body: `<h1>はじめに</h1>
${ps([
  'この本は、Future OS の「本棚」の使い方を説明する見本の本です。本棚は、EPUB（イーパブ）という形の電子書籍を集めて読むアプリです。',
  'EPUB は、文章と画像と見た目の指定を、一つのファイルにまとめた形です。電子書籍のお店や、無料で読める本を集めた場所の多くで使われています。',
])}
<h2>この本で分かること</h2>
<ul><li>本を本棚に足す方法</li><li>ページをめくる方法</li><li>目次としおりの使い方</li><li>文字の大きさや色を、読みやすく変える方法</li></ul>
<p class="note">いま読んでいるこのページも、本棚が EPUB を開いて表示しています。ページの右の半分を押すか、<kbd>→</kbd> キーを押すと、次のページへ進みます。</p>` },
    { id: 'c2', title: '本を足す', body: `<h1>本を足す</h1>
<p>本棚に本を足す方法は三つあります。</p>
<ol><li>本棚の画面の「本を足す」を押し、パソコンの中の EPUB ファイルを選びます。</li><li>パソコンの EPUB ファイルを、本棚の窓へ引っぱって落とします。</li><li>デスクトップにある EPUB のアイコンを、本棚の窓へ落とします。</li></ol>
<p>足した本は、仮想ドライブの「/本」フォルダに入ります。ファイル マネージャで「/本」を開くと、本のファイルが並んでいます。</p>
<h2 id="remove">本を外す</h2>
<p>本を右クリックして「ゴミ箱へ入れる」を選ぶと、本棚から外れます。ゴミ箱から元に戻すこともできます。</p>
<h2>並べ方を変える</h2>
<p>本棚の上の「並べ替え」で、題名の順、著者の順、最近読んだ順を選べます。「表紙」と「一覧」のボタンで、表紙を並べる形と、行で並べる形を切り替えます。</p>
<p>本が増えたら、「探す」の欄に題名や著者の一部を入れてください。ひらがなとカタカナのどちらで入れても見つかります。</p>` },
    { id: 'c3', title: 'ページをめくる', body: `<h1>ページをめくる</h1>
<p>本を開くと、窓の大きさに合わせて、文章がページに分かれます。窓を大きくすると、一つのページに入る文字が増えます。</p>
<table><caption>めくり方の一覧</caption>
<thead><tr><th>やりたいこと</th><th>横書きの本</th><th>縦書きの本</th></tr></thead>
<tbody><tr><td>次のページ</td><td>→ キー、右の半分を押す</td><td>← キー、左の半分を押す</td></tr>
<tr><td>前のページ</td><td>← キー、左の半分を押す</td><td>→ キー、右の半分を押す</td></tr>
<tr><td>どちらの本でも次へ</td><td colspan="2">Space、PageDown、↓、ホイールを下へ回す</td></tr>
<tr><td>どちらの本でも前へ</td><td colspan="2">Shift+Space、PageUp、↑、ホイールを上へ回す</td></tr></tbody></table>
<p>縦書きの本は、右から左へ読み進めます。そのため、次のページは左にあり、<kbd>←</kbd> キーで進みます。</p>
<figure><img src="../images/keys.svg" alt="矢印キーの図。横書きの本では → が次へ、縦書きの本では ← が次へ。"/><figcaption>図　進む向きは本によって変わります</figcaption></figure>
<p>ページの両側の大きな矢印のボタンでもめくれます。ボタンの名前は、本の向きに合わせて「次へ」と「前へ」が入れ替わります。</p>` },
    { id: 'c4', title: '目次としおり', body: `<h1>目次としおり</h1>
<p>上の「目次」を押すと、左に章の一覧が出ます。読みたい章の名前を押すと、その章の最初のページへ移ります。</p>
<h2>しおり</h2>
<p>あとで読み返したいページでは、「しおり」を押して一覧を出し、「このページに挟む」を押します。挟んだしおりは一覧に並び、押すとそのページへ戻れます。要らなくなったしおりは「外す」で消せます。</p>
<h2>読んだ位置</h2>
<p>本を閉じると、どこまで読んだかを本棚が覚えます。次に同じ本を開くと、続きのページから始まります。本棚の表紙の下の細い帯は、どこまで読んだかの割合です。</p>
<p>読んだ位置としおりは、仮想ドライブの「/システム/本棚.json」に保存されます。ほかの章へのリンクも使えます。たとえば<a href="c2.xhtml#remove">「本を外す」の節</a>へ飛べます。</p>` },
    { id: 'c5', title: '読みやすくする', body: `<h1>読みやすくする</h1>
<p>「表示の設定」を押すと、読みやすさを変える欄が出ます。変えた結果は、すぐにページに出ます。</p>
<dl><dt>文字の大きさ</dt><dd>文字を大きくすると、一つのページに入る文字が減り、ページの数が増えます。</dd>
<dt>行の間</dt><dd>行と行の間を広げると、目で行を追いやすくなります。</dd>
<dt>余白</dt><dd>ページの周りの空きを、狭い・普通・広いから選びます。</dd>
<dt>書体</dt><dd>明朝は細い線の書体で、長い文章に向きます。ゴシックは、線の太さがそろった書体です。</dd>
<dt>地の色</dt><dd>白・クリーム・夜から選びます。夜は、暗い所で読むときに目が楽になります。</dd>
<dt>本の CSS</dt><dd>本に入っている見た目の指定を使うかどうかを選びます。本の見た目が読みにくいときは外してください。</dd>
<dt>文字の向き</dt><dd>ふつうは本の指定に合わせます。横書きの本を縦書きで読むこともできます。</dd></dl>
<p>これで説明は終わりです。もう一冊の見本「しおり坂の古本屋」は、縦書きでルビのある短い物語です。本棚へ戻って開いてみてください。</p>` },
  ],
};

/* ---------- 2 冊目: しおり坂の古本屋（縦書き・ルビ） ---------- */
const STORY_COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
<defs><linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140c24"/><stop offset="0.6" stop-color="#3b2a6b"/><stop offset="1" stop-color="#ff8ec7"/></linearGradient></defs>
<rect width="600" height="900" fill="url(#night)"/>
<g fill="#fff6e3"><circle cx="70" cy="90" r="3"/><circle cx="160" cy="170" r="2"/><circle cx="250" cy="60" r="2.5"/><circle cx="120" cy="300" r="2"/><circle cx="330" cy="140" r="2"/><circle cx="60" cy="420" r="2.5"/><circle cx="210" cy="380" r="2"/></g>
<circle cx="250" cy="200" r="46" fill="#fff6e3"/><circle cx="270" cy="188" r="44" fill="#2b1d4f"/>
<path d="M0 900V760L80 720L160 680L240 640L320 600L400 560L470 525V900Z" fill="#241734"/>
<g stroke="#cfaeff" stroke-width="3" fill="none"><path d="M10 780h70v-40h80v-40h80v-40h80v-40h80v-40h70"/></g>
<rect x="400" y="440" width="120" height="90" fill="#241734"/><path d="M388 444L460 392L532 444Z" fill="#241734"/>
<rect x="424" y="466" width="34" height="30" fill="#ffd37a"/><rect x="470" y="466" width="30" height="64" fill="#3b2a6b"/>
<circle cx="441" cy="481" r="40" fill="#ffd37a" fill-opacity="0.18"/>
<text x="540" y="70" writing-mode="tb-rl" font-family="serif" font-size="58" font-weight="700" fill="#fff6e3" letter-spacing="8">しおり坂の古本屋</text>
<text x="460" y="78" writing-mode="tb-rl" font-family="serif" font-size="28" fill="#cfaeff" letter-spacing="4">坂上 あかり</text>
</svg>
`;
const STORY_CSS = `/* しおり坂の古本屋: 縦書き */
html { -epub-writing-mode: vertical-rl; writing-mode: vertical-rl; }
body { line-height: 1.9; }
h1 { font-size: 1.3em; margin: 0 0 0 2em; }
p { margin: 0; text-indent: 0; }
p.gap { margin-left: 1em; }
.tcy { -epub-text-combine: horizontal; text-combine-upright: all; }
rt { font-size: 0.5em; }
`;
const STORY = {
  file: 'しおり坂の古本屋.epub',
  id: 'urn:arcadia:books:sample-story-1',
  title: 'しおり坂の古本屋',
  author: '坂上 あかり',
  lang: 'ja',
  ppd: 'rtl',
  css: STORY_CSS,
  cover: { href: 'images/cover.svg', type: 'image/svg+xml', data: STORY_COVER },
  images: [],
  chapters: [
    { id: 's1', title: '第一章　坂の上の灯り', body: `<h1>第一章　坂の上の灯り</h1>
${ps([
  '　町のはずれに、しおり坂と呼ばれる細い坂がある。石段が百二十段あって、のぼりきった所に、小さな古本屋が一軒だけ建っている。看板は雨と風で文字がうすれ、近くで見ても「…堂」としか読めない。',
  `　${r('小夜', 'さよ')}がその店を見つけたのは、秋のはじめの夕方だった。学校の帰りに道をまちがえ、気がつくと坂の下に立っていた。見上げると、坂のいちばん上で、窓がひとつだけ黄色く光っていた。`,
  `　石段をのぼるあいだ、小夜は段の数をかぞえた。百を過ぎたあたりで息が切れ、百二十でようやく平らな所に出た。${r('硝子', 'がらす')}戸の向こうには、天井まで届く本棚が何列も並んでいた。`,
  '　戸を引くと、鈴が一度だけ鳴った。',
  '「いらっしゃい。もう閉めるところだけれど、少しなら見ていっていいよ」',
  `　奥の机から、白い髪の店主が顔を上げた。丸い${r('眼鏡', 'めがね')}の奥の目が、棚の本と同じくらい古く、やさしく見えた。`,
  '　店の中は、外よりも少しだけあたたかかった。床板は歩くたびに小さくきしみ、どこかで時計が、ゆっくり時を刻んでいた。',
])}` },
    { id: 's2', title: '第二章　白い頁', body: `<h1>第二章　白い${r('頁', 'ページ')}</h1>
${ps([
  `　棚の本はどれも日に焼けて、古い紙のにおいがした。小夜は一冊ずつ${r('背表紙', 'せびょうし')}を指でなぞりながら歩き、いちばん奥の棚の前で足を止めた。`,
  `　そこに、題名のない本が一冊だけささっていた。表紙は${r('藍色', 'あいいろ')}の布で、角がすり切れている。開いてみると、中の${r('頁', 'ページ')}はすべて真っ白だった。`,
  '「それは、まだだれにも読まれていない本なんだ」',
  '　いつのまにか、店主がうしろに立っていた。',
  '「白いのに、読むんですか」',
  '「読む人がいると、少しずつ文字が出てくる。その人が覚えておきたいことを、本のほうが拾っていくんだよ」',
  `　小夜はもう一度、最初の頁を見た。さっきまで何もなかった所に、うすい${r('墨', 'すみ')}の色で、一行だけ文字が浮かんでいた。`,
  '　――百二十段目で、窓の灯りを見た。',
  '　小夜は息をのんで、店主の顔を見た。店主はただ、ゆっくりうなずいただけだった。',
])}` },
    { id: 's3', title: '第三章　栞の約束', body: `<h1>第三章　${r('栞', 'しおり')}の約束</h1>
${ps([
  '「この本、売ってもらえますか」',
  '　小夜がたずねると、店主は首を横にふった。',
  '「売り物ではないんだ。けれど、預けることはできる。読み終えたら、またここへ返しにおいで」',
  `　店主は机の引き出しから、細長い紙を一枚取り出した。押し花をはさんだ、手作りの${r('栞', 'しおり')}だった。`,
  '「読むのを休むときは、これをはさんでおくといい。どこまで読んだか、本が忘れないように」',
  `　小夜は本と栞を胸にかかえて、店を出た。外はもう${r('黄昏', 'たそがれ')}の色に変わっていて、坂の下の町に、灯りがひとつずつともりはじめていた。`,
  '　石段をおりながら、小夜はまた段の数をかぞえた。百二十、百十九、百十八。かぞえる声に合わせて、腕の中の本が、ほんの少しあたたかくなった気がした。',
  '　その夜、小夜は机の灯りの下で本を開いた。白い頁の二行目に、新しい文字が増えていた。',
  '　――帰り道の段の数は、行きと同じだった。',
  '　小夜は栞をそっとはさみ、本を閉じた。明日もまた、続きを読もうと思った。',
])}` },
  ],
};

export const SAMPLES = [GUIDE, STORY];
