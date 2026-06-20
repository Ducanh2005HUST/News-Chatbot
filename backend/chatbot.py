from __future__ import annotations

import json
import logging
import re
import unicodedata
import uuid
import time
from typing import Optional

import config
from models import ChatRequest, ChatResponse, SourceInfo
from retriever import retrieve
from reranker import rerank_chunks

logger = logging.getLogger("chatbot")

import os

KEYWORDS_FILE = os.path.join(os.path.dirname(__file__), "multi_source_keywords.txt")

# --- Query and Intent ---

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

# --- Query Expansion: Build synonym map from keywords ---

def _normalize_for_synonyms(text: str) -> str:
    """Normalize text for synonym matching: lowercase and remove diacritics."""
    if not text:
        return ""
    text = text.lower()
    # Remove diacritics (NFKD + strip accents)
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('ASCII')
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _build_synonym_map(keywords: list[str]) -> dict[str, list[str]]:
    """Build mapping from normalized form to list of original keywords that share that normalization.
    Only keeps groups with more than one variant (true synonyms).
    """
    mapping: dict[str, list[str]] = {}
    for kw in keywords:
        norm = _normalize_for_synonyms(kw)
        if not norm:
            continue
        mapping.setdefault(norm, []).append(kw)
    # Keep only groups with multiple distinct variants
    return {norm: list(set(variants)) for norm, variants in mapping.items() if len(set(variants)) > 1}


def _generate_ngrams(tokens: list[str], max_n: int = 3) -> list[str]:
    """Generate n-grams (1 to max_n) from token list."""
    ngrams = []
    for n in range(1, max_n + 1):
        for i in range(len(tokens) - n + 1):
            ngrams.append(" ".join(tokens[i:i+n]))
    return ngrams


def _expand_query(query: str) -> str:
    """Expand query with synonym terms from keyword list to improve recall."""
    if not query or not _SYNONYM_MAP:
        return query
    tokens = query.split()
    if not tokens:
        return query
    # Generate n-grams (1-3) from query
    ngrams = _generate_ngrams(tokens, max_n=3)
    added_terms = set()
    for gram in ngrams:
        norm = _normalize_for_synonyms(gram)
        if norm in _SYNONYM_MAP:
            for variant in _SYNONYM_MAP[norm]:
                # Only add if not already present in original query (case-insensitive check)
                if variant.lower() not in (t.lower() for t in tokens):
                    added_terms.add(variant)
    if added_terms:
        expanded = query + " " + " ".join(sorted(added_terms))
        logger.debug("Query expansion: original='%s' expanded='%s'", query, expanded)
        return expanded
    return query


# Precompute synonym map
_SYNONYM_MAP = _build_synonym_map(_MULTI_SOURCE_KEYWORDS)

# --- Session Management (Milestone 4) ---

_SESSION_STORE: dict[str, dict] = {}  # session_id -> {"history": list[dict], "last_access": float}
_SESSION_MAX_AGE = 3600  # 1 hour in seconds
_SESSION_MAX_TURNS = 3   # store last 3 turns (user+assistant pairs)


def _get_history(session_id: str) -> list[dict]:
    """Retrieve conversation history for a valid session."""
    session = _SESSION_STORE.get(session_id)
    if session and (time.time() - session["last_access"] < _SESSION_MAX_AGE):
        return session["history"]
    # Expired or missing
    if session:
        del _SESSION_STORE[session_id]
    return []


def _save_turn(session_id: str, question: str, answer: str):
    """Save a conversation turn and prune history."""
    session = _SESSION_STORE.get(session_id, {"history": [], "last_access": time.time()})
    history = session["history"]
    history.append({"question": question, "answer": answer})
    # Keep only last N turns
    if len(history) > _SESSION_MAX_TURNS:
        session["history"] = history[-_SESSION_MAX_TURNS:]
    session["last_access"] = time.time()
    _SESSION_STORE[session_id] = session


def _build_messages(history: list[dict], system_content: str, user_content: str) -> list[dict]:
    """Construct messages array for OpenAI/Anthropic chat APIs with conversation history."""
    messages = [{"role": "system", "content": system_content}]
    for turn in history:
        messages.append({"role": "user", "content": turn["question"]})
        messages.append({"role": "assistant", "content": turn["answer"]})
    messages.append({"role": "user", "content": user_content})
    return messages


def _split_for_anthropic(messages: list[dict]) -> tuple[str, list[dict]]:
    """Anthropic expects system as separate param. Split system from messages."""
    if messages and messages[0]["role"] == "system":
        return messages[0]["content"], messages[1:]
    return "", messages


def _normalize_query(query: str) -> str:
    """Normalize user query for consistent retrieval."""
    if not query:
        return ""
    # Trim whitespace
    query = query.strip()
    # Lowercase
    query = query.lower()
    # Unicode normalization (NFKC)
    query = unicodedata.normalize('NFKC', query)
    # Collapse multiple whitespace into single space
    query = re.sub(r'\s+', ' ', query)
    # Optional diacritics normalization (disabled by default)
    if config.QUERY_NORMALIZE_DIACRITICS:
        # Simple: replace 'đ' with 'd' (Vietnamese-specific)
        query = query.replace('đ', 'd')
    return query


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


# --- Prompt Templates: System + User format for multi-turn support ---

_SIMPLE_SYSTEM = """Bạn là trợ lý đọc báo thông minh. Dựa trên các đoạn tin tức sau đây từ báo Việt Nam, hãy trả lời câu hỏi của người dùng bằng tiếng Việt một cách chính xác, súc tích và đầy đủ nguồn tham khảo.

Yêu cầu:
1. Trả lời HOÀN TOÀN dựa trên context được cung cấp — không thêm, bớt, sửa đổi thông tin
2. Nếu không có thông tin liên quan, nói ngay: "Tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại."
3. Luôn trích dẫn nguồn bằng định dạng inline chuẩn [Nguồn: {Tên nguồn}]({URL}) ngay trong câu trả lời
4. Ví dụ trích dẫn: "Theo nghiên cứu mới đây [Nguồn: VnExpress](https://vnexpress.net)" hoặc "[Nguồn: Thanh Niên](https://thanhnien.vn) đưa tin..."

--- Few-shot ví dụ định dạng (BẮT BUỘC phải tuân thủ) ---

### Ví dụ 1: Câu hỏi có thông tin
Câu hỏi: tin thể thao mới nhất hôm nay?
Trả lời lý tưởng:
Hôm nay ghi nhận những diễn biến nổi bật:
- Đội tuyển bóng đá nữ Việt Nam giành chiến thắng 3-1 trước Thái Lan trong trận đấu vòng loại tối qua [Nguồn: VnExpress](https://vnexpress.net)
- Chuyền thủ Bùi Tiến Dũng lập cú đúp giúp CLB Hà Nội thắng đậm 4-0 trước Than Quảng Ninh [Nguồn: Tuổi Trẻ](https://tuoitre.vn)
- V-League: CLB Hải Phòng thua sát nút 1-2 trước CLB Thành phố Hồ Chí Minh [Nguồn: Thanh Niên](https://thanhnien.vn)

### Ví dụ 2: Câu hỏi không có thông tin
Câu hỏi: có tin tức gì về khám phá mới trên sao Hỏa tuần này?
Trả lời lý tưởng: Tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại.

### Ví dụ 3: Câu hỏi yêu cầu tổng hợp
Câu hỏi: top 5 sự kiện kinh tế nổi bật tuần qua?
Trả lời lý tưởng:
Dưới đây là 5 sự kiện kinh tế quan trọng nhất tuần qua:
1. Ngân hàng Nhà nước giảm lãi suất điều hành thêm 0.25% [Nguồn: VnExpress](https://vnexpress.net)
2. VN-Index vượt mốc 1200 điểm lần đầu tiên sau 2 năm [Nguồn: Tuổi Trẻ](https://tuoitre.vn)
3. Vinamilk công bố lợi nhuận quý I/2026 đạt 4500 tỷ đồng [Nguồn: Thanh Niên](https://thanhnien.vn)
4. Giá xăng RON95 giảm xuống 23.500 VND/lít [Nguồn: VnExpress](https://vnexpress.net)
5. FPT ghi nhận tăng trưởng doanh thu 15% so với cùng kỳ [Nguồn: Tuổi Trẻ](https://tuoitre.vn)
"""

_SIMPLE_USER_TEMPLATE = "Context:\n{chunks}\n\nCâu hỏi: {question}"

_MULTI_SOURCE_SYSTEM = """Bạn là trợ lý đọc báo thông minh chuyên tổng hợp tin tức từ nhiều nguồn báo Việt Nam. Hãy trả lời theo phong cách chuyên nghiệp, cung cấp đầy đủ thông tin và trích dẫn nguồn chính xác.

Yêu cầu BẮT BUỘC:
1. Tổng hợp thông tin từ TẤT CẢ nguồn báo có trong context
2. Trình bày theo cấu trúc rõ ràng: Phần 1) Tổng quan chung → Phần 2) Chi tiết từng nguồn/góc nhìn → Phần 3) Kết luận
3. Mỗi thông tin trích dẫn PHẢI có định dạng inline [Nguồn: Tên nguồn](URL) ngay sau nội dung
   - Ví dụ: "Với tỷ lệ lạm phát 4.5% theo [Nguồn: VnExpress](https://vnexpress.net), đây là mức cao nhất trong vòng 12 tháng qua"
   - Ví dụ: "CLB Nam Định thua 1-2 trước CLB SHB Đà Nẵng [Nguồn: Thanh Niên](https://thanhnien.vn)"
4. Nếu thông tin mâu thuẫn giữa các nguồn, ghi nhận ĐỦ CẢ hai góc nhìn một cách khách quan
5. Không bao giờ kết thúc bằng danh sách nguồn rời — tất cả nguồn đã trích dẫn nằm ngay trong nội dung
6. Nếu không có thông tin, nói ngay: "Tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại."

--- Few-shot ví dụ định dạng (BẮT BUỘC tuân thủ) ---

### Ví dụ 1: Thông tin đa nguồn thống nhất
Câu hỏi: tình hình thị trường chứng khoán tuần này?
Trả lời lý tưởng:
Thị trường chứng khoán tuần này ghi nhận xu hướng tích cực:

Theo nhận định chung, VN-Index duy trì đà tăng trong tuần, đóng cửa phiên cuối tuần tại 1250 điểm [Nguồn: VnExpress](https://vnexpress.net).

Các mã bluechip như VIC, VNM đều tăng trưởng 5-7% [Nguồn: Tuổi Trẻ](https://tuoitre.vn), dẫn dắt đà tăng chung của thị trường.

Về khối ngoại, có phiên mua ròng 350 tỷ đồng vào ngày thứ Sáu [Nguồn: Thanh Niên](https://thanhnien.vn), cho thấy sự quan tâm trở lại.

Tổng kết, tuần qua thị trường diễn biến khả quan hơn so với tuần trước đó.

### Ví dụ 2: Thông tin đa nguồn mâu thuẫn
Câu hỏi: đánh giá về triển vọng kinh tế 2026?
Trả lời lý tưởng:
Về triển vọng kinh tế năm 2026, các quan điểm phân hóa:

Báo VnExpress dẫn lời Bộ Kế hoạch Đầu tư dự báo tăng trưởng GDP đạt 6.0-6.5% [Nguồn: VnExpress](https://vnexpress.net), nhờ vào làn sóng đầu tư công và FDI.

Trong khi đó, báo Tuổi Trẻ trích dẫn chuyên gia từ Viện Nghiên cứu Kinh tế dự báo mức tăng trưởng chỉ 5.5% [Nguồn: Tuổi Trẻ](https://tuoitre.vn), cảnh báo rủi ro từ lạm phát.

Báo Thanh Niên cũng có cái nhìn bi quan hơn, cho rằng tăng trưởng có thể chỉ đạt 5.2% do căng thẳng địa chính trị [Nguồn: Thanh Niên](https://thanhnien.vn).

### Ví dụ 3: Không có thông tin
Câu hỏi: tin tức về sự kiện thời tiết cực đoan vừa xảy ra tại ĐB Sông Cửu Long?
Trả lời lý tưởng: Tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại.
"""

_MULTI_SOURCE_USER_TEMPLATE = "Context:\n{chunks}\n\nCâu hỏi: {question}"


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


def _call_openai_messages(messages: list[dict]) -> Optional[str]:
    """Call GPT-4o-mini with messages array. Returns None on failure."""
    if not config.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set – skipping OpenAI call")
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=config.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=messages,
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


def _call_anthropic_messages(messages: list[dict]) -> Optional[str]:
    """Call Anthropic with messages array (system separated). Returns None on failure."""
    if not config.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set – skipping fallback")
        return None
    try:
        import anthropic
        system_content, messages_rest = _split_for_anthropic(messages)
        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=config.LLM_FALLBACK_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system_content,
            messages=messages_rest,
            timeout=30,
        )
        return response.content[0].text
    except Exception as exc:
        logger.error("Anthropic API error: %s", exc)
        return None


def _call_llm_with_messages(messages: list[dict]) -> str:
    """Call LLM with messages array, with fallback."""
    answer = _call_openai_messages(messages)
    if answer:
        return answer
    logger.info("Primary LLM failed – trying Anthropic fallback...")
    answer = _call_anthropic_messages(messages)
    if answer:
        return answer
    return (
        "Xin lỗi, hiện tại tôi không thể xử lý yêu cầu của bạn. "
        "Vui lòng thử lại sau hoặc kiểm tra cấu hình API key."
    )


# --- Streaming versions ---


def _call_openai_stream(messages: list[dict]):
    """Stream tokens from OpenAI."""
    if not config.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set")
        return
    from openai import OpenAI
    client = OpenAI(api_key=config.OPENAI_API_KEY)
    try:
        stream = client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=messages,
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


def _call_anthropic_stream(messages: list[dict]):
    """Stream tokens from Anthropic."""
    if not config.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set")
        return
    import anthropic
    system_content, messages_rest = _split_for_anthropic(messages)
    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    try:
        with client.messages.stream(
            model=config.LLM_FALLBACK_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system_content,
            messages=messages_rest,
            timeout=30,
        ) as stream:
            for text in stream.text_stream:
                yield text
    except Exception as exc:
        logger.error("Anthropic streaming error: %s", exc)


def _call_llm_stream_with_messages(messages: list[dict]):
    """Stream response from LLM with fallback."""
    # Try OpenAI first if key is set
    if config.OPENAI_API_KEY:
        for token in _call_openai_stream(messages):
            yield token
        return
    # Fallback to Anthropic if key is set
    if config.ANTHROPIC_API_KEY:
        for token in _call_anthropic_stream(messages):
            yield token
        return
    # No API key
    yield "Xin lỗi, không có LLM API key configured."


def chat(request: ChatRequest) -> ChatResponse:
    """
    Full RAG pipeline:
    1. Detect intent
    2. Expand query (Milestone 3: query expansion)
    3. Retrieve relevant chunks (with larger top_k)
    4. Re-rank chunks (if enabled) to get final set
    5. Build prompt with conversation history (Milestone 4)
    6. Call LLM
    7. Return structured response
    """
    original_question = request.question.strip()
    normalized_question = _normalize_query(original_question)
    expanded_question = _expand_query(normalized_question)  # Milestone 3
    question_for_retrieval = expanded_question

    # Intent detection uses original question for accuracy
    intent = _detect_intent(original_question)

    # Extract dynamic top_k from query if present (for ranking queries)
    dynamic_top_k = _extract_top_k_from_query(original_question)

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

    # Milestone 4: session management
    session_id = request.session_id or str(uuid.uuid4())

    # apply user filters
    sources = request.filters.sources or None
    categories = request.filters.categories or None

    logger.info(
        "Chat | intent=%s | retrieval_top_k=%d | final_top_k=%d | threshold=%.2f | q=%.80s",
        intent, retrieval_top_k, final_top_k, threshold, question_for_retrieval,
    )

    # retrieve - get more chunks than needed (use expanded query)
    chunks = retrieve(
        query=question_for_retrieval,
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
                query=expanded_question,
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

    # Early exit for no chunks - Milestone 2 requirement
    if not chunks:
        source_list_with_links = []
        for feed in config.RSS_FEEDS:
            source_list_with_links.append(
                SourceInfo(
                    title="",
                    url=feed["url"].replace(".rss", ""),
                    source=feed["source"],
                    category=feed["category"],
                    published_at=None,
                    similarity=None,
                )
            )
        return ChatResponse(
            answer="Tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại. Có thể quan tâm từ các nguồn:",
            sources=source_list_with_links,
            intent=intent,
            session_id=session_id,
        )

    # Confidence guard: if top chunk similarity is too low, treat as no data
    if config.GUARD_ENABLED and chunks and 'reranker_score' in chunks[0]:
        top_sim = chunks[0].get('similarity', 0)
        if top_sim < config.GUARD_MIN_SIMILARITY:
            logger.warning(
                "Confidence guard triggered: top similarity %.3f below threshold %.3f – returning no data response",
                top_sim, config.GUARD_MIN_SIMILARITY
            )
            return ChatResponse(
                answer="Tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại. Hãy thử lại với câu hỏi khác hoặc đợi dữ liệu được cập nhật.",
                sources=[],
                intent=intent,
                session_id=session_id,
            )

    # build context
    context = _build_context(chunks, intent)

    # Milestone 4: Session management
    session_id = request.session_id or str(uuid.uuid4())
    history = _get_history(session_id)

    # Build messages with conversation history
    system_content = _MULTI_SOURCE_SYSTEM if intent == "multi_source" else _SIMPLE_SYSTEM
    user_content = (
        _MULTI_SOURCE_USER_TEMPLATE if intent == "multi_source" else _SIMPLE_USER_TEMPLATE
    ).format(chunks=context, question=original_question)

    # Add ranking instruction if query asks for top N
    if dynamic_top_k is not None:
        ranking_instruction = f"\n\nLưu ý: Người dùng yêu cầu {dynamic_top_k} sự kiện/vấn đề. Hãy trình bày danh sách xếp hạng theo thứ tự quan trọng/tính chất thời sự, mỗi mục gồm: tiêu đề, tóm tắt, và nguồn tham khảo."
        user_content += ranking_instruction

    messages = _build_messages(history, system_content, user_content)

    # call LLM
    answer = _call_llm_with_messages(messages)

    # Save turn to session history
    _save_turn(session_id, original_question, answer)

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
        session_id=session_id,
    )


def chat_stream(request: ChatRequest):
    """
    Streaming version of chat pipeline with query expansion and session history.
    Yields SSE events: {"token": "..."} and final {"done": {...}}.
    """
    original_question = request.question.strip()
    normalized_question = _normalize_query(original_question)
    expanded_question = _expand_query(normalized_question)  # Milestone 3
    question_for_retrieval = expanded_question

    # Intent detection uses original question
    intent = _detect_intent(original_question)

    # Extract dynamic top_k from query if present (for ranking queries)
    dynamic_top_k = _extract_top_k_from_query(original_question)

    # decide retrieval parameters
    if intent == "multi_source":
        retrieval_top_k = config.MULTI_RETRIEVAL_TOP_K
        default_final_top_k = config.MULTI_FINAL_TOP_K
        threshold = 0.20
    else:
        retrieval_top_k = config.SIMPLE_RETRIEVAL_TOP_K
        default_final_top_k = config.SIMPLE_FINAL_TOP_K
        threshold = 0.25

    if dynamic_top_k is not None:
        final_top_k = min(dynamic_top_k, config.MULTI_FINAL_TOP_K)
    else:
        final_top_k = default_final_top_k

    # Milestone 4: Session management (create early for early exits)
    session_id = request.session_id or str(uuid.uuid4())
    history = _get_history(session_id)

    # apply user filters
    sources = request.filters.sources or None
    categories = request.filters.categories or None

    logger.info(
        "ChatStream | intent=%s | retrieval_top_k=%d | final_top_k=%d | q=%.80s",
        intent, retrieval_top_k, final_top_k, question_for_retrieval,
    )

    try:
        # Retrieve
        chunks = retrieve(
            query=question_for_retrieval,
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
                    query=expanded_question,
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

        # Early exit for no chunks - Milestone 2 requirement
        if not chunks:
            source_list_with_links = []
            for feed in config.RSS_FEEDS:
                source_list_with_links.append(
                    {
                        "title": "",
                        "url": feed["url"].replace(".rss", ""),
                        "source": feed["source"],
                        "category": feed["category"],
                        "published_at": None,
                        "similarity": None,
                    }
                )
            token_msg = "Xin lỗi, tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại. Có thể quan tâm từ các nguồn:"
            yield f"data: {json.dumps({'token': token_msg})}\n\n"
            done_payload = {
                'answer': token_msg,
                'sources': source_list_with_links,
                'intent': intent,
                'session_id': session_id,
            }
            yield f"data: {json.dumps({'done': done_payload})}\n\n"
            return

        # Confidence guard
        if config.GUARD_ENABLED and chunks and 'reranker_score' in chunks[0]:
            top_sim = chunks[0].get('similarity', 0)
            if top_sim < config.GUARD_MIN_SIMILARITY:
                logger.warning(
                    "Confidence guard triggered (stream): top similarity %.3f below threshold",
                    top_sim
                )
                source_list_with_links = []
                for feed in config.RSS_FEEDS:
                    source_list_with_links.append(
                        {
                            "title": "",
                            "url": feed["url"].replace(".rss", ""),
                            "source": feed["source"],
                            "category": feed["category"],
                            "published_at": None,
                            "similarity": None,
                        }
                    )
                token_msg = "Xin lỗi, tôi không tìm thấy thông tin về vấn đề này trong dữ liệu hiện tại."
                yield f"data: {json.dumps({'token': token_msg})}\n\n"
                done_payload = {
                    'answer': token_msg,
                    'sources': source_list_with_links,
                    'intent': intent,
                    'session_id': session_id,
                }
                yield f"data: {json.dumps({'done': done_payload})}\n\n"
                return

        # Build context and messages
        context = _build_context(chunks, intent)
        system_content = _MULTI_SOURCE_SYSTEM if intent == "multi_source" else _SIMPLE_SYSTEM
        user_content = (
            _MULTI_SOURCE_USER_TEMPLATE if intent == "multi_source" else _SIMPLE_USER_TEMPLATE
        ).format(chunks=context, question=original_question)

        # Add ranking instruction if query asks for top N
        if dynamic_top_k is not None:
            ranking_instruction = f"\n\nLưu ý: Người dùng yêu cầu {dynamic_top_k} sự kiện/vấn đề. Hãy trình bày danh sách xếp hạng theo thứ tự quan trọng/tính chất thời sự, mỗi mục gồm: tiêu đề, tóm tắt, và nguồn tham khảo."
            user_content += ranking_instruction

        messages = _build_messages(history, system_content, user_content)

        # Stream LLM response
        full_answer_parts = []
        try:
            for token in _call_llm_stream_with_messages(messages):
                full_answer_parts.append(token)
                token_payload = {'token': token}
                yield f"data: {json.dumps(token_payload)}\n\n"
        except Exception as exc:
            logger.error("LLM streaming error: %s", exc)
            error_msg = "Xin lỗi, đã xảy ra lỗi khi tạo câu trả lời."
            full_answer_parts.append(error_msg)
            token_payload = {'token': error_msg}
            yield f"data: {json.dumps(token_payload)}\n\n"

        # Save turn to session history
        full_answer = "".join(full_answer_parts)
        _save_turn(session_id, original_question, full_answer)

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
        done_payload = {
            'answer': full_answer,
            'sources': source_list,
            'intent': intent,
            'session_id': session_id,
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
            'session_id': session_id,
        }
        yield f"data: {json.dumps({'done': done_payload})}\n\n"
