# OST Data Model & Validation Rules

> **Purpose:** This file defines the structural rules that the application code enforces —
> node hierarchy, allowed edge types, fan-out constraints, and assumption semantics.
> It is the source of truth for `packages/ost_core/services/validation.py`.
>
> For the interactive coaching guide used by the chat agent, see
> [`docs/skills/opportunity-solution-tree.md`](skills/opportunity-solution-tree.md).

## Overview

The OST is a structured product discovery framework. The structure is highly branched:
**Outcome → Opportunity → Child Opportunity → Solutions → Experiments**

The core innovation is focusing on the **assumptions behind each node** — why it matters for its parent — ensuring every decision is backed by explicit logic. This is the "Hypothesis Factory" approach.

---

## Step 1: Define the Anchor (The Root)

- Must be a single, **measurable metric** — the final destination and goal of the entire factory.
- **Action:** State your desired Outcome (e.g., "Increase DAU to 1,000,000").
- **Edge Check (Implicit Strategic Assumption):** By defining this outcome, you assume it is the most valuable thing to work on right now.

## Step 2: Identify Primary Opportunities (Level 1)

- Identify the top 3–5 high-level needs or pain points blocking the Outcome.
- **Action:** Interview users or use high-level data to identify problems.
- **Edge Check (Primary Strategic Assumption):** You assert that fixing these opportunities will drive the Outcome. If unsure, insert a research step (Experiment leaf) to validate.

## Step 3: Decompose into Child Opportunities (Non-Linearity)

**This is the most critical step for avoiding a linear tree.** Never jump directly to a solution from a high-level opportunity.

- **Action:** For each Primary Opportunity, ask "Why?" or "What are the smaller problems that make up this big problem?"
- **Example:**
  - Primary Opportunity: "Users struggle to complete complex tasks."
    - Child 1: "I don't know where to start."
    - Child 2: "I get stuck in the middle and lose my progress."
    - Child 3: "I don't trust the final result."
- Continue decomposing until the problem is specific and actionable enough to brainstorm distinct solutions. The tree should **fan out** here.

## Step 4: Brainstorm Solutions

- For each lowest-level Child Opportunity, generate a **breadth** of potential solutions.
- **Action:** Generate multiple Solutions (at least 3–5) per Child Opportunity.
- **Rule:** Do not evaluate them yet. Focus on creativity.

## Step 5: Evaluate Assumptions

For each Solution, document the key assumptions — why you believe this solution will address its parent Opportunity.

- **Action:** For each promising Solution, ask: "What must be true for this Solution to fix this Child Opportunity?"
- Record each assumption directly on the node. Consider desirability, viability, and feasibility dimensions.
- Use your judgement to decide which assumptions are most critical to validate first.

## Step 6: Define the Experiments

- For assumptions you want to validate, define Experiment nodes under the relevant Solution.
- The experiment should be the **smallest, fastest** way to prove or disprove the assumption.
- **Hypothesis format:** "We believe testing [Specific Assumption] with [Test Method] will provide [Evidence Type] that validates our Solution."
- It is common to have competing Experiments (A/B tests, prototypes) from different Solutions targeting the same Child Opportunity.

## Step 7: Prune and Iterate

The OST is a **living document**, not a static map.

- **Pruning:** If an experiment invalidates an assumption, prune that Solution and its experiment leaves. The Opportunity remains — other Solutions are ready to test.
- **Iteration:** When an assumption is validated, move the solution into development. Continue evaluating remaining assumptions on other solutions.

---

## Key Structural Rules

1. **No duplicate leaves:** The same leaf should not appear in multiple places on the tree. If it does, the tree needs restructuring.
2. **Distinguish problem vs. solution hypotheses:** Problem hypotheses live in the Opportunity space; solution hypotheses live in the Solution/Experiment space.
3. **Fan out, don't go linear:** Every level should branch into multiple children.
4. **Nodes carry assumptions:** Every non-root node has an assumption explaining why it matters for its parent, plus optional evidence supporting that assumption.

## Node Types

| Node Type | Space | Description |
|---|---|---|
| **Outcome** | Goal | Measurable metric (root of tree) |
| **Opportunity** | Problem | User need, pain point, or barrier |
| **Child Opportunity** | Problem | Decomposed sub-problem |
| **Solution** | Solution | Proposed way to address an opportunity |
| **Experiment** | Solution | Test to validate an assumption |
