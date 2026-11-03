"""Controllable Fake IndexTTS-2.5 constructor/inference used only by offline tests."""

import hashlib
import json
import os
import re
import socket
import time
import wave


def _dir():
    return os.environ.get("WV_INDEX_TTS_TMP") or os.getcwd()


def _record(payload):
    with open(os.path.join(_dir(), "fake-indextts-calls.jsonl"), "a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + "\n")


def _mode():
    path = os.path.join(_dir(), "fake-indextts-mode.json")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


class IndexTTS2:
    def __init__(self, cfg_path=None, model_dir=None, use_bf16=False, device=None,
                 use_cuda_kernel=None, use_deepspeed=False, use_accel=False,
                 use_torch_compile=False, use_qwen_emo=False):
        mode = _mode()
        config_path = os.path.join(str(model_dir), "config.yaml")
        config_bytes = b""
        try:
            with open(config_path, "rb") as handle:
                config_bytes = handle.read()
        except OSError:
            pass
        config_text = config_bytes.decode("utf-8", "replace")
        match = re.search(r"(?m)^version:\s*([^\s#]+)", config_text)
        config_version = match.group(1) if match else None
        weight_bytes = b""
        weight_path = os.path.join(str(model_dir), "model.safetensors")
        try:
            with open(weight_path, "rb") as handle:
                weight_bytes = handle.read()
        except OSError:
            pass
        _record({
            "event": "from_pretrained",
            "path": str(model_dir),
            "cfgPath": str(cfg_path),
            "mode": mode,
            "configBytes": len(config_bytes),
            "configVersion": config_version,
            "configSha256": hashlib.sha256(config_bytes).hexdigest(),
            "weightSha256": hashlib.sha256(weight_bytes).hexdigest() if weight_bytes else None,
            "weightBytes": len(weight_bytes),
            "kwargs": {
                "use_bf16": use_bf16,
                "device": device,
                "use_cuda_kernel": use_cuda_kernel,
                "use_qwen_emo": use_qwen_emo,
            },
            "offlineEnv": {
                "HF_HUB_OFFLINE": os.environ.get("HF_HUB_OFFLINE"),
                "TRANSFORMERS_OFFLINE": os.environ.get("TRANSFORMERS_OFFLINE"),
                "MODELSCOPE_OFFLINE": os.environ.get("MODELSCOPE_OFFLINE"),
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
            raise RuntimeError("fixture IndexTTS load failure")
        if mode.get("crash"):
            os._exit(3)

    def infer(self, spk_audio_prompt=None, text=None, output_path=None, lang=None,
              emo_audio_prompt=None, emo_alpha=1.0, emo_vector=None,
              use_emo_text=False, emo_text=None, use_random=False, interval_silence=200,
              verbose=False, max_text_tokens_per_segment=120, stream_return=False,
              more_segment_before=0, duration_factor=1.0, text_normalization=True,
              **generation_kwargs):
        mode = _mode()
        reference = b""
        try:
            with open(str(spk_audio_prompt), "rb") as handle:
                reference = handle.read()
        except OSError:
            reference = b""
        emo_reference = b""
        if emo_audio_prompt:
            try:
                with open(str(emo_audio_prompt), "rb") as handle:
                    emo_reference = handle.read()
            except OSError:
                emo_reference = b""
        _record({
            "event": "infer",
            "kwargs": {
                "spk_audio_prompt": str(spk_audio_prompt),
                "text": text,
                "output_path": str(output_path),
                "lang": lang,
                "emo_audio_prompt": str(emo_audio_prompt) if emo_audio_prompt else None,
                "emo_alpha": emo_alpha,
                "emo_vector": emo_vector,
                "use_emo_text": use_emo_text,
                "emo_text": emo_text,
                "use_random": use_random,
                "verbose": verbose,
                "text_normalization": text_normalization,
            },
            "refBytes": len(reference),
            "refBytesSha256": hashlib.sha256(reference).hexdigest() if reference else None,
            "emoBytesSha256": hashlib.sha256(emo_reference).hexdigest() if emo_reference else None,
        })
        if not output_path:
            return None
        if mode.get("noOutput"):
            return None
        sample_rate = int(mode.get("sampleRate", 22050))
        frames = 100 if mode.get("tinyAudio") else int(0.25 * sample_rate)
        with wave.open(str(output_path), "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(sample_rate)
            handle.writeframes(b"\x00\x00" * frames)
        return str(output_path)
