import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DATA_DIR } from "./config.js";

const FILES = {
  users: path.join(DATA_DIR, "users.json"),
  matters: path.join(DATA_DIR, "matters.json"),
  ragDocuments: path.join(DATA_DIR, "rag_documents.json"),
  auditLogs: path.join(DATA_DIR, "audit_logs.json"),
};
const ATTACHMENTS_DIR = path.join(DATA_DIR, "attachments");
const TMP_ATTACHMENTS_DIR = path.join(os.tmpdir(), "ai-legal-ops-attachments");
const memoryStore = {
  users: null,
  matters: null,
  ragDocuments: null,
  auditLogs: null,
};
let preferMemoryStorage = false;

async function readFileSafe(filePath, fallback) {
  if (preferMemoryStorage) {
    return fallback;
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeFile(filePath, data) {
  if (preferMemoryStorage) {
    return;
  }

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  } catch (error) {
    if (isReadonlyFsError(error)) {
      preferMemoryStorage = true;
      return;
    }

    throw error;
  }
}

export async function loadUsers() {
  if (Array.isArray(memoryStore.users)) {
    return memoryStore.users;
  }

  const value = await readFileSafe(FILES.users, []);
  memoryStore.users = value;
  return value;
}

export async function saveUsers(users) {
  memoryStore.users = users;
  return writeFile(FILES.users, users);
}

export async function loadMatters() {
  if (Array.isArray(memoryStore.matters)) {
    return memoryStore.matters;
  }

  const value = await readFileSafe(FILES.matters, []);
  memoryStore.matters = value;
  return value;
}

export async function saveMatters(matters) {
  memoryStore.matters = matters;
  return writeFile(FILES.matters, matters);
}

export async function loadRagDocuments() {
  if (Array.isArray(memoryStore.ragDocuments)) {
    return memoryStore.ragDocuments;
  }

  const value = await readFileSafe(FILES.ragDocuments, []);
  memoryStore.ragDocuments = value;
  return value;
}

export async function saveRagDocuments(documents) {
  memoryStore.ragDocuments = documents;
  return writeFile(FILES.ragDocuments, documents);
}

export async function loadAuditLogs() {
  if (Array.isArray(memoryStore.auditLogs)) {
    return memoryStore.auditLogs;
  }

  const value = await readFileSafe(FILES.auditLogs, []);
  memoryStore.auditLogs = value;
  return value;
}

export async function saveAuditLogs(logs) {
  memoryStore.auditLogs = logs;
  return writeFile(FILES.auditLogs, logs);
}

export async function saveMatterAttachment({ matterId, attachmentId, fileName, bytes }) {
  const safeMatterId = toSafeName(matterId);
  const safeFileName = toSafeName(fileName || "attachment.bin");
  const baseDir = preferMemoryStorage ? TMP_ATTACHMENTS_DIR : ATTACHMENTS_DIR;
  const targetDir = path.join(baseDir, safeMatterId);
  const targetName = `${toSafeName(attachmentId)}__${safeFileName}`;
  const targetPath = path.join(targetDir, targetName);

  try {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, bytes);
  } catch (error) {
    if (!isReadonlyFsError(error)) {
      throw error;
    }

    preferMemoryStorage = true;
    const tmpTargetDir = path.join(TMP_ATTACHMENTS_DIR, safeMatterId);
    const tmpTargetPath = path.join(tmpTargetDir, targetName);
    await fs.mkdir(tmpTargetDir, { recursive: true });
    await fs.writeFile(tmpTargetPath, bytes);
    return {
      relativePath: tmpTargetPath,
      fileName: safeFileName,
    };
  }

  return {
    relativePath: preferMemoryStorage ? targetPath : path.relative(DATA_DIR, targetPath),
    fileName: safeFileName,
  };
}

export async function readMatterAttachment(relativePath) {
  const raw = `${relativePath || ""}`.trim();
  if (!raw) {
    throw new Error("Invalid attachment path");
  }

  if (path.isAbsolute(raw)) {
    const normalizedAbs = path.normalize(raw);
    if (!normalizedAbs.startsWith(TMP_ATTACHMENTS_DIR)) {
      throw new Error("Invalid attachment path");
    }

    return fs.readFile(normalizedAbs);
  }

  const normalized = path.normalize(raw).replace(/^(\.\.(\/|\\|$))+/, "");
  const targetPath = path.join(DATA_DIR, normalized);
  if (!targetPath.startsWith(DATA_DIR)) {
    throw new Error("Invalid attachment path");
  }

  return fs.readFile(targetPath);
}

function toSafeName(value) {
  return `${value || ""}`.replace(/[^\w.\-]+/g, "_").slice(0, 180) || "file";
}

function isReadonlyFsError(error) {
  return ["EROFS", "EPERM", "EACCES"].includes(error?.code);
}
