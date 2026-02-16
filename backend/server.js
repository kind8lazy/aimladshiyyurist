import http from "node:http";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { getConfig } from "./lib/config.js";
import { Roles, can } from "./lib/rbac.js";
import { json, parseJsonBody, createToken, generateId, nowIso } from "./lib/utils.js";
import {
  loadUsers,
  saveUsers,
  loadMatters,
  saveMatters,
  loadRagDocuments,
  saveRagDocuments,
  loadAuditLogs,
  saveAuditLogs,
  saveMatterAttachment,
  readMatterAttachment,
} from "./lib/storage.js";
import { analyzeMatterWithRag } from "./lib/analyzer.js";
import { transcribeAdaptiveMedia } from "./lib/transcribe.js";
import { runAssistantQuery } from "./lib/assistant.js";
import { extractDocumentText, stableBytesHash } from "./lib/document-text.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
loadEnvFromFileSync(ROOT_DIR);
const config = getConfig();

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const sessions = new Map();
const passwordResetCodes = new Map();
const transcriptionJobs = new Map();
const transcribeRateState = new Map();
const assistantAttachmentTextCache = new Map();
const db = {
  users: [],
  matters: [],
  ragDocuments: [],
  auditLogs: [],
};
const STATUS_LABELS = {
  NEW: "Новый",
  IN_REVIEW: "В работе",
  BLOCKED: "Стоп-фактор",
  READY: "Готов к запуску",
  CLOSED: "Закрыт",
};
const URGENCY_LABELS = {
  HIGH: "Высокий",
  MEDIUM: "Средний",
  LOW: "Низкий",
};
const TRANSCRIBE_ALLOWED_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "mp4", "mov", "webm"]);
const ASSISTANT_SUPPORTED_ATTACHMENT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log", "rtf", "doc", "docx", "pdf"]);
let bootPromise = null;

export async function requestHandler(req, res) {
  try {
    await ensureBootstrapped();

    if (req.method === "OPTIONS") {
      return sendOptions(res);
    }

    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `localhost:${config.port}`}`);
    const pathname = requestUrl.pathname;

    if (pathname.startsWith("/api/")) {
      return handleApi(req, res, requestUrl);
    }

    return serveStatic(res, pathname);
  } catch (error) {
    console.error("Unhandled server error", error);
    return json(res, 500, { error: "Internal server error" });
  }
}

async function bootstrap() {
  db.users = await loadUsers();
  db.matters = await loadMatters();
  db.ragDocuments = await loadRagDocuments();
  db.auditLogs = await loadAuditLogs();

  if (!db.users.length) {
    db.users = defaultUsers();
    await saveUsers(db.users);
  }
}

async function ensureBootstrapped() {
  if (!bootPromise) {
    bootPromise = bootstrap().catch((error) => {
      bootPromise = null;
      throw error;
    });
  }

  await bootPromise;
}

async function handleApi(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (req.method === "GET" && pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      time: nowIso(),
      openAiConfigured: Boolean(config.openaiApiKey),
      matters: db.matters.length,
      ragDocuments: db.ragDocuments.length,
    });
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    return login(req, res);
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    return register(req, res);
  }

  if (req.method === "POST" && pathname === "/api/auth/forgot-password") {
    return forgotPassword(req, res);
  }

  if (req.method === "POST" && pathname === "/api/auth/reset-password") {
    return resetPassword(req, res);
  }

  const user = authenticate(req);
  if (!user) {
    return json(res, 401, { error: "Unauthorized" });
  }

  if (req.method === "POST" && pathname === "/api/transcribe/start") {
    if (!can(user.role, "transcribe:use")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return startTranscriptionJob(req, res, user);
  }

  const transcribeStatusMatch = pathname.match(/^\/api\/transcribe\/status\/([^/]+)$/);
  if (req.method === "GET" && transcribeStatusMatch) {
    if (!can(user.role, "transcribe:use")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return getTranscriptionJobStatus(res, transcribeStatusMatch[1], user);
  }

  if (req.method === "POST" && pathname === "/api/transcribe") {
    if (!can(user.role, "transcribe:use")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return transcribeRecording(req, res, user);
  }

  if (req.method === "GET" && pathname === "/api/me") {
    return json(res, 200, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }

  if (req.method === "GET" && pathname === "/api/users") {
    if (!can(user.role, "users:read")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return json(res, 200, {
      users: db.users.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
      })),
    });
  }

  if (req.method === "GET" && pathname === "/api/kpis") {
    if (!can(user.role, "matters:read")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return json(res, 200, buildKpis(db.matters));
  }

  if (req.method === "GET" && pathname === "/api/matters") {
    if (!can(user.role, "matters:read")) {
      return json(res, 403, { error: "Forbidden" });
    }

    const status = (searchParams.get("status") || "ALL").toUpperCase();
    const query = (searchParams.get("q") || "").trim().toLowerCase();

    const matters = db.matters
      .filter((matter) => {
        const passStatus = status === "ALL" || matter.status === status;
        if (!passStatus) {
          return false;
        }

        if (!query) {
          return true;
        }

        const haystack = [
          matter.company,
          matter.contact,
          matter.industry,
          matter.summary,
          (matter.analysis?.tags || []).join(" "),
          (matter.analysis?.risks || []).map((risk) => risk.excerpt).join(" "),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return json(res, 200, { matters });
  }

  const singleMatterMatch = pathname.match(/^\/api\/matters\/([^/]+)$/);
  if (req.method === "GET" && singleMatterMatch) {
    if (!can(user.role, "matters:read")) {
      return json(res, 403, { error: "Forbidden" });
    }

    const matter = db.matters.find((item) => item.id === singleMatterMatch[1]);
    if (!matter) {
      return json(res, 404, { error: "Matter not found" });
    }

    await appendAuditEvent({
      user,
      req,
      action: "matter.read",
      matterId: matter.id,
    });

    return json(res, 200, { matter });
  }

  const matterAuditMatch = pathname.match(/^\/api\/matters\/([^/]+)\/audit$/);
  if (req.method === "GET" && matterAuditMatch) {
    if (!can(user.role, "matters:audit:read")) {
      return json(res, 403, { error: "Forbidden" });
    }

    const matterId = matterAuditMatch[1];
    const matter = db.matters.find((item) => item.id === matterId);
    if (!matter) {
      return json(res, 404, { error: "Matter not found" });
    }

    return json(res, 200, { trail: matter.auditTrail || [] });
  }

  const matterAttachmentsMatch = pathname.match(/^\/api\/matters\/([^/]+)\/attachments$/);
  if (req.method === "GET" && matterAttachmentsMatch) {
    if (!can(user.role, "matters:attachments:read")) {
      return json(res, 403, { error: "Forbidden" });
    }

    const matterId = matterAttachmentsMatch[1];
    const matter = db.matters.find((item) => item.id === matterId);
    if (!matter) {
      return json(res, 404, { error: "Matter not found" });
    }

    return json(res, 200, { attachments: matter.attachments || [] });
  }

  const attachmentDownloadMatch = pathname.match(/^\/api\/matters\/([^/]+)\/attachments\/([^/]+)\/download$/);
  if (req.method === "GET" && attachmentDownloadMatch) {
    if (!can(user.role, "matters:attachments:read")) {
      return json(res, 403, { error: "Forbidden" });
    }

    const matterId = attachmentDownloadMatch[1];
    const attachmentId = attachmentDownloadMatch[2];
    const matter = db.matters.find((item) => item.id === matterId);
    if (!matter) {
      return json(res, 404, { error: "Matter not found" });
    }

    const attachment = (matter.attachments || []).find((item) => item.id === attachmentId);
    if (!attachment) {
      return json(res, 404, { error: "Attachment not found" });
    }

    try {
      const bytes = await readMatterAttachment(attachment.storagePath);
      await appendAuditEvent({
        user,
        req,
        action: "attachment.download",
        matterId,
        meta: {
          attachmentId,
          fileName: attachment.name,
        },
      });

      appendMatterTrail(matter, {
        actor: user.email,
        type: "attachment_downloaded",
        summary: `Скачан файл ${attachment.name}`,
      });
      await saveMatters(db.matters);

      res.writeHead(200, {
        "Content-Type": attachment.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      });
      res.end(bytes);
      return;
    } catch (error) {
      return json(res, 500, { error: `Failed to read attachment: ${error.message}` });
    }
  }

  if (req.method === "POST" && pathname === "/api/matters") {
    if (!can(user.role, "matters:write")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return createMatter(req, res, user);
  }

  if (req.method === "POST" && pathname === "/api/matters/reset") {
    if (user.role !== Roles.OWNER) {
      return json(res, 403, { error: "Only OWNER can reset matters" });
    }

    db.matters = [];
    await saveMatters(db.matters);
    await appendAuditEvent({
      user,
      req,
      action: "matters.reset",
    });
    return json(res, 200, { ok: true });
  }

  const statusMatch = pathname.match(/^\/api\/matters\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    if (!can(user.role, "matters:status:update")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return updateMatterStatus(req, res, statusMatch[1], user);
  }

  const reanalyzeMatch = pathname.match(/^\/api\/matters\/([^/]+)\/reanalyze$/);
  if (req.method === "POST" && reanalyzeMatch) {
    if (!can(user.role, "matters:write")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return reanalyzeMatter(req, res, reanalyzeMatch[1], user);
  }

  if (req.method === "GET" && pathname === "/api/reports") {
    if (!can(user.role, "reports:generate")) {
      return json(res, 403, { error: "Forbidden" });
    }

    const scope = searchParams.get("scope") || "ALL";
    const report = buildReport(scope);
    await appendAuditEvent({
      user,
      req,
      action: "report.generate",
      matterId: scope !== "ALL" ? scope : undefined,
      meta: { scope },
    });

    if (scope !== "ALL") {
      const matter = db.matters.find((item) => item.id === scope);
      if (matter) {
        appendMatterTrail(matter, {
          actor: user.email,
          type: "report_generated",
          summary: "Сформирован отчет по кейсу",
        });
        await saveMatters(db.matters);
      }
    }

    return json(res, 200, report);
  }

  if (req.method === "POST" && pathname === "/api/assistant/query") {
    if (!can(user.role, "matters:read")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return queryAssistant(req, res, user);
  }

  if (req.method === "GET" && pathname === "/api/rag/documents") {
    if (!can(user.role, "rag:read")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return json(res, 200, { documents: db.ragDocuments });
  }

  if (req.method === "POST" && pathname === "/api/rag/documents") {
    if (!can(user.role, "rag:write")) {
      return json(res, 403, { error: "Forbidden" });
    }

    return addRagDocument(req, res, user);
  }

  return json(res, 404, { error: "Route not found" });
}

async function startTranscriptionJob(req, res, user) {
  if (!config.openaiApiKey) {
    return json(res, 400, { error: "OPENAI_API_KEY не задан. Добавь ключ в .env для авторасшифровки." });
  }

  const rateLimitError = enforceTranscriptionRateLimit(user.id);
  if (rateLimitError) {
    return json(res, 429, { error: rateLimitError });
  }

  const activeJobs = countActiveTranscriptionJobsByUser(user.id);
  if (activeJobs >= config.transcribeConcurrentJobsPerUser) {
    return json(res, 429, {
      error: `Достигнут лимит параллельных расшифровок (${config.transcribeConcurrentJobsPerUser}). Дождись завершения текущих задач.`,
    });
  }

  const parsed = await parseTranscriptionPayload(req, res);
  if (!parsed.ok) {
    return;
  }

  const jobId = generateId("transcribe-job");
  const job = {
    id: jobId,
    status: "queued",
    percent: 1,
    message: "Задача поставлена в очередь",
    mode: "pending",
    partsTotal: 0,
    partIndex: 0,
    fileName: parsed.fileName,
    ownerUserId: user.id,
    ownerEmail: user.email,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    text: "",
    error: "",
  };

  transcriptionJobs.set(jobId, job);
  pruneTranscriptionJobs();
  void processTranscriptionJob(jobId, parsed, user);
  await appendAuditEvent({
    user,
    req,
    action: "transcription.started",
    meta: {
      jobId,
      fileName: parsed.fileName,
    },
  });

  return json(res, 202, {
    ok: true,
    jobId,
    statusUrl: `/api/transcribe/status/${jobId}`,
  });
}

function getTranscriptionJobStatus(res, jobId, user) {
  const job = transcriptionJobs.get(jobId);
  if (!job) {
    return json(res, 404, { error: "Transcription job not found" });
  }

  if (job.ownerUserId !== user.id && user.role !== Roles.OWNER) {
    return json(res, 403, { error: "Forbidden" });
  }

  return json(res, 200, {
    ok: true,
    job: {
      id: job.id,
      status: job.status,
      percent: job.percent,
      message: job.message,
      mode: job.mode,
      partsTotal: job.partsTotal,
      partIndex: job.partIndex,
      fileName: job.fileName,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      error: job.error || undefined,
      text: job.status === "completed" ? job.text : undefined,
    },
  });
}

async function processTranscriptionJob(jobId, parsed, user) {
  const job = transcriptionJobs.get(jobId);
  if (!job) {
    return;
  }

  setJobProgress(jobId, {
    status: "running",
    percent: 3,
    message: "Подготовка к расшифровке",
  });

  try {
    const result = await transcribeAdaptiveMedia({
      apiKey: config.openaiApiKey,
      model: config.openaiTranscribeModel,
      filename: parsed.fileName,
      mimeType: parsed.mimeType,
      bytes: parsed.bytes,
      prompt: parsed.prompt,
      directMaxBytes: config.transcriptionDirectMaxBytes,
      segmentSeconds: config.transcriptionSegmentSeconds,
      onProgress: (progress) => {
        setJobProgress(jobId, {
          status: "running",
          percent: progress.percent,
          message: progress.message,
          mode: progress.mode,
          partsTotal: progress.partsTotal,
          partIndex: progress.partIndex,
        });
      },
    });

    setJobProgress(jobId, {
      status: "completed",
      percent: 100,
      message: "Расшифровка завершена",
      mode: result.mode,
      partsTotal: result.parts,
      partIndex: result.parts,
      text: result.text,
    });

    await appendAuditEvent({
      user,
      action: "transcription.completed",
      meta: {
        jobId,
        fileName: parsed.fileName,
        mode: result.mode,
        parts: result.parts,
      },
    });
  } catch (error) {
    setJobProgress(jobId, {
      status: "failed",
      percent: 100,
      message: "Ошибка расшифровки",
      error: error.message,
    });

    await appendAuditEvent({
      user,
      action: "transcription.failed",
      meta: {
        jobId,
        fileName: parsed.fileName,
        error: error.message,
      },
    });
  }
}

function setJobProgress(jobId, updates) {
  const job = transcriptionJobs.get(jobId);
  if (!job) {
    return;
  }

  Object.assign(job, updates, { updatedAt: nowIso() });
}

function pruneTranscriptionJobs(limit = 150) {
  if (transcriptionJobs.size <= limit) {
    return;
  }

  const entries = [...transcriptionJobs.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const job of entries) {
    if (transcriptionJobs.size <= limit) {
      break;
    }

    if (job.status === "completed" || job.status === "failed") {
      transcriptionJobs.delete(job.id);
    }
  }
}

function countActiveTranscriptionJobsByUser(userId) {
  let count = 0;
  transcriptionJobs.forEach((job) => {
    if (job.ownerUserId === userId && (job.status === "queued" || job.status === "running")) {
      count += 1;
    }
  });

  return count;
}

function enforceTranscriptionRateLimit(userId) {
  const now = Date.now();
  const windowMs = config.transcribeRateWindowMs;
  const maxRequests = config.transcribeRateLimit;
  const existing = transcribeRateState.get(userId) || [];
  const recent = existing.filter((ts) => now - ts < windowMs);
  if (recent.length >= maxRequests) {
    return `Превышен лимит расшифровок: ${maxRequests} запросов за ${Math.round(windowMs / 60000)} минут.`;
  }

  recent.push(now);
  transcribeRateState.set(userId, recent);
  return null;
}

async function transcribeRecording(req, res, user) {
  if (!config.openaiApiKey) {
    return json(res, 400, { error: "OPENAI_API_KEY не задан. Добавь ключ в .env для авторасшифровки." });
  }

  const rateLimitError = enforceTranscriptionRateLimit(user.id);
  if (rateLimitError) {
    return json(res, 429, { error: rateLimitError });
  }

  const parsed = await parseTranscriptionPayload(req, res);
  if (!parsed.ok) {
    return;
  }

  try {
    const result = await transcribeAdaptiveMedia({
      apiKey: config.openaiApiKey,
      model: config.openaiTranscribeModel,
      filename: parsed.fileName,
      mimeType: parsed.mimeType,
      bytes: parsed.bytes,
      prompt: parsed.prompt,
      directMaxBytes: config.transcriptionDirectMaxBytes,
      segmentSeconds: config.transcriptionSegmentSeconds,
    });

    return json(res, 200, {
      ok: true,
      fileName: parsed.fileName,
      model: config.openaiTranscribeModel,
      mode: result.mode,
      parts: result.parts,
      text: result.text,
    });
  } catch (error) {
    console.error("Transcription failed", error.message);
    return json(res, 502, { error: `Не удалось расшифровать запись: ${error.message}` });
  }
}

async function parseTranscriptionPayload(req, res) {
  let body;
  try {
    body = await parseJsonBody(req, { maxBytes: config.jsonBodyMaxBytes });
  } catch (error) {
    if (error.code === "PAYLOAD_TOO_LARGE") {
      json(res, 413, { error: "Payload too large" });
      return { ok: false };
    }

    json(res, 400, { error: "Invalid JSON body" });
    return { ok: false };
  }

  const fileName = `${body.fileName || "recording.bin"}`.trim();
  const mimeType = `${body.mimeType || "application/octet-stream"}`.trim();
  const prompt = `${body.prompt || ""}`.trim();
  const base64Payload = `${body.dataBase64 || body.dataUrl || ""}`.trim();
  const extension = getFileExtension(fileName);

  if (!TRANSCRIBE_ALLOWED_EXTENSIONS.has(extension)) {
    json(res, 400, {
      error: `Неподдерживаемый формат файла для расшифровки: ${extension || "unknown"}.`,
    });
    return { ok: false };
  }

  if (!base64Payload) {
    json(res, 400, { error: "dataBase64 is required" });
    return { ok: false };
  }

  let bytes;
  try {
    bytes = decodeBase64Payload(base64Payload);
  } catch {
    json(res, 400, { error: "Invalid base64 payload" });
    return { ok: false };
  }

  if (!bytes.length) {
    json(res, 400, { error: "Decoded file is empty" });
    return { ok: false };
  }

  if (bytes.length > config.transcriptionMaxBytes) {
    json(res, 413, {
      error: `Файл слишком большой. Лимит ${Math.round(config.transcriptionMaxBytes / (1024 * 1024))} МБ.`,
    });
    return { ok: false };
  }

  return {
    ok: true,
    fileName,
    mimeType,
    prompt,
    bytes,
  };
}

async function login(req, res) {
  let body;
  try {
    body = await parseJsonBody(req, { maxBytes: 1024 * 1024 });
  } catch (error) {
    if (error.code === "PAYLOAD_TOO_LARGE") {
      return json(res, 413, { error: "Payload too large" });
    }

    return json(res, 400, { error: "Invalid JSON body" });
  }

  const email = `${body.email || ""}`.trim().toLowerCase();
  const password = `${body.password || ""}`;

  const user = db.users.find((item) => item.email.toLowerCase() === email);
  if (!user || !verifyPassword(user, password)) {
    return json(res, 401, { error: "Invalid email or password" });
  }

  const token = createToken();
  sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
  });

  return json(res, 200, {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}

async function register(req, res) {
  let body;
  try {
    body = await parseJsonBody(req, { maxBytes: 1024 * 1024 });
  } catch (error) {
    if (error.code === "PAYLOAD_TOO_LARGE") {
      return json(res, 413, { error: "Payload too large" });
    }

    return json(res, 400, { error: "Invalid JSON body" });
  }

  const name = `${body.name || ""}`.trim();
  const email = `${body.email || ""}`.trim().toLowerCase();
  const password = `${body.password || ""}`;
  const roleInput = `${body.role || ""}`.trim().toUpperCase();
  const role = [Roles.ANALYST, Roles.VIEWER].includes(roleInput) ? roleInput : Roles.ANALYST;

  if (!name || name.length < 2) {
    return json(res, 400, { error: "name must be at least 2 chars" });
  }

  if (!isValidEmail(email)) {
    return json(res, 400, { error: "invalid email format" });
  }

  if (password.length < 8) {
    return json(res, 400, { error: "password must be at least 8 chars" });
  }

  const existing = db.users.find((item) => item.email.toLowerCase() === email);
  if (existing) {
    return json(res, 409, { error: "email already registered" });
  }

  const user = {
    id: generateId("user"),
    name,
    email,
    role,
    passwordHash: crypto.createHash("sha256").update(password).digest("hex"),
    createdAt: nowIso(),
  };

  db.users.push(user);
  await saveUsers(db.users);

  const token = createToken();
  sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
  });

  return json(res, 201, {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}

async function forgotPassword(req, res) {
  let body;
  try {
    body = await parseJsonBody(req, { maxBytes: 1024 * 1024 });
  } catch (error) {
    if (error.code === "PAYLOAD_TOO_LARGE") {
      return json(res, 413, { error: "Payload too large" });
    }

    return json(res, 400, { error: "Invalid JSON body" });
  }

  const email = `${body.email || ""}`.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return json(res, 400, { error: "invalid email format" });
  }

  const user = db.users.find((item) => item.email.toLowerCase() === email);
  if (!user) {
    return json(res, 200, {
      ok: true,
      message: "Если e-mail зарегистрирован, код восстановления отправлен.",
    });
  }

  const code = `${Math.floor(100000 + Math.random() * 900000)}`;
  passwordResetCodes.set(email, {
    code,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });

  return json(res, 200, {
    ok: true,
    message: "Код восстановления создан. Срок действия 15 минут.",
    demoCode: code,
  });
}

async function resetPassword(req, res) {
  let body;
  try {
    body = await parseJsonBody(req, { maxBytes: 1024 * 1024 });
  } catch (error) {
    if (error.code === "PAYLOAD_TOO_LARGE") {
      return json(res, 413, { error: "Payload too large" });
    }

    return json(res, 400, { error: "Invalid JSON body" });
  }

  const email = `${body.email || ""}`.trim().toLowerCase();
  const code = `${body.code || ""}`.trim();
  const newPassword = `${body.newPassword || ""}`;
  if (!isValidEmail(email)) {
    return json(res, 400, { error: "invalid email format" });
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return json(res, 400, { error: "invalid reset code" });
  }
  if (newPassword.length < 8) {
    return json(res, 400, { error: "password must be at least 8 chars" });
  }

  const entry = passwordResetCodes.get(email);
  if (!entry || entry.code !== code) {
    return json(res, 400, { error: "invalid or expired reset code" });
  }
  if (entry.expiresAt < Date.now()) {
    passwordResetCodes.delete(email);
    return json(res, 400, { error: "invalid or expired reset code" });
  }

  const user = db.users.find((item) => item.email.toLowerCase() === email);
  if (!user) {
    return json(res, 404, { error: "user not found" });
  }

  user.passwordHash = crypto.createHash("sha256").update(newPassword).digest("hex");
  user.updatedAt = nowIso();
  await saveUsers(db.users);
  passwordResetCodes.delete(email);
  clearUserSessions(user.id);

  return json(res, 200, {
    ok: true,
    message: "Пароль обновлен. Войди с новым паролем.",
  });
}

function authenticate(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  return db.users.find((user) => user.id === session.userId) || null;
}

function clearUserSessions(userId) {
  for (const [token, session] of sessions.entries()) {
    if (session.userId === userId) {
      sessions.delete(token);
    }
  }
}

async function createMatter(req, res, user) {
  let body;
  try {
    body = await parseJsonBody(req, { maxBytes: config.jsonBodyMaxBytes });
  } catch (error) {
    if (error.code === "PAYLOAD_TOO_LARGE") {
      return json(res, 413, { error: "Payload too large" });
    }

    return json(res, 400, { error: "Invalid JSON body" });
  }

  const payload = normalizeMatterPayload(body);
  if (!payload.ok) {
    return json(res, 400, { error: payload.error });
  }

  const matterId = generateId("matter");
  const preparedAttachments = prepareAttachments(payload.attachments);
  if (!preparedAttachments.ok) {
    return json(res, 400, { error: preparedAttachments.error });
  }

  const attachmentsTotalBytes = preparedAttachments.items.reduce((acc, item) => acc + item.bytes.length, 0);
  if (attachmentsTotalBytes > config.matterAttachmentsTotalMaxBytes) {
    return json(res, 413, {
      error: `Суммарный размер материалов превышает лимит ${Math.round(config.matterAttachmentsTotalMaxBytes / (1024 * 1024))} МБ.`,
    });
  }

  const matterBase = {
    id: matterId,
    company: payload.company,
    contact: payload.contact,
    industry: payload.industry,
    sourceType: payload.sourceType,
    summary: payload.summary,
    rawText: payload.rawText,
    meetingNotes: payload.meetingNotes,
    routineContext: payload.routineContext,
    disclaimerAccepted: payload.disclaimerAccepted,
    disclaimerVersion: "LEGAL-DISCLAIMER-V1",
    attachments: [],
    auditTrail: [],
    status: "NEW",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: user.email,
  };

  for (const item of preparedAttachments.items) {
    const attachmentId = generateId("att");
    const saved = await saveMatterAttachment({
      matterId,
      attachmentId,
      fileName: item.name,
      bytes: item.bytes,
    });

    matterBase.attachments.push({
      id: attachmentId,
      name: item.name,
      type: item.type,
      extension: item.extension,
      sizeBytes: item.bytes.length,
      sizeKb: Math.max(1, Math.round(item.bytes.length / 1024)),
      sha256: crypto.createHash("sha256").update(item.bytes).digest("hex"),
      storagePath: saved.relativePath,
      uploadedAt: nowIso(),
      uploadedBy: user.email,
    });
  }

  const analysis = await analyzeMatterWithRag({
    matter: matterBase,
    ragDocuments: db.ragDocuments,
    openAiConfig: config,
  });

  const matter = {
    ...matterBase,
    analysis,
  };

  appendMatterTrail(matter, {
    actor: user.email,
    type: "matter_created",
    summary: "Кейс создан",
    meta: {
      attachments: matter.attachments.length,
    },
  });

  db.matters.unshift(matter);
  await saveMatters(db.matters);
  await appendAuditEvent({
    user,
    req,
    action: "matter.create",
    matterId: matter.id,
    meta: {
      attachments: matter.attachments.length,
    },
  });

  return json(res, 201, { matter });
}

async function updateMatterStatus(req, res, matterId, user) {
  const matter = db.matters.find((item) => item.id === matterId);
  if (!matter) {
    return json(res, 404, { error: "Matter not found" });
  }

  let body;
  try {
    body = await parseJsonBody(req, { maxBytes: 1024 * 1024 });
  } catch (error) {
    if (error.code === "PAYLOAD_TOO_LARGE") {
      return json(res, 413, { error: "Payload too large" });
    }

    return json(res, 400, { error: "Invalid JSON body" });
  }

  const status = `${body.status || ""}`.trim().toUpperCase();
  const statusSet = new Set(["NEW", "IN_REVIEW", "BLOCKED", "READY", "CLOSED"]);
  if (!statusSet.has(status)) {
    return json(res, 400, { error: "Invalid status" });
  }

  matter.status = status;
  matter.updatedAt = nowIso();
  matter.updatedBy = user.email;

  appendMatterTrail(matter, {
    actor: user.email,
    type: "status_changed",
    summary: `Статус изменен на ${statusLabel(status)}`,
    meta: { status },
  });

  await saveMatters(db.matters);
  await appendAuditEvent({
    user,
    req,
    action: "matter.status.update",
    matterId: matter.id,
    meta: { status },
  });
  return json(res, 200, { matter });
}

async function reanalyzeMatter(_req, res, matterId, user) {
  const matter = db.matters.find((item) => item.id === matterId);
  if (!matter) {
    return json(res, 404, { error: "Matter not found" });
  }

  const analysis = await analyzeMatterWithRag({
    matter,
    ragDocuments: db.ragDocuments,
    openAiConfig: config,
  });

  matter.analysis = analysis;
  matter.updatedAt = nowIso();
  matter.updatedBy = user.email;

  appendMatterTrail(matter, {
    actor: user.email,
    type: "matter_reanalyzed",
    summary: `Кейс переанализирован (${analysis.engine})`,
    meta: {
      engine: analysis.engine,
      riskScore: analysis.riskScore,
    },
  });

  await saveMatters(db.matters);
  await appendAuditEvent({
    user,
    action: "matter.reanalyze",
    matterId: matter.id,
    meta: {
      engine: analysis.engine,
      riskScore: analysis.riskScore,
    },
  });
  return json(res, 200, { matter });
}

async function queryAssistant(req, res, user) {
  let body;
  try {
    body = await parseJsonBody(req, { maxBytes: 1024 * 1024 });
  } catch (error) {
    if (error.code === "PAYLOAD_TOO_LARGE") {
      return json(res, 413, { error: "Payload too large" });
    }

    return json(res, 400, { error: "Invalid JSON body" });
  }

  const prompt = `${body.prompt || ""}`.trim();
  const matterId = `${body.matterId || ""}`.trim();
  const history = normalizeAssistantHistory(body.history);
  if (!prompt) {
    return json(res, 400, { error: "prompt is required" });
  }

  const matter = matterId ? db.matters.find((item) => item.id === matterId) : null;
  if (matterId && !matter) {
    return json(res, 404, { error: "Matter not found" });
  }

  try {
    const assistantDocuments = await buildAssistantDocuments(matter);
    const llm = await runAssistantQuery({
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
      prompt,
      matter,
      documents: assistantDocuments,
      history,
      ragTopK: config.ragTopK,
    });

    if (!llm) {
      return json(res, 200, {
        mode: "fallback",
        reply:
          "LLM пока не настроен. Добавь OPENAI_API_KEY в backend/.env, и я начну отвечать как полноценный юр-ассистент с учетом практики РФ.",
        references: [],
        sources: [],
      });
    }

    await appendAuditEvent({
      user,
      req,
      action: "assistant.query",
      matterId: matter?.id,
      meta: {
        promptPreview: prompt.slice(0, 180),
        contextCount: llm.contextDocs.length,
        historyCount: history.length,
      },
    });

    return json(res, 200, {
      mode: "llm",
      reply: llm.reply,
      references: llm.contextDocs.map((doc) => doc.title),
      sources: llm.contextDocs,
    });
  } catch (error) {
    return json(res, 500, { error: `Assistant failed: ${error.message}` });
  }
}

async function buildAssistantDocuments(matter) {
  const documents = [
    ...mapRagDocuments(db.ragDocuments),
    ...buildMatterDocuments(matter),
  ];

  if (matter) {
    const attachmentDocs = await buildMatterAttachmentDocuments(matter);
    documents.push(...attachmentDocs);
  }

  return documents.slice(0, 180);
}

function mapRagDocuments(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      id: item.id,
      title: item.title,
      content: `${item.content || ""}`.slice(0, 5000),
      tags: item.tags || [],
      sourceType: "rag",
    }))
    .filter((item) => item.content);
}

function buildMatterDocuments(matter) {
  if (!matter) {
    return [];
  }

  const documents = [];
  const baseTags = ["case", matter.industry || "SMB"];

  if (matter.summary) {
    documents.push({
      id: `matter-${matter.id}-summary`,
      title: `Кейс ${matter.company}: сводка`,
      content: matter.summary,
      tags: [...baseTags, "summary"],
      sourceType: "matter",
    });
  }

  const rawChunks = chunkText(matter.rawText || "", 1600, 220).slice(0, 8);
  rawChunks.forEach((chunk, index) => {
    documents.push({
      id: `matter-${matter.id}-raw-${index + 1}`,
      title: `Кейс ${matter.company}: фактура ${index + 1}`,
      content: chunk,
      tags: [...baseTags, "raw_text"],
      sourceType: "matter",
    });
  });

  if (matter.meetingNotes) {
    documents.push({
      id: `matter-${matter.id}-meeting`,
      title: `Кейс ${matter.company}: конспект записи`,
      content: matter.meetingNotes,
      tags: [...baseTags, "meeting_notes"],
      sourceType: "matter",
    });
  }

  if (matter.routineContext) {
    documents.push({
      id: `matter-${matter.id}-routine`,
      title: `Кейс ${matter.company}: рутинный контекст`,
      content: matter.routineContext,
      tags: [...baseTags, "routine"],
      sourceType: "matter",
    });
  }

  const analysisLines = [];
  if (matter.analysis?.risks?.length) {
    analysisLines.push(
      ...matter.analysis.risks.slice(0, 6).map((risk, index) => `${index + 1}. ${risk.category}: ${risk.excerpt}`),
    );
  }
  if (matter.analysis?.timeline?.length) {
    analysisLines.push(...matter.analysis.timeline.slice(0, 6).map((item) => timelineText(item)));
  }
  if (matter.analysis?.obligations?.length) {
    analysisLines.push(...matter.analysis.obligations.slice(0, 6));
  }
  if (analysisLines.length) {
    documents.push({
      id: `matter-${matter.id}-analysis`,
      title: `Кейс ${matter.company}: извлеченные риски и сроки`,
      content: analysisLines.join("\n"),
      tags: [...baseTags, "analysis"],
      sourceType: "analysis",
    });
  }

  return documents;
}

async function buildMatterAttachmentDocuments(matter) {
  if (!Array.isArray(matter?.attachments) || !matter.attachments.length) {
    return [];
  }

  const documents = [];
  for (const attachment of matter.attachments.slice(0, 24)) {
    const extension = `${attachment.extension || getFileExtension(attachment.name) || ""}`.toLowerCase();
    if (!ASSISTANT_SUPPORTED_ATTACHMENT_EXTENSIONS.has(extension)) {
      continue;
    }

    if (Number(attachment.sizeBytes || 0) > 10 * 1024 * 1024) {
      continue;
    }

    try {
      const bytes = await readMatterAttachment(attachment.storagePath);
      const cacheKey = `${attachment.sha256 || stableBytesHash(bytes)}:${extension}`;
      let extracted = assistantAttachmentTextCache.get(cacheKey);
      if (!extracted) {
        extracted = await extractDocumentText({
          bytes,
          extension,
          fileName: attachment.name,
          ocr: {
            maxPages: config.ocrMaxPages,
            dpi: config.ocrImageDpi,
            tesseractLang: config.ocrTesseractLang,
            enableOpenAiFallback: config.ocrUseOpenAiFallback,
            openAiApiKey: config.openaiApiKey,
            openAiModel: config.openaiModel,
            openAiMaxPages: config.ocrOpenAiMaxPages,
          },
        });
        assistantAttachmentTextCache.set(cacheKey, extracted);
      }

      const content = `${extracted?.text || ""}`.trim();
      if (!content || content.length < 40) {
        continue;
      }

      const chunks = chunkText(content, 1600, 220).slice(0, 6);
      chunks.forEach((chunk, index) => {
        documents.push({
          id: `attachment-${attachment.id}-${index + 1}`,
          title: `Материал дела: ${attachment.name} (${index + 1})`,
          content: chunk,
          tags: ["attachment", extension, extracted?.method || "unknown"],
          sourceType: "attachment",
        });
      });
    } catch {
      // skip unreadable attachment
    }
  }

  return documents;
}

function normalizeAssistantHistory(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      text: `${item?.text || ""}`.trim(),
    }))
    .filter((item) => item.text)
    .slice(-12);
}

function chunkText(text, size = 1600, overlap = 220) {
  const cleaned = `${text || ""}`.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return [];
  }

  const safeSize = Math.max(400, Number(size) || 1600);
  const safeOverlap = Math.max(0, Math.min(safeSize - 120, Number(overlap) || 220));
  const chunks = [];
  let offset = 0;

  while (offset < cleaned.length) {
    const end = Math.min(cleaned.length, offset + safeSize);
    chunks.push(cleaned.slice(offset, end).trim());
    if (end >= cleaned.length) {
      break;
    }

    offset = Math.max(0, end - safeOverlap);
  }

  return chunks.filter(Boolean);
}

async function addRagDocument(req, res, user) {
  let body;
  try {
    body = await parseJsonBody(req, { maxBytes: 4 * 1024 * 1024 });
  } catch (error) {
    if (error.code === "PAYLOAD_TOO_LARGE") {
      return json(res, 413, { error: "Payload too large" });
    }

    return json(res, 400, { error: "Invalid JSON body" });
  }

  const title = `${body.title || ""}`.trim();
  const content = `${body.content || ""}`.trim();
  const tags = Array.isArray(body.tags)
    ? body.tags.map((item) => `${item}`.trim()).filter(Boolean).slice(0, 12)
    : [];

  if (!title || !content) {
    return json(res, 400, { error: "title and content are required" });
  }

  const document = {
    id: generateId("rag"),
    title,
    content,
    tags,
    createdAt: nowIso(),
    createdBy: user.email,
  };

  db.ragDocuments.unshift(document);
  await saveRagDocuments(db.ragDocuments);
  await appendAuditEvent({
    user,
    req,
    action: "rag.document.create",
    meta: { documentId: document.id },
  });

  return json(res, 201, { document });
}

function normalizeMatterPayload(body) {
  const company = `${body.company || ""}`.trim();
  const contact = `${body.contact || ""}`.trim() || "Не указано";
  const industry = `${body.industry || ""}`.trim() || "Не указано";
  const sourceType = `${body.sourceType || ""}`.trim() || "Комбинированный";
  const summary = `${body.summary || ""}`.trim() || "Не указано";
  const rawText = `${body.rawText || ""}`.trim();
  const meetingNotes = `${body.meetingNotes || ""}`.trim();
  const routineContext = `${body.routineContext || ""}`.trim();
  const disclaimerAccepted = Boolean(body.disclaimerAccepted);
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!company) {
    return { ok: false, error: "company is required" };
  }

  if (!rawText) {
    return { ok: false, error: "rawText is required" };
  }

  if (!disclaimerAccepted) {
    return { ok: false, error: "disclaimerAccepted is required" };
  }

  if (!Array.isArray(attachments)) {
    return { ok: false, error: "attachments must be an array" };
  }

  return {
    ok: true,
    company,
    contact,
    industry,
    sourceType,
    summary,
    rawText,
    meetingNotes,
    routineContext,
    disclaimerAccepted,
    attachments,
  };
}

function prepareAttachments(attachmentsInput) {
  const prepared = [];

  for (const item of attachmentsInput) {
    const name = `${item?.name || ""}`.trim();
    const type = `${item?.type || "application/octet-stream"}`.trim();
    const dataBase64 = `${item?.dataBase64 || item?.dataUrl || ""}`.trim();

    if (!name) {
      return { ok: false, error: "attachment.name is required" };
    }

    if (!dataBase64) {
      return { ok: false, error: `attachment data is required for ${name}` };
    }

    let bytes;
    try {
      bytes = decodeBase64Payload(dataBase64);
    } catch {
      return { ok: false, error: `invalid base64 for attachment ${name}` };
    }

    if (!bytes.length) {
      return { ok: false, error: `attachment ${name} is empty` };
    }

    if (bytes.length > config.matterAttachmentMaxBytes) {
      return {
        ok: false,
        error: `файл ${name} превышает лимит ${Math.round(config.matterAttachmentMaxBytes / (1024 * 1024))} МБ`,
      };
    }

    prepared.push({
      name,
      type,
      extension: getFileExtension(name),
      bytes,
    });
  }

  return { ok: true, items: prepared };
}

function appendMatterTrail(matter, item) {
  if (!Array.isArray(matter.auditTrail)) {
    matter.auditTrail = [];
  }

  matter.auditTrail.unshift({
    id: generateId("trail"),
    at: nowIso(),
    actor: item.actor || "system",
    type: item.type || "event",
    summary: item.summary || "Событие",
    meta: item.meta || {},
  });

  if (matter.auditTrail.length > 250) {
    matter.auditTrail = matter.auditTrail.slice(0, 250);
  }
}

async function appendAuditEvent({ user, req, action, matterId, meta = {} }) {
  const entry = {
    id: generateId("audit"),
    at: nowIso(),
    action,
    matterId: matterId || null,
    userId: user?.id || "anonymous",
    userEmail: user?.email || "anonymous",
    role: user?.role || "ANON",
    ip: extractClientIp(req),
    userAgent: req?.headers?.["user-agent"] || "",
    meta,
  };

  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 5000) {
    db.auditLogs = db.auditLogs.slice(0, 5000);
  }

  await saveAuditLogs(db.auditLogs);
}

function buildKpis(matters) {
  const total = matters.length;
  const active = matters.filter((matter) => matter.status !== "CLOSED").length;
  const highRisk = matters.filter((matter) => matter.analysis?.urgency === "HIGH" && matter.status !== "CLOSED").length;
  const avgRisk = total
    ? Math.round(
        matters.reduce((acc, matter) => acc + Number(matter.analysis?.riskScore || 0), 0) / Math.max(1, total),
      )
    : 0;
  const obligations = matters.reduce((acc, matter) => acc + (matter.analysis?.obligations?.length || 0), 0);

  return {
    total,
    active,
    highRisk,
    avgRisk,
    obligations,
  };
}

function buildReport(scope) {
  const targets = scope === "ALL" ? db.matters : db.matters.filter((matter) => matter.id === scope);
  if (!targets.length) {
    return {
      scope,
      markdown: "Нет данных для отчета.",
      generatedAt: nowIso(),
      items: [],
    };
  }

  const highRisks = targets.filter((matter) => matter.analysis?.urgency === "HIGH").length;
  const lines = [
    "# Управленческий юридический отчет",
    "",
    `Дата: ${new Date().toLocaleString("ru-RU")}`,
    `Кейсов в отчете: ${targets.length}`,
    `Критичные кейсы: ${highRisks}`,
    "",
  ];

  targets.forEach((matter, index) => {
    lines.push(`## ${index + 1}. ${matter.company}`);
    lines.push(`- Контакт: ${matter.contact}`);
    lines.push(`- Сфера: ${matter.industry}`);
    lines.push(`- Источник: ${matter.sourceType}`);
    lines.push(`- Статус: ${statusLabel(matter.status)}`);
    lines.push(
      `- Индекс риска: ${matter.analysis?.riskScore || 0}/100 (${urgencyLabel(matter.analysis?.urgency || "LOW")})`,
    );
    lines.push(`- Движок анализа: ${matter.analysis?.engine || "unknown"}`);
    lines.push(`- Кейс: ${matter.summary}`);
    lines.push("");

    lines.push("### Основные риски");
    const risks = matter.analysis?.risks || [];
    if (!risks.length) {
      lines.push("1. Явные риски не выделены");
    } else {
      risks.forEach((risk, riskIndex) => {
        lines.push(`${riskIndex + 1}. ${urgencyLabel(risk.severity)} · ${risk.category} · ${risk.excerpt}`);
      });
    }

    lines.push("");
    lines.push("### События и сроки");
    const timeline = matter.analysis?.timeline || [];
    if (!timeline.length) {
      lines.push("1. Таймлайн не извлечен автоматически");
    } else {
      timeline.forEach((event, timelineIndex) => {
        lines.push(`${timelineIndex + 1}. ${timelineText(event)}`);
      });
    }

    lines.push("");
    lines.push("### План действий на 72 часа");
    const actions = matter.analysis?.actions || [];
    if (!actions.length) {
      lines.push("1. Провести первичную риск-сессию с собственником и юристом кейса");
    } else {
      actions.forEach((action, actionIndex) => {
        lines.push(`${actionIndex + 1}. ${action}`);
      });
    }

    lines.push("");
    lines.push("### Релевантные ссылки практики (RAG)");
    const references = matter.analysis?.legalReferences || [];
    if (!references.length) {
      lines.push("1. Контекст не найден");
    } else {
      references.forEach((ref, refIndex) => {
        lines.push(`${refIndex + 1}. ${ref}`);
      });
    }

    lines.push("");
  });

  lines.push("## Системная рекомендация");
  lines.push(
    "Утвердить ответственного по каждому кейсу, вести единый письменный контур (почта/ЭДО), раз в неделю проводить короткий статус-колл по рискам и срокам.",
  );
  lines.push("");
  lines.push("## Юридический дисклеймер");
  lines.push(
    "Материалы сформированы ИИ как вспомогательный инструмент legal operations и не являются самостоятельным юридическим заключением или процессуальной позицией.",
  );
  lines.push("Финальные выводы и решения принимает уполномоченный юрист/руководитель юридической функции.");

  return {
    scope,
    generatedAt: nowIso(),
    items: targets,
    markdown: lines.join("\n"),
  };
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function urgencyLabel(level) {
  return URGENCY_LABELS[level] || level;
}

function timelineText(event) {
  if (typeof event === "string") {
    return event;
  }

  return event?.event || "";
}

function decodeBase64Payload(input) {
  const raw = `${input || ""}`.trim();
  const commaIndex = raw.indexOf(",");
  const payload = commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
  const normalized = payload.replace(/\s/g, "");
  return Buffer.from(normalized, "base64");
}

function getFileExtension(fileName) {
  const lower = `${fileName || ""}`.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === lower.length - 1) {
    return "";
  }

  return lower.slice(dotIndex + 1);
}

function extractClientIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req?.socket?.remoteAddress || "";
}

function verifyPassword(user, inputPassword) {
  if (!inputPassword) {
    return false;
  }

  if (user.passwordHash) {
    const hashed = crypto.createHash("sha256").update(inputPassword).digest("hex");
    return hashed === user.passwordHash;
  }

  return inputPassword === user.password;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function defaultUsers() {
  return [
    {
      id: "user-owner",
      name: "Demo Owner",
      email: "owner@demo.legalops",
      role: Roles.OWNER,
      passwordHash: "43a0d17178a9d26c9e0fe9a74b0b45e38d32f27aed887a008a54bf6e033bf7b9",
    },
    {
      id: "user-manager",
      name: "Demo Legal Manager",
      email: "manager@demo.legalops",
      role: Roles.LEGAL_MANAGER,
      passwordHash: "866485796cfa8d7c0cf7111640205b83076433547577511d81f8030ae99ecea5",
    },
    {
      id: "user-analyst",
      name: "Demo Analyst",
      email: "analyst@demo.legalops",
      role: Roles.ANALYST,
      passwordHash: "20249749412d73a3f5799f6f1dcf910e7b4aa3ce4de133b1f8a63c044792a4e9",
    },
    {
      id: "user-viewer",
      name: "Demo Viewer",
      email: "viewer@demo.legalops",
      role: Roles.VIEWER,
      passwordHash: "65375049b9e4d7cad6c9ba286fdeb9394b28135a3e84136404cfccfdcc438894",
    },
  ];
}

function sendOptions(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  });
  res.end();
}

async function serveStatic(res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const targetPath = path.normalize(path.join(ROOT_DIR, normalized));

  if (!targetPath.startsWith(ROOT_DIR)) {
    return json(res, 403, { error: "Forbidden" });
  }

  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isFile()) {
      return json(res, 404, { error: "Not found" });
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = mimeByExt[ext] || "application/octet-stream";
    const content = await fs.readFile(targetPath);

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch {
    return json(res, 404, { error: "Not found" });
  }
}

function loadEnvFromFileSync(rootDir) {
  const envPath = path.join(rootDir, ".env");
  if (!fsSync.existsSync(envPath)) {
    return;
  }

  const content = fsSync.readFileSync(envPath, "utf-8");
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        return;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
}

export default requestHandler;

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  await ensureBootstrapped();
  const server = http.createServer(requestHandler);
  server.listen(config.port, () => {
    console.log(`ЮрОперации ИИ backend запущен на http://localhost:${config.port}`);
    console.log(`Loaded matters: ${db.matters.length}, RAG docs: ${db.ragDocuments.length}, users: ${db.users.length}`);
  });
}
