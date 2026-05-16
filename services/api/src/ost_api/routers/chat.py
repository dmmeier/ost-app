"""Chat endpoint with agentic tool-use loop."""

import json
import logging
import re
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from ost_core.db.repository import TreeRepository
from ost_core.exceptions import PermissionDeniedError
from ost_core.llm import LLMProvider, LLMResponse, get_llm_provider
from ost_core.llm.tools import CHAT_TOOLS
from ost_core.models import (
    EdgeHypothesisCreate,
    EdgeHypothesisUpdate,
    HypothesisType,
    NodeAssumptionCreate,
    NodeAssumptionUpdate,
    NodeCreate,
    NodeUpdate,
    ProjectCreate,
    ProjectUpdate,
    TreeCreate,
    TreeUpdate,
)
from ost_core.models.user import User
from ost_core.services.tree_service import TreeService
from ost_core.validation.validator import TreeValidator
from pydantic import BaseModel

from ost_api.deps import get_current_user_required, get_repo, get_service, get_tree_validator

logger = logging.getLogger(__name__)

router = APIRouter()

SYSTEM_PROMPT = """You are an expert Opportunity Solution Tree (OST) coach and product discovery advisor.

You help product teams build and refine their OSTs using Teresa Torres' Continuous Discovery framework.

## OST Structure
The tree has 5 node types in a strict hierarchy:
- **Outcome** (root): A single measurable metric (e.g., "Increase DAU to 1M")
- **Opportunity**: User needs/pain points blocking the outcome (problems, NOT solutions)
- **Child Opportunity**: Decomposed sub-problems of an opportunity
- **Solution**: Ideas to address an opportunity or child opportunity
- **Experiment**: Tests to validate a solution's assumptions

## Key Principles
1. **Opportunities are PROBLEMS, not solutions.** "Add SSO login" is a solution; "Users forget their passwords" is an opportunity.
2. **Fan out, don't go linear.** Each opportunity should have multiple child opportunities. Each child opportunity should have multiple solutions.
3. **Every node carries an assumption.** Each non-root node has an assumption field explaining \
why it matters for its parent, and an evidence field for supporting data.
4. **Assumptions need testing.** Important assumptions should be tested with experiments.
5. **Breadth before depth.** Explore multiple opportunities before diving deep into one.

## CRITICAL: Assumptions on Every Node
Every non-root node in the tree should have an assumption — a hypothesis explaining why this node \
matters for its parent. This is the heart of the OST method. When you add a node, ALWAYS set its \
assumption using `update_node(node_id, assumption="...", evidence="...")`. Ask the user:
- "What assumption are you making here? What must be true for [child] to matter for [parent]?"

## IMPORTANT: Suggest First, Act Only When Asked
**NEVER modify the tree (add nodes, update assumptions, etc.) unless the user \
explicitly asks you to.** Your role is to coach and advise. Suggest what changes could be made, \
explain why, and wait for the user to say "yes", "do it", "go ahead", or similar before using \
any tool that modifies the tree. Read-only tools (get_tree, validate_tree) are always fine.

## Your Workflow
When the user shares an opportunity, solution, or idea:
1. ALWAYS call get_tree first to see the current tree state
2. Analyze where the input fits in the tree structure
3. Explain your reasoning about placement
4. **SUGGEST** what you would add and where — do NOT add it yet
5. Wait for the user to confirm before making any changes
6. Once confirmed, add the node and set its assumption via `update_node`
7. Ask: "What's the key assumption here?" and record it

When the user asks to validate, check, or review their tree (e.g., "check my tree", "is this ready?", "validate"):
1. Call `validate_tree` tool to get current validation status
2. Present results in a scannable format with visual indicators:

   **Validation Results: [✅ Tree looks great! | ⚠️ N suggestions | ❌ N issues found]**

   If issues exist, group by rule with specific node references:
   - **Fan-out**: Node #5 'Authentication' has 8 children (recommend max 5)
   - **Missing Assumptions**: Node #3 'Password Reset' lacks assumption

3. Use conversational language with specific node references (include node number and title)
4. Explain WHY each issue matters (OST methodology context)
5. Suggest concrete fixes when helpful
6. Offer to help fix specific issues if the user wants
7. **Only make changes when the user explicitly asks you to**

Be concise but educational. Explain OST principles as you apply them. \
**Always emphasize that assumptions are the most valuable part of the tree.**

## "Chat About This Node" Requests
When the user says they want to discuss or get help with a specific node, respond with a very brief \
summary of what that node is about (1-2 sentences max), then ask "What can I help you with?" \
Do NOT give unsolicited advice or ask "What should I consider?" — let the user drive the conversation.

## Node Indexes
Each node has a display index (#1, #2, #3...) visible in the UI. When referring to nodes, \
use both the index and title (e.g., "node #3 'Users forget passwords'") so users can easily \
find them. The indexes are included in the get_tree response.

## Agent Knowledge Management
You have access to persistent notes about this project (see "Agent Knowledge" section in context \
if present). When you learn important context during conversation — such as team constraints, \
stakeholder preferences, past decisions, product strategy, or user research findings — call \
`update_agent_knowledge` to save it. Include your prior knowledge notes (if any) plus the new \
information. Keep notes in concise bullet points. Update when:
- The user shares background about their team, product, or users
- A significant decision is made about the tree structure or strategy
- You learn constraints that would affect future sessions
Do NOT update for routine tree modifications — only for durable project context."""

SKILLS_NOTE = """
## PM Methodology Skills

You have access to detailed product management skill guides via the `list_skills` and `read_skill` \
tools. These cover OKR management, Opportunity Solution Trees, Discovery processes, and more. \
When the user asks about methodology, frameworks, or best practices related to these topics, \
call `list_skills` to see what's available, then `read_skill` to load the full guide. \
Apply the framework content to your coaching. New skills may be added at any time — always \
check `list_skills` for the current set.
"""

BUILDER_SYSTEM_PROMPT = """You are a guided OST Builder — an interactive coach that helps users \
construct an Opportunity Solution Tree from scratch through active questioning and brainstorming.

## Your Personality
- You are a curious, Socratic coach. You ask probing questions — not just "what" but "why" and \
"what assumptions are you making?"
- When the user says "not sure" or "what do you think?", you actively brainstorm WITH them — \
suggest 3-5 options, explain your reasoning, and let them pick or refine.
- You celebrate progress ("Great — we now have 3 opportunities branching from the outcome!")
- You gently redirect if the user jumps ahead (e.g., proposing solutions before opportunities are mapped).

## The 7-Step Process
Guide the user through these steps IN ORDER. Before moving to the next step, confirm the current \
step is sufficiently complete.

### Step 1: Define the Outcome (Root)
- Ask: "What measurable metric are you trying to improve? What does success look like?"
- Probe: "How would you measure that? What's the target?"
- When clear, call `add_node` with type=outcome.
- Confirm: "Your outcome is set: [title]. Now let's explore what's blocking this."

### Step 2: Identify Primary Opportunities (3-5)
- Ask: "What are the biggest pain points or barriers preventing this outcome?"
- Probe each one: "Why do you think this is important? What evidence do you have?"
- If user is stuck: Brainstorm — suggest 4-5 common patterns, ask which resonate.
- Call `add_node` with type=opportunity for each one under the outcome.
- Check: "We have [N] opportunities. Aim for at least 3. Any more, or shall we decompose these?"

### Step 3: Decompose into Child Opportunities
- For each opportunity, ask: "What are the smaller problems that make up this big problem?"
- Probe: "Why does this happen? What are the different facets?"
- Encourage breadth: "Can you think of at least 2-3 sub-problems here?"
- If user is stuck: Suggest decomposition patterns, ask user to react.
- Call `add_node` with type=child_opportunity.

### Step 4: Brainstorm Solutions
- For each leaf child opportunity, ask: "What are some ways we could address this?"
- Encourage volume: "Don't evaluate yet — let's get at least 3 ideas on the board."
- If user says "not sure": Actively suggest 3-5 ideas, explain reasoning, ask which to keep.
- Call `add_node` with type=solution.

### Step 5: Record Assumptions (CRITICAL STEP)
This is the MOST IMPORTANT step. Every non-root node should have an assumption explaining \
why it matters for its parent. Without assumptions, the tree is just a wishlist.
- **For EVERY non-root node**, ask: "What assumption connects [parent] to [child]?"
- Probe deeply: "What are you assuming about users? About feasibility? About viability?"
- Call `update_node(node_id, assumption="...", evidence="...")` for EACH node.
- Remind user: "Assumptions are the most valuable part of your OST — they tell you what to test."

### Step 6: Define Experiments
- For key assumptions, ask: "What's the smallest, fastest test we could run to validate this?"
- Help frame: "We believe [assumption]. We'll test by [method]. We'll know it's true if [evidence]."
- Call `add_node` with type=experiment to test key assumptions.

### Step 7: Review & Validate
- Call `validate_tree` and present the results in a clear, visual format:

  **Validation Results: [✅ Tree looks great! | ⚠️ N suggestions | ❌ N issues found]**

  If issues exist, group them by rule and explain each with specific node references.

- Summarize the tree structure with counts by type.
- Celebrate what's working well before pointing out issues.
- Suggest next actions.

## Progress Tracking
ALWAYS call `get_tree` at the start of each turn to observe the current state. Determine which \
step the user is on based on what nodes exist:
- No nodes → Step 1
- Outcome only → Step 2
- Outcome + Opportunities (no child_opportunity) → Step 3
- Child Opportunities exist (no solutions) → Step 4
- Solutions exist (nodes missing assumptions or no experiments) → Steps 5-6
- Experiments exist → Step 7

## Brainstorming Mode
When the user says things like "not sure", "I don't know", "what do you think?", "help me brainstorm":
1. Acknowledge their uncertainty positively: "That's totally normal at this stage."
2. Suggest 3-5 concrete options with brief rationale for each.
3. Ask: "Do any of these resonate? Or do they spark a different idea?"
4. If they pick one, probe deeper: "Tell me more — why does that one feel right?"
5. NEVER just add nodes without user agreement — always propose, then confirm.

## Key Rules
- ONE step at a time. Don't overwhelm.
- Ask ONE question at a time (possibly with sub-prompts, but keep it focused).
- Always explain WHY you're asking — connect to OST theory briefly.
- After adding nodes, summarize what changed and what comes next.
- If the user goes off-track, gently redirect with encouragement.
- **ALWAYS record assumptions**: When adding ANY non-root node, call `update_node` to set the \
assumption and evidence fields. Ask the user what they're assuming. \
Assumptions are the most valuable output of the OST process — they reveal what to test.

## Node Indexes
Each node has a display index (#1, #2, #3...) visible in the UI. When referring to nodes, \
use both the index and title (e.g., "node #3 'Users forget passwords'") so users can easily \
find them. The indexes are included in the get_tree response.

## Agent Knowledge Management
You have access to persistent notes about this project (see "Agent Knowledge" section in context \
if present). When you learn important context during conversation — such as team constraints, \
stakeholder preferences, past decisions, product strategy, or user research findings — call \
`update_agent_knowledge` to save it. Include your prior knowledge notes (if any) plus the new \
information. Keep notes in concise bullet points."""


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    tree_id: str
    provider: str | None = None
    mode: str | None = None  # "coach" (default) or "builder"


class ChatResponse(BaseModel):
    messages: list[dict[str, Any]]
    final_text: str
    mode: str | None = None
    system_prompt: str | None = None


def _get_skills_dir() -> Path:
    """Resolve the skills directory (docs/skills/ relative to project root)."""
    # Walk up from this file to find the project root (where docs/ lives)
    current = Path(__file__).resolve()
    for parent in current.parents:
        candidate = parent / "docs" / "skills"
        if candidate.is_dir():
            return candidate
    # Fallback: relative to cwd
    return Path("docs/skills")


def _list_skills() -> list[dict[str, str]]:
    """List available skills with name and description from frontmatter."""
    skills_dir = _get_skills_dir()
    if not skills_dir.exists():
        return []
    results = []
    for f in sorted(skills_dir.glob("*.md")):
        if f.name == "ATTRIBUTION.md":
            continue
        content = f.read_text(encoding="utf-8")
        # Extract description from YAML frontmatter
        description = ""
        if content.startswith("---"):
            match = re.search(r"^description:\s*(.+?)(?:\n\w|\n---)", content, re.MULTILINE | re.DOTALL)
            if match:
                description = match.group(1).strip().replace("\n", " ")
                # Clean up YAML multi-line
                description = re.sub(r"\s+", " ", description)
        if not description:
            # Fallback: first non-empty, non-heading line
            for line in content.splitlines()[1:20]:
                stripped = line.strip()
                if stripped and not stripped.startswith("#") and not stripped.startswith("---"):
                    description = stripped[:200]
                    break
        results.append({"name": f.stem, "file": f.name, "description": description[:300]})
    return results


def _read_skill(skill_name: str) -> str:
    """Read the full content of a skill file."""
    skills_dir = _get_skills_dir()
    # Try exact match first, then with .md extension
    candidates = [
        skills_dir / skill_name,
        skills_dir / f"{skill_name}.md",
    ]
    for path in candidates:
        if path.exists() and path.is_file():
            return path.read_text(encoding="utf-8")
    available = [f.name for f in skills_dir.glob("*.md") if f.name != "ATTRIBUTION.md"]
    return f"Skill '{skill_name}' not found. Available skills: {', '.join(available)}"


def _execute_tool(
    tool_name: str,
    arguments: dict[str, Any],
    service: TreeService,
    validator: TreeValidator,
    user_id: str | None = None,
) -> str:
    """Execute a tool call and return the result as a string.

    user_id is passed through so mutations (e.g. create_project) are
    attributed to the authenticated user.
    """
    try:
        if tool_name == "get_tree":
            result = service.get_full_tree(UUID(arguments["tree_id"]))
            data = result.model_dump(mode="json")
            # Add BFS indexes so AI can reference nodes by #N
            nodes = data.get("nodes", [])
            children_map: dict[str | None, list[dict]] = {}
            root_nodes: list[dict] = []
            for n in nodes:
                pid = n.get("parent_id")
                if pid is None:
                    root_nodes.append(n)
                else:
                    children_map.setdefault(pid, []).append(n)
            # Sort roots by sort_order for consistent numbering
            root_nodes.sort(key=lambda r: (r.get("sort_order", 0), r.get("created_at", "")))
            # BFS across all roots sequentially
            queue = list(root_nodes)
            idx = 1
            while queue:
                current = queue.pop(0)
                current["index"] = idx
                idx += 1
                queue.extend(children_map.get(current["id"], []))
            return json.dumps(data, indent=2)

        elif tool_name == "add_node":
            node = service.add_node(
                UUID(arguments["tree_id"]),
                NodeCreate(
                    title=arguments["title"],
                    node_type=arguments["node_type"],
                    parent_id=UUID(arguments["parent_id"]) if arguments.get("parent_id") else None,
                    description=arguments.get("description", ""),
                    assumption=arguments.get("assumption"),
                    evidence=arguments.get("evidence"),
                ),
                user_id=user_id,
            )
            return json.dumps(node.model_dump(mode="json"))

        elif tool_name == "update_node":
            node = service.update_node(
                UUID(arguments["node_id"]),
                NodeUpdate(
                    title=arguments.get("title"),
                    description=arguments.get("description"),
                    assumption=arguments.get("assumption"),
                    evidence=arguments.get("evidence"),
                ),
                user_id=user_id,
            )
            return json.dumps(node.model_dump(mode="json"))

        elif tool_name == "remove_node":
            service.remove_node(UUID(arguments["node_id"]), user_id=user_id)
            return json.dumps({"status": "removed", "node_id": arguments["node_id"]})

        elif tool_name == "move_node":
            service.move_subtree(UUID(arguments["node_id"]), UUID(arguments["new_parent_id"]), user_id=user_id)
            return json.dumps({"status": "moved"})

        elif tool_name == "set_edge_hypothesis":
            edge = service.set_edge_hypothesis(
                EdgeHypothesisCreate(
                    parent_node_id=UUID(arguments["parent_node_id"]),
                    child_node_id=UUID(arguments["child_node_id"]),
                    hypothesis=arguments["hypothesis"],
                    hypothesis_type=HypothesisType(arguments["hypothesis_type"]),
                    is_risky=arguments.get("is_risky", False),
                    evidence=arguments.get("evidence", ""),
                )
            )
            return json.dumps(edge.model_dump(mode="json"))

        elif tool_name == "update_edge":
            edge = service.update_edge(
                UUID(arguments["edge_id"]),
                EdgeHypothesisUpdate(
                    hypothesis=arguments.get("hypothesis"),
                    hypothesis_type=HypothesisType(arguments["hypothesis_type"]) if arguments.get("hypothesis_type") else None,
                    is_risky=arguments.get("is_risky"),
                    status=arguments.get("status"),
                    evidence=arguments.get("evidence"),
                ),
            )
            return json.dumps(edge.model_dump(mode="json"))

        elif tool_name == "validate_tree":
            report = validator.validate(UUID(arguments["tree_id"]))
            return json.dumps(report.model_dump(mode="json"))

        elif tool_name == "list_project_tags":
            tags = service.list_tags(UUID(arguments["project_id"]))
            return json.dumps([t.model_dump(mode="json") for t in tags])

        elif tool_name == "add_tag_to_node":
            tag = service.add_tag_to_node_by_name(
                UUID(arguments["node_id"]),
                arguments["tag_name"],
                UUID(arguments["project_id"]),
                user_id=user_id,
            )
            return json.dumps(tag.model_dump(mode="json"))

        elif tool_name == "remove_tag_from_node":
            service.remove_tag_from_node(
                UUID(arguments["node_id"]),
                UUID(arguments["tag_id"]),
                user_id=user_id,
            )
            return json.dumps({"status": "removed"})

        elif tool_name == "get_tree_filtered_by_tag":
            result = service.get_tree_filtered_by_tag(
                UUID(arguments["tree_id"]),
                arguments["tag_name"],
            )
            return json.dumps(result.model_dump(mode="json"))

        elif tool_name == "update_agent_knowledge":
            service.update_tree(
                UUID(arguments["tree_id"]),
                TreeUpdate(agent_knowledge=arguments["knowledge"]),
                user_id=user_id,
            )
            return json.dumps({"status": "updated", "tree_id": arguments["tree_id"]})

        elif tool_name == "rename_tree":
            tree = service.update_tree(
                UUID(arguments["tree_id"]),
                TreeUpdate(name=arguments["name"]),
                user_id=user_id,
            )
            return json.dumps({"status": "renamed", "name": tree.name, "tree_id": str(tree.id)})

        elif tool_name == "rename_project":
            project = service.update_project(
                UUID(arguments["project_id"]),
                ProjectUpdate(name=arguments["name"]),
            )
            return json.dumps({"status": "renamed", "name": project.name, "project_id": str(project.id)})

        elif tool_name == "add_assumption":
            assumption = service.add_assumption(
                UUID(arguments["node_id"]),
                NodeAssumptionCreate(
                    text=arguments.get("text", ""),
                    evidence=arguments.get("evidence", ""),
                ),
            )
            return json.dumps(assumption.model_dump(mode="json"))

        elif tool_name == "update_assumption":
            assumption = service.update_assumption(
                UUID(arguments["assumption_id"]),
                NodeAssumptionUpdate(
                    text=arguments.get("text"),
                    evidence=arguments.get("evidence"),
                    status=arguments.get("status"),
                ),
            )
            return json.dumps(assumption.model_dump(mode="json"))

        elif tool_name == "reject_assumption":
            assumption = service.update_assumption(
                UUID(arguments["assumption_id"]),
                NodeAssumptionUpdate(status="rejected"),
            )
            return json.dumps(assumption.model_dump(mode="json"))

        elif tool_name == "delete_assumption":
            service.delete_assumption(UUID(arguments["assumption_id"]))
            return json.dumps({"status": "deleted", "assumption_id": arguments["assumption_id"]})

        elif tool_name == "create_project":
            project = service.create_project(
                ProjectCreate(
                    name=arguments["name"],
                    description=arguments.get("description", ""),
                ),
                user_id=user_id,
            )
            return json.dumps(project.model_dump(mode="json"))

        elif tool_name == "create_tree":
            tree = service.create_tree(
                TreeCreate(
                    project_id=UUID(arguments["project_id"]),
                    name=arguments["name"],
                    description=arguments.get("description", ""),
                ),
                user_id=user_id,
            )
            return json.dumps(tree.model_dump(mode="json"))

        elif tool_name == "list_skills":
            skills = _list_skills()
            return json.dumps(skills, indent=2)

        elif tool_name == "read_skill":
            content = _read_skill(arguments["skill_name"])
            return content

        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})

    except Exception as e:
        return json.dumps({"error": str(e)})


@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    service: TreeService = Depends(get_service),
    validator: TreeValidator = Depends(get_tree_validator),
    repo: TreeRepository = Depends(get_repo),
    user: User | None = Depends(get_current_user_required),
):
    """Agentic chat endpoint with tool-use loop.

    The AI can inspect, modify, and validate the tree through tool calls.
    The loop continues until the AI produces a text response without tool calls.
    """
    try:
        provider: LLMProvider = get_llm_provider(request.provider)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    base_prompt = BUILDER_SYSTEM_PROMPT if request.mode == "builder" else SYSTEM_PROMPT

    # Fetch tree and parent project to inject context and agent knowledge
    try:
        tree_data = service.get_tree(UUID(request.tree_id))
    except Exception:
        tree_data = None

    # RBAC: builder mode requires editor, coach mode requires viewer
    chat_min_role = "editor" if request.mode == "builder" else "viewer"
    try:
        if tree_data:
            service.check_project_permission(
                str(user.id) if user else None, str(tree_data.project_id), chat_min_role
            )
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))

    project_data = None
    if tree_data:
        try:
            project_data = service.get_project(tree_data.project_id)
        except Exception:
            project_data = None

    project_id_str = str(tree_data.project_id) if tree_data else None
    context_parts = [
        f"## Current Context\n"
        f"You are working on tree ID: `{request.tree_id}`.\n"
        + (f"The tree belongs to project ID: `{project_id_str}`.\n" if project_id_str else "")
        + f"ALWAYS use this tree_id when calling get_tree, add_node, validate_tree, "
        f"and any other tool that requires a tree_id. "
        f"Use the project_id above for any tool that requires a project_id. "
        f"NEVER ask the user for the tree ID or project ID — you already have them."
    ]

    if project_data and project_data.project_context:
        ctx = project_data.project_context[:2000]
        if len(project_data.project_context) > 2000:
            last_period = ctx.rfind(".")
            if last_period > 0:
                ctx = ctx[:last_period + 1]
            ctx += " [truncated]"
        context_parts.append(f"## Project Context (shared across all trees in this project)\n{ctx}")

    if tree_data and tree_data.tree_context:
        ctx = tree_data.tree_context[:2000]
        if len(tree_data.tree_context) > 2000:
            last_period = ctx.rfind(".")
            if last_period > 0:
                ctx = ctx[:last_period + 1]
            ctx += " [truncated]"
        context_parts.append(f"## Tree Context (specific to this tree)\n{ctx}")

    if tree_data and tree_data.agent_knowledge:
        knowledge = tree_data.agent_knowledge[:1500]
        if len(tree_data.agent_knowledge) > 1500:
            last_period = knowledge.rfind(".")
            if last_period > 0:
                knowledge = knowledge[:last_period + 1]
            knowledge += " [truncated]"
        context_parts.append(f"## Agent Knowledge (from previous sessions)\n{knowledge}")

    system_prompt = f"{base_prompt}\n\n{SKILLS_NOTE}\n\n" + "\n\n".join(context_parts)

    messages = list(request.messages)
    all_messages = list(messages)  # Track full conversation for response

    max_iterations = 10
    final_text = ""

    for _ in range(max_iterations):
        response: LLMResponse = await provider.chat_with_tools(
            messages=messages,
            tools=CHAT_TOOLS,
            system_prompt=system_prompt,
        )

        if response.tool_calls:
            # Build assistant message with tool calls
            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "tool_calls": [
                    {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                    for tc in response.tool_calls
                ],
            }
            if response.text:
                assistant_msg["text"] = response.text
            messages.append(assistant_msg)
            all_messages.append(assistant_msg)

            # Execute each tool call and add results
            for tc in response.tool_calls:
                result = _execute_tool(tc.name, tc.arguments, service, validator, user_id=str(user.id) if user else None)
                tool_result_msg = {
                    "role": "tool_result",
                    "tool_use_id": tc.id,
                    "tool_name": tc.name,
                    "content": result,
                }
                messages.append(tool_result_msg)
                all_messages.append(tool_result_msg)
        else:
            # No tool calls — we have the final text response
            final_text = response.text or ""
            all_messages.append({"role": "assistant", "content": final_text})
            break
    else:
        final_text = "I've reached the maximum number of tool calls. Here's what I've done so far."
        all_messages.append({"role": "assistant", "content": final_text})

    # Persist the new messages (user message + AI response) to chat history
    try:
        # Save just the user's new message and the AI's response messages
        # (not the full history which was already saved in previous turns)
        new_msgs_to_save = []
        # The user's latest message is always the last in the original request
        if request.messages:
            new_msgs_to_save.append(request.messages[-1])
        # Save all new messages generated in this exchange
        for msg in all_messages[len(request.messages):]:
            new_msgs_to_save.append(msg)
        if new_msgs_to_save:
            repo.save_chat_messages(
                UUID(request.tree_id),
                new_msgs_to_save,
                mode=request.mode or "coach",
                user_id=str(user.id) if user else None,
            )
    except Exception as e:
        logger.warning(f"Failed to save chat history: {e}")

    return ChatResponse(messages=all_messages, final_text=final_text, mode=request.mode, system_prompt=system_prompt)
