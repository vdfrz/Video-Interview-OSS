# Analysis implementation and reuse

The analysis pipeline is described in [architecture.md](../architecture.md). It provides voluntary practice coaching, not candidate ranking or personality, emotion, honesty, or employability scores.

## Reused code

[Crimson-Genesis/TIPS](https://github.com/Crimson-Genesis/TIPS), commit `6ac7b6b10ae13deb4cec80b9ef334196e3d6f58b`, supplies the MIT-licensed `split_long_segments` function retained in `server/vendor/tips/segmentation.py`. Its original path is `backend/backend/src/stage1_extraction/candidate_audio.py`. The full license remains at `server/vendor/tips/LICENSE`.

`scripts/transcribe.py` adapts the word-timestamp mapping, voice activity filtering, and faster-whisper settings. It uses the base model on CPU/int8, decodes complete recordings locally with ffmpeg, returns timestamped segments, and estimates WPM and internal pauses. It does not adopt personality, emotion, pitch, hiring scores, or persistent upload storage.

The [Video-Interview-Analysis](https://github.com/Mohamed-samy2/Video-Interview-Analysis) project at commit `0daad32321b81d6c2b03a35106e3a95b2c075a23` was inspected but its code was not adopted. The retained PRVIA license is an inspection record.

## Validation boundaries

The server owns question/rubric selection. Providers select segment and frame IDs; the server restores exact quotations and timestamps. Strict schema and evidence checks reject unsupported output. Content and image feedback have independent status, and retries preserve successful components.

The automated suite uses controlled provider responses. Local transcription needs Python, ffmpeg and model weights. Live model availability and human coaching quality require separate verification. Personal review artifacts and recordings are intentionally excluded from this repository.
