"""Fake `indextts` package for Whale Voice offline worker tests.

This is not the real SDK and never loads a model. It records the exact constructor/inference
arguments, consumes only synthetic files and writes a valid 22.05 kHz PCM16 WAV.
"""

__version__ = "2.0.0"
