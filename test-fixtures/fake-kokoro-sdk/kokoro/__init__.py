"""Fake `kokoro` package for Whale Voice offline worker tests (not the real SDK)."""

__version__ = "0.9.4"

from .fake import KModel, KPipeline  # noqa: F401
