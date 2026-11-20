"""共通: 置き場所と記録（logs/build.log）。"""
import os
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
BUILD = os.path.join(ROOT, "build")
OUT = os.path.join(ROOT, "out")
LOGS = os.path.join(ROOT, "logs")
BUILD_LOG = os.path.join(LOGS, "build.log")

FPS = 24
FRAMES = 720
SEED = 20261120


def now_iso():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def log(stage, result, detail=""):
    os.makedirs(LOGS, exist_ok=True)
    line = f"{now_iso()} stage={stage} result={result}"
    if detail:
        line += " " + detail
    with open(BUILD_LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line, flush=True)
