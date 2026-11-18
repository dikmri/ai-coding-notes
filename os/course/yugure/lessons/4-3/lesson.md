# 4-3 車を走らせる

## 場面

ミナ「この四角、ずっと上に行くだけだよ。これじゃ車じゃないみたい」
ゲンさん「本物の車は、向いている方へ進む。ハンドルを切れば向きが変わって、進む方も変わるんだ」
イコちゃん「車の位置と速さと向きを、数で持ちましょう。矢印キーで操れるようにもします」

## 今回の目標

矢印キーでアクセルとハンドルを操作します。車は向いている方へ進み、向きに合わせて回った姿で描かれます。

## 手順

### 1. キーを覚えるファイルを作る

「新しいファイル」で `game/input.js` を作り、次のコードを書きます。

```js
// キーボード: 押されているキーを覚えておく。ゲームは毎回の計算でこれを読む
export const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
};

const NAMES = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

document.addEventListener('keydown', (event) => {
  const name = NAMES[event.key];
  if (name) {
    keys[name] = true;
    event.preventDefault(); // 矢印キーでページが動かないように
  }
});

document.addEventListener('keyup', (event) => {
  const name = NAMES[event.key];
  if (name) keys[name] = false;
});
```

3-7 の速度計と同じく、キーを押したら `true` にし、放したら `false` に戻します。

### 2. 車の動きのファイルを作る

「新しいファイル」で `game/car.js` を作り、次のコードを書きます。

```js
// 車の動き（画面に関係しない、ただの計算）。
// 位置は メートル、向き（heading）は北が 0 で右回りが正の角度（ラジアン）。画面の上が北。
// 前へ進む向きは (sin(向き), -cos(向き))。画面の y は下が正なので、北へ進むと y が減る。

export const CAR = {
  ACCELERATION: 4, // アクセルを踏んだときに増える速さ（メートル毎秒毎秒）。速くなるほど減る
  MAX_SPEED: 47.5, // いちばん速い速さ（メートル毎秒。時速 171 km）
  TURN_RATE: 1.5, // ハンドルをいっぱいに切ったときに、1 秒で回る角度（ラジアン）
  LENGTH: 4.1, // 車の長さ（メートル）
  WIDTH: 1.7,
};

export function createCar(x, y, heading) {
  return { x, y, heading, speed: 0 };
}

// 時間 seconds だけ車を進める。input は { up, left, right }
export function updateCar(car, input, seconds) {
  // 速さ: アクセルは速くなるほど効きにくい（いちばん速い速さに近づくと 0 になる）
  if (input.up) car.speed += CAR.ACCELERATION * (1 - car.speed / CAR.MAX_SPEED) * seconds;

  // 向き: 右へ切ると角度が増え、左へ切ると減る
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  car.heading += steer * CAR.TURN_RATE * seconds;

  // 位置: 向いている方へ、速さ × 時間だけ進む
  car.x += Math.sin(car.heading) * car.speed * seconds;
  car.y -= Math.cos(car.heading) * car.speed * seconds;
  return car;
}
```

最後の 2 行の `+=` と `-=` を逆にすると、↑ で下へ進んでしまいます。

### 3. main.js を書き換える

`game/main.js` の中身を全部、次のコードに書き換えます。4-2 の `state` の `x`・`y`・`speed` は、車のオブジェクト 1 つに置き換わります。

```js
// 峠のゲーム（第 4 部で少しずつ作る）

import { startLoop } from './loop.js';
import { keys } from './input.js';
import { CAR, createCar, updateCar } from './car.js';

const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d');
const SCALE = 6; // 1 メートルを何画素で描くか

const state = {
  car: createCar(0, 0, 0), // 画面の真ん中から、北を向いて
};

function update(seconds) {
  updateCar(state.car, keys, seconds);
}

function draw() {
  context.fillStyle = '#3f5a33';
  context.fillRect(0, 0, canvas.width, canvas.height);
  // 画面の真ん中を、世界の位置 (0, 0) にし、1 メートルを SCALE 画素で描く
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(SCALE, SCALE);
  drawCar(context, state.car);
  context.restore();
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

startLoop(update, draw);

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { state };
```

### 4. 走らせる

保存して動かします。草の真ん中に、上を向いた車が止まっています。前の窓（黒い帯）が付いている方が前です。プレビューの中を一度クリックしてから、キーを押します。

- ↑ を押している間、車は前へ進み、だんだん速くなる
- ← と → で車が回り、回った向きへ進む

こう動けば正しいです。止まっていても回ってしまう点と、画面の外へ出てしまう点は、4-4 と 4-5 で直します。

## しくみ

### メートルで考えて、画素で描く

`car.js` の位置はメートル（m）、速さはメートル毎秒（m/s）です。画面の画素とは別に、本物の車と同じ単位で計算します。描くときに、`SCALE` で 1 m を 6 画素に直します。車の長さ 4.1 m は、画面では約 25 画素です。

アクセルの式は、速くなるほど速さの増え方が小さくなります。止まっているときは、1 秒に 4 m/s 増えます。いちばん速い 47.5 m/s（時速 171 km）では、増え方が 0 になります。この式で計算すると、0 から時速 100 km まで約 10.4 秒かかります。ゲンさんの車と同じです。

### 向き（heading）とラジアン

向きは、北（画面の上）を 0 とし、右回りに増える角度で持ちます。単位は、4-1 の `arc` と同じラジアンです。1 周が 2π（約 6.28）なので、東（右）は π/2（約 1.57）です。

### sin と cos で進む向きを出す

`Math.sin`（サイン）と `Math.cos`（コサイン）は、角度から、その向きの横と縦の割合を返します。向いている方へ 1 m 進むとき、x は sin(向き) だけ、y は -cos(向き) だけ変わります。

| 向き | 方角 | sin(向き) | -cos(向き) | 進む方 |
|---|---|---|---|---|
| 0 | 北 | 0 | -1 | 上（y が減る） |
| π/2 | 東 | 1 | 0 | 右（x が増える） |
| π | 南 | 0 | 1 | 下（y が増える） |
| -π/2 | 西 | -1 | 0 | 左（x が減る） |

画面の y は下が正なので、北へ進むと y が減ります。`car.y -= Math.cos(...)` と引いているのは、そのためです。1 回の計算で、速さ × 時間の距離を、この割合で進みます。

### 条件 ? A : B

`input.right ? 1 : 0` は、`input.right` が `true` なら 1 になり、そうでなければ 0 になります。この書き方を、条件演算子（conditional operator）と呼びます。右だけを押せば `steer` は 1、左だけなら -1、両方か何も押さないなら 0 です。

### 座標を動かす（translate・scale・rotate）

Canvas では、描く前に座標そのものを動かせます（変換、transform）。

| 書き方 | すること |
|---|---|
| `translate(x, y)` | 原点 (0, 0) を (x, y) へ動かす |
| `scale(a, b)` | 横を a 倍、縦を b 倍にする |
| `rotate(角度)` | 原点のまわりで、座標を右回りに回す |

`draw` は、まず原点を画面の真ん中へ動かし、1 を 6 画素にします。これで、メートルの値のまま描けます。`drawCar` は、さらに原点を車の位置へ動かし、車の向きの分だけ回します。そこで原点を真ん中にした四角を描くと、回った車になります。

`save` は今の変換を覚え、`restore` は覚えた所へ戻します。`drawCar` の終わりで戻さないと、そのあとに描く物まで回ってしまいます。

### そのほかの書き方

- `{ x, y, heading, speed: 0 }` は、`{ x: x, y: y, heading: heading, speed: 0 }` の短い書き方です
- `event.preventDefault()` は、キーが本来することを止めます。矢印キーでページが上下に動かなくなります
- `NAMES[event.key]` は、キーの名前から `'up'` などを引きます。表にないキーでは `undefined` になり、`if (name)` を通りません

## 答え合わせ

- アクセル（↑）を 1 秒押すと、北（画面の上、y が減る向き）へ進む
- 右へ切ると向き（heading）が増える
- 東（向き π/2）を向いて進むと、x が増える

通らないときは、`car.js` の `Math.sin` と `Math.cos` の 2 行を見直します。「手本との違い」ボタンでも比べられます。

## 変えてみよう

### 1. 東を向いて始める

車が右を向いた状態で始まるようにします。

:::answer
`main.js` の `createCar(0, 0, 0)` の最後の `0` を、`Math.PI / 2` にします。↑ を押すと右へ進みます。試したら `0` に戻します。
:::

### 2. もっと速く加速する

0 から時速 100 km まで、約 5.2 秒で届くようにします。どの値を変えればよいでしょう。

:::answer
`CAR.ACCELERATION` を 4 から 8 にします。どの速さでも増え方が 2 倍になるので、かかる時間は半分の約 5.2 秒です。試したら 4 に戻します。
:::

### 3. 遠くから見る

`main.js` の `SCALE` を 3 にすると、どう見えるでしょう。

:::answer
車が半分の大きさになります。同じ速さで走っても、画面の上では半分の速さで動いて見えます。画面に入る広さは、縦と横がそれぞれ 2 倍になります。試したら 6 に戻します。
:::

## 次回への引き

ミナ「止まってるのに、← でくるくる回るよ。それに、止まりたくても止まれない！」
ゲンさん「ブレーキと、本物らしい曲がり方が要るな。車の動きのことなら任せてくれ」
