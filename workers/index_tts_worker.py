#!/usr/bin/env python3
# Whale Voice — IndexTTS-2.5 official worker (Plan10 10-B, offline candidate).
#
# A narrow, versioned NDJSON worker around the fixed upstream `indextts` 2.0.0 package
# (commit d9e41aac89fd00b3d71497fddb287b7f24613712) and the IndexTTS-2.5 interface. It is deliberately conservative:
#   * importing this file loads no model and no heavy dependency; only a synthesize request
#     imports `indextts.infer_v2_5` and constructs `IndexTTS2`;
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
import atexit
import hashlib
import importlib
import importlib.metadata
import importlib.util
import json
import os
import re
import shutil
import socket
import stat
import sys
import tempfile
import threading
import urllib.request

PROTOCOL_VERSION = 1
MAX_LINE_BYTES = 2 * 1024 * 1024
MAX_CONFIG_BYTES = 1024 * 1024
MAX_INDEX_BYTES = 256 * 1024
MAX_REFERENCE_BYTES = 20 * 1024 * 1024
MAX_BINDING_TOTAL_BYTES = 64 * 1024 * 1024
MAX_TREE_ENTRIES = 10000
MAX_SNAPSHOT_TOTAL_BYTES = 8 * 1024 * 1024 * 1024
MAX_SNAPSHOT_ENTRIES = 10000
MAX_TEXT_CHARS = 200
MAX_AUDIO_SECONDS = 60
MAX_OUTPUT_BYTES = 4 * 1024 * 1024
REQUEST_TIMEOUT_MS = 180000

WORKER_VERSION = "0.1.0"
PROVIDER = "index-tts-local"
PACKAGE_VERSION = "2.0.0"

MODEL_IDENTITY = "IndexTTS-2.5"
MODEL_VERSION = "2.5"
MODEL_SIZE = "0.8B"
BACKEND_NAME = "clone-emotion"
LANGUAGES_CONST = ["zh-CN", "en-US", "ja-JP", "es-ES", "ar-SA"]
LANGUAGES = []
LANGUAGE_OUT = {"zh-CN": "ZH", "en-US": "EN", "ja-JP": "JA", "es-ES": "ES", "ar-SA": "AR"}
EMOTION_MODES = ["neutral", "happy", "angry", "sad", "afraid", "disgusted", "melancholic", "surprised", "calm"]
EMOTION_VECTORS = {
    "neutral": [0, 0, 0, 0, 0, 0, 0, 0],
    "happy": [1, 0, 0, 0, 0, 0, 0, 0],
    "angry": [0, 1, 0, 0, 0, 0, 0, 0],
    "sad": [0, 0, 1, 0, 0, 0, 0, 0],
    "afraid": [0, 0, 0, 1, 0, 0, 0, 0],
    "disgusted": [0, 0, 0, 0, 1, 0, 0, 0],
    "melancholic": [0, 0, 0, 0, 0, 1, 0, 0],
    "surprised": [0, 0, 0, 0, 0, 0, 1, 0],
    "calm": [0, 0, 0, 0, 0, 0, 0, 1],
}

ERRORS = {
    "INVALID_INPUT": "INDEX_TTS_INVALID_INPUT",
    "WORKER_NOT_CONFIGURED": "INDEX_TTS_WORKER_NOT_CONFIGURED",
    "RESOURCE_UNVERIFIED": "INDEX_TTS_RESOURCE_UNVERIFIED",
    "RESOURCE_CHANGED": "INDEX_TTS_RESOURCE_CHANGED",
    "NETWORK_BLOCKED": "INDEX_TTS_NETWORK_BLOCKED",
    "MODEL_MISMATCH": "INDEX_TTS_MODEL_MISMATCH",
    "MODEL_BACKEND_MISMATCH": "INDEX_TTS_MODEL_BACKEND_MISMATCH",
    "DEPENDENCY_MISSING": "INDEX_TTS_DEPENDENCY_MISSING",
    "PROVIDER_NOT_READY": "INDEX_TTS_PROVIDER_NOT_READY",
    "CLONE_BINDING_REQUIRED": "INDEX_TTS_CLONE_BINDING_REQUIRED",
    "VOICE_DESIGN_NOT_EXPOSED": "INDEX_TTS_VOICE_DESIGN_NOT_EXPOSED",
    "UNSUPPORTED_MODALITY": "INDEX_TTS_UNSUPPORTED_MODALITY",
    "OUTPUT_TOO_LARGE": "INDEX_TTS_OUTPUT_TOO_LARGE",
    "OUTPUT_INVALID": "INDEX_TTS_OUTPUT_INVALID",
    "UNKNOWN_RESULT": "INDEX_TTS_UNKNOWN_RESULT",
    "CANCELLED": "INDEX_TTS_CANCELLED",
    "TIMEOUT": "INDEX_TTS_TIMEOUT",
    "PROTOCOL_INVALID": "INDEX_TTS_PROTOCOL_INVALID",
    "BUSY": "INDEX_TTS_PROVIDER_NOT_READY",
}

WRITE_LOCK = threading.Lock()
ARGS = {}
START_ERROR = None
MODEL_DIR = None
MODEL_ID = None
BACKEND = None
VOICES = []
VOICE_NAMES = {}
QWEN_EMO_AVAILABLE = False
CONFIG_AUDIT = None
REQUIRED_MODEL_PATHS = (
    "gpt.pth",
    "s2mel.pth",
    "codec.pth",
    "wav2vec2bert_stats.pt",
    "feat1.pt",
    "feat2.pt",
    "multilingual_zh_ja_yue_char_del.tiktoken",
    "hf_cache/w2v-bert-2.0",
    "hf_cache/bigvgan",
    "hf_cache/campplus_cn_common.bin",
)

BINDING_INDEX = {}
PACKAGE_VERSION_DETECTED = None
INDEXTTS = None
MODEL = None
LOADED = False
MODEL_QWEN_EMO = False
ACTIVE_REQUEST = None
CANCEL_EVENTS = {}
CANCEL_LOCK = threading.Lock()
MODEL_AUDIT = None
MODEL_SNAPSHOT = None
SNAPSHOT_HASHES = {}
SNAPSHOT_PATHS = set()
SNAPSHOT_PARENT = None
SNAPSHOT_LOCK = threading.RLock()
SNAPSHOT_BUDGET_BYTES = MAX_SNAPSHOT_TOTAL_BYTES
NETWORK_GUARDED = False
DIRECT_DEPENDENCIES = {"indextts": False}
DEPENDENCY_FAILURES = {}


class DependencyMissing(Exception):
    """The audited upstream package is absent from the configured local runtime."""


class ResourceChanged(Exception):
    """A trusted local resource disappeared, escaped its root or changed after it was audited."""


class NetworkBlocked(Exception):
    """The worker's in-process guard refused a network access attempt."""


def install_network_guard():
    """Disable outbound network access for the whole worker process before the official import.

    Upstream loaders may otherwise fall back to a download when a local file is missing. This guard
    is process-wide and covers nested loaders (AutoConfig/AutoModel/AutoProcessor) as well as the
    reference-audio helper; the worker never needs a network.
    """
    global NETWORK_GUARDED
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    if NETWORK_GUARDED:
        return

    def blocked(*_args, **_kwargs):
        raise NetworkBlocked("network access is disabled for the IndexTTS worker")

    try:
        socket.socket.connect = lambda self, *args, **kwargs: blocked()
        socket.create_connection = blocked
        urllib.request.urlopen = blocked
    except (AttributeError, TypeError):
        # A platform that forbids monkey-patching still has the offline environment variables; the
        # guard flag stays false so health can report the weaker state honestly.
        return
    NETWORK_GUARDED = True


def module_available(name):
    importlib.invalidate_caches()
    try:
        spec = importlib.util.find_spec(name)
    except (ImportError, ValueError, AttributeError):
        return False
    if spec is None:
        return False
    runtime_dir = ARGS.get("runtime-dir")
    if runtime_dir:
        # A configured local runtime must be the source; a system package must not mask a missing
        # local dependency.
        origin = spec.origin
        if not isinstance(origin, str):
            return False
        return inside(runtime_dir, origin) is not None
    return True


def refresh_dependency_state():
    for key, name in (("indextts", "indextts"),):
        spec_ok = module_available(name)
        failure = DEPENDENCY_FAILURES.get(key)
        if not spec_ok:
            DIRECT_DEPENDENCIES[key] = False
            if not failure or failure.get("kind") != "import-error":
                DEPENDENCY_FAILURES[key] = {"kind": "missing"}
            continue
        if failure and failure.get("kind") == "import-error":
            # A resolvable spec does not prove that a previously failed import recovered.
            DIRECT_DEPENDENCIES[key] = False
            continue
        DIRECT_DEPENDENCIES[key] = True
        DEPENDENCY_FAILURES.pop(key, None)
    return all(DIRECT_DEPENDENCIES.values())


def audit_model_tree():
    """Reject any actual sub-resource path that resolves outside the allowed root.

    The fixed upstream loader reads files below the model directory (config, processor/tokenizer
    assets, speech tokenizer). A junction/symlink below the model root must not silently redirect any
    of those reads outside the audited root.
    """
    if MODEL_AUDIT is None:
        raise ResourceChanged("the model directory was not audited")
    allowed_root = ARGS.get("allowed-root")
    stack = [MODEL_AUDIT["real"]]
    visited = set()
    entries = 0
    while stack:
        current = stack.pop()
        real_current = os.path.realpath(current)
        if real_current in visited:
            continue
        visited.add(real_current)
        if inside(allowed_root, real_current) is None:
            raise ResourceChanged("a model sub-resource resolved outside the allowed root")
        try:
            with os.scandir(real_current) as iterator:
                for entry in iterator:
                    entries += 1
                    if entries > MAX_TREE_ENTRIES:
                        raise ResourceChanged("the model tree exceeds its entry budget")
                    real = os.path.realpath(entry.path)
                    if inside(allowed_root, real) is None:
                        raise ResourceChanged("a model sub-resource resolved outside the allowed root")
                    if os.path.isdir(real):
                        stack.append(real)
        except OSError as error:
            raise ResourceChanged("the model tree is unreadable") from error


def choose_snapshot_parent():
    global SNAPSHOT_PARENT
    tmp_dir = ARGS.get("tmp-dir")
    if not isinstance(tmp_dir, str) or not os.path.isdir(tmp_dir):
        raise ResourceChanged("the worker temporary directory is unavailable")
    with SNAPSHOT_LOCK:
        try:
            parent = tempfile.mkdtemp(prefix="wv-indextts-snap-", dir=tmp_dir)
        except OSError as error:
            raise ResourceChanged("the snapshot directory could not be created") from error
        SNAPSHOT_PATHS.add(parent)
        # Register the active snapshot before any child mkdir/copy so a concurrent health cleanup
        # cannot delete a directory that is still being built.
        SNAPSHOT_PARENT = parent
        return parent


def snapshot_cleanup_pending():
    with SNAPSHOT_LOCK:
        active = SNAPSHOT_PARENT
        return len([path for path in SNAPSHOT_PATHS if path != active])


def cleanup_snapshot_paths(force=False):
    """Retry deleting only the snapshot directories this worker created."""
    with SNAPSHOT_LOCK:
        active = None if force else SNAPSHOT_PARENT
        deny_marker = os.path.join(ARGS.get("tmp-dir") or "", "snapshot-cleanup-deny")
        deny = bool(ARGS.get("tmp-dir")) and os.path.exists(deny_marker)
        failed = set()
        for path in list(SNAPSHOT_PATHS):
            if active and path == active:
                failed.add(path)
                continue
            if deny:
                failed.add(path)
                continue
            try:
                if os.path.exists(path):
                    shutil.rmtree(path)
            except OSError:
                failed.add(path)
        SNAPSHOT_PATHS.clear()
        SNAPSHOT_PATHS.update(failed)
        return len([path for path in SNAPSHOT_PATHS if path != active]) == 0


def copy_model_file(source, target, remaining):
    digest = hashlib.sha256()
    total = 0
    with open(source, "rb") as src, open(target, "wb") as dst:
        while True:
            chunk = src.read(1024 * 1024)
            if not chunk:
                break
            if total + len(chunk) > remaining:
                raise ResourceChanged("the model snapshot exceeds its copy budget")
            total += len(chunk)
            digest.update(chunk)
            dst.write(chunk)
    return total, digest.hexdigest()


def build_model_snapshot():
    """Copy the audited model tree into a stable private snapshot.

    Every regular file is copied byte-for-byte and never hardlinked, so a later in-place rewrite of
    the source cannot change what the SDK consumes. The total copy budget is enforced while copying;
    exceeding it fails closed instead of silently sharing mutable content. The snapshot lives inside
    the supervisor-owned worker temporary directory, so the host retains cleanup responsibility even
    when the worker exits without running atexit.
    """
    global MODEL_SNAPSHOT, SNAPSHOT_HASHES, SNAPSHOT_PARENT
    allowed_root = ARGS.get("allowed-root")
    source_root = MODEL_AUDIT["real"] if MODEL_AUDIT else None
    if not source_root:
        raise ResourceChanged("the model directory was not audited")
    parent = choose_snapshot_parent()
    snapshot = os.path.join(parent, "model")
    SNAPSHOT_PARENT = parent
    try:
        os.makedirs(snapshot, exist_ok=False)
        stack = [(source_root, snapshot)]
        visited = set()
        entries = 0
        copied = 0
        hashes = {}
        while stack:
            source_dir, target_dir = stack.pop()
            real_dir = os.path.realpath(source_dir)
            if real_dir in visited:
                continue
            visited.add(real_dir)
            if inside(allowed_root, real_dir) is None:
                raise ResourceChanged("a model sub-resource resolved outside the allowed root")
            os.makedirs(target_dir, exist_ok=True)
            with os.scandir(real_dir) as iterator:
                for entry in iterator:
                    entries += 1
                    if entries > MAX_SNAPSHOT_ENTRIES:
                        raise ResourceChanged("the model tree exceeds its snapshot budget")
                    real = os.path.realpath(entry.path)
                    if inside(allowed_root, real) is None:
                        raise ResourceChanged("a model sub-resource resolved outside the allowed root")
                    target = os.path.join(target_dir, entry.name)
                    if os.path.isdir(real):
                        stack.append((real, target))
                        continue
                    if not os.path.isfile(real):
                        raise ResourceChanged("the model tree contains a non-regular entry")
                    remaining = SNAPSHOT_BUDGET_BYTES - copied
                    if remaining <= 0:
                        raise ResourceChanged("the model snapshot exceeds its copy budget")
                    size, digest = copy_model_file(real, target, remaining)
                    copied += size
                    hashes[os.path.relpath(target, snapshot)] = digest
        MODEL_SNAPSHOT = snapshot
        SNAPSHOT_HASHES = hashes
        return snapshot
    except Exception:
        MODEL_SNAPSHOT = None
        SNAPSHOT_HASHES = {}
        SNAPSHOT_PARENT = None
        cleanup_snapshot_paths(force=True)
        raise


def audit_snapshot():
    if not MODEL_SNAPSHOT:
        raise ResourceChanged("the model snapshot is missing")
    for relative, digest in SNAPSHOT_HASHES.items():
        path = os.path.join(MODEL_SNAPSHOT, relative)
        computed = hashlib.sha256()
        try:
            with open(path, "rb") as handle:
                while True:
                    chunk = handle.read(1024 * 1024)
                    if not chunk:
                        break
                    computed.update(chunk)
        except OSError as error:
            raise ResourceChanged("a snapshotted model resource is unreadable") from error
        if computed.hexdigest() != digest:
            raise ResourceChanged("a snapshotted model resource changed")


def discard_model_snapshot(force=True):
    global MODEL_SNAPSHOT, SNAPSHOT_HASHES, SNAPSHOT_PARENT
    with SNAPSHOT_LOCK:
        MODEL_SNAPSHOT = None
        SNAPSHOT_HASHES = {}
        SNAPSHOT_PARENT = None
        cleanup_snapshot_paths(force=force)


def discard_model():
    global MODEL, LOADED
    MODEL = None
    LOADED = False
    discard_model_snapshot(force=True)


atexit.register(discard_model_snapshot)


def audit_model():
    """Re-check the trusted local model directory right before it is actually used."""
    if MODEL_AUDIT is None:
        raise ResourceChanged("the model directory was not audited")
    allowed_root = ARGS.get("allowed-root")
    real = inside(allowed_root, MODEL_AUDIT["real"])
    if real is None or real != MODEL_AUDIT["real"] or not os.path.isdir(real):
        raise ResourceChanged("the model directory escaped or disappeared")
    st = os.stat(real)
    if (st.st_dev, st.st_ino) != (MODEL_AUDIT["dev"], MODEL_AUDIT["ino"]):
        raise ResourceChanged("the model directory identity changed")
    config_path = inside(allowed_root, MODEL_AUDIT["config"])
    if config_path is None or config_path != MODEL_AUDIT["config"] or not os.path.isfile(config_path):
        raise ResourceChanged("the model configuration disappeared")
    try:
        if os.path.getsize(config_path) > MAX_CONFIG_BYTES:
            raise ResourceChanged("the model configuration grew beyond its budget")
        with open(config_path, "rb") as handle:
            payload = handle.read(MAX_CONFIG_BYTES + 1)
    except OSError as error:
        raise ResourceChanged("the model configuration is unreadable") from error
    if len(payload) > MAX_CONFIG_BYTES or hashlib.sha256(payload).hexdigest() != MODEL_AUDIT["configDigest"]:
        raise ResourceChanged("the model configuration changed after it was audited")
    audit_model_tree()


def open_reference(token):
    """Re-audit a trusted clone reference and hold its inode for the duration of the SDK call."""
    stored = BINDING_INDEX.get(token)
    if not stored:
        raise ResourceChanged("the trusted clone binding is unknown")
    allowed_root = ARGS.get("allowed-root")
    real = inside(allowed_root, stored["file"])
    if real is None or real != stored["real"]:
        raise ResourceChanged("the clone reference escaped the allowed root")
    try:
        st = os.stat(real)
    except OSError as error:
        raise ResourceChanged("the clone reference disappeared") from error
    if not stat.S_ISREG(st.st_mode):
        raise ResourceChanged("the clone reference is not a regular file")
    if st.st_size > MAX_REFERENCE_BYTES:
        raise ResourceChanged("the clone reference exceeds its size budget")
    if (st.st_dev, st.st_ino, st.st_size) != (stored["dev"], stored["ino"], stored["size"]):
        raise ResourceChanged("the clone reference changed after it was audited")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0)
    try:
        fd = os.open(real, flags)
    except OSError as error:
        raise ResourceChanged("the clone reference cannot be opened") from error
    try:
        held = os.fstat(fd)
        if (held.st_dev, held.st_ino, held.st_size) != (stored["dev"], stored["ino"], stored["size"]):
            raise ResourceChanged("the clone reference changed while it was held")
        chunks = []
        total = 0
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_REFERENCE_BYTES:
                raise ResourceChanged("the clone reference exceeds its size budget")
            chunks.append(chunk)
        data = b"".join(chunks)
        if len(data) != stored["size"] or hashlib.sha256(data).hexdigest() != stored["sha256"]:
            raise ResourceChanged("the clone reference content changed after it was audited")
        return fd, real, data
    except Exception:
        os.close(fd)
        raise


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
        return importlib.metadata.version("indextts")
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
    total_bytes = 0
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
        try:
            st = os.stat(resolved)
        except OSError:
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding file is unreadable")
            return {}
        if not stat.S_ISREG(st.st_mode):
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding file is not a regular file")
            return {}
        try:
            with open(resolved, "rb") as handle:
                reference_bytes = handle.read(MAX_REFERENCE_BYTES + 1)
        except OSError:
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding file is unreadable")
            return {}
        if len(reference_bytes) > MAX_REFERENCE_BYTES or len(reference_bytes) != st.st_size:
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding file exceeds its size budget")
            return {}
        total_bytes += len(reference_bytes)
        if total_bytes > MAX_BINDING_TOTAL_BYTES:
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "binding references exceed the total budget")
            return {}
        result[token] = {
            "file": resolved,
            "real": resolved,
            "text": text,
            "dev": st.st_dev,
            "ino": st.st_ino,
            "size": st.st_size,
            "mtimeNs": st.st_mtime_ns,
            "sha256": hashlib.sha256(reference_bytes).hexdigest(),
        }
    return result


def audit_required_model_resources(model_dir, allowed_root):
    """Require every main/auxiliary/tokenizer resource to exist locally before any SDK import.

    The fixed 2.5 constructor calls `ensure_models_available()` when an auxiliary directory is
    missing; that helper downloads into the model tree. A missing local resource must fail closed
    before the constructor instead of entering that path, even though the network guard would also
    block it.
    """
    for relative in REQUIRED_MODEL_PATHS:
        candidate = inside(allowed_root, os.path.join(model_dir, relative))
        if candidate is None:
            raise ResourceChanged("a required model resource escapes the allowed root")
        if not os.path.exists(candidate):
            raise ResourceChanged("a required model resource is missing: " + relative)
    return True


def load_configuration():
    global MODEL_DIR, MODEL_ID, BACKEND, LANGUAGES, VOICES, BINDING_INDEX
    global PACKAGE_VERSION_DETECTED, MODEL_AUDIT, QWEN_EMO_AVAILABLE, CONFIG_AUDIT
    global SNAPSHOT_BUDGET_BYTES

    budget_raw = ARGS.get("snapshot-budget-bytes")
    if budget_raw is not None:
        if not isinstance(budget_raw, str) or not re.fullmatch(r"[0-9]+", budget_raw):
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "the snapshot budget must be a positive integer")
            return
        budget_value = int(budget_raw)
        if budget_value < 1 or budget_value > MAX_SNAPSHOT_TOTAL_BYTES:
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "the snapshot budget is outside its bounds")
            return
        SNAPSHOT_BUDGET_BYTES = budget_value

    model_dir = ARGS.get("model-dir")
    allowed_root = ARGS.get("allowed-root")
    model_id = ARGS.get("model-id")
    backend = ARGS.get("backend")
    if not isinstance(allowed_root, str) or not os.path.isabs(allowed_root) or not os.path.isdir(allowed_root):
        start_error(ERRORS["WORKER_NOT_CONFIGURED"], "an explicit absolute allowed root is required")
        return
    if not isinstance(model_dir, str) or not os.path.isabs(model_dir):
        start_error(ERRORS["WORKER_NOT_CONFIGURED"], "an explicit absolute model directory is required")
        return
    if model_id != MODEL_IDENTITY:
        start_error(ERRORS["MODEL_MISMATCH"], "the model identity must be IndexTTS-2.5")
        return
    if backend != BACKEND_NAME:
        start_error(ERRORS["UNKNOWN_BACKEND"] if "UNKNOWN_BACKEND" in ERRORS else ERRORS["MODEL_MISMATCH"], "the backend must be clone-emotion")
        return
    resolved = inside(allowed_root, model_dir)
    if resolved is None or not os.path.isdir(resolved):
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the model directory escapes the allowed root")
        return
    runtime_dir = ARGS.get("runtime-dir")
    if runtime_dir:
        if not isinstance(runtime_dir, str) or not os.path.isabs(runtime_dir):
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "the runtime directory must be an absolute local path")
            return
        if inside(allowed_root, runtime_dir) is None or not os.path.isdir(runtime_dir):
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "the runtime directory escapes the allowed root")
            return
    config_path = os.path.join(resolved, "config.yaml")
    config_real = inside(allowed_root, config_path)
    if config_real is None or not os.path.isfile(config_real):
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local config.yaml is missing or escapes the root")
        return
    try:
        if os.path.getsize(config_real) > MAX_CONFIG_BYTES:
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local config.yaml is oversized")
            return
        with open(config_real, "rb") as handle:
            config_bytes = handle.read(MAX_CONFIG_BYTES + 1)
    except OSError:
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local config.yaml is unreadable")
        return
    if len(config_bytes) > MAX_CONFIG_BYTES:
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local config.yaml is oversized")
        return
    try:
        config_text = config_bytes.decode("utf-8")
    except UnicodeDecodeError:
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local config.yaml is not UTF-8")
        return
    if not re.search(r"(?m)^version:\s*2\.5\s*(?:#.*)?$", config_text):
        start_error(ERRORS["MODEL_MISMATCH"], "the local config.yaml does not declare IndexTTS-2.5")
        return
    if not re.search(r"(?m)^\s*sr:\s*22050\s*(?:#.*)?$", config_text):
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local config.yaml does not declare a 22050 Hz decoder")
        return
    try:
        model_stat = os.stat(resolved)
    except OSError:
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the model directory is unreadable")
        return
    MODEL_AUDIT = {
        "real": resolved,
        "config": config_real,
        "configDigest": hashlib.sha256(config_bytes).hexdigest(),
        "dev": model_stat.st_dev,
        "ino": model_stat.st_ino,
    }
    CONFIG_AUDIT = {
        "version": MODEL_VERSION,
        "sampleRate": 22050,
        "qwenEmoPath": None,
    }
    match = re.search(r"(?m)^qwen_emo_path:\s*([^\s#]+)", config_text)
    if match:
        CONFIG_AUDIT["qwenEmoPath"] = match.group(1)
    MODEL_DIR = resolved
    MODEL_ID = model_id
    BACKEND = backend
    LANGUAGES = list(LANGUAGES_CONST)
    QWEN_EMO_AVAILABLE = isinstance(CONFIG_AUDIT["qwenEmoPath"], str) and os.path.isdir(
        os.path.join(resolved, CONFIG_AUDIT["qwenEmoPath"])
    )
    try:
        audit_model_tree()
        audit_required_model_resources(resolved, allowed_root)
    except ResourceChanged as error:
        start_error(ERRORS["RESOURCE_UNVERIFIED"], str(error))
        return
    VOICES = []
    BINDING_INDEX = load_binding_index(ARGS.get("binding-index"), allowed_root)
    if START_ERROR:
        return
    install_network_guard()
    PACKAGE_VERSION_DETECTED = detect_package_version(ARGS.get("runtime-dir"))
    refresh_dependency_state()
    if PACKAGE_VERSION_DETECTED != PACKAGE_VERSION:
        start_error(ERRORS["DEPENDENCY_MISSING"], "the audited indextts 2.0.0 package was not found locally")
        return
    if not all(DIRECT_DEPENDENCIES.values()):
        start_error(ERRORS["DEPENDENCY_MISSING"], "a directly imported runtime dependency is missing")
        return


def record_missing_dependency(key):
    existing = DEPENDENCY_FAILURES.get(key)
    if existing and existing.get("kind") == "import-error":
        # A stronger known import failure must not be downgraded by a later path-missing request.
        return
    DEPENDENCY_FAILURES[key] = {"kind": "missing"}


def health_state():
    cleanup_snapshot_paths()
    refresh_dependency_state()
    return "ok" if all(DIRECT_DEPENDENCIES.values()) else "degraded"


def ready_payload():
    return {
        "provider": PROVIDER,
        "workerVersion": WORKER_VERSION,
        "workerProtocol": PROTOCOL_VERSION,
        "indexTtsVersion": PACKAGE_VERSION_DETECTED,
        "backend": BACKEND,
        "model": MODEL_ID,
        "modelVersion": MODEL_VERSION,
        "modelSize": MODEL_SIZE,
        "languages": list(LANGUAGES),
        "voices": [],
        "limits": {
            "maxChars": MAX_TEXT_CHARS,
            "maxAudioSeconds": MAX_AUDIO_SECONDS,
            "timeoutMs": REQUEST_TIMEOUT_MS,
        },
        "loaded": LOADED,
        "networkBlocked": NETWORK_GUARDED,
        "dependencies": dict(DIRECT_DEPENDENCIES),
        "qwenEmoAvailable": QWEN_EMO_AVAILABLE,
        "snapshotCleanupPending": snapshot_cleanup_pending(),
        "state": "ok",
    }


def ensure_runtime():
    global INDEXTTS
    install_network_guard()
    if INDEXTTS is not None:
        return INDEXTTS
    runtime_dir = ARGS.get("runtime-dir")
    if isinstance(runtime_dir, str) and runtime_dir:
        runtime_real = inside(ARGS.get("allowed-root"), runtime_dir) if ARGS.get("allowed-root") else None
        if runtime_real is None:
            raise ResourceChanged("runtime directory escapes the allowed root")
    if not module_available("indextts"):
        DIRECT_DEPENDENCIES["indextts"] = False
        record_missing_dependency("indextts")
        raise DependencyMissing("indextts dependency is not importable")
    try:
        import indextts  # noqa: F401  (lazy: only a real synthesis imports the heavy package)
        from indextts.infer_v2_5 import IndexTTS2  # noqa: F401
    except ImportError as error:
        DIRECT_DEPENDENCIES["indextts"] = False
        DEPENDENCY_FAILURES["indextts"] = {"kind": "import-error", "error": type(error).__name__}
        raise DependencyMissing("indextts dependency is not importable") from error
    DIRECT_DEPENDENCIES["indextts"] = True
    DEPENDENCY_FAILURES.clear()
    INDEXTTS = IndexTTS2
    return INDEXTTS


def ensure_model(use_qwen_emo=False):
    global MODEL, LOADED, MODEL_QWEN_EMO
    if MODEL is not None and MODEL_QWEN_EMO == use_qwen_emo:
        return MODEL
    if MODEL is not None:
        discard_model()
    audit_model()
    IndexTTS2 = ensure_runtime()
    snapshot = build_model_snapshot()
    candidate = None
    try:
        candidate = IndexTTS2(
            cfg_path=os.path.join(snapshot, "config.yaml"),
            model_dir=snapshot,
            use_bf16=False,
            use_cuda_kernel=False,
            use_qwen_emo=bool(use_qwen_emo),
        )
        audit_model()
        audit_snapshot()
    except Exception:
        MODEL = None
        LOADED = False
        MODEL_QWEN_EMO = False
        discard_model_snapshot()
        raise
    MODEL = candidate
    LOADED = True
    MODEL_QWEN_EMO = bool(use_qwen_emo)
    return MODEL


def write_reference_file(token, request_id, suffix=".wav"):
    fd, _real, data = open_reference(token)
    try:
        directory = ARGS.get("tmp-dir") or os.environ.get("WV_INDEX_TTS_TMP")
        if not isinstance(directory, str) or not os.path.isdir(directory):
            raise ResourceChanged("the worker temporary directory is unavailable")
        path = os.path.join(directory, "ref-" + request_id + "-" + str(threading.get_ident()) + suffix)
        with open(path, "wb") as handle:
            handle.write(data)
        return path
    finally:
        try:
            os.close(fd)
        except OSError:
            pass


def read_wav(path, max_bytes):
    import wave
    try:
        if os.path.getsize(path) > max_bytes:
            raise ResourceChanged("the produced WAV exceeds the byte budget")
        with wave.open(path, "rb") as handle:
            channels = handle.getnchannels()
            sample_rate = handle.getframerate()
            sample_width = handle.getsampwidth()
            frames = handle.getnframes()
            raw = handle.readframes(frames)
    except (OSError, wave.Error) as error:
        raise ResourceChanged("the produced WAV is unreadable") from error
    if channels != 1 or sample_rate != 22050 or sample_width != 2:
        raise ResourceChanged("the produced WAV is not 22050 Hz mono PCM16")
    duration_ms = int(round(frames * 1000 / sample_rate)) if sample_rate else 0
    if duration_ms > MAX_AUDIO_SECONDS * 1000:
        raise ResourceChanged("the produced audio exceeds the duration budget")
    with open(path, "rb") as handle:
        data = handle.read()
    if len(data) > max_bytes:
        raise ResourceChanged("the produced WAV exceeds the byte budget")
    return data, sample_rate, channels, duration_ms


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
    if len(text) > MAX_TEXT_CHARS:
        return fail(message["id"], ERRORS["INVALID_INPUT"], "text exceeds the batch limit")
    if model != MODEL_ID or backend != BACKEND:
        return fail(message["id"], ERRORS["MODEL_BACKEND_MISMATCH"], "the request does not match the loaded worker identity")
    if modality != "clone":
        return fail(message["id"], ERRORS["UNSUPPORTED_MODALITY"], "IndexTTS exposes clone modality only")
    if not isinstance(voice_id, str) or not re.match(r"^[a-z][a-z0-9-]{1,63}$", voice_id):
        return fail(message["id"], ERRORS["INVALID_INPUT"], "a registered voice id is required")
    if language not in LANGUAGES_CONST:
        return fail(message["id"], ERRORS["INVALID_INPUT"], "the language is not declared by the local model")
    if emotion not in EMOTION_MODES:
        return fail(message["id"], ERRORS["INVALID_INPUT"], "unsupported emotion mode")
    if not isinstance(binding_ref, str) or binding_ref not in BINDING_INDEX:
        return fail(message["id"], ERRORS["CLONE_BINDING_REQUIRED"], "the trusted clone binding is unknown")
    vector = payload.get("emotionVector")
    if vector is not None:
        if not isinstance(vector, list) or len(vector) != 8 or any(
            not isinstance(item, (int, float)) or isinstance(item, bool) or not (0 <= item <= 1.2) for item in vector
        ):
            return fail(message["id"], ERRORS["INVALID_INPUT"], "emotion vector must be eight bounded numbers")
    alpha = payload.get("emotionAlpha", 1.0)
    if not isinstance(alpha, (int, float)) or isinstance(alpha, bool) or not (0 <= alpha <= 1):
        return fail(message["id"], ERRORS["INVALID_INPUT"], "emotion alpha must be within 0..1")
    use_text = payload.get("useEmotionText") is True
    emotion_ref = payload.get("emotionRef")
    if emotion_ref is not None and (not isinstance(emotion_ref, str) or emotion_ref not in BINDING_INDEX):
        return fail(message["id"], ERRORS["CLONE_BINDING_REQUIRED"], "the emotion reference binding is unknown")
    if emotion_ref is not None and (vector is not None or use_text):
        return fail(message["id"], ERRORS["INVALID_INPUT"], "emotion reference cannot be mixed with vector/text emotion")
    if use_text:
        if not QWEN_EMO_AVAILABLE:
            return fail(message["id"], ERRORS["DEPENDENCY_MISSING"], "text emotion requires the local QwenEmotion resource")
        if not isinstance(payload.get("emotionText"), str) or not payload["emotionText"].strip():
            return fail(message["id"], ERRORS["INVALID_INPUT"], "text emotion requires emotionText")
        if len(payload["emotionText"]) > 500:
            return fail(message["id"], ERRORS["INVALID_INPUT"], "emotionText exceeds the batch limit")
    with CANCEL_LOCK:
        if ACTIVE_REQUEST is not None:
            return fail(message["id"], ERRORS["BUSY"], "one synthesis at a time")
        ACTIVE_REQUEST = request_id
        CANCEL_EVENTS[request_id] = threading.Event()
    thread = threading.Thread(target=run_synthesis, args=(message, payload), daemon=True)
    thread.start()


def emit_cancelled(message, payload, request_id):
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


def run_synthesis(message, payload):
    global ACTIVE_REQUEST, MODEL
    request_id = payload["requestId"]
    event = CANCEL_EVENTS.get(request_id)
    reference_path = None
    emotion_path = None
    output_path = None
    try:
        if event is not None and event.wait(0.05):
            emit_cancelled(message, payload, request_id)
            return
        try:
            audit_model()
            reference_path = write_reference_file(payload["bindingRef"], request_id)
            if payload.get("emotionRef"):
                emotion_path = write_reference_file(payload["emotionRef"], request_id)
        except ResourceChanged as error:
            fail(message["id"], ERRORS["RESOURCE_CHANGED"], str(error), request_id)
            return
        if event is not None and event.is_set():
            emit_cancelled(message, payload, request_id)
            return
        use_text = payload.get("useEmotionText") is True
        created_model = MODEL is None or MODEL_QWEN_EMO != use_text
        try:
            model = ensure_model(use_qwen_emo=use_text)
        except DependencyMissing:
            fail(message["id"], ERRORS["DEPENDENCY_MISSING"], "the local indextts package is not importable", request_id)
            return
        except NetworkBlocked:
            fail(message["id"], ERRORS["NETWORK_BLOCKED"], "a local loader attempted a network access", request_id)
            return
        except ResourceChanged as error:
            fail(message["id"], ERRORS["RESOURCE_CHANGED"], str(error), request_id)
            return
        except Exception:
            fail(message["id"], ERRORS["RESOURCE_UNVERIFIED"], "the local model could not be loaded", request_id)
            return
        if event is not None and event.is_set():
            if created_model:
                discard_model()
            emit_cancelled(message, payload, request_id)
            return
        vector = payload.get("emotionVector")
        if vector is None and payload.get("emotion") not in (None, "neutral"):
            vector = list(EMOTION_VECTORS[payload["emotion"]])
        directory = ARGS.get("tmp-dir") or os.environ.get("WV_INDEX_TTS_TMP")
        output_path = os.path.join(directory, "out-" + request_id + ".wav")
        kwargs = {
            "spk_audio_prompt": reference_path,
            "text": payload["text"],
            "lang": LANGUAGE_OUT[payload["language"]],
            "output_path": output_path,
            "verbose": False,
            "text_normalization": True,
        }
        if vector is not None:
            kwargs["emo_vector"] = list(vector)
            kwargs["emo_alpha"] = float(payload.get("emotionAlpha", 1.0))
        if emotion_path is not None:
            kwargs["emo_audio_prompt"] = emotion_path
        if use_text:
            kwargs["use_emo_text"] = True
            kwargs["emo_text"] = payload["emotionText"]
        try:
            model.infer(**kwargs)
        except NetworkBlocked:
            fail(message["id"], ERRORS["NETWORK_BLOCKED"], "a local loader attempted a network access", request_id)
            return
        except Exception as error:
            fail(message["id"], ERRORS["RESOURCE_UNVERIFIED"], "the local synthesis failed (" + type(error).__name__ + ")", request_id)
            return
        if event is not None and event.is_set():
            emit_cancelled(message, payload, request_id)
            return
        try:
            data, sample_rate, channels, duration_ms = read_wav(output_path, MAX_OUTPUT_BYTES)
        except ResourceChanged as error:
            fail(message["id"], ERRORS["OUTPUT_INVALID"], str(error), request_id)
            return
        emit({
            "v": PROTOCOL_VERSION,
            "id": message["id"],
            "type": "result",
            "payload": {
                "state": "ok",
                "mime": "audio/wav",
                "sampleRate": sample_rate,
                "channels": channels,
                "durationMs": duration_ms,
                "bytesBase64": base64.b64encode(data).decode("ascii"),
                "model": MODEL_ID,
                "backend": BACKEND,
                "voiceId": payload.get("voiceId"),
                "requestId": request_id,
            },
        })
    except NetworkBlocked:
        fail(message["id"], ERRORS["NETWORK_BLOCKED"], "a local loader attempted a network access", request_id)
    except ResourceChanged as error:
        fail(message["id"], ERRORS["RESOURCE_CHANGED"], str(error), request_id)
    except Exception as error:  # noqa: BLE001 — never leave the caller without a terminal answer
        fail(message["id"], ERRORS["OUTPUT_INVALID"], "the worker could not complete the synthesis (" + type(error).__name__ + ")", request_id)
    finally:
        for path in (reference_path, emotion_path, output_path):
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass
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
            "payload": {
                "state": health_state(),
                "model": MODEL_ID,
                "modelVersion": MODEL_VERSION,
                "backend": BACKEND,
                "loaded": LOADED,
                "networkBlocked": NETWORK_GUARDED,
                "dependencies": dict(DIRECT_DEPENDENCIES),
                "qwenEmoAvailable": QWEN_EMO_AVAILABLE,
                "snapshotCleanupPending": snapshot_cleanup_pending(),
            },
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
                "modelVersion": MODEL_VERSION,
                "backend": BACKEND,
                "voices": [dict(voice) for voice in VOICES],
                "languages": list(LANGUAGES),
                "qwenEmoAvailable": QWEN_EMO_AVAILABLE,
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
            known = event is not None
        if event is not None:
            event.set()
        emit({
            "v": PROTOCOL_VERSION,
            "id": message_id,
            "type": "event",
            "payload": {"requestId": request_id, "state": "cancelled" if known else "UNKNOWN"},
        })
        return
    if message_type == "shutdown":
        emit({"v": PROTOCOL_VERSION, "id": message_id, "type": "event", "payload": {"state": "closing", "closing": True}})
        # os._exit skips atexit, so the worker removes its own snapshots explicitly; the supervisor
        # remains responsible for the whole worker temporary directory if this cleanup fails.
        cleanup_snapshot_paths(force=True)
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
    ARGS["tmp-dir"] = os.environ.get("WV_INDEX_TTS_TMP")
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
    cleanup_snapshot_paths(force=True)


if __name__ == "__main__":
    main(sys.argv[1:])
