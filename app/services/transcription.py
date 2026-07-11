import logging
import os
import threading

import whisper

logger = logging.getLogger(__name__)

_model = None
# Issue #25 fix: guard lazy initialization with a lock so two concurrent
# first requests can't both load the (large) model at once.
_model_lock = threading.Lock()

# Store Whisper model weights inside the project instead of the user-wide cache
_MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "whisper_models")


def get_whisper_model():
    """
    Loads the Whisper model once and reuses it across requests
    (loading is slow — we don't want to reload it on every upload).

    Called eagerly from the app lifespan handler (see main.py, Issue #24) so
    that in normal operation this function only ever hits the fast path
    below; the lock exists as a safety net for any code path that still
    calls it lazily.
    """
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                logger.info("Loading Whisper model 'base' from %s", _MODEL_DIR)
                _model = whisper.load_model("base", download_root=_MODEL_DIR)
                logger.info("Whisper model loaded")
    return _model


def transcribe_audio(file_path: str) -> str:
    model = get_whisper_model()
    result = model.transcribe(file_path)
    return result["text"].strip()
