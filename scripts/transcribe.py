#!/usr/bin/env python3
"""Local ASR only; stdout is a single JSON result, diagnostics go to stderr.

Word timestamp mapping and transcription settings adapted from TIPS
candidate_audio.py (6ac7b6b), MIT; licence in server/vendor/tips/LICENSE.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server/vendor/tips'))
from segmentation import split_long_segments


def transcribe(path):
    from faster_whisper import WhisperModel
    with tempfile.TemporaryDirectory(prefix='tcla-audio-') as temp:
        audio_path = str(Path(temp) / 'audio.wav')
        # Entire recording remains on this machine; no shell or remote URL input.
        subprocess.run([os.getenv('FFMPEG_PATH', 'ffmpeg'), '-nostdin', '-hide_banner',
                        '-loglevel', 'error', '-protocol_whitelist', 'file,pipe',
                        '-i', path, '-vn', '-t', '601', '-ac', '1', '-ar',
                        '16000', '-c:a', 'pcm_s16le', audio_path],
                       check=True, timeout=45, capture_output=True)
        with wave.open(audio_path) as wav:
            duration = wav.getnframes() / wav.getframerate()
        if duration <= 0 or duration > 600:
            raise ValueError('Recording must be between 0 and 600 seconds.')
        model = WhisperModel('base', device='cpu', compute_type='int8')
        segments, info = model.transcribe(
            audio_path, word_timestamps=True, vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=700, speech_pad_ms=200),
            condition_on_previous_text=False, compression_ratio_threshold=2.0,
            log_prob_threshold=-0.8, no_speech_threshold=0.5)
        raw = []
        for seg in segments:
            raw.append({'start_sec': round(seg.start, 3), 'end_sec': round(seg.end, 3),
                        'text': seg.text.strip(), 'words': [
                            {'word': w.word, 'start_sec': round(w.start, 3),
                             'end_sec': round(w.end, 3), 'probability': w.probability}
                            for w in (seg.words or [])]})
        split = split_long_segments(raw, min_gap=1.5)
        words = [word for seg in raw for word in seg['words']]
        pauses = sum(1 for left, right in zip(words, words[1:])
                     if right['start_sec'] - left['end_sec'] >= 1.5)
        text = ' '.join(seg['text'] for seg in split).strip()
        if not text:
            raise ValueError('No intelligible speech was detected. Replay the audio and retry.')
        warnings = [
            'Automatic transcript and timestamps may contain errors; replay before relying on quotations.',
            'Words per minute uses transcribed word count divided by total recording time.',
            'Pause count estimates internal word gaps of at least 1.5 seconds; it is not a confidence score.'
        ]
        if info.language_probability < 0.8:
            warnings.append('The transcription language is uncertain.')
        return {'text': text, 'segments': [
                    {'start': seg['start_sec'], 'end': min(seg['end_sec'], duration),
                     'text': seg['text']} for seg in split],
                'duration': round(duration, 3), 'metrics': {
                    'wordsPerMinute': round(len(text.split()) * 60 / duration, 1),
                    'pauseCount': pauses}, 'warnings': warnings}


if __name__ == '__main__':
    try:
        print(json.dumps(transcribe(sys.argv[1])))
    except Exception:
        # Keep paths, recording text and third-party diagnostic output private.
        print('Local transcription failed. Check recording audio and local model availability.', file=sys.stderr)
        sys.exit(1)
