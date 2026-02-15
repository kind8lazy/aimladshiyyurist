#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const INPUT_DOCX = "/Users/dmitriy/Downloads/Инвесторы 60.docx";
const OUT_DIR = path.resolve(
  "/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/docs/investor_shortlist"
);

const SOURCE_LINKS = {
  "Профиль Talari": "https://talari.ru/investors/",
  "Talari профиль": "https://talari.ru/investors/",
  "RB.ru новость": "https://rb.ru/",
  "RB.ru новости": "https://rb.ru/",
  "RB.ru статья": "https://rb.ru/",
  "RB.ru отчёт": "https://rb.ru/",
  "Rusbase (RBC) новость": "https://rb.ru/",
  "RB.ru (апр 2024)": "https://rb.ru/",
  "FranchCamp IV": "https://franchcamp.ru/",
  "FranchCamp IV список": "https://franchcamp.ru/",
  "FranchCamp IV список спикеров": "https://franchcamp.ru/",
  "Money for Startup (страница)": "https://moneyforstartup.com/",
  "LinkedIn / AngelsDeck": "https://academy.angelsdeck.com/",
  "LinkedIn / Telegram": "https://www.linkedin.com/",
  "Facebook/LinkedIn": "https://www.linkedin.com/",
  "Facebook": "https://www.facebook.com/",
  LinkedIn: "https://www.linkedin.com/",
  "Telegram канал": "https://t.me/",
  "Telegram @startup_101 (канал)": "https://t.me/startup_101",
  "Telegram @dnkinvestor": "https://t.me/dnkinvestor",
};

const LEGAL_RISK_WATCHLIST = new Set([
  // Strict filter: unresolved risk review required before Tier A
  "Сергей Дашков",
]);

const INVESTOR_SOURCE_OVERRIDES = {
  "Олег Чельцов": {
    source_type: "media_high",
    source_link: "https://rb.ru/data/oleg-cheltsov/",
    proof_quality: "high",
    activity_date: "2024 (RB profile baseline)",
  },
  "Александр Чачава": {
    source_type: "media_high",
    source_link: "https://www.forbes.ru/profile/aleksandr-chachava",
    proof_quality: "high",
    activity_date: "2024 (Forbes profile baseline)",
  },
  "Сергей Дашков": {
    source_link: "https://www.kommersant.ru/doc/7395727",
    activity_date: "2024-12-25 (Kommersant baseline)",
  },
};

const REASON_CODES = {
  LOW_SOURCE_CONFIDENCE: "LOW_SOURCE_CONFIDENCE",
  CHECK_MISMATCH: "CHECK_MISMATCH",
  LEGAL_RISK_REVIEW_REQUIRED: "LEGAL_RISK_REVIEW_REQUIRED",
  STRONG_CHECK_CAPACITY: "STRONG_CHECK_CAPACITY",
  STRONG_THESIS_FIT: "STRONG_THESIS_FIT",
  RECENT_ACTIVITY_SIGNAL: "RECENT_ACTIVITY_SIGNAL",
  WARM_PATH_AVAILABLE: "WARM_PATH_AVAILABLE",
};

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function normalizeSpaces(s) {
  return (s || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function cleanName(s) {
  return normalizeSpaces(s).replace(/\s+/g, " ");
}

function getPlainTextFromDocx(inputDocxPath) {
  const cmd = `textutil -convert txt -stdout "${inputDocxPath}"`;
  return execSync(cmd, { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
}

function splitLines(rawText) {
  return rawText
    .split("\n")
    .map((x) => normalizeSpaces(x))
    .filter((x) => x.length > 0);
}

function parseRows(lines) {
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\d{1,2}$/.test(lines[i])) continue;
    const id = Number(lines[i]);
    const maybeName = lines[i + 1] || "";
    const maybeRole = lines[i + 2] || "";
    const maybeGeo = lines[i + 3] || "";
    const maybeType = lines[i + 4] || "";
    const maybeActivity = lines[i + 5] || "";
    const maybeCheck = lines[i + 6] || "";
    const maybeEmail = lines[i + 7] || "";
    const maybeTelegram = lines[i + 8] || "";
    const maybeSocial = lines[i + 9] || "";
    const maybeSource = lines[i + 10] || "";
    const maybeWhy = lines[i + 11] || "";

    if (!maybeName || !maybeType) continue;
    if (id < 1 || id > 100) continue;

    rows.push({
      id,
      name: cleanName(maybeName),
      role: normalizeSpaces(maybeRole),
      geo: normalizeSpaces(maybeGeo),
      type: normalizeSpaces(maybeType),
      activity: normalizeSpaces(maybeActivity),
      check_range: normalizeSpaces(maybeCheck),
      email: normalizeSpaces(maybeEmail),
      telegram: normalizeSpaces(maybeTelegram),
      social: normalizeSpaces(maybeSocial),
      source_label: normalizeSpaces(maybeSource),
      why_fit: normalizeSpaces(maybeWhy),
    });
  }

  // Keep unique by id with first occurrence only
  const unique = [];
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    unique.push(r);
  }
  return unique;
}

function classifySourceType(label) {
  const s = label.toLowerCase();
  if (
    s.includes("rb.ru") ||
    s.includes("rusbase") ||
    s.includes("forbes") ||
    s.includes("kommersant")
  ) {
    return "media_high";
  }
  if (s.includes("academy.angelsdeck") || s.includes("angelsdeck")) {
    return "community_medium";
  }
  if (s.includes("talari")) {
    return "directory_low";
  }
  if (s.includes("franchcamp")) {
    return "community_low";
  }
  if (s.includes("money for startup")) {
    return "directory_medium";
  }
  return "unknown";
}

function resolveSourceLink(label) {
  if (SOURCE_LINKS[label]) return SOURCE_LINKS[label];
  if (/talari/i.test(label)) return "https://talari.ru/investors/";
  if (/rb\.ru|rusbase/i.test(label)) return "https://rb.ru/";
  if (/forbes/i.test(label)) return "https://www.forbes.ru/";
  if (/kommersant/i.test(label)) return "https://www.kommersant.ru/";
  if (/angelsdeck/i.test(label)) return "https://academy.angelsdeck.com/";
  if (/franchcamp/i.test(label)) return "https://franchcamp.ru/";
  if (/linkedin/i.test(label)) return "https://www.linkedin.com/";
  return "";
}

function parseCheckToUsdRange(checkText) {
  const t = checkText.toLowerCase().replace(/\s/g, "");
  if (!t || t === "-" || t.includes("н/д") || t.includes("нераскрыт")) {
    return { min: null, max: null };
  }

  // $0.5–5M
  let m = t.match(/\$([0-9.]+)[–-]([0-9.]+)m/);
  if (m) {
    return {
      min: Math.round(parseFloat(m[1]) * 1_000_000),
      max: Math.round(parseFloat(m[2]) * 1_000_000),
    };
  }
  // $100k-2.5M
  m = t.match(/\$([0-9.]+)k[–-]([0-9.]+)m/);
  if (m) {
    return {
      min: Math.round(parseFloat(m[1]) * 1_000),
      max: Math.round(parseFloat(m[2]) * 1_000_000),
    };
  }
  // $20-50k
  m = t.match(/\$([0-9.]+)[–-]([0-9.]+)k/);
  if (m) {
    return {
      min: Math.round(parseFloat(m[1]) * 1_000),
      max: Math.round(parseFloat(m[2]) * 1_000),
    };
  }
  // $80k+ or $1m
  m = t.match(/\$([0-9.]+)k\+/);
  if (m) return { min: Math.round(parseFloat(m[1]) * 1_000), max: null };
  m = t.match(/\$([0-9.]+)m/);
  if (m) {
    const v = Math.round(parseFloat(m[1]) * 1_000_000);
    return { min: v, max: v };
  }
  m = t.match(/≈?\$([0-9.]+)k/);
  if (m) {
    const v = Math.round(parseFloat(m[1]) * 1_000);
    return { min: v, max: v };
  }
  // ruble ranges like 3-5 млн руб (~$40-60k) already include usd note usually
  m = t.match(/\(~?\$([0-9.]+)[–-]([0-9.]+)k\)/);
  if (m) {
    return {
      min: Math.round(parseFloat(m[1]) * 1_000),
      max: Math.round(parseFloat(m[2]) * 1_000),
    };
  }
  return { min: null, max: null };
}

function hasAny(lowerText, needles) {
  return needles.some((n) => lowerText.includes(n));
}

function scoreCheckFit(usdRange) {
  const { min, max } = usdRange;
  const top = max || min || 0;
  if (top >= 500_000) return 35;
  if (top >= 250_000) return 30;
  if (top >= 100_000) return 24;
  if (top >= 50_000) return 16;
  if (top >= 20_000) return 10;
  if (top > 0) return 6;
  return 8; // unknown gets low neutral, filtered by confidence later
}

function scoreThesisFit(type, whyFit) {
  const t = `${type} ${whyFit}`.toLowerCase();
  if (hasAny(t, ["legaltech", "enterprise saas", "ai/ml", "b2b", "saas", "ai"])) {
    return 24;
  }
  if (hasAny(t, ["it", "fintech", "software", "cybersecurity"])) {
    return 18;
  }
  if (hasAny(t, ["web3", "adtech", "edtech", "media"])) {
    return 14;
  }
  return 9;
}

function scoreRecency(activity, sourceType) {
  const a = activity.toLowerCase();
  if (/\b2025\b/.test(a)) return 20;
  if (/\b2024\b/.test(a)) return 18;
  if (sourceType === "media_high") return 16;
  if (sourceType.includes("medium")) return 12;
  if (sourceType.includes("low")) return 9;
  return 8;
}

function scoreSourceReliability(sourceType) {
  switch (sourceType) {
    case "media_high":
      return 10;
    case "community_medium":
      return 7;
    case "directory_medium":
      return 6;
    case "community_low":
      return 4;
    case "directory_low":
      return 3;
    default:
      return 4;
  }
}

function scoreIntroAccess(email, telegram, social) {
  const e = email && email !== "-" && email !== "–";
  const t = telegram && telegram !== "-" && telegram !== "–";
  const s = social && social !== "-" && social !== "–";
  if ((e && t) || (e && s) || (t && s)) return 10;
  if (e || t) return 8;
  if (s) return 6;
  return 3;
}

function getContactChannels(email, telegram, social) {
  return {
    email: email && email !== "-" && email !== "–" ? email : "",
    telegram: telegram && telegram !== "-" && telegram !== "–" ? telegram : "",
    social: social && social !== "-" && social !== "–" ? social : "",
  };
}

function firstTouchChannel(contact, sourceType) {
  if (contact.telegram) return "Telegram";
  if (contact.email) return "Email";
  if (sourceType === "media_high") return "Warm intro via operator network";
  if (sourceType.includes("community")) return "Warm intro via community";
  if (contact.social) return "LinkedIn";
  return "Manual intro required";
}

function buildReasonCodes(score) {
  const reasons = [];
  if (score.check_fit >= 24) reasons.push(REASON_CODES.STRONG_CHECK_CAPACITY);
  if (score.thesis_fit >= 20) reasons.push(REASON_CODES.STRONG_THESIS_FIT);
  if (score.recency >= 16) reasons.push(REASON_CODES.RECENT_ACTIVITY_SIGNAL);
  if (score.intro_access >= 8) reasons.push(REASON_CODES.WARM_PATH_AVAILABLE);
  if (score.source_reliability <= 4) reasons.push(REASON_CODES.LOW_SOURCE_CONFIDENCE);
  if (score.check_fit <= 10) reasons.push(REASON_CODES.CHECK_MISMATCH);
  if (score.legal_risk_flag) reasons.push(REASON_CODES.LEGAL_RISK_REVIEW_REQUIRED);
  return reasons;
}

function applyStrictFilter(scored) {
  return scored.map((r) => {
    const hardExcludeForA =
      r.validation.legal_risk_flag ||
      r.score.source_reliability <= 4 ||
      r.score.check_fit <= 10;

    const scoreTotal = r.score.total;
    let tier;
    if (!hardExcludeForA && scoreTotal >= 75) tier = "A";
    else if (scoreTotal >= 55 && !r.validation.legal_risk_flag) tier = "B";
    else tier = "C";

    return {
      ...r,
      tier_assignment: {
        tier,
        reason_codes: buildReasonCodes({
          ...r.score,
          legal_risk_flag: r.validation.legal_risk_flag,
        }),
        first_touch_channel: firstTouchChannel(r.contact_channels, r.source_type),
        owner: "Founder",
        deadline:
          tier === "A"
            ? "D+3 days"
            : tier === "B"
              ? "D+10 days"
              : "D+30 days",
      },
      hard_exclude_for_a: hardExcludeForA,
    };
  });
}

function getRoleByCheck(usdRange) {
  const top = usdRange.max || usdRange.min || 0;
  if (top >= 350_000) return "lead";
  if (top >= 100_000) return "anchor";
  return "follower";
}

function formatCurrency(v) {
  if (v == null) return "";
  return `$${v.toLocaleString("en-US")}`;
}

function materializeRecords(parsedRows) {
  return parsedRows.map((r) => {
    const sourceOverride = INVESTOR_SOURCE_OVERRIDES[r.name] || null;
    const source_type = sourceOverride?.source_type || classifySourceType(r.source_label);
    const source_link = sourceOverride?.source_link || resolveSourceLink(r.source_label);
    const check_usd_range = parseCheckToUsdRange(r.check_range);
    const contact_channels = getContactChannels(r.email, r.telegram, r.social);
    const legal_risk_flag = LEGAL_RISK_WATCHLIST.has(r.name);
    const validation = {
      activity_date: sourceOverride?.activity_date || (
        /\b2025\b/.test(r.activity)
          ? "2025 (from source note)"
          : /\b2024\b/.test(r.activity)
            ? "2024 (from source note)"
            : "2023-2025 window (document claim)"
      ),
      activity_proof_url: source_link,
      proof_quality: sourceOverride?.proof_quality || (
        source_type === "media_high"
          ? "high"
          : source_type.includes("medium")
            ? "medium"
            : "low"
      ),
      legal_risk_flag,
    };

    const score = {
      check_fit: scoreCheckFit(check_usd_range),
      thesis_fit: scoreThesisFit(r.type, r.why_fit),
      recency: scoreRecency(r.activity, source_type),
      source_reliability: scoreSourceReliability(source_type),
      intro_access: scoreIntroAccess(r.email, r.telegram, r.social),
      risk_penalty: legal_risk_flag ? -40 : 0,
    };
    score.total =
      score.check_fit +
      score.thesis_fit +
      score.recency +
      score.source_reliability +
      score.intro_access +
      score.risk_penalty;

    return {
      investor: {
        id: r.id,
        name: r.name,
        geo: r.geo,
        thesis_tags: r.type,
        check_range: r.check_range,
        source_type,
        source_link,
        contact_channels,
        notes: r.why_fit,
      },
      validation,
      score,
      source_label: r.source_label,
      check_usd_range,
      role_expected: getRoleByCheck(check_usd_range),
      raw: r,
      contact_channels,
      source_type,
    };
  });
}

function sortRecords(rows) {
  return [...rows].sort((a, b) => b.score.total - a.score.total);
}

function writeJson(fileName, payload) {
  fs.writeFileSync(path.join(OUT_DIR, fileName), JSON.stringify(payload, null, 2), "utf8");
}

function toCsv(rows, headers) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function writeCsv(fileName, rows, headers) {
  fs.writeFileSync(path.join(OUT_DIR, fileName), toCsv(rows, headers), "utf8");
}

function prepareFlatRows(scoredRows) {
  return scoredRows.map((r) => ({
    id: r.investor.id,
    name: r.investor.name,
    geo: r.investor.geo,
    thesis_tags: r.investor.thesis_tags,
    check_range: r.investor.check_range,
    check_min_usd: r.check_usd_range.min ?? "",
    check_max_usd: r.check_usd_range.max ?? "",
    source_type: r.investor.source_type,
    source_label: r.source_label,
    source_link: r.investor.source_link,
    proof_quality: r.validation.proof_quality,
    legal_risk_flag: r.validation.legal_risk_flag ? "true" : "false",
    check_fit: r.score.check_fit,
    thesis_fit: r.score.thesis_fit,
    recency: r.score.recency,
    source_reliability: r.score.source_reliability,
    intro_access: r.score.intro_access,
    risk_penalty: r.score.risk_penalty,
    total: r.score.total,
    tier: r.tier_assignment.tier,
    role_expected: r.role_expected,
    first_touch_channel: r.tier_assignment.first_touch_channel,
    owner: r.tier_assignment.owner,
    deadline: r.tier_assignment.deadline,
    reason_codes: r.tier_assignment.reason_codes.join("|"),
    email: r.investor.contact_channels.email,
    telegram: r.investor.contact_channels.telegram,
    social: r.investor.contact_channels.social,
    notes: r.investor.notes,
  }));
}

function buildTierMarkdown(scoredRows) {
  const byTier = { A: [], B: [], C: [] };
  for (const r of scoredRows) byTier[r.tier_assignment.tier].push(r);

  const md = [];
  md.push("# Credo $500k Investor Short-List (Tier A/B/C)");
  md.push("");
  md.push("## Strategy Lock");
  md.push("- Round shape: `1 lead + syndicate`");
  md.push("- Geo: `RU + Global mix`");
  md.push("- Outreach: `Warm intros + Telegram`");
  md.push("- Risk policy: `Strict filter`");
  md.push("");
  md.push(`Total parsed records: **${scoredRows.length}**`);
  md.push(`Tier A: **${byTier.A.length}**, Tier B: **${byTier.B.length}**, Tier C: **${byTier.C.length}**`);
  md.push("");

  const renderTier = (tier, title) => {
    md.push(`## ${title}`);
    if (byTier[tier].length === 0) {
      md.push("_No records_");
      md.push("");
      return;
    }
    md.push(
      "| # | Investor | Score | Expected role | Check range | First touch | Why fit (1 line) |"
    );
    md.push("|---|---|---:|---|---|---|---|");
    for (const r of byTier[tier]) {
      const oneLine = normalizeSpaces(r.investor.notes || r.raw.why_fit || "").slice(0, 140);
      md.push(
        `| ${r.investor.id} | ${r.investor.name} | ${r.score.total} | ${r.role_expected} | ${r.investor.check_range} | ${r.tier_assignment.first_touch_channel} | ${oneLine} |`
      );
    }
    md.push("");
  };

  renderTier("A", "Tier A (Immediate outreach)");
  renderTier("B", "Tier B (Wave 2)");
  renderTier("C", "Tier C (Deprioritized)");
  return `${md.join("\n")}\n`;
}

function buildWavePlan(scoredRows) {
  const tierA = scoredRows.filter((r) => r.tier_assignment.tier === "A");
  const tierB = scoredRows.filter((r) => r.tier_assignment.tier === "B");
  const wave1 = tierA.slice(0, 12);
  const wave2 = [...tierA.slice(12), ...tierB].slice(0, 8);

  const lines = [];
  lines.push("# Outreach Wave Plan");
  lines.push("");
  lines.push("## Wave 1 (Top 12 Tier A)");
  lines.push("| Investor | Role | First touch | Deadline |");
  lines.push("|---|---|---|---|");
  for (const r of wave1) {
    lines.push(
      `| ${r.investor.name} | ${r.role_expected} | ${r.tier_assignment.first_touch_channel} | ${r.tier_assignment.deadline} |`
    );
  }
  lines.push("");
  lines.push("## Wave 2 (Next 8: Tier A tail + Tier B top)");
  lines.push("| Investor | Role | First touch | Deadline |");
  lines.push("|---|---|---|---|");
  for (const r of wave2) {
    lines.push(
      `| ${r.investor.name} | ${r.role_expected} | ${r.tier_assignment.first_touch_channel} | ${r.tier_assignment.deadline} |`
    );
  }
  lines.push("");
  lines.push("## Follow-up Cadence");
  lines.push("- `D0`: warm intro or first outreach");
  lines.push("- `D3`: concise bump with traction datapoint");
  lines.push("- `D7`: send updated metrics + specific ask");
  lines.push("- `D14`: close loop, request yes/no timing");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildOutreachTemplates() {
  return `# Outreach Templates

## Lead-focused message (for lead/anchor checks)
Subject: Credo OS — operating layer for enterprise AI, raising $500k

Hi {{Name}},  
Warm intro via {{IntroPath}}.  
We are building Credo OS, an operating layer for enterprise AI workflows (not a model wrapper): Goal -> Graph -> Roles -> Validation -> Traceability.

Current status:
- MVP with active users (verification pack ready),
- Web EN/RU + Telegram WebApp surface,
- clear governance and quality control architecture.

We are raising **$500k** at **$5M pre** and are looking for a lead/anchor who can help shape syndicate quality, not only provide capital.

Would you be open to a 25-minute diligence call this week?

Best,  
{{Founder}}

## Follower/syndicate message
Subject: Credo OS syndicate round ($500k)

Hi {{Name}},  
Reaching out through {{IntroPath}}. We are opening a syndicate round for Credo OS (enterprise AI operating layer).

What is unique:
- deterministic orchestration and mandatory quality gates,
- governance-first approach for business risk control,
- practical product surface already in MVP.

Round terms: **$500k at $5M pre**.  
If useful, I can send the 12-slide deck + data room summary.

Open to a short call this week?

Best,  
{{Founder}}

## Follow-up Cadence
- D0: first touch
- D3: 3-line bump + one fresh metric
- D7: share milestone + direct decision ask
- D14: final ping with explicit close-loop question
`;
}

function buildTrackerCsv(scoredRows) {
  const headers = [
    "investor_id",
    "investor_name",
    "tier",
    "expected_role",
    "first_touch_channel",
    "owner",
    "status",
    "next_action_date",
    "next_action",
    "last_contact_date",
    "meeting_date",
    "soft_commit_usd",
    "hard_commit_usd",
    "notes",
  ];
  const rows = scoredRows.map((r) => ({
    investor_id: r.investor.id,
    investor_name: r.investor.name,
    tier: r.tier_assignment.tier,
    expected_role: r.role_expected,
    first_touch_channel: r.tier_assignment.first_touch_channel,
    owner: "Founder",
    status: "not_started",
    next_action_date: "",
    next_action: "Send D0 outreach",
    last_contact_date: "",
    meeting_date: "",
    soft_commit_usd: "",
    hard_commit_usd: "",
    notes: "",
  }));
  return toCsv(rows, headers);
}

function buildSummaryMd(scoredRows) {
  const tierA = scoredRows.filter((r) => r.tier_assignment.tier === "A");
  const tierB = scoredRows.filter((r) => r.tier_assignment.tier === "B");
  const tierC = scoredRows.filter((r) => r.tier_assignment.tier === "C");

  const capacityA = tierA.reduce((acc, r) => {
    const top = r.check_usd_range.max || r.check_usd_range.min || 0;
    return acc + top;
  }, 0);

  return `# Credo Investor Short-List Package

Generated: ${new Date().toISOString()}

## Results
- Parsed investors: **${scoredRows.length}**
- Tier A: **${tierA.length}**
- Tier B: **${tierB.length}**
- Tier C: **${tierC.length}**

## Strategy
- Round shape: **1 lead + syndicate**
- Geo: **RU + Global mix**
- Outreach: **Warm intros + Telegram**
- Risk policy: **Strict filter**

## Capacity sanity check
- Sum of top disclosed checks in Tier A (upper-bound heuristic): **${formatCurrency(capacityA)}**
- Interpretation: this is not expected close amount; it only checks that Tier A has theoretical capacity to support a $500k round.

## Files
- \`investor_records.json\` — normalized InvestorRecord payload
- \`validation_records.json\` — ValidationRecord payload
- \`scored_shortlist.csv\` — full ScoreBreakdown + TierAssignment
- \`tier_shortlist.md\` — Tier A/B/C ranked presentation
- \`wave_plan.md\` — wave 1/2 outreach schedule
- \`outreach_templates.md\` — lead + follower templates and follow-up cadence
- \`outreach_tracker.csv\` — operational tracker
`;
}

function buildDataContractsMd() {
  return `# Data Contracts

## InvestorRecord
- \`id\`: number
- \`name\`: string
- \`geo\`: string
- \`thesis_tags\`: string
- \`check_range\`: string
- \`source_type\`: \`media_high | community_medium | directory_medium | community_low | directory_low | unknown\`
- \`source_link\`: string (URL)
- \`contact_channels\`: object
- \`notes\`: string

## ValidationRecord
- \`activity_date\`: string
- \`activity_proof_url\`: string (URL)
- \`proof_quality\`: \`high | medium | low\`
- \`legal_risk_flag\`: boolean

## ScoreBreakdown
- \`check_fit\`: number (0-35)
- \`thesis_fit\`: number (0-25)
- \`recency\`: number (0-20)
- \`source_reliability\`: number (0-10)
- \`intro_access\`: number (0-10)
- \`risk_penalty\`: number (0 to -40)
- \`total\`: number

## TierAssignment
- \`tier\`: \`A | B | C\`
- \`reason_codes\`: string[]
- \`first_touch_channel\`: string
- \`owner\`: string
- \`deadline\`: string
`;
}

function buildSourceValidationBaselineMd() {
  return `# Source Validation Baseline

- [Kommersant, 25 Dec 2024](https://www.kommersant.ru/doc/7395727)
- [RB profile: Oleg Cheltsov](https://rb.ru/data/oleg-cheltsov/)
- [Forbes profile: Alexander Chachava](https://www.forbes.ru/profile/aleksandr-chachava)
- [AngelsDeck Academy](https://academy.angelsdeck.com/)
- [Talari about](https://talari.ru/about-as/)

Policy:
- Talari/FranchCamp-only profiles are downgraded by source confidence.
- Legal-risk watchlist entries are hard-excluded from Tier A until resolved.
`;
}

function buildTestReportMd(scoredRows) {
  const tierA = scoredRows.filter((r) => r.tier_assignment.tier === "A");
  const tierB = scoredRows.filter((r) => r.tier_assignment.tier === "B");
  const ab = [...tierA, ...tierB];

  const dataIntegrityPass = tierA.every(
    (r) => Boolean(r.validation.activity_date) && Boolean(r.investor.source_link)
  );
  const riskPass = tierA.every((r) => !r.validation.legal_risk_flag);
  const leadCount = tierA.filter((r) => r.role_expected === "lead").length;
  const followerOrAnchor = tierA.filter((r) => r.role_expected !== "lead").length;
  const checkSizePass = leadCount >= 1 && followerOrAnchor >= 4;
  const channelPass = tierA.every(
    (r) => r.tier_assignment.first_touch_channel !== "Manual intro required"
  );

  const meetings = Math.floor(ab.length * 0.1);
  const softCommits = Math.max(1, Math.floor(meetings * 0.2));
  const leadCapable = ab.filter((r) => {
    const top = r.check_usd_range.max || r.check_usd_range.min || 0;
    return r.role_expected === "lead" && top >= 500_000;
  }).length;
  const conversionPass = leadCapable >= softCommits;

  const fmt = (ok) => (ok ? "PASS" : "FAIL");
  return `# Test Report

Generated: ${new Date().toISOString()}

## Cases
- Data integrity test: **${fmt(dataIntegrityPass)}**
  - Condition: every Tier A investor has source link + activity marker.
- Risk test: **${fmt(riskPass)}**
  - Condition: no unresolved legal-risk profile inside Tier A.
- Check-size test: **${fmt(checkSizePass)}**
  - Condition: Tier A includes at least 1 lead + at least 4 anchor/follower roles.
- Channel test: **${fmt(channelPass)}**
  - Condition: each Tier A investor has at least one non-manual first touch path.
- Conversion simulation test: **${fmt(conversionPass)}**
  - Assumption: pessimistic funnel = 10% meetings, 20% soft commits from meetings.
  - Computed: A+B investors = ${ab.length}, meetings = ${meetings}, soft commits target = ${softCommits}, lead-capable investors (>= $500k max check) = ${leadCapable}.
`;
}

function main() {
  ensureOutDir();
  const rawText = getPlainTextFromDocx(INPUT_DOCX);
  const lines = splitLines(rawText);
  const parsedRows = parseRows(lines);

  if (parsedRows.length === 0) {
    throw new Error("No investor rows parsed from DOCX.");
  }

  const materialized = materializeRecords(parsedRows);
  const filteredScored = applyStrictFilter(materialized);
  const ranked = sortRecords(filteredScored);

  const investorRecords = ranked.map((r) => r.investor);
  const validationRecords = ranked.map((r) => ({
    id: r.investor.id,
    name: r.investor.name,
    ...r.validation,
  }));

  writeJson("investor_records.json", investorRecords);
  writeJson("validation_records.json", validationRecords);

  const flatRows = prepareFlatRows(ranked);
  writeCsv(
    "scored_shortlist.csv",
    flatRows,
    [
      "id",
      "name",
      "geo",
      "thesis_tags",
      "check_range",
      "check_min_usd",
      "check_max_usd",
      "source_type",
      "source_label",
      "source_link",
      "proof_quality",
      "legal_risk_flag",
      "check_fit",
      "thesis_fit",
      "recency",
      "source_reliability",
      "intro_access",
      "risk_penalty",
      "total",
      "tier",
      "role_expected",
      "first_touch_channel",
      "owner",
      "deadline",
      "reason_codes",
      "email",
      "telegram",
      "social",
      "notes",
    ]
  );

  fs.writeFileSync(path.join(OUT_DIR, "tier_shortlist.md"), buildTierMarkdown(ranked), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "wave_plan.md"), buildWavePlan(ranked), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "outreach_templates.md"), buildOutreachTemplates(), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "outreach_tracker.csv"), buildTrackerCsv(ranked), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "README.md"), buildSummaryMd(ranked), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "data_contracts.md"), buildDataContractsMd(), "utf8");
  fs.writeFileSync(
    path.join(OUT_DIR, "source_validation_baseline.md"),
    buildSourceValidationBaselineMd(),
    "utf8"
  );
  fs.writeFileSync(path.join(OUT_DIR, "test_report.md"), buildTestReportMd(ranked), "utf8");

  console.log(`Generated shortlist package in ${OUT_DIR}`);
  console.log(`Parsed rows: ${parsedRows.length}`);
}

main();
