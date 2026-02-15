import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export async function transcribeAdaptiveMedia({
  apiKey,
  model,
  filename,
  mimeType,
  bytes,
  prompt = "",
  directMaxBytes = 20 * 1024 * 1024,
  segmentSeconds = 900,
  onProgress = null,
}) {
  if (typeof onProgress === "function") {
    onProgress({ stage: "prepare", message: "Подготовка файла", percent: 5, mode: "pending" });
  }

  if (bytes.length <= directMaxBytes) {
    if (typeof onProgress === "function") {
      onProgress({ stage: "single", message: "Отправка файла в расшифровку", percent: 20, mode: "single", partsTotal: 1, partIndex: 0 });
    }

    const text = await transcribeMedia({
      apiKey,
      model,
      filename,
      mimeType,
      bytes,
      prompt,
    });

    if (typeof onProgress === "function") {
      onProgress({ stage: "done", message: "Расшифровка завершена", percent: 100, mode: "single", partsTotal: 1, partIndex: 1 });
    }

    return {
      text,
      mode: "single",
      parts: 1,
    };
  }

  return transcribeSegmentedMedia({
    apiKey,
    model,
    filename,
    mimeType,
    bytes,
    prompt,
    segmentSeconds,
    onProgress,
  });
}

async function transcribeSegmentedMedia({ apiKey, model, filename, mimeType, bytes, prompt, segmentSeconds, onProgress }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "legalops-transcribe-"));
  const inputExt = guessInputExtension(filename, mimeType);
  const inputPath = path.join(tempDir, `source.${inputExt}`);
  const outPattern = path.join(tempDir, "part-%03d.mp3");

  try {
    await fs.writeFile(inputPath, bytes);
    if (typeof onProgress === "function") {
      onProgress({ stage: "segmenting", message: "Нарезка большого файла на части", percent: 8, mode: "segmented" });
    }

    await runCommand("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "48k",
      "-f",
      "segment",
      "-segment_time",
      String(Math.max(120, segmentSeconds)),
      outPattern,
    ]);

    const files = (await fs.readdir(tempDir))
      .filter((name) => /^part-\d{3}\.mp3$/i.test(name))
      .sort((a, b) => a.localeCompare(b));

    if (!files.length) {
      throw new Error("ffmpeg не создал сегменты для расшифровки");
    }

    const chunkTexts = [];
    if (typeof onProgress === "function") {
      onProgress({
        stage: "transcribing",
        message: `Начинаю расшифровку частей (${files.length})`,
        percent: 12,
        mode: "segmented",
        partsTotal: files.length,
        partIndex: 0,
      });
    }

    for (const [index, file] of files.entries()) {
      const partBytes = await fs.readFile(path.join(tempDir, file));
      if (typeof onProgress === "function") {
        const percent = Math.min(96, 12 + Math.round((index / Math.max(1, files.length)) * 82));
        onProgress({
          stage: "transcribing",
          message: `Расшифровка части ${index + 1} из ${files.length}`,
          percent,
          mode: "segmented",
          partsTotal: files.length,
          partIndex: index + 1,
        });
      }

      const partText = await transcribeMedia({
        apiKey,
        model,
        filename: file,
        mimeType: "audio/mpeg",
        bytes: partBytes,
        prompt,
      });

      chunkTexts.push(`[Часть ${index + 1}]\n${partText}`);
    }

    return {
      text: chunkTexts.join("\n\n"),
      mode: "segmented",
      parts: files.length,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function transcribeMedia({ apiKey, model, filename, mimeType, bytes, prompt = "" }) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const blob = new Blob([bytes], { type: mimeType || "application/octet-stream" });
  const form = new FormData();
  form.set("model", model);
  form.set("file", blob, filename || "recording.bin");

  const sanitizedPrompt = `${prompt}`.trim();
  if (sanitizedPrompt) {
    form.set("prompt", sanitizedPrompt.slice(0, 500));
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI transcription error ${response.status}: ${text.slice(0, 280)}`);
  }

  const payload = await response.json();
  const text = `${payload?.text || ""}`.trim();

  if (!text) {
    throw new Error("OpenAI transcription returned empty text");
  }

  return text;
}

function guessInputExtension(filename, mimeType) {
  const lowerName = `${filename || ""}`.toLowerCase();
  if (lowerName.endsWith(".wav")) return "wav";
  if (lowerName.endsWith(".m4a")) return "m4a";
  if (lowerName.endsWith(".ogg")) return "ogg";
  if (lowerName.endsWith(".mp4")) return "mp4";
  if (lowerName.endsWith(".mov")) return "mov";
  if (lowerName.endsWith(".webm")) return "webm";
  if (lowerName.endsWith(".mp3")) return "mp3";

  const mime = `${mimeType || ""}`.toLowerCase();
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";

  return "bin";
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
      if (stderr.length > 6000) {
        stderr = stderr.slice(-6000);
      }
    });

    child.on("error", (error) => {
      reject(new Error(`Не удалось запустить ${command}: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} завершился с кодом ${code}. ${stderr}`));
    });
  });
}
