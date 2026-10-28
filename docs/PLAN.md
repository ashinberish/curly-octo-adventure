# Pixel Office — Plan

A 2D, 8‑bit style office you walk around in. Each employee at a desk is a **Claude agent**.
You give employees **skills** (what they're allowed and equipped to do) and **tasks** (what to do).
In the background a worker runs a Claude agent for each task, and the office reacts to it live:
people type when the agent is working, raise a "!" when it needs your permission, and the
whiteboard fills with sticky notes as work moves through the board.

> Mockup: [`mockup/index.html`](../mockup/index.html). Open it in a browser. The agent runs are
> simulated with canned scripts, so everything else (movement, skills, tasks, approvals, board)
> is clickable.

---

## 1. Core loop

1. **Walk** the office (WASD / arrows, or the d‑pad on touch screens).
2. **Talk** to an employee (`E` or click) to open their panel.
3. **Shape them** by toggling skills. Skills decide the agent's tools, instructions and MCP servers.
4. **Assign a task**: a title, details, and the skill it needs. If the employee lacks that skill,
   the UI warns you and suggests someone who has it.
5. **Watch**: the employee starts typing, a progress bar fills above their head, and the agent
   console streams what the agent is doing (tool calls, plans, results).
6. **Unblock**: when the agent wants to do something risky (`Bash(npm test)`, a deploy, a write
   outside its workspace) the employee raises a "!" and you approve or deny from the panel.
7. **Collect**: the finished task lands in *Done* with its output (a PR, a report, a file).

## 2. Feature scope

| Area | MVP | Later |
|---|---|---|
| World | One office map, collisions, y‑sorted sprites, desks, whiteboard, coffee | Several rooms/floors, doors, day/night, idle NPCs wandering, sound |
| Employees | Hire/fire, name, role, look, desk assignment | Sprite editor, levels/XP from finished tasks, moods tied to failures and load |
| Skills | Catalog of skills; toggle per employee; skill → tools/instructions/MCP | User‑made skills (upload a `SKILL.md`), skill marketplace, per‑skill cost caps |
| Tasks | Assign to a person or auto‑match by skill; queue per employee; status; cancel; retry | Dependencies between tasks, hand‑offs ("Ada → Linus for QA"), recurring tasks, meetings (multi‑agent at the table) |
| Agents | One Claude Agent SDK run per task, streamed live; permission prompts; final output | Sub‑agents, long‑running sessions per employee with memory, scheduled work |
| Board | Whiteboard tab: Needs you / Working / Queued / Done | Filters, history, cost per task, export |

## 3. Architecture

```
┌──────────────────────── Browser ────────────────────────┐
│  Phaser 3 scene (map, sprites, bubbles, movement)       │
│  React HUD (employee panel, task board, console)        │
│  Zustand store  ◀────── WebSocket events ──────┐        │
└──────────────┬──────────────────────────────────┼───────┘
               │ REST (CRUD, assign, approve)     │
┌──────────────▼──────────────────────────────────┴───────┐
│  API server (Node + Fastify, TypeScript)                 │
│   • employees / skills / tasks endpoints                 │
│   • WebSocket hub: fans run events out to clients        │
│   • writes jobs to the queue                             │
├──────────────────────────────────────────────────────────┤
│  Agent workers (same codebase, separate process)         │
│   • pull job → build agent options from employee+skills  │
│   • run Claude Agent SDK `query()` in a task workspace   │
│   • stream every message → RunEvent rows + Redis pub/sub │
│   • permission callback → "needs_input" → wait for user  │
└──────────────┬──────────────────────────┬────────────────┘
          Postgres (state)        Redis (BullMQ queue + pub/sub)
                                  Sandboxed workspaces (container / git worktree per task)
```

### Tech stack

- **Frontend:** Vite + TypeScript, **Phaser 3** for the game world (tilemaps from **Tiled**,
  arcade physics for collisions, sprite animations), **React** for HUD panels over the canvas,
  **Zustand** as the shared store between the two. Pixel fonts: Press Start 2P / VT323.
- **Art:** 16×16 tiles drawn at 3× scale with nearest‑neighbour. Start from a CC0 office
  tileset and a modular character sheet (hair / skin / shirt layers → per‑employee looks).
- **Backend:** Node 20 + Fastify, Zod schemas shared with the client, Drizzle ORM on Postgres,
  BullMQ on Redis for the job queue, `ws` for live events.
- **Agents:** the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`). Default model
  `claude-sonnet-5-5` for most employees, with an option per employee for `claude-opus-5-5`
  (senior / harder work) or `claude-haiku-5-5` (cheap, fast interns).

### Repo layout

```
apps/web        Phaser scene + React HUD
apps/server     Fastify API, WebSocket hub, agent worker
packages/shared Types, Zod schemas, event definitions
assets/         Tiled maps, tilesets, character sheets
mockup/         Static clickable mockup (this PR)
docs/           This plan
```

## 4. Data model

```
Employee  id, name, role, look{hair,skin,shirt,pants}, deskId, model, personaPrompt, createdAt
Skill     id, name, description, color, instructions (SKILL.md body),
          allowedTools[], mcpServers{}, requiresApproval[]   # e.g. ["Bash", "mcp__github__*"]
EmployeeSkill  employeeId, skillId
Task      id, title, details, skillId, assigneeId, status(queued|running|needs_input|done|failed|cancelled),
          priority, createdBy, createdAt, startedAt, finishedAt, resultSummary, costUsd
Run       id, taskId, sessionId, model, turns, inputTokens, outputTokens, costUsd, error
RunEvent  id, runId, seq, type(text|tool_use|tool_result|permission_request|permission_decision|result),
          payload jsonb, createdAt
Desk      id, x, y  (from the Tiled map)
```

## 5. How an employee becomes an agent

When a worker picks up a task it builds the agent from the employee and their skills:

| Office concept | Agent SDK option |
|---|---|
| Persona (name, role, tone) | `systemPrompt`: the persona plus office rules (stay in the workspace, write a summary at the end) |
| Skills | Each skill is written as `.claude/skills/<skill>/SKILL.md` into the task workspace and loaded by the SDK; the union of the skills' `allowedTools` becomes `allowedTools` |
| Skill integrations (GitHub, Slack, DB) | `mcpServers` merged from the employee's skills |
| Desk / computer | `cwd` = a fresh per‑task workspace (git worktree or container volume) |
| "Raise hand" | `canUseTool` callback: tools in a skill's `requiresApproval` pause the run and emit `permission_request` |
| Seniority | `model` (Haiku / Sonnet / Opus) and `maxTurns` |
| Stop button | `AbortController` passed to the run |

Sketch of the worker:

```ts
for await (const msg of query({
  prompt: renderTaskPrompt(task),          // title + details + acceptance criteria
  options: {
    model: employee.model,
    systemPrompt: renderPersona(employee),
    cwd: workspace.path,                   // contains .claude/skills/* for this employee
    allowedTools: unionTools(skills),
    mcpServers: mergeMcp(skills),
    maxTurns: 40,
    abortController,
    canUseTool: (tool, input) => askHuman(task, tool, input), // resolves on Approve/Deny
  },
})) {
  await recordEvent(run, msg);   // RunEvent row
  publish(task.id, toOfficeEvent(msg)); // → WebSocket → sprites + console
}
```

Check option names against the current Agent SDK docs while building M3. The mapping above is the
design; the exact field names may differ by SDK version.

### Event → animation mapping

| Agent event | In the office |
|---|---|
| Run started | Employee sits down, monitor LED turns blue, typing animation |
| Assistant text | Line in the agent console; "…" bubble animates |
| `tool_use` | Console line `→ Tool(args)`; small icon pops over the desk (📄 Read, ✏️ Edit, 🌐 Web, 💻 Bash) |
| `permission_request` | Yellow "!" bubble, toast, *Needs you* column on the board, optional browser notification |
| Progress | Bar over the head, estimated from turns used vs. `maxTurns` and the agent's own plan steps |
| `result` success | Green ✓ bubble, sticky note moves to *Done*, output linked in the panel |
| Error / max turns | Red ✗ bubble, task → *failed*, Retry button |
| Idle (no tasks) | Floating "z", later: wanders to the coffee machine |

## 6. API and live events

```
GET    /employees               POST /employees           PATCH /employees/:id
PUT    /employees/:id/skills    GET  /skills               POST /skills
GET    /tasks?status=…          POST /tasks {title, details, skillId, assigneeId|"auto"}
POST   /tasks/:id/cancel        POST /tasks/:id/retry
POST   /tasks/:id/permission    {requestId, decision: "allow"|"deny", note?}
WS     /live   → {type:"task.updated"|"run.event"|"employee.status", ...}
```

Auto‑assign picks employees who have the skill, then the one with the shortest queue.

## 7. Safety, cost and limits

- **Sandboxing:** every run gets its own workspace and no access to the host. Network access is
  limited to what the employee's skills declare.
- **Least privilege:** read‑only tools by default. Write, Bash and MCP tools come only from skills,
  and risky ones are listed in `requiresApproval`.
- **Secrets:** API keys and MCP credentials stay server side, scoped per skill, and never reach
  the browser or the agent's prompt.
- **Budgets:** `maxTurns` per task, a daily dollar cap per employee and for the whole office,
  shown as a "payroll" meter in the HUD. Cost is recorded per run.
- **Concurrency:** a worker pool limit (for example 3 agents at once); other tasks wait in *Queued*.
- **Audit:** every tool call and permission decision is stored as a `RunEvent`.

## 8. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | **Mockup** (this PR) | Clickable single‑file prototype of the world, panels and flows, agents simulated |
| M1 | Game world | Phaser + Tiled map, character sheets, movement and collisions, interaction prompts, mobile d‑pad |
| M2 | Office state | Postgres schema, employees/skills/tasks CRUD, React HUD wired to the API, task board |
| M3 | Real agents | BullMQ worker running the Agent SDK per task, skills written into workspaces, events stored and streamed |
| M4 | Human in the loop | Permission requests, approve/deny, cancel/retry, failure states, notifications |
| M5 | Polish | Sounds, idle behaviours, XP/levels, cost meter, onboarding tutorial (walk to the boss's desk) |
| M6 | Team play | Multi‑user office (presence over WS), hand‑offs between employees, meetings for multi‑agent tasks |

## 9. Open questions

1. **Where do outputs live?** A GitHub repo per office (PRs as output), plain files you download,
   or both?
2. **Who is the user?** A solo developer running this locally with their own API key, or a hosted
   multi‑tenant app? That decides auth, sandboxing (local worktrees vs. cloud containers) and billing.
3. **Persistent memory per employee?** Fresh context per task is simpler and safer; a running
   memory file per employee makes them feel more like colleagues.
4. **Skill format:** only built‑in skills at first, or let users upload their own `SKILL.md` from day one?
