"""سجل التشغيل، مع حجب كلمة المرور والمفاتيح."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

SECRET_KEYS = ("password", "SYSTEM_PASSWORD", "OPENAI_API_KEY")


class Logger:
    def __init__(self, log_dir: Path, secrets: list[str] | None = None) -> None:
        log_dir.mkdir(parents=True, exist_ok=True)
        self.file = log_dir / f"run-{datetime.now().strftime('%Y-%m-%d')}.log"
        self._secrets = [secret for secret in (secrets or []) if secret and len(secret) > 3]

    def _redact(self, message: str) -> str:
        """يمنع ظهور كلمة المرور في السجل حتى لو مررت بالخطأ داخل نص خطأ."""
        text = str(message)
        for secret in self._secrets:
            text = text.replace(secret, "***")
        for key in SECRET_KEYS:
            text = re.sub(rf"({key}\s*[=:]\s*)\S+", r"\1***", text, flags=re.IGNORECASE)
        return text

    def _write(self, level: str, message: str) -> None:
        stamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        line = f"[{stamp}] {level} {self._redact(message)}"
        print(line, flush=True)
        with self.file.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")

    def info(self, message: str) -> None:
        self._write("INFO ", message)

    def warn(self, message: str) -> None:
        self._write("WARN ", message)

    def error(self, message: str) -> None:
        self._write("ERROR", message)

    def step(self, message: str) -> None:
        self._write("STEP ", message)
