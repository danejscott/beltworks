# Beltworks

A 3D, Satisfactory-style factory game (rendered with Three.js; all models are built in code, no downloaded assets). Mine, smelt, build belts, pipes, power grids, trains and drones, then climb 8 tiers of tech and launch Project Assembly.

## Play

**Play online:** https://danejscott.github.io/beltworks/ (works on any computer; phone controls coming later)

Or double-click **`Play Beltworks.html`**. It's a single self-contained file that runs offline in Chrome, Edge or Firefox (needs WebGL2). Progress auto-saves in your browser every 30 seconds. Use **☰ → Export save** to back up or move a save.

## Multiplayer (online servers)

On the title screen, **🌐 Play online** lets you create a server or join one with its 8-character code (like `K7QM-2XRP`). The code never changes.

**Inviting friends:** in an online world, click **📋 Invite** on the badge at the top (or in the ☰ menu or the Players panel). That copies the code, a link and step-by-step instructions to your clipboard. The link (`…/beltworks/?join=CODE`) opens the game with the code already filled in.

- **Competitive:** every player starts their own base far from the others, in a different biome, with starter resources nearby. Race to build the biggest empire; the **leaderboard** (press **Y**) scores tiers, milestones, everything your factory has made and what you've built.
- **Economy only:** nobody can remove or change another player's buildings, and you can't build right next to someone else's HUB. You *can* run a belt out of a rival's open output port and take what comes out.
- **Teams:** each team has a 👑 captain. The captain invites players from the Players panel, or shares the team's 6-letter **team code**: anyone who enters it asks to join and the captain approves. Captains can remove players or hand the role over. Teammates share inventory, research, power and colour; a player who was on their own brings their whole base along.
- **Trade Post:** one neutral market near the middle of every online map. Add it to a truck's route: the truck drops off what it carries (your team earns credits worth the items) and picks up the item you chose, paid in credits.
- **Ranking seasons:** every month is a new season. The Players panel ranks score gained this season and lists past winners.
- **Your colour** replaces the orange trim on your buildings and vehicles, and your name floats above your HUB.
- **No host needed:** anyone with the code can start or join the world at any time; the world runs in the players' browsers while anyone is online, and your factory pauses while you're away.
- **Enormous** maps (4608² of land, 4× Large) work for servers and single-player; they need a desktop computer with plenty of memory.
- Chat with **Enter**. Fast travel works between your own team's bases. A few one-time tips explain the online rules the first time they matter.

### How online works (and running the relay)

There is no game server. Every player's browser runs the world. A tiny **relay** on Cloudflare's free tier (`server/worker.ts`, one Durable Object per world) keeps each world's code, players, latest save and the actions since then. While anyone is connected it:
- puts everyone's actions in order and tags each with the tick it applies at;
- every 2 minutes, asks the longest-connected player's game for a compressed save;
- compares the players' world fingerprints every 5 seconds and reloads anyone who drifts (the majority wins; with two players, the one online longest).

A joiner downloads the latest save and replays the actions since it.

```bash
npm run deploy:relay   # wrangler deploy (needs `npx wrangler login` once)
npm run build:server   # bundles the same relay for Node: server/dist/relay-node.mjs
npm run server         # local relay on ws://localhost:8787 (used automatically when the game runs on localhost)
```

The public relay is `wss://beltworks-relay.beltworks.workers.dev`. You can change the address under **Play online → Server address**.

## Keys

These are the main keys; press **?** in the game for the rest.

| Key | Opens |
|---|---|
| H | Milestones |
| C | Craft |
| P | Stats |
| K | Shop |
| M | Map |
| T | Vehicles |
| N | Scanner |
| U | Research |
| J | Achievements |
| L | Planner |
| G (or Space) | Locate and fly to your HUB |
| O | Fast travel between HUB and Outposts |
| Y | Players and leaderboard (online) |
| Shift+Q | Copy settings tool |
| \ | Reset the camera angle |
| Enter | Chat (online) |
| PageUp / PageDown (or E / Z) | Change floor |

## Develop

```bash
npm install
npm run dev      # live-reloading dev server at http://localhost:5173
npm run build    # type-check + build dist/index.html (single file)
```

After building, copy `dist/index.html` over `Play Beltworks.html` to update the playable file.

## What's in it

- **Big regions and resource rings (new worlds):**
  - A forest, a desert and mountainous highlands lie in different directions from the HUB, each about 4× the old biome size.
  - Resources sit in rings that scale with the map: coal a little way out; oil, quartz, caterium and sulfur further; bauxite and uranium near the edges.
  - Deserts stay dry: no big lakes or sea next to them.
  - Water: bigger lakes and bays, about 14% of the map on Easy/Normal and about 18% on Hard (with much larger lakes).
  - Mountains cover up to 2× the old amount, with foothills around them and guaranteed passes, so they're an obstacle until trains can tunnel through.
- **Island worlds (new worlds):** the land is an irregular island with bays, peninsulas and islets, surrounded by ocean that ships can sail. The island has the same land area as the old square maps; the ocean doesn't count. Biome, desert and lake borders are organic, with no straight lines or sharp corners. Worlds created before this keep their original terrain.
- **Every new world is randomized:** HUB position, amount of water and mountains, biome mix, lake placement and landmass shape.
- **Four world sizes** (512², 1024², 2304², and Enormous 4608² of land; Enormous needs a desktop PC with plenty of memory and takes about a minute to generate), multiple named saves and a title screen.
- **Difficulties with target play times:** Easy (~10–15 h), Normal (~15–30 h), Hard (~30–50 h) and Creative. Later milestones and Space Elevator phases scale with difficulty; Tier 0 is the same for everyone.
- **Biomes** (plains, forest, desert, highlands), each with its own resources. Nodes come in impure, normal and pure. Trees regrow.
- **77 items, 80 recipes (17 of them alternates), 60 buildings.** Covers smelting, construction, assembly, foundries, oil refining with byproducts, and manufacturing.
- **Machine ports:** one blue input arrow and one orange output arrow per machine. Mergers combine ingredient belts.
- **Day/night cycle** (12-minute days, can be switched off). **Solar Panels** only produce power in daylight.
- **Power grids:** poles auto-wire (a reach preview is shown while placing), five generator types, and batteries.
- **Fluids:** extractors, pipes, tunnels and tanks.
- **Logistics:** 4 belt tiers, tunnels, splitters, mergers, Smart Splitters, storage.
- **Outposts:** second bases for far-away regions, with 10 MW of free power. In Easy, Normal and Creative you can fast-travel between the HUB and Outposts (O).
- **Advanced machines:** Packager (fluids in canisters), Blender (Cooling Systems, Turbofuel) and Particle Accelerator (Quantum Cores for the final launch). Plus Sulfur, Compacted Coal, Heat Sinks and Turbo Motors.
- **Inventory screen (I):** grouped by category, searchable, with production rates and what your goals still need.
- **Nuclear power:** uranium (rare, glowing, near the map edges) goes to encased cells, then fuel rods, then a 2500 MW Nuclear Power Plant. Its waste has to be stored.
- **Ships:** Ship Ports on lake and sea shores, plus the industrial **Harbor** (a concrete pier with a gantry crane and several berths). Cargo ships (2400 items) sail lakes and the open ocean around the island.
- **Energy resources run out (new worlds):** coal, oil and uranium nodes hold a reserve (impure half, pure double). In Easy, spent nodes refill after an hour. Every lake and sea also has an offshore oil well, always shown on the map.
- **Train signals:** Block and Path Signals let many trains share hand-built networks safely.
- **Production graphs:** the last hour of every item and of power, in Stats (P).
- **Soundscapes & music:** wind, water, birds and crickets depending on where you look, and a generated soundtrack that changes each tier. Separate volume sliders in the menu.
- **Run recap:** play time, items made, track laid, a timelapse of your factory growing, and personal bests per difficulty and map size (menu → Run recap; opens automatically when you win).
- **Trucks:** Truck Stations plus trucks that path over open ground. Stations have several bays; extra trucks queue nearby. Busy routes wear dirt tracks into the ground.
- **Floors (unlocked with Logistics Mk2):** build on up to 3 floors above the ground using Foundations. Conveyor Lifts and Pipe Lifts link the floors. Change floor with PageUp/PageDown; floors above the active one fade out.
- **Mountains:** taller, with snow caps. Railways (and Quick Route) tunnel straight through them; trucks drive around.
- **Trains:** Quick Route lays a one-way loop between two stations. Run up to 12 trains per loop. Manual rails and schedules still work. Corners are drawn as smooth curves, track over water gets concrete bridges, and trains can be 12–30 cars long depending on map size.
- **Drones:** point-to-point delivery across the map.
- **Exploration:**
  - Nodes are revealed as you look around.
  - The Scanner (N) pings resources, 💎 power crystals (free Power Shards) and 🛸 crash sites.
  - Crash sites hold Hard Drives, which you research (U) to choose alternate recipes.
- **Production Planner** (L, Easy/Creative only) and **25 achievements** (J).
- **Blueprints** (share one with a short **BP-** code; friends import it from the Blueprints panel), **overclocking**, **Output Amplifiers** and the coupon **shop**.
- **Copy settings** (Shift+Q): pick a machine, then click others of the same kind to give them its recipe, clock speed and filters. **Upgrade in place:** place a Miner Mk2/Mk3, Power Pole Mk2 or Pipe Mk2 over the lower tier to swap it, keeping its settings.
- **Progression:** 8 tiers, 20 milestones and 4 Space Elevator phases.

## Code map (`src/`)

| File | What it does |
|---|---|
| `data.ts` | Items, recipes, buildings, milestones, shop. **Balance lives here.** |
| `terrain.ts` | World generation |
| `world.ts` | Entities, placement rules, inventory |
| `sim.ts` | Belts, machines, power grids, fluid networks |
| `trains.ts`, `trucks.ts`, `drones.ts` | Transport (Quick Route loops, truck pathing) |
| `daynight.ts` | Day/night cycle and solar output |
| `ships.ts` | Ship Ports and cargo ships (pathing over water) |
| `audio.ts` | Sound effects, biome ambience and generated music |
| `difficulty.ts` | Difficulty settings: starting kit, resource richness, game-length scaling |
| `features.ts`, `explore.ts` | Crash sites, power crystals, discovery, scanner, hard-drive research |
| `achievements.ts`, `planner.ts` | Achievements; production planner maths |
| `progress.ts` | Milestones, Space Elevator, points & shop |
| `r3/` | 3D renderer: `core.ts` (camera, lights), `terrain3d.ts` (hills, water), `models.ts` (every machine model), `world3d.ts` (scene sync, animation, picking), `bb.ts` (particles/icons) |
| `atlas.ts` | 2D sprites for UI icons and particles |
| `input.ts` | Mouse/keyboard, build tools, blueprints |
| `ui.ts`, `ui2.ts` | HUD, inspector, menus, map; vehicles/scanner/research/planner/achievement screens |
| `save.ts` | Save/load (IndexedDB), export/import, world fingerprint |
| `cmd.ts` | Every player action as a command (applied at once offline, via the server online) |
| `teams.ts` | Team states for online worlds (per-team inventory, research, stats), deterministic randomness |
| `online.ts` | Join codes, spawning new players, team merging, leaderboard score, base buffer zones |
| `net.ts`, `ui3.ts` | Online client (lockstep ticks, save uploads, catch-up, resyncs) and its HUD: code badge, players, chat |
| `codes.ts` | Join codes (shared with the relay) |
| `../server/` | The relay: `relay.ts` (logic), `worker.ts` (Cloudflare Durable Object), `relay-node.ts` (Node) |
