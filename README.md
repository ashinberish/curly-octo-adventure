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

Controls: `WASD` / arrow keys to walk, `E` (or Space) to talk to whoever you're next to, or
click them or their card. The "!" notice board in Engineering opens the task board. On touch
screens an on‑screen d‑pad appears.

Agent runs are still **simulated** (milestone M3 swaps in the Claude Agent SDK).

## Layout

```
apps/web          The game: Phaser 3 world + React panels + Zustand store
  src/art         Pixel art drawn in code (characters, tiles, furniture)
  src/game        Phaser scene, NPC behaviour, pathfinding, Tiled map parsing
  src/state       Store and the simulated agent runner
  src/ui          React panels (employee, task board, crew cards)
  public/maps     office.json, a Tiled map
  public/assets   Generated tileset and furniture atlas
packages/shared   Types and the skill catalog, shared with the future server
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

`vercel.json` at the repo root tells Vercel to install from the root, run the workspace build
and serve `apps/web/dist`. Import the repo with Root Directory `./`; the framework preset
doesn't matter because `vercel.json` sets the commands and the output folder.
