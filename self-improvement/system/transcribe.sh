#!/usr/bin/env bash
# ============================================================
#  transcribe.sh — תמלול אוטומטי של כל סרטון חדש בתיקייה
# ------------------------------------------------------------
#  סורק את videos/ (וגם את שורש הפרויקט) לקבצי וידאו/אודיו,
#  מחלץ אודיו עם ffmpeg, מתמלל עם Whisper, ושומר ל-transcripts/.
#  מדלג על קבצים שכבר תומללו ועל סרטונים ללא פס-קול.
#
#  שימוש:   bash system/transcribe.sh [model]
#           model = tiny | base | small | medium   (ברירת מחדל: small)
#  הערה: small עם זיהוי-שפה אוטומטי נותן עברית טובה (base משבש עברית).
# ============================================================
set -u
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1

MODEL="${1:-small}"
PY="$(command -v py || command -v python3 || command -v python)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TDIR="$ROOT/transcripts"
TMPBASE="${TMPDIR:-/tmp}/transcribe_$$"
mkdir -p "$TDIR" "$TMPBASE"

shopt -s nullglob nocaseglob
# מקורות: תיקיית videos/ + שורש הפרויקט
SEARCH=("$ROOT/videos" "$ROOT")
EXTS=(mp4 mov avi mkv webm m4v mp3 wav m4a aac)

found=0
for dir in "${SEARCH[@]}"; do
  [ -d "$dir" ] || continue
  for ext in "${EXTS[@]}"; do
    for f in "$dir"/*."$ext"; do
      [ -e "$f" ] || continue
      base="$(basename "$f")"
      name="${base%.*}"
      out="$TDIR/$name.txt"
      [ -f "$out" ] && continue   # כבר תומלל
      found=$((found+1))
      echo ">>> [$found] $base"

      # יש פס-קול?
      if ! ffprobe -v error -select_streams a -show_entries stream=index \
           -of csv=p=0 "$f" 2>/dev/null | grep -q .; then
        echo "    אין פס-קול — מדלג"
        printf '[NO AUDIO TRACK]\n' > "$out"
        continue
      fi

      wav="$TMPBASE/a.wav"
      ffmpeg -y -i "$f" -ar 16000 -ac 1 -c:a pcm_s16le "$wav" >/dev/null 2>&1
      # הערה: openai-whisper/torch חסומים ע"י Windows Smart App Control (DLLs
      # לא-חתומים) מאז 2026-10-12. עברנו ל-faster-whisper (ctranslate2/onnxruntime),
      # שאינו חסום, באיכות תמלול דומה. ראה system/faster_transcribe.py.
      py_script="$(cygpath -w "$ROOT/system/faster_transcribe.py")"
      wav_win="$(cygpath -w "$wav")"
      out_win="$(cygpath -w "$TMPBASE/a.txt")"
      "$PY" "$py_script" "$wav_win" "$out_win" "$MODEL" 2>"$TMPBASE/err.log"
      if [ -f "$TMPBASE/a.txt" ] && [ -s "$TMPBASE/a.txt" ]; then
        mv "$TMPBASE/a.txt" "$out"
        echo "    OK -> transcripts/$name.txt"
      else
        echo "    נכשל"
        cat "$TMPBASE/err.log" >&2
      fi
    done
  done
done

rm -rf "$TMPBASE"
[ "$found" -eq 0 ] && echo "אין סרטונים חדשים לתמלול." || echo "=== הסתיים: $found קבצים ==="
