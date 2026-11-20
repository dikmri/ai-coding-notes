"""猫の動きの台本（bpy を使わない純粋な計算）。

座標: X が右（東）、Y が道の奥、Z が上。単位は m、角度は度。
yaw は +Y 向きを 0 として左回り（上から見て反時計回り）が正。
pitch は上向きが正。時刻 t は秒（コマ f は t = (f-1)/24）。

pose(t) が返すもの:
  eye      目（カメラ）の位置
  yaw, pitch, roll   カメラの向き
  body     胴の中心の位置、body_yaw / body_pitch 胴の向き
  gait     歩きの位相（足の動き・足音に使う）、speed 速さ
  crouch / sit / air  姿勢の度合い（0〜1）
"""
import math

FPS = 24
DURATION = 30.0

# ---- 舞台の寸法（build_scene.py と共有） ----
WALL_X = -2.36          # 左のブロック塀の中心線
WALL_TOP = 1.19         # 笠木の上面
EYE_GROUND = 0.235      # 歩くときの目の高さ
EYE_ON_WALL = WALL_TOP + 0.215
SUN_AZ = 15.0           # 太陽の方位: -Y から +X 側へ何度ずれているか
SUN_EL = 9.0            # 太陽の高さ（HDRI は傾けてこの高さに合わせる）

# 地面を歩く区間
G_Y0 = -2.0
G_V = 0.62
G_DECEL0, G_STOP = 4.8, 5.8
# 跳ぶ区間
J_T0, J_T1 = 8.6, 9.2
J_DY = 0.45
# 塀の上を歩く区間
W_T0, W_ACC1, W_DEC0, W_T1 = 9.7, 10.3, 18.0, 18.6
W_V = 0.40
# 振り返って座る区間
TURN_T0, TURN_T1 = 23.0, 25.4
TURN_DEG = -(180.0 - SUN_AZ)   # 右回りに振り返って太陽の方を向く
SIT_T0, SIT_T1 = 25.4, 26.6

STRIDE = 0.46           # 1 歩きの周期で進む距離（m）


def clamp01(x):
    return 0.0 if x < 0 else (1.0 if x > 1 else x)


def smooth(e0, e1, x):
    """smootherstep。e0 で 0、e1 で 1。"""
    u = clamp01((x - e0) / (e1 - e0))
    return u * u * u * (u * (u * 6 - 15) + 10)


def lerp(a, b, u):
    return a + (b - a) * u


def _ease_integral(t, a, b):
    """速さ 1→0 を smootherstep で落とすときの、a から t までに進む割合（数値積分）。"""
    if t <= a:
        return 0.0
    t = min(t, b)
    n = 64
    h = (t - a) / n
    s = 0.0
    for i in range(n):
        x = a + (i + 0.5) * h
        s += (1.0 - smooth(a, b, x)) * h
    return s


def _ramp_integral(t, a, b):
    """速さ 0→1 を smootherstep で上げるとき、a から t までに進む距離（速さ 1 あたり）。"""
    if t <= a:
        return 0.0
    tt = min(t, b)
    n = 64
    h = (tt - a) / n
    s = 0.0
    for i in range(n):
        x = a + (i + 0.5) * h
        s += smooth(a, b, x) * h
    return s + max(0.0, t - b)


def ground_s(t):
    """地面を歩いた距離。"""
    t = min(t, G_STOP)
    s = G_V * min(t, G_DECEL0)
    s += G_V * _ease_integral(t, G_DECEL0, G_STOP)
    return s


G_LEN = ground_s(G_STOP)
STOP_POS = (-1.84, G_Y0 + G_LEN)
LAND_POS = (WALL_X, STOP_POS[1] + J_DY)


def wall_s(t):
    """塀の上を歩いた距離。"""
    if t <= W_T0:
        return 0.0
    up = _ramp_integral(min(t, W_DEC0), W_T0, W_ACC1)
    down = 0.0
    if t > W_DEC0:
        down = _ease_integral(t, W_DEC0, W_T1)
    return W_V * (up + down)


W_LEN = wall_s(W_T1 + 1.0)
WALL_STOP = (WALL_X, LAND_POS[1] + W_LEN)


# ---- 頭の向きの台本: (動き始め, 動き終わり, 値) ----
YAW_KEYS = [
    (0.0, 0.0, 6.0),
    (0.9, 1.4, 28.0),     # 左の鉢植えを見る
    (2.6, 3.1, -6.0),
    (4.2, 4.7, 4.0),
    (5.6, 6.6, 12.0),     # 塀の上を見上げる（胴も左へ向く）
    (7.2, 7.6, 0.0),
    (10.2, 11.0, -38.0),  # 右下の道をのぞく
    (11.8, 12.3, 0.0),
    (12.4, 13.3, 34.0),   # 左上の柿の実
    (14.6, 15.1, 4.0),
    (16.3, 16.7, -14.0),
    (17.3, 17.7, 0.0),
    (18.7, 19.6, -45.0),  # 右上の電線のカラス
    (21.4, 22.6, -38.0),  # 飛び立つカラスを追う
    (22.7, 23.2, -18.0),
    (23.2, 24.6, 0.0),    # 振り返りながら頭を戻す
    (27.4, 28.4, 7.0),
    (29.0, 29.9, 3.0),
]
PITCH_KEYS = [
    (0.0, 0.0, -9.0),
    (0.9, 1.4, -16.0),
    (2.6, 3.1, -6.0),
    (4.2, 4.7, -4.0),
    (5.6, 6.7, 38.0),     # 塀の上を見上げる
    (7.6, 8.2, 46.0),     # 跳ぶ先をにらむ
    (8.6, 8.95, 8.0),
    (8.95, 9.2, -26.0),   # 着地点を見る
    (9.25, 9.5, -12.0),
    (10.2, 11.0, -24.0),
    (11.8, 12.3, -9.0),
    (12.4, 13.3, 16.0),
    (14.6, 15.1, -8.0),
    (16.3, 16.7, -13.0),
    (17.3, 17.7, -8.0),
    (18.7, 19.6, 42.0),
    (21.4, 22.6, 38.0),
    (22.7, 23.2, 6.0),
    (23.2, 24.6, -6.0),
    (25.4, 26.2, 3.5),    # 夕日を見る
    (27.4, 28.4, 5.0),
    (29.0, 29.9, 4.0),
]
ROLL_KEYS = [
    (0.0, 0.0, 0.0),
    (12.9, 13.5, 7.0),    # 首をかしげる
    (14.6, 15.1, 0.0),
    (19.2, 19.7, -4.0),
    (22.6, 23.2, 0.0),
]
# 胴の向き（yaw）。跳ぶ前に塀の方へ、振り返りで太陽の方へ。
BODY_YAW_KEYS = [
    (0.0, 0.0, 0.0),
    (6.2, 7.6, 46.0),
    (8.75, 9.4, 0.0),
    (TURN_T0, TURN_T1, TURN_DEG),
]


def track(keys, t):
    v = keys[0][2]
    for (a, b, val) in keys[1:]:
        if t <= a:
            break
        if b <= a:
            v = val
        else:
            v = lerp(v, val, smooth(a, b, t))
    return v


def _noise(t, seed):
    """小さな揺れ（決まった周波数の和なので毎回同じ）。"""
    return (math.sin(t * 2 * math.pi * 0.37 + seed * 1.7) * 0.5
            + math.sin(t * 2 * math.pi * 0.83 + seed * 2.9) * 0.3
            + math.sin(t * 2 * math.pi * 1.91 + seed * 0.7) * 0.2)


def body_position(t):
    """胴の向きの基準になる位置（目の位置から揺れを除いたもの）と、歩きの距離・速さ。"""
    if t < G_STOP:
        s = ground_s(t)
        u = s / G_LEN
        x = lerp(-1.70, STOP_POS[0], smooth(0.55, 1.0, u)) + 0.025 * math.sin(s * 1.9) * (1 - smooth(0.75, 1.0, u))
        y = G_Y0 + s
        z = EYE_GROUND
        dist = s
        speed = G_V if t < G_DECEL0 else G_V * (1 - smooth(G_DECEL0, G_STOP, t))
        return (x, y, z), dist, speed
    if t < J_T0:
        # 構えて、跳ぶ直前にさらに沈む
        z = EYE_GROUND - 0.055 * smooth(6.6, 7.6, t) - 0.03 * smooth(8.3, 8.55, t) + 0.03 * smooth(8.5, 8.6, t)
        return (STOP_POS[0], STOP_POS[1], z), G_LEN, 0.0
    if t < J_T1:
        T = J_T1 - J_T0
        tau = t - J_T0
        u = tau / T
        z0 = EYE_GROUND - 0.055
        z1 = EYE_ON_WALL
        g = 9.81
        vz = (z1 - z0) / T + g * T / 2
        z = z0 + vz * tau - 0.5 * g * tau * tau
        x = lerp(STOP_POS[0], LAND_POS[0], u)
        y = lerp(STOP_POS[1], LAND_POS[1], u)
        return (x, y, z), G_LEN + J_DY * u, 0.0
    # 塀の上
    s = wall_s(t)
    x = WALL_X
    y = LAND_POS[1] + s
    z = EYE_ON_WALL
    # 着地の沈み込み（減衰する揺れ）
    if t < J_T1 + 0.8:
        tau = t - J_T1
        z -= 0.045 * math.exp(-tau * 16.0) * math.sin(min(tau * 22.0, math.pi * 1.5)) if tau > 0 else 0.0
    if t <= W_T1:
        speed = W_V * (smooth(W_T0, W_ACC1, t) if t < W_ACC1 else (1 - smooth(W_DEC0, W_T1, t)))
    else:
        speed = 0.0
    return (x, y, z), G_LEN + J_DY + s, speed


def pose(t):
    (bx, by, bz), dist, speed = body_position(t)
    body_yaw = track(BODY_YAW_KEYS, t)
    head_yaw = track(YAW_KEYS, t)
    pitch = track(PITCH_KEYS, t)
    roll = track(ROLL_KEYS, t)

    # 振り返り: 胴の中心のまわりに頭が回る。足踏みも歩きに数える。
    turn_u = smooth(TURN_T0, TURN_T1, t)
    turn_steps = abs(TURN_DEG) / 180.0 * math.pi * 0.16 * turn_u
    gait_dist = dist + turn_steps
    sit = smooth(SIT_T0, SIT_T1, t)
    crouch = smooth(6.6, 7.6, t) * (1 - smooth(8.5, 8.6, t))
    air = smooth(J_T0, J_T0 + 0.08, t) * (1 - smooth(J_T1 - 0.05, J_T1 + 0.05, t))

    # 頭は胴の中心の 0.24 m 前にある
    neck = 0.24
    cyaw = math.radians(body_yaw)
    fwd = (-math.sin(cyaw), math.cos(cyaw))
    # 胴の中心: 歩き・跳躍中は目の位置から後ろへ neck だけ下げた所
    # 振り返りの間は胴の中心を固定し、頭が回る
    if t >= TURN_T0:
        c0 = (WALL_STOP[0], WALL_STOP[1] - neck)
        cx, cy = c0
        ex, ey = cx + fwd[0] * neck, cy + fwd[1] * neck
    else:
        ex, ey = bx, by
        cx, cy = ex - fwd[0] * neck, ey - fwd[1] * neck
    ez = bz + 0.04 * sit

    # 歩きの揺れ（頭はよく安定させるので小さい）
    phase = gait_dist / STRIDE  # 周期の数
    amp = clamp01(speed / G_V) if t < TURN_T0 else 0.6 * (smooth(TURN_T0, TURN_T0 + 0.3, t) * (1 - smooth(TURN_T1 - 0.3, TURN_T1, t)))
    w = 2 * math.pi * phase
    ez += amp * 0.006 * math.cos(2 * w)
    side = amp * 0.004 * math.sin(w)
    ex += side * math.cos(cyaw)
    ey += side * math.sin(cyaw)
    roll += amp * 1.0 * math.sin(w)
    pitch += amp * 0.8 * math.sin(2 * w + 0.6)

    # 呼吸と細かな揺れ
    still = 1 - clamp01(speed / 0.2)
    ez += still * 0.0015 * math.sin(2 * math.pi * 0.42 * t)
    pitch += 0.35 * _noise(t, 1) + still * 0.15 * math.sin(2 * math.pi * 0.42 * t + 1)
    yaw_n = 0.45 * _noise(t, 2)
    roll += 0.25 * _noise(t, 3)

    # 跳躍中の胴の傾き
    body_pitch = 0.0
    if J_T0 - 0.2 < t < J_T1 + 0.3:
        u = (t - J_T0) / (J_T1 - J_T0)
        body_pitch = 38 * math.sin(math.pi * clamp01(u * 1.1)) * (1 - clamp01(u - 0.6) * 2.5) - 12 * smooth(0.7, 1.0, u) * (1 - smooth(J_T1 + 0.05, J_T1 + 0.3, t))
    body_pitch += 32 * sit

    yaw = body_yaw + head_yaw + yaw_n
    body_z = ez - 0.045 - 0.04 * crouch + 0.02 * sit
    return {
        "t": t,
        "eye": (ex, ey, ez),
        "yaw": yaw, "pitch": pitch, "roll": roll,
        "body": (cx, cy, body_z),
        "body_yaw": body_yaw, "body_pitch": body_pitch,
        "gait": phase, "speed": speed, "amp": amp,
        "crouch": crouch, "sit": sit, "air": air,
        "on_wall": t >= J_T1,
        "ground_z": 0.0 if t < J_T0 + 0.3 else WALL_TOP,
    }


def frame_time(f):
    return (f - 1) / FPS


def footfalls(t_end=DURATION, dt=1.0 / 480):
    """足が着く時刻と足の番号の一覧（足音用）。順番は 左後 0、左前 1、右後 2、右前 3。"""
    out = []
    prev = pose(0.0)["gait"]
    t = dt
    while t < t_end:
        p = pose(t)
        g = p["gait"]
        if p["amp"] > 0.05 and not (J_T0 - 0.05 < t < J_T1):
            for k, off in enumerate((0.0, 0.25, 0.5, 0.75)):
                if math.floor(prev - off) != math.floor(g - off):
                    out.append((t, k, p["amp"], p["on_wall"]))
        prev = g
        t += dt
    return out


# ---- カラス（電線の上） ----
WIRE_TOP_Z = 10.25
CROW_SPOTS = [  # (止まる所, y, 体の向き yaw)  止まる所は "pole"（電柱の頭）か "wire0" などの電線
    ("wire6", 7.6, 70.0),
    ("wire5", 9.0, 115.0),
    ("pole", 14.0, 60.0),
]
CROW_TAKEOFF = 21.3
CAW_TIMES = [  # (時刻, どのカラス(-1 は遠く), 回数)
    (3.6, -1, 2),
    (12.1, -1, 3),
    (19.55, 0, 2),
    (20.75, 1, 1),
]


def crow_flight(t):
    """飛び立つカラス（2 番）の位置・向き・羽ばたき角。None なら止まっている。"""
    if t < CROW_TAKEOFF:
        return None
    tau = t - CROW_TAKEOFF
    # 少し沈んでから上がり、奥（+Y）と右へ離れていく
    dx = 1.8 * tau + 0.25 * tau * tau
    dy = 2.6 * tau + 1.4 * tau * tau
    dz = -0.35 * math.sin(min(tau * 4, math.pi)) + 1.6 * tau + 0.3 * tau * tau
    flap = 62 * math.sin(2 * math.pi * 4.3 * tau) if tau < 2.4 else 40 * math.sin(2 * math.pi * 3.2 * tau)
    yaw = -math.degrees(math.atan2(1.8 + 0.5 * tau, 2.6 + 2.8 * tau))
    return (dx, dy, dz), yaw, flap
