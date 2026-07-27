"""تحميل مرفق المعاملة واستخراج بياناته."""

from __future__ import annotations

import base64
import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urljoin

import pdfplumber

from .locate import find_first


def download_task_pdf(page, context, config, selectors, task_id, logger) -> Path | None:
    """يحمل مرفق المعاملة ويعيد مساره على القرص، أو None إذا لم يوجد مرفق."""
    found = find_first(page, selectors["taskDetail"]["pdfLink"], timeout=6000, cache_key="pdfLink")
    if not found:
        logger.warn(f"المهمة {task_id}: لا يوجد مرفق PDF ظاهر في الصفحة.")
        return None

    locator, _ = found
    safe_id = re.sub(r"[^\w؀-ۿ-]+", "_", str(task_id))
    target = config.pdf_dir / f"{safe_id}.pdf"
    config.pdf_dir.mkdir(parents=True, exist_ok=True)

    # المسار الأول: الرابط يشير مباشرة إلى الملف — نجلبه بجلسة المتصفح نفسها (مع الكوكيز).
    href = locator.get_attribute("href")
    if href and not href.startswith("javascript:") and not href.startswith("#"):
        try:
            response = context.request.get(urljoin(page.url, href))
            if response.ok:
                body = response.body()
                if body[:4] == b"%PDF":
                    target.write_bytes(body)
                    logger.info(f"المهمة {task_id}: تم تحميل المرفق ({len(body)} بايت).")
                    return target
        except Exception:
            pass

    # المسار الثاني: الضغط على الرابط يطلق تنزيلا.
    try:
        with page.expect_download(timeout=20_000) as download_info:
            locator.click()
        download_info.value.save_as(str(target))
        logger.info(f"المهمة {task_id}: تم تحميل المرفق عبر التنزيل المباشر.")
        return target
    except Exception as error:
        logger.warn(f"المهمة {task_id}: تعذر تحميل المرفق — {error}")
        return None


def extract_pdf_text(path: Path) -> str:
    """يقرأ الطبقة النصية داخل الـPDF. يعيد نصا فارغا إذا كان الملف صورة ممسوحة ضوئيا."""
    pages: list[str] = []
    with pdfplumber.open(str(path)) as document:
        for page in document.pages:
            pages.append(page.extract_text() or "")
    return re.sub(r"[ \t]+", " ", "\n".join(pages)).strip()


PROMPT = """أنت مساعد إداري في مستشفى. استخرج بيانات المعاملة الطبية من الملف المرفق وأعد JSON فقط بهذا الشكل بالضبط:
{"patientName":"","fileNumber":"","nationalIdPresent":false,"department":"","referringDoctor":"","diagnosis":"","requestType":"","senderEntity":"","documentDate":"","summary":""}
قواعد إلزامية:
- لا تستخرج ولا تعيد رقم الهوية الوطنية أو رقم الجوال أو أي بيانات دخول. إذا وجدت هوية اكتفِ بوضع nationalIdPresent=true.
- documentDate بصيغة YYYY-MM-DD إن وجد التاريخ، وإلا اتركه فارغا.
- department اكتب فيه القسم كما ورد حرفيا (مثل: العلاج الطبيعي، الجهاز الهضمي).
- summary سطر عربي واحد يلخص طلب المعاملة.
- أي حقل غير موجود اتركه نصا فارغا. لا تخمن."""


def extract_pdf_fields_with_ai(path: Path, config, logger) -> dict | None:
    """
    احتياطي للـPDF الممسوح ضوئيا: يرسل الملف إلى OpenAI Responses API لاستخراج الحقول.
    يستخدم نفس نمط التحليل المعتمد في lib/governmentRelationsV2.ts داخل المشروع.
    """
    if not config.openai_key:
        return None

    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    payload = {
        "model": config.openai_model,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_file",
                        "filename": path.name,
                        "file_data": f"data:application/pdf;base64,{encoded}",
                    },
                    {"type": "input_text", "text": PROMPT},
                ],
            }
        ],
        "temperature": 0,
    }

    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config.openai_key}",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))

        text = body.get("output_text") or "".join(
            part.get("text", "")
            for item in body.get("output", [])
            for part in item.get("content", [])
        )

        match = re.search(r"\{.*\}", text, flags=re.S)
        return json.loads(match.group(0)) if match else None
    except Exception as error:
        logger.warn(f"تحليل الـPDF بالذكاء الاصطناعي فشل: {error}")
        return None
