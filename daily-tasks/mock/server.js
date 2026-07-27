import http from "node:http";

/**
 * نظام وهمي للتجربة الآمنة.
 * يحاكي: صفحة دخول، جدول مهام واردة، صفحة تفاصيل بمرفق PDF وزر "تحت التنفيذ".
 * الغرض منه تجربة السكربت كاملا دون لمس النظام الحقيقي:
 *   node mock/server.js            (طرفية أولى)
 *   npm run run:live               (طرفية ثانية، بعد ضبط .env على http://127.0.0.1:8910)
 */

const PORT = Number(process.env.MOCK_PORT || 8910);

const TASKS = [
  { id: "44120", subject: "تحويل لجلسات علاج طبيعي", sender: "عيادة العظام", date: "2026-07-27",
    patient: "Ahmed Al Otaibi", file: "789456", dept: "Physiotherapy", diagnosis: "Lower back pain" },
  { id: "44121", subject: "طلب منظار قولون", sender: "عيادة الباطنة", date: "2026-07-27",
    patient: "Noura Al Salem", file: "112233", dept: "Gastroenterology", diagnosis: "Chronic abdominal pain" },
  { id: "44122", subject: "متابعة تأهيل بعد عملية", sender: "قسم الجراحة", date: "2026-07-27",
    patient: "Khalid Al Harbi", file: "556677", dept: "Physiotherapy", diagnosis: "Post operative rehabilitation" },
];

const state = new Map(TASKS.map((task) => [task.id, { status: "جديدة", note: "" }]));
const sessions = new Set();

function buildPdf(task) {
  const lines = [
    `Task No: ${task.id}`,
    `Patient Name: ${task.patient}`,
    `File No: ${task.file}`,
    `Department: ${task.dept}`,
    `Diagnosis: ${task.diagnosis}`,
    `Date: ${task.date}`,
  ];

  const content = lines
    .map((line, index) => `BT /F1 12 Tf 60 ${720 - index * 22} Td (${line.replace(/([()\\])/g, "\\$1")}) Tj ET`)
    .join("\n");

  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    `<</Length ${Buffer.byteLength(content)}>>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

const page = (body) =>
  `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>نظام المهام</title></head><body>${body}</body></html>`;

function send(res, status, body, type = "text/html; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function authed(req) {
  return (req.headers.cookie || "").split(";").some((part) => sessions.has(part.trim().replace("sid=", "")));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/" || url.pathname === "/login") {
    if (req.method === "POST") {
      const body = await new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => { data += chunk; });
        req.on("end", () => resolve(data));
      });
      const form = new URLSearchParams(body);
      if (form.get("username") && form.get("password")) {
        const sid = Math.random().toString(36).slice(2);
        sessions.add(sid);
        res.writeHead(302, { "Set-Cookie": `sid=${sid}; Path=/`, Location: "/tasks" });
        return res.end();
      }
      return send(res, 401, page("<p>بيانات دخول غير صحيحة</p>"));
    }
    return send(res, 200, page(`
      <h1>تسجيل الدخول</h1>
      <form method="post" action="/login">
        <input type="text" name="username" placeholder="اسم المستخدم">
        <input type="password" name="password" placeholder="كلمة المرور">
        <button type="submit">دخول</button>
      </form>`));
  }

  if (!authed(req)) {
    res.writeHead(302, { Location: "/login" });
    return res.end();
  }

  if (url.pathname === "/tasks") {
    const rows = TASKS.map((task) => `
      <tr>
        <td>${task.id}</td>
        <td>${task.subject}</td>
        <td>${task.sender}</td>
        <td>${task.date}</td>
        <td>${state.get(task.id).status}</td>
        <td><a href="/task/${task.id}">فتح</a></td>
      </tr>`).join("");

    return send(res, 200, page(`
      <a href="/logout">تسجيل الخروج</a>
      <h1>المهام الواردة</h1>
      <table>
        <thead><tr><th>رقم المهمة</th><th>الموضوع</th><th>الجهة المرسلة</th><th>التاريخ</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`));
  }

  const detail = url.pathname.match(/^\/task\/(\d+)$/);
  if (detail) {
    const task = TASKS.find((item) => item.id === detail[1]);
    if (!task) return send(res, 404, page("<p>غير موجود</p>"));
    const current = state.get(task.id);

    if (req.method === "POST") {
      const body = await new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => { data += chunk; });
        req.on("end", () => resolve(data));
      });
      const form = new URLSearchParams(body);
      current.status = "تحت التنفيذ";
      current.note = form.get("note") || "";
      console.log(`[mock] المهمة ${task.id} → تحت التنفيذ | الملاحظة: "${current.note}"`);
      return send(res, 200, page(`<p>تم الحفظ بنجاح</p><a href="/tasks">رجوع</a>`));
    }

    return send(res, 200, page(`
      <a href="/tasks">المهام الواردة</a>
      <h1>تفاصيل المهمة ${task.id}</h1>
      <p>الموضوع: ${task.subject}</p>
      <p><a href="/task/${task.id}/attachment.pdf">المرفق</a></p>
      <p>الحالة الحالية: ${current.status}</p>
      <form method="post">
        <button type="button" onclick="document.getElementById('box').style.display='block'">تحت التنفيذ</button>
        <div id="box" style="display:none">
          <textarea name="note"></textarea>
          <button type="submit">حفظ</button>
        </div>
      </form>`));
  }

  const attachment = url.pathname.match(/^\/task\/(\d+)\/attachment\.pdf$/);
  if (attachment) {
    const task = TASKS.find((item) => item.id === attachment[1]);
    if (!task) return send(res, 404, "not found");
    return send(res, 200, buildPdf(task), "application/pdf");
  }

  if (url.pathname === "/logout") {
    sessions.clear();
    res.writeHead(302, { Location: "/login" });
    return res.end();
  }

  send(res, 404, page("<p>غير موجود</p>"));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`النظام الوهمي يعمل على http://127.0.0.1:${PORT}`);
});
