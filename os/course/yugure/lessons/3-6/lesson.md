# 3-6 ボタンが押されたら

## 場面

ここまでの計算の答えは、どれもコンソールの中にしか出ていません。

ミナ「祭りの子どもたちは、コンソールなんて見ないよ。ページに速度計を出して、アクセルのボタンを押したら速くなるようにしたいな」

ゲンさん「ブレーキも付けてくれるかい。止まれない車は危ないからな」

イコちゃん「JavaScript で、ページの文字を書き換えてみましょう。ボタンが押されたときに動く仕組みも使います」

## 今回の目標

練習の行を片付けて、ページに速度計を置きます。アクセルとブレーキのボタンで、時速と変速の段が変わるようにします。

## 手順

### 1. 練習の行を片付ける

3-1〜3-5 で書いた行のうち、確かめのための行を消します。関数 toKmh・gearFor・bestLap と車のオブジェクトは、速度計で使うので残します。消すのは次の行です。

- 「---- 値と変数 ----」のコメントから、`console.log('周回', laps);` までの行
- 残りの `console.log` の行（4 行）
- `const lapTimes = ...` の行と、`car.speed = 30;` の行

コメントも、いまの中身に合わせて書き換えます。meter.js の全体が、次のようになれば正しいです。

```js
// 速度計とラップタイマー。

// ---- 速さの計算（画面に関係しない、ただの計算）----

// 秒速（メートル毎秒）を、時速（キロメートル毎時）に直す
export function toKmh(metersPerSecond) {
  return metersPerSecond * 3.6;
}

// 時速から、変速の段を決める（ゲンさんの車は 5 段）
export function gearFor(kmh) {
  if (kmh < 20) {
    return 1;
  } else if (kmh < 45) {
    return 2;
  } else if (kmh < 75) {
    return 3;
  } else if (kmh < 110) {
    return 4;
  }
  return 5;
}

// 周回の時間（ミリ秒）の並びから、いちばん短いものを探す
export function bestLap(laps) {
  let best = Infinity;
  for (const time of laps) {
    if (time < best) {
      best = time;
    }
  }
  return best;
}

// ---- 車の状態 ----
const car = {
  name: 'ゲンさんのハッチバック',
  speed: 0, // メートル毎秒
};

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { car };
```

保存して動かすと、コンソールには何も出なくなります。ページは、まだ「練習」の箱のままです。

### 2. ページに速度計の場所を作る

meter.html の「練習」の section を消して、次の section に置き換えます。

```html
  <main>
    <section class="speed">
      <h2>速度計</h2>
      <p class="readout"><output id="speed">0</output> km/h　<output id="gear">1</output> 速</p>
      <p>
        <button type="button" id="accelerate">アクセル</button>
        <button type="button" id="brake">ブレーキ</button>
      </p>
    </section>
  </main>
```

`<output>` は、計算の結果を表示するための要素です。id は、ページの中で 1 つだけの名前です。1-5 では、ポップオーバーの箱に `id="credits"` を付けました。JavaScript からは、この id を目印にして要素を探します。「km/h」と 2 つ目の `<output>` の間には、全角の空白を 1 つ入れています。

保存して動かすと、「速度計」の箱に「0 km/h　1 速」と 2 つのボタンが出ます。ボタンは、押してもまだ何も起きません。

### 3. 速さを画面に書く関数を作る

meter.js の車のオブジェクトの下に 1 行あけて、次のように書きます。`window.course` のコメントの上です。

```js
// ---- 画面の部品 ----
const speedOutput = document.querySelector('#speed');
const gearOutput = document.querySelector('#gear');
const SPEED_STEP = 5; // ボタン 1 回で変わる速さ（メートル毎秒）

// 今の速さを、画面に書く
function show() {
  const kmh = toKmh(car.speed);
  speedOutput.textContent = Math.round(kmh);
  gearOutput.textContent = gearFor(kmh);
}

show();
```

- `document` は、ページ全体を表すオブジェクトです。
- `document.querySelector('#speed')` は、id が speed の要素を探して返します。`#` は id で選ぶ印で、CSS のセレクタと同じ書き方です。
- `textContent` は、要素の中の文字です。値を入れると、ページに出る文字が入れ替わります。
- `Math.round` は、小数を四捨五入して整数にします。秒速 4 メートルは時速 14.4 キロメートルのように、時速は小数になることがあるからです。
- SPEED_STEP のように大文字と `_` で書いた名前は、決めたら変えない設定の数の目印です。

最後の `show();` で、関数 show を 1 回呼びます。確かめのため、car の `speed: 0` を一時的に `speed: 20` にして保存します。速度計が「72 km/h　3 速」になれば正しいです。確かめたら、`speed: 0` に戻します。

### 4. アクセルのボタン

関数 show の `}` と、`show();` の行の間に、次のように書きます。

```js
document.querySelector('#accelerate').addEventListener('click', () => {
  car.speed = car.speed + SPEED_STEP;
  show();
});
```

`addEventListener('click', ...)` は、要素がクリックされたときに動かす関数を登録します。`() => { ... }` は、名前を付けずに関数を作る短い書き方です。アクセルのボタンが押されるたびに、速さに 5 を足して、show で画面に書きます。

保存して動かし、アクセルを 3 回押します。「18」「36」「54」と速くなり、54 のときに「3 速」になれば正しいです。

### 5. ブレーキのボタン

アクセルの 4 行の下（`show();` の行の上）に、次のように書きます。

```js
document.querySelector('#brake').addEventListener('click', () => {
  car.speed = Math.max(car.speed - SPEED_STEP, 0);
  show();
});
```

`Math.max(a, b)` は、a と b のうち大きいほうを返します。速さから 5 を引いた答えが 0 より小さくなると、0 のほうを返します。だから、速さは 0 より下になりません。

保存して動かし、アクセルを何回か押してから、ブレーキを続けて押します。数字が 18 ずつ下がり、0 で止まれば正しいです。

## しくみ

### DOM

ブラウザは HTML を読むと、要素の 1 つ 1 つを、JavaScript から扱えるオブジェクトにします。このオブジェクトの集まりを、DOM（Document Object Model）と呼びます。document は、その DOM の全体を表すオブジェクトです。

| 書き方 | すること |
|---|---|
| `document.querySelector('#speed')` | id が speed の要素を 1 つ探す |
| `document.querySelector('.readout')` | class が readout の要素を 1 つ探す |
| `speedOutput.textContent = 54` | 要素の中の文字を 54 にする |

### イベント

クリックやキーを押すことなど、ページで起きる出来事を、イベント（event）と呼びます。addEventListener は、イベントが起きたときに動かす関数を、要素に登録します。登録した関数は、ボタンが押されるたびに呼ばれます。押されるまでは、中身は動きません。

### アロー関数

`() => { ... }` は、アロー関数（arrow function）と呼ぶ関数の書き方です。`=>` が矢印（arrow）の形をしていることから、この名前が付いています。名前を付けずに、その場で関数を作って addEventListener に渡せます。

### 計算と画面を分ける

toKmh と gearFor は、画面の要素を使わない、ただの計算です。画面に書くのは show だけです。こう分けておくと、答え合わせで計算だけを確かめられます。画面の動かし方を作り変えても、計算の関数はそのまま使えます。

### head で読んでも要素が見つかる理由

meter.js は、meter.html の head で読み込んでいます。head を読んでいる時点では、body の要素はまだありません。でも `type="module"` のスクリプトは、ページの HTML を最後まで読んだあとに動きます。だから、head で読み込んでも #speed が見つかります。

## 答え合わせ

- 速さと変速の段を書く場所（#speed と #gear）がある
- アクセルを 3 回押すと、時速 54 km・3 速になる
- ブレーキを押すと遅くなり、0 より下にはならない

通らないときは、meter.html の id と、querySelector に書いた名前が同じかを見ます。`'#speed'` の `#` を書き忘れると、要素が見つからずに「誤り」が出ます。

## 変えてみよう

### 1. 数字を大きくする

第 2 部の CSS を使って、速度計の数字を大きくします。

:::answer
style.css の最後に書きます。

```css
.readout {
  font-size: 2rem;
  font-weight: bold;
}
```

class が readout の段落は meter.html にしかないので、看板の見た目は変わりません。
:::

### 2. 171 km/h で止める

いまは、アクセルを押すほど速くなります。10 回押すと 180 km/h になり、ゲンさんの車より速くなってしまいます。秒速 47.5 メートル（時速 171 キロメートル）より速くならないようにします。

:::answer
アクセルの関数の中の 1 行目を、次の行に置き換えます。

```js
  car.speed = Math.min(car.speed + SPEED_STEP, 47.5);
```

`Math.min(a, b)` は、a と b のうち小さいほうを返します。10 回押すと、171 で止まります。
:::

### 3. 止めるボタン

押すとすぐに 0 km/h になる「止める」ボタンを足します。

:::answer
meter.html のブレーキのボタンの下に足します。

```html
        <button type="button" id="stop">止める</button>
```

meter.js のブレーキの 4 行の下（`show();` の行の上）に足します。

```js
document.querySelector('#stop').addEventListener('click', () => {
  car.speed = 0;
  show();
});
```
:::

## 次回への引き

ミナは、アクセルのボタンを何度も押しています。「指が疲れちゃう。本物のアクセルは、踏んでいる間ずっと速くなるんだよ」

ゲンさん「それに、祭りのゲームはキーボードの矢印で走るんだったな」
