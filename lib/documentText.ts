import { inflateRawSync, inflateSync } from "node:zlib";

type UploadPayload = {
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
  fileText?: string;
  notes?: string;
};

function cleanText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, " ").replace(/\s+/g, " ").trim();
}

function isPdf(input: UploadPayload) {
  return String(input.mimeType || "").toLowerCase().includes("pdf") || /\.pdf$/i.test(String(input.fileName || ""));
}

function tryInflate(buffer: Buffer) {
  try {
    return inflateSync(buffer);
  } catch {
    try {
      return inflateRawSync(buffer);
    } catch {
      return buffer;
    }
  }
}

function decodePdfLiteral(raw: string) {
  const unescaped = raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
  return cleanText(unescaped);
}

function decodeHexText(hex: string) {
  const safe = hex.replace(/[^0-9a-f]/gi, "");
  if (safe.length < 4) return "";
  const buf = Buffer.from(safe.length % 2 ? `${safe}0` : safe, "hex");
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return cleanText(buf.subarray(2).toString("utf16le").split("").map((_, i, arr) => (i % 2 ? arr[i - 1] : arr[i + 1])).join(""));
  const utf16Like = buf.length > 6 && buf.filter((b, i) => i % 2 === 0 && b === 0).length > buf.length / 4;
  if (utf16Like) {
    const swapped = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i += 2) {
      swapped[i] = buf[i + 1] || 0;
      swapped[i + 1] = buf[i] || 0;
    }
    return cleanText(swapped.toString("utf16le"));
  }
  return cleanText(buf.toString("utf8"));
}

function extractTextFromPdfBuffer(pdf: Buffer) {
  const chunks: string[] = [];
  const source = pdf.toString("latin1");
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(source))) {
    const before = source.slice(Math.max(0, match.index - 500), match.index);
    const raw = Buffer.from(match[1], "latin1");
    const decoded = before.includes("FlateDecode") ? tryInflate(raw) : raw;
    chunks.push(decoded.toString("latin1"));
    chunks.push(decoded.toString("utf8"));
  }
  chunks.push(source);

  const textParts: string[] = [];
  for (const chunk of chunks) {
    for (const literal of chunk.matchAll(/\(([^()]{2,500})\)/g)) textParts.push(decodePdfLiteral(literal[1]));
    for (const hex of chunk.matchAll(/<([0-9a-fA-F\s]{8,2000})>/g)) textParts.push(decodeHexText(hex[1]));
  }

  const joined = cleanText(textParts.filter((part) => part && /[\p{L}\p{N}]/u.test(part)).join("\n"));
  return joined.slice(0, 12000);
}

export function enrichUploadWithExtractedText<T extends UploadPayload>(input: T): T {
  if (input.fileText || !input.fileBase64 || !isPdf(input)) return input;
  try {
    const pdf = Buffer.from(input.fileBase64, "base64");
    const text = extractTextFromPdfBuffer(pdf);
    if (!text) return input;
    return { ...input, fileText: [input.notes, text].filter(Boolean).join("\n\n") };
  } catch {
    return input;
  }
}
