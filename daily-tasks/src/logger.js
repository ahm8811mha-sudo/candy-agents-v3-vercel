import fs from "node:fs";
import path from "node:path";

const SECRET_KEYS = ["password", "SYSTEM_PASSWORD", "OPENAI_API_KEY"];

/** يمنع ظهور كلمة المرور أو المفاتيح في السجل حتى لو مررت بالخطأ داخل رسالة خطأ. */
function redact(text, secrets) {
  let output = String(text);
  for (const secret of secrets) {
    if (secret && secret.length > 3) {
      output = output.split(secret).join("***");
    }
  }
  for (const key of SECRET_KEYS) {
    output = output.replace(new RegExp(`(${key}\\s*[=:]\\s*)\\S+`, "gi"), "$1***");
  }
  return output;
}

export function createLogger({ logDir, secrets = [] }) {
  fs.mkdirSync(logDir, { recursive: true });
  const file = path.join(logDir, `run-${new Date().toISOString().slice(0, 10)}.log`);

  function write(level, message) {
    const line = `[${new Date().toISOString()}] ${level} ${redact(message, secrets)}`;
    console.log(line);
    fs.appendFileSync(file, `${line}\n`, "utf8");
  }

  return {
    file,
    info: (message) => write("INFO ", message),
    warn: (message) => write("WARN ", message),
    error: (message) => write("ERROR", message),
    step: (message) => write("STEP ", message),
  };
}
