import logging
import os
import threading

import whisper

logger = logging.getLogger(__name__)

_model = None

_model_lock = threading.Lock()

_MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "whisper_models")


def get_whisper_model():
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
