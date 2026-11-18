# 3-8 ラップタイマー

## 場面

祭りでは、子どもたちが交代で峠を走ります。ミナは、1 周ごとの時間を測って、いちばん速い周回を見せたいと言います。

ミナ「ゲンさんのメモみたいに、『1 分 21 秒 002』の形で出したいな。81002 ミリ秒のままだと、読みにくいよ」

ゲンさん「ストップウォッチのボタンは 3 つだ。測り始めるスタート、1 周ごとに押すラップ、0 に戻すリセット」

イコちゃん「時刻の差で時間を測って、メモと同じ形の文字に直しましょう」

## 今回の目標

スタートからの時間を表示し、ラップを押すたびに周回の時間を並べるラップタイマーを作ります。最速の周回は、「分:秒.ミリ秒」の形で出します。

## 手順

### 1. ページにタイマーの場所を作る

meter.html の速度計の `</section>` の下に、次の section を足します。`</main>` の上です。

```html
    <section class="timer">
      <h2>ラップタイマー</h2>
      <p class="readout"><output id="clock">0:00.000</output></p>
      <p>
        <button type="button" id="start">スタート</button>
        <button type="button" id="lap">ラップ</button>
        <button type="button" id="reset">リセット</button>
      </p>
      <ol id="laps"></ol>
      <p>最速: <output id="best">―</output></p>
    </section>
```

`<ol id="laps">` は、まだ中が空の番号付きの箇条書きです。周回の時間を、JavaScript でここへ足していきます。

保存して動かすと、「ラップタイマー」の箱に「0:00.000」と 3 つのボタンが出ます。

### 2. ミリ秒を「分:秒.ミリ秒」にする関数

meter.js の関数 bestLap の `}` の下に 1 行あけて、次のように書きます。

```js
// ミリ秒を「分:秒.ミリ秒」の文字にする（例: 83456 → "1:23.456"）
export function formatTime(milliseconds) {
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const rest = Math.floor(milliseconds % 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(rest).padStart(3, '0')}`;
}
```

83456 ミリ秒で、1 行ずつ計算してみます。

| 変数 | 計算 | 答え |
|---|---|---|
| minutes | 83456 を 60000 で割り、小数を切り捨てる | 1 |
| seconds | 83456 を 60000 で割った余り（23456）を 1000 で割り、小数を切り捨てる | 23 |
| rest | 83456 を 1000 で割った余り | 456 |

`Math.floor` は、小数を切り捨てて整数にします。`%` は、割り算の余りを求める記号です。最後の return の行で、3 つの数を「1:23.456」の形の文字列にします。この行の書き方は、しくみで説明します。

確かめのため、ファイルの最後に次の 1 行を一時的に書いて、保存して動かします。

```js
console.log(formatTime(83456), formatTime(5007));
```

コンソールに「1:23.456 0:05.007」と出れば正しいです。確かめたら、この行を消します。

### 3. タイマーの部品と状態を用意する

「画面の部品」の gearOutput の行の下に、3 行を足します。

```js
const speedOutput = document.querySelector('#speed');
const gearOutput = document.querySelector('#gear');
const clockOutput = document.querySelector('#clock');
const bestOutput = document.querySelector('#best');
const lapList = document.querySelector('#laps');
```

次に、keyup のまとまりの下に 1 行あけて、タイマーの状態を書きます。「毎回の更新」のコメントの上です。

```js
// ---- ラップタイマー ----
const timer = {
  running: false,
  startedAt: 0, // スタートした時刻（ミリ秒）
  lapStartedAt: 0, // いまの周回が始まった時刻
  laps: [],
};
```

running は、時計が動いているかどうかです。startedAt はスタートした時刻で、lapStartedAt はいまの周回が始まった時刻です。laps は、周回の時間を入れていく配列です。`[]` は、中が空の配列です。

保存して動かします。見た目は変わりません。

### 4. スタートで時計を進める

timer のオブジェクトの下に 1 行あけて、次のように書きます。

```js
document.querySelector('#start').addEventListener('click', () => {
  if (timer.running) return;
  timer.running = true;
  timer.startedAt = performance.now();
  timer.lapStartedAt = timer.startedAt;
});
```

`if (timer.running) return;` は、時計がもう動いているときに、何もせずに関数を終える行です。動いている間にスタートをもう一度押しても、時計は 0 に戻りません。動いていなければ、いまの時刻をスタートの時刻と、周回の始まりの時刻にします。

次に、update の中の `gearOutput.textContent = gearFor(kmh);` の下に、1 行を足します。

```js
  gearOutput.textContent = gearFor(kmh);
  if (timer.running) clockOutput.textContent = formatTime(now - timer.startedAt);
  requestAnimationFrame(update);
```

`now - timer.startedAt` は、スタートしてからの時間（ミリ秒）です。update は画面を描き直すたびに呼ばれるので、時計の数字もそのたびに進みます。

保存して動かし、スタートを押します。「0:00.000」から数字が進めば正しいです。

### 5. ラップで周回の時間を並べる

スタートのまとまりの下に 1 行あけて、次のように書きます。

```js
document.querySelector('#lap').addEventListener('click', () => {
  if (!timer.running) return;
  const now = performance.now();
  timer.laps.push(now - timer.lapStartedAt);
  timer.lapStartedAt = now;
  const item = document.createElement('li');
  item.textContent = formatTime(timer.laps[timer.laps.length - 1]);
  lapList.append(item);
  bestOutput.textContent = formatTime(bestLap(timer.laps));
});
```

この関数は、次のことをします。

1. 時計が動いていなければ、何もせずに終えます。`!` は「〜でない」を表す記号で、`!timer.running` は「動いていない」という意味です。
2. いまの時刻から lapStartedAt を引いて、この周回の時間を求めます。push で、その時間を配列 laps の最後に足します。
3. いまの時刻を、次の周回の始まりの時刻にします。
4. createElement で新しい li 要素を作り、周回の時間を書きます。append で、その li を ol の中の最後に足します。
5. 3-4 で作った bestLap で最速の周回を選び、formatTime で直して「最速」の欄に書きます。

`timer.laps[timer.laps.length - 1]` は、配列の最後の値です。くわしくは、しくみで説明します。

保存して動かします。スタートを押してから、ラップを何回か押します。押すたびに番号付きの行が 1 つ増え、「最速」にいちばん短い時間が出れば正しいです。

### 6. リセットで始めに戻す

ラップのまとまりの下に 1 行あけて、次のように書きます。

```js
document.querySelector('#reset').addEventListener('click', () => {
  timer.running = false;
  timer.laps = [];
  lapList.replaceChildren();
  clockOutput.textContent = formatTime(0);
  bestOutput.textContent = '―';
});
```

replaceChildren を何も渡さずに呼ぶと、要素の中が空になります。ここでは、周回の行がすべて消えます。`formatTime(0)` は「0:00.000」を返します。

保存して動かし、スタートとラップのあとでリセットを押します。時計が「0:00.000」に戻り、周回の行が消えれば正しいです。

### 7. 説明と答え合わせの窓口を直す

meter.js の始めのコメントに、ラップタイマーの説明を 1 行足します。

```js
// 速度計とラップタイマー。
// 速度計: アクセルとブレーキ（ボタンかキー）で速さを変え、時速と変速の段を表示する。
// ラップタイマー: スタートからの時間を測り、ラップを押すごとに周回の時間を記録して、最速を表示する。
```

ファイルの最後の行の window.course に、timer も入れます。

```js
// 答え合わせのために、状態を外から読めるようにしておく
window.course = { car, timer };
```

## しくみ

### performance.now で時間を測る

performance.now() は、ページを開いてからの時間をミリ秒で返します。2 つの時刻の差をとると、その間にたった時間が分かります。

| 出来事 | performance.now() | 計算 | 結果 |
|---|---|---|---|
| スタート | 2000 | startedAt と lapStartedAt に入れる | |
| 1 回目のラップ | 85456 | `85456 - 2000` | 1 周目は 83456 |
| 2 回目のラップ | 166458 | `166458 - 85456` | 2 周目は 81002 |

時計には、startedAt からの時間を出します。周回の時間は、lapStartedAt からの時間です。ラップを押すたびに、lapStartedAt をその時刻に進めます。

performance.now() は、1 ミリ秒より細かい小数も返します。そこで formatTime の rest では、Math.floor でミリ秒より細かい部分を切り捨てます。

### テンプレート文字列と padStart

formatTime の return の行は、逆向きの引用符（バッククォート）で囲んだ文字列です。この書き方を、テンプレート文字列（template literal）と呼びます。中に `${ }` で囲んだ式を書くと、その値が文字列の中に入ります。

padStart(2, '0') は、文字列の長さが 2 になるまで、左に '0' を足します。数には padStart がないので、String で先に文字列に直してから使います。

| 値 | 書き方 | 結果 |
|---|---|---|
| 5 | `String(5).padStart(2, '0')` | '05' |
| 23 | `String(23).padStart(2, '0')` | '23' |
| 7 | `String(7).padStart(3, '0')` | '007' |

秒を 2 けた、ミリ秒を 3 けたにそろえるので、5007 ミリ秒は「0:05.007」になります。

### 配列の番号と長さ

配列の値には、前から順に番号が付いています。いちばん前が 0 番で、次が 1 番です。この番号を添字（index）と呼びます。`timer.laps[0]` と書くと、いちばん前の値を読めます。

`length` は、配列の値の数です。値が 3 つなら length は 3 で、最後の値の番号は 2 です。だから最後の値は、`timer.laps[timer.laps.length - 1]` で読めます。push は、配列の最後に値を 1 つ足します。

### 要素を作って足す

| 書き方 | すること |
|---|---|
| `document.createElement('li')` | 新しい li 要素を作る（まだページには出ない） |
| `lapList.append(item)` | item を lapList の中の最後に足す |
| `lapList.replaceChildren()` | lapList の中を空にする |

createElement で作っただけの要素は、ページに出ません。append で、ページにある要素の中へ足したときに出ます。

### return で先に終える

`if (!timer.running) return;` のように、条件に合わないときは先に関数を終えておきます。こうすると、その下の行は「時計が動いているとき」だけを考えて書けます。

## 答え合わせ

- formatTime(83456) が "1:23.456" を返す
- formatTime(5007) が "0:05.007" を返す（0 を足して桁をそろえる）
- スタートの後にラップを押すと、周回の時間が 1 つ並ぶ
- 最速の周回が「分:秒.ミリ秒」で出ている
- 時計が進んでいる

すべて通ると、速度計とラップタイマーが OS の「作ったアプリ」に登録されます。通らないときは、formatTime の `%` と `/` の書き分けと、padStart の 2 と 3 を確かめます。「手本との違い」を押すと、手本と違う行が分かります。

## 変えてみよう

### 1. 周回の数を出す

「最速」の下に、いままでの周回の数を出します。

:::answer
meter.html の「最速」の行の下に足します。

```html
      <p>周回: <output id="count">0</output></p>
```

meter.js のラップの関数の最後（`bestOutput.textContent = ...` の行の下）に足します。リセットの関数の最後にも、同じ行を足します。

```js
  document.querySelector('#count').textContent = timer.laps.length;
```

リセットでは laps が空の配列になるので、同じ行で 0 に戻ります。
:::

### 2. 最速の周回の平均の時速

夕暮れ峠は、1 周 1,981 メートルです。最速の周回を走ったときの平均の時速を、コンソールに出します。

:::answer
ラップの関数の最後に足します。

```js
  const seconds = bestLap(timer.laps) / 1000;
  console.log('最速の周回の平均は、時速', Math.round(toKmh(1981 / seconds)), 'キロメートル');
```

最速が 1 分 21 秒 002 なら、1981 を 81.002 で割って秒速約 24.5 メートルです。時速にすると約 88 キロメートルです。
:::

### 3. ストップのボタン

時計を止めるボタンを足します。止めたあとは、ラップを押しても周回が増えないようにします。

:::answer
meter.html のリセットのボタンの下に足します。

```html
        <button type="button" id="stop-timer">ストップ</button>
```

meter.js のリセットのまとまりの下に足します。

```js
document.querySelector('#stop-timer').addEventListener('click', () => {
  timer.running = false;
});
```

running が false になると、update は時計を書き換えません。ラップの関数も、1 行目の return ですぐに終わります。
:::

## 次回への引き

OS の「作ったアプリ」に、「速度計とラップタイマー」が入りました。ミナはさっそく開いて、何度もラップを押しています。

ミナ「時計は動いたね。でも、数字だけじゃつまらないよ。車が峠を走るところを見たいな」
