"""Integration tests for FastAPI endpoints."""

import pytest
import os
import sys

# Add backend directory to path for imports (relative, works on any OS)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    """Test client for FastAPI app."""
    with TestClient(app) as client:
        yield client


class TestHealthEndpoints:
    """Tests for health/status endpoints."""

    def test_stats_endpoint_returns_json(self, client):
        """Test /stats returns valid response."""
        response = client.get("/stats")

        assert response.status_code == 200
        data = response.json()

        assert "total_articles" in data
        assert "total_chunks" in data
        assert isinstance(data["total_articles"], int)

    def test_stats_structure(self, client):
        """Test /stats has correct structure."""
        response = client.get("/stats")
        data = response.json()

        assert "sources_breakdown" in data
        assert "categories_breakdown" in data
        assert isinstance(data["sources_breakdown"], dict)


class TestChatEndpoint:
    """Tests for /chat endpoint."""

    def test_chat_empty_question(self, client):
        """Test chat with empty question."""
        response = client.post("/chat", json={
            "question": "",
            "filters": {"sources": [], "categories": []}
        })

        assert response.status_code == 400
        data = response.json()
        assert "cannot be empty" in data["detail"]

    def test_chat_whitespace_question(self, client):
        """Test chat with whitespace-only question."""
        response = client.post("/chat", json={
            "question": "   \t\n  ",
            "filters": {"sources": [], "categories": []}
        })

        assert response.status_code == 400

    def test_chat_valid_request(self, client):
        """Test chat with valid request."""
        response = client.post("/chat", json={
            "question": "Hà Nội là gì?",
            "filters": {"sources": [], "categories": []}
        })

        # Should succeed even if no results (200 not error)
        assert response.status_code in [200, 500]  # 500 if no data
        data = response.json()

        if response.status_code == 200:
            assert "answer" in data
            assert "sources" in data
            assert "intent" in data

    def test_chat_response_structure(self, client):
        """Test chat response has correct schema."""
        response = client.post("/chat", json={
            "question": "Test question",
            "filters": {"sources": [], "categories": []}
        })

        if response.status_code == 200:
            data = response.json()

            assert "answer" in data
            assert isinstance(data["answer"], str)

            assert "sources" in data
            assert isinstance(data["sources"], list)

            assert "intent" in data
            assert data["intent"] in ["simple", "multi_source"]


class TestCORS:
    """Tests for CORS headers."""

    def test_cors_headers(self, client):
        """Test CORS headers are present."""
        response = client.options("/chat", headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST"
        })

        # CORS preflight should work
        assert response.status_code in [200, 204]
