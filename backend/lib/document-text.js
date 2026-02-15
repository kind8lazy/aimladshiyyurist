import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import zlib from "node:zlib";

const execFile = promisify(execFileCallback);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log"]);
const OFFICE_EXTENSIONS = new Set(["doc", "docx", "rtf"]);
const OCR_LANG_DEFAULT = "rus+eng";
const OCR_MAX_PAGES_DEFAULT = 6;
const OCR_OPENAI_MAX_PAGES_DEFAULT = 3;
const OCR_DPI_DEFAULT = 220;

export async function extractDocumentText({ bytes, extension, fileName, ocr = {} }) {
  const ext = `${extension || ""}`.toLowerCase();
  if (!bytes?.length) {
    return { text: "", method: "empty" };
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    return {
      text: sanitizeText(decodeUtf8(bytes)),
      method: "plain-text",
    };
  }

  if (OFFICE_EXTENSIONS.has(ext)) {
    const officeText = await extractWithTextutil(bytes, ext);
    if (officeText) {
      return { text: sanitizeText(officeText), method: "textutil" };
    }

    if (ext === "docx") {
      const xmlText = await extractDocxViaUnzip(bytes);
      if (xmlText) {
        return { text: sanitizeText(xmlText), method: "docx-xml" };
      }
    }
  }

  if (ext === "pdf") {
    const textutilText = await extractWithTextutil(bytes, ext);
    if (textutilText) {
      return { text: sanitizeText(textutilText), method: "textutil-pdf" };
    }

    const pdfText = extractPdfTextFallback(bytes);
    if (pdfText) {
      return { text: sanitizeText(pdfText), method: "pdf-fallback" };
    }

    const ocrText = await extractPdfWithOcr(bytes, resolveOcrOptions(ocr));
    if (ocrText?.text) {
      return {
        text: sanitizeText(ocrText.text),
        method: ocrText.method || "pdf-ocr",
        warning: ocrText.warning,
      };
    }
  }

  const printable = extractPrintableText(bytes);
  if (printable && isUsefulText(printable)) {
    return { text: sanitizeText(printable), method: "printable-fallback" };
  }

  return { text: "", method: `unsupported-${ext || "binary"}`, warning: `Не удалось извлечь текст из ${fileName || "вложения"}` };
}

export function stableBytesHash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function decodeUtf8(bytes) {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return Buffer.from(bytes).toString("utf8");
  }
}

async function extractWithTextutil(bytes, extension) {
  const temp = await writeTempFile(bytes, extension);
  try {
    const { stdout } = await execFile("textutil", ["-convert", "txt", "-stdout", temp], {
      timeout: 15_000,
      maxBuffer: 12 * 1024 * 1024,
    });
    const text = `${stdout || ""}`.trim();
    return isUsefulText(text, extension) ? text : "";
  } catch {
    return "";
  } finally {
    await cleanupTempFile(temp);
  }
}

async function extractDocxViaUnzip(bytes) {
  const temp = await writeTempFile(bytes, "docx");
  try {
    const { stdout } = await execFile("unzip", ["-p", temp, "word/document.xml"], {
      timeout: 10_000,
      maxBuffer: 12 * 1024 * 1024,
    });
    return xmlToText(stdout);
  } catch {
    return "";
  } finally {
    await cleanupTempFile(temp);
  }
}

async function writeTempFile(bytes, extension) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "legalops-doc-"));
  const filePath = path.join(dir, `input.${extension || "bin"}`);
  await fs.writeFile(filePath, bytes);
  return filePath;
}

async function cleanupTempFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

function xmlToText(xml) {
  const raw = `${xml || ""}`.trim();
  if (!raw) {
    return "";
  }

  return raw
    .replace(/<w:tab[^>]*\/>/gi, "\t")
    .replace(/<w:br[^>]*\/>/gi, "\n")
    .replace(/<w:p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function extractPdfTextFallback(bytes) {
  const binary = Buffer.from(bytes);
  const latin = binary.toString("latin1");
  let cursor = 0;
  const pieces = [];

  while (cursor < latin.length) {
    const streamIndex = latin.indexOf("stream", cursor);
    if (streamIndex < 0) {
      break;
    }

    const dictStart = latin.lastIndexOf("<<", streamIndex);
    const dictEnd = dictStart >= 0 ? latin.indexOf(">>", dictStart) : -1;
    const dict = dictStart >= 0 && dictEnd > dictStart && dictEnd < streamIndex ? latin.slice(dictStart, dictEnd + 2) : "";

    let dataStart = streamIndex + 6;
    if (latin[dataStart] === "\r" && latin[dataStart + 1] === "\n") {
      dataStart += 2;
    } else if (latin[dataStart] === "\n" || latin[dataStart] === "\r") {
      dataStart += 1;
    }

    const endMarker = latin.indexOf("endstream", dataStart);
    if (endMarker < 0) {
      break;
    }

    const streamBytes = binary.subarray(dataStart, endMarker);
    const decoded = decodePdfStream(streamBytes, dict);
    if (decoded) {
      const fromOperators = extractPdfOperatorsText(decoded);
      if (fromOperators.length >= 20) {
        pieces.push(fromOperators);
      }
    }

    cursor = endMarker + 9;
  }

  const joined = pieces.join("\n");
  if (joined.length >= 20) {
    return joined;
  }

  const direct = extractPdfOperatorsText(latin);
  if (direct.length >= 20) {
    return direct;
  }

  return "";
}

function decodePdfStream(streamBytes, dict) {
  const usesFlate = /\/FlateDecode/.test(dict);
  if (!usesFlate) {
    return Buffer.from(streamBytes).toString("latin1");
  }

  const attempts = [
    () => zlib.inflateSync(streamBytes),
    () => zlib.inflateRawSync(streamBytes),
  ];

  for (const attempt of attempts) {
    try {
      return Buffer.from(attempt()).toString("latin1");
    } catch {
      // try next
    }
  }

  return Buffer.from(streamBytes).toString("latin1");
}

function extractPdfOperatorsText(content) {
  if (!content) {
    return "";
  }

  const blocks = content.match(/BT[\s\S]*?ET/g) || [];
  const out = [];
  for (const block of blocks) {
    const literalStrings = parsePdfLiteralStrings(block);
    literalStrings.forEach((value) => {
      const decoded = decodePdfLiteral(value);
      if (decoded) {
        out.push(decoded);
      }
    });

    for (const match of block.matchAll(/<([0-9A-Fa-f\s]{4,})>/g)) {
      const hexDecoded = decodePdfHexString(match[1]);
      if (hexDecoded) {
        out.push(hexDecoded);
      }
    }
  }

  return out.join(" ").trim();
}

function parsePdfLiteralStrings(block) {
  const values = [];
  let index = 0;

  while (index < block.length) {
    if (block[index] !== "(") {
      index += 1;
      continue;
    }

    let depth = 1;
    let cursor = index + 1;
    let value = "";
    while (cursor < block.length && depth > 0) {
      const char = block[cursor];
      if (char === "\\" && cursor + 1 < block.length) {
        value += block.slice(cursor, cursor + 2);
        cursor += 2;
        continue;
      }

      if (char === "(") {
        depth += 1;
        if (depth > 1) {
          value += char;
        }
        cursor += 1;
        continue;
      }

      if (char === ")") {
        depth -= 1;
        if (depth > 0) {
          value += char;
        }
        cursor += 1;
        continue;
      }

      value += char;
      cursor += 1;
    }

    if (value.trim()) {
      values.push(value);
    }

    index = cursor;
  }

  return values;
}

function decodePdfLiteral(input) {
  let result = `${input || ""}`;
  result = result.replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
  result = result
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");

  return result.trim();
}

function decodePdfHexString(hex) {
  const cleaned = `${hex || ""}`.replace(/\s+/g, "");
  if (!cleaned) {
    return "";
  }

  const evenHex = cleaned.length % 2 === 1 ? `${cleaned}0` : cleaned;
  const bytes = Buffer.from(evenHex, "hex");

  // Common PDF form: UTF-16BE text prefixed with BOM FEFF.
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const codePoints = [];
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      codePoints.push((bytes[i] << 8) | bytes[i + 1]);
    }
    return String.fromCharCode(...codePoints).trim();
  }

  return bytes.toString("latin1").trim();
}

function extractPrintableText(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  const chunks = text.match(/[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9\s,.;:!?()"'/%\-]{24,}/g) || [];
  return chunks.slice(0, 60).join(" ");
}

function resolveOcrOptions(input) {
  const maxPages = clampNumber(input?.maxPages, 1, 30, OCR_MAX_PAGES_DEFAULT);
  const dpi = clampNumber(input?.dpi, 120, 400, OCR_DPI_DEFAULT);
  const tesseractLang = `${input?.tesseractLang || OCR_LANG_DEFAULT}`.trim() || OCR_LANG_DEFAULT;
  const enableOpenAiFallback = Boolean(input?.enableOpenAiFallback);
  const openAiApiKey = `${input?.openaiApiKey || ""}`.trim();
  const openAiModel = `${input?.openaiModel || "gpt-4.1-mini"}`.trim();
  const openAiMaxPages = clampNumber(input?.openAiMaxPages, 1, 10, OCR_OPENAI_MAX_PAGES_DEFAULT);

  return {
    maxPages,
    dpi,
    tesseractLang,
    enableOpenAiFallback,
    openAiApiKey,
    openAiModel,
    openAiMaxPages,
  };
}

async function extractPdfWithOcr(bytes, options) {
  const temp = await writeTempFile(bytes, "pdf");
  const workDir = path.dirname(temp);
  try {
    const images = await renderPdfPagesToPng(temp, workDir, {
      maxPages: options.maxPages,
      dpi: options.dpi,
    });
    if (!images.length) {
      return { text: "", method: "pdf-ocr-no-images", warning: "Не удалось подготовить страницы PDF для OCR." };
    }

    const localText = await ocrImagesWithTesseract(images, options.tesseractLang);
    if (isUsefulText(localText, "pdf")) {
      return { text: localText, method: "pdf-ocr-tesseract" };
    }

    if (options.enableOpenAiFallback && options.openAiApiKey) {
      const visionText = await ocrImagesWithOpenAi(images, options);
      if (isUsefulText(visionText, "pdf")) {
        return { text: visionText, method: "pdf-ocr-openai" };
      }
    }

    return {
      text: "",
      method: "pdf-ocr-empty",
      warning: "OCR не извлек распознаваемый текст. Проверь качество скана.",
    };
  } finally {
    await cleanupTempFile(temp);
  }
}

async function renderPdfPagesToPng(pdfPath, workDir, { maxPages, dpi }) {
  const prefix = path.join(workDir, "ocr-page");

  const fromPdftoppm = await renderWithPdftoppm(pdfPath, prefix, { maxPages, dpi });
  if (fromPdftoppm.length) {
    return fromPdftoppm;
  }

  const fromPdftocairo = await renderWithPdftocairo(pdfPath, prefix, { maxPages, dpi });
  if (fromPdftocairo.length) {
    return fromPdftocairo;
  }

  const fromSips = await renderWithSips(pdfPath, prefix);
  return fromSips;
}

async function renderWithPdftoppm(pdfPath, prefix, { maxPages, dpi }) {
  try {
    await execFile(
      "pdftoppm",
      ["-png", "-r", String(dpi), "-f", "1", "-l", String(maxPages), pdfPath, prefix],
      { timeout: 45_000, maxBuffer: 1024 * 1024 },
    );
    return listRenderedImages(path.dirname(prefix), path.basename(prefix));
  } catch {
    return [];
  }
}

async function renderWithPdftocairo(pdfPath, prefix, { maxPages, dpi }) {
  try {
    await execFile(
      "pdftocairo",
      ["-png", "-r", String(dpi), "-f", "1", "-l", String(maxPages), pdfPath, prefix],
      { timeout: 45_000, maxBuffer: 1024 * 1024 },
    );
    return listRenderedImages(path.dirname(prefix), path.basename(prefix));
  } catch {
    return [];
  }
}

async function renderWithSips(pdfPath, prefix) {
  const output = `${prefix}-1.png`;
  try {
    await execFile("sips", ["-s", "format", "png", pdfPath, "--out", output], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    const stat = await fs.stat(output);
    return stat.size > 0 ? [output] : [];
  } catch {
    return [];
  }
}

async function listRenderedImages(dir, baseName) {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((name) => name.startsWith(`${baseName}-`) && name.endsWith(".png"))
      .sort((a, b) => pageFileOrder(a) - pageFileOrder(b))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function pageFileOrder(name) {
  const match = `${name || ""}`.match(/-(\d+)\.png$/i);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

async function ocrImagesWithTesseract(imagePaths, lang) {
  const pages = [];
  for (let index = 0; index < imagePaths.length; index += 1) {
    const imagePath = imagePaths[index];
    const pageText = await runTesseract(imagePath, lang);
    if (pageText) {
      pages.push(`Страница ${index + 1}\n${pageText}`);
    }
  }

  return pages.join("\n\n").trim();
}

async function runTesseract(imagePath, lang) {
  const baseArgs = [imagePath, "stdout"];
  const attempts = [
    [...baseArgs, "-l", lang, "--oem", "1", "--psm", "6"],
    [...baseArgs, "-l", "eng", "--oem", "1", "--psm", "6"],
  ];

  for (const args of attempts) {
    try {
      const { stdout } = await execFile("tesseract", args, {
        timeout: 45_000,
        maxBuffer: 12 * 1024 * 1024,
      });
      const text = `${stdout || ""}`.trim();
      if (text) {
        return text;
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        return "";
      }
    }
  }

  return "";
}

async function ocrImagesWithOpenAi(imagePaths, options) {
  const pages = imagePaths.slice(0, options.openAiMaxPages);
  if (!pages.length || !options.openAiApiKey) {
    return "";
  }

  const content = [
    {
      type: "input_text",
      text:
        "Извлеки текст с изображений документа. Верни только распознанный текст без комментариев. Сохрани структуру абзацев и нумерацию.",
    },
  ];

  for (const imagePath of pages) {
    try {
      const bytes = await fs.readFile(imagePath);
      const dataBase64 = bytes.toString("base64");
      content.push({
        type: "input_image",
        image_url: `data:image/png;base64,${dataBase64}`,
      });
    } catch {
      // skip unreadable page image
    }
  }

  if (content.length === 1) {
    return "";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: options.openAiModel,
        input: [
          {
            role: "user",
            content,
          },
        ],
        max_output_tokens: 2200,
      }),
    });

    if (!response.ok) {
      return "";
    }

    const payload = await response.json();
    return extractResponseOutputText(payload);
  } catch {
    return "";
  }
}

function extractResponseOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) {
    return "";
  }

  const chunks = [];
  payload.output.forEach((item) => {
    if (!Array.isArray(item.content)) {
      return;
    }

    item.content.forEach((contentItem) => {
      if (contentItem.type === "output_text" && contentItem.text) {
        chunks.push(contentItem.text);
      }
    });
  });

  return chunks.join("\n").trim();
}

function sanitizeText(text) {
  return `${text || ""}`
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 40_000);
}

function isUsefulText(text, extension = "") {
  const value = `${text || ""}`.trim();
  if (value.length < 20) {
    return false;
  }

  const lowered = value.toLowerCase();
  if (lowered.startsWith("%pdf-") || lowered.includes("endobj") || lowered.includes("/flatedecode")) {
    return false;
  }

  const sample = value.slice(0, 1800);
  let readable = 0;
  for (const char of sample) {
    if (/[a-zа-яё0-9.,:;!?()[\]\-_"'/%\s]/i.test(char)) {
      readable += 1;
    }
  }

  const ratio = readable / Math.max(1, sample.length);
  if (ratio < 0.74) {
    return false;
  }

  if (extension === "pdf") {
    const words = sample.split(/\s+/).filter((item) => /[a-zа-яё]/i.test(item));
    if (words.length < 4) {
      return false;
    }
  }

  return true;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}
