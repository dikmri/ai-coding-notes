// 初めて起動したときに仮想ドライブへ置く、フォルダと見本のファイル
import * as M from './core/mesh.mjs';
import { emptyPattern } from './core/song.mjs';

export const README = `Future OS へようこそ！

見た目は90年代のパソコンですが、中身はしっかり働きます。
ここに書いたファイルは、このブラウザの中の「仮想ドライブ」に保存されます。
この案内は、ARCADIA GATE の「ヘルプ」からいつでも開けます。

■ FUTURE OS // ARCADIA-91 について
架空の「アルカディア開発機構」が1991年に極秘で作った、という設定の OS です。
マルチメディア端末に載せる予定でした。計画が凍結されたため、世に出なかったことになっています。

■ 画面の見方
・左の縦の柱から、アプリと窓を操作します。
・柱のいちばん上の水晶のボタンを押すと、ARCADIA GATE が開きます。Ctrl+Esc でも開きます。
・ARCADIA GATE の「プログラム」に、すべてのアプリが並んでいます。
・ARCADIA GATE の検索の欄に文字を打つと、アプリとファイルを探せます。
・柱の中ほどには、開いている窓のボタンが並びます。押すとその窓が手前に出て、もう一度押すと最小化します。
・柱の下には、音量のボタンと時計があります。時計を押すと「時計とタイマー」が開きます。
・デスクトップのアイコンは、ダブルクリックで開きます。

■ 便利な使い方
・窓のタイトルバーを画面の左右の端まで動かすと、画面の半分にそろいます。上の端なら最大化します。
・タイトルバーの左のアイコンを押すか Alt+-（マイナス）で、窓のメニューが開きます。キーボードだけで窓を動かせます。
・ボタンやメニューの下線の付いた文字は、Alt キーと一緒に押すと選べます。
・パソコンのファイルをデスクトップやファイル マネージャへドラッグすると、取り込めます。
・消したファイルはゴミ箱に入ります。ゴミ箱から元の場所へ戻せます。
・開いていた窓は、次に起動したときに同じ場所へ開き直します。

■ アプリ
［作る］
・メモ帳: 書くそばから自動で保存します。検索と置換もできます。
・お絵かき: 描いた絵を PNG で保存し、デスクトップの壁紙にもできます。
・ローポリ モデラー: 立体を組み立てて、OBJ 形式で書き出せます。
・SID 風シンセ: 3つの声部で曲を打ち込み、WAV で書き出せます。
・コードの作業場: HTML・CSS・JavaScript でページを作り、アプリとして登録できます。

［聞く・見る］
・音楽プレーヤー: 音のファイルと、シンセの曲（.sng）を続けて鳴らします。
・画像と音のビューア: 画像を拡大・縮小して見たり、音を鳴らしたりします。
・音声レコーダー: マイクの音を録って、WAV で保存します。
・画面キャプチャ: 画面を1枚撮って、PNG で保存します。

［毎日の道具］
・電卓: キーボードでも打てます。計算の履歴（計算テープ）を押すと、答えを式へ戻せます。
・付箋: 書くそばから保存します。「手前に固定」で、ほかの窓に隠れなくなります。
・時計とタイマー: 時計のほかに、タイマーとストップウォッチがあります。
・カレンダー: 日本の祝日が出ます。予定の時刻になると、画面の右下に知らせが出ます。
・文字と色の見本帳: 記号や矢印と、ARCADIA-91 の16色を見てコピーできます。

［ネットと AI］
・ウェブブラウザ: ウェブのページを開きます。百科事典の検索と、本文だけを出す「読む表示」もあります。
・AI アシスタント「イコちゃん」: 「案内」のタブで、画面を指さしながら使い方を案内します。
　設定の「AI」のタブで鍵を登録すると、話して頼みごともできます。話した内容は、選んだ AI の会社へ送られます。

［整える・調べる］
・ファイル マネージャ: 仮想ドライブの整理と、パソコンとの受け渡しをします。
・端末: コマンドで仮想ドライブを操作します。help と打つと、コマンドの一覧が出ます。
・システム モニタ: 開いている窓の一覧、ドライブの使用量、性能を見られます。
・設定: 壁紙、音、AI の鍵などを変えます。起動の演出を飛ばすこともできます。

［遊ぶ］
・プリズム回廊: 鏡とプリズムを回して、光で水晶を指定の色に満たすパズルです。全10面あります。
・蒼海と白柱のイコサリア: ARCADIA-91 に付いてくるアクション RPG です。
`;

// 見本のロケット: 円柱の胴体、円すいの先、箱を薄くした羽根3枚
export function rocket() {
  let body = M.cylinder(10, 0.45, 2.2), nose = M.cone(10, 0.45, 0.9);
  nose = M.moveVerts(nose, nose.v.map((_, i) => i), [0, 1.55, 0]);
  body = M.paintFaces(body, body.f.map((_, i) => i), '#f2f2f2');
  for (let i = 2; i < body.f.length; i += 3) body = M.paintFaces(body, [i], '#c0c0c0');
  nose = M.paintFaces(nose, nose.f.map((_, i) => i), '#ff0000');
  const objs = [{ name: '胴体', mesh: body }, { name: '先', mesh: nose }];
  for (let k = 0; k < 3; k++) {
    let fin = M.cube(1);
    fin = M.scaleVerts(fin, fin.v.map((_, i) => i), [0.08, 0.8, 0.6], [0, 0, 0]);
    fin = M.moveVerts(fin, fin.v.map((_, i) => i), [0, -0.75, 0.62]);
    fin = M.rotateVerts(fin, fin.v.map((_, i) => i), [0, 1, 0], (k * Math.PI * 2) / 3, [0, 0, 0]);
    fin = M.paintFaces(fin, fin.f.map((_, i) => i), '#000080');
    objs.push({ name: '羽根' + (k + 1), mesh: fin });
  }
  return { format: 'future-os-lpm', version: 1, objects: objs };
}

// 見本の曲: ベース・分散和音・旋律の3声部、2つのパターン
export function demoSong() {
  const A = emptyPattern(), B = emptyPattern();
  const bass = [45, 45, 53, 53, 48, 48, 55, 55];
  bass.forEach((n, i) => { A[0][i * 2] = n - 12; B[0][i * 2] = n - 12; A[0][i * 2 + 1] = -1; });
  [57, 60, 64, 60, 57, 60, 64, 67, 53, 57, 60, 57, 55, 59, 62, 59].forEach((n, i) => { A[1][i] = n; B[1][i] = n + (i % 4 === 3 ? 12 : 0); });
  [69, null, 72, null, 76, null, 74, 72, 69, null, null, -1, 67, null, 69, null].forEach((n, i) => { B[2][i] = n; });
  return {
    format: 'future-os-sng', version: 1, bpm: 124, order: ['A', 'A', 'B', 'B'], patterns: { A, B },
    voices: [
      { wave: 1, pw: 0.5, a: 0.002, d: 0.12, s: 0.6, r: 0.08, sync: false, ring: false, filter: true },
      { wave: 4, pw: 0.25, a: 0.001, d: 0.08, s: 0.3, r: 0.05, sync: false, ring: false, filter: false },
      { wave: 2, pw: 0.5, a: 0.01, d: 0.2, s: 0.7, r: 0.25, sync: false, ring: false, filter: false },
    ],
    filter: { lp: true, bp: false, hp: false, cutoff: 900, res: 0.4 }, volume: 0.8,
  };
}

export async function seed(fs) {
  if ((await fs.list('/')).length) return false;
  for (const d of ['/デスクトップ', '/ドキュメント', '/モデル', '/音楽', '/画像', fs.TRASH]) await fs.mkdir(d);
  await fs.write('/ドキュメント/はじめに.txt', README);
  await fs.write('/デスクトップ/はじめに.txt', README);
  await fs.write('/モデル/見本のロケット.lpm', rocket());
  await fs.write('/音楽/見本の曲.sng', demoSong());
  return true;
}
