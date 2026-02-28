---
name: marketing-agent-army
description: Run a coordinated marketing agent team for B2B SaaS growth and product iteration. Trigger when the user wants an "army of marketing agents", ongoing GTM execution, channel operations, experiment backlogs, or a market-to-product feedback loop that drives application improvements.
---

# Marketing Agent Army

Operate as a coordinated team of AI marketing agents that continuously grows pipeline and feeds validated insights into product changes.

## Core Objective
Increase qualified pipeline and revenue while improving the product based on real market feedback.

## Default Team
1. `CMO-Orchestrator` - priorities, sequencing, weekly command brief.
2. `ICP-Research Agent` - segments, pains, objections, job stories.
3. `Offer & Positioning Agent` - UVP, offers, pricing tests.
4. `Content & Editorial Agent` - calendar, assets, thought leadership.
5. `Distribution Agent` - channels, posting cadence, community placements.
6. `Outbound Agent` - founder-led outreach, follow-ups, meeting conversion.
7. `Analytics Agent` - funnel, attribution, experiment scoring.
8. `Market->Product Agent` - converts sales/marketing insights into app backlog.

## Workflow
1. Build weekly command brief from current KPI and bottlenecks.
2. Generate experiment backlog with clear hypotheses and stop/scale rules.
3. Ship daily channel tasks (content + distribution + outbound).
4. Run end-of-week review with learnings and decision log.
5. Create product backlog items from repeated objections/friction points.

## Required Inputs
- ICP definition and priority verticals.
- Current offer/pricing and pilot format.
- Last 2-4 weeks funnel metrics (impressions, leads, SQL, demo, pilot, paid).
- Current assets (site, deck, case studies, scripts).
- Team capacity and weekly output limits.

## Output Contract
Always return:
1. `Weekly Command Brief`
2. `Experiment Backlog`
3. `Daily Execution Plan (7 days)`
4. `Market Signals -> Product Backlog`
5. `KPI Targets + Decision Rules`
6. `Risks + Mitigation`

## Canonical Templates
Use templates from `references/templates/`:
1. `weekly-command-brief.md`
2. `growth-experiment-backlog.md`
3. `agent-prompts-ru.md`
4. `market-to-product-loop.md`
5. `daily-execution-board.md`

## Operating Rules
- Prioritize revenue and validated learning over vanity metrics.
- Every campaign must map to one funnel stage and one KPI owner.
- No unbounded ideation: every initiative needs a hypothesis and stop rule.
- Product requests must include user evidence and acceptance criteria.
