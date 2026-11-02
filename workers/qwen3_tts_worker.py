#!/usr/bin/env python3
# Whale Voice — Qwen3-TTS official worker (Plan10 10-A, offline candidate).
#
# A narrow, versioned NDJSON worker around the fixed upstream `qwen-tts` 0.1.1 package
# (commit 022e286b98fbec7e1e916cb940cdf532cd9f488e). It is deliberately conservative:
#   * importing this file loads no model and no heavy dependency; only a synthesize request
#     imports `qwen_tts` and calls `Qwen3TTSModel.from_pretrained`;
#   * the model must be an existing local directory inside an explicit allowed root, the identity
#     must be an audited released model and must match the local `config.json`, and the load always
#     passes `local_files_only=True`, so no implicit download or network fallback can happen;
#   * clone reference material is an opaque token resolved against a trusted local index whose files
#     must also live inside the allowed root; URLs/base64/paths never cross the protocol;
#   * one synthesis at a time, cancellation is acknowledged separately from actual stop, and every
#     response carries the in-flight identity it belongs to.
#
# This worker never writes outside its own temporary directory, never starts other processes and
# never touches WeChat, the DSH host or production configuration.

import base64
import importlib.metadata
import json
import os
import re
import sys
import tempfile
import threading

PROTOCOL_VERSION = 1
MAX_LINE_BYTES = 2 * 1024 * 1024
MAX_CONFIG_BYTES = 1024 * 1024
MAX_INDEX_BYTES = 256 * 1024
MAX_REFERENCE_BYTES = 20 * 1024 * 1024
MAX_TEXT_CHARS = 200
MAX_AUDIO_SECONDS = 20
MAX_OUTPUT_BYTES = 1024 * 1024
REQUEST_TIMEOUT_MS = 120000

WORKER_VERSION = "0.1.0"
PROVIDER = "qwen-tts"
PACKAGE_VERSION = "0.1.1"

MODEL_PATTERN = re.compile(r"^Qwen3-TTS-(12Hz|25Hz)-(0\.6B|1\.7B)-(Base|CustomVoice|VoiceDesign)$")
AUDITED_MODELS = {
    "Qwen3-TTS-12Hz-1.7B-Base": ("base-clone", "base", "1b7"),
    "Qwen3-TTS-12Hz-0.6B-Base": ("base-clone", "base", "0b6"),
    "Qwen3-TTS-12Hz-1.7B-CustomVoice": ("custom-voice", "custom_voice", "1b7"),
    "Qwen3-TTS-12Hz-0.6B-CustomVoice": ("custom-voice", "custom_voice", "0b6"),
    "Qwen3-TTS-12Hz-1.7B-VoiceDesign": ("voice-design", "voice_design", "1b7"),
}
LANGUAGE_IN = {"zh-CN", "en-US"}
LANGUAGE_OUT = {"zh-CN": "Chinese", "en-US": "English"}
CONFIG_LANGUAGE = {"chinese": "zh-CN", "english": "en-US"}
EMOTION_INSTRUCT = {
    "neutral": "",
    "cheerful": "用愉快、上扬的语气说。",
    "gentle": "用轻柔、温和的语气说。",
}

ERRORS = {
    "INVALID_INPUT": "QWEN_INVALID_INPUT",
    "WORKER_NOT_CONFIGURED": "QWEN_WORKER_NOT_CONFIGURED",
    "RESOURCE_UNVERIFIED": "QWEN_RESOURCE_UNVERIFIED",
    "MODEL_MISMATCH": "QWEN_MODEL_MISMATCH",
    "MODEL_BACKEND_MISMATCH": "QWEN_MODEL_BACKEND_MISMATCH",
    "DEPENDENCY_MISSING": "QWEN_DEPENDENCY_MISSING",
    "PROVIDER_NOT_READY": "QWEN_PROVIDER_NOT_READY",
    "CLONE_BINDING_REQUIRED": "QWEN_CLONE_BINDING_REQUIRED",
    "VOICE_DESIGN_NOT_EXPOSED": "QWEN_VOICE_DESIGN_NOT_EXPOSED",
    "OUTPUT_TOO_LARGE": "QWEN_OUTPUT_TOO_LARGE",
    "OUTPUT_INVALID": "QWEN_OUTPUT_INVALID",
    "UNKNOWN_RESULT": "QWEN_UNKNOWN_RESULT",
    "CANCELLED": "QWEN_CANCELLED",
    "TIMEOUT": "QWEN_TIMEOUT",
    "PROTOCOL_INVALID": "QWEN_PROTOCOL_INVALID",
    "BUSY": "QWEN_PROVIDER_NOT_READY",
}

WRITE_LOCK = threading.Lock()
ARGS = {}
START_ERROR = None
MODEL_DIR = None
MODEL_ID = None
BACKEND = None
MODEL_TYPE = None
MODEL_SIZE = None
INSTRUCT_SUPPORTED = False
LANGUAGES = []
VOICES = []
VOICE_NAMES = {}
BINDING_INDEX = {}
PACKAGE_VERSION_DETECTED = None
QWEN_TTS = None
SOUNDFILE = None
MODEL = None
LOADED = False
ACTIVE_REQUEST = None
CANCEL_EVENTS = {}
CANCEL_LOCK = threading.Lock()


class DependencyMissing(Exception):
    """The audited upstream package is absent from the configured local runtime."""


def emit(message):
    line = json.dumps(message, ensure_ascii=False, separators=(",", ":"))
    with WRITE_LOCK:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def fail(message_id, code, text="", request_id=None):
    payload = {"code": code}
    if text:
        payload["message"] = text[:240]
    if request_id:
        payload["requestId"] = request_id
    emit({"v": PROTOCOL_VERSION, "id": message_id, "type": "error", "payload": payload})


def start_error(code, text=""):
    global START_ERROR
    START_ERROR = (code, text)


def inside(root, candidate):
    try:
        real_root = os.path.realpath(root)
        real = os.path.realpath(candidate)
    except OSError:
        return None
    if real == real_root or not real.startswith(real_root + os.sep):
        return None
    return real


def read_json_file(path, max_bytes):
    try:
        if os.path.getsize(path) > max_bytes:
            return None
    except OSError:
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def detect_package_version(runtime_dir):
    if runtime_dir:
        sys.path.insert(0, runtime_dir)
    try:
        return importlib.metadata.version("qwen-tts")
    except importlib.metadata.PackageNotFoundError:
        return None
    except Exception:
        return None


def load_binding_index(index_path, allowed_root):
    if not index_path:
        return {}
    real = inside(allowed_root, index_path)
    if real is None or not os.path.isfile(real):
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding index escapes the allowed root")
        return {}
    data = read_json_file(real, MAX_INDEX_BYTES)
    if not isinstance(data, dict) or len(data) > 256:
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding index is not a bounded object")
        return {}
    result = {}
    for token, entry in data.items():
        if not isinstance(token, str) or not re.match(r"^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$", token):
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding token is invalid")
            return {}
        if not isinstance(entry, dict):
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding entry is not an object")
            return {}
        candidate = entry.get("file")
        if not isinstance(candidate, str) or os.path.isabs(candidate):
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding file must be a relative path")
            return {}
        resolved = inside(allowed_root, os.path.join(allowed_root, candidate))
        if resolved is None or not os.path.isfile(resolved):
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding file escapes the allowed root")
            return {}
        try:
            if os.path.getsize(resolved) > MAX_REFERENCE_BYTES:
                start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding file is too large")
                return {}
        except OSError:
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding file is unreadable")
            return {}
        text = entry.get("text")
        if text is not None and not isinstance(text, str):
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding text must be a string")
            return {}
        result[token] = {"file": resolved, "text": text}
    return result


def discover_voices(config, backend):
    talker = config.get("talker_config") if isinstance(config.get("talker_config"), dict) else {}
    if backend == "custom-voice":
        speakers = talker.get("spk_id")
        if not isinstance(speakers, dict):
            return []
        voices = []
        for name in speakers.keys():
            if not isinstance(name, str) or not name.strip():
                continue
            voice_id = re.sub(r"[^a-z0-9-]", "-", name.strip().lower())
            voice_id = re.sub(r"-+", "-", voice_id).strip("-")
            if not re.match(r"^[a-z][a-z0-9-]{1,63}$", voice_id):
                continue
            if voice_id in VOICE_NAMES:
                continue
            VOICE_NAMES[voice_id] = name.strip()
            voices.append({"id": voice_id, "name": name.strip()[:128], "languages": list(LANGUAGES)})
        return voices
    return []


def discover_languages(config):
    talker = config.get("talker_config") if isinstance(config.get("talker_config"), dict) else {}
    codec = talker.get("codec_language_id")
    if not isinstance(codec, dict):
        return []
    languages = []
    for name in codec.keys():
        mapped = CONFIG_LANGUAGE.get(str(name).lower())
        if mapped and mapped not in languages:
            languages.append(mapped)
    return languages


def load_configuration():
    global MODEL_DIR, MODEL_ID, BACKEND, MODEL_TYPE, MODEL_SIZE, INSTRUCT_SUPPORTED
    global LANGUAGES, VOICES, BINDING_INDEX, PACKAGE_VERSION_DETECTED

    model_dir = ARGS.get("model-dir")
    allowed_root = ARGS.get("allowed-root")
    model_id = ARGS.get("model-id")
    if not isinstance(allowed_root, str) or not os.path.isabs(allowed_root) or not os.path.isdir(allowed_root):
        start_error(ERRORS["WORKER_NOT_CONFIGURED"], "an explicit absolute allowed root is required")
        return
    if not isinstance(model_dir, str) or not os.path.isabs(model_dir):
        start_error(ERRORS["WORKER_NOT_CONFIGURED"], "an explicit absolute model directory is required")
        return
    if not isinstance(model_id, str) or model_id not in AUDITED_MODELS:
        start_error(ERRORS["MODEL_MISMATCH"], "the model identity is not audited")
        return
    resolved = inside(allowed_root, model_dir)
    if resolved is None or not os.path.isdir(resolved):
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the model directory escapes the allowed root")
        return
    config = read_json_file(os.path.join(resolved, "config.json"), MAX_CONFIG_BYTES)
    if not isinstance(config, dict):
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local model configuration is unreadable or oversized")
        return
    backend, expected_type, expected_size = AUDITED_MODELS[model_id]
    if config.get("tts_model_type") != expected_type or config.get("tts_model_size") != expected_size:
        start_error(ERRORS["MODEL_BACKEND_MISMATCH"], "the local model configuration contradicts the model identity")
        return
    MODEL_DIR = resolved
    MODEL_ID = model_id
    BACKEND = backend
    MODEL_TYPE = expected_type
    MODEL_SIZE = expected_size
    INSTRUCT_SUPPORTED = backend == "custom-voice" and expected_size != "0b6"
    LANGUAGES = discover_languages(config)
    if not LANGUAGES:
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local model declares no audited language")
        return
    if backend == "voice-design":
        start_error(ERRORS["VOICE_DESIGN_NOT_EXPOSED"], "VoiceDesign is declared but not exposed in 10-A")
        return
    VOICES = discover_voices(config, backend)
    BINDING_INDEX = load_binding_index(ARGS.get("binding-index"), allowed_root)
    if START_ERROR:
        return
    PACKAGE_VERSION_DETECTED = detect_package_version(ARGS.get("runtime-dir"))
    if PACKAGE_VERSION_DETECTED != PACKAGE_VERSION:
        start_error(ERRORS["DEPENDENCY_MISSING"], "the audited qwen-tts package version was not found locally")


def ready_payload():
    return {
        "provider": PROVIDER,
        "workerVersion": WORKER_VERSION,
        "workerProtocol": PROTOCOL_VERSION,
        "qwenTtsVersion": PACKAGE_VERSION_DETECTED,
        "backend": BACKEND,
        "model": MODEL_ID,
        "modelSize": MODEL_SIZE,
        "instructSupported": INSTRUCT_SUPPORTED,
        "languages": list(LANGUAGES),
        "voices": [dict(voice) for voice in VOICES],
        "limits": {
            "maxChars": MAX_TEXT_CHARS,
            "maxAudioSeconds": MAX_AUDIO_SECONDS,
            "timeoutMs": REQUEST_TIMEOUT_MS,
        },
        "loaded": LOADED,
        "state": "ok",
    }


def ensure_runtime():
    global QWEN_TTS, SOUNDFILE
    if QWEN_TTS is not None and SOUNDFILE is not None:
        return QWEN_TTS, SOUNDFILE
    runtime_dir = ARGS.get("runtime-dir")
    if isinstance(runtime_dir, str) and runtime_dir:
        runtime_real = inside(ARGS.get("allowed-root"), runtime_dir) if ARGS.get("allowed-root") else None
        if runtime_real is None:
            raise RuntimeError("runtime directory escapes the allowed root")
    try:
        import qwen_tts  # noqa: F401  (lazy: only a real synthesis imports the heavy package)
        import soundfile  # noqa: F401
    except ImportError as error:
        raise DependencyMissing("qwen-tts dependency is not importable") from error
    QWEN_TTS = qwen_tts
    SOUNDFILE = soundfile
    return QWEN_TTS, SOUNDFILE


def ensure_model():
    global MODEL, LOADED
    if MODEL is not None:
        return MODEL
    qwen, _soundfile = ensure_runtime()
    MODEL = qwen.Qwen3TTSModel.from_pretrained(
        MODEL_DIR,
        local_files_only=True,
        trust_remote_code=False,
    )
    LOADED = True
    return MODEL


def frame_count(wav):
    try:
        return len(wav)
    except TypeError:
        return 1


def write_wav(wav, samplerate):
    global SOUNDFILE
    _qwen, soundfile = ensure_runtime()
    SOUNDFILE = soundfile
    handle, path = tempfile.mkstemp(prefix="wv-qwen-out-", suffix=".wav", dir=ARGS.get("tmp-dir") or os.environ.get("WV_QWEN_TMP"))
    os.close(handle)
    try:
        soundfile.write(path, wav, int(samplerate), subtype="PCM_16")
        with open(path, "rb") as stream:
            data = stream.read()
        frames = frame_count(wav)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    return data, frames


def synthesize_once(message):
    global ACTIVE_REQUEST, MODEL
    payload = message.get("payload") if isinstance(message.get("payload"), dict) else {}
    request_id = payload.get("requestId")
    model = payload.get("model")
    backend = payload.get("backend")
    modality = payload.get("modality")
    voice_id = payload.get("voiceId")
    language = payload.get("language")
    emotion = payload.get("emotion")
    binding_ref = payload.get("bindingRef")
    text = payload.get("text")
    if not isinstance(request_id, str) or not isinstance(text, str) or not text.strip():
        return fail(message["id"], ERRORS["INVALID_INPUT"], "request id and text are required")
    if model != MODEL_ID or backend != BACKEND:
        return fail(message["id"], ERRORS["MODEL_BACKEND_MISMATCH"], "the request does not match the loaded worker identity")
    if language not in LANGUAGE_IN or language not in LANGUAGES:
        return fail(message["id"], ERRORS["INVALID_INPUT"], "the language is not declared by the local model")
    if modality == "preset":
        if BACKEND != "custom-voice":
            return fail(message["id"], ERRORS["MODEL_BACKEND_MISMATCH"], "preset voices need a CustomVoice model")
        if voice_id not in VOICE_NAMES:
            return fail(message["id"], ERRORS["CLONE_BINDING_REQUIRED"] if voice_id else ERRORS["INVALID_INPUT"], "unknown preset voice")
        if emotion not in EMOTION_INSTRUCT:
            return fail(message["id"], ERRORS["INVALID_INPUT"], "unsupported emotion")
        if emotion != "neutral" and not INSTRUCT_SUPPORTED:
            return fail(message["id"], ERRORS["INVALID_INPUT"], "this model does not support instruction control")
    elif modality == "clone":
        if BACKEND != "base-clone":
            return fail(message["id"], ERRORS["MODEL_BACKEND_MISMATCH"], "clone needs a Base model")
        if not isinstance(binding_ref, str) or binding_ref not in BINDING_INDEX:
            return fail(message["id"], ERRORS["CLONE_BINDING_REQUIRED"], "the trusted clone binding is unknown")
    else:
        return fail(message["id"], ERRORS["VOICE_DESIGN_NOT_EXPOSED"], "only preset and clone modalities are exposed")

    with CANCEL_LOCK:
        if ACTIVE_REQUEST is not None:
            return fail(message["id"], ERRORS["BUSY"], "one synthesis at a time")
        ACTIVE_REQUEST = request_id
        CANCEL_EVENTS[request_id] = threading.Event()
    thread = threading.Thread(target=run_synthesis, args=(message, payload), daemon=True)
    thread.start()


def run_synthesis(message, payload):
    global ACTIVE_REQUEST, MODEL
    request_id = payload["requestId"]
    event = CANCEL_EVENTS.get(request_id)
    try:
        try:
            model = ensure_model()
        except DependencyMissing:
            fail(message["id"], ERRORS["DEPENDENCY_MISSING"], "the local qwen-tts package is not importable", request_id)
            return
        except Exception:
            fail(message["id"], ERRORS["RESOURCE_UNVERIFIED"], "the local model could not be loaded", request_id)
            return
        try:
            if payload["modality"] == "preset":
                wavs, samplerate = model.generate_custom_voice(
                    text=payload["text"],
                    language=LANGUAGE_OUT[payload["language"]],
                    speaker=VOICE_NAMES[payload["voiceId"]],
                    instruct=EMOTION_INSTRUCT.get(payload.get("emotion") or "neutral", ""),
                )
            else:
                binding = BINDING_INDEX[payload["bindingRef"]]
                wavs, samplerate = model.generate_voice_clone(
                    text=payload["text"],
                    language=LANGUAGE_OUT[payload["language"]],
                    ref_audio=binding["file"],
                    ref_text=binding.get("text"),
                    x_vector_only_mode=binding.get("text") is None,
                )
        except Exception as error:
            fail(message["id"], ERRORS["PROVIDER_NOT_READY"], "the local synthesis failed (" + type(error).__name__ + ")", request_id)
            return
        if event is not None and event.is_set():
            emit({
                "v": PROTOCOL_VERSION,
                "id": message["id"],
                "type": "result",
                "payload": {
                    "state": "cancelled",
                    "requestId": request_id,
                    "model": MODEL_ID,
                    "backend": BACKEND,
                    "voiceId": payload.get("voiceId"),
                },
            })
            return
        if not isinstance(wavs, (list, tuple)) or not wavs:
            fail(message["id"], ERRORS["OUTPUT_INVALID"], "the local model returned no audio", request_id)
            return
        data, frames = write_wav(wavs[0], samplerate)
        if len(data) > MAX_OUTPUT_BYTES:
            fail(message["id"], ERRORS["OUTPUT_TOO_LARGE"], "the produced audio exceeds the batch budget", request_id)
            return
        emit({
            "v": PROTOCOL_VERSION,
            "id": message["id"],
            "type": "result",
            "payload": {
                "state": "ok",
                "mime": "audio/wav",
                "sampleRate": int(samplerate),
                "channels": 1,
                "durationMs": int(round(frames * 1000 / int(samplerate))) if frames else 0,
                "bytesBase64": base64.b64encode(data).decode("ascii"),
                "model": MODEL_ID,
                "backend": BACKEND,
                "voiceId": payload.get("voiceId"),
                "requestId": request_id,
            },
        })
    except Exception as error:  # noqa: BLE001 — never leave the caller without a terminal answer
        fail(message["id"], ERRORS["OUTPUT_INVALID"], "the worker could not complete the synthesis (" + type(error).__name__ + ")", request_id)
    finally:
        with CANCEL_LOCK:
            ACTIVE_REQUEST = None
            CANCEL_EVENTS.pop(request_id, None)


def handle_message(message):
    if not isinstance(message, dict):
        return
    message_id = message.get("id")
    message_type = message.get("type")
    if not isinstance(message_id, str):
        return
    if START_ERROR is not None:
        code, text = START_ERROR
        fail(message_id, code, text)
        threading.Timer(0.05, lambda: os._exit(0)).start()
        return
    if message.get("v") != PROTOCOL_VERSION:
        return fail(message_id, ERRORS["PROTOCOL_INVALID"], "unsupported protocol version")
    if message_type == "hello":
        emit({"v": PROTOCOL_VERSION, "id": message_id, "type": "ready", "payload": ready_payload()})
        return
    if message_type == "health":
        emit({
            "v": PROTOCOL_VERSION,
            "id": message_id,
            "type": "result",
            "payload": {"state": "ok", "model": MODEL_ID, "backend": BACKEND, "loaded": LOADED},
        })
        return
    if message_type == "discover":
        emit({
            "v": PROTOCOL_VERSION,
            "id": message_id,
            "type": "result",
            "payload": {
                "models": [MODEL_ID],
                "model": MODEL_ID,
                "backend": BACKEND,
                "voices": [dict(voice) for voice in VOICES],
                "languages": list(LANGUAGES),
                "limits": {
                    "maxChars": MAX_TEXT_CHARS,
                    "maxAudioSeconds": MAX_AUDIO_SECONDS,
                    "timeoutMs": REQUEST_TIMEOUT_MS,
                },
            },
        })
        return
    if message_type == "synthesize":
        synthesize_once(message)
        return
    if message_type == "cancel":
        payload = message.get("payload") if isinstance(message.get("payload"), dict) else {}
        request_id = payload.get("requestId")
        with CANCEL_LOCK:
            event = CANCEL_EVENTS.get(request_id)
        if event is not None:
            event.set()
        emit({
            "v": PROTOCOL_VERSION,
            "id": message_id,
            "type": "event",
            "payload": {"requestId": request_id, "state": "cancelled"},
        })
        return
    if message_type == "shutdown":
        emit({"v": PROTOCOL_VERSION, "id": message_id, "type": "event", "payload": {"state": "closing", "closing": True}})
        threading.Timer(0.05, lambda: os._exit(0)).start()
        return
    fail(message_id, ERRORS["PROTOCOL_INVALID"], "unsupported message type")


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
        sys.stderr.reconfigure(encoding="utf-8", newline="\n")
    except (AttributeError, ValueError):
        pass
    index = 0
    while index < len(argv):
        item = argv[index]
        if item.startswith("--") and "=" in item:
            key, value = item[2:].split("=", 1)
            ARGS[key] = value
        elif item.startswith("--") and index + 1 < len(argv):
            ARGS[item[2:]] = argv[index + 1]
            index += 1
        index += 1
    ARGS["tmp-dir"] = os.environ.get("WV_QWEN_TMP")
    load_configuration()
    while True:
        line = sys.stdin.buffer.readline(MAX_LINE_BYTES + 2)
        if not line:
            break
        if len(line) > MAX_LINE_BYTES + 1:
            continue
        text = line.decode("utf-8", "replace").strip()
        if not text:
            continue
        try:
            message = json.loads(text)
        except ValueError:
            continue
        try:
            handle_message(message)
        except Exception as error:  # noqa: BLE001 — a bad line must never kill the worker silently
            fail("worker", ERRORS["PROTOCOL_INVALID"], "internal worker error (" + type(error).__name__ + ")")


if __name__ == "__main__":
    main(sys.argv[1:])
