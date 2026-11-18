# 4-5 コースを点で書く

## 場面

ゲンさんが、古いフォルダのメモを開きました。道の曲がり角ごとに、2 つの数が並んでいます。
ゲンさん「スタートの線を 0 にして、そこから東と南へ何 m かを書いたものだ。昔、子どもたちの練習用に描いた道でな。本物の峠よりずっと短いがね」
ミナ「この数を線でつないだら、道になるね！」
イコちゃん「そうですね。点の並びで道を書きましょう。車がいつも画面の真ん中に来るように描けば、外へ出て見えなくなることもありません」

## 今回の目標

コースを点の配列で書き、幅 12 m の道として描きます。描くときは車を画面の真ん中に置き、まわりの道の方を動かします。

## 手順

### 1. コースのファイルを作る

「新しいファイル」で `game/course.js` を作り、次のコードを書きます。

```js
// 峠のコース（画面に関係しない、ただの計算）。
// コースは点の並びで書き、点と点を直線でつないだ道とする（最後の点は最初の点へつながる）。
// 位置はメートル。画面の上が北で、y は下が正。

export const ROAD_WIDTH = 12; // 道の幅（メートル）

export const COURSE = [
  [0, 0], [0, -90], [5, -140], [25, -170], [55, -175], [75, -155], [70, -125], [90, -90],
  [120, -80], [145, -95], [150, -130], [140, -175], [150, -220], [190, -250], [240, -245],
  [275, -215], [285, -160], [270, -100], [240, -50], [200, -10], [150, 20], [90, 35], [40, 30], [10, 15],
];

// 1 周の長さ（メートル）
export function courseLength(course) {
  let total = 0;
  for (let i = 0; i < course.length; i++) {
    const [ax, ay] = course[i];
    const [bx, by] = course[(i + 1) % course.length];
    total += Math.hypot(bx - ax, by - ay);
  }
  return total;
}
```

`COURSE` の数は、写し間違えやすい所です。1 つでも違うと、道の形が変わります。

### 2. 描くファイルを作る

「新しいファイル」で `game/draw.js` を作ります。4-3 で `main.js` に書いた `drawCar` は、こちらへ移します。

```js
// 描く: 車を真ん中にして、上から見た峠を描く（画面の上が北）。
// 世界の位置（メートル）を、画面の位置（画素）へ直す: 画素 = (メートル - 車の位置) × SCALE + 画面の真ん中

import { CAR } from './car.js';
import { ROAD_WIDTH } from './course.js';

const SCALE = 6; // 1 メートルを何画素で描くか

export function drawWorld(context, course, car) {
  const { width, height } = context.canvas;
  context.fillStyle = '#3f5a33'; // 草
  context.fillRect(0, 0, width, height);

  context.save();
  context.translate(width / 2, height / 2);
  context.scale(SCALE, SCALE);
  context.translate(-car.x, -car.y);

  // 道: 点をつないだ太い線
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = '#6b6560';
  context.lineWidth = ROAD_WIDTH;
  tracePath(context, course);
  context.stroke();
  // 道の真ん中の白い点線
  context.strokeStyle = '#efe6da';
  context.lineWidth = 0.3;
  context.setLineDash([3, 3]);
  tracePath(context, course);
  context.stroke();
  context.setLineDash([]);
  // スタートの線
  const [sx, sy] = course[0];
  context.fillStyle = '#ffffff';
  context.fillRect(sx - ROAD_WIDTH / 2, sy - 0.5, ROAD_WIDTH, 1);

  drawCar(context, car);
  context.restore();
}

// 点の並びを、閉じた線として道筋に入れる
function tracePath(context, course) {
  context.beginPath();
  context.moveTo(course[0][0], course[0][1]);
  for (const [x, y] of course) context.lineTo(x, y);
  context.closePath();
}

// 車: 向きの分だけ回した四角と、前の窓
function drawCar(context, car) {
  context.save();
  context.translate(car.x, car.y);
  context.rotate(car.heading);
  context.fillStyle = '#c8582a';
  context.fillRect(-CAR.WIDTH / 2, -CAR.LENGTH / 2, CAR.WIDTH, CAR.LENGTH);
  context.fillStyle = '#1d1a24';
  context.fillRect(-CAR.WIDTH / 2 + 0.2, -CAR.LENGTH / 2 + 0.6, CAR.WIDTH - 0.4, 0.8);
  context.restore();
}
```

1 行目の `import { CAR } from './car.js';` を忘れると、`CAR is not defined` のエラーが出ます。

### 3. main.js を書き換える

`game/main.js` の中身を全部、次のコードに書き換えます。`SCALE` と `drawCar` は `draw.js` へ移ったので、`main.js` からはなくなります。

```js
// 峠のゲーム（第 4 部で少しずつ作る）

import { startLoop } from './loop.js';
import { keys } from './input.js';
import { createCar, updateCar } from './car.js';
import { COURSE } from './course.js';
import { drawWorld } from './draw.js';

const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d');
const START_X = COURSE[0][0];
const START_Y = COURSE[0][1] - 3; // スタートの線の 3 m 先

const state = {
  car: createCar(START_X, START_Y, 0),
};

function update(seconds) {
  updateCar(state.car, keys, seconds);
}

function draw() {
  drawWorld(context, COURSE, state.car);
}

startLoop(update, draw);

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { state };
```

### 4. 走らせる

保存して動かします。灰色の道が上へのび、真ん中に白い点線があります。車は道の真ん中で、白いスタートの線の少し先にいます。↑ で走ると、車は画面の真ん中のままで、道と草が下へ動きます。道に沿って 1 周すると、スタートの線に戻ってきます。

## しくみ

### 点の配列でコースを書く

`COURSE` は点の配列です。1 つの点は `[x, y]` という 2 つの数の配列で、単位はメートルです。点と点を直線でつなぎ、最後の点は最初の点へつなぎます。曲がり角に点を細かく置くほど、なめらかなカーブになります。

### 1 周の長さ

`courseLength` は、隣り合う点の距離を全部足します。

- `for (let i = 0; i < course.length; i++)` は、`i` を 0 から 1 ずつ増やし、点の数より小さい間くり返します。`for...of` と違い、何番目かの番号 `i` を使えます
- `(i + 1) % course.length` は、次の点の番号です。最後の点（23 番）では 24 % 24 = 0 になり、最初の点へ戻ります
- `const [ax, ay] = course[i];` は、配列の 1 つ目を `ax` に、2 つ目を `ay` に入れます。この書き方を分割代入（destructuring）と呼びます
- `Math.hypot(横, 縦)` は、三平方の定理で斜めの長さを返します。横 3、縦 4 なら 5 です

このコースは、1 周が約 1,095 m です。本物の夕暮れ峠（1,981 m）の、半分より少し長い道です。

### 車を真ん中にするカメラ

`drawWorld` は、3 つの変換を順に重ねます。

| 順番 | 書き方 | すること |
|---|---|---|
| 1 | `translate(width / 2, height / 2)` | 原点を画面の真ん中へ動かす |
| 2 | `scale(SCALE, SCALE)` | 1 m を 6 画素にする |
| 3 | `translate(-car.x, -car.y)` | 世界を、車の位置の分だけ逆へずらす |

まとめると、画素 = (メートル - 車の位置) × SCALE + 画面の真ん中 です。車のいる所は、いつも画面の真ん中に来ます。車が進むと、まわりの道が逆向きに動いて見えます。この役目をする仕組みを、カメラ（camera）と呼びます。

画面には、横 160 m（960 ÷ 6）、縦 100 m（600 ÷ 6）の広さが入ります。

`const { width, height } = context.canvas;` は、キャンバスの `width` と `height` を、同じ名前の変数に入れます。オブジェクトの分割代入です。

### 線で道を描く

`stroke` は、道筋の線をなぞって描きます。`fill` が内側を塗るのに対して、`stroke` は線を引きます。線の太さ `lineWidth` を `ROAD_WIDTH` の 12 にすると、変換で 6 倍され、画面では 72 画素の太さになります。

- `moveTo` はペンを線を引かずに動かし、`lineTo` は線を引きながら動かします。`closePath` は最初の点へ線を戻します
- `lineJoin = 'round'` は、線の折れ目を丸くつなぎます
- `setLineDash([3, 3])` は、3 m 描いて 3 m あける点線にします。描き終えたら `[]` で元に戻します

`tracePath` は、道筋を作るだけの関数です。同じ道筋を、灰色の太い線と白い点線で 2 回なぞります。

### スタートの線と車の位置

スタートの線は、最初の点 `COURSE[0]` に横向きに描いた、幅 12 m・厚さ 1 m の白い四角です。車は、線の 3 m 先（y を 3 減らした所）に置きます。3 m 先にする理由は、4-7 で説明します。

## 答え合わせ

- コースの点（COURSE）が 10 個以上ある
- 1 周の長さを求める courseLength が、点と点の距離を足している
- 画面の真ん中（車のいる所）が道の色で、車が見える

通らないときは、`courseLength` の `Math.hypot` の行と、`draw.js` の 3 つの変換を見直します。「手本との違い」ボタンでも比べられます。

## 変えてみよう

### 1. 1 周の長さを出す

`main.js` で `courseLength` を読み込み、`COURSE` の 1 周の長さをコンソールに出します。

:::answer
`course.js` の `import` の行に `courseLength` を足します。

```js
import { COURSE, courseLength } from './course.js';
```

ファイルの終わりに足します。

```js
console.log('1 周', courseLength(COURSE), 'm');
```

`1095.004…` と出ます。
:::

### 2. 遠くまで見る

`draw.js` の `SCALE` を 3 にすると、どう見えるでしょう。

:::answer
道も車も半分の大きさになり、横 320 m・縦 200 m の広さが見えます。先のカーブが早く見えるかわりに、車は小さくなります。試したら 6 に戻します。
:::

### 3. 曲がり角を足す

`COURSE` の 2 つ目の点 `[0, -90]` の後ろに、`[-20, -115]` を足すと、道はどう変わるでしょう。

:::answer
2 つ目の点から、いったん西（左）へ寄ってから、次の点 `[5, -140]` へ戻る道になります。1 周の長さも少しのびます。点の数が変わると 4-7 の周回の数え方に関わるので、試したら消しておきます。
:::

## 次回への引き

ミナ「見て！ 草の上をまっすぐ走れば、いちばんの近道だよ！」
ゲンさん「本物の草の上はタイヤが滑るから、そううまくはいかないんだがな」
