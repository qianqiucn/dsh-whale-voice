"""Test-only Fake of the audited `qwen-tts` 0.1.1 surface used by the official worker.

This package is injected through the worker's explicit `--runtime-dir` test hook. It never loads
torch, never downloads weights and never touches the network. It records every call into the
worker's own temporary directory so tests can prove that plain import/health/discovery never load
the model and that a synthesis uses the documented official methods.

It also simulates the nested loader calls of the fixed upstream code (`AutoConfig`, `AutoModel`,
`AutoProcessor`) and deliberately attempts a network access inside them. The worker installs its
in-process network guard before importing this package, so the attempt must be refused; the recorded
exception proves the guard covers nested loaders instead of only the top-level call.
"""

import base64
import hashlib
import json
import os
import time
import urllib.request

_RECORD_FILE = "fake-sdk-calls.jsonl"
_MODE_FILE = "fake-sdk-mode.json"
_FRAMES = 2400

if os.path.exists(os.path.join(os.path.dirname(__file__), "raise-import")):
    # A resolvable spec with a failing import: find_spec succeeds but importing raises.
    raise ImportError("fixture qwen_tts import failure")


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


def _offline_env():
    return {
        "HF_HUB_OFFLINE": os.environ.get("HF_HUB_OFFLINE"),
        "TRANSFORMERS_OFFLINE": os.environ.get("TRANSFORMERS_OFFLINE"),
    }


def _try_network(label):
    try:
        urllib.request.urlopen("https://invalid.example/not-used", timeout=0.1)
    except Exception as error:  # noqa: BLE001 - the exception type is the evidence
        _record(label, blocked=True, error=type(error).__name__)
        return True
    _record(label, blocked=False, error=None)
    return False


class _NestedLoader:
    @classmethod
    def from_pretrained(cls, path, **kwargs):
        _record("nested_" + cls.__name__, path=str(path), kwargs=sorted(kwargs.keys()), offline_env=_offline_env())
        _try_network("nested_network_attempt")
        return cls()


class AutoConfig(_NestedLoader):
    pass


class AutoModel(_NestedLoader):
    pass


class AutoProcessor(_NestedLoader):
    pass


class Qwen3TTSModel:
    def __init__(self, path):
        self.path = path

    @classmethod
    def from_pretrained(cls, path, **kwargs):
        _record(
            "from_pretrained",
            path=str(path),
            kwargs=sorted(kwargs.keys()),
            local_files_only=kwargs.get("local_files_only"),
            trust_remote_code=kwargs.get("trust_remote_code"),
            offline_env=_offline_env(),
        )
        _try_network("top_network_attempt")
        # Simulate the nested loader chain of the fixed upstream implementation.
        AutoConfig.from_pretrained(str(path))
        AutoModel.from_pretrained(str(path))
        AutoProcessor.from_pretrained(str(path))
        delay = _mode().get("loadDelayMs")
        if isinstance(delay, (int, float)) and delay > 0:
            time.sleep(min(float(delay) / 1000.0, 10.0))
        # Simulate the real loader reading config and a speech-tokenizer sub-resource after the
        # delay, so tests can prove a change during loading is noticed by the worker's post-load
        # audit.
        config_path = os.path.join(str(path), "config.json")
        try:
            with open(config_path, "rb") as handle:
                config_bytes = handle.read()
            _record("model_config_read", path=config_path, bytes=len(config_bytes),
                    sha256=hashlib.sha256(config_bytes).hexdigest())
        except OSError:
            _record("model_config_read", path=config_path, error="missing")
        marker_path = os.path.join(str(path), "speech_tokenizer", "marker")
        try:
            with open(marker_path, "rb") as handle:
                marker_bytes = handle.read()
            _record("model_subresource_read", path=marker_path, bytes=len(marker_bytes),
                    sha256=hashlib.sha256(marker_bytes).hexdigest())
        except OSError:
            _record("model_subresource_read", path=marker_path, error="missing")
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
        raw = kwargs.get("ref_audio")
        fields = {
            "text": kwargs.get("text"),
            "language": kwargs.get("language"),
            "ref_text": kwargs.get("ref_text"),
            "x_vector_only_mode": kwargs.get("x_vector_only_mode"),
        }
        if isinstance(raw, str) and raw.startswith("data:audio"):
            try:
                payload = raw.split(",", 1)[1]
                data = base64.b64decode(payload)
                fields.update(ref_audio_kind="data-uri", ref_audio_bytes=len(data),
                              ref_audio_sha256=hashlib.sha256(data).hexdigest())
            except (IndexError, ValueError):
                fields.update(ref_audio_kind="data-uri-invalid")
        elif isinstance(raw, str):
            fields.update(ref_audio_kind="path", ref_audio_path=raw)
        else:
            fields.update(ref_audio_kind=type(raw).__name__)
        _record("generate_voice_clone", **fields)
        self._maybe_delay()
        return ([[0.0] * _FRAMES], 24000)

    def generate_voice_design(self, **kwargs):
        _record("generate_voice_design", text=kwargs.get("text"), language=kwargs.get("language"),
                instruct=kwargs.get("instruct"))
        self._maybe_delay()
        return ([[0.0] * _FRAMES], 24000)


class VoiceClonePromptItem:
    pass
