# Beltworks

A 3D, Satisfactory-style factory game (rendered with Three.js; all models are built in code, no downloaded assets). Mine, smelt, build belts, pipes, power grids, trains and drones, then climb 8 tiers of tech and launch Project Assembly.

## Play

**Play online:** https://danejscott.github.io/beltworks/ (works on any computer; phone controls coming later)

Or double-click **`Play Beltworks.html`**. It's a single self-contained file that runs offline in Chrome, Edge or Firefox (needs WebGL2). Progress auto-saves in your browser every 30 seconds. Use **☰ → Export save** to back up or move a save.

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
- **Three world sizes** (512², 1024², 2304² of land), multiple named saves and a title screen.
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
- **Ships:** Ship Ports on lake and sea shores. Cargo ships (2400 items) sail between the ports you choose.
- **Train signals:** Block and Path Signals let many trains share hand-built networks safely.
- **Production graphs:** the last hour of every item and of power, in Stats (P).
- **Soundscapes & music:** wind, water, birds and crickets depending on where you look, and a generated soundtrack that changes each tier. Separate volume sliders in the menu.
- **Run recap:** play time, items made, track laid, a timelapse of your factory growing, and personal bests per difficulty and map size (menu → Run recap; opens automatically when you win).
- **Trucks:** Truck Stations plus trucks that path over open ground.
- **Floors (unlocked with Logistics Mk2):** build on up to 3 floors above the ground using Foundations. Conveyor Lifts and Pipe Lifts link the floors. Change floor with PageUp/PageDown; floors above the active one fade out.
- **Mountains:** taller, with snow caps. Railways (and Quick Route) tunnel straight through them; trucks drive around.
- **Trains:** Quick Route lays a one-way loop between two stations. Run up to 12 trains per loop. Manual rails and schedules still work.
- **Drones:** point-to-point delivery across the map.
- **Exploration:**
  - Nodes are revealed as you look around.
  - The Scanner (N) pings resources, 💎 power crystals (free Power Shards) and 🛸 crash sites.
  - Crash sites hold Hard Drives, which you research (U) to choose alternate recipes.
- **Production Planner** (L, Easy/Creative only) and **25 achievements** (J).
- **Blueprints**, **overclocking**, **Output Amplifiers** and the coupon **shop**.
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
| `save.ts` | Save/load (IndexedDB), export/import |
