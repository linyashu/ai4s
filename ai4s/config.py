"""配置加载与校验。"""
from __future__ import annotations

import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_config(path: str | Path | None = None) -> dict:
    """加载 config.yaml，若缺省则用项目根目录默认配置。"""
    cfg_path = Path(path) if path else PROJECT_ROOT / "config.yaml"
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    if not isinstance(cfg, dict):
        raise ValueError("config.yaml 顶层必须是映射")
    return cfg


def load_env(env_path: str | Path | None = None) -> None:
    """加载 .env；env_path 为空时查找项目根目录 .env。"""
    p = Path(env_path) if env_path else PROJECT_ROOT / ".env"
    load_dotenv(p)


def llm_config() -> dict:
    """读取 LLM 相关环境变量；缺 key 时返回空 dict（调用方决定跳过摘要）。"""
    return {
        "base_url": os.getenv("LLM_BASE_URL", "").strip(),
        "api_key": os.getenv("LLM_API_KEY", "").strip(),
        "model": os.getenv("LLM_MODEL", "").strip(),
        "temperature": float(os.getenv("LLM_TEMPERATURE", "0.3")),
    }
