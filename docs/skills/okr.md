---
name: pm-okrs
description: >
  Define, refine, track, and score OKRs (Objectives and Key Results) for product teams.
  Supports the full OKR lifecycle: brainstorming objectives from strategy or user input,
  writing measurable key results, aligning OKRs across company/team/individual levels,
  mid-cycle check-ins, and end-of-quarter scoring. Flexible methodology — works with
  classic Doerr/Google scoring (0–1.0), outcome-based (Cagan-style), or custom formats.
  Use this skill whenever the user mentions OKRs, objectives and key results, quarterly goals,
  team goals, goal-setting frameworks, OKR scoring, OKR check-ins, goal alignment,
  cascading objectives, or asks to set priorities for a planning cycle. Also triggers when
  someone says things like "what should my team focus on this quarter", "help me write goals",
  "score our OKRs", or "are our goals aligned". Works for PM, engineering, design, or any
  cross-functional team.
---

# PM OKR Skill

You help product teams define, refine, track, and score OKRs across the full lifecycle. This skill covers everything from the initial brainstorm ("what should we focus on?") to end-of-quarter retrospectives ("how did we do?").

## Detect the user's intent

The user might be at any stage of the OKR lifecycle. Read their message carefully and figure out which mode to operate in:

| User intent | Mode | What to do |
|---|---|---|
| "Help me write OKRs" / "What should we focus on?" | **Define** | Guide them through objective brainstorming and KR writing |
| "Review these OKRs" / "Are these good?" | **Refine** | Critique and improve existing OKRs |
| "How are we tracking?" / "Mid-quarter check-in" | **Check-in** | Assess progress, flag risks, suggest adjustments |
| "Score our OKRs" / "End of quarter review" | **Score** | Grade KRs, summarize outcomes, extract learnings |
| "Align our goals with company OKRs" | **Align** | Map team/individual OKRs to higher-level objectives |

If the intent is ambiguous, ask — but make your best guess and confirm rather than asking from zero.

---

## Mode: Define

This is the most common starting point. Walk the user through creating OKRs step by step.

### Step 1: Gather context

Before writing anything, understand the landscape. Ask about (but don't overwhelm — skip what you can infer):

- **Team**: What team is this for? What's their mission or charter?
- **Level**: Are we writing company, team, or individual OKRs? (Support all three, and help cascade between them if needed.)
- **Time horizon**: Assume quarterly unless told otherwise.
- **Strategic context**: What's the company/team strategy? Any company-level OKRs to align with? What happened last quarter — what carried over, what's new?
- **Constraints**: Any fixed commitments, dependencies, or non-negotiables for this quarter?
- **Methodology preference**: Ask which style they prefer (see Methodology section below), or default to Classic if they don't have a preference.

You don't need answers to all of these before starting — sometimes the user just wants to brainstorm and the context will emerge. Be adaptive.

### Step 2: Brainstorm objectives

Help the user generate 3–5 candidate objectives. Good objectives are:

- **Qualitative and inspirational** — they describe a meaningful outcome, not a metric ("Become the most trusted onboarding experience" not "Increase NPS to 50")
- **Ambitious but achievable** — they should stretch the team without being demoralizing
- **Time-bound** — scoped to the quarter (or whatever cycle is in play)
- **Clearly owned** — it should be obvious which team or person drives this
- **Aligned upward** — each team objective should visibly support a company-level objective (if company OKRs exist)

Present the candidates and discuss. Help the user prioritize — most teams should have 3–5 objectives, not more. If they have 7+, help them consolidate or defer.

### Step 3: Write key results

For each objective, write 2–5 key results. Good KRs are:

- **Measurable** — you can objectively tell whether it was achieved. "Improve onboarding" is not a KR. "Reduce time-to-first-value from 14 days to 7 days" is.
- **Outcome-oriented** — measure the result, not the activity. "Ship 3 features" is an output. "Increase weekly active usage by 20%" is an outcome. Prefer outcomes, but sometimes outputs are the right stepping stone (especially for enabling work or infrastructure).
- **Specific** — include the metric, the baseline (where we are now), and the target (where we want to be).
- **Independently valuable** — each KR should matter on its own, not just be a checkbox.

For each KR, note:
- The **metric** being measured
- The **baseline** (current state)
- The **target** (desired end state)
- The **owner** (who's accountable)

### Step 4: Sanity-check the set

Before finalizing, review the full OKR set against these questions:

- **Coverage**: Do the objectives collectively capture the team's most important work this quarter?
- **Balance**: Is there a mix of growth/innovation and sustaining/quality work? Are we only measuring lagging indicators, or do we have some leading ones too?
- **Feasibility**: Given the team's capacity, is this achievable? Would the team need to work unsustainable hours to hit all targets?
- **Measurability**: For every KR, can we actually get the data? Is the measurement infrastructure in place?
- **Alignment**: If company OKRs exist, does every team objective clearly map to at least one company objective?

Flag any issues and suggest fixes.

### Step 5: Produce the output

Generate a clean markdown document. Use the output template from `references/output-templates.md` — read it before generating.

---

## Mode: Refine

The user has draft OKRs and wants feedback. Evaluate them against the quality criteria above and provide specific, actionable suggestions.

Structure your feedback as:

1. **Overall assessment** — one paragraph on the strengths and the biggest area for improvement
2. **Per-objective feedback** — for each objective and its KRs, note what works and what to improve
3. **Revised version** — rewrite the OKRs incorporating your suggestions, so the user can diff against their original

Common issues to watch for:
- **Vague KRs** — "Improve customer satisfaction" → suggest a specific metric and target
- **Output-disguised-as-outcome** — "Launch feature X" → ask what outcome the feature is meant to drive
- **Too many objectives** — help consolidate or defer
- **Missing baselines** — if there's a target but no baseline, flag it
- **Sandbagging** — if targets seem too easy given the context, gently push for more ambition
- **Moonshots everywhere** — if everything is a 10x stretch, the team will burn out. Mix in some achievable targets.

---

## Mode: Check-in

Mid-cycle progress review. Ask the user for:
- Their current OKRs (or refer to ones defined earlier in the conversation)
- Current status/progress on each KR
- Any blockers or changes in context

Then produce a check-in report:
- **On track / At risk / Off track** status for each KR with a brief rationale
- **Recommended actions** — what to do about at-risk items (re-scope, get help, deprioritize)
- **Context changes** — flag if any external changes (strategy shifts, team changes, market events) warrant adjusting the OKRs mid-cycle

Use the check-in template from `references/output-templates.md`.

---

## Mode: Score

End-of-cycle grading. For each KR, assign a score and extract learnings.

### Scoring approaches

Use whichever the user prefers. If they don't specify, default to Classic (0–1.0).

**Classic (Doerr/Google):**
- 0.0–0.3 = significant miss
- 0.4–0.6 = progress but fell short
- 0.7 = target met (this is the "expected" score — OKRs are set ambitiously)
- 0.8–1.0 = exceptional / exceeded expectations

**Binary:**
- Done / Not done (simpler, works for output-based KRs)

**Traffic light:**
- Green (met or exceeded) / Yellow (partial) / Red (missed)

**Percentage:**
- 0–100% of target achieved

### Scoring report

For each objective:
1. Score each KR individually
2. Compute an objective-level score (average of KR scores, or weighted if the user specifies weights)
3. Write a brief narrative: what drove the result, what we learned, what carries over

Then produce the overall quarterly summary using the scoring template from `references/output-templates.md`.

---

## Mode: Align

Help the user map OKRs across levels. This is about making sure team objectives clearly support company objectives, and individual objectives support team objectives.

### Alignment check

If the user provides OKRs at multiple levels, create an alignment map:
- For each team objective, show which company objective(s) it supports
- For each individual objective, show which team objective(s) it supports
- Flag any **orphan objectives** (team goals that don't map to any company goal)
- Flag any **uncovered company objectives** (company goals with no team-level support)
- Flag any **overloaded objectives** (too many teams piling onto one company goal while others are neglected)

Present this as a visual alignment table in the markdown output.

---

## Methodology reference

Support these styles and let the user choose (or mix):

**Classic (Doerr/Google):**
- Objectives are qualitative and inspirational
- Key Results are quantitative and measurable
- Scoring is 0–1.0, with 0.7 being "target met"
- OKRs are meant to be ambitious — hitting 70% is success

**Outcome-based (Cagan/Perri):**
- Focus on product outcomes over feature outputs
- KRs describe user/business behavior changes, not deliverables
- Pairs well with discovery-driven product teams
- "Ship feature X" is generally avoided in favor of "Users do Y"

**Hybrid:**
- Mix of outcome KRs and output KRs
- Useful when some work is exploratory (outcome KRs) and some is committed (output KRs)
- Common in practice even if not in textbooks

When the user doesn't specify, default to Classic but use outcome-oriented KR language where possible — it tends to produce better goals.

---

## Writing style for OKRs

When drafting OKR text, follow these principles:

- **Be specific, not corporate.** "Deliver world-class customer experience" is fluff. "Reduce median support response time from 4 hours to 1 hour" is real.
- **Use active language.** "Increase..." / "Reduce..." / "Achieve..." / "Launch..." — start KRs with verbs.
- **Include the numbers.** Every KR should have a number or a clear binary condition. If you find yourself writing a KR without a number, pause and ask whether it's really a KR or just an aspiration.
- **Keep objectives short.** One sentence, ideally under 15 words. The KRs carry the detail.
- **Avoid jargon where possible.** The OKR doc will be read by people outside the team — executives, partner teams, new hires. Clarity beats cleverness.

---

## Output format

Always produce a markdown document as the final deliverable. Read `references/output-templates.md` for the exact templates for each mode (Define, Check-in, Score, Align).

Save the output to the user's workspace so they can access it directly.
