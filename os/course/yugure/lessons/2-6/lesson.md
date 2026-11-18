# 2-6 色を変数にする

## 場面
祭りの前の晩に、暗いテントの中で看板を映してみました。白い看板だけが、まぶしく光って見えます。

ミナ「まぶしくて、目がしょぼしょぼするよ」
ゲンさん「夜の色に塗り直すとなると、赤茶色を書いた所を、ひとつずつ探して直すのかい」
イコちゃん「色に名前を付けて 1 か所にまとめれば、値を入れ替えるだけで済みます。暗い画面のときの色も、そこで決めましょう」

## 今回の目標
看板の色を変数（カスタムプロパティ）にまとめ、暗い配色のときの色を用意します。最後に、表・キー・ボタンの見た目も整えます。

## 手順
### 1. 色の変数を決める
style.css のいちばん上のコメントの行を、次のように書き換えます。その下に、`:root` の規則を足します。

```css
/* 看板の見た目。色は変数（カスタムプロパティ）にまとめ、暗い配色のときは値だけを入れ替える */
:root {
  --color-page: #fbf6ec;
  --color-text: #2b2420;
  --color-accent: #c8582a;
  --color-card: #ffffff;
  --color-line: #e3d6c3;
}
```

保存して動かします。変数を決めただけなので、見た目はまだ変わりません。

### 2. 色を変数で書き換える
色の値を直に書いていた 5 つの規則で、値を `var(--変数の名前)` に書き換えます。`var()` は、変数にしまった値を取り出す書き方です。まず body、h1、h2 の 3 つです。

```css
body {
  margin: 0;
  background: var(--color-page);
  color: var(--color-text);
  font-family: system-ui, sans-serif;
  line-height: 1.7;
}

h1 {
  margin: 0;
  color: var(--color-accent);
  font-size: 2.2rem;
}

h2 {
  border-bottom: 2px solid var(--color-accent);
}
```

section と `.cards li` の規則も、同じように書き換えます。

```css
section {
  margin-bottom: 24px;
  padding: 16px;
  border: 1px solid var(--color-line);
  border-radius: 12px;
  background: var(--color-card);
}
```

```css
.cards li {
  flex: 1 1 200px;
  padding: 12px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
}
```

保存して動かします。値は前と同じなので、見た目は変わりません。速度の札の色は絵の上に乗るので、変数にせずそのままにします。

ためしに、`:root` の `--color-accent` を `#2f5fa8` に変えてみましょう。大見出しの色と中見出しの線が、両方とも青になります。1 か所を変えるだけで、同じ変数を使う所がすべて変わります。

この色は、課の終わりにも使います。好きな色のままにしても、`#c8582a` に戻してもかまいません。手順のコードは `#c8582a` で書いています。

### 3. 暗い配色を用意する
`:root` の規則の最初に `color-scheme` の行を足します。その下に、暗い配色のときの規則を足します。

```css
:root {
  color-scheme: light dark;
  --color-page: #fbf6ec;
  --color-text: #2b2420;
  --color-accent: #c8582a;
  --color-card: #ffffff;
  --color-line: #e3d6c3;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-page: #1d1a24;
    --color-text: #efe6da;
    --color-accent: #f0915a;
    --color-card: #2a2533;
    --color-line: #463d52;
  }
}
```

index.html の `<head>` にも、1 行足します。場所は viewport の行の下です。

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>夕暮れ峠をもう一度</title>
  <link rel="stylesheet" href="style.css">
</head>
```

保存して動かします。パソコンが明るい配色のときは、見た目は変わりません。

暗い配色を見るには、パソコンの設定で、色のモードを「ダーク」にします。Windows 11 では、「設定」の「個人用設定」から「色」を開きます。プレビューの看板が、紫がかった暗い地に明るい字の配色に変われば、正しくできています。見終わったら、設定は元に戻してかまいません。

### 4. 表とキーの見た目を整える
style.css の最後（`.meter` の規則の下）に足します。

```css
table {
  border-collapse: collapse;
  width: 100%;
}

th,
td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-line);
  text-align: left;
}

kbd {
  padding: 1px 6px;
  border: 1px solid var(--color-line);
  border-radius: 4px;
  font-family: ui-monospace, monospace;
}
```

保存して動かします。操作の表が箱の幅いっぱいに広がり、行と行の間に細い線が引かれます。キーの名前は、角の丸い小さな枠で囲まれます。

### 5. ボタンと箱の見た目を整える
続けて、style.css の最後に足します。

```css
.button,
button {
  display: inline-block;
  padding: 8px 20px;
  border: 0;
  border-radius: 999px;
  background: var(--color-accent);
  color: #fff;
  font: inherit;
  font-weight: bold;
  text-decoration: none;
  cursor: pointer;
}

.button:focus-visible,
button:focus-visible {
  outline: 3px solid var(--color-text);
  outline-offset: 2px;
}

[popover] {
  max-width: 320px;
  padding: 16px;
  border: 1px solid var(--color-line);
  border-radius: 12px;
  background: var(--color-card);
  color: var(--color-text);
}
```

保存して動かします。「峠を走る」などの 2 つのリンクと「作った人たち」のボタンが、看板の色の丸いボタンになります。Tab キーで選ぶと、ボタンのまわりに太い線が出ます。「作った人たち」を押して開く箱は、カードと同じ色と角の丸みになります。

## しくみ
### カスタムプロパティと var()
`--` で始まる名前のプロパティを、カスタムプロパティ（custom property）と呼びます。CSS 変数とも呼びます。名前は自分で付け、そこに値をしまっておけます。

しまった値は、`var(--color-accent)` のように書いて取り出します。ブラウザは、その場所に変数の値を入れて読みます。変数の名前を 1 文字でも間違えると値が見つからず、その宣言の色は使われません。

### :root と継承
`:root` は、ページのいちばん外側の要素（html）を選ぶセレクタです。カスタムプロパティは、color と同じように中の要素へ継承されます。そのため、`:root` に決めた変数は、ページのどの要素からでも使えます。

### 暗い配色の条件
`@media (prefers-color-scheme: dark)` は、「見る人のパソコンが暗い配色を選んでいる」という条件です。この中では、変数の値だけを入れ替えています。body や h1 の規則は 1 つのままで、暗いときは入れ替えた値を読みます。

`color-scheme: light dark` は、このページが明るい配色と暗い配色の両方に対応していることを、ブラウザに伝えます。するとブラウザは、スクロールバーなど自分で描く部品も、暗い配色に合わせます。

`<meta name="color-scheme">` は、同じことを HTML で伝えます。ブラウザは CSS より先にこの行を読みます。そのため、暗い配色でページを開いた瞬間に、白く光ることが減ります。

### 新しく出てきたセレクタ
| 書き方 | 選ぶ要素 |
|---|---|
| `.button:focus-visible` | 名札が button の要素のうち、Tab キーなどで選ばれているもの |
| `[popover]` | popover の属性を持つ要素 |

`:focus-visible` のように `:` で始まるものを、疑似クラス（pseudo-class）と呼びます。要素の状態で選びます。`[popover]` のように `[` と `]` で囲むものを、属性セレクタ（attribute selector）と呼びます。

### 表とボタンの決まり
- `border-collapse: collapse` は、隣り合うますの枠を 1 本にまとめます
- リンク（a）は、文字の行の中に並ぶ要素です。`display: inline-block` にすると、行の中に置いたまま、padding の分の場所を取ります
- `text-decoration: none` は、リンクの下線を消します
- button は、最初はページの文字の形を受け継ぎません。`font: inherit` で、外側の要素と同じ文字にします
- `cursor: pointer` は、上にマウスを乗せたときの矢印を、指の形にします

## 答え合わせ
- 色の変数（--color-accent）を :root に決めた
- 大見出しの色が、変数の色になっている
- 暗い配色のときの色（prefers-color-scheme: dark）を用意した
- 明るい・暗いの両方に対応すると伝えている（color-scheme）

通らないときは、変数の名前の `--` と、`var(` と `)` の組を見直してください。「手本との違い」で手本と見比べることもできます。

全部通ると、OS の色が、あなたの決めた `--color-accent` の色に変わります。元の色には、講座の窓のメニュー「講座」の「OS の色を元に戻す」で戻せます。

## 変えてみよう
### 1. 夜の看板の色を選ぶ
暗い配色のときの `--color-accent` を変えて、夜の看板の色を選んでみましょう。

:::answer
暗い配色の `:root` の中の 1 行を変えます。たとえば `#7fc8f8` は明るい水色です。

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-page: #1d1a24;
    --color-text: #efe6da;
    --color-accent: #7fc8f8;
    --color-card: #2a2533;
    --color-line: #463d52;
  }
}
```

暗い地の上では、明るい色の字のほうが読みやすくなります。
:::

### 2. ボタンの字を読みやすくする
暗い配色では、看板の色（`#f0915a`）が明るいので、ボタンの白い字が読みにくくなります。ボタンの字の色を変数にして、暗い配色のときは暗い字にしてみましょう。

:::answer
2 つの `:root` に、変数を 1 つずつ足します。

```css
:root {
  color-scheme: light dark;
  --color-page: #fbf6ec;
  --color-text: #2b2420;
  --color-accent: #c8582a;
  --color-card: #ffffff;
  --color-line: #e3d6c3;
  --color-on-accent: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-page: #1d1a24;
    --color-text: #efe6da;
    --color-accent: #f0915a;
    --color-card: #2a2533;
    --color-line: #463d52;
    --color-on-accent: #1d1a24;
  }
}
```

ボタンの規則の `color` を、変数で書き換えます。

```css
.button,
button {
  display: inline-block;
  padding: 8px 20px;
  border: 0;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font: inherit;
  font-weight: bold;
  text-decoration: none;
  cursor: pointer;
}
```

字の色と地の色の明るさの差が大きいほど、字は読みやすくなります。
:::

## 次回への引き
答え合わせが通ると、OS の色が看板の色に変わりました。
ミナ「看板の色が、パソコンの色になっちゃった！」
ゲンさん「看板はこれで仕上がりだ。次は車の計器だな。速度計を動かしてくれるかい」
