from __future__ import annotations

import asyncio
import logging
import functools
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from threading import Thread

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import config
from chatbot import chat
from crawler import run_crawl
from faiss_embedder import embed_articles, get_stats
from models import ChatRequest, ChatResponse, StatsResponse
from stt_engine import transcribe_audio

logger = logging.getLogger("server")

_last_crawled_at: str | None = None
_total_articles: int = 0

scheduler = BackgroundScheduler()

def _crawl_and_embed() -> None:
    global _last_crawled_at, _total_articles

    try:
        articles = run_crawl()
        if articles:
            embed_articles(articles)
            _total_articles += len(articles)
        _last_crawled_at = datetime.now(timezone.utc).isoformat()
        logger.info(
            "Crawl+embed cycle complete – %d new articles, %d total",
            len(articles),
            _total_articles,
        )
    except Exception as exc:
        import traceback
        logger.error("Crawl+embed cycle failed: %s\\n%s", exc, traceback.format_exc())

@asynccontextmanager
async def lifespan(app: FastAPI):
    config.setup_logging()
    logger.info("Dang khoi dong Chatbot Tin tuc RAG ...")

    # Initialize FAISS index and load existing data
    from faiss_embedder import init_index
    init_index()

    initial_thread = Thread(target=_crawl_and_embed, daemon=True)
    initial_thread.start()

    scheduler.add_job(
        _crawl_and_embed,
        "interval",
        minutes=config.CRAWLER_INTERVAL_MINUTES,
        id="periodic_crawl",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler started – crawl every %d minutes",
        config.CRAWLER_INTERVAL_MINUTES,
    )

    yield  # app is running

    scheduler.shutdown(wait=False)
    logger.info("Server shut down.")

app = FastAPI(
    title="Chatbot Tin tức",
    description="Hỏi đáp tin tức tiếng Việt ứng dụng RAG",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        response = chat(request)
        return response
    except Exception as exc:
        logger.error("Chat endpoint error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Internal server error. Please try again later.",
        )


@app.get("/stats", response_model=StatsResponse)
async def stats_endpoint():
    try:
        db_stats = get_stats()
        return StatsResponse(
            total_articles=_total_articles,
            total_chunks=db_stats.get("total_chunks", 0),
            last_crawled_at=_last_crawled_at or db_stats.get("last_crawled_at"),
            sources_breakdown=db_stats.get("sources_breakdown", {}),
            categories_breakdown=db_stats.get("categories_breakdown", {}),
        )
    except Exception as exc:
        logger.error("Stats endpoint error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch stats")


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/stt")
async def speech_to_text(file: UploadFile = File(...)):
    """
    Nhận file audio từ Frontend (WebM / WAV),
    gửi lên OpenAI Whisper API và trả về transcript tiếng Việt.
    """
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="File audio rỗng.")

    try:
        # transcribe_audio là blocking I/O (gọi OpenAI qua HTTP).
        # Dùng run_in_executor để không block asyncio event loop.
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(
            None,
            functools.partial(transcribe_audio, audio_bytes)
        )
        return {"text": text}
    except RuntimeError as exc:
        logger.error("STT config lỗi: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        logger.warning("STT input lỗi: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("STT endpoint lỗi: %s", exc)
        raise HTTPException(status_code=500, detail="Không thể xử lý audio. Vui lòng thử lại.")

