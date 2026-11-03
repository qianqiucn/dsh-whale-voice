"""Controllable Fake KModel/KPipeline; records calls and writes no real model."""

import hashlib
import json
import os
import socket
import time


def _dir():
    return os.environ.get("WV_KOKORO_TMP") or os.getcwd()


def _record(payload):
    with open(os.path.join(_dir(), "fake-kokoro-calls.jsonl"), "a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + "\n")


def _mode():
    path = os.path.join(_dir(), "fake-kokoro-mode.json")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


class KModel:
    def __init__(self, config=None, model=None, disable_complex=False, **kwargs):
        mode = _mode()
        config_bytes = b""
        weight_bytes = b""
        try:
            with open(str(config), "rb") as handle:
                config_bytes = handle.read()
        except OSError:
            pass
        try:
            with open(str(model), "rb") as handle:
                weight_bytes = handle.read()
        except OSError:
            pass
        _record({
            "event": "kmodel",
            "config": str(config),
            "model": str(model),
            "configSha256": hashlib.sha256(config_bytes).hexdigest(),
            "weightSha256": hashlib.sha256(weight_bytes).hexdigest() if weight_bytes else None,
            "weightBytes": len(weight_bytes),
            "disableComplex": disable_complex,
            "mode": mode,
            "offlineEnv": {
                "HF_HUB_OFFLINE": os.environ.get("HF_HUB_OFFLINE"),
                "TRANSFORMERS_OFFLINE": os.environ.get("TRANSFORMERS_OFFLINE"),
            },
        })
        delay = mode.get("loadDelayMs", 0)
        if isinstance(delay, (int, float)) and delay > 0:
            time.sleep(min(float(delay) / 1000.0, 10.0))
        if mode.get("networkAttempt"):
            try:
                socket.create_connection(("127.0.0.1", 9), timeout=0.2)
                _record({"event": "network_attempt", "blocked": False})
            except Exception as error:
                _record({"event": "network_attempt", "blocked": True, "error": type(error).__name__})
        if mode.get("loadError"):
            raise RuntimeError("fixture Kokoro load failure")
        if mode.get("crash"):
            os._exit(3)
        self.device = "cpu"

    def to(self, device):
        self.device = str(device)
        return self

    def eval(self):
        return self


class KPipeline:
    def __init__(self, lang_code, model=None, device=None, **kwargs):
        self.lang_code = str(lang_code)
        self.model = model
        self.device = str(device) if device is not None else "cpu"
        _record({"event": "pipeline", "lang": self.lang_code, "device": self.device})

    def __call__(self, text, voice=None, speed=1.0, **kwargs):
        mode = _mode()
        voice_bytes = b""
        try:
            with open(str(voice), "rb") as handle:
                voice_bytes = handle.read()
        except OSError:
            pass
        _record({
            "event": "infer",
            "lang": self.lang_code,
            "text": text,
            "voice": str(voice),
            "voiceSha256": hashlib.sha256(voice_bytes).hexdigest() if voice_bytes else None,
            "speed": speed,
            "mode": mode,
        })
        if mode.get("g2pError"):
            raise ImportError("fixture G2P missing")
        if mode.get("inferError"):
            raise RuntimeError("fixture Kokoro inference failure")
        if mode.get("noAudio"):
            return
        chunks = int(mode.get("chunks", 1))
        frames = 100 if mode.get("tinyAudio") else 2400
        for index in range(chunks):
            audio = [0.0] * frames
            yield type("Result", (), {"audio": audio, "phonemes": "fixture", "graphemes": str(text)})()
