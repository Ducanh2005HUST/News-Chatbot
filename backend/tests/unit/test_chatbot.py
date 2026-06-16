"""Unit tests for chatbot module."""

from pathlib import Path

import pytest
from unittest.mock import patch, MagicMock

import sys
_backend_path = str(Path(__file__).resolve().parent.parent)
if _backend_path not in sys.path:
    sys.path.insert(0, _backend_path)

from chatbot import _detect_intent, _build_context, chat, _call_llm


class TestDetectIntent:
    """Tests for intent detection."""

    def test_simple_intent(self):
        assert _detect_intent("Hà Nội là gì") == "simple"

    def test_multi_source_intent_tong_hop(self):
        assert _detect_intent("Tổng hợp tin tức hôm nay") == "multi_source"

    def test_multi_source_intent_tom_tat(self):
        assert _detect_intent("tóm tắt tin về công nghệ") == "multi_source"

    def test_multi_source_intent_so_sanh(self):
        assert _detect_intent("so sánh báo về giá xăng") == "multi_source"

    def test_multi_source_intent_case_insensitive(self):
        assert _detect_intent("TỔNG HỢP tin tức") == "multi_source"

    def test_simple_with_keyword_not_matched(self):
        # "mới" is not in keyword list (should be "moi" exact match)
        assert _detect_intent("tin mới nhất") == "simple"


class TestBuildContext:
    """Tests for context building."""

    def test_simple_context_format(self):
        chunks = [
            {
                "document": "Hà Nội là thủ đô",
                "metadata": {
                    "source": "VnExpress",
                    "title": "Ha Noi article",
                },
            }
        ]
        result = _build_context(chunks, "simple")

        assert "VnExpress - Ha Noi article" in result
        assert "Hà Nội là thủ đô" in result

    def test_multi_source_context_grouping(self):
        chunks = [
            {
                "document": "tin 1 từ VnExpress",
                "metadata": {"source": "VnExpress", "title": "Title 1"},
            },
            {
                "document": "tin 2 từ VnExpress",
                "metadata": {"source": "VnExpress", "title": "Title 2"},
            },
            {
                "document": "tin từ Tuoi Tre",
                "metadata": {"source": "Tuoi Tre", "title": "Title 3"},
            },
        ]
        result = _build_context(chunks, "multi_source")

        assert "--- VnExpress ---" in result
        assert "--- Tuoi Tre ---" in result
        assert "tin 1 từ VnExpress" in result
        assert "tin từ Tuoi Tre" in result


class TestChat:
    """Tests for main chat function."""

    @pytest.fixture
    def mock_chat_dependencies(self):
        """Mock all dependencies of chat()."""
        with patch("chatbot.retrieve") as mock_retrieve, \
             patch("chatbot._call_llm") as mock_call_llm, \
             patch("chatbot._detect_intent") as mock_detect:

            yield {
                "retrieve": mock_retrieve,
                "call_llm": mock_call_llm,
                "detect": mock_detect,
            }

    def test_chat_no_results_returns_empty_response(self, mock_chat_dependencies):
        """Test when retrieval returns no chunks."""
        from chatbot import ChatRequest, ChatResponse

        mock_chat_dependencies["retrieve"].return_value = []
        mock_chat_dependencies["detect"].return_value = "simple"

        request = ChatRequest(question="Câu hỏi bất kỳ")
        response = chat(request)

        assert isinstance(response, ChatResponse)
        assert "không tìm thấy thông tin" in response.answer
        assert response.sources == []
        assert response.intent == "simple"

    def test_chat_with_results(self, mock_chat_dependencies):
        """Test successful chat with retrieval and LLM."""
        from chatbot import ChatRequest, ChatResponse

        chunks = [
            {
                "document": "Hà Nội là thủ đô Việt Nam",
                "metadata": {
                    "title": "Ha Noi",
                    "source": "VnExpress",
                    "url": "http://example.com/hanoi",
                    "published_at": None,
                },
                "similarity": 0.8,
            },
        ]
        mock_chat_dependencies["retrieve"].return_value = chunks
        mock_chat_dependencies["detect"].return_value = "simple"
        mock_chat_dependencies["call_llm"].return_value = "Hà Nội là thủ đô Việt Nam."

        request = ChatRequest(question="Hà Nội là gì?")
        response = chat(request)

        assert response.answer == "Hà Nội là thủ đô Việt Nam."
        assert len(response.sources) == 1
        assert response.sources[0].source == "VnExpress"
        assert response.sources[0].url == "http://example.com/hanoi"


class TestCallLLM:
    """Tests for LLM calling with fallback."""

    @patch("chatbot._call_openai")
    @patch("chatbot._call_anthropic")
    def test_openai_success(self, mock_anthropic, mock_openai):
        from chatbot import _call_llm

        mock_openai.return_value = "OpenAI answer"
        result = _call_llm("prompt")

        assert result == "OpenAI answer"
        mock_anthropic.assert_not_called()

    @patch("chatbot._call_openai")
    @patch("chatbot._call_anthropic")
    def test_openai_fails_anthropic_success(self, mock_anthropic, mock_openai):
        from chatbot import _call_llm

        mock_openai.return_value = None
        mock_anthropic.return_value = "Claude answer"
        result = _call_llm("prompt")

        assert result == "Claude answer"

    @patch("chatbot._call_openai")
    @patch("chatbot._call_anthropic")
    def test_both_fail(self, mock_anthropic, mock_openai):
        from chatbot import _call_llm

        mock_openai.return_value = None
        mock_anthropic.return_value = None
        result = _call_llm("prompt")

        assert "Xin lỗi" in result
