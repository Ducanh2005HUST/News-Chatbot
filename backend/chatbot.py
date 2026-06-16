from __future__ import annotations

import logging
import re
from typing import Optional

import config
from models import ChatRequest, ChatResponse, SourceInfo
from retriever import retrieve

logger = logging.getLogger("chatbot")

import os

KEYWORDS_FILE = os.path.join(os.path.dirname(__file__), "multi_source_keywords.txt")

def _load_keywords() -> list[str]:
    """Load keywords from external file, fallback to default list."""
    if os.path.exists(KEYWORDS_FILE):
        with open(KEYWORDS_FILE, "r", encoding="utf-8") as f:
            return [line.strip().lower() for line in f if line.strip() and not line.startswith("#")]
    
    return [
        "tong hop", "tổng hợp", "tom tat", "tóm tắt", "so sanh", "so sánh",
        "nhieu bao", "nhiều báo", "tuan qua", "tuần qua", "thang qua", "tháng qua",
        "tong quan", "tổng quan", "diem tin", "điểm tin", "cac bao", "các báo",
        "cac nguon", "các nguồn", "phan tich", "phân tích"
    ]

# Load 1 lần khi import module (cache lại)
_MULTI_SOURCE_KEYWORDS = _load_keywords()

def _detect_intent(question: str) -> str:
    """Return 'multi_source' if question asks for synthesis, else 'simple'.
       If you want to support hot-reload, call _load_keywords() dynamically here instead of caching.
    """
    q_lower = question.lower()
    for kw in _MULTI_SOURCE_KEYWORDS:
        if kw in q_lower:
            return "multi_source"
    return "simple"


_SIMPLE_PROMPT = """\
Bạn là trợ lý đọc báo thông minh. Dựa trên các đoạn tin tức sau đây từ báo Việt Nam, hãy trả lời câu hỏi của người dùng bằng tiếng Việt một cách chính xác và súc tích.

Context:
{chunks}

Câu hỏi: {question}

Yêu cầu:
- Trả lời dựa trên context được cung cấp
- Nếu không có đủ thông tin, nói rõ "Tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại"
- Cuối câu trả lời liệt kê nguồn tham khảo kèm link\
"""

_MULTI_SOURCE_PROMPT = """\
Bạn là trợ lý đọc báo thông minh chuyên tổng hợp tin tức. Dựa trên các đoạn tin tức sau đây từ nhiều báo Việt Nam, hãy tổng hợp và trả lời câu hỏi của người dùng.

Context (nhóm theo nguồn):
{chunks}

Câu hỏi: {question}

Yêu cầu:
- Tổng hợp thông tin từ tất cả các nguồn
- Trình bày theo cấu trúc: Tổng quan -> Chi tiết theo từng góc độ/nguồn -> Kết luận
- Ghi rõ "Theo VnExpress...", "Theo Tuổi Trẻ...", "Theo Thanh Niên..." khi trích dẫn
- Nếu thông tin mâu thuẫn giữa các nguồn, ghi nhận cả hai góc nhìn
- Cuối câu trả lời liệt kê tất cả nguồn tham khảo kèm link\
"""


def _build_context(chunks: list[dict], intent: str) -> str:
    if intent == "multi_source":
        grouped: dict[str, list[str]] = {}
        for chunk in chunks:
            src = chunk["metadata"].get("source", "Unknown")
            title = chunk["metadata"].get("title", "")
            text = f"[{title}] {chunk['document']}"
            grouped.setdefault(src, []).append(text)
        parts = []
        for source, texts in grouped.items():
            parts.append(f"\n--- {source} ---")
            for t in texts:
                parts.append(t)
        return "\n".join(parts)
    else:
        lines = []
        for chunk in chunks:
            title = chunk["metadata"].get("title", "")
            src = chunk["metadata"].get("source", "")
            lines.append(f"[{src} - {title}] {chunk['document']}")
        return "\n\n".join(lines)


def _call_openai(prompt: str) -> Optional[str]:
    """Call GPT-4o-mini. Returns None on failure."""
    if not config.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set – skipping OpenAI call")
        return None
    try:
        from openai import OpenAI  # lazy import
        client = OpenAI(api_key=config.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=config.LLM_MAX_TOKENS,
            temperature=config.LLM_TEMPERATURE,
            timeout=30,
        )
        return response.choices[0].message.content
    except Exception as exc:
        error_msg = str(exc).lower()
        if "quota" in error_msg or "rate" in error_msg or "billing" in error_msg:
            logger.error("OpenAI quota/billing error: %s", exc)
        else:
            logger.error("OpenAI API error: %s", exc)
        return None


def _call_anthropic(prompt: str) -> Optional[str]:
    if not config.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set – skipping fallback")
        return None
    try:
        import anthropic  # lazy import
        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=config.LLM_FALLBACK_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
            timeout=30,
        )
        return response.content[0].text
    except Exception as exc:
        logger.error("Anthropic API error: %s", exc)
        return None


def _call_llm(prompt: str) -> str:
    answer = _call_openai(prompt)
    if answer:
        return answer
    logger.info("Primary LLM failed – trying Anthropic fallback...")
    answer = _call_anthropic(prompt)
    if answer:
        return answer
    return (
        "Xin lỗi, hiện tại tôi không thể xử lý yêu cầu của bạn. "
        "Vui lòng thử lại sau hoặc kiểm tra cấu hình API key."
    )


def chat(request: ChatRequest) -> ChatResponse:
    """
    Full RAG pipeline:
    1. Detect intent
    2. Retrieve relevant chunks
    3. Build prompt
    4. Call LLM
    5. Return structured response
    """
    question = request.question.strip()
    intent = _detect_intent(question)

    # decide retrieval parameters
    if intent == "multi_source":
        top_k = config.MULTI_TOP_K
        threshold = 0.20  # broader coverage for synthesis
    else:
        top_k = config.SIMPLE_TOP_K
        threshold = 0.25  # was 0.35, logs show scores ~0.47 which is normal

    # apply user filters
    sources = request.filters.sources or None
    categories = request.filters.categories or None

    logger.info(
        "Chat | intent=%s | top_k=%d | threshold=%.2f | q=%.80s",
        intent, top_k, threshold, question,
    )

    # retrieve
    chunks = retrieve(
        query=question,
        top_k=top_k,
        sources=sources,
        categories=categories,
        threshold=threshold,
    )

    if not chunks:
        return ChatResponse(
            answer="Tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại. Hãy thử lại với câu hỏi khác hoặc đợi dữ liệu được cập nhật.",
            sources=[],
            intent=intent,
        )

    # build prompt
    context = _build_context(chunks, intent)
    template = _MULTI_SOURCE_PROMPT if intent == "multi_source" else _SIMPLE_PROMPT
    prompt = template.format(chunks=context, question=question)

    # call LLM
    answer = _call_llm(prompt)

    # build source list (deduplicated by URL)
    seen_urls: set[str] = set()
    source_list: list[SourceInfo] = []
    for chunk in chunks:
        url = chunk["metadata"].get("url", "")
        if url in seen_urls:
            continue
        seen_urls.add(url)
        source_list.append(
            SourceInfo(
                title=chunk["metadata"].get("title", ""),
                url=url,
                source=chunk["metadata"].get("source", ""),
                category=chunk["metadata"].get("category", ""),
                published_at=chunk["metadata"].get("published_at", None),
                similarity=chunk.get("similarity"),
            )
        )

    return ChatResponse(
        answer=answer,
        sources=source_list,
        intent=intent,
    )
