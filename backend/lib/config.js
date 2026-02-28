import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, "..", "..");
export const DATA_DIR = path.resolve(ROOT_DIR, "backend", "data");

export function getConfig() {
  return {
    port: Number(process.env.PORT || 8787),
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    openaiTranscribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    transcriptionMaxBytes: Math.max(5 * 1024 * 1024, Number(process.env.TRANSCRIPTION_MAX_BYTES || 512 * 1024 * 1024)),
    transcriptionDirectMaxBytes: Math.max(
      5 * 1024 * 1024,
      Number(process.env.TRANSCRIPTION_DIRECT_MAX_BYTES || 20 * 1024 * 1024),
    ),
    transcriptionSegmentSeconds: Math.max(120, Number(process.env.TRANSCRIPTION_SEGMENT_SECONDS || 900)),
    transcribeRateLimit: Math.max(1, Number(process.env.TRANSCRIBE_RATE_LIMIT || 8)),
    transcribeRateWindowMs: Math.max(60_000, Number(process.env.TRANSCRIBE_RATE_WINDOW_MS || 15 * 60 * 1000)),
    transcribeConcurrentJobsPerUser: Math.max(1, Number(process.env.TRANSCRIBE_MAX_CONCURRENT_JOBS || 2)),
    matterAttachmentMaxBytes: Math.max(1024 * 1024, Number(process.env.MATTER_ATTACHMENT_MAX_BYTES || 100 * 1024 * 1024)),
    matterAttachmentsTotalMaxBytes: Math.max(
      5 * 1024 * 1024,
      Number(process.env.MATTER_ATTACHMENTS_TOTAL_MAX_BYTES || 250 * 1024 * 1024),
    ),
    jsonBodyMaxBytes: Math.max(512 * 1024, Number(process.env.JSON_BODY_MAX_BYTES || 300 * 1024 * 1024)),
    ragTopK: Math.max(1, Number(process.env.RAG_TOP_K || 4)),
    ocrMaxPages: Math.max(1, Math.min(30, Number(process.env.OCR_MAX_PAGES || 6))),
    ocrImageDpi: Math.max(120, Math.min(400, Number(process.env.OCR_IMAGE_DPI || 220))),
    ocrTesseractLang: `${process.env.OCR_TESSERACT_LANG || "rus+eng"}`.trim() || "rus+eng",
    ocrUseOpenAiFallback: `${process.env.OCR_OPENAI_FALLBACK || "1"}` !== "0",
    ocrOpenAiMaxPages: Math.max(1, Math.min(10, Number(process.env.OCR_OPENAI_MAX_PAGES || 3))),
    resendApiKey: `${process.env.RESEND_API_KEY || ""}`.trim(),
    resetEmailFrom: `${process.env.RESET_EMAIL_FROM || "Legal Ops AI <no-reply@example.com>"}`.trim(),
    resetEmailSubject: `${process.env.RESET_EMAIL_SUBJECT || "Код восстановления пароля"}`.trim(),
    jwtSecret: process.env.JWT_SECRET || "dev-secret",
  };
}
