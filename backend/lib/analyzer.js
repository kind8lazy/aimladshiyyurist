import { retrieveContext } from "./rag.js";
import { runOpenAiAnalysis } from "./openai.js";

export async function analyzeMatterWithRag({ matter, ragDocuments, openAiConfig }) {
  const contextDocs = retrieveContext({
    query: `${matter.summary}\n${matter.rawText}`,
    documents: ragDocuments,
    topK: openAiConfig.ragTopK,
  });

  try {
    const llmResult = await runOpenAiAnalysis({
      apiKey: openAiConfig.openaiApiKey,
      model: openAiConfig.openaiModel,
      matter,
      contextDocs,
    });

    if (llmResult) {
      return {
        ...llmResult,
        contextDocs,
        engine: "openai",
      };
    }
  } catch (error) {
    console.error("LLM analysis failed, fallback to heuristic analyzer", error.message);
  }

  const fallback = analyzeHeuristic(matter.rawText);
  return {
    ...fallback,
    legalReferences: contextDocs.map((doc) => doc.title),
    contextDocs,
    engine: "heuristic",
  };
}

function analyzeHeuristic(rawText) {
  const slices = rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 450);

  const markers = [
    { term: "неустойк", category: "Договор", weight: 14, severity: "HIGH" },
    { term: "штраф", category: "Договор", weight: 12, severity: "HIGH" },
    { term: "гк рф", category: "Норма права", weight: 8, severity: "MEDIUM" },
    { term: "апк рф", category: "Суд и процесс", weight: 10, severity: "MEDIUM" },
    { term: "суд", category: "Суд и процесс", weight: 14, severity: "HIGH" },
    { term: "арбитраж", category: "Суд и процесс", weight: 13, severity: "HIGH" },
    { term: "иск", category: "Суд и процесс", weight: 10, severity: "HIGH" },
    { term: "претенз", category: "Досудебка", weight: 10, severity: "MEDIUM" },
    { term: "досудеб", category: "Досудебка", weight: 9, severity: "MEDIUM" },
    { term: "расторжен", category: "Договор", weight: 9, severity: "MEDIUM" },
    { term: "просроч", category: "Сроки", weight: 12, severity: "HIGH" },
    { term: "срок", category: "Сроки", weight: 7, severity: "MEDIUM" },
    { term: "задолж", category: "Задолженность", weight: 12, severity: "HIGH" },
    { term: "акт сверки", category: "Доказательства", weight: 9, severity: "MEDIUM" },
    { term: "упд", category: "Доказательства", weight: 8, severity: "MEDIUM" },
    { term: "фссп", category: "Исполнение", weight: 10, severity: "MEDIUM" },
    { term: "исполнительн", category: "Исполнение", weight: 10, severity: "MEDIUM" },
    { term: "конфиденц", category: "Комплаенс", weight: 9, severity: "MEDIUM" },
    { term: "персональ", category: "Комплаенс", weight: 11, severity: "HIGH" },
    { term: "152-фз", category: "Комплаенс", weight: 11, severity: "HIGH" },
    { term: "роскомнадзор", category: "Госорганы", weight: 11, severity: "HIGH" },
    { term: "фнс", category: "Госорганы", weight: 10, severity: "MEDIUM" },
    { term: "проверк", category: "Госорганы", weight: 8, severity: "MEDIUM" },
    { term: "должен", category: "Обязательства", weight: 6, severity: "MEDIUM" },
    { term: "обязан", category: "Обязательства", weight: 6, severity: "MEDIUM" },
  ];

  const riskHits = [];
  const categoryWeights = new Map();
  let score = 0;

  for (const line of slices) {
    const lowered = line.toLowerCase();

    markers.forEach((marker) => {
      if (!lowered.includes(marker.term)) {
        return;
      }

      riskHits.push({
        severity: marker.severity,
        category: marker.category,
        marker: marker.term,
        excerpt: line,
      });

      score += marker.weight;
      categoryWeights.set(marker.category, (categoryWeights.get(marker.category) || 0) + marker.weight);
    });
  }

  const timeline = extractTimeline(slices);
  const obligations = extractObligations(slices);

  const uniqueRisks = dedupeRisks(riskHits).slice(0, 10);
  const culturalLoad = measureCulturalLoad(rawText);
  const normalizedScore = Math.min(
    98,
    Math.max(5, Math.round((score / (slices.length + 10)) * 16 + uniqueRisks.length * 2.4 + culturalLoad)),
  );

  let urgency = "LOW";
  if (normalizedScore >= 60 || hasHighSeverity(uniqueRisks)) {
    urgency = "HIGH";
  } else if (normalizedScore >= 32) {
    urgency = "MEDIUM";
  }

  const topCategories = [...categoryWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0])
    .slice(0, 3);

  const actions = buildActions(topCategories, urgency);
  const confidence = Math.min(0.95, 0.48 + uniqueRisks.length * 0.035 + timeline.length * 0.01);

  return {
    riskScore: normalizedScore,
    urgency,
    tags: topCategories,
    risks: uniqueRisks,
    timeline: timeline.map((item) => item.event),
    obligations,
    actions,
    confidence,
  };
}

function extractTimeline(lines) {
  const timelineRegex =
    /(\b\d{1,2}:\d{2}\b|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\bдо\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\bв течение\s+\d+\s+(?:рабочих|календарных)\s+дн)/i;
  const timeline = [];

  lines.forEach((line, index) => {
    if (!timelineRegex.test(line)) {
      return;
    }

    timeline.push({
      order: index + 1,
      event: line,
    });
  });

  return timeline.slice(0, 10);
}

function extractObligations(lines) {
  const obligationHints = [
    "обязан",
    "должен",
    "срок",
    "оплат",
    "передать",
    "подписать",
    "предоставить",
    "акт сверки",
    "упд",
    "претензи",
    "ответ в течение",
    "оригинал",
  ];

  return lines
    .filter((line) => obligationHints.some((hint) => line.toLowerCase().includes(hint)))
    .slice(0, 8)
    .map((line) => line.trim());
}

function hasHighSeverity(risks) {
  return risks.some((risk) => risk.severity === "HIGH");
}

function dedupeRisks(risks) {
  const deduped = [];
  const seen = new Set();

  risks.forEach((risk) => {
    const key = `${risk.category}|${risk.excerpt}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push(risk);
  });

  return deduped;
}

function buildActions(categories, urgency) {
  const actionMap = {
    Договор: "Сверить предмет, сроки, ответственность и порядок расторжения по договору и допсоглашениям.",
    "Суд и процесс": "Проверить подсудность, процессуальные сроки и собрать комплект доказательств под АПК РФ.",
    Досудебка: "Подготовить и направить претензию с расчетом требований и подтверждением вручения (ЭДО/почта).",
    Сроки: "Зафиксировать критические даты и назначить владельца каждого дедлайна с ежедневным контролем.",
    Задолженность: "Собрать акт сверки, первичку и платежный график; предложить сценарий досудебного погашения.",
    Обязательства: "Проверить исполнение обязательств по этапам и закрепить это письменно в переписке.",
    Комплаенс: "Провести экспресс-аудит по ПДн/конфиденциальности и подготовить пакет для возможной проверки.",
    Госорганы: "Подготовить ответ в госорган с ответственным, сроком и пакетом подтверждающих документов.",
    Доказательства: "Собрать доказательственную папку: договор, УПД, акты, переписка, счета и реестр приложений.",
    Исполнение: "Проверить стадию исполнительного производства и план взыскания через ФССП.",
    "Норма права": "Подобрать релевантные нормы ГК РФ/АПК РФ и привязать их к фактам кейса.",
  };

  const actions = categories
    .map((category) => actionMap[category])
    .filter(Boolean)
    .slice(0, 4);

  if (urgency === "HIGH") {
    actions.unshift(
      "В течение 24 часов: провести с собственником короткую риск-сессию, согласовать позицию и запретить противоречивые комментарии.",
    );
  }

  if (!actions.length) {
    actions.push("Сформировать краткий юрбриф: факты, спорные точки, ближайшие сроки, ответственные и канал коммуникации.");
  }

  return actions.slice(0, 5);
}

function measureCulturalLoad(text) {
  const lowered = text.toLowerCase();
  const highPressureSignals = ["срочно", "сегодня", "до конца дня", "блокир", "штраф", "претензия"];
  const relationSignals = ["договорились", "устно", "по звонку", "телеграм", "whatsapp"];
  let score = 0;

  highPressureSignals.forEach((signal) => {
    if (lowered.includes(signal)) {
      score += 2;
    }
  });

  relationSignals.forEach((signal) => {
    if (lowered.includes(signal)) {
      score += 1;
    }
  });

  return Math.min(10, score);
}
