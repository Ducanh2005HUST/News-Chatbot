from __future__ import annotations

import logging
from typing import Optional

import numpy as np

import config
import faiss_embedder as embedder

logger = logging.getLogger("retriever")


def _embed_query(text: str) -> list[float]:
    """Get embedding vector for a single query string."""
    import os
    # Clear SSL_CERT_FILE if it points to non-existent file
    ssl_cert = os.environ.get("SSL_CERT_FILE")
    if ssl_cert and not os.path.exists(ssl_cert):
        del os.environ["SSL_CERT_FILE"]

    # Import OpenAI only when needed
    from openai import OpenAI
    client = OpenAI(api_key=config.OPENAI_API_KEY)
    response = client.embeddings.create(
        model=config.EMBEDDING_MODEL,
        input=[text],
    )
    return response.data[0].embedding


def retrieve(
    query: str,
    top_k: int = config.SIMPLE_TOP_K,
    sources: list[str] | None = None,
    categories: list[str] | None = None,
    threshold: float = 0.0,
) -> list[dict]:
    """Retrieve relevant documents from FAISS index."""
    # Ensure index is initialized and loaded
    embedder.init_index()
    _index = embedder._index
    _documents = embedder._documents
    _metadatas = embedder._metadatas
    _normalize_embeddings = embedder._normalize_embeddings

    logger.info("Retriever called: _index=%s, _documents count=%d", _index is not None, len(_documents))

    if _index is None or len(_documents) == 0:
        logger.warning("FAISS index is empty – nothing to retrieve")
        logger.warning("_index is None: %s", _index is None)
        logger.warning("len(_documents): %d", len(_documents))
        return []

    count = len(_documents)
    logger.info("FAISS index has %d documents, querying top %d ...", count, top_k)

    # Filter by sources/categories if specified
    filtered_indices = list(range(count))
    if sources or categories:
        filtered_indices = []
        for i, meta in enumerate(_metadatas):
            match = True
            if sources and meta.get("source") not in sources:
                match = False
            if categories and meta.get("category") not in categories:
                match = False
            if match:
                filtered_indices.append(i)

        if len(filtered_indices) == 0:
            logger.warning("No documents match the filter criteria")
            return []

        logger.info("After filtering: %d documents match", len(filtered_indices))

    # Embed query
    query_embedding = np.array(_embed_query(query), dtype=np.float32).reshape(1, -1)
    query_normalized = _normalize_embeddings(query_embedding)

    # Search in FAISS
    try:
        if len(filtered_indices) < count:
            # Search subset: compute cosine similarity by brute-force dot product
            # against the filtered embeddings
            subset_embeddings = np.array(
                [_index.reconstruct(i) for i in filtered_indices], dtype=np.float32
            )  # shape: (n_filtered, dim)

            # query_normalized: (1, dim) → dot product → (n_filtered,)
            sims = (subset_embeddings @ query_normalized.T).flatten()  # cosine sim

            # Take top_k by similarity (descending)
            k = min(top_k, len(filtered_indices))
            top_local = np.argsort(sims)[::-1][:k]
            original_indices = [filtered_indices[j] for j in top_local]
            distances = sims[top_local]
        else:
            # Search entire index
            distances, indices = _index.search(
                query_normalized, min(top_k, count)
            )
            original_indices = indices[0]
            distances = distances[0]
    except Exception as exc:
        logger.error("FAISS search failed: %s", exc)
        return []

    logger.info(
        "Raw distances (top %d): %s",
        len(distances),
        [round(float(d), 4) for d in distances[:5]],
    )

    # Convert distances to similarities (FAISS IP with normalized vectors = cosine similarity)
    chunks: list[dict] = []
    for idx, dist in zip(original_indices, distances):
        similarity = float(dist)  # Already cosine similarity with normalized vectors
        if similarity < threshold:
            continue
        chunks.append(
            {
                "document": _documents[idx],
                "metadata": _metadatas[idx],
                "distance": 1.0 - similarity,  # Convert back to distance for consistency
                "similarity": round(similarity, 4),
            }
        )

    logger.info(
        "Retrieved %d chunks (of %d) above threshold %.2f for query: %.60s...",
        len(chunks),
        len(original_indices),
        threshold,
        query,
    )

    return chunks