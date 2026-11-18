// 峠のゲーム（第 4 部で少しずつ作る）

const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d');

// 草: 画面いっぱいの四角
context.fillStyle = '#3f5a33';
context.fillRect(0, 0, canvas.width, canvas.height);

// 道: 灰色の太い四角
context.fillStyle = '#6b6560';
context.fillRect(440, 0, 80, canvas.height);

// 車: 道の上の、だいだい色の小さい四角（左上の角の位置、幅、高さ）
context.fillStyle = '#c8582a';
context.fillRect(470, 400, 20, 40);

// 太陽: 丸は、道筋（path）に円をかいてから塗る
context.fillStyle = '#fff1c8';
context.beginPath();
context.arc(820, 90, 40, 0, Math.PI * 2);
context.fill();
