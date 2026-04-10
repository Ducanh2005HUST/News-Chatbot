from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

class Article(BaseModel):
    title: str
    content: str
    url: str
    source: str
    category: str
    published_at: Optional[datetime] = None
    crawled_at: datetime = Field(default_factory=datetime.utcnow)

class ChatFilters(BaseModel):
    sources: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)

class ChatRequest(BaseModel):
    question: str
    filters: ChatFilters = Field(default_factory=ChatFilters)

class SourceInfo(BaseModel):
    title: str
    url: str
    source: str
    category: str
    published_at: Optional[str] = None
    similarity: Optional[float] = None

class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceInfo] = Field(default_factory=list)
    intent: str = "simple"          # "simple" | "multi_source"

class StatsResponse(BaseModel):
    total_articles: int = 0
    total_chunks: int = 0
    last_crawled_at: Optional[str] = None
    sources_breakdown: dict[str, int] = Field(default_factory=dict)
    categories_breakdown: dict[str, int] = Field(default_factory=dict)
