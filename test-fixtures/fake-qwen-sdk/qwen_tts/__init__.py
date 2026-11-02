"""Test-only Fake of the audited `qwen-tts` 0.1.1 surface used by the official worker.

This package is injected through the worker's explicit `--runtime-dir` test hook. It never loads
torch, never downloads weights and never touches the network. It records every call into the
worker's own temporary directory so tests can prove that plain import/health/discovery never load
the model and that a synthesis uses the documented official methods.
"""

import json
import os
import time

_RECORD_FILE = "fake-sdk-calls.jsonl"
_MODE_FILE = "fake-sdk-mode.json"
_FRAMES = 2400


def _record(event, **fields):
    tmp = os.environ.get("WV_QWEN_TMP")
    if not tmp:
        return
    with open(os.path.join(tmp, _RECORD_FILE), "a", encoding="utf-8") as handle:
        handle.write(json.dumps({"event": event, **fields}, ensure_ascii=False) + "\n")


def _mode():
    tmp = os.environ.get("WV_QWEN_TMP")
    if not tmp:
        return {}
    try:
        with open(os.path.join(tmp, _MODE_FILE), "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}


class Qwen3TTSModel:
    def __init__(self, path):
        self.path = path

    @classmethod
    def from_pretrained(cls, path, **kwargs):
        _record("from_pretrained", path=str(path), kwargs=sorted(kwargs.keys()),
                local_files_only=kwargs.get("local_files_only"), trust_remote_code=kwargs.get("trust_remote_code"))
        return cls(path)

    def _maybe_delay(self):
        delay = _mode().get("delayMs")
        if isinstance(delay, (int, float)) and delay > 0:
            time.sleep(min(float(delay) / 1000.0, 10.0))

    def generate_custom_voice(self, **kwargs):
        _record("generate_custom_voice", text=kwargs.get("text"), language=kwargs.get("language"),
                speaker=kwargs.get("speaker"), instruct=kwargs.get("instruct"))
        self._maybe_delay()
        return ([[0.0] * _FRAMES], 24000)

    def generate_voice_clone(self, **kwargs):
        _record("generate_voice_clone", text=kwargs.get("text"), language=kwargs.get("language"),
                ref_audio=kwargs.get("ref_audio"), ref_text=kwargs.get("ref_text"),
                x_vector_only_mode=kwargs.get("x_vector_only_mode"))
        self._maybe_delay()
        return ([[0.0] * _FRAMES], 24000)

    def generate_voice_design(self, **kwargs):
        _record("generate_voice_design", text=kwargs.get("text"), language=kwargs.get("language"),
                instruct=kwargs.get("instruct"))
        self._maybe_delay()
        return ([[0.0] * _FRAMES], 24000)


class VoiceClonePromptItem:
    pass
