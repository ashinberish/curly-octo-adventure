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

Agent runs are still **simulated** (milestone M3 swaps in the Claude Agent SDK), but they run
on the server: tasks keep going while nobody has the page open.

## Layout

```
apps/web          The game: Phaser 3 world + React panels + Zustand store
  src/art         Pixel art drawn in code (characters, tiles, furniture)
  src/game        Phaser scene, NPC behaviour, pathfinding, Tiled map parsing
  src/state       Store (polls the API) and the API client
  src/ui          React panels (employee, task board, crew cards)
  public/maps     office.json, a Tiled map
  public/assets   Generated tileset and furniture atlas
apps/server       Office API: router, Postgres queries, the simulated agent runner
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

`npm run smoke -w @pixel-office/web` (after a build) drives the built app in Chromium, using a
Playwright that is already installed on the machine: it walks around, assigns a task, approves
a permission request and fails on any page error. Screenshots land in `apps/web/e2e-output/`.

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
