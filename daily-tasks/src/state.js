import fs from "node:fs";
import path from "node:path";

/**
 * سجل المهام المعالجة سابقا. الغرض منه أن إعادة تشغيل السكربت في نفس اليوم
 * لا تكرر الصفوف في الإكسل ولا تعيد الضغط على "تحت التنفيذ" لمعاملة نفذت.
 */
export function loadState(stateDir) {
  const file = path.join(stateDir, "processed.json");
  if (!fs.existsSync(file)) {
    return { file, processed: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return { file, processed: parsed.processed || {} };
  } catch {
    return { file, processed: {} };
  }
}

export function markProcessed(state, taskNumber, details) {
  state.processed[String(taskNumber)] = {
    ...details,
    at: new Date().toISOString(),
  };
}

export function isProcessed(state, taskNumber) {
  return Boolean(state.processed[String(taskNumber)]);
}

export function saveState(state) {
  fs.mkdirSync(path.dirname(state.file), { recursive: true });
  fs.writeFileSync(state.file, JSON.stringify({ processed: state.processed }, null, 2), "utf8");
}
