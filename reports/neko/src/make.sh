#!/bin/bash
# 野良猫の目線の 30 秒（Blender Cycles + numpy の音）を 1 つのコマンドで作る。
#
#   bash make.sh                      素材の取得 → 組み立て → 720 コマ描画 → 音 → mp4
#   bash make.sh --frames 1-48        描くコマの範囲（mp4 もその範囲で作る）
#   bash make.sh --preview            見本の 8 コマだけ out/preview/ に描く（mp4 は作らない）
#   bash make.sh --no-scans           Poly Haven の素材を使わず手続きの代わりで描く（出力名に _noscans）
#   bash make.sh --samples 64         サンプル数の上限を変える（既定 96）
#   bash make.sh --only build,render  段階を選ぶ（fetch,check,build,render,audio,mux）
#
# 環境変数 BLENDER で blender.exe の場所を変えられる。乱数の種は scripts/common.py の SEED。
set -euo pipefail
cd "$(dirname "$0")"
ROOT_W=$(pwd -W 2>/dev/null || pwd)

BLENDER=${BLENDER:-"/c/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe"}
BPY=${BPY:-"$(dirname "$BLENDER")/5.3/python/bin/python.exe"}

SCANS=1
FRAMES="1-720"
PREVIEW=0
SAMPLES=""
ONLY="fetch,check,build,render,audio,mux"
PREVIEW_FRAMES="1,100,190,232,320,470,520,680"

while [ $# -gt 0 ]; do
  case "$1" in
    --no-scans) SCANS=0 ;;
    --frames) FRAMES="$2"; shift ;;
    --preview) PREVIEW=1 ;;
    --samples) SAMPLES="$2"; shift ;;
    --only) ONLY="$2"; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 2 ;;
  esac
  shift
done

TAG=$([ $SCANS = 1 ] && echo scans || echo noscans)
SUFFIX=$([ $SCANS = 1 ] && echo "" || echo "_noscans")
mkdir -p logs build out
LOG=logs/build.log
log() { echo "$(date -Iseconds) stage=$1 result=$2 ${3:-}" | tee -a "$LOG"; }
want() { [[ ",$ONLY," == *",$1,"* ]]; }

log make start "args=scans:$SCANS,frames:$FRAMES,preview:$PREVIEW,samples:${SAMPLES:-default},only:$ONLY"

if want fetch && [ $SCANS = 1 ]; then
  "$BPY" -I scripts/fetch_assets.py
fi

if want check; then
  "$BPY" -I scripts/check_timeline.py | while IFS= read -r l; do log check ok "$l"; done
fi

BLEND="build/scene_${TAG}.blend"
if want build; then
  t0=$(date +%s)
  ARGS=()
  [ $SCANS = 0 ] && ARGS+=(--no-scans)
  "$BLENDER" -b --factory-startup --python-exit-code 1 -P scripts/build_scene.py -- "${ARGS[@]}" > "logs/build_scene_${TAG}.txt" 2>&1 \
    || { log build error "logs/build_scene_${TAG}.txt を見る"; exit 1; }
  log build done "file=$BLEND sec=$(( $(date +%s) - t0 ))"
fi

render() {  # $1: 出力の接頭辞（Windows 形式の絶対パス）、$2 以降: blender の描画の引数
  local prefix="$1"; shift
  local t0; t0=$(date +%s)
  local times="logs/render_times_${TAG}.tsv"
  [ -f "$times" ] || echo -e "time\tframe\tsec" > "$times"
  NEKO_SAMPLES="$SAMPLES" NEKO_NO_OVERWRITE="${NEKO_NO_OVERWRITE:-}" \
    "$BLENDER" -b "$BLEND" -P scripts/render_setup.py -o "$prefix" -F PNG "$@" 2>&1 \
    | while IFS= read -r line; do
        case "$line" in
          *"Saved: "*) cur=$(echo "$line" | sed -E "s/.*_([0-9]{4})\.png.*/\1/") ;;
          *" Time: "*)
            sec=$(echo "$line" | sed -E 's/.*Time: ([0-9:.]+).*/\1/' | awk -F: '{print ($1*60)+$2}')
            echo -e "$(date -Iseconds)\t${cur:-?}\t$sec" >> "$times"
            echo "frame ${cur:-?} ${sec}s" ;;
          *"[render_setup]"*|*"Error"*|*"error:"*) echo "$line" ;;
        esac
      done
  echo $(( $(date +%s) - t0 ))
}

if want render; then
  if [ $PREVIEW = 1 ]; then
    mkdir -p "out/preview${SUFFIX}"
    out=$(render "$ROOT_W/out/preview${SUFFIX}/f_####" -f "$PREVIEW_FRAMES" | tee /dev/stderr | tail -1)
    log render_preview done "frames=$PREVIEW_FRAMES dir=out/preview${SUFFIX} sec=$out"
  else
    A=${FRAMES%-*}; B=${FRAMES#*-}
    mkdir -p "out/frames${SUFFIX}"
    out=$(render "$ROOT_W/out/frames${SUFFIX}/f_####" -s "$A" -e "$B" -a | tee /dev/stderr | tail -1)
    n=$(( B - A + 1 ))
    log render done "frames=$A-$B count=$n sec=$out per_frame=$(awk -v s="$out" -v n="$n" 'BEGIN{printf "%.2f", s/n}')"
  fi
fi

if want audio; then
  "$BPY" -I scripts/audio.py
fi

if want mux && [ $PREVIEW = 0 ]; then
  A=${FRAMES%-*}; B=${FRAMES#*-}
  NAME="neko${SUFFIX}"
  [ "$A-$B" != "1-720" ] && NAME="${NAME}_${A}-${B}"
  SS=$(awk -v a="$A" 'BEGIN{printf "%.4f", (a-1)/24}')
  DURS=$(awk -v a="$A" -v b="$B" 'BEGIN{printf "%.4f", (b-a+1)/24}')
  ffmpeg -y -loglevel error -framerate 24 -start_number "$A" -i "out/frames${SUFFIX}/f_%04d.png" \
    -ss "$SS" -t "$DURS" -i out/audio.wav \
    -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -r 24 \
    -c:a aac -b:a 192k -t "$DURS" -movflags +faststart "out/${NAME}.mp4"
  log mux done "file=out/${NAME}.mp4 bytes=$(stat -c %s "out/${NAME}.mp4")"
fi

log make end "scans=$SCANS"
