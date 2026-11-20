// 流用の実験: ゲームではなく「映像」に流用する。?fly を付けて開くと、操作なしで、ドローンのカメラが夕暮れの山のコースの上を飛ぶ。
// 描画・空・森・地形・影・後処理は元のコードのまま使い、足したのはカメラの動きだけ。車はピットに止めておく。
const FLY = { on: Q.has('fly'), t: 0, speed: 24, p: new Float64Array(5), q: new Float64Array(5), started: false };
if (FLY.on) {
  GAME.ui = false;   // 開始の画面と操作の説明を出さない
  BUILD.push(async () => {
    const tick = GAME.tick;
    if (!tick) return;
    GAME.tick = (fixed) => {
      if (!FLY.started) {   // 最初の 1 回: 車をピットの中に置いて止め、カメラを自由にする
        FLY.started = true; vehicleReset(TRK.pit.s0 + 120, (TRK.pit.laneD0 + TRK.pit.laneD1) / 2, 0); GS.frozen = true; GS.freeCam = true;
        const h = document.getElementById('hint'); if (h) h.style.display = 'none';
      }
      tick(fixed);
      FLY.t += RT[2] || 1 / 60;
      // コースの中心線に沿って進み、横へゆっくり振れながら、高さも波打たせる
      const s = 30 + FLY.t * FLY.speed, side = 22 * Math.sin(FLY.t * 0.11), lift = 26 + 9 * Math.sin(FLY.t * 0.07 + 1.3);
      const p = trackPos(s, side, FLY.p), q = trackPos(s + 85, side * 0.3, FLY.q);
      setCamera(p[0], p[1] + lift, p[2], q[0], q[1] + 4, q[2], 0.85);
    };
  });
}
