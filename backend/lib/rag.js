const stopWords = new Set([
  "и",
  "в",
  "во",
  "на",
  "с",
  "со",
  "по",
  "что",
  "это",
  "как",
  "для",
  "под",
  "при",
  "а",
  "но",
  "или",
  "ли",
  "к",
  "ко",
  "из",
  "от",
  "до",
  "за",
  "у",
  "о",
  "об",
  "не",
  "мы",
  "он",
  "она",
  "они",
  "бы",
  "то",
  "же",
]);

export function tokenize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

export function scoreDocument(queryTokens, document) {
  if (!queryTokens.length) {
    return 0;
  }

  const docTokens = tokenize(`${document.title || ""} ${document.content || ""} ${(document.tags || []).join(" ")}`);
  const docSet = new Set(docTokens);

  let overlap = 0;
  queryTokens.forEach((token) => {
    if (docSet.has(token)) {
      overlap += 1;
    }
  });

  if (!overlap) {
    return 0;
  }

  const denom = Math.sqrt(queryTokens.length) * Math.sqrt(Math.max(1, docSet.size));
  return overlap / denom;
}

export function retrieveContext({ query, documents, topK = 4 }) {
  const queryTokens = tokenize(query);

  return documents
    .map((document) => ({ document, score: scoreDocument(queryTokens, document) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ document, score }) => ({
      id: document.id,
      title: document.title,
      snippet: `${document.content || ""}`.slice(0, 360),
      tags: document.tags || [],
      score: Number(score.toFixed(4)),
      sourceType: document.sourceType || "context",
    }));
}
