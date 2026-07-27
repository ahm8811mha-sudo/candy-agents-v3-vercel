import http from "node:http";

/**
 * نظام وهمي للتجربة الآمنة.
 * يحاكي: صفحة دخول، جدول مهام واردة، صفحة تفاصيل بمرفق PDF وزر "تحت التنفيذ".
 * الغرض منه تجربة السكربت كاملا دون لمس النظام الحقيقي:
 *   node mock/server.js            (طرفية أولى)
 *   npm run run:live               (طرفية ثانية، بعد ضبط .env على http://127.0.0.1:8910)
 */

const PORT = Number(process.env.MOCK_PORT || 8910);

// عناوين على نفس نمط ttn.ksu.edu.sa:
//   نوع الطلب - اسم المريض - رقم الملف - [الطبيب] - القسم
const TASKS = [
  { id: "144800006202", patient: "خلود سالم محمد القحطاني", file: "1065170",
    doctor: "ماجد الماضي", dept: "الجهاز الهضمي", hijri: "05 صفر 1448", greg: "19 يوليو 2026",
    diagnosis: "Chronic gastritis" },
  { id: "144800006900", patient: "هويده جميل سنوسي صابر", file: "10389908",
    doctor: "", dept: "العلاج الطبيعي", hijri: "08 صفر 1448", greg: "22 يوليو 2026",
    diagnosis: "Lower back pain" },
  { id: "144800006641", patient: "دليل محسن هميجان المطيري", file: "10285310",
    doctor: "سعد الخويطر", dept: "الجهاز الهضمي", hijri: "07 صفر 1448", greg: "21 يوليو 2026",
    diagnosis: "Colon screening" },
  { id: "144800006644", patient: "حصه علي ابراهيم البيطار", file: "123727",
    doctor: "", dept: "العلاج الطبيعي", hijri: "07 صفر 1448", greg: "21 يوليو 2026",
    diagnosis: "Post operative rehabilitation" },
].map((task) => ({
  ...task,
  title: ["طلب تقرير انجليزي", task.patient, task.file, task.doctor, task.dept]
    .filter(Boolean)
    .join(" - "),
}));

const state = new Map(TASKS.map((task) => [task.id, { status: "جديدة", note: "" }]));
const sessions = new Set();

function buildPdf(task) {
  // المرفق يحمل "باقي المعلومات" فقط؛ الاسم ورقم الملف والقسم تؤخذ من عنوان المهمة.
  const lines = [
    `Task No: ${task.id}`,
    `File No: ${task.file}`,
    `Diagnosis: ${task.diagnosis}`,
    `Request Type: English medical report`,
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
    // قائمة بطاقات لا جدول، مطابقة لشكل صفحة المهام الواردة الحقيقية.
    const cards = TASKS.map((task) => `
      <div class="panel">
        <a href="/task/${task.id}">${task.title}</a>
        <span class="status">${state.get(task.id).status}</span>
        <span class="task-number">الرقم: ${task.id}</span>
        <div>من: Munirah Aldosari إلى: أحمد ناصر فهد الأحمد</div>
        <div class="task-date">${task.hijri} الموافق ${task.greg}</div>
        <div>
          <button type="button">إسناد</button>
          <button type="button">تعليق</button>
          <button type="button">رفض</button>
        </div>
      </div>`).join("");

    return send(res, 200, page(`
      <a href="/logout">تسجيل الخروج</a>
      <h1>المهام الواردة (${TASKS.length})</h1>
      ${cards}`));
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
      <p>${task.title}</p>
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
