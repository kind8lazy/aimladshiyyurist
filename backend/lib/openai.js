export async function runOpenAiAnalysis({ apiKey, model, matter, contextDocs }) {
  if (!apiKey) {
    return null;
  }

  const contextBlock = contextDocs.length
    ? contextDocs
        .map(
          (doc, index) =>
            `${index + 1}) ${doc.title}\nTags: ${(doc.tags || []).join(", ")}\nSnippet: ${doc.snippet}`,
        )
        .join("\n\n")
    : "Контекст судебной практики не найден.";

  const system = [
    "Ты senior legal operations analyst для российского малого и среднего бизнеса.",
    "Учитывай практический стиль: меньше теории, больше конкретных шагов на 24/72 часа.",
    "Приоритет: досудебное урегулирование, фиксация доказательств, соблюдение процессуальных сроков.",
    "Если уместно, ссылайся на российский правовой контекст: ГК РФ, АПК РФ, 152-ФЗ.",
    "Верни только валидный JSON без markdown и комментариев.",
    "Формат ответа: { riskScore:number, urgency:'LOW'|'MEDIUM'|'HIGH', tags:string[], risks:{severity:'LOW'|'MEDIUM'|'HIGH',category:string,excerpt:string}[], timeline:string[], obligations:string[], actions:string[], confidence:number, legalReferences:string[] }",
    "riskScore: 0..100, confidence: 0..1.",
    "Не выдумывай факты, используй только входные данные и контекст.",
  ].join(" ");

  const userInput = [
    `Company: ${matter.company}`,
    `Industry: ${matter.industry}`,
    `SourceType: ${matter.sourceType}`,
    `Summary: ${matter.summary}`,
    `RawText:\n${matter.rawText}`,
    `RAG Context:\n${contextBlock}`,
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
        { role: "user", content: [{ type: "text", text: userInput }] },
      ],
      max_output_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text.slice(0, 260)}`);
  }

  const data = await response.json();
  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new Error("OpenAI API returned empty output");
  }

  return parseModelJson(outputText);
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

function parseModelJson(raw) {
  const cleaned = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    riskScore: clampNumber(parsed.riskScore, 0, 100, 35),
    urgency: normalizeUrgency(parsed.urgency),
    tags: normalizeStringArray(parsed.tags, 6),
    risks: normalizeRisks(parsed.risks),
    timeline: normalizeStringArray(parsed.timeline, 10),
    obligations: normalizeStringArray(parsed.obligations, 12),
    actions: normalizeStringArray(parsed.actions, 8),
    confidence: clampNumber(parsed.confidence, 0, 1, 0.62),
    legalReferences: normalizeStringArray(parsed.legalReferences, 8),
  };
}

function normalizeUrgency(value) {
  const normalized = `${value || ""}`.toUpperCase().trim();
  return ["LOW", "MEDIUM", "HIGH"].includes(normalized) ? normalized : "MEDIUM";
}

function normalizeStringArray(items, maxItems) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => `${item || ""}`.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeRisks(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      severity: normalizeUrgency(item?.severity),
      category: `${item?.category || "Общее"}`.trim().slice(0, 80),
      excerpt: `${item?.excerpt || ""}`.trim().slice(0, 220),
    }))
    .filter((item) => item.excerpt)
    .slice(0, 10);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}
