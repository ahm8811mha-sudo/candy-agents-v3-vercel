import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

dotenv.config({ path: path.join(ROOT, ".env") });

function required(name) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(
      `القيمة ${name} غير معبأة في ملف .env — افتح daily-tasks/.env وضع القيمة الصحيحة.`
    );
  }
  return value;
}

function flag(name, fallback = false) {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function resolveDir(value, fallback) {
  const target = (value || fallback).trim();
  return path.isAbsolute(target) ? target : path.join(ROOT, target);
}

export function loadSelectors() {
  const file = path.join(ROOT, "config", "selectors.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadConfig(argv = process.argv.slice(2)) {
  const live = argv.includes("--live");
  const dry = argv.includes("--dry-run");

  const config = {
    baseUrl: required("SYSTEM_BASE_URL"),
    tasksUrl: (process.env.TASKS_URL || "").trim(),
    username: required("SYSTEM_USERNAME"),
    password: required("SYSTEM_PASSWORD"),

    // وضع التنفيذ الفعلي يحتاج تفعيلا صريحا: إما المتغير في .env أو الراية --live.
    // الراية --dry-run تلغي كل شيء وتفرض وضع التجربة.
    markInProgress: dry ? false : live || flag("AUTO_MARK_IN_PROGRESS", false),
    inProgressComment: (process.env.IN_PROGRESS_COMMENT || "المعاملة تحت التنفيذ").trim(),

    headless: flag("HEADLESS", true),
    // مسار متصفح جاهز على الجهاز (Chrome أو Edge)، للأجهزة التي يمنع فيها تحميل متصفح جديد.
    chromiumPath: (process.env.CHROMIUM_PATH || "").trim(),
    maxTasks: Number(process.env.MAX_TASKS_PER_RUN || 200),

    outputDir: resolveDir(process.env.OUTPUT_DIR, "./output"),
    pdfDir: resolveDir(process.env.PDF_DIR, "./pdfs"),
    stateDir: path.join(ROOT, "state"),
    logDir: path.join(ROOT, "logs"),
    screenshotDir: path.join(ROOT, "screenshots"),

    physioWorkbook: (process.env.PHYSIO_WORKBOOK || "مرضى_العلاج_الطبيعي.xlsx").trim(),
    gastroWorkbook: (process.env.GI_WORKBOOK || "مرضى_الجهاز_الهضمي.xlsx").trim(),

    openaiKey: (process.env.OPENAI_API_KEY || "").trim(),
    openaiModel: (process.env.OPENAI_DOCUMENT_MODEL || "gpt-4.1-mini").trim(),
  };

  for (const dir of [config.outputDir, config.pdfDir, config.stateDir, config.logDir, config.screenshotDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return config;
}

/** تاريخ اليوم بصيغة YYYY-MM-DD بتوقيت السعودية، وهو اسم شريحة اليوم في الإكسل. */
export function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function nowStamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
