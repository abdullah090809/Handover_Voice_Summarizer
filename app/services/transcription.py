import os

import whisper

_model = None

# Store Whisper model weights inside the project instead of the user-wide cache
_MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "whisper_models")


def get_whisper_model():
    """
    Loads the Whisper model once and reuses it across requests
    (loading is slow — we don't want to reload it on every upload).
    """
    global _model
    if _model is None:
        _model = whisper.load_model("base", download_root=_MODEL_DIR)
    return _model


def transcribe_audio(file_path: str) -> str:
    model = get_whisper_model()
    result = model.transcribe(file_path)
    return result["text"].strip()