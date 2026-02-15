import { retrieveContext } from "./rag.js";

export async function runAssistantQuery({
  apiKey,
  model,
  prompt,
  matter,
  documents = [],
  history = [],
  ragTopK = 4,
}) {
  if (!apiKey) {
    return null;
  }

  const normalizedHistory = normalizeHistory(history);
  const query = [prompt, matter?.summary || "", matter?.rawText || "", normalizedHistory.map((item) => item.text).join("\n")]
    .filter(Boolean)
    .join("\n");

  const contextDocs = retrieveContext({
    query,
    documents,
    topK: Math.max(4, ragTopK + 2),
  });

  const matterBlock = matter
    ? [
        `Кейс: ${matter.company || "без названия"}`,
        `Статус: ${matter.status || "NEW"}`,
        `Сводка: ${matter.summary || "нет"}`,
        `Контакт: ${matter.contact || "не указан"}`,
        `Сфера: ${matter.industry || "не указана"}`,
      ].join("\n")
    : "Кейс не выбран, ответь как юридический ассистент общего назначения для B2B РФ.";

  const historyBlock = normalizedHistory.length
    ? normalizedHistory.map((item, index) => `${index + 1}. ${item.role === "assistant" ? "Ассистент" : "Пользователь"}: ${item.text}`).join("\n")
    : "История чата отсутствует.";

  const contextBlock = contextDocs.length
    ? contextDocs
        .map(
          (doc, index) =>
            `S${index + 1}) ${doc.title}\nТип: ${doc.sourceType || "context"}\nТеги: ${(doc.tags || []).join(", ")}\nФрагмент: ${doc.snippet}`,
        )
        .join("\n\n")
    : "Контекстных документов не найдено.";

  const system = [
    "Ты Младший Юрист AI 24/7 для российского SMB.",
    "Стиль: деловой, точный, структурный, без воды, как сильный младший юрист в команде.",
    "Роль: ускоряй работу юриста и собственника, не подменяй финальное правовое заключение.",
    "Опирайся на данные кейса, историю диалога и источники контекста. Не выдумывай факты и нормы.",
    "Если спрашивают статью закона: дай смысл нормы, когда применяется, риски ошибки и практический шаг.",
    "Если данных не хватает, прямо перечисли, что нужно уточнить.",
    "В ответе указывай ссылки на источники метками [S1], [S2] только если действительно опираешься на них.",
    "Формат ответа: 1) Вывод; 2) Что делать сейчас; 3) Риски/проверки; 4) Что уточнить (если нужно).",
    "Последняя строка: 'Справочно, нужна проверка актуальной редакции и судебной практики.'",
  ].join(" ");

  const userText = [
    `Вопрос пользователя:\n${prompt}`,
    `Контекст кейса:\n${matterBlock}`,
    `История диалога:\n${historyBlock}`,
    `Источники контекста:\n${contextBlock}`,
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "text", text: system }] },
        { role: "user", content: [{ type: "text", text: userText }] },
      ],
      max_output_tokens: 1300,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text.slice(0, 260)}`);
  }

  const data = await response.json();
  const reply = extractOutputText(data);
  if (!reply) {
    throw new Error("OpenAI assistant returned empty output");
  }

  return {
    reply: normalizeReply(reply),
    contextDocs: contextDocs.map((doc, index) => ({
      id: `S${index + 1}`,
      title: doc.title,
      snippet: doc.snippet,
      tags: doc.tags || [],
      score: doc.score,
      sourceType: doc.sourceType || "context",
    })),
  };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      text: `${item?.text || ""}`.trim(),
    }))
    .filter((item) => item.text)
    .slice(-12);
}

function normalizeReply(text) {
  return `${text || ""}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload.output)) {
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
