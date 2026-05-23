from __future__ import annotations

import io
import logging

from openai import OpenAI

import config

logger = logging.getLogger("stt_engine")

# Client dùng chung với phần chat – không cần khởi tạo riêng
_client: OpenAI | None = None

# Magic bytes để detect format audio
_AUDIO_SIGNATURES: list[tuple[bytes, str]] = [
    (b"\x1a\x45\xdf\xa3", "webm"),   # WebM / MKV
    (b"RIFF",              "wav"),    # WAV
    (b"OggS",              "ogg"),    # Ogg (Opus/Vorbis)
    (b"\xff\xfb",          "mp3"),    # MP3 (frame sync)
    (b"\xff\xf3",          "mp3"),    # MP3
    (b"\xff\xf2",          "mp3"),    # MP3
    (b"ID3",               "mp3"),    # MP3 với ID3 tag
    (b"fLaC",              "flac"),   # FLAC
]


def _detect_audio_format(audio_bytes: bytes) -> str:
    """Detect audio format từ magic bytes, fallback về 'webm'."""
    for signature, fmt in _AUDIO_SIGNATURES:
        if audio_bytes[:len(signature)] == signature:
            return fmt
    return "webm"  # browser MediaRecorder thường xuất WebM


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def transcribe_audio(audio_bytes: bytes, language: str = "vi") -> str:
    """
    Gửi audio bytes lên OpenAI Whisper API và trả về transcript.

    Args:
        audio_bytes: Raw bytes của file audio (WebM / WAV / MP3...).
        language:    Mã ngôn ngữ ISO-639-1. Mặc định "vi" (tiếng Việt).

    Returns:
        Chuỗi văn bản đã nhận dạng.

    Raises:
        RuntimeError: Nếu OPENAI_API_KEY chưa được cấu hình.
        ValueError:   Nếu audio quá ngắn (< 500 bytes).
        Exception:    Lỗi từ OpenAI API.
    """
    if not config.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY chưa được cấu hình.")

    if len(audio_bytes) < 500:
        raise ValueError(f"Audio quá ngắn ({len(audio_bytes)} bytes), bỏ qua.")

    client = _get_client()

    # Detect format từ magic bytes để đặt tên file đúng extension.
    # OpenAI Whisper API dùng extension để xác định codec.
    fmt = _detect_audio_format(audio_bytes)
    filename = f"recording.{fmt}"

    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    logger.debug(
        "Gọi Whisper API – audio size: %d bytes, format: %s",
        len(audio_bytes), fmt,
    )

    response = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        language=language,
        response_format="text",     # trả thẳng string, không cần parse JSON
    )

    # response_format="text" → response là str thuần
    text = str(response).strip()

    logger.info("Whisper API transcript (format=%s, len=%d): %.100s", fmt, len(text), text)
    return text
