# 3-7 キーで速度計を動かす

## 場面

ミナがアクセルのボタンを 10 回押すと、速度計は 180 km/h になりました。

ゲンさん「わしの車は、171 までしか出ないぞ。それに本物の車は、ボタンを押した回数で速くなるわけじゃない。アクセルを踏んでいる間に、少しずつ速くなるんだ」

ミナ「何度も押すのは指が疲れるよ。祭りのゲームみたいに、↑ のキーを押している間だけ速くしたいな」

イコちゃん「キーを押しているかどうかを覚えておいて、時間に合わせて速さを変えましょう」

## 今回の目標

↑ キーかアクセルのボタンを押している間だけ、速くなるようにします。↓ キーかブレーキのボタンを押している間は、遅くなるようにします。速さは時速 171 キロメートルで止めます。

## 手順

この課では、3-6 の「押した回数で変える」仕組みを、「押している時間で変える」仕組みに作り替えます。7 つの手順に分けて、少しずつ変えます。

### 1. 速さの変わり方を決める

meter.js の始めの部分を、次のようにします。1 行目のコメントの下に説明を 1 行足し、「速さの計算」のコメントの下に 3 行足します。

```js
// 速度計とラップタイマー。
// 速度計: アクセルとブレーキ（ボタンかキー）で速さを変え、時速と変速の段を表示する。

// ---- 速さの計算（画面に関係しない、ただの計算）----
const ACCELERATION = 4; // 1 秒に増える速さ（メートル毎秒）
const BRAKING = 9; // 1 秒に減る速さ（メートル毎秒）
const MAX_SPEED = 47.5; // いちばん速い速さ（メートル毎秒）。時速 171 km

// 秒速（メートル毎秒）を、時速（キロメートル毎時）に直す
```

- ACCELERATION は、アクセルを 1 秒押し続けたときに増える秒速です。1 秒で秒速 4 メートル、時速にして 14.4 キロメートル速くなります。
- BRAKING は、ブレーキを 1 秒押し続けたときに減る秒速です。
- MAX_SPEED は、ゲンさんの車のいちばん速い秒速です。

保存して動かします。3 つの数はまだ使っていないので、速度計は 3-6 と同じに動きます。

### 2. 押しているかどうかを覚える場所を作る

車のオブジェクトに、2 つのプロパティを足します。

```js
const car = {
  name: 'ゲンさんのハッチバック',
  speed: 0, // メートル毎秒
  accelerating: false,
  braking: false,
};
```

accelerating は、アクセルを押している間だけ true にします。braking は、ブレーキを押している間だけ true にします。始めはどちらも押していないので、false です。このように、いまどうなっているかを覚えておく値を、状態（state）と呼びます。

保存して動かします。見た目は変わりません。

### 3. キーを押した・放したを受け取る

`show();` の行の下に 1 行あけて、次のように書きます。`window.course` のコメントの上です。keydown の中の console.log の行は、確かめのために一時的に入れる行です。

```js
// キー: 押している間だけアクセル・ブレーキ
document.addEventListener('keydown', (event) => {
  console.log('押した', event.key);
  if (event.key === 'ArrowUp') car.accelerating = true;
  if (event.key === 'ArrowDown') car.braking = true;
});
document.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowUp') car.accelerating = false;
  if (event.key === 'ArrowDown') car.braking = false;
});
```

keydown はキーを押したとき、keyup はキーを放したときに起きるイベントです。関数の引数 event には、どのキーかなど、起きたことの詳しい中身が入っています。`event.key` は押したキーの名前で、↑ は `'ArrowUp'`、↓ は `'ArrowDown'` です。`===` は、3-3 で見た「等しい」を比べる記号です。

保存して動かします。プレビューの中の空いている所を 1 回クリックしてから、↑ キーを押し続けます。コンソールに「押した ArrowUp」が何行も続けて出れば正しいです。

プレビューをクリックせずに ↑ を押すと、エディタのカーソルが動くだけです。キーのイベントは、最後にクリックした所に届きます。

確かめたら、`console.log('押した', event.key);` の行を消します。

### 4. 押した回数で変える仕組みを消す

これからは、押している時間で速さを変えます。3-6 で書いた次の行を消します。

- `const SPEED_STEP = 5;` の行
- 関数 show（「今の速さを、画面に書く」のコメントから `}` まで）
- アクセルとブレーキの `addEventListener('click', ...)` の 2 つ
- その下の `show();` の行

「画面の部品」のコメントから後ろが、次のようになれば正しいです。

```js
// ---- 画面の部品 ----
const speedOutput = document.querySelector('#speed');
const gearOutput = document.querySelector('#gear');

// キー: 押している間だけアクセル・ブレーキ
document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowUp') car.accelerating = true;
  if (event.key === 'ArrowDown') car.braking = true;
});
document.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowUp') car.accelerating = false;
  if (event.key === 'ArrowDown') car.braking = false;
});

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { car };
```

保存して動かします。いまは、ボタンを押しても ↑ を押しても、速度計は変わりません。押しているかどうかは覚えていますが、その状態を読んで速さを変える所が、まだないからです。

### 5. 毎回の更新を作る

keyup のまとまりの下に 1 行あけて、次のように書きます。`window.course` のコメントの上です。

```js
// ---- 毎回の更新（画面を描き直すたびに呼ばれる）----
let lastTime = performance.now();
function update(now) {
  const seconds = (now - lastTime) / 1000;
  lastTime = now;
  if (car.accelerating) car.speed += ACCELERATION * seconds;
  if (car.braking) car.speed -= BRAKING * seconds;
  car.speed = Math.min(Math.max(car.speed, 0), MAX_SPEED);

  const kmh = toKmh(car.speed);
  speedOutput.textContent = Math.round(kmh);
  gearOutput.textContent = gearFor(kmh);
  requestAnimationFrame(update);
}
requestAnimationFrame(update);
```

この塊は、次のことをします。

1. いちばん下の `requestAnimationFrame(update);` を書くと、ブラウザは次に画面を描き直す前に、update を 1 回呼びます。
2. update の最後にも同じ行があるので、update は画面を描き直すたびに呼ばれ続けます。
3. `performance.now()` は、ページを開いてからの時間をミリ秒で返します。update の引数 now にも、同じ測り方の時刻が入ります。
4. `now - lastTime` は、前に update が呼ばれてからの時間です。1000 で割って、秒にします。
5. accelerating が true なら、ACCELERATION に秒数を掛けた分だけ速さを足します。braking が true なら、BRAKING に秒数を掛けた分を引きます。
6. Math.max と Math.min で、速さを 0 から MAX_SPEED までの間に収めます。
7. 最後に、時速と段を画面に書きます。3-6 の show と同じ計算です。

保存して動かします。プレビューを 1 回クリックしてから、↑ を押し続けます。数字が少しずつ増え、放すとその速さのまま止まれば正しいです。↓ を押し続けると減り、0 で止まります。↑ を 12 秒ほど押し続けると、171 で止まります。

`requestAnimationFrame(update);` の 2 か所のうち、どちらかを書き忘れると動きません。外の 1 行がないと、update は一度も呼ばれません。中の 1 行がないと、update は 1 回呼ばれただけで止まります。

### 6. ボタンも押している間だけにする

gearOutput の行の下に 1 行あけて、次のように書きます。「キー:」のコメントの上です。

```js
// ボタン: 押している間だけアクセル・ブレーキ
function holdButton(button, key) {
  button.addEventListener('pointerdown', () => { car[key] = true; });
  button.addEventListener('pointerup', () => { car[key] = false; });
  button.addEventListener('pointerleave', () => { car[key] = false; });
}
holdButton(document.querySelector('#accelerate'), 'accelerating');
holdButton(document.querySelector('#brake'), 'braking');
```

- pointerdown は、マウスのボタンを押したときや、指で画面に触れたときに起きます。
- pointerup は、マウスのボタンや指を放したときに起きます。
- pointerleave は、マウスの矢印や指がボタンの外へ出たときに起きます。

押したまま外へずらして放すと、ボタンには pointerup が届きません。pointerleave でも false にしておけば、アクセルが入ったままになりません。

`car[key]` は、プロパティの名前を変数で選ぶ書き方です。key が `'accelerating'` なら、`car.accelerating` と同じ意味になります。こう書くと、1 つの関数でアクセルとブレーキの 2 つのボタンを扱えます。

保存して動かします。アクセルのボタンを押し続けると速くなり、放すとそれ以上速くならなければ正しいです。ブレーキのボタンも、押している間だけ遅くなります。

### 7. ページに操作の説明を足す

meter.html の 2 つのボタンを囲む `</p>` の下に、次の 1 行を足します。

```html
      <p><kbd>↑</kbd> を押している間は速くなり、<kbd>↓</kbd> で遅くなります。</p>
```

kbd は、1-4 で使ったキーを表す要素です。保存して動かすと、ボタンの下に操作の説明が出ます。

## しくみ

### イベントで状態を変え、更新で状態を読む

| 出来事 | 動く所 | すること |
|---|---|---|
| ↑ を押す | keydown | car.accelerating を true にする |
| 押し続けている間 | update | 秒数に合わせて速さを足す |
| ↑ を放す | keyup | car.accelerating を false にする |

イベントの関数は、状態を書き換えるだけです。速さを変えるのは update です。キーとボタンのどちらで押しても、同じ状態を書き換えるので、update は 1 つで済みます。

### キーの繰り返し

キーを押し続けると、少し間をおいてから、keydown が何度も繰り返し起きます。手順 3 で「押した ArrowUp」が何行も出たのは、このためです。間の長さと回数は、パソコンの設定で変わります。keydown のたびに速さを足すと、設定によって速くなり方が変わってしまいます。だから keydown では状態だけを変え、速さは時間から計算します。

### 前の時刻との差で秒を求める理由

ブラウザが画面を描き直す回数は、画面によって違います。1 秒に 60 回の画面もあれば、120 回の画面もあります。

| 画面 | 1 回の seconds | 1 回で増える秒速 | 1 秒で増える秒速 |
|---|---|---|---|
| 1 秒に 60 回 | 約 0.0167 | 約 0.067 | 4 |
| 1 秒に 120 回 | 約 0.0083 | 約 0.033 | 4 |

ACCELERATION に、前の回からの秒数を掛けて足します。だから、どちらの画面でも 1 秒で秒速 4 メートル速くなります。

### 短い書き方

| 書き方 | 同じ意味 |
|---|---|
| `car.speed += x` | `car.speed = car.speed + x` |
| `car.speed -= x` | `car.speed = car.speed - x` |
| `if (条件) 文;` | `if (条件) { 文; }` |

if の中の文が 1 つだけのときは、`{ }` を省いて 1 行で書けます。

### 0 から MAX_SPEED の間に収める

`Math.min(Math.max(car.speed, 0), MAX_SPEED)` は、内側から計算します。Math.max で、0 より小さい速さを 0 にします。その答えを Math.min に渡して、MAX_SPEED より大きい速さを MAX_SPEED にします。

| car.speed | Math.max の答え | Math.min の答え |
|---|---|---|
| -0.5 | 0 | 0 |
| 20 | 20 | 20 |
| 48 | 48 | 47.5 |

## 答え合わせ

- ↑ を押している間、速くなる（1 秒で時速 10 km 以上）
- ↑ を放すと、それ以上は速くならない
- ↓ を押している間、遅くなる

通らないときは、`'ArrowUp'` と `'ArrowDown'` のつづりを確かめます。A と U と D は大文字です。`requestAnimationFrame(update);` が、update の中と外の 2 か所にあるかも見ます。

## 変えてみよう

### 1. ゲンさんの車の加速に合わせる

ゲンさんの車は、0 から時速 100 キロメートルまで 10.4 秒かかります。いまの ACCELERATION の 4 では約 6.9 秒なので、本物より速く加速します。ACCELERATION をいくつにすれば、10.4 秒になるでしょう。

:::answer
時速 100 キロメートルは、秒速にすると約 27.8 メートルです。27.8 を 10.4 で割ると、約 2.67 です。

```js
const ACCELERATION = 2.67; // 1 秒に増える速さ（メートル毎秒）
```

本物の車は、速くなるほど加速が小さくなります。ここでは、10.4 秒の間の平均の値を使っています。この値だと 1 秒で時速 9.6 キロメートルしか増えないので、答え合わせの 1 つ目が通らなくなります。試したら 4 に戻します。
:::

### 2. アクセルを放すと少しずつ遅くなる

本物の車は、アクセルを放すと、空気やエンジンの抵抗で少しずつ遅くなります。アクセルを放している間は、1 秒に秒速 1 メートルずつ遅くなるようにします。

:::answer
update の中の `if (car.accelerating) ...` の 1 行を、次の 5 行に置き換えます。

```js
  if (car.accelerating) {
    car.speed += ACCELERATION * seconds;
  } else {
    car.speed -= 1 * seconds; // アクセルを放すと、1 秒に秒速 1 メートル遅くなる
  }
```

速さが 0 より下になっても、そのあとの Math.max で 0 に戻ります。答え合わせは、この形のままでも通ります。
:::

## 次回への引き

ミナが ↑ を押し続けて、速度計を 171 km/h まで上げました。「速度計はできたね！ 次は、峠を 1 周するのに何秒かかったか測りたいな」

ゲンさん「昔は、ストップウォッチを手で押して測ったもんだ」
