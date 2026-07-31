import logging
import os
import subprocess
import tempfile
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
                logger.info("Loading Whisper model 'turbo' from %s", _MODEL_DIR)
                _model = whisper.load_model("turbo", download_root=_MODEL_DIR)
                logger.info("Whisper model loaded")
    return _model


def preprocess_audio(input_path: str) -> str:
    fd, output_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)

    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", input_path,
                "-af", "highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11,dynaudnorm",
                "-ar", "16000", "-ac", "1",
                output_path,
            ],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as e:
        logger.error("ffmpeg preprocessing failed: %s", e.stderr.decode(errors="ignore"))
        os.remove(output_path)
        raise

    return output_path


def transcribe_audio(file_path: str) -> str:
    model = get_whisper_model()
    processed_path = preprocess_audio(file_path)

    try:
        result = model.transcribe(processed_path)
        return result["text"].strip()
    finally:
        os.remove(processed_path)