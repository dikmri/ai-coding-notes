// 会話は定型文とスタンプだけ（設計書 §1）。
// phrases の番号が id（C2S chat の p）。番号を変えると古い記録の意味が変わるので、足すときは末尾に足す。
// stamps の id は C2S stamp の id。絵の id は stamp_<id>。

export const phrases = [
  'こんにちは', // 0
  'こんばんは',
  'よろしくお願いします',
  'ありがとう',
  'どういたしまして',
  'ごめんなさい', // 5
  'はい',
  'いいえ',
  '了解です',
  'ちょっと待って',
  'お先に失礼します', // 10
  'おつかれさまでした',
  '助けて！',
  '回復します',
  '回復をお願いします',
  '魔力が切れました', // 15
  '集まって',
  'ついてきて',
  'ここで待って',
  '先に行きます',
  '少し戻ります', // 20
  '町へ帰ります',
  'ボスがいます',
  '宝箱があります',
  '敵が多いです',
  '気をつけて', // 25
  '罠があります',
  '倒しました',
  'いい物が出ました',
  'どうぞ拾ってください',
  'パーティーに入りませんか？', // 30
  '入れてください',
  'もういっぱいです',
  '鐘楼へ行きませんか？',
  '街道で狩りをしませんか？',
  '霧沼へ行きませんか？', // 35
  '転職しました！',
  'レベルが上がりました！',
  'すごい！',
  'あはは',
  'またね', // 40
  'おやすみなさい',
  '薬を持っていますか？',
];

// 画面の定型文の選び方のまとまり（ids は phrases の番号）
export const phraseGroups = [
  { name: 'あいさつ', ids: [0, 1, 2, 10, 11, 40, 41] },
  { name: '返事', ids: [3, 4, 5, 6, 7, 8, 9, 38, 39] },
  { name: '戦い', ids: [12, 13, 14, 15, 22, 23, 24, 25, 26, 27, 28, 29, 42] },
  { name: '動き', ids: [16, 17, 18, 19, 20, 21] },
  { name: 'パーティー', ids: [30, 31, 32, 33, 34, 35, 36, 37] },
];

export const stamps = [
  { id: 'wave', name: '手を振る', art: 'stamp_wave' },
  { id: 'bow', name: 'おじぎ', art: 'stamp_bow' },
  { id: 'thanks', name: 'ありがとう', art: 'stamp_thanks' },
  { id: 'sorry', name: 'ごめん', art: 'stamp_sorry' },
  { id: 'cheer', name: 'やった', art: 'stamp_cheer' },
  { id: 'cry', name: '泣く', art: 'stamp_cry' },
  { id: 'angry', name: '怒る', art: 'stamp_angry' },
  { id: 'surprise', name: '驚く', art: 'stamp_surprise' },
  { id: 'question', name: 'はてな', art: 'stamp_question' },
  { id: 'ok', name: '了解', art: 'stamp_ok' },
  { id: 'skull', name: 'どくろ', art: 'stamp_skull' },
  { id: 'bell', name: '鐘', art: 'stamp_bell' },
  { id: 'sleepy', name: 'ねむい', art: 'stamp_sleepy' },
];
