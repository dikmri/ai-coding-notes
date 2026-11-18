# 4-2 動き続ける絵

## 場面

ミナが、画面のだいだい色の四角を指でつついています。
ミナ「この車、いつになったら走り出すの？」
ゲンさん「絵を少しずつずらして描き直せば、動いて見える。ただ、祭りの会場のパソコンは古い。工場のパソコンと同じ動きにならないと、競争にならないな」
イコちゃん「どのパソコンでも、同じ刻みで計算する方法があります。ファイルも分けて、整理しながら作りましょう」

## 今回の目標

1/60 秒ごとに計算して、画面の書き換えごとに描くループ（loop）を `game/loop.js` に作ります。それを使って、車の四角を上へ動かします。

## 手順

### 1. ループのファイルを作る

ファイルの一覧の「新しいファイル」を押し、名前に `game/loop.js` と入れます。できたファイルに、次のコードを全部書きます。

```js
// ゲームのループ（固定の時間刻み）。
// 計算（update）はいつも同じ時間の刻み（1/60 秒）で進め、描く（draw）のは画面の書き換えごとに 1 回。
// 画面の書き換えの速さ（60 回・144 回など）が違っても、車の動きは同じになる。

export const STEP_SECONDS = 1 / 60;
const MAX_STEPS = 5; // 遅れたときに、1 回でまとめて進める刻みの上限（止まった後に飛ばないように）

export function startLoop(update, draw) {
  let last = performance.now();
  let stored = 0; // まだ進めていない時間（秒）
  function frame(now) {
    stored += (now - last) / 1000;
    last = now;
    let steps = 0;
    while (stored >= STEP_SECONDS && steps < MAX_STEPS) {
      update(STEP_SECONDS);
      stored -= STEP_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS) stored = 0;
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
```

保存します。このファイルはループの道具を用意するだけなので、まだ画面は変わりません。`export` を付け忘れると、手順 2 の `import` の行がエラーになります。

### 2. main.js を書き換える

`game/main.js` を開き、中身を全部、次のコードに書き換えます。4-1 の太陽は、ここでいったんなくなります。

```js
// 峠のゲーム（第 4 部で少しずつ作る）

import { startLoop } from './loop.js';

const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d');

// 車の状態: 画面の上の位置（画素）と、上へ進む速さ（画素毎秒）
const state = {
  x: 480,
  y: 520,
  speed: 120,
};

// 計算: 時間 seconds だけ進める。画面の上の端を越えたら、下の端へ戻す
function update(seconds) {
  state.y -= state.speed * seconds;
  if (state.y < -40) state.y = canvas.height;
}

// 描く: 毎回、草から描き直す
function draw() {
  context.fillStyle = '#3f5a33';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#6b6560';
  context.fillRect(440, 0, 80, canvas.height);
  context.fillStyle = '#c8582a';
  context.fillRect(state.x - 10, state.y - 20, 20, 40);
}

startLoop(update, draw);

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { state };
```

### 3. 動きを見る

保存して動かします。だいだい色の四角が、道の上を一定の速さで上へ進みます。上の端から出ると、下の端からまた出てきます。これがくり返されれば正しいです。

## しくみ

### 描き直すと動いて見える

3-7 で使った `requestAnimationFrame` は、次に画面を書き換える前に、渡した関数を呼びます。多くの画面は、1 秒に 60 回書き換えます。毎回、少しずらした位置に描き直すと、車が動いて見えます。

`draw` は、毎回まず草と道を塗り直します。塗り直さないと、前に描いた車がそのまま残ります。

### 固定の時間刻み（fixed time step）

画面の書き換えの速さは、機械によって違います。1 秒に 60 回の画面も、144 回や 30 回の画面もあります。3-8 のラップタイマーは、書き換えのたびに、前からの時間で計算していました。この方法だと、機械ごとに計算の刻みが変わり、結果が少しずつずれます。パソコンが 0.5 秒止まると、車は 0.5 秒分を一度に進みます。

`loop.js` は、計算をいつも 1/60 秒（`STEP_SECONDS`）の刻みで進めます。

1. 書き換えのたびに、前の書き換えからの時間を `stored` に足す
2. `stored` が 1/60 秒以上ある間、`update(STEP_SECONDS)` を呼んで、`stored` から 1/60 秒を引く
3. 最後に `draw()` を 1 回呼ぶ

| 画面の書き換え | 書き換え 1 回あたりの計算 |
|---|---|
| 1 秒に 60 回 | ほぼ 1 回 |
| 1 秒に 144 回 | 2〜3 回の書き換えに 1 回 |
| 1 秒に 30 回 | 2 回 |

どの画面でも、計算は 1 秒に 60 回、同じ刻みで進みます。同じ操作をすれば、どのパソコンでも同じ計算結果になります。

`MAX_STEPS` は、1 回の書き換えでまとめて進める計算の上限です。プレビューを隠すと書き換えが止まり、`stored` が大きくたまります。戻ったときに何百回も計算すると、車が遠くへ飛んでしまいます。そこで、5 回進めても追いつかないときは、残りを 0 にします。

### while と ++

`while (条件) { … }` は、条件が成り立つ間、中をくり返します。`steps++` は `steps = steps + 1` と同じで、`steps` を 1 増やします。`&&` は「かつ」で、両方が成り立つときだけ続けます。

### ファイルを分ける（モジュール）

JavaScript のファイル 1 つ 1 つを、モジュール（module）と呼びます。3-2 から関数に付けてきた `export` は、ほかのファイルが使えるように書き出す印です。使う側は `import { startLoop } from './loop.js';` のように、名前を書いて読み込みます（import）。`game.html` の `script` に `type="module"` が付いているので、`main.js` で `import` を使えます。

`'./loop.js'` の `./` は、「このファイルと同じフォルダ」という意味です。`main.js` も `loop.js` も、`game` フォルダにあります。

`export` を付けていない `MAX_STEPS` は、`loop.js` の中だけで使えます。ループの細かい決まりは `loop.js` に置き、`main.js` にはゲームの中身だけを書きます。

### 計算と描くことを分ける

`state` は、ゲームの中で変わる値をまとめたオブジェクトです（3-5）。`update` は `state` を変えるだけで、描きません。`draw` は `state` を読んで描くだけで、値を変えません。この分け方を、このあとの課でも続けます。

## 答え合わせ

- ループの関数 startLoop を作り、export した
- 計算の刻みが 1/60 秒（STEP_SECONDS）
- 車が時間とともに動いている

通らないときは、`loop.js` の 2 つの `export` と、`main.js` の `import` の行を見直します。「手本との違い」ボタンでも比べられます。

## 変えてみよう

### 1. 倍の速さ

車が今の 2 倍の速さで上へ進むようにします。

:::answer
`state` の `speed` を `120` から `240` にします。1 秒に 240 画素進むので、画面を通り抜ける時間が半分になります。
:::

### 2. 描き直さないと

`draw` の最初の 4 行（草と道を塗る 2 組）を消すと、どう見えるでしょう。予想してから試します。

:::answer
車の通った跡が、だいだい色の太い帯になって残ります。キャンバスは、前に塗った画素をそのまま持っています。毎回草から描き直すのは、そのためです。試したら元に戻します。
:::

### 3. 太陽を戻す

4-1 の太陽を、`draw` の中で描くようにします。

:::answer
`draw` の終わり（車の四角の後）に足します。

```js
  context.fillStyle = '#fff1c8';
  context.beginPath();
  context.arc(820, 90, 40, 0, Math.PI * 2);
  context.fill();
```

`draw` の外に書くと、最初に 1 回描くだけです。次の書き換えで、草に塗りつぶされます。
:::

## 次回への引き

ミナ「動いた！ でも、まっすぐ上にしか行かないね。ハンドルを切りたいよ」
ゲンさん「車には向きがある。次は、向いている方へ進むようにしよう」
