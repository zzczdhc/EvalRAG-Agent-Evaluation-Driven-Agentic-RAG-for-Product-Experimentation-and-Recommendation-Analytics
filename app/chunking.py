"""Markdown chunking and chunk-index persistence."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable

from langchain_core.documents import Document
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter


HEADER_RE = re.compile(r"^#{1,6}\s+", re.MULTILINE)
HEADER_KEYS = [f"h{level}" for level in range(1, 7)]


@dataclass(frozen=True)
class DocumentChunk:
    chunk_id: str
    source: str
    heading: str
    text: str
    section_path: list[str] = field(default_factory=list)


def _stable_chunk_id(source: str, ordinal: int) -> str:
    stem = Path(source).stem
    return f"{stem}_{ordinal:03d}"


def _default_heading(source: str) -> str:
    return Path(source).stem.replace("_", " ").title()


def load_markdown_documents(playbook_dir: Path) -> list[tuple[str, str]]:
    docs: list[tuple[str, str]] = []
    for path in sorted(playbook_dir.glob("*.md")):
        docs.append((path.name, path.read_text(encoding="utf-8")))
    return docs


def _normalize_block_text(text: str) -> str:
    return "\n\n".join(block.strip() for block in re.split(r"\n\s*\n", text.strip()) if block.strip())


def _token_count(text: str) -> int:
    return len(text.split())


def _join_heading_path(path: list[str]) -> str:
    cleaned: list[str] = []
    for part in path:
        if not part:
            continue
        if cleaned and cleaned[-1].casefold() == part.casefold():
            continue
        cleaned.append(part)
    return " > ".join(cleaned)


def _has_markdown_headers(text: str) -> bool:
    return bool(HEADER_RE.search(text))


def _split_by_headers(text: str, headers_to_split_on: list[tuple[str, str]]) -> list[Document]:
    splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=headers_to_split_on,
        strip_headers=True,
    )
    docs = splitter.split_text(text)
    return docs or [Document(page_content=text, metadata={})]


def _merge_metadata(base: dict[str, str], extra: dict[str, str]) -> dict[str, str]:
    merged = dict(base)
    merged.update({key: value for key, value in extra.items() if value})
    return merged


def _section_path_from_metadata(source: str, metadata: dict[str, str]) -> list[str]:
    path = [str(metadata[key]).strip() for key in HEADER_KEYS if metadata.get(key)]
    return path or [_default_heading(source)]


@lru_cache(maxsize=4)
def _load_semantic_embeddings(model_name: str, device: str, offline: bool):
    from langchain_huggingface import HuggingFaceEmbeddings

    model_kwargs = {"device": device}
    if offline:
        model_kwargs["local_files_only"] = True
    return HuggingFaceEmbeddings(
        model=model_name,
        model_kwargs=model_kwargs,
        encode_kwargs={
            "normalize_embeddings": True,
            "batch_size": 32,
        },
    )


def _recursive_split_documents(doc: Document, chunk_size: int, overlap: int) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        separators=["\n\n", "\n", ". ", "! ", "? ", "。", "！", "？", "; ", ", ", " ", ""],
        keep_separator=True,
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        length_function=_token_count,
    )
    pieces = splitter.split_text(doc.page_content)
    return [Document(page_content=piece, metadata=dict(doc.metadata)) for piece in pieces if piece.strip()]


def _semantic_split_documents(
    doc: Document,
    chunk_size: int,
    overlap: int,
    semantic_model: str,
    semantic_device: str,
    semantic_offline: bool,
    semantic_min_size: int,
) -> list[Document]:
    normalized = _normalize_block_text(doc.page_content)
    if not normalized:
        return []
    if _token_count(normalized) < semantic_min_size:
        return _recursive_split_documents(doc, chunk_size=chunk_size, overlap=overlap)

    try:
        from langchain_experimental.text_splitter import SemanticChunker

        embeddings = _load_semantic_embeddings(semantic_model, semantic_device, semantic_offline)
        splitter = SemanticChunker(
            embeddings=embeddings,
            breakpoint_threshold_type="percentile",
            breakpoint_threshold_amount=95,
        )
        split_docs = splitter.split_documents([Document(page_content=normalized, metadata=dict(doc.metadata))])
        if not split_docs:
            return _recursive_split_documents(doc, chunk_size=chunk_size, overlap=overlap)
    except Exception:
        return _recursive_split_documents(doc, chunk_size=chunk_size, overlap=overlap)

    output: list[Document] = []
    for split_doc in split_docs:
        split_text = _normalize_block_text(split_doc.page_content)
        if not split_text:
            continue
        recursive_doc = Document(page_content=split_text, metadata=dict(split_doc.metadata or doc.metadata))
        output.extend(_recursive_split_documents(recursive_doc, chunk_size=chunk_size, overlap=overlap))
    return output or _recursive_split_documents(doc, chunk_size=chunk_size, overlap=overlap)


def _split_overlong_markdown_doc(
    doc: Document,
    chunk_size: int,
    overlap: int,
    next_level: int = 3,
    semantic_enabled: bool = True,
    semantic_model: str = "BAAI/bge-small-en-v1.5",
    semantic_device: str = "cpu",
    semantic_offline: bool = True,
    semantic_min_size: int = 160,
) -> list[Document]:
    normalized = _normalize_block_text(doc.page_content)
    if not normalized:
        return []
    if _token_count(normalized) <= chunk_size:
        return [Document(page_content=normalized, metadata=dict(doc.metadata))]
    if next_level <= 6:
        child_docs = _split_by_headers(normalized, [("#" * next_level, f"h{next_level}")])
        can_split_further = len(child_docs) > 1 or any(f"h{next_level}" in child.metadata for child in child_docs)
        if can_split_further:
            nested: list[Document] = []
            for child in child_docs:
                child_text = _normalize_block_text(child.page_content)
                if not child_text:
                    continue
                merged = _merge_metadata(doc.metadata, child.metadata)
                nested.extend(
                    _split_overlong_markdown_doc(
                        Document(page_content=child_text, metadata=merged),
                        chunk_size=chunk_size,
                        overlap=overlap,
                        next_level=next_level + 1,
                        semantic_enabled=semantic_enabled,
                        semantic_model=semantic_model,
                        semantic_device=semantic_device,
                        semantic_offline=semantic_offline,
                        semantic_min_size=semantic_min_size,
                    )
                )
            return nested
        return _split_overlong_markdown_doc(
            doc,
            chunk_size=chunk_size,
            overlap=overlap,
            next_level=next_level + 1,
            semantic_enabled=semantic_enabled,
            semantic_model=semantic_model,
            semantic_device=semantic_device,
            semantic_offline=semantic_offline,
            semantic_min_size=semantic_min_size,
        )
    normalized_doc = Document(page_content=normalized, metadata=dict(doc.metadata))
    if semantic_enabled:
        return _semantic_split_documents(
            normalized_doc,
            chunk_size=chunk_size,
            overlap=overlap,
            semantic_model=semantic_model,
            semantic_device=semantic_device,
            semantic_offline=semantic_offline,
            semantic_min_size=semantic_min_size,
        )
    return _recursive_split_documents(normalized_doc, chunk_size, overlap)


def chunk_markdown(
    source: str,
    text: str,
    chunk_size: int = 420,
    overlap: int = 80,
    semantic_enabled: bool = True,
    semantic_model: str = "BAAI/bge-small-en-v1.5",
    semantic_device: str = "cpu",
    semantic_offline: bool = True,
    semantic_min_size: int = 160,
) -> list[DocumentChunk]:
    """Chunk markdown with header, semantic, then recursive fallback splitting."""

    normalized = _normalize_block_text(text)
    if not normalized:
        return []

    if _has_markdown_headers(text):
        root_docs = _split_by_headers(text, [("#", "h1"), ("##", "h2")])
    else:
        root_docs = [Document(page_content=normalized, metadata={})]

    split_docs: list[Document] = []
    for doc in root_docs:
        chunk_text = _normalize_block_text(doc.page_content)
        if not chunk_text:
            continue
        split_docs.extend(
            _split_overlong_markdown_doc(
                Document(page_content=chunk_text, metadata=dict(doc.metadata)),
                chunk_size=chunk_size,
                overlap=overlap,
                semantic_enabled=semantic_enabled,
                semantic_model=semantic_model,
                semantic_device=semantic_device,
                semantic_offline=semantic_offline,
                semantic_min_size=semantic_min_size,
            )
        )

    chunks: list[DocumentChunk] = []
    for ordinal, doc in enumerate(split_docs, start=1):
        section_path = _section_path_from_metadata(source, doc.metadata)
        chunks.append(
            DocumentChunk(
                chunk_id=_stable_chunk_id(source, ordinal),
                source=source,
                heading=_join_heading_path(section_path),
                text=_normalize_block_text(doc.page_content),
                section_path=section_path,
            )
        )
    return chunks


def build_chunks(
    playbook_dir: Path,
    chunk_size: int = 420,
    overlap: int = 80,
    semantic_enabled: bool = True,
    semantic_model: str = "BAAI/bge-small-en-v1.5",
    semantic_device: str = "cpu",
    semantic_offline: bool = True,
    semantic_min_size: int = 160,
) -> list[DocumentChunk]:
    chunks: list[DocumentChunk] = []
    for source, text in load_markdown_documents(playbook_dir):
        chunks.extend(
            chunk_markdown(
                source,
                text,
                chunk_size=chunk_size,
                overlap=overlap,
                semantic_enabled=semantic_enabled,
                semantic_model=semantic_model,
                semantic_device=semantic_device,
                semantic_offline=semantic_offline,
                semantic_min_size=semantic_min_size,
            )
        )
    return chunks


def save_chunks(chunks: Iterable[DocumentChunk], index_path: Path) -> None:
    index_path.parent.mkdir(parents=True, exist_ok=True)
    payload = [asdict(chunk) for chunk in chunks]
    index_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_chunks(index_path: Path) -> list[DocumentChunk]:
    payload = json.loads(index_path.read_text(encoding="utf-8"))
    return [DocumentChunk(**item) for item in payload]
