#!/usr/bin/env python3
"""תמלול קובץ wav יחיד עם faster-whisper (CTranslate2) -> txt.
משמש את transcribe.sh במקום ה-CLI של openai-whisper, שחסום ע"י Windows
Smart App Control (torch מגיע עם DLLs לא-חתומים). faster-whisper משתמש
ב-ctranslate2/onnxruntime שאינם חסומים, באותה איכות תמלול בערך.

שימוש: python faster_transcribe.py <in.wav> <out.txt> [model]
"""
import sys

def main():
    if len(sys.argv) < 3:
        print("usage: faster_transcribe.py <in.wav> <out.txt> [model]", file=sys.stderr)
        sys.exit(2)
    wav_path, out_path = sys.argv[1], sys.argv[2]
    model_name = sys.argv[3] if len(sys.argv) > 3 else "base"

    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(wav_path, language=None)
    with open(out_path, "w", encoding="utf-8") as f:
        for seg in segments:
            f.write(seg.text.strip() + "\n")

if __name__ == "__main__":
    main()
