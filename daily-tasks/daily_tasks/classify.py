"""تصنيف المعاملة: علاج طبيعي أم جهاز هضمي."""

from __future__ import annotations

PHYSIO = "PHYSIO"
GASTRO = "GASTRO"
UNKNOWN = "UNKNOWN"


def classify(record: dict, raw_text: str, keywords: dict) -> dict:
    """
    يقرر إلى أي ملف إكسل تذهب المعاملة.
    يرجح القسم المذكور في المعاملة على بقية النص، لأن كلمة مثل "المعدة"
    قد ترد عرضا في تشخيص مريض علاج طبيعي.
    """
    weighted = (
        (record.get("department"), 3),
        (record.get("requestType"), 2),
        (record.get("diagnosis"), 2),
        (raw_text, 1),
    )

    physio_score = 0
    gastro_score = 0
    hits: list[str] = []

    for text, weight in weighted:
        haystack = str(text or "").lower()
        if not haystack:
            continue

        for word in keywords["physiotherapy"]:
            if str(word).lower() in haystack:
                physio_score += weight
                hits.append(word)

        for word in keywords["gastro"]:
            if str(word).lower() in haystack:
                gastro_score += weight
                hits.append(word)

    if physio_score == gastro_score:
        return {"category": UNKNOWN, "physioScore": physio_score, "gastroScore": gastro_score, "hits": []}

    return {
        "category": PHYSIO if physio_score > gastro_score else GASTRO,
        "physioScore": physio_score,
        "gastroScore": gastro_score,
        "hits": list(dict.fromkeys(hits)),
    }


def category_label(category: str) -> str:
    if category == PHYSIO:
        return "العلاج الطبيعي"
    if category == GASTRO:
        return "الجهاز الهضمي"
    return "غير مصنف"
