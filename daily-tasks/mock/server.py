"""
نظام وهمي للتجربة الآمنة.
يحاكي: صفحة دخول، قائمة بطاقات للمهام الواردة، صفحة تفاصيل بمرفق PDF
وزر "تحت التنفيذ" يفتح خانة كتابة ثم حفظ — على نمط ttn.ksu.edu.sa.

الغرض منه تجربة السكربت كاملا دون لمس النظام الحقيقي:
    python mock/server.py                 (طرفية أولى)
    python -m daily_tasks.run --live      (طرفية ثانية، بعد ضبط .env على http://127.0.0.1:8910)
"""

from __future__ import annotations

import os
import random
import re
import string
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.getenv("MOCK_PORT", "8910"))

# عناوين على نفس نمط النظام الحقيقي:
#   نوع الطلب - اسم المريض - رقم الملف - [الطبيب] - القسم
_RAW_TASKS = [
    ("144800006202", "خلود سالم محمد القحطاني", "1065170", "ماجد الماضي", "الجهاز الهضمي",
     "05 صفر 1448", "19 يوليو 2026", "Chronic gastritis"),
    ("144800006900", "هويده جميل سنوسي صابر", "10389908", "", "العلاج الطبيعي",
     "08 صفر 1448", "22 يوليو 2026", "Lower back pain"),
    ("144800006641", "دليل محسن هميجان المطيري", "10285310", "سعد الخويطر", "الجهاز الهضمي",
     "07 صفر 1448", "21 يوليو 2026", "Colon screening"),
    ("144800006644", "حصه علي ابراهيم البيطار", "123727", "", "العلاج الطبيعي",
     "07 صفر 1448", "21 يوليو 2026", "Post operative rehabilitation"),
]

TASKS = [
    {
        "id": task_id,
        "patient": patient,
        "file": file_number,
        "doctor": doctor,
        "dept": dept,
        "hijri": hijri,
        "greg": greg,
        "diagnosis": diagnosis,
        "title": " - ".join(
            part for part in ("طلب تقرير انجليزي", patient, file_number, doctor, dept) if part
        ),
    }
    for task_id, patient, file_number, doctor, dept, hijri, greg, diagnosis in _RAW_TASKS
]

STATE = {task["id"]: {"status": "جديدة", "note": ""} for task in TASKS}
SESSIONS: set[str] = set()


def build_pdf(task: dict) -> bytes:
    # المرفق يحمل "باقي المعلومات" فقط؛ الاسم ورقم الملف والقسم تؤخذ من عنوان المهمة.
    lines = [
        f"Task No: {task['id']}",
        f"File No: {task['file']}",
        f"Diagnosis: {task['diagnosis']}",
        "Request Type: English medical report",
    ]

    content = "\n".join(
        f"BT /F1 12 Tf 60 {720 - index * 22} Td ({line}) Tj ET" for index, line in enumerate(lines)
    )

    objects = [
        "<</Type/Catalog/Pages 2 0 R>>",
        "<</Type/Pages/Kids[3 0 R]/Count 1>>",
        "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]"
        "/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
        "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
        f"<</Length {len(content)}>>\nstream\n{content}\nendstream",
    ]

    pdf = "%PDF-1.4\n"
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(pdf.encode("latin-1")))
        pdf += f"{index} 0 obj\n{body}\nendobj\n"

    xref = len(pdf.encode("latin-1"))
    pdf += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    for offset in offsets:
        pdf += f"{offset:010d} 00000 n \n"
    pdf += f"trailer\n<</Size {len(objects) + 1}/Root 1 0 R>>\nstartxref\n{xref}\n%%EOF"

    return pdf.encode("latin-1")


def page(body: str) -> str:
    return (
        '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">'
        f"<title>نظام المهام</title></head><body>{body}</body></html>"
    )


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args) -> None:  # نكتم سجل الطلبات ونبقي رسائلنا فقط
        pass

    # ---------- أدوات ----------

    def _send(self, status: int, body, content_type: str = "text/html; charset=utf-8") -> None:
        payload = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _redirect(self, location: str, cookie: str | None = None) -> None:
        self.send_response(302)
        self.send_header("Location", location)
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()

    def _authed(self) -> bool:
        cookie = self.headers.get("Cookie") or ""
        return any(part.strip().replace("sid=", "") in SESSIONS for part in cookie.split(";"))

    def _form(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        return {key: values[0] for key, values in parse_qs(raw).items()}

    # ---------- المسارات ----------

    def do_GET(self) -> None:  # noqa: N802 - اسم مفروض من المكتبة
        path = urlparse(self.path).path

        if path in ("/", "/login"):
            return self._send(200, page(
                "<h1>تسجيل الدخول</h1>"
                '<form method="post" action="/login">'
                '<input type="text" name="username" placeholder="اسم المستخدم">'
                '<input type="password" name="password" placeholder="كلمة المرور">'
                '<button type="submit">دخول</button></form>'
            ))

        if path == "/logout":
            SESSIONS.clear()
            return self._redirect("/login")

        if not self._authed():
            return self._redirect("/login")

        if path == "/tasks":
            cards = "".join(
                f'<div class="panel">'
                f'<a href="/task/{task["id"]}">{task["title"]}</a>'
                f'<span class="status">{STATE[task["id"]]["status"]}</span>'
                f'<span class="task-number">الرقم: {task["id"]}</span>'
                f"<div>من: Munirah Aldosari إلى: أحمد ناصر فهد الأحمد</div>"
                f'<div class="task-date">{task["hijri"]} الموافق {task["greg"]}</div>'
                f'<div><button type="button">إسناد</button>'
                f'<button type="button">رفض</button></div>'
                f"</div>"
                for task in TASKS
            )
            return self._send(200, page(
                f'<a href="/logout">تسجيل الخروج</a>'
                f"<h1>المهام الواردة ({len(TASKS)})</h1>{cards}"
            ))

        detail = re.fullmatch(r"/task/(\d+)", path)
        if detail:
            task = next((item for item in TASKS if item["id"] == detail.group(1)), None)
            if not task:
                return self._send(404, page("<p>غير موجود</p>"))
            return self._send(200, page(
                f'<a href="/tasks">المهام الواردة</a>'
                f'<h1>تفاصيل المهمة {task["id"]}</h1>'
                f'<p>{task["title"]}</p>'
                f'<p><a href="/task/{task["id"]}/attachment.pdf">المرفق</a></p>'
                f'<p>الحالة الحالية: {STATE[task["id"]]["status"]}</p>'
                f'<form method="post">'
                f'<button type="button" onclick="document.getElementById(\'box\').style.display=\'block\'">'
                f"تحت التنفيذ</button>"
                f'<div id="box" style="display:none">'
                f'<textarea name="note"></textarea>'
                f'<button type="submit">حفظ</button></div></form>'
            ))

        attachment = re.fullmatch(r"/task/(\d+)/attachment\.pdf", path)
        if attachment:
            task = next((item for item in TASKS if item["id"] == attachment.group(1)), None)
            if not task:
                return self._send(404, "not found", "text/plain")
            return self._send(200, build_pdf(task), "application/pdf")

        self._send(404, page("<p>غير موجود</p>"))

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path

        if path in ("/", "/login"):
            form = self._form()
            if form.get("username") and form.get("password"):
                sid = "".join(random.choices(string.ascii_lowercase + string.digits, k=16))
                SESSIONS.add(sid)
                return self._redirect("/tasks", f"sid={sid}; Path=/")
            return self._send(401, page("<p>بيانات دخول غير صحيحة</p>"))

        if not self._authed():
            return self._redirect("/login")

        detail = re.fullmatch(r"/task/(\d+)", path)
        if detail and detail.group(1) in STATE:
            note = self._form().get("note", "")
            STATE[detail.group(1)] = {"status": "تحت التنفيذ", "note": note}
            print(f'[mock] المهمة {detail.group(1)} → تحت التنفيذ | الملاحظة: "{note}"', flush=True)
            return self._send(200, page('<p>تم الحفظ بنجاح</p><a href="/tasks">رجوع</a>'))

        self._send(404, page("<p>غير موجود</p>"))


if __name__ == "__main__":
    print(f"النظام الوهمي يعمل على http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
