# 4-7 周回を数える

## 場面

ミナは、峠を何周も走りました。
ミナ「何周したか忘れちゃった。いちばん速かったのは何周目だろう？」
ゲンさん「昔のサーキットでは、スタートの線を越えるたびに時計を読んだものだ。祭りでも、1 周の時間を競いたいな」
イコちゃん「車がコースのどこまで進んだかを数にすれば、線を越えたときが分かります。速さと時間も、画面の上に出しましょう」

## 今回の目標

コースの進み具合から、スタートの線を越えたことを見つけて、周回を数えます。速さ・周回・時計・最速の周回を、キャンバスの上に重ねて表示します。

## 手順

### 1. 進み具合を求める

`game/course.js` の `isOnRoad` の後ろ（`courseLength` の前）に、`progressOf` を足します。

```js
// 道の上にいるか（道の真ん中の線から、道の幅の半分より近いか）
export function isOnRoad(course, x, y) {
  return nearestOnCourse(course, x, y).distance <= ROAD_WIDTH / 2;
}

// 進み具合: 線分の番号 + 線分の上の位置（0 から点の数まで、1 周で点の数だけ増える）
export function progressOf(course, x, y) {
  const hit = nearestOnCourse(course, x, y);
  return hit.index + hit.t;
}
```

### 2. 表示の札を作る

`game.html` の `canvas` の行の下に、1 行足します。

```html
    <canvas id="screen" width="960" height="600">上から見た峠と、走る車の絵</canvas>
    <p class="hud"><output id="speed">0</output> km/h　周回 <output id="lap">1</output>　<output id="time">0:00.000</output>　最速 <output id="best">―</output></p>
```

文字の間のあきは、全角の空白です。

`game.css` の終わりに、次の規則を足します。

```css
.hud {
  position: absolute;
  top: 8px;
  left: 12px;
  margin: 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.55);
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}
```

保存して動かすと、キャンバスの左上に、半透明の黒い札が重なります。数は、まだ動きません。

### 3. main.js の始めを書き換える

`game/main.js` を、上から 3 回に分けて書き換えます。まず、ファイルの始めから `state` の終わりまでを、次のようにします。`START_X` と `START_Y` は上へ移り、`START_Y` のコメントがのびます。札の 4 つの `output` を探す行と、`state` の 5 つの値が増えます。

```js
// 峠のゲーム（第 4 部で少しずつ作る）

import { startLoop } from './loop.js';
import { keys } from './input.js';
import { createCar, updateCar } from './car.js';
import { COURSE, isOnRoad, progressOf } from './course.js';
import { drawWorld } from './draw.js';

const START_X = COURSE[0][0];
const START_Y = COURSE[0][1] - 3; // スタートの線の 3 m 先（線の真上は、最初と最後の線分の両方に近く、進み具合が決まらない）

const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d');
const speedOutput = document.querySelector('#speed');
const lapOutput = document.querySelector('#lap');
const timeOutput = document.querySelector('#time');
const bestOutput = document.querySelector('#best');

const state = {
  car: createCar(START_X, START_Y, 0),
  time: 0, // 走り始めてからの時間（秒）
  lapStartedAt: 0,
  lapTimes: [],
  progress: 0,
  passedHalf: false, // 半周を過ぎたか（スタートの線の近くを行ったり来たりしても周回にしないため）
};
```

### 4. 時間の文字と、周回の数え方

`state` の下に、空の行を 1 つあけて、2 つの関数を足します。

```js
// 秒を「分:秒.ミリ秒」の文字にする
function formatSeconds(seconds) {
  // 先にミリ秒の整数へ丸める（59.9996 秒を「0:60.000」ではなく「1:00.000」にするため）
  const ms = Math.round(seconds * 1000);
  const minutes = Math.floor(ms / 60000);
  const rest = (ms - minutes * 60000) / 1000;
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`;
}

// 周回: 進み具合が、点の数の近くから 0 の近くへ戻ったら、スタートの線を越えた
function countLap() {
  const before = state.progress;
  const after = progressOf(COURSE, state.car.x, state.car.y);
  state.progress = after;
  if (after > COURSE.length * 0.4 && after < COURSE.length * 0.6) state.passedHalf = true; // コースの真ん中あたりを通った
  const crossedStart = before > COURSE.length - 2 && after < 2;
  if (crossedStart && state.passedHalf) {
    state.lapTimes.push(state.time - state.lapStartedAt);
    state.lapStartedAt = state.time;
    state.passedHalf = false;
    bestOutput.textContent = formatSeconds(Math.min(...state.lapTimes));
  }
}
```

### 5. 計算と描くことに足す

`update` と `draw` を、次のように書き換えます。`update` は時間を進めて周回を数え、`draw` は札の数を書きます。`startLoop` の行から下は、そのままです。

```js
function update(seconds) {
  const onRoad = isOnRoad(COURSE, state.car.x, state.car.y);
  updateCar(state.car, keys, seconds, onRoad);
  state.time += seconds;
  countLap();
}

function draw() {
  drawWorld(context, COURSE, state.car);
  speedOutput.textContent = Math.round(state.car.speed * 3.6);
  lapOutput.textContent = state.lapTimes.length + 1;
  timeOutput.textContent = formatSeconds(state.time);
}
```

`game.html` の `id` を書き間違えると、`querySelector` が `null` を返します。コンソールに `Cannot set properties of null` と出たら、`id` の名前を見比べます。

### 6. 走らせる

保存して動かします。左上の札で、時計が進み、↑ で走ると速さ（km/h）が変わります。コースを 1 周してスタートの線を越えると、周回が 2 になり、最速に 1 周の時間が出ます。こう動けば正しいです。

## しくみ

### 進み具合（progress）

`progressOf` は、車にいちばん近い線分の番号に、線分の上の位置 t を足します。例えば、2 つ目の線分（番号 1）の真ん中なら、1 + 0.5 = 1.5 です。スタートを出ると 0 から増え、1 周の終わりで点の数の 24 に近づきます。スタートの線を越えると、また 0 に戻ります。

進み具合は、線分をいくつ進んだかを表す数です。メートルではありません。最初の線分は 90 m、最後の線分は 18 m あります。同じ 1 増えるにも、走る距離は線分ごとに違います。

### スタートの線を越えたとき

`countLap` は、1 つ前の計算の進み具合 `before` と、今の `after` を比べます。`before` が 22（点の数 - 2）より大きく、`after` が 2 より小さいとします。このとき、進み具合が 24 の近くから 0 の近くへ戻ったので、スタートの線を越えたと分かります。

ただし、それだけでは足りません。車は線を越えた後に U ターンして、逆向きに線を越えて戻れます。もう一度 U ターンして線を越えると、コースを走っていないのに 1 周と数えてしまいます。

そこで、進み具合が 9.6〜14.4（点の数の 4 割〜6 割）になったら、`passedHalf` を `true` にします。そこはコースの真ん中あたりです。真ん中を通ってから線を越えたときだけ、1 周と数えます。数えたら `passedHalf` を `false` に戻し、次の周回でもう一度真ん中を通るのを待ちます。

### スタートを線の 3 m 先にする理由

スタートの線の真上は、最初の線分（0 番）の始まりで、最後の線分（23 番）の終わりでもあります。どちらの線分にも距離 0 なので、進み具合は 0 とも 24 とも言えます。線のほんの少し手前なら 24 に近く、少し先なら 0 に近い値になります。

線の真上から走り出すと、進み具合が 24 と 0 のどちらから始まるかが、わずかな位置の差で変わります。3 m 先に置けば、車ははっきり 0 番の線分の上にいて、進み具合は約 0.03 から始まります。車の長さは 4.1 m なので、車の後ろの端も、線より先に出ます。

### 時計と表示

`state.time` は、`update` のたびに 1/60 秒ずつ足していく時間です。計算と同じ刻みで数えるので、周回の時間も機械によって変わりません。

`formatSeconds` は、3-8 の `formatTime` の、秒を受け取る版です。`toFixed(3)` は、小数を 3 けたにした文字を返します。`padStart(6, '0')` で、`5.007` を `05.007` のように 6 文字にそろえます。先に `Math.round` でミリ秒の整数に丸めます。1/60 秒ずつ足した時間が 59.9996 秒のようになっても、「0:60.000」ではなく「1:00.000」と出すためです。

`Math.min(...state.lapTimes)` の `...` は、配列の中身を 1 つずつの値に分けて渡します。この書き方を、スプレッド構文（spread syntax）と呼びます。`Math.min(83.4, 81.0, 82.5)` と書いたのと同じになり、いちばん短い周回の時間を返します。

### キャンバスに札を重ねる

`.hud` は、2-5 で学んだ重ね方です。`.stage` に `position: relative` があるので、`position: absolute` の `.hud` は、`.stage` の左上から測った場所に置かれます。`.stage` の中にはキャンバスがあるので、札はキャンバスの左上に重なります。

`font-variant-numeric: tabular-nums` は、数字の幅をそろえます。時計の数字が変わっても、後ろの文字が左右にずれません。

## 答え合わせ

- 進み具合 progressOf: 2 つ目の線分の真ん中は 1.5 くらい
- 速さ・周回・時間を、キャンバスの上に重ねて出している
- 時間が進んでいる
- コースの真ん中を通ってからスタートの線を越えると、1 周と数える

通らないときは、`countLap` の `crossedStart` と `passedHalf` の行と、`game.html` の `id` を見直します。「手本との違い」ボタンでも比べられます。

## 変えてみよう

### 1. 周回ごとの時間をコンソールに

1 周するたびに、何周目が何秒だったかをコンソールに出します。

:::answer
`countLap` の中の、`state.lapTimes.push(...)` の行の下に足します。

```js
    console.log(state.lapTimes.length, '周目', formatSeconds(state.lapTimes[state.lapTimes.length - 1]));
```
:::

### 2. 真ん中の確かめを外すと

`crossedStart && state.passedHalf` を `crossedStart` だけにすると、どんなずるができるでしょう。

:::answer
スタートの線を越えたらすぐ U ターンして、線を逆向きに越えます。もう一度 U ターンして線を越えると、1 周と数えられます。数秒で 1 周の記録が出てしまいます。試したら元に戻します。
:::

### 3. 札を右上へ

札を、キャンバスの右上に移します。

:::answer
`game.css` の `.hud` で、`left: 12px;` を `right: 12px;` に変えます。
:::

## 次回への引き

ミナ「最速の周回が出た！ もっと縮めたいな」
ゲンさん「祭りでは、子どもたちが順番に遊ぶ。始めと終わりをはっきりさせないとな」
