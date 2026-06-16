"""Unit tests for retriever module."""

from pathlib import Path

import numpy as np
import pytest
from unittest.mock import patch, MagicMock

# Add backend to path (conftest.py does this too, but keep for safety)
_backend_path = str(Path(__file__).resolve().parent.parent)
import sys
if _backend_path not in sys.path:
    sys.path.insert(0, _backend_path)

from retriever import retrieve, _embed_query


@pytest.fixture
def mock_faiss_index():
    """Mock FAISS index with test data."""
    with patch("retriever.embedder") as mock_embedder:
        # Setup mock documents and metadata
        mock_embedder._index = MagicMock()
        mock_embedder._documents = [
            "Hà Nội là thủ đô Việt Nam",
            "TP HCM là thành phố lớn nhất Việt Nam",
            "Đà Nẵng là thành phố biển",
        ]
        mock_embedder._metadatas = [
            {"title": "Ha Noi", "source": "VnExpress", "url": "http://vnexpress.com/hanoi"},
            {"title": "TPHCM", "source": "Tuoi Tre", "url": "http://tuoitre.com/tphcm"},
            {"title": "Da Nang", "source": "Thanh Nien", "url": "http://thanhnien.com/danang"},
        ]
        mock_embedder._normalize_embeddings = lambda x: x / np.linalg.norm(
            x, axis=1, keepdims=True
        )

        # Mock FAISS search to return predictable results
        def mock_search(query_normalized, k):
            # Return similarity scores (cosine similarity with normalized vectors)
            similarities = np.array([[0.8, 0.6, 0.3]], dtype=np.float32)
            indices = np.array([[0, 1, 2]], dtype=np.int64)
            return similarities, indices

        mock_embedder._index.search = mock_search

        yield mock_embedder


def test_retrieve_basic(mock_faiss_index):
    """Test basic retrieval returns expected number of chunks."""
    results = retrieve("Hà Nội", top_k=3)

    assert len(results) == 3
    assert results[0]["document"] == "Hà Nội là thủ đô Việt Nam"
    assert results[0]["similarity"] > 0.7


def test_retrieve_with_threshold(mock_faiss_index):
    """Test threshold filtering works."""
    results = retrieve("Hà Nội", top_k=3, threshold=0.7)

    assert len(results) <= 3
    for r in results:
        assert r["similarity"] >= 0.7


def test_retrieve_with_source_filter(mock_faiss_index):
    """Test source filtering."""
    results = retrieve("Hà Nội", top_k=3, sources=["VnExpress"])

    assert len(results) >= 0
    for r in results:
        assert r["metadata"]["source"] == "VnExpress"


def test_retrieve_empty_index():
    """Test handling of empty index."""
    with patch("retriever.embedder") as mock_embedder:
        mock_embedder._index = None
        mock_embedder._documents = []

        results = retrieve("test query")
        assert results == []


def test_retrieve_no_match_filter():
    """Test when filter matches no documents."""
    with patch("retriever.embedder") as mock_embedder:
        mock_embedder._index = MagicMock()
        mock_embedder._documents = ["doc1", "doc2"]
        mock_embedder._metadatas = [
            {"source": "VnExpress"},
            {"source": "Tuoi Tre"},
        ]

        results = retrieve("test", sources=["Unknown"])
        assert results == []
