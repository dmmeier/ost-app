# OST App — Structured Requirements

## 1. Core Data Model: The OST Structure

The central concept is the **Opportunity Solution Tree (OST)**, a hierarchical tree with the following node types:

| Node Type | Space | Description |
|---|---|---|
| **Outcome** | Goal | Measurable metric (root of tree) |
| **Opportunity** | Problem | User need / pain point / barrier |
| **Child Opportunity** | Problem | Decomposed sub-problem |
| **Solution** | Solution | Proposed way to address an opportunity |
| **Experiment** | Solution | Test to validate an assumption |

**Key structural properties:**
- Nodes carry **assumptions** (explicit causality between parent and child).
- Must distinguish between **problem hypotheses** (Opportunity space) and **solution hypotheses** (Solution/Experiment space).
- The tree must **fan out** — avoid linearity. Each level should branch into multiple children.
- **No duplicate leaves** — the same leaf must not appear in multiple places. If it does, the tree needs restructuring.

**Reference:** Structural rules & data model in `docs/ost_recipe.md`. Interactive coaching guide in `docs/skills/opportunity-solution-tree.md`.

---

## 2. Storage & Persistence

- The OST structure must be persisted (database, CSV, or other storage).
- **Multiple OSTs** must be supported (create, list, select, delete).
- An "OST expert agent" should research and recommend the best representation.
- **Decision from research:** PostgreSQL with `ltree` for production; SQLite with adjacency list + closure table for simplicity/portability during development.

---

## 3. Tree Manipulation Capabilities

The app must support the following operations on an OST:

| Operation | Description |
|---|---|
| **Add nodes/leaves** | Add new Outcomes, Opportunities, Solutions, Experiments |
| **Remove nodes/leaves** | Delete a node (and optionally its subtree) |
| **Move subtrees** | Relocate a part of the tree to a different parent |
| **Combine/merge trees** | Merge two OSTs together (with conflict resolution) |
| **Refine** | Decompose an Opportunity into Child Opportunities |
| **Validate structure** | Check for duplicate leaves, linearity, missing branches, type constraints |

Additional operations discovered during research:
- Archive/prune branches (hide but preserve history)
- Expand/collapse subtrees (UI state)
- Duplicate detection (semantically similar nodes)
- Query ancestors/descendants efficiently

---

## 4. Exposure: API and CLI

All capabilities must be exposed through **two interfaces:**

### 4a. REST API
- Full CRUD for trees, nodes, edges.
- Validation endpoints.
- Built with **FastAPI** (Python).

### 4b. CLI Tool
- Command-line interface for all tree operations.
- Built with **Typer** (Python).
- Useful for scripting, automation, and developer workflows.

---

## 5. Structural Validation ("Good OST" Rules)

Certain rules define a well-formed OST. These must be encoded as a validation engine usable from the API, CLI, and chat interface:

- **No duplicate leaves** — same leaf in multiple places → restructure needed.
- **Fan-out check** — no single-child chains (tree should branch).
- **Type constraints** — Outcome → Opportunity → Child Opportunity → Solution → Experiment (correct parent-child type relationships).
- **Problem vs. solution separation** — Opportunities must be problems, not solutions in disguise.
- **Assumption completeness** — every non-root node should have an explicit assumption.

---

## 6. AI Chat Interface (Agentic Flow)

- The web UI must include a **chat interface** where the user can interact with the tree using natural language.
- This is an **agentic flow**: the AI has access to tree manipulation tools and can:
  - **View** the current tree structure.
  - **Modify** the tree (add, remove, move nodes).
  - **Validate** the tree and suggest improvements.
  - **Advise** on OST best practices (e.g., "this opportunity looks like a solution in disguise").
  - **Make suggestions** (e.g., "consider decomposing this opportunity further").
- The chat agent must be able to **see the tree** to give context-aware advice.
- The UI should be a **split-pane layout**: tree visualization on one side, chat on the other.

---

## 7. Web UI

- Interactive tree visualization (expand/collapse, drag-and-drop, different node colors by type).
- Edge labels showing assumptions/hypotheses.
- Split-pane layout: tree + chat.
- **Technology:** React/Next.js frontend with ReactFlow for tree visualization.

---

## 8. Feedback Button (Iterative Development Loop)

- The UI must have a **feedback button** that the user can click.
- On click: opens a feedback form where the user can type feedback.
- **Ideally**: the user can attach/take **screenshots** and send them along with feedback.
- This feedback should be routed to **Claude Code** so it can directly start working on the feedback.
- Goal: fast iteration loop — user sees something wrong → clicks feedback → Claude Code picks it up and starts fixing.
- **Feasibility note:** This is feasible via file-based communication (write feedback + screenshot to a watched directory that Claude Code reads).

---

## 9. Agent Team Structure

The project should be built using an **agent team** with specialized roles:

| Agent | Responsibility |
|---|---|
| **Product Manager** | Requirements, prioritization, user stories |
| **Product Designer** | UI/UX, interaction design, visual hierarchy |
| **OST Expert** | Domain knowledge, structural rules, validation logic |
| **Backend Engineer** | API, database, core library, CLI |
| **Frontend Engineer** | React/Next.js UI, tree visualization, chat interface |
| **Code Quality / Testing** | Tests, linting, code review, CI/CD |

---

## 10. Technical Constraints & Preferences

- **Primary language:** Python (as much logic as possible).
- **Frontend:** React/Next.js (JavaScript/TypeScript as needed for UI).
- **Database:** Start with SQLite for simplicity; design for PostgreSQL migration.
- **Project structure:** Monorepo with shared core library (`ost_core`).
- **Git:** Make periodic commits as work progresses.

---

## 11. Non-Functional Requirements

- The app should be usable for real product discovery work.
- Tree operations should be fast enough for interactive use.
- The chat agent should give context-aware, domain-expert-level advice.
- The codebase should be well-tested and maintainable.
