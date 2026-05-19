"""Project configuration helpers."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
PLAYBOOK_DIR = DATA_DIR / "playbook"
INDEX_DIR = DATA_DIR / "index"
DEFAULT_INDEX_PATH = INDEX_DIR / "chunks.json"
LOG_DIR = PROJECT_ROOT / "logs"
DEFAULT_LOG_PATH = LOG_DIR / "rag_logs.jsonl"


def _load_local_env(path: Path) -> None:
    """Load simple KEY=VALUE pairs from a local .env file without overriding shell env."""

    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_local_env(PROJECT_ROOT / ".env")


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _default_llm_api_key() -> str:
    return os.getenv("EVALRAG_LLM_API_KEY") or os.getenv("OPENAI_API_KEY") or ""


def _default_fallback_llm_api_key() -> str:
    return os.getenv("EVALRAG_FALLBACK_LLM_API_KEY") or "ollama"


def _default_concept_judge_api_key() -> str:
    return os.getenv("EVALRAG_CONCEPT_JUDGE_API_KEY") or _default_llm_api_key()


@dataclass(frozen=True)
class Settings:
    """Runtime settings with environment-variable overrides."""

    generator_backend: str = os.getenv("EVALRAG_GENERATOR", "openai_compatible").strip().lower()
    llm_base_url: str = os.getenv("EVALRAG_LLM_BASE_URL", "https://api.openai.com/v1")
    llm_model: str = os.getenv("EVALRAG_LLM_MODEL", "gpt-5.4-mini")
    llm_api_key: str = _default_llm_api_key()
    llm_temperature: float = float(os.getenv("EVALRAG_LLM_TEMPERATURE", "0.2"))
    llm_max_tokens: int = int(os.getenv("EVALRAG_LLM_MAX_TOKENS", "1400"))
    llm_token_parameter: str = os.getenv("EVALRAG_LLM_TOKEN_PARAMETER", "max_completion_tokens")
    llm_timeout_seconds: float = float(os.getenv("EVALRAG_LLM_TIMEOUT_SECONDS", "90"))
    llm_fallback_enabled: bool = _env_bool("EVALRAG_LLM_FALLBACK_ENABLED", True)
    fallback_llm_base_url: str = os.getenv("EVALRAG_FALLBACK_LLM_BASE_URL", "http://localhost:11434/v1")
    fallback_llm_model: str = os.getenv("EVALRAG_FALLBACK_LLM_MODEL", "qwen3:8b")
    fallback_llm_api_key: str = _default_fallback_llm_api_key()
    fallback_llm_temperature: float = float(os.getenv("EVALRAG_FALLBACK_LLM_TEMPERATURE", "0.2"))
    fallback_llm_max_tokens: int = int(os.getenv("EVALRAG_FALLBACK_LLM_MAX_TOKENS", "1400"))
    fallback_llm_token_parameter: str = os.getenv("EVALRAG_FALLBACK_LLM_TOKEN_PARAMETER", "max_tokens")
    fallback_llm_timeout_seconds: float = float(os.getenv("EVALRAG_FALLBACK_LLM_TIMEOUT_SECONDS", "120"))
    top_k: int = int(os.getenv("EVALRAG_TOP_K", "5"))
    chunk_size: int = int(os.getenv("EVALRAG_CHUNK_SIZE", "420"))
    chunk_overlap: int = int(os.getenv("EVALRAG_CHUNK_OVERLAP", "80"))
    chunk_semantic_enable: bool = _env_bool("EVALRAG_CHUNK_SEMANTIC_ENABLE", False)
    chunk_semantic_model: str = os.getenv("EVALRAG_CHUNK_SEMANTIC_MODEL", "BAAI/bge-small-en-v1.5")
    chunk_semantic_device: str = os.getenv("EVALRAG_CHUNK_SEMANTIC_DEVICE", "cpu")
    chunk_semantic_offline: bool = _env_bool("EVALRAG_CHUNK_SEMANTIC_OFFLINE", True)
    chunk_semantic_min_size: int = int(os.getenv("EVALRAG_CHUNK_SEMANTIC_MIN_SIZE", "160"))
    hybrid_alpha: float = float(os.getenv("EVALRAG_HYBRID_ALPHA", "0.35"))
    concept_coverage_failure_threshold: float = float(os.getenv("EVALRAG_CONCEPT_FAILURE_THRESHOLD", "0.8"))
    concept_judge_enabled: bool = _env_bool("EVALRAG_CONCEPT_JUDGE_ENABLED", False)
    concept_judge_base_url: str = os.getenv("EVALRAG_CONCEPT_JUDGE_BASE_URL", os.getenv("EVALRAG_LLM_BASE_URL", "https://api.openai.com/v1"))
    concept_judge_model: str = os.getenv("EVALRAG_CONCEPT_JUDGE_MODEL", os.getenv("EVALRAG_LLM_MODEL", "gpt-5.4-mini"))
    concept_judge_api_key: str = _default_concept_judge_api_key()
    concept_judge_temperature: float = float(os.getenv("EVALRAG_CONCEPT_JUDGE_TEMPERATURE", "0"))
    concept_judge_max_tokens: int = int(os.getenv("EVALRAG_CONCEPT_JUDGE_MAX_TOKENS", "700"))
    concept_judge_token_parameter: str = os.getenv("EVALRAG_CONCEPT_JUDGE_TOKEN_PARAMETER", os.getenv("EVALRAG_LLM_TOKEN_PARAMETER", "max_completion_tokens"))
    concept_judge_timeout_seconds: float = float(os.getenv("EVALRAG_CONCEPT_JUDGE_TIMEOUT_SECONDS", "90"))
    concept_judge_min_confidence: float = float(os.getenv("EVALRAG_CONCEPT_JUDGE_MIN_CONFIDENCE", "0.8"))
    log_path: Path = Path(os.getenv("EVALRAG_LOG_PATH", DEFAULT_LOG_PATH))
    index_path: Path = Path(os.getenv("EVALRAG_INDEX_PATH", DEFAULT_INDEX_PATH))


settings = Settings()
