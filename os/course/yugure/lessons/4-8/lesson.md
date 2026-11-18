# 4-8 1 本目の完成

## 場面

祭りまで、あと少しです。ゲンさんが、会場での遊び方を考えています。
ゲンさん「子どもたちは、1 人ずつ順番に遊ぶ。今のままだと、ページを開いたとたんに時計が進み出して、終わりもない」
ミナ「最初に遊び方を見せて、3 周走ったら合計の時間を出そうよ！」
イコちゃん「タイトル・走る・結果の 3 つの画面を、順に切り替えましょう。これで、峠のゲームの 1 本目ができあがります」

## 今回の目標

タイトル → 走る → 結果 の画面の流れを作ります。Enter で走り始め、3 周したら合計の時間と最速の周回を出します。

## 手順

### 1. タイトルと結果の板を作る

`game.html` の `main` の中を、次のようにします。`.hud` の行は、最速を外して「/ 3」を足します。その下に、タイトルと結果の 2 枚の板（panel）を足します。

```html
  <main class="stage">
    <canvas id="screen" width="960" height="600">上から見た峠と、走る車の絵</canvas>
    <p class="hud"><output id="speed">0</output> km/h　周回 <output id="lap">1</output> / 3　<output id="time">0:00.000</output></p>
    <section id="title" class="panel">
      <h1>夕暮れ峠</h1>
      <p>3 周の時間を競います。<kbd>↑</kbd> アクセル　<kbd>↓</kbd> ブレーキ　<kbd>←</kbd> <kbd>→</kbd> ハンドル</p>
      <p><kbd>Enter</kbd> で始める</p>
    </section>
    <section id="result" class="panel" hidden>
      <h2>ゴール</h2>
      <p>合計 <output id="total">―</output>　最速の周回 <output id="best">―</output></p>
      <p><kbd>Enter</kbd> でもう一度</p>
    </section>
  </main>
```

結果の板の `hidden` を忘れると、始めから 2 枚の板が重なって出ます。

### 2. 板の見た目

`game.css` の終わりに、2 つの規則を足します。

```css
.panel {
  position: absolute;
  inset: 25% 15%;
  padding: 16px 24px;
  border-radius: 16px;
  background: rgb(20 16 28 / 0.85);
  text-align: center;
}

kbd {
  padding: 1px 6px;
  border: 1px solid #8a7d99;
  border-radius: 4px;
}
```

保存して動かすと、キャンバスの真ん中に「夕暮れ峠」の板が重なります。まだ Enter を押しても板は消えず、板の後ろで時計も進みます。

### 3. main.js の始めを書き換える

`game/main.js` を、上から 3 回に分けて書き換えます。まず、ファイルの始めから `state` の終わりまでです。1 行目のコメントが変わり、`LAPS` と 2 枚の板を探す行が増えます。`bestOutput` の行はなくなり、`state` には `screen` が増えます。

```js
// 峠のゲームの入口: 画面の流れ（タイトル → 走る → 結果）と、周回の数え方。

import { startLoop } from './loop.js';
import { keys } from './input.js';
import { createCar, updateCar } from './car.js';
import { COURSE, isOnRoad, progressOf } from './course.js';
import { drawWorld } from './draw.js';

const LAPS = 3; // 何周で終わるか
const START_X = COURSE[0][0];
const START_Y = COURSE[0][1] - 3; // スタートの線の 3 m 先（線の真上は、最初と最後の線分の両方に近く、進み具合が決まらない）

const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d');
const titlePanel = document.querySelector('#title');
const resultPanel = document.querySelector('#result');
const speedOutput = document.querySelector('#speed');
const lapOutput = document.querySelector('#lap');
const timeOutput = document.querySelector('#time');

const state = {
  screen: 'title', // 'title'・'race'・'result'
  car: createCar(START_X, START_Y, 0),
  time: 0, // 走り始めてからの時間（秒）
  lapStartedAt: 0,
  lapTimes: [],
  progress: 0,
  passedHalf: false, // 半周を過ぎたか（スタートの線の近くを行ったり来たりしても周回にしないため）
};
```

### 4. 始める・終える

`formatSeconds` の上のコメントを書き換えます。その下に、`startRace`・`finishRace` と、Enter のキーの処理を足します。

```js
// ミリ秒ではなく秒を受け取り、「分:秒.ミリ秒」の文字にする
function formatSeconds(seconds) {
  // 先にミリ秒の整数へ丸める（59.9996 秒を「0:60.000」ではなく「1:00.000」にするため）
  const ms = Math.round(seconds * 1000);
  const minutes = Math.floor(ms / 60000);
  const rest = (ms - minutes * 60000) / 1000;
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`;
}

function startRace() {
  state.screen = 'race';
  state.car = createCar(START_X, START_Y, 0);
  state.time = 0;
  state.lapStartedAt = 0;
  state.lapTimes = [];
  state.progress = 0;
  state.passedHalf = false;
  titlePanel.hidden = true;
  resultPanel.hidden = true;
}

function finishRace() {
  state.screen = 'result';
  const total = state.lapTimes.reduce((sum, time) => sum + time, 0);
  document.querySelector('#total').textContent = formatSeconds(total);
  document.querySelector('#best').textContent = formatSeconds(Math.min(...state.lapTimes));
  resultPanel.hidden = false;
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && state.screen !== 'race') startRace();
});
```

### 5. 周回・計算・描くこと

`countLap` から下を、次のようにします。`countLap` は、最速を書く行の代わりに、3 周目で `finishRace` を呼びます。`update` は、走る画面のときだけ計算します。`draw` の周回は、3 より大きくなりません。最後の行の `window.course` には、`startRace` が増えます。

```js
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
    if (state.lapTimes.length === LAPS) finishRace();
  }
}

function update(seconds) {
  if (state.screen !== 'race') return;
  const onRoad = isOnRoad(COURSE, state.car.x, state.car.y);
  updateCar(state.car, keys, seconds, onRoad);
  state.time += seconds;
  countLap();
}

function draw() {
  drawWorld(context, COURSE, state.car);
  speedOutput.textContent = Math.round(state.car.speed * 3.6);
  lapOutput.textContent = Math.min(state.lapTimes.length + 1, LAPS);
  timeOutput.textContent = formatSeconds(state.time);
}

startLoop(update, draw);

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { state, startRace };
```

### 6. 遊んでみる

保存して動かし、次の順に試します。

1. タイトルの板が見え、時計は 0:00.000 のまま止まっている
2. プレビューをクリックしてから Enter を押すと、板が消えて走れる
3. 3 周すると「ゴール」の板が出て、合計と最速の周回が出る
4. もう一度 Enter を押すと、スタートの位置からやり直せる

こう動けば、峠のゲームの完成です。

## しくみ

### 画面の流れ（状態）

`state.screen` は、今どの画面かを `'title'`・`'race'`・`'result'` の文字で持ちます。何をするかは、この値で決まります。

| 今の画面 | Enter を押すと | update がすること | 見える板 |
|---|---|---|---|
| title | race へ | 何もしない | タイトル |
| race | 何も起きない | 車を動かし、周回を数える | なし |
| result | race へ | 何もしない | 結果 |

race から result へは、3 周目の線を越えたときに、`finishRace` が切り替えます。`!==` は `===` の反対で、「等しくない」です。

`update` は、走る画面でなければすぐ `return` します。`draw` は止めないので、板の後ろにはコースと車が描かれ続けます。

### hidden 属性

`hidden` 属性（attribute）が付いた要素は、画面に出ません。JavaScript では、`titlePanel.hidden = true` で隠し、`false` で出します。

### やり直せるようにする

`startRace` は、車・時間・周回の記録・進み具合を、すべて始めの値に戻します。1 つでも戻し忘れると、2 回目の遊びに前の記録が残ります。例えば `lapTimes` を戻さないと、2 回目は 1 周目で記録が 4 つになります。4 は `LAPS` の 3 と等しくならないので、いつまでも終わりません。

### 合計を求める（reduce）

`state.lapTimes.reduce((sum, time) => sum + time, 0)` は、配列の値を前から順に足します。`sum` は 0 から始まり、`time` を 1 つ足した値が、次の `sum` になります。3-4 の `for...of` で 1 つずつ足すのと、同じ計算です。

### 周回の表示

`Math.min(state.lapTimes.length + 1, LAPS)` は、今走っている周回の番号です。3 周を走り終えると、`lapTimes.length + 1` は 4 になります。`Math.min` で、表示は 3 のままにします。

### 板の置き場所

`inset: 25% 15%` は、`top` と `bottom` を 25%、`left` と `right` を 15% にする短い書き方です。`.stage` の上下を 25% ずつ、左右を 15% ずつあけた所に、板が重なります。

### OS のアプリになる

答え合わせが全部通ると、峠のゲームが OS に登録されます。「作ったアプリ」の「夕暮れ峠（上から走る）」から、講座の窓を開かずに遊べます。

## 答え合わせ

- 始めはタイトルの板が見え、結果の板は隠れている
- Enter で走り始める（タイトルの板が隠れる）
- 3 周すると結果の画面になり、合計と最速の周回が出る

通らないときは、`game.html` の 2 枚の板の `id` と `hidden`、`main.js` の `startRace` と `finishRace` を見直します。「手本との違い」ボタンでも比べられます。

## 変えてみよう

### 1. 1 周で終わる練習

`LAPS` を 1 にすると、1 周で結果が出ます。ほかに直す所はあるでしょうか。

:::answer
`game.html` の「/ 3」と「3 周の時間を競います」は、ただの文字です。`LAPS` を変えても、ここは変わりません。両方を 1 に直します。試したら、全部 3 に戻します。
:::

### 2. Escape でタイトルへ

走っている途中で Escape を押すと、タイトルの板に戻るようにします。

:::answer
Enter のキーの処理の下に足します。

```js
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.screen === 'race') {
    state.screen = 'title';
    titlePanel.hidden = false;
  }
});
```

タイトルで Enter を押すと、`startRace` が全部を始めの値に戻します。
:::

### 3. 周回ごとの時間を結果に並べる

結果の板に、3 周それぞれの時間を並べます。3-8 のラップタイマーと同じ作り方です。

:::answer
`game.html` の結果の板の、合計の段落の下に足します。

```html
      <ol id="laps"></ol>
```

`finishRace` の中の、`resultPanel.hidden = false;` の前に足します。

```js
  const list = document.querySelector('#laps');
  list.replaceChildren();
  for (const time of state.lapTimes) {
    const item = document.createElement('li');
    item.textContent = formatSeconds(time);
    list.append(item);
  }
```

`replaceChildren()` で前の回の並びを消してから、今回の時間を足します。
:::

## 次回への引き

ミナが 3 周を走り終えて、跳び上がりました。「できた！ 峠を走れたよ！」
少しして、ミナは画面を見つめたまま言いました。「でも、本物の峠はもっと高くて、深いんだよ」
