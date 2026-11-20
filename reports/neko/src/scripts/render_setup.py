"""描画の直前に読む設定（-P で .blend の後、-f / -a の前に渡す）。

GPU（OptiX）を有効にし、環境変数で試し描きの設定を変える。
  NEKO_SAMPLES  サンプル数の上限（既定は .blend の値）
  NEKO_PCT      解像度の割合（%）
  NEKO_THRESH   適応サンプリングのしきい値
"""
import os
import bpy

prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
n_gpu = 0
for d in prefs.devices:
    d.use = d.type == "OPTIX"
    n_gpu += d.use
scene = bpy.context.scene
scene.cycles.device = "GPU" if n_gpu else "CPU"
if os.environ.get("NEKO_SAMPLES"):
    scene.cycles.samples = int(os.environ["NEKO_SAMPLES"])
if os.environ.get("NEKO_PCT"):
    scene.render.resolution_percentage = int(os.environ["NEKO_PCT"])
if os.environ.get("NEKO_THRESH"):
    scene.cycles.adaptive_threshold = float(os.environ["NEKO_THRESH"])
print(f"[render_setup] gpu_devices={n_gpu} samples={scene.cycles.samples} pct={scene.render.resolution_percentage} thresh={scene.cycles.adaptive_threshold}", flush=True)
if os.environ.get("NEKO_NO_OVERWRITE"):
    # 途中で止まったときに、描いたコマを飛ばして続きから描く
    scene.render.use_overwrite = False
    scene.render.use_placeholder = True
