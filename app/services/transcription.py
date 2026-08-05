import logging
import os
import subprocess
import tempfile
import threading

import whisper

from app.cores.config import settings

logger = logging.getLogger(__name__)

_model = None
_model_lock = threading.Lock()

_MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "whisper_models")

# Switched back to turbo from large-v3 -- large-v3 was too heavy for this
# machine (CPU-only, no FP16 support here per earlier logs: "FP16 is not
# supported on CPU; using FP32 instead"). turbo trades some multilingual
# accuracy for speed/size; the other measures below (beam search, relaxed
# thresholds tuned for soft/slow speech, unrestricted language detection)
# still apply and help offset some of that gap. Once we have the fixed
# list of languages actually spoken here, we can revisit restricting
# detection to that set as an additional accuracy lever.
_MODEL_NAME = "turbo"


def get_whisper_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                logger.info("Loading Whisper model '%s' from %s", _MODEL_NAME, _MODEL_DIR)
                _model = whisper.load_model(_MODEL_NAME, download_root=_MODEL_DIR)
                logger.info("Whisper model loaded")
    return _model


def preprocess_audio(input_path: str) -> str:
    fd, output_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)

    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", input_path,
                "-af",
                # highpass: cut low-frequency rumble
                # afftdn: noise reduction
                # compand: boosts QUIET passages more than loud ones -- this is
                #   the key fix for a soft/low voice. Points are (input_dB/output_dB):
                #   very quiet input (-70dB) gets pulled up to -40dB, and it tapers
                #   off for already-loud input so we don't blow out normal speech.
                # loudnorm: overall loudness normalization (after compand does the
                #   heavy lifting on dynamic range)
                # dynaudnorm: final gentle smoothing pass
                "highpass=f=80,"
                "afftdn=nf=-25,"
                "compand=attacks=0:decays=0.3:points=-70/-40|-30/-15|-20/-10|0/-5:soft-knee=6,"
                "loudnorm=I=-16:TP=-1.5:LRA=11,"
                "dynaudnorm",
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


def _log_detected_language(model, audio_path: str) -> None:
    """Diagnostic only -- does NOT restrict or influence transcription.

    Runs Whisper's full, unrestricted language detector and logs the top
    candidates with their confidence scores. This is here so that if
    transcription quality looks off for a given note, you can check this
    log line and see exactly what Whisper thought it heard (e.g. is it
    genuinely picking 'hi' for Urdu speech, or something else entirely)
    before deciding whether restricting the candidate set is even the
    right fix. Best-effort: any failure here is logged and swallowed, it
    should never block or affect the actual transcription.
    """
    try:
        audio = whisper.load_audio(audio_path)
        audio = whisper.pad_or_trim(audio)
        mel = whisper.log_mel_spectrogram(audio, n_mels=model.dims.n_mels).to(model.device)
        _, probs = model.detect_language(mel)
        top5 = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)[:5]
        logger.info(
            "Whisper language detection (unrestricted, diagnostic only): %s",
            [(lang, round(p, 3)) for lang, p in top5],
        )
    except Exception:
        logger.exception("Language detection diagnostic failed (non-fatal)")


def transcribe_audio(file_path: str) -> str:
    model = get_whisper_model()
    processed_path = preprocess_audio(file_path)

    try:
        _log_detected_language(model, processed_path)

        result = model.transcribe(
            processed_path,
            # None (the default) = Whisper auto-detects across its full
            # language list, unrestricted, no bias toward any particular
            # language. Set settings.whisper_language to a single
            # ISO-639-1 code to force one language instead.
            language=settings.whisper_language,
            # Wider beam search than the default greedy decoding -- more
            # candidate paths considered per step, generally more accurate
            # but slower. Worth it while diagnosing quality; drop back to
            # None (greedy) if the extra latency isn't worth it once
            # accuracy is dialed in.
            beam_size=5,
            # Default 0.6 too easily marks quiet/slow speech as "no speech"
            # and drops it. Lower = more willing to transcribe faint audio.
            # Kept relaxed -- this check is about whether a segment is
            # speech at all, and isn't implicated in the repetition/garble
            # issues below, so no reason to walk it back.
            no_speech_threshold=0.3,
            # REVERTED closer to Whisper's default (-1.0). We'd relaxed
            # this to -1.5 to stop faint/soft speech from being discarded,
            # but that also accepts genuinely low-confidence decodes
            # (nonsense words, garbled loanwords) as final instead of
            # letting Whisper's temperature-fallback retry kick in. If
            # quiet speech starts getting dropped again, that's the
            # signal to loosen this back up -- but do it in small steps
            # (e.g. -1.2) rather than jumping straight back to -1.5.
            logprob_threshold=-1.2,
            # REVERTED to Whisper's default (2.4), down from 2.8. This is
            # the main suspect for the repeated-word glitches ("bread
            # bread", duplicated "I ... I" clauses): repeated text
            # compresses unusually well (high compression ratio), which is
            # exactly what this threshold exists to catch and trigger a
            # retry-at-higher-temperature for. Loosening it to 2.8 told
            # Whisper repetitive output was fine as-is.
            compression_ratio_threshold=2.4,
            # Prevents Whisper from repeating/hallucinating text into long
            # silences between words, a common failure mode with slow
            # speakers when each segment is conditioned on the last.
            condition_on_previous_text=False,
        )
        return result["text"].strip()
    finally:
        os.remove(processed_path)