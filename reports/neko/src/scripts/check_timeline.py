"""timeline.py の振る舞いを確かめる最小のチェック（assert）。

使い方: <Blender の python> -I scripts/check_timeline.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import timeline as T  # noqa: E402


def main():
    poses = [T.pose(T.frame_time(f)) for f in range(1, T.FPS * 30 + 1)]
    assert len(poses) == 720

    # 1. 目の位置は 1 コマで大きく飛ばない（跳躍中でも 1 コマ 0.2 m 未満）
    worst = 0.0
    for a, b in zip(poses, poses[1:]):
        d = math.dist(a["eye"], b["eye"])
        worst = max(worst, d)
        assert d < 0.2, (a["t"], d)
    # 2. 向きも 1 コマで 15 度より大きく変わらない
    for a, b in zip(poses, poses[1:]):
        for k in ("yaw", "pitch", "roll"):
            assert abs(a[k] - b[k]) < 15, (k, a["t"], a[k], b[k])
    # 3. 地面ではおおよそ猫の目の高さ、塀の上では塀の天端より上
    for p in poses:
        z = p["eye"][2]
        if p["t"] < T.J_T0:
            assert 0.12 < z < 0.27, (p["t"], z)
        if p["t"] > T.J_T1 + 0.6:
            assert T.WALL_TOP + 0.15 < z < T.WALL_TOP + 0.30, (p["t"], z)
            assert abs(p["eye"][0] - T.WALL_X) < 0.3, (p["t"], p["eye"])
    # 4. 着地点は塀の天端の上で、跳躍の最高点は着地点より少し高い
    land = T.body_position(T.J_T1)[0]
    assert abs(land[0] - T.WALL_X) < 1e-6 and abs(land[2] - T.EYE_ON_WALL) < 1e-6, land
    peak = max(T.body_position(T.J_T0 + i * 0.01)[0][2] for i in range(61))
    assert land[2] < peak < land[2] + 0.12, (peak, land)
    # 5. 最後は太陽の方を向く（yaw が 180 度前後）
    end = poses[-1]
    assert abs(abs(end["yaw"]) - 175) < 15, end["yaw"]
    # 6. 足音: 地面と塀の上の両方で、跳躍中には鳴らない
    ff = T.footfalls()
    assert any(not w for _, _, _, w in ff) and any(w for _, _, _, w in ff)
    assert not any(T.J_T0 < t < T.J_T1 for t, _, _, _ in ff)
    print(f"ok frames=720 max_step={worst:.3f}m footfalls={len(ff)} stop={T.STOP_POS} land={tuple(round(v, 3) for v in land)} wall_stop={tuple(round(v, 3) for v in T.WALL_STOP)} end_yaw={end['yaw']:.1f}")


if __name__ == "__main__":
    main()
