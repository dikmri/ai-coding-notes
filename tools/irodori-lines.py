"""図鑑のセリフを Irodori-TTS で合成する（声の素を作る道具。図鑑そのものは外のサービスもこの道具も使わない）。

使い方（Irodori-TTS の環境で動かす。この PC では H:\\soft\\zundamonVideo\\runtime\\irodori-tts を読むだけで使う）:
    set HF_HOME=H:\\soft\\zundamonVideo\\runtime\\hf_cache
    uv run --no-sync --project H:\\soft\\zundamonVideo\\runtime\\irodori-tts python tools/irodori-lines.py tools/voice-lines/shore.json

ジョブの JSON: {"model": "<HF のリポジトリ>", "out_dir": "runtime/assets/voice/<名前>", "jobs": [
    {"name": "候補の名前", "text": "セリフ", "caption": "声と言い方の指定", "ref": "参照音声（任意）", "seed": 1}, ...]}
out_dir（ROOT からの道筋）に同じ名前の WAV があるジョブは飛ばす。モデルは 1 回だけ読む。ネットには出ない（HF_HUB_OFFLINE=1）。
ログは logs/voice.log に 1 行ずつ追記する（時刻 | 出来事 | 引数 | 結果）。

声は実在の人の声をまねない。キャプションで設計した声と、それを元に作った自前の参照音声だけを使う
（Irodori-TTS のモデルカードの倫理上の制限に従う）。
"""
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")
# 素材とログの置き場所。作業用の場所（worktree）から動かすときは DEKIRU_ROOT に元のチェックアウトを渡す
ROOT = Path(os.environ.get("DEKIRU_ROOT") or Path(__file__).resolve().parents[1])
LOG = ROOT / "logs" / "voice.log"


def log(event, args, result):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat(timespec='milliseconds')} | {event} | "
                f"{json.dumps(args, ensure_ascii=False)} | {result}\n")


def main(path):
    spec = json.loads(Path(path).read_text(encoding="utf-8"))
    out_dir = ROOT / spec["out_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)
    todo = [j for j in spec["jobs"] if not (out_dir / f"{j['name']}.wav").exists()]
    print(f"{len(spec['jobs'])} 件、うち {len(todo)} 件を合成する", flush=True)
    if not todo:
        return
    # irodori_tts はパッケージとして入らず、uv の project のフォルダ（.venv の 1 つ上）にある
    sys.path.insert(0, os.environ.get("IRODORI_DIR") or str(Path(sys.prefix).parent))
    from irodori_tts.inference_runtime import (InferenceRuntime, RuntimeKey, SamplingRequest,
                                               download_hf_checkpoint, resolve_cfg_scales, save_wav)
    t0 = time.time()
    try:
        ckpt = download_hf_checkpoint(spec["model"])
        runtime = InferenceRuntime.from_key(RuntimeKey(checkpoint=str(ckpt), model_device="cuda", codec_device="cuda"))
    except Exception as e:  # noqa: BLE001 - ログに残してから止める
        log("irodori.load", {"model": spec["model"]}, f"ERROR {type(e).__name__}: {e}")
        raise
    log("irodori.load", {"model": spec["model"]}, f"ok {time.time() - t0:.1f}s")
    for job in todo:
        caption = job.get("caption") or None
        ref = job.get("ref")
        ref = str(ROOT / ref) if ref else None
        ct, cc, cs, _ = resolve_cfg_scales(
            cfg_guidance_mode="independent", cfg_scale_text=float(job.get("cfg_text", 3.0)),
            cfg_scale_caption=float(job.get("cfg_caption", 3.0)), cfg_scale_speaker=float(job.get("cfg_speaker", 5.0)),
            cfg_scale=None, use_caption_condition=bool(caption and runtime.model_cfg.use_caption_condition),
            use_speaker_condition=bool(ref and runtime.model_cfg.use_speaker_condition_resolved))
        args = {"name": job["name"], "text": job["text"], "caption": caption, "ref": job.get("ref"), "seed": job.get("seed")}
        t1 = time.time()
        try:
            res = runtime.synthesize(SamplingRequest(
                text=job["text"], caption=caption, ref_wav=ref, no_ref=not ref, num_candidates=1,
                seed=job.get("seed"), cfg_scale_text=ct, cfg_scale_caption=cc, cfg_scale_speaker=cs,
                duration_scale=float(job.get("duration_scale", 1.0))), log_fn=None)
        except Exception as e:  # noqa: BLE001
            log("irodori.synthesize", args, f"ERROR {type(e).__name__}: {e}")
            raise
        out = out_dir / f"{job['name']}.wav"
        save_wav(str(out), res.audio, res.sample_rate)
        log("irodori.synthesize", args, f"ok seed={res.used_seed} {res.sample_rate}Hz {time.time() - t1:.1f}s")
        print("ok", out.name, f"{time.time() - t1:.1f}s", flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
