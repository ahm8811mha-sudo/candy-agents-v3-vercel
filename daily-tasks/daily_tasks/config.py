"""تحميل الإعدادات من ملف .env وتحضير المسارات."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
RIYADH = ZoneInfo("Asia/Riyadh")

load_dotenv(ROOT / ".env")


class ConfigError(RuntimeError):
    pass


def _required(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise ConfigError(
            f"القيمة {name} غير معبأة في ملف .env — افتح daily-tasks/.env وضع القيمة الصحيحة."
        )
    return value


def _flag(name: str, fallback: bool = False) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return fallback
    return raw in {"true", "1", "yes", "نعم"}


def _resolve_dir(value: str | None, fallback: str) -> Path:
    target = Path((value or fallback).strip())
    return target if target.is_absolute() else ROOT / target


@dataclass
class Config:
    base_url: str
    tasks_url: str
    username: str
    password: str

    mark_in_progress: bool
    in_progress_comment: str

    headless: bool
    chromium_path: str
    max_tasks: int
    batch_size: int

    output_dir: Path
    pdf_dir: Path
    state_dir: Path
    log_dir: Path
    screenshot_dir: Path

    physio_workbook: str
    gastro_workbook: str

    openai_key: str = ""
    openai_model: str = "gpt-4.1-mini"

    secrets: list[str] = field(default_factory=list)


def load_config(argv: list[str] | None = None) -> Config:
    argv = sys.argv[1:] if argv is None else argv
    live = "--live" in argv
    dry = "--dry-run" in argv

    password = _required("SYSTEM_PASSWORD")
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()

    config = Config(
        base_url=_required("SYSTEM_BASE_URL"),
        tasks_url=(os.getenv("TASKS_URL") or "").strip(),
        username=_required("SYSTEM_USERNAME"),
        password=password,
        # وضع التنفيذ الفعلي يحتاج تفعيلا صريحا: إما المتغير في .env أو الراية --live.
        # الراية --dry-run تلغي كل شيء وتفرض وضع التجربة.
        mark_in_progress=False if dry else (live or _flag("AUTO_MARK_IN_PROGRESS", False)),
        in_progress_comment=(os.getenv("IN_PROGRESS_COMMENT") or "المعاملة تحت التنفيذ").strip(),
        headless=_flag("HEADLESS", True),
        chromium_path=(os.getenv("CHROMIUM_PATH") or "").strip(),
        max_tasks=int(os.getenv("MAX_TASKS_PER_RUN") or 200),
        batch_size=max(1, int(os.getenv("BATCH_SIZE") or 25)),
        output_dir=_resolve_dir(os.getenv("OUTPUT_DIR"), "./output"),
        pdf_dir=_resolve_dir(os.getenv("PDF_DIR"), "./pdfs"),
        state_dir=ROOT / "state",
        log_dir=ROOT / "logs",
        screenshot_dir=ROOT / "screenshots",
        physio_workbook=(os.getenv("PHYSIO_WORKBOOK") or "مرضى_العلاج_الطبيعي.xlsx").strip(),
        gastro_workbook=(os.getenv("GI_WORKBOOK") or "مرضى_الجهاز_الهضمي.xlsx").strip(),
        openai_key=openai_key,
        openai_model=(os.getenv("OPENAI_DOCUMENT_MODEL") or "gpt-4.1-mini").strip(),
        secrets=[value for value in (password, openai_key) if value],
    )

    for directory in (
        config.output_dir,
        config.pdf_dir,
        config.state_dir,
        config.log_dir,
        config.screenshot_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    return config


def load_selectors() -> dict:
    return json.loads((ROOT / "config" / "selectors.json").read_text(encoding="utf-8"))


def today_key(moment: datetime | None = None) -> str:
    """تاريخ اليوم بصيغة YYYY-MM-DD بتوقيت الرياض، وهو اسم شريحة اليوم في الإكسل."""
    return (moment or datetime.now(RIYADH)).astimezone(RIYADH).strftime("%Y-%m-%d")


def now_stamp(moment: datetime | None = None) -> str:
    return (moment or datetime.now(RIYADH)).astimezone(RIYADH).strftime("%H:%M:%S")
