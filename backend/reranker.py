"""
Re-ranker module using cross-encoder for improved retrieval quality.
Uses sentence-transformers cross-encoder models to re-score retrieved chunks.
"""

import logging
import numpy as np
from typing import Optional

logger = logging.getLogger("reranker")

# Global model instance (lazy loaded)
_model = None
_model_name = "cross-encoder/ms-marco-MiniLM-L-6-v2"  # Good general-purpose cross-encoder

def _load_model():
    """Load cross-encoder model on first use."""
    global _model
    if _model is not None:
        return _model

    try:
        from sentence_transformers import CrossEncoder
        logger.info(f"Loading re-ranker model: {_model_name}")
        _model = CrossEncoder(_model_name)
        logger.info("Re-ranker model loaded successfully")
        return _model
    except ImportError:
        logger.error("sentence-transformers not installed. Run: pip install sentence-transformers")
        raise
    except Exception as exc:
        logger.error(f"Failed to load re-ranker model: {exc}")
        raise


def rerank_chunks(
    query: str,
    chunks: list[dict],
    top_k: int = 8,
    threshold: float = 0.0,
) -> list[dict]:
    """
    Re-rank retrieved chunks using cross-encoder.

    Args:
        query: User query
        chunks: List of chunks from initial retrieval (each has 'document' and 'metadata')
        top_k: Number of top chunks to return after reranking
        threshold: Score threshold (0-1 for normalized cross-encoder scores)

    Returns:
        Re-ranked list of chunks with updated similarity scores
    """
    if not chunks:
        return []

    try:
        model = _load_model()
    except Exception:
        logger.warning("Re-ranker unavailable, returning original chunks")
        return chunks[:top_k]

    # Prepare query-passage pairs
    pairs = [(query, chunk["document"]) for chunk in chunks]

    # Predict scores
    try:
        scores = model.predict(pairs)
    except Exception as exc:
        logger.error(f"Re-ranker prediction failed: {exc}")
        return chunks[:top_k]

    # Normalize scores to [0,1] if they're not already (some models output unbounded scores)
    # Cross-encoder scores are typically in [0,1] but can be unbounded
    import numpy as np
    if scores.max() > 1.0 or scores.min() < 0.0:
        # Min-max normalize to [0,1]
        score_min = scores.min()
        score_max = scores.max()
        if score_max > score_min:
            scores = (scores - score_min) / (score_max - score_min)
        else:
            scores = np.zeros_like(scores) if scores.max() <= 0 else np.ones_like(scores)

    # Attach scores to chunks and sort
    scored_chunks = []
    for chunk, score in zip(chunks, scores):
        similarity = float(score)
        if similarity >= threshold:
            scored_chunks.append({
                **chunk,
                "similarity": round(similarity, 4),
                "reranker_score": True,  # mark that this was re-ranked
            })

    # Sort by similarity descending
    scored_chunks.sort(key=lambda x: x["similarity"], reverse=True)

    # Take top_k
    result = scored_chunks[:top_k]

    logger.info(
        "Re-ranker: scored %d chunks, %d above threshold %.2f, returning top %d",
        len(chunks),
        len(scored_chunks),
        threshold,
        len(result),
    )

    return result
