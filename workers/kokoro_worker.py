#!/usr/bin/env python3
# Whale Voice 鈥?Kokoro-82M official worker (Plan10 10-B, offline candidate).
#
# A narrow, versioned NDJSON worker around the fixed upstream `kokoro` 0.9.4 package
# (commit dfb907a02bba8152ca444717ca5d78747ccb4bec) and the Kokoro-82M model. It is deliberately conservative:
#   * importing this file loads no model and no heavy dependency; only a synthesize request
#     imports `kokoro` and constructs `KModel`/`KPipeline`;
#   * the model must be an existing local directory inside an explicit allowed root, the identity
#     must be an audited released model and must match the local `config.json`, and the load always
#     uses only local config/weights/voices/G2P, so no implicit download or network fallback can happen;
#   * voice tensors are trusted local .pt files resolved against an explicit index; no voice name
#     reaches the HF download helper, and URLs/base64/paths never cross the protocol;
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
MAX_TEXT_CHARS = 300
MAX_AUDIO_SECONDS = 60
MAX_OUTPUT_BYTES = 4 * 1024 * 1024
REQUEST_TIMEOUT_MS = 120000

WORKER_VERSION = "0.1.0"
PROVIDER = "kokoro-local"
PACKAGE_VERSION = "0.9.4"

MODEL_IDENTITY = "Kokoro-82M-v1.0"
MODEL_VERSION = "1.0"
MODEL_SIZE = "82M"
BACKEND_NAME = "preset"
LANGUAGES_CONST = ["en-US", "en-GB", "es-ES", "fr-FR", "hi-IN", "it-IT", "pt-BR", "ja-JP", "zh-CN"]
LANGUAGES = []
LANGUAGE_OUT = {"en-US": "a", "en-GB": "b", "es-ES": "e", "fr-FR": "f", "hi-IN": "h", "it-IT": "i", "pt-BR": "p", "ja-JP": "j", "zh-CN": "z"}
ERRORS = {
    "INVALID_INPUT": "KOKORO_INVALID_INPUT",
    "WORKER_NOT_CONFIGURED": "KOKORO_WORKER_NOT_CONFIGURED",
    "RESOURCE_UNVERIFIED": "KOKORO_RESOURCE_UNVERIFIED",
    "RESOURCE_CHANGED": "KOKORO_RESOURCE_CHANGED",
    "NETWORK_BLOCKED": "KOKORO_NETWORK_BLOCKED",
    "MODEL_MISMATCH": "KOKORO_MODEL_MISMATCH",
    "UNKNOWN_BACKEND": "KOKORO_UNKNOWN_BACKEND",
    "DISCOVERY_INCOMPLETE": "KOKORO_DISCOVERY_INCOMPLETE",
    "G2P_UNAVAILABLE": "KOKORO_G2P_UNAVAILABLE",
    "MODEL_BACKEND_MISMATCH": "KOKORO_MODEL_BACKEND_MISMATCH",
    "DEPENDENCY_MISSING": "KOKORO_DEPENDENCY_MISSING",
    "PROVIDER_NOT_READY": "KOKORO_PROVIDER_NOT_READY",
    "CLONE_BINDING_REQUIRED": "KOKORO_CLONE_BINDING_REQUIRED",
    "VOICE_DESIGN_NOT_EXPOSED": "KOKORO_VOICE_DESIGN_NOT_EXPOSED",
    "UNSUPPORTED_MODALITY": "KOKORO_UNSUPPORTED_MODALITY",
    "OUTPUT_TOO_LARGE": "KOKORO_OUTPUT_TOO_LARGE",
    "OUTPUT_INVALID": "KOKORO_OUTPUT_INVALID",
    "UNKNOWN_RESULT": "KOKORO_UNKNOWN_RESULT",
    "CANCELLED": "KOKORO_CANCELLED",
    "TIMEOUT": "KOKORO_TIMEOUT",
    "PROTOCOL_INVALID": "KOKORO_PROTOCOL_INVALID",
    "BUSY": "KOKORO_PROVIDER_NOT_READY",
}

WRITE_LOCK = threading.Lock()
ARGS = {}
START_ERROR = None
MODEL_DIR = None
MODEL_ID = None
BACKEND = None
VOICES = []
VOICE_NAMES = {}
CONFIG_AUDIT = None
REQUIRED_MODEL_PATHS = (
    "config.json",
    "kokoro-v1_0.pth",
)

BINDING_INDEX = {}
PACKAGE_VERSION_DETECTED = None
KOKORO = None
MODEL = None
LOADED = False
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
DIRECT_DEPENDENCIES = {"kokoro": False}
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
        raise NetworkBlocked("network access is disabled for the Kokoro worker")

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
    for key, name in (("kokoro", "kokoro"),):
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
            parent = tempfile.mkdtemp(prefix="wv-kokoro-snap-", dir=tmp_dir)
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
        return importlib.metadata.version("kokoro")
    except importlib.metadata.PackageNotFoundError:
        return None
    except Exception:
        return None


def load_voice_index(index_path, allowed_root):
    """Load trusted local Kokoro voice tensors. A voice name never reaches HF download."""
    if not index_path:
        return {}
    real = inside(allowed_root, index_path)
    if real is None or not os.path.isfile(real):
        raise ResourceChanged("the voice index escapes or is missing")
    data = read_json_file(real, MAX_INDEX_BYTES)
    if not isinstance(data, dict) or len(data) > 256:
        raise ResourceChanged("the voice index is not a bounded object")
    result = {}
    total = 0
    for voice_id, entry in data.items():
        if not isinstance(voice_id, str) or not re.match(r"^[a-z][a-z0-9_-]{1,63}$", voice_id):
            raise ResourceChanged("a voice id is invalid")
        if not isinstance(entry, dict):
            raise ResourceChanged("a voice entry is not an object")
        candidate = entry.get("file")
        language = entry.get("language")
        if not isinstance(candidate, str) or os.path.isabs(candidate) or not candidate.endswith(".pt"):
            raise ResourceChanged("a voice file must be a relative .pt path")
        if language not in LANGUAGE_OUT:
            raise ResourceChanged("a voice language is not supported")
        resolved = inside(allowed_root, os.path.join(allowed_root, candidate))
        if resolved is None or not os.path.isfile(resolved):
            raise ResourceChanged("a voice file escapes or is missing")
        st = os.stat(resolved)
        if not stat.S_ISREG(st.st_mode):
            raise ResourceChanged("a voice file is not regular")
        if st.st_size > 50 * 1024 * 1024:
            raise ResourceChanged("a voice file exceeds its size budget")
        total += st.st_size
        if total > 200 * 1024 * 1024:
            raise ResourceChanged("voice files exceed the total budget")
        with open(resolved, "rb") as handle:
            digest = hashlib.sha256(handle.read()).hexdigest()
        name = entry.get("name") if isinstance(entry.get("name"), str) else voice_id
        result[voice_id] = {
            "file": resolved,
            "real": resolved,
            "language": language,
            "name": name[:128],
            "dev": st.st_dev,
            "ino": st.st_ino,
            "size": st.st_size,
            "sha256": digest,
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
    global PACKAGE_VERSION_DETECTED, MODEL_AUDIT, CONFIG_AUDIT
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
        start_error(ERRORS["MODEL_MISMATCH"], "the model identity must be Kokoro-82M-v1.0")
        return
    if backend != BACKEND_NAME:
        start_error(ERRORS["UNKNOWN_BACKEND"], "the backend must be preset")
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
    config_path = os.path.join(resolved, "config.json")
    config_real = inside(allowed_root, config_path)
    if config_real is None or not os.path.isfile(config_real):
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local config.json is missing or escapes the root")
        return
    try:
        if os.path.getsize(config_real) > MAX_CONFIG_BYTES:
            start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local config.json is oversized")
            return
        with open(config_real, "rb") as handle:
            config_bytes = handle.read(MAX_CONFIG_BYTES + 1)
    except OSError:
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local config.json is unreadable")
        return
    try:
        config = json.loads(config_bytes.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        start_error(ERRORS["RESOURCE_UNVERIFIED"], "the local config.json is not valid JSON")
        return
    if not isinstance(config, dict) or not isinstance(config.get("vocab"), dict):
        start_error(ERRORS["MODEL_MISMATCH"], "the local config.json does not declare a Kokoro vocabulary")
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
    CONFIG_AUDIT = {"modelVersion": MODEL_VERSION, "sampleRate": 24000}
    MODEL_DIR = resolved
    MODEL_ID = model_id
    BACKEND = backend
    try:
        audit_model_tree()
        audit_required_model_resources(resolved, allowed_root)
    except ResourceChanged as error:
        start_error(ERRORS["RESOURCE_UNVERIFIED"], str(error))
        return
    try:
        BINDING_INDEX = load_voice_index(ARGS.get("voice-index"), allowed_root)
    except ResourceChanged as error:
        start_error(ERRORS["RESOURCE_UNVERIFIED"], str(error))
        return
    VOICES = [
        {"id": voice_id, "name": entry["name"], "language": entry["language"]}
        for voice_id, entry in sorted(BINDING_INDEX.items())
    ]
    LANGUAGES = sorted({entry["language"] for entry in BINDING_INDEX.values()})
    if not LANGUAGES:
        start_error(ERRORS["DISCOVERY_INCOMPLETE"], "the voice index declares no supported language")
        return
    install_network_guard()
    PACKAGE_VERSION_DETECTED = detect_package_version(ARGS.get("runtime-dir"))
    refresh_dependency_state()
    if PACKAGE_VERSION_DETECTED != PACKAGE_VERSION:
        start_error(ERRORS["DEPENDENCY_MISSING"], "the audited kokoro 0.9.4 package was not found locally")
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
        "kokoroVersion": PACKAGE_VERSION_DETECTED,
        "backend": BACKEND,
        "model": MODEL_ID,
        "modelVersion": MODEL_VERSION,
        "modelSize": MODEL_SIZE,
        "languages": list(LANGUAGES),
        "voices": [dict(voice) for voice in VOICES],
        "limits": {
            "maxChars": MAX_TEXT_CHARS,
            "maxAudioSeconds": MAX_AUDIO_SECONDS,
            "timeoutMs": REQUEST_TIMEOUT_MS,
        },
        "loaded": LOADED,
        "networkBlocked": NETWORK_GUARDED,
        "dependencies": dict(DIRECT_DEPENDENCIES),
        "snapshotCleanupPending": snapshot_cleanup_pending(),
        "state": "ok",
    }


def ensure_runtime():
    global KOKORO
    install_network_guard()
    if KOKORO is not None:
        return KOKORO
    runtime_dir = ARGS.get("runtime-dir")
    if isinstance(runtime_dir, str) and runtime_dir:
        if inside(ARGS.get("allowed-root"), runtime_dir) is None:
            raise ResourceChanged("runtime directory escapes the allowed root")
    if not module_available("kokoro"):
        DIRECT_DEPENDENCIES["kokoro"] = False
        record_missing_dependency("kokoro")
        raise DependencyMissing("kokoro dependency is not importable")
    try:
        from kokoro import KModel, KPipeline  # noqa: F401  (lazy: only synthesis imports the package)
    except ImportError as error:
        DIRECT_DEPENDENCIES["kokoro"] = False
        DEPENDENCY_FAILURES["kokoro"] = {"kind": "import-error", "error": type(error).__name__}
        raise DependencyMissing("kokoro dependency is not importable") from error
    DIRECT_DEPENDENCIES["kokoro"] = True
    DEPENDENCY_FAILURES.clear()
    KOKORO = (KModel, KPipeline)
    return KOKORO


def ensure_model():
    global MODEL, LOADED
    if MODEL is not None:
        return MODEL
    audit_model()
    KModel, _KPipeline = ensure_runtime()
    snapshot = build_model_snapshot()
    candidate = None
    try:
        candidate = KModel(
            config=os.path.join(snapshot, "config.json"),
            model=os.path.join(snapshot, "kokoro-v1_0.pth"),
            disable_complex=True,
        )
        candidate = candidate.to("cpu").eval()
        audit_model()
        audit_snapshot()
    except Exception:
        MODEL = None
        LOADED = False
        discard_model_snapshot()
        raise
    MODEL = candidate
    LOADED = True
    return MODEL


def write_voice_file(voice_id, request_id):
    stored = BINDING_INDEX.get(voice_id)
    if not stored:
        raise ResourceChanged("the requested voice is not in the trusted local index")
    real = inside(ARGS.get("allowed-root"), stored["file"])
    if real is None or real != stored["real"] or not os.path.isfile(real):
        raise ResourceChanged("the voice file escaped or disappeared")
    st = os.stat(real)
    if (st.st_dev, st.st_ino, st.st_size) != (stored["dev"], stored["ino"], stored["size"]):
        raise ResourceChanged("the voice file changed after it was audited")
    with open(real, "rb") as handle:
        data = handle.read()
    if hashlib.sha256(data).hexdigest() != stored["sha256"]:
        raise ResourceChanged("the voice tensor content changed after it was audited")
    directory = ARGS.get("tmp-dir") or os.environ.get("WV_KOKORO_TMP")
    if not isinstance(directory, str) or not os.path.isdir(directory):
        raise ResourceChanged("the worker temporary directory is unavailable")
    path = os.path.join(directory, "voice-" + request_id + "-" + str(threading.get_ident()) + ".pt")
    with open(path, "wb") as handle:
        handle.write(data)
    return path


def sample_list(audio):
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu()
    if hasattr(audio, "tolist"):
        audio = audio.tolist()
    if isinstance(audio, (int, float)):
        return [float(audio)]
    if not isinstance(audio, (list, tuple)):
        raise ResourceChanged("the model returned an unsupported audio object")
    if audio and isinstance(audio[0], (list, tuple)):
        audio = audio[0]
    return [float(value) for value in audio]


def sample_bytes(samples):
    import struct
    out = bytearray()
    for value in samples:
        safe = max(-1.0, min(1.0, float(value)))
        out += struct.pack("<h", int(round(safe * 32767)))
    return bytes(out)


def write_audio(chunks, request_id):
    import wave
    directory = ARGS.get("tmp-dir") or os.environ.get("WV_KOKORO_TMP")
    if not isinstance(directory, str) or not os.path.isdir(directory):
        raise ResourceChanged("the worker temporary directory is unavailable")
    path = os.path.join(directory, "out-" + request_id + ".wav")
    silence = b"\x00\x00" * int(0.15 * 24000)
    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(24000)
        for index, chunk in enumerate(chunks):
            if index > 0:
                handle.writeframes(silence)
            handle.writeframes(chunk)
        frames = handle.getnframes()
    if frames > MAX_AUDIO_SECONDS * 24000:
        raise ResourceChanged("the produced audio exceeds the duration budget")
    with open(path, "rb") as handle:
        data = handle.read()
    if len(data) > MAX_OUTPUT_BYTES:
        raise ResourceChanged("the produced WAV exceeds the byte budget")
    return data, int(round(frames * 1000 / 24000))


def synthesize_once(message):
    global ACTIVE_REQUEST
    payload = message.get("payload") if isinstance(message.get("payload"), dict) else {}
    request_id = payload.get("requestId")
    text = payload.get("text")
    model = payload.get("model")
    backend = payload.get("backend")
    voice_id = payload.get("voiceId")
    language = payload.get("language")
    if not isinstance(request_id, str) or not isinstance(text, str) or not text.strip():
        return fail(message["id"], ERRORS["INVALID_INPUT"], "request id and text are required")
    if len(text) > MAX_TEXT_CHARS:
        return fail(message["id"], ERRORS["INVALID_INPUT"], "text exceeds the batch limit")
    if model != MODEL_ID or backend != BACKEND:
        return fail(message["id"], ERRORS["MODEL_BACKEND_MISMATCH"], "the request does not match the loaded worker identity")
    if payload.get("modality") != "preset":
        return fail(message["id"], ERRORS["UNSUPPORTED_MODALITY"], "Kokoro exposes preset voices only")
    if not isinstance(voice_id, str) or voice_id not in BINDING_INDEX:
        return fail(message["id"], ERRORS["INVALID_INPUT"], "a trusted preset voice id is required")
    if language not in LANGUAGE_OUT:
        return fail(message["id"], ERRORS["INVALID_INPUT"], "the language is not declared by the local voice index")
    with CANCEL_LOCK:
        if ACTIVE_REQUEST is not None:
            return fail(message["id"], ERRORS["BUSY"], "one synthesis at a time")
        ACTIVE_REQUEST = request_id
        CANCEL_EVENTS[request_id] = threading.Event()
    thread = threading.Thread(target=run_synthesis, args=(message, payload), daemon=True)
    thread.start()


def clear_active(request_id):
    global ACTIVE_REQUEST
    with CANCEL_LOCK:
        if ACTIVE_REQUEST == request_id:
            ACTIVE_REQUEST = None
        CANCEL_EVENTS.pop(request_id, None)


def finish_fail(message_id, code, text, request_id):
    clear_active(request_id)
    fail(message_id, code, text, request_id)


def emit_cancelled(message, payload, request_id):
    clear_active(request_id)
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
    global MODEL
    request_id = payload["requestId"]
    event = CANCEL_EVENTS.get(request_id)
    voice_path = None
    try:
        if event is not None and event.wait(0.05):
            emit_cancelled(message, payload, request_id)
            return
        try:
            audit_model()
            voice_path = write_voice_file(payload["voiceId"], request_id)
        except ResourceChanged as error:
            finish_fail(message["id"], ERRORS["RESOURCE_CHANGED"], str(error), request_id)
            return
        if event is not None and event.is_set():
            emit_cancelled(message, payload, request_id)
            return
        try:
            model = ensure_model()
        except DependencyMissing:
            finish_fail(message["id"], ERRORS["DEPENDENCY_MISSING"], "the local kokoro package is not importable", request_id)
            return
        except NetworkBlocked:
            finish_fail(message["id"], ERRORS["NETWORK_BLOCKED"], "a local loader attempted a network access", request_id)
            return
        except ResourceChanged as error:
            finish_fail(message["id"], ERRORS["RESOURCE_CHANGED"], str(error), request_id)
            return
        except Exception:
            finish_fail(message["id"], ERRORS["RESOURCE_UNVERIFIED"], "the local model could not be loaded", request_id)
            return
        if event is not None and event.is_set():
            emit_cancelled(message, payload, request_id)
            return
        try:
            _KModel, KPipeline = ensure_runtime()
            lang_code = LANGUAGE_OUT[payload["language"]]
            pipeline = KPipeline(lang_code, model=model, device="cpu")
            chunks = []
            for result in pipeline(payload["text"], voice=voice_path, speed=1.0):
                audio = getattr(result, "audio", None)
                if audio is None and isinstance(result, (tuple, list)) and len(result) >= 3:
                    audio = result[2]
                if audio is None:
                    continue
                chunks.append(sample_bytes(sample_list(audio)))
            if not chunks:
                finish_fail(message["id"], ERRORS["OUTPUT_INVALID"], "the local model returned no audio", request_id)
                return
        except ImportError as error:
            finish_fail(message["id"], ERRORS["G2P_UNAVAILABLE"], "the requested language G2P is unavailable (" + type(error).__name__ + ")", request_id)
            return
        except NetworkBlocked:
            finish_fail(message["id"], ERRORS["NETWORK_BLOCKED"], "a local loader attempted a network access", request_id)
            return
        except Exception as error:
            finish_fail(message["id"], ERRORS["RESOURCE_UNVERIFIED"], "the local synthesis failed (" + type(error).__name__ + ")", request_id)
            return
        if event is not None and event.is_set():
            emit_cancelled(message, payload, request_id)
            return
        try:
            data, duration_ms = write_audio(chunks, request_id)
        except ResourceChanged as error:
            finish_fail(message["id"], ERRORS["OUTPUT_INVALID"], str(error), request_id)
            return
        clear_active(request_id)
        emit({
            "v": PROTOCOL_VERSION,
            "id": message["id"],
            "type": "result",
            "payload": {
                "state": "ok",
                "mime": "audio/wav",
                "sampleRate": 24000,
                "channels": 1,
                "durationMs": duration_ms,
                "bytesBase64": base64.b64encode(data).decode("ascii"),
                "model": MODEL_ID,
                "backend": BACKEND,
                "voiceId": payload.get("voiceId"),
                "requestId": request_id,
            },
        })
    except NetworkBlocked:
        finish_fail(message["id"], ERRORS["NETWORK_BLOCKED"], "a local loader attempted a network access", request_id)
    except ResourceChanged as error:
        finish_fail(message["id"], ERRORS["RESOURCE_CHANGED"], str(error), request_id)
    except Exception as error:  # noqa: BLE001
        finish_fail(message["id"], ERRORS["OUTPUT_INVALID"], "the worker could not complete the synthesis (" + type(error).__name__ + ")", request_id)
    finally:
        if voice_path:
            try:
                os.remove(voice_path)
            except OSError:
                pass
        clear_active(request_id)


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
    ARGS["tmp-dir"] = os.environ.get("WV_KOKORO_TMP")
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
        except Exception as error:  # noqa: BLE001 鈥?a bad line must never kill the worker silently
            fail("worker", ERRORS["PROTOCOL_INVALID"], "internal worker error (" + type(error).__name__ + ")")
    cleanup_snapshot_paths(force=True)


if __name__ == "__main__":
    main(sys.argv[1:])
