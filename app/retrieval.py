"""Dependency-light retrieval over pre-built chunks."""

from __future__ import annotations

import hashlib
import math
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from typing import Iterable

from app.chunking import DocumentChunk


TOKEN_RE = re.compile(r"[a-z0-9]+(?:[._-][a-z0-9]+)?")


@dataclass(frozen=True)
class RetrievalResult:
    chunk_id: str
    source: str
    heading: str
    text: str
    score: float
    bm25_score: float
    vector_score: float
    rank: int


def tokenize(text: str) -> list[str]:
    """Normalize text into retrieval tokens."""

    return TOKEN_RE.findall(text.lower())


def _hash_token(token: str, dimensions: int) -> tuple[int, float]:
    digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
    raw = int.from_bytes(digest, "big")
    return raw % dimensions, 1.0 if raw & 1 else -1.0


def _hashed_vector(tokens: Iterable[str], dimensions: int = 256) -> dict[int, float]:
    vector: dict[int, float] = defaultdict(float)
    for token in tokens:
        index, sign = _hash_token(token, dimensions)
        vector[index] += sign
    norm = math.sqrt(sum(value * value for value in vector.values()))
    if norm == 0:
        return {}
    return {index: value / norm for index, value in vector.items()}


def _dot(left: dict[int, float], right: dict[int, float]) -> float:
    if len(left) > len(right):
        left, right = right, left
    return sum(value * right.get(index, 0.0) for index, value in left.items())


class SimpleHybridRetriever:
    """BM25 plus hashed-vector retrieval over playbook chunks."""

    def __init__(self, chunks: list[DocumentChunk], alpha: float = 0.65) -> None:
        if not chunks:
            raise ValueError("Retriever needs at least one document chunk.")
        self.chunks = chunks
        self.alpha = alpha
        self._tokens = [tokenize(f"{chunk.heading} {chunk.text}") for chunk in chunks]
        self._term_counts = [Counter(tokens) for tokens in self._tokens]
        self._doc_lengths = [len(tokens) for tokens in self._tokens]
        self._avg_doc_length = sum(self._doc_lengths) / len(self._doc_lengths)
        self._idf = self._build_idf()
        self._vectors = [_hashed_vector(tokens) for tokens in self._tokens]

    def _build_idf(self) -> dict[str, float]:
        document_frequency: Counter[str] = Counter()
        for terms in self._term_counts:
            document_frequency.update(terms.keys())
        total_docs = len(self._term_counts)
        return {
            term: math.log(1 + (total_docs - df + 0.5) / (df + 0.5))
            for term, df in document_frequency.items()
        }

    def _bm25_scores(self, query_tokens: list[str]) -> list[float]:
        k1 = 1.5
        b = 0.75
        query_terms = Counter(query_tokens)
        scores: list[float] = []
        for counts, doc_length in zip(self._term_counts, self._doc_lengths, strict=True):
            score = 0.0
            for term, query_tf in query_terms.items():
                tf = counts.get(term, 0)
                if tf == 0:
                    continue
                idf = self._idf.get(term, 0.0)
                denom = tf + k1 * (1 - b + b * doc_length / self._avg_doc_length)
                score += query_tf * idf * (tf * (k1 + 1)) / denom
            scores.append(score)
        return scores

    def search(
        self,
        query: str,
        top_k: int = 5,
        alpha: float | None = None,
        source_filter: list[str] | None = None,
    ) -> list[RetrievalResult]:
        query_tokens = tokenize(query)
        query_vector = _hashed_vector(query_tokens)
        bm25_scores = self._bm25_scores(query_tokens)
        vector_scores = [max(0.0, _dot(query_vector, vector)) for vector in self._vectors]
        max_bm25 = max(bm25_scores) or 1.0
        max_vector = max(vector_scores) or 1.0
        weight = self.alpha if alpha is None else alpha

        allowed_sources = set(source_filter or [])
        scored: list[tuple[float, float, float, int]] = []
        for index, (bm25_score, vector_score) in enumerate(zip(bm25_scores, vector_scores, strict=True)):
            if allowed_sources and self.chunks[index].source not in allowed_sources:
                continue
            bm25_norm = bm25_score / max_bm25 if max_bm25 else 0.0
            vector_norm = vector_score / max_vector if max_vector else 0.0
            final_score = weight * vector_norm + (1 - weight) * bm25_norm
            scored.append((final_score, bm25_score, vector_score, index))

        scored.sort(key=lambda item: item[0], reverse=True)
        selected: list[tuple[float, float, float, int]] = []
        seen_sources: set[str] = set()
        for item in scored:
            source = self.chunks[item[3]].source
            if source in seen_sources:
                continue
            selected.append(item)
            seen_sources.add(source)
            if len(selected) == top_k:
                break
        if len(selected) < top_k:
            selected_indices = {item[3] for item in selected}
            for item in scored:
                if item[3] in selected_indices:
                    continue
                selected.append(item)
                if len(selected) == top_k:
                    break

        results: list[RetrievalResult] = []
        for rank, (score, bm25_score, vector_score, index) in enumerate(selected, start=1):
            chunk = self.chunks[index]
            results.append(
                RetrievalResult(
                    chunk_id=chunk.chunk_id,
                    source=chunk.source,
                    heading=chunk.heading,
                    text=chunk.text,
                    score=round(score, 6),
                    bm25_score=round(bm25_score, 6),
                    vector_score=round(vector_score, 6),
                    rank=rank,
                )
            )
        return results


def results_to_dicts(results: Iterable[RetrievalResult]) -> list[dict[str, object]]:
    return [asdict(result) for result in results]
