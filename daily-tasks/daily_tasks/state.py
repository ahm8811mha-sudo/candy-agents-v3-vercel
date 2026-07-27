"""
سجل المهام المعالجة سابقا. الغرض منه أن إعادة تشغيل السكربت في نفس اليوم
لا تكرر الصفوف في الإكسل ولا تعيد الضغط على "تحت التنفيذ" لمعاملة نفذت.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


class State:
    def __init__(self, state_dir: Path) -> None:
        self.file = state_dir / "processed.json"
        self.processed: dict[str, dict] = {}

        if self.file.exists():
            try:
                self.processed = json.loads(self.file.read_text(encoding="utf-8")).get("processed", {})
            except (json.JSONDecodeError, OSError):
                self.processed = {}

    def is_processed(self, task_number) -> bool:
        return str(task_number) in self.processed

    def mark_processed(self, task_number, **details) -> None:
        self.processed[str(task_number)] = {
            **details,
            "at": datetime.now(timezone.utc).isoformat(),
        }

    def save(self) -> None:
        self.file.parent.mkdir(parents=True, exist_ok=True)
        self.file.write_text(
            json.dumps({"processed": self.processed}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
