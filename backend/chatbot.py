from __future__ import annotations

import json
import logging
import re
from typing import Optional

import config
from models import ChatRequest, ChatResponse, SourceInfo
from retriever import retrieve
from reranker import rerank_chunks

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


def _extract_top_k_from_query(question: str) -> int | None:
    """
    Extract 'top N' from query. Returns N if found, else None.
    Supports patterns: "top 10", "top10", "top 5 sự kiện", etc.
    """
    import re
    q_lower = question.lower()

    # Pattern: "top" followed by optional space and number
    match = re.search(r'\btop\s*(\d+)\b', q_lower)
    if match:
        top_n = int(match.group(1))
        if 1 <= top_n <= 50:  # reasonable limits
            return top_n

    return None


# Load keywords once at module import (cache for performance)
_MULTI_SOURCE_KEYWORDS = _load_keywords()


def _detect_intent(question: str) -> str:
    """Return 'multi_source' if question asks for synthesis, else 'simple'.
       If you want to support hot-reload, call _load_keywords() dynamically here instead of caching.
    """
    q_lower = question.lower()

    # Check for ranking pattern first
    top_k = _extract_top_k_from_query(question)
    if top_k is not None:
        return "multi_source"

    # Check keywords
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
    2. Retrieve relevant chunks (with larger top_k)
    3. Re-rank chunks (if enabled) to get final set
    4. Build prompt
    5. Call LLM
    6. Return structured response
    """
    question = request.question.strip()
    intent = _detect_intent(question)

    # Extract dynamic top_k from query if present (for ranking queries)
    dynamic_top_k = _extract_top_k_from_query(question)

    # decide retrieval parameters - use larger top_k for reranking
    if intent == "multi_source":
        retrieval_top_k = config.MULTI_RETRIEVAL_TOP_K
        default_final_top_k = config.MULTI_FINAL_TOP_K
        threshold = 0.20  # broader coverage for synthesis
    else:
        retrieval_top_k = config.SIMPLE_RETRIEVAL_TOP_K
        default_final_top_k = config.SIMPLE_FINAL_TOP_K
        threshold = 0.25

    # Override final_top_k if dynamic top_k is specified and within limits
    if dynamic_top_k is not None:
        final_top_k = min(dynamic_top_k, config.MULTI_FINAL_TOP_K)  # cap at max
    else:
        final_top_k = default_final_top_k

    # apply user filters
    sources = request.filters.sources or None
    categories = request.filters.categories or None

    logger.info(
        "Chat | intent=%s | retrieval_top_k=%d | final_top_k=%d | threshold=%.2f | q=%.80s",
        intent, retrieval_top_k, final_top_k, threshold, question,
    )

    # retrieve - get more chunks than needed
    chunks = retrieve(
        query=question,
        top_k=retrieval_top_k,
        sources=sources,
        categories=categories,
        threshold=threshold,
    )

    logger.info("Retrieved %d chunks before rerank (threshold=%.2f)", len(chunks), threshold)

    # Keep original chunks for fallback
    original_chunks = chunks.copy() if chunks else []

    # Re-rank if enabled and we have chunks
    if chunks and config.RERANKER_ENABLED:
        try:
            chunks = rerank_chunks(
                query=question,
                chunks=chunks,
                top_k=final_top_k,
                threshold=config.RERANKER_THRESHOLD,
            )
            logger.info("Re-ranking applied: %d chunks after rerank", len(chunks))
        except Exception as exc:
            logger.error("Re-ranking failed: %s. Falling back to original chunks.", exc)
            chunks = original_chunks[:final_top_k]
    else:
        # No reranking: just take top final_top_k from retrieval
        chunks = chunks[:final_top_k]

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

    # Add ranking instruction if query asks for top N
    if dynamic_top_k is not None:
        ranking_instruction = f"\n\nLưu ý: Người dùng yêu cầu {dynamic_top_k} sự kiện/vấn đề. Hãy trình bày danh sách xếp hạng theo thứ tự quan trọng/tính chất thời sự, mỗi mục gồm: tiêu đề, tóm tắt, và nguồn tham khảo."
        prompt = prompt + ranking_instruction

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


# --- Streaming functions ---

def _call_openai_stream(prompt: str):
    """Stream tokens from OpenAI."""
    if not config.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set")
        return
    from openai import OpenAI
    client = OpenAI(api_key=config.OPENAI_API_KEY)
    try:
        stream = client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=config.LLM_MAX_TOKENS,
            temperature=config.LLM_TEMPERATURE,
            timeout=30,
            stream=True,
        )
        for chunk in stream:
            if chunk.choices[0].delta.content is not None:
                yield chunk.choices[0].delta.content
    except Exception as exc:
        logger.error("OpenAI streaming error: %s", exc)


def _call_anthropic_stream(prompt: str):
    """Stream tokens from Anthropic."""
    if not config.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set")
        return
    import anthropic
    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    try:
        with client.messages.stream(
            model=config.LLM_FALLBACK_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
            timeout=30,
        ) as stream:
            for text in stream.text_stream:
                yield text
    except Exception as exc:
        logger.error("Anthropic streaming error: %s", exc)


def _call_llm_stream(prompt: str):
    """Stream response from LLM with fallback."""
    # Try OpenAI first if key is set
    if config.OPENAI_API_KEY:
        for token in _call_openai_stream(prompt):
            yield token
        return
    # Fallback to Anthropic if key is set
    if config.ANTHROPIC_API_KEY:
        for token in _call_anthropic_stream(prompt):
            yield token
        return
    # No API key
    yield "Xin lỗi, không có LLM API key configured."


import json

def chat_stream(request: ChatRequest):
    """
    Streaming version of chat pipeline.
    Yields SSE events: {"token": "..."} and final {"done": {...}}.
    """
    question = request.question.strip()
    intent = _detect_intent(question)

    # Extract dynamic top_k from query if present (for ranking queries)
    dynamic_top_k = _extract_top_k_from_query(question)

    # decide retrieval parameters
    if intent == "multi_source":
        retrieval_top_k = config.MULTI_RETRIEVAL_TOP_K
        default_final_top_k = config.MULTI_FINAL_TOP_K
        threshold = 0.20
    else:
        retrieval_top_k = config.SIMPLE_RETRIEVAL_TOP_K
        default_final_top_k = config.SIMPLE_FINAL_TOP_K
        threshold = 0.25

    # Override final_top_k if dynamic top_k is specified and within limits
    if dynamic_top_k is not None:
        final_top_k = min(dynamic_top_k, config.MULTI_FINAL_TOP_K)  # cap at max
    else:
        final_top_k = default_final_top_k

    # apply user filters
    sources = request.filters.sources or None
    categories = request.filters.categories or None

    logger.info(
        "ChatStream | intent=%s | retrieval_top_k=%d | final_top_k=%d | q=%.80s",
        intent, retrieval_top_k, final_top_k, question,
    )

    try:
        # Retrieve
        chunks = retrieve(
            query=question,
            top_k=retrieval_top_k,
            sources=sources,
            categories=categories,
            threshold=threshold,
        )
        original_chunks = chunks.copy() if chunks else []

        # Re-rank
        if chunks and config.RERANKER_ENABLED:
            try:
                chunks = rerank_chunks(
                    query=question,
                    chunks=chunks,
                    top_k=final_top_k,
                    threshold=config.RERANKER_THRESHOLD,
                )
                logger.info("Re-ranking applied: %d chunks after rerank", len(chunks))
            except Exception as exc:
                logger.error("Re-ranking failed: %s. Falling back to original chunks.", exc)
                chunks = original_chunks[:final_top_k]
        else:
            chunks = chunks[:final_top_k]

        if not chunks:
            # No relevant chunks, send special event and return
            token_msg = "Xin lỗi, tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại."
            yield f"data: {json.dumps({'token': token_msg})}\n\n"
            done_payload = {
                'answer': "Tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại. Hãy thử lại với câu hỏi khác hoặc đợi dữ liệu được cập nhật.",
                'sources': [],
                'intent': intent,
            }
            yield f"data: {json.dumps({'done': done_payload})}\n\n"
            return

        # Build context and prompt
        context = _build_context(chunks, intent)
        template = _MULTI_SOURCE_PROMPT if intent == "multi_source" else _SIMPLE_PROMPT
        prompt = template.format(chunks=context, question=question)

        # Add ranking instruction if query asks for top N
        if dynamic_top_k is not None:
            ranking_instruction = f"\n\nLưu ý: Người dùng yêu cầu {dynamic_top_k} sự kiện/vấn đề. Hãy trình bày danh sách xếp hạng theo thứ tự quan trọng/tính chất thời sự, mỗi mục gồm: tiêu đề, tóm tắt, và nguồn tham khảo."
            prompt = prompt + ranking_instruction

        # Stream LLM response
        full_answer_parts = []
        try:
            for token in _call_llm_stream(prompt):
                full_answer_parts.append(token)
                token_payload = {'token': token}
                yield f"data: {json.dumps(token_payload)}\n\n"
        except Exception as exc:
            logger.error("LLM streaming error: %s", exc)
            error_msg = "Xin lỗi, đã xảy ra lỗi khi tạo câu trả lời."
            full_answer_parts.append(error_msg)
            token_payload = {'token': error_msg}
            yield f"data: {json.dumps(token_payload)}\n\n"

        # Build sources list
        seen_urls: set[str] = set()
        source_list: list[dict] = []
        for chunk in chunks:
            url = chunk["metadata"].get("url", "")
            if url in seen_urls:
                continue
            seen_urls.add(url)
            source_list.append({
                "title": chunk["metadata"].get("title", ""),
                "url": url,
                "source": chunk["metadata"].get("source", ""),
                "category": chunk["metadata"].get("category", ""),
                "published_at": chunk["metadata"].get("published_at", None),
                "similarity": chunk.get("similarity"),
            })

        # Send done event with full answer and sources
        full_answer = "".join(full_answer_parts)
        done_payload = {
            'answer': full_answer,
            'sources': source_list,
            'intent': intent,
        }
        yield f"data: {json.dumps({'done': done_payload})}\n\n"

    except Exception as exc:
        # Catch any unhandled exception in the entire pipeline
        logger.error("Chat stream pipeline failed: %s", exc, exc_info=True)
        error_msg = "Xin lỗi, đã xảy ra lỗi hệ thống. Vui lòng thử lại sau."
        token_payload = {'token': error_msg}
        yield f"data: {json.dumps(token_payload)}\n\n"
        done_payload = {
            'answer': error_msg,
            'sources': [],
            'intent': intent,
        }
        yield f"data: {json.dumps({'done': done_payload})}\n\n"
