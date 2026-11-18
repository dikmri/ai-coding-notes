# 4-6 道から外れたら

## 場面

ミナはカーブのたびに草へ出て、まっすぐ次の道へ戻ります。草の上でも、道と同じ速さで走れてしまいます。
ミナ「ほら、こっちの方が速いよ！」
ゲンさん「本物の草や土の上は、タイヤが滑りやすいし、速さも落ちる。そうしておかないと、誰も道を走らなくなるな」
イコちゃん「車が道の上にいるかどうかを、計算で決めましょう。道の真ん中の線からの距離を測ります」

## 今回の目標

車から道の真ん中の線までの、いちばん近い距離を求めます。距離が道の幅の半分（6 m）より遠ければ草の上として、滑りやすく遅くします。

## 手順

### 1. 点と線分の距離

`game/course.js` の `COURSE` の後ろ（`courseLength` の前）に、3 つの関数を足します。前後の行も見せます。

```js
  [275, -215], [285, -160], [270, -100], [240, -50], [200, -10], [150, 20], [90, 35], [40, 30], [10, 15],
];

// 点 (px, py) から、線分 a-b までのいちばん近い距離と、線分の上の位置（0 は a、1 は b）
export function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSquared : 0;
  t = Math.min(Math.max(t, 0), 1);
  const cx = ax + dx * t, cy = ay + dy * t;
  return { distance: Math.hypot(px - cx, py - cy), t };
}

// コースの中で、点にいちばん近い所。index は線分の番号（index 番目の点から次の点へ）
export function nearestOnCourse(course, x, y) {
  let best = { index: 0, distance: Infinity, t: 0 };
  for (let i = 0; i < course.length; i++) {
    const [ax, ay] = course[i];
    const [bx, by] = course[(i + 1) % course.length];
    const hit = distanceToSegment(x, y, ax, ay, bx, by);
    if (hit.distance < best.distance) best = { index: i, distance: hit.distance, t: hit.t };
  }
  return best;
}

// 道の上にいるか（道の真ん中の線から、道の幅の半分より近いか）
export function isOnRoad(course, x, y) {
  return nearestOnCourse(course, x, y).distance <= ROAD_WIDTH / 2;
}

// 1 周の長さ（メートル）
```

### 2. 草の上の車

`game/car.js` を書き換えます。まず、`CAR` の `ROAD_GRIP` の下に 2 行足します。

```js
  ROAD_GRIP: 9, // 道で、横へ滑らずに曲がれる力の上限（メートル毎秒毎秒）
  GRASS_GRIP: 4.5, // 草の上では滑りやすい
  GRASS_DRAG: 3, // 草の上で、余計に減る速さ
  LENGTH: 4.1, // 車の長さ（メートル）
```

次に、`updateCar` が 4 つ目の値 `onRoad` を受け取るようにします。上のコメントから関数の終わりまでを、次のようにします。変わるのは 5 か所です。コメント・1 行目の `onRoad`・`if (!onRoad)` の行・`grip` の行・`turnRate` の行が変わります。

```js
// 時間 seconds だけ車を進める。input は { up, down, left, right }、onRoad は道の上にいるか
export function updateCar(car, input, seconds, onRoad) {
  // 速さ: アクセルは速くなるほど効きにくい（いちばん速い速さに近づくと 0 になる）
  if (input.up) car.speed += CAR.ACCELERATION * (1 - car.speed / CAR.MAX_SPEED) * seconds;
  if (input.down) car.speed -= CAR.BRAKING * seconds;
  if (!input.up && !input.down) car.speed -= CAR.COASTING * seconds;
  if (!onRoad) car.speed -= CAR.GRASS_DRAG * seconds;
  car.speed = Math.max(car.speed, 0);

  // 向き: 遅いときは回る半径で、速いときはタイヤの摩擦（グリップ）で、曲がれる速さが決まる
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const grip = onRoad ? CAR.ROAD_GRIP : CAR.GRASS_GRIP;
  const turnRate = Math.min(car.speed / CAR.MIN_TURN_RADIUS, grip / Math.max(car.speed, 0.1));
  car.heading += steer * turnRate * seconds;

  // 位置: 向いている方へ、速さ × 時間だけ進む
  car.x += Math.sin(car.heading) * car.speed * seconds;
  car.y -= Math.cos(car.heading) * car.speed * seconds;
  return car;
}
```

### 3. main.js で道の上かを調べる

`game/main.js` の、`course.js` を読み込む行に `isOnRoad` を足します。

```js
import { COURSE, isOnRoad } from './course.js';
```

`update` を、次のように書き換えます。

```js
function update(seconds) {
  const onRoad = isOnRoad(COURSE, state.car.x, state.car.y);
  updateCar(state.car, keys, seconds, onRoad);
}
```

`updateCar` に `onRoad` を渡し忘れると、`onRoad` が `undefined` になります。`!undefined` は `true` なので、道の上でもずっと草の扱いになります。

### 4. 走らせる

保存して動かします。道の上は、前と同じように走れます。草へ出ると、目に見えて遅くなり、曲がりにくくなります。こう動けば正しいです。

## しくみ

### 点と線分の距離

道の真ん中の線は、点と点を結んだ直線の集まりです。両端のある直線を、線分（segment）と呼びます。車の位置 P から線分 AB までの、いちばん近い距離を次の順に求めます。

1. 線分の上の位置 t を求める。t は A で 0、B で 1 になる
2. t を 0〜1 に収める（線分の外へはみ出さないように）
3. t の所の点 C を求め、P と C の距離を測る

t は、内積（dot product）で求めます。2 つの向き (a, b) と (c, d) の内積は、a × c + b × d です。A から P への向きと、A から B への向きの内積を、AB の長さの 2 乗で割ります。すると、P から AB へ垂直に下ろした所が、A から何割の位置かが分かります。

答え合わせと同じ例で確かめます。A = (0, 0)、B = (10, 0) とします。

| 点 P | 内積 ÷ 長さの 2 乗 | 収めた t | 近い点 C | 距離 |
|---|---|---|---|---|
| (5, 3) | 50 ÷ 100 = 0.5 | 0.5 | (5, 0) | 3 |
| (-4, 3) | -40 ÷ 100 = -0.4 | 0 | (0, 0) | 5 |

2 つ目の点は、線分の端 A より外にあります。t を 0 に収めたので、端の A までの距離 5 が答えです。収めないと、線分をのばした直線までの距離 3 になります。すると、道のない所まで道の上と判定されます。

`lengthSquared > 0 ? … : 0` は、A と B が同じ点のときに 0 で割らないための書き方です。`const dx = …, dy = …;` は、2 つの変数を 1 行で作る書き方です。

### コースのどこに近いか

`nearestOnCourse` は、すべての線分について距離を求め、いちばん近い線分を選びます。返す値は、線分の番号 `index`・距離 `distance`・線分の上の位置 `t` の 3 つです。`isOnRoad` は、その距離が `ROAD_WIDTH / 2`（6 m）以下なら `true` を返します。

`draw.js` は、道を `lineJoin = 'round'` の太さ 12 m の線で描きました。この線が塗る所は、「真ん中の線から 6 m 以内の場所」とちょうど同じ形です。画面で灰色に見える所と、`isOnRoad` が `true` になる所は一致します。

### ゲンさんの知恵 その 3: 草の上

> 草の上では、タイヤの摩擦の上限が道の半分くらいになる。草と土の抵抗で、速さも落ちる。

`GRASS_GRIP` の 4.5 は、`ROAD_GRIP` の 9 の半分です。速いときの回る半径は、道の上の 2 倍になります。

`GRASS_DRAG` の 3 は、草の上で 1 秒に余計に減る速さです。アクセルで増える速さは 4 × (1 - 速さ ÷ 47.5) なので、速くなるほど小さくなります。これが 3 まで下がると、速さは増えなくなります。計算すると約 11.9 m/s で、草の上では時速約 43 km より速くなりません。

## 答え合わせ

- 点から線分までの距離: 真ん中の横は垂直の距離、端より外は端までの距離
- スタートの近くは道の上、道の幅より遠くは道の外
- 草の上では、道の上より速く遅くなる

通らないときは、`distanceToSegment` の `t` の 2 行と、`main.js` で `onRoad` を渡しているかを見直します。「手本との違い」ボタンでも比べられます。

## 変えてみよう

### 1. 距離を確かめる

点 (3, 4) から、線分 (0, 0)〜(0, 10) までの距離を予想します。そのあと、`main.js` で `distanceToSegment` を読み込み、コンソールに出して比べます。

:::answer
```js
import { COURSE, isOnRoad, distanceToSegment } from './course.js';
```

ファイルの終わりに足します。

```js
console.log(distanceToSegment(3, 4, 0, 0, 0, 10));
```

`distance` が 3、`t` が 0.4 と出ます。(3, 4) から線分へ垂直に下ろすと (0, 4) に着き、そこは線分の 4 割の位置です。確かめたら元に戻します。
:::

### 2. 草をもっと重くする

`GRASS_DRAG` を 6 にして、草へ出てみます。何が起きるでしょう。

:::answer
草の上では、↑ を押しても速さが増えなくなります。アクセルで増える速さは、止まっているときでも 1 秒に 4 m/s です。そこから 6 を引くと、いつもマイナスになります。一度止まると、草から出られません。草の抵抗は、アクセルの 4 より小さくしておきます。試したら 3 に戻します。
:::

### 3. 道を広くする

`course.js` の `ROAD_WIDTH` を 16 にします。描く道の幅と、道の上かの判定は、どう変わるでしょう。

:::answer
両方とも広がります。`draw.js` の線の太さと `isOnRoad` の境目が、同じ `ROAD_WIDTH` を使っているからです。1 つの値を 2 か所で使うと、見た目と判定がずれません。試したら 12 に戻します。
:::

## 次回への引き

ミナ「草に出ると遅くなる！ これで競争になるね。あれ、いま何周したんだっけ？」
ゲンさん「祭りでは、1 周の時間を競いたいな。周回と時計が要る」
