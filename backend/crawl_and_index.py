#!/usr/bin/env python3
"""
Crawl RSS feeds and embed articles to populate FAISS index.

Usage:
    python crawl_and_index.py

This will:
1. Fetch all configured RSS feeds
2. Extract article content with BeautifulSoup
3. Generate embeddings with OpenAI
4. Store in FAISS index

Note: Requires OPENAI_API_KEY in environment.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from main import _crawl_and_embed
import config
import logging

logging.basicConfig(
    level=logging.INFO,
    format=config.LOG_FORMAT,
    datefmt=config.LOG_DATE_FORMAT,
)

if __name__ == "__main__":
    print("="*60)
    print("Crawling RSS feeds and indexing articles...")
    print("="*60)

    try:
        _crawl_and_embed()
        print("\n✅ Crawl + embed cycle complete!")
        print("\nCheck backend logs for details.")
        print("Run: python -c \"from faiss_embedder import get_stats; import json; print(json.dumps(get_stats(), indent=2))\"")
    except Exception as e:
        print(f"\n❌ Failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
