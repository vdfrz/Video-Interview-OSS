"""Adapted from Crimson-Genesis/TIPS, MIT.
Pinned commit: 6ac7b6b10ae13deb4cec80b9ef334196e3d6f58b
Source: backend/backend/src/stage1_extraction/candidate_audio.py
Original split_long_segments retained; only module dependencies removed.
See LICENSE in this folder.
"""

def split_long_segments(segments, min_gap=1.5):
    """Split segments at any gap >= min_gap seconds between words."""
    result = []

    for seg in segments:
        words = seg.get("words", [])

        if len(words) <= 1:
            result.append(seg)
            continue

        current_chunk_start = words[0]["start_sec"]
        current_chunk_words = []

        for i, word in enumerate(words):
            current_chunk_words.append(word)

            if i + 1 < len(words):
                gap = words[i + 1]["start_sec"] - word["end_sec"]

                if gap >= min_gap:
                    result.append({
                        "start_sec": round(current_chunk_start, 3),
                        "end_sec": round(word["end_sec"], 3),
                        "text": "".join(w["word"] for w in current_chunk_words).strip(),
                        "words": current_chunk_words
                    })
                    current_chunk_start = words[i + 1]["start_sec"]
                    current_chunk_words = []

        if current_chunk_words:
            result.append({
                "start_sec": round(current_chunk_start, 3),
                "end_sec": round(words[-1]["end_sec"], 3),
                "text": "".join(w["word"] for w in current_chunk_words).strip(),
                "words": current_chunk_words
            })

    return result
