"""FastAPI application for EvalRAG Agent."""

from __future__ import annotations

import asyncio
import json
from functools import lru_cache

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from app.rag_pipeline import EvalRAGPipeline, record_to_public_response
from app.schemas import AnalyzeResponse, AskRequest, AskResponse


app = FastAPI(
    title="EvalRAG Agent",
    description="Evaluation-driven agentic RAG for product experimentation analytics.",
    version="0.1.0",
)

MAX_UPLOAD_BYTES = 5 * 1024 * 1024


@lru_cache(maxsize=1)
def get_pipeline() -> EvalRAGPipeline:
    """Reuse the immutable index/retriever instead of rebuilding it per request."""

    return EvalRAGPipeline()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest) -> dict[str, object]:
    if not request.selected_corpus_ids:
        raise HTTPException(status_code=400, detail="Select at least one retrieval scope.")
    pipeline = EvalRAGPipeline(top_k=request.top_k) if request.top_k else get_pipeline()
    try:
        record = pipeline.answer(
            request.question,
            selected_corpus_ids=request.selected_corpus_ids,
            expected_sources=request.expected_sources,
            expected_concepts=request.expected_concepts,
            expected_decision=request.expected_decision,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return record_to_public_response(record)


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    question: str = Form(...),
    file: UploadFile = File(...),
    selected_corpus_ids: str = Form("[]"),
) -> dict[str, object]:
    if len(question.strip()) < 3:
        raise HTTPException(status_code=400, detail="Enter a specific experiment question.")
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv experiment files are supported.")
    allowed_content_types = {
        None,
        "",
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "text/plain",
        "application/octet-stream",
    }
    if file.content_type not in allowed_content_types:
        raise HTTPException(status_code=400, detail="The uploaded file must be CSV content.")
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="CSV exceeds the 5 MB upload limit.")
    try:
        csv_text = contents.decode("utf-8")
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.") from error
    try:
        corpus_ids = json.loads(selected_corpus_ids)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail="Retrieval scope must be a JSON list.") from error
    if not isinstance(corpus_ids, list) or not corpus_ids or not all(isinstance(item, str) for item in corpus_ids):
        raise HTTPException(status_code=400, detail="Select at least one valid retrieval scope.")
    pipeline = get_pipeline()
    try:
        record = await asyncio.to_thread(
            pipeline.answer,
            question,
            csv_text=csv_text,
            selected_corpus_ids=corpus_ids,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    response = record_to_public_response(record)
    response["tool_summary"] = record.get("tool_summary", {})
    return response
