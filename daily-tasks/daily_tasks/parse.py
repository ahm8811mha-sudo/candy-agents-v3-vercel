"""استخراج حقول المعاملة من عنوان المهمة ومن نص الـPDF."""

from __future__ import annotations

import re

ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
EXTENDED_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
_DIGIT_MAP = {ord(char): str(index) for index, char in enumerate(ARABIC_DIGITS)}
_DIGIT_MAP.update({ord(char): str(index) for index, char in enumerate(EXTENDED_DIGITS)})

# علامات اتجاه النص التي تلتصق بالنص العربي المنسوخ من الصفحات
_BIDI_MARKS = re.compile(r"[‎‏‪-‮⁦-⁩]")

ARABIC_MONTHS = {
    "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "ابريل": 4, "مايو": 5,
    "يونيو": 6, "يونيه": 6, "يوليو": 7, "يوليه": 7, "أغسطس": 8, "اغسطس": 8,
    "سبتمبر": 9, "أكتوبر": 10, "اكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12,
}


def normalize_digits(value) -> str:
    return str(value or "").translate(_DIGIT_MAP)


def clean(value) -> str:
    return re.sub(r"\s+", " ", _BIDI_MARKS.sub("", str(value or ""))).strip()


def parse_task_title(title: str) -> dict:
    """
    عنوان المهمة في نظام متابعة المهام يحمل البيانات مفصولة بشرطات:
        نوع الطلب - اسم المريض - رقم الملف - الطبيب - القسم
    وأحيانا بلا اسم طبيب:
        نوع الطلب - اسم المريض - رقم الملف - القسم
    لذلك نعتمد على موقع الجزء الرقمي بدل عد الأجزاء، فيصح الشكلان.
    """
    parts = [clean(part) for part in re.split(r"\s+[-–—]\s+", clean(title))]
    parts = [part for part in parts if part]

    if len(parts) < 3:
        return {}

    file_index = next(
        (
            index
            for index, part in enumerate(parts)
            if index > 0 and re.fullmatch(r"\d{4,12}", normalize_digits(part))
        ),
        -1,
    )
    if file_index < 1:
        return {"requestType": parts[0], "department": parts[-1]}

    tail = parts[file_index + 1:]

    return {
        "requestType": " - ".join(parts[: file_index - 1]),
        "patientName": parts[file_index - 1],
        "fileNumber": normalize_digits(parts[file_index]),
        # ما بين رقم الملف والقسم هو اسم الطبيب، والقسم دائما الجزء الأخير.
        "doctor": " - ".join(tail[:-1]) if len(tail) > 1 else "",
        "department": tail[-1] if tail else "",
    }


def parse_task_number(text: str) -> str:
    """«الرقم: 144800006202» → «144800006202»"""
    normalized = normalize_digits(clean(text))
    labelled = re.search(r"(?:الرقم|رقم المهمة|رقم المعاملة)\s*[:：]?\s*(\d{6,20})", normalized)
    if labelled:
        return labelled.group(1)
    loose = re.search(r"\b(\d{10,20})\b", normalized)
    return loose.group(1) if loose else ""


def parse_sender(text: str) -> str:
    """«من: Munirah Aldosari إلى: أحمد ناصر فهد الأحمد» → «Munirah Aldosari»"""
    match = re.search(r"من\s*[:：]\s*(.+?)\s*(?:إلى\s*[:：]|الرقم\s*[:：]|$)", clean(text))
    return clean(match.group(1))[:80] if match else ""


def parse_arabic_date(text: str) -> str:
    """«05 صفر 1448 الموافق 19 يوليو 2026» → «2026-07-19» (نأخذ الميلادي بعد "الموافق")."""
    normalized = normalize_digits(clean(text))
    after = normalized.split("الموافق")[-1] if "الموافق" in normalized else normalized

    match = re.search(r"(\d{1,2})\s+([؀-ۿ]+)\s+(\d{4})", after)
    if match and match.group(2) in ARABIC_MONTHS:
        return f"{match.group(3)}-{ARABIC_MONTHS[match.group(2)]:02d}-{int(match.group(1)):02d}"

    return normalize_date(after)


# المسميات التي توقف القيمة. تشمل الإنجليزية لأن كثيرا من ملفات الـPDF
# تستخرج كسطر واحد طويل، فبدونها تبتلع القيمة بقية الحقول.
STOP_LABELS = [
    "اسم المريض", "المريض", "رقم الملف", "الملف الطبي", "السجل الطبي", "رقم السجل",
    "رقم المعاملة", "رقم المهمة", "رقم الطلب", "القسم", "العيادة", "الوحدة", "التخصص",
    "التشخيص", "الحالة", "الطبيب", "الطبيب المعالج", "الطبيب المحول",
    "الجهة", "الجهة المرسلة", "المستشفى", "المركز",
    "التاريخ", "تاريخ", "نوع الطلب", "الموضوع", "الملاحظات", "العمر", "الجنس",
    "Patient Name", "Patient", "File No", "File Number", "MRN", "Medical Record",
    "Task No", "Request No", "Request Type", "Department", "Clinic", "Unit",
    "Diagnosis", "Doctor", "Physician", "Subject", "Notes", "Date", "Age", "Gender", "From",
]

# الأطول أولا، حتى لا يقطع "Patient" ما يخص "Patient Name".
_STOP_PATTERN = "|".join(re.escape(label) for label in sorted(STOP_LABELS, key=len, reverse=True))


def _label_value(text: str, labels: list[str]) -> str:
    """
    يبحث عن «المسمى : القيمة» ويقف عند نهاية السطر أو عند بداية مسمى آخر،
    حتى لا تبتلع القيمة بقية الصفحة عندما يكون الـPDF مستخرجا كسطر واحد طويل.
    """
    for label in labels:
        pattern = (
            rf"{re.escape(label)}\s*[:：\-]?\s*(.{{1,120}}?)"
            rf"(?=\s*(?:{_STOP_PATTERN})\s*[:：]|\n|$)"
        )
        match = re.search(pattern, text, flags=re.S)
        value = clean(match.group(1)) if match else ""
        if len(value) > 1:
            return value
    return ""


def _first_token(value: str) -> str:
    """أرقام الملفات والمعاملات كلمة واحدة — نأخذ أول رمز فقط ونهمل ما بعده."""
    normalized = normalize_digits(clean(value))
    if not normalized:
        return ""
    match = re.search(r"[^\W_][\w/-]*", normalized, flags=re.UNICODE)
    return match.group(0) if match else normalized


def _first_match(text: str, patterns: list[str]) -> str:
    for pattern in patterns:
        match = re.search(pattern, text)
        if match and match.group(1):
            return clean(match.group(1))
    return ""


def parse_pdf_fields(raw_text: str) -> dict:
    text = normalize_digits(re.sub(r" (?=[:：])", "", clean(raw_text)))
    if not text:
        return {}

    patient_name = _label_value(text, ["اسم المريض", "أسم المريض", "المريض", "Patient Name", "Patient"])
    file_number = _label_value(
        text,
        ["رقم الملف", "رقم الملف الطبي", "الملف الطبي", "رقم السجل الطبي", "السجل الطبي", "File No", "MRN"],
    ) or _first_match(text, [r"\bMRN\s*[:：]?\s*(\d{4,12})"])

    task_number = _label_value(text, ["رقم المعاملة", "رقم المهمة", "رقم الطلب", "رقم الصادر", "Task No", "Request No"])
    department = _label_value(text, ["القسم", "العيادة", "الوحدة", "التخصص", "Department", "Clinic"])
    doctor = _label_value(text, ["الطبيب المحول", "الطبيب المعالج", "الطبيب", "Doctor", "Physician"])
    diagnosis = _label_value(text, ["التشخيص", "الحالة", "Diagnosis"])
    request_type = _label_value(text, ["نوع الطلب", "الموضوع", "طلب", "Subject", "Request Type"])
    sender = _label_value(text, ["الجهة المرسلة", "الجهة", "المستشفى", "المركز", "From"])

    document_date = _first_match(
        text, [r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})", r"(\d{1,2}[-/]\d{1,2}[-/]\d{4})"]
    ) or _label_value(text, ["التاريخ", "تاريخ التحويل", "تاريخ الطلب", "Date"])

    found = [value for value in (patient_name, file_number, task_number, diagnosis, request_type) if value]

    return {
        "patientName": patient_name,
        "fileNumber": _first_token(file_number),
        "taskNumber": _first_token(task_number) or task_number,
        "department": department,
        "doctor": doctor,
        "diagnosis": diagnosis,
        "requestType": request_type,
        "sender": sender,
        "documentDate": normalize_date(document_date),
        # ملخص مقروء متى نجح الاستخراج، وإلا مقتطف خام يساعد على المراجعة اليدوية.
        "summary": " — ".join(part for part in (request_type, diagnosis) if part)
        if len(found) >= 2
        else text[:300],
    }


def normalize_date(value: str) -> str:
    raw = normalize_digits(clean(value))
    if not raw:
        return ""

    iso = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", raw)
    if iso:
        return f"{iso.group(1)}-{int(iso.group(2)):02d}-{int(iso.group(3)):02d}"

    dmy = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", raw)
    if dmy:
        return f"{dmy.group(3)}-{int(dmy.group(2)):02d}-{int(dmy.group(1)):02d}"

    return raw


def merge_sources(row: dict | None = None, pdf: dict | None = None, ai: dict | None = None) -> dict:
    """يدمج مصادر البيانات: عنوان المهمة أولا، ثم نص الـPDF، ثم تحليل الذكاء الاصطناعي."""
    row, pdf, ai = row or {}, pdf or {}, ai or {}

    def pick(*values: str) -> str:
        for value in values:
            cleaned = clean(value)
            if cleaned:
                return cleaned
        return ""

    return {
        "taskNumber": pick(row.get("taskNumber"), pdf.get("taskNumber"), ai.get("taskNumber")),
        "patientName": pick(row.get("patientName"), pdf.get("patientName"), ai.get("patientName")),
        "fileNumber": pick(row.get("fileNumber"), pdf.get("fileNumber"), ai.get("fileNumber")),
        # القسم والطبيب ونوع الطلب مذكورة في عنوان المهمة نفسه، وهي أوثق من نص الـPDF.
        "department": pick(row.get("department"), pdf.get("department"), ai.get("department")),
        "doctor": pick(row.get("doctor"), pdf.get("doctor"), ai.get("referringDoctor")),
        "diagnosis": pick(pdf.get("diagnosis"), ai.get("diagnosis")),
        "requestType": pick(
            row.get("requestType"), row.get("subject"), pdf.get("requestType"), ai.get("requestType")
        ),
        "sender": pick(row.get("sender"), pdf.get("sender"), ai.get("senderEntity")),
        "documentDate": normalize_date(
            pick(pdf.get("documentDate"), ai.get("documentDate"), row.get("date"))
        ),
        "summary": pick(ai.get("summary"), pdf.get("summary")),
    }
