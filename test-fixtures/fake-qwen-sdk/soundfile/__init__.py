"""Test-only Fake of the tiny `soundfile` surface used by the official worker.

It writes a deterministic 100 ms, 24 kHz, mono, PCM16 RIFF/WAVE file so the real Node-side byte
inspector still performs the actual format/duration/peak/hash validation.
"""

import struct
import wave

_FRAMES = 2400


def write(path, data, samplerate, subtype=None):
    frames = len(data) if not isinstance(data, (bytes, bytearray)) else _FRAMES
    frames = _FRAMES if frames <= 0 else int(frames)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(int(samplerate))
        handle.writeframes(struct.pack("<h", 0) * frames)
    return None
