# Pixel Office

An 8‑bit office you walk around in, where every employee is a Claude agent. Give employees
skills, assign them tasks, and watch them work.

- **Plan:** [docs/PLAN.md](docs/PLAN.md)
- **Original mockup:** [mockup/index.html](mockup/index.html), a single file you can open directly.

## Running it

Needs Node 22 (22.18 or newer).

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run dev` serves the game and the office API together. Data is kept in an embedded
Postgres (PGlite) under `.data/pglite`; delete that folder to start over. Set `DATABASE_URL`
to use a real Neon database instead.

Controls: `WASD` / arrow keys to walk, `E` (or Space) to talk to whoever you're next to, or
click them or their card. The "!" notice board in Engineering opens the task board. On touch
screens an on‑screen d‑pad appears.

Without an Anthropic API key, agent runs are **simulated** (canned steps). With one, each
employee is a real Claude agent: see [Claude agents](#claude-agents). For a free local preview
of the agent screens, `AGENT_FAKE=1 npm run dev` uses a scripted stand-in model.

## Layout

```
apps/web          The game: Phaser 3 world + React panels + Zustand store
  src/art         Pixel art drawn in code (characters, tiles, furniture)
  src/game        Phaser scene, NPC behaviour, pathfinding, Tiled map parsing
  src/state       Store (polls the API) and the API client
  src/ui          React panels (employee, task board, crew cards)
  public/maps     office.json, a Tiled map
  public/assets   Generated tileset and furniture atlas
apps/server       Office API: router, Postgres queries, simulated runs
  src/agent       Claude agents: turn loop, tools, prompts, pricing
packages/shared   Types, skill catalog and status rules used by both sides
scripts/          Packaging for Vercel
mockup/           The original single-file mockup
```

## Editing the office

The office is a [Tiled](https://www.mapeditor.org/) map at `apps/web/public/maps/office.json`
that uses `public/assets/tiles.png` as its tileset. Tile layers: `floor`, `rugs`,
`wallShadows`, `walls`. Object layers: `objects` (desks, furniture, the player spawn, places
NPCs wander to, interactable spots) and `rooms`. The game derives collisions and paths from
the map, so moving things around in Tiled just works.

The map and art are generated from code by `npm run assets`, using
`apps/web/src/game/map/layout.ts` and `apps/web/src/art/`. If you edit the map in Tiled, stop
regenerating it (or port your change to `layout.ts`); a test fails when the committed files
and the generator disagree, so you'll notice.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

After a build, two browser tests drive the app in Chromium (using a Playwright already
installed on the machine) and fail on any page error; screenshots land in `apps/web/e2e-output/`:

- `npm run smoke -w @pixel-office/web`: walking, hiring and firing, assigning, cancelling, approving.
- `npm run smoke:agents -w @pixel-office/web`: the Claude agent screens (question, answer, files,
  summary) against the stand-in model.

`ANTHROPIC_API_KEY=… npm run agent:check` makes one real, cheap agent run to check your key,
model and the request shape (a few cents).

## Deploying

Vercel serves the site and the API (one serverless function) from this repo; `vercel.json`
runs `npm run build:vercel`, which writes Vercel's Build Output folder. Import the repo with
Root Directory `./`.

1. **Add a database.** In the Vercel project: Storage → Create Database → Neon, and connect
   it to the project. That sets `DATABASE_URL`. The first request creates the tables and the
   demo team.
2. **Lock it (recommended).** Add an environment variable `OFFICE_TOKEN` with a long random
   value. Anyone can still look, but changes need the token; the site asks for it once and
   remembers it in the browser.
3. Redeploy so the function picks up the variables.

Without a database the site loads but shows “The office has no database yet”.

## Claude agents

Set these in Vercel (Settings → Environment Variables), then redeploy:

| Variable | |
|---|---|
| `ANTHROPIC_API_KEY` | Required. Without it, runs are simulated. |
| `OFFICE_TOKEN` | Required on Vercel too: agents stay simulated without it, so strangers can't spend your credits. (`AGENTS_ALLOW_PUBLIC=1` overrides this; don't.) |
| `AGENT_DAILY_BUDGET_USD` | Default `5`. Agents pause for the day when the estimated spend reaches it. |
| `AGENT_MODEL` | Default `claude-opus-5-5`. |
| `AGENT_EFFORT` | Default `medium` (`low` … `max`): how hard the model thinks per turn, and so its cost. |
| `AGENT_MAX_TURNS` | Default `40`. A task that hasn't finished after this many model calls fails. |

How it works:

- When a task starts, the employee's agent gets a system prompt from their name, role and
  skills, and the task as its first message. Skills decide the tools: **Research** gets web
  search and web fetch; **Code, Data, QA, DevOps** get Anthropic's code-execution sandbox;
  everyone gets a task **workspace** (`write_file`, `read_file`, `list_files`) and **ask_human**.
- Deliverables are files in the workspace; open them under **Files** in the employee panel
  (HTML previews with scripts off) or download them.
- When an agent calls ask_human the task waits for you: answer in the panel (or Yes / No).
- Turns run while the office is open in a browser that has the token: the page asks the server
  to play turns for up to two minutes at a time. Close every tab and work pauses until
  someone opens it again. (Simulated runs keep going regardless.)
- Each turn's conversation is saved in Postgres, so nothing is lost between serverless calls.
  Turns that keep failing (3 in a row) or run past `AGENT_MAX_TURNS` fail the task; Claude's
  refusals fail it too, after Anthropic's server-side fallback model has had a go.
- Costs shown are estimates from token usage; the Anthropic Console has the real numbers.
- The Vercel function is set to run for up to 300 s, which needs Fluid compute (on by default
  for new projects).

Not yet: access to your GitHub repos or other services, and agents that keep working with
no browser open.
