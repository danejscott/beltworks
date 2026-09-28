// ============================================================================
// Game data: items, recipes, buildings, progression, shop.
// All rates are "game" rates (roughly 2x Satisfactory's pace).
// ============================================================================

export type Cost = Record<string, number>;

export interface ItemDef { n: string; c: string; s: string; fluid?: boolean; val?: number }

export const ITEMS: Record<string, ItemDef> = {
  // raw
  iron_ore: { n: 'Iron Ore', c: '#b0705a', s: 'ore' },
  copper_ore: { n: 'Copper Ore', c: '#e08a48', s: 'ore' },
  limestone: { n: 'Limestone', c: '#dcd5c0', s: 'ore' },
  coal: { n: 'Coal', c: '#3d3d45', s: 'ore' },
  caterium_ore: { n: 'Caterium Ore', c: '#e8c547', s: 'ore' },
  raw_quartz: { n: 'Raw Quartz', c: '#f07ab8', s: 'crystal' },
  bauxite: { n: 'Bauxite', c: '#c9583e', s: 'ore' },
  sulfur: { n: 'Sulfur', c: '#e2cf3a', s: 'ore' },
  wood: { n: 'Wood', c: '#9a6b3f', s: 'log' },
  // fluids
  water: { n: 'Water', c: '#3f8fe0', s: 'drop', fluid: true },
  crude_oil: { n: 'Crude Oil', c: '#3a2f48', s: 'drop', fluid: true },
  heavy_oil: { n: 'Heavy Oil Residue', c: '#9a4db5', s: 'drop', fluid: true },
  fuel: { n: 'Fuel', c: '#e8962e', s: 'drop', fluid: true },
  alumina_solution: { n: 'Alumina Solution', c: '#c8d8e4', s: 'drop', fluid: true },
  turbofuel: { n: 'Turbofuel', c: '#d0402e', s: 'drop', fluid: true },
  // ingots
  iron_ingot: { n: 'Iron Ingot', c: '#bcc3cc', s: 'ingot' },
  copper_ingot: { n: 'Copper Ingot', c: '#e8905a', s: 'ingot' },
  caterium_ingot: { n: 'Caterium Ingot', c: '#f0cf50', s: 'ingot' },
  steel_ingot: { n: 'Steel Ingot', c: '#71839a', s: 'ingot' },
  aluminum_ingot: { n: 'Aluminum Ingot', c: '#e2e7ec', s: 'ingot' },
  // basic parts
  iron_plate: { n: 'Iron Plate', c: '#9aa8b5', s: 'plate' },
  iron_rod: { n: 'Iron Rod', c: '#8e9aa8', s: 'rod' },
  screw: { n: 'Screw', c: '#d9dee4', s: 'screw' },
  wire: { n: 'Wire', c: '#f0a854', s: 'coil' },
  cable: { n: 'Cable', c: '#4d535c', s: 'cable' },
  concrete: { n: 'Concrete', c: '#c7c3b6', s: 'block' },
  copper_sheet: { n: 'Copper Sheet', c: '#d98450', s: 'plate' },
  biomass: { n: 'Biomass', c: '#6fa84a', s: 'bio' },
  steel_beam: { n: 'Steel Beam', c: '#687686', s: 'beam' },
  steel_pipe: { n: 'Steel Pipe', c: '#8fa0ad', s: 'pipe' },
  quickwire: { n: 'Quickwire', c: '#f2cf55', s: 'coil' },
  quartz_crystal: { n: 'Quartz Crystal', c: '#f59ac8', s: 'crystal' },
  silica: { n: 'Silica', c: '#ece6f2', s: 'powder' },
  alu_casing: { n: 'Aluminum Casing', c: '#c3ccd4', s: 'casing' },
  plastic: { n: 'Plastic', c: '#4fb0e8', s: 'sheet' },
  rubber: { n: 'Rubber', c: '#34343a', s: 'sheet' },
  polymer_resin: { n: 'Polymer Resin', c: '#9fd65a', s: 'pellet' },
  aluminum_scrap: { n: 'Aluminum Scrap', c: '#aab6c0', s: 'scrap' },
  // assembled
  reinforced_plate: { n: 'Reinforced Plate', c: '#8394a8', s: 'rplate' },
  rotor: { n: 'Rotor', c: '#b8c4d1', s: 'rotor' },
  modular_frame: { n: 'Modular Frame', c: '#6590bb', s: 'frame' },
  smart_plating: { n: 'Smart Plating', c: '#4f9be0', s: 'smart' },
  encased_beam: { n: 'Encased Beam', c: '#aea696', s: 'ebeam' },
  versatile_framework: { n: 'Versatile Framework', c: '#3d96d6', s: 'vframe' },
  stator: { n: 'Stator', c: '#c96d40', s: 'stator' },
  motor: { n: 'Motor', c: '#e4b33e', s: 'motor' },
  automated_wiring: { n: 'Automated Wiring', c: '#5cc07a', s: 'awire' },
  circuit_board: { n: 'Circuit Board', c: '#3fae5a', s: 'board' },
  ai_limiter: { n: 'AI Limiter', c: '#6bd0c0', s: 'chip' },
  alclad_sheet: { n: 'Alclad Sheet', c: '#b9c7d6', s: 'plate' },
  // manufactured
  heavy_modular_frame: { n: 'Heavy Modular Frame', c: '#3f6b96', s: 'hframe' },
  computer: { n: 'Computer', c: '#3a4a5c', s: 'computer' },
  modular_engine: { n: 'Modular Engine', c: '#d0763a', s: 'engine' },
  adaptive_control_unit: { n: 'Adaptive Control Unit', c: '#3b6ea8', s: 'acu' },
  crystal_oscillator: { n: 'Crystal Oscillator', c: '#e070b0', s: 'osc' },
  high_speed_connector: { n: 'High-Speed Connector', c: '#e6c24a', s: 'hsc' },
  supercomputer: { n: 'Supercomputer', c: '#26384a', s: 'super' },
  radio_control_unit: { n: 'Radio Control Unit', c: '#c7ccd8', s: 'radio' },
  assembly_director: { n: 'Assembly Director', c: '#8a6ad8', s: 'director' },
  // special
  power_shard: { n: 'Power Shard', c: '#6fd0ff', s: 'shard' },
  amplifier: { n: 'Output Amplifier', c: '#c070ff', s: 'amp' },
  hard_drive: { n: 'Hard Drive', c: '#5a7a9a', s: 'chip' },
  // late-game parts
  compacted_coal: { n: 'Compacted Coal', c: '#2e2a26', s: 'block' },
  empty_canister: { n: 'Empty Canister', c: '#8a96a4', s: 'casing' },
  packaged_water: { n: 'Packaged Water', c: '#3f8fe0', s: 'casing' },
  packaged_fuel: { n: 'Packaged Fuel', c: '#e8962e', s: 'casing' },
  packaged_oil: { n: 'Packaged Oil', c: '#3a2f48', s: 'casing' },
  heat_sink: { n: 'Heat Sink', c: '#b8c8d8', s: 'hsc' },
  cooling_system: { n: 'Cooling System', c: '#5ab4d8', s: 'engine' },
  turbo_motor: { n: 'Turbo Motor', c: '#d85a3a', s: 'motor' },
  quantum_core: { n: 'Quantum Core', c: '#9a6af0', s: 'acu' },
};
export const ITEM_KEYS = Object.keys(ITEMS);
export const isFluid = (k: string) => !!ITEMS[k]?.fluid;

// ---------------------------------------------------------------------------
export interface Recipe { id: string; n: string; m: string; t: number; in: Cost; out: Cost; alt?: boolean }
export const RECIPES: Record<string, Recipe> = Object.create(null);
function R(id: string, m: string, t: number, inp: Cost, out: Cost, n?: string) {
  RECIPES[id] = { id, m, t, in: inp, out, n: n || ITEMS[Object.keys(out)[0]].n };
}
// Smelter
R('iron_ingot', 'smelter', 1, { iron_ore: 1 }, { iron_ingot: 1 });
R('copper_ingot', 'smelter', 1, { copper_ore: 1 }, { copper_ingot: 1 });
R('caterium_ingot', 'smelter', 2, { caterium_ore: 3 }, { caterium_ingot: 1 });
// Foundry
R('steel_ingot', 'foundry', 2, { iron_ore: 3, coal: 3 }, { steel_ingot: 3 });
R('aluminum_ingot', 'foundry', 2, { aluminum_scrap: 6, silica: 5 }, { aluminum_ingot: 4 });
// Constructor
R('iron_plate', 'constructor', 3, { iron_ingot: 3 }, { iron_plate: 2 });
R('iron_rod', 'constructor', 2, { iron_ingot: 1 }, { iron_rod: 1 });
R('screw', 'constructor', 3, { iron_rod: 1 }, { screw: 4 });
R('wire', 'constructor', 2, { copper_ingot: 1 }, { wire: 2 });
R('cable', 'constructor', 1, { wire: 2 }, { cable: 1 });
R('concrete', 'constructor', 2, { limestone: 3 }, { concrete: 1 });
R('copper_sheet', 'constructor', 3, { copper_ingot: 2 }, { copper_sheet: 1 });
R('biomass', 'constructor', 2, { wood: 1 }, { biomass: 5 });
R('steel_beam', 'constructor', 2, { steel_ingot: 4 }, { steel_beam: 1 });
R('steel_pipe', 'constructor', 3, { steel_ingot: 3 }, { steel_pipe: 2 });
R('quickwire', 'constructor', 2.5, { caterium_ingot: 1 }, { quickwire: 5 });
R('quartz_crystal', 'constructor', 4, { raw_quartz: 5 }, { quartz_crystal: 3 });
R('silica', 'constructor', 4, { raw_quartz: 3 }, { silica: 5 });
R('alu_casing', 'constructor', 1, { aluminum_ingot: 3 }, { alu_casing: 2 });
// Assembler
R('reinforced_plate', 'assembler', 6, { iron_plate: 6, screw: 12 }, { reinforced_plate: 1 });
R('rotor', 'assembler', 7.5, { iron_rod: 5, screw: 25 }, { rotor: 1 });
R('modular_frame', 'assembler', 20, { reinforced_plate: 3, iron_rod: 12 }, { modular_frame: 2 });
R('smart_plating', 'assembler', 15, { reinforced_plate: 1, rotor: 1 }, { smart_plating: 1 });
R('encased_beam', 'assembler', 5, { steel_beam: 3, concrete: 6 }, { encased_beam: 1 });
R('versatile_framework', 'assembler', 12, { modular_frame: 1, steel_beam: 12 }, { versatile_framework: 2 });
R('stator', 'assembler', 6, { steel_pipe: 3, wire: 8 }, { stator: 1 });
R('motor', 'assembler', 6, { rotor: 2, stator: 2 }, { motor: 1 });
R('automated_wiring', 'assembler', 12, { stator: 1, cable: 20 }, { automated_wiring: 1 });
R('circuit_board', 'assembler', 4, { copper_sheet: 2, plastic: 4 }, { circuit_board: 1 });
R('ai_limiter', 'assembler', 6, { copper_sheet: 5, quickwire: 20 }, { ai_limiter: 1 });
R('alclad_sheet', 'assembler', 3, { aluminum_ingot: 3, copper_ingot: 1 }, { alclad_sheet: 3 });
R('assembly_director', 'assembler', 40, { adaptive_control_unit: 2, supercomputer: 1 }, { assembly_director: 1 });
// Refinery (1 item/fluid in + 1 fluid in -> item and/or fluid out)
R('plastic', 'refinery', 3, { crude_oil: 3 }, { plastic: 2, heavy_oil: 1 });
R('rubber', 'refinery', 3, { crude_oil: 3 }, { rubber: 2, heavy_oil: 2 });
R('fuel', 'refinery', 3, { crude_oil: 6 }, { fuel: 4, polymer_resin: 3 });
R('residual_fuel', 'refinery', 3, { heavy_oil: 6 }, { fuel: 4 }, 'Residual Fuel');
R('residual_plastic', 'refinery', 3, { polymer_resin: 6, water: 2 }, { plastic: 2 }, 'Residual Plastic');
R('residual_rubber', 'refinery', 3, { polymer_resin: 4, water: 4 }, { rubber: 2 }, 'Residual Rubber');
R('alumina_solution', 'refinery', 3, { bauxite: 12, water: 18 }, { alumina_solution: 12, silica: 5 });
R('aluminum_scrap', 'refinery', 0.5, { alumina_solution: 4, coal: 2 }, { aluminum_scrap: 6, water: 2 });
// Manufacturer
R('heavy_modular_frame', 'manufacturer', 15, { modular_frame: 5, steel_pipe: 20, encased_beam: 5, screw: 120 }, { heavy_modular_frame: 1 });
R('computer', 'manufacturer', 12, { circuit_board: 10, cable: 9, plastic: 18, screw: 52 }, { computer: 1 });
R('modular_engine', 'manufacturer', 30, { motor: 2, rubber: 15, smart_plating: 2 }, { modular_engine: 1 });
R('adaptive_control_unit', 'manufacturer', 60, { automated_wiring: 15, circuit_board: 10, heavy_modular_frame: 2, computer: 2 }, { adaptive_control_unit: 2 });
R('crystal_oscillator', 'manufacturer', 60, { quartz_crystal: 36, cable: 28, reinforced_plate: 5 }, { crystal_oscillator: 2 });
R('high_speed_connector', 'manufacturer', 8, { quickwire: 56, cable: 10, circuit_board: 1 }, { high_speed_connector: 1 });
R('supercomputer', 'manufacturer', 16, { computer: 2, ai_limiter: 2, high_speed_connector: 3, plastic: 28 }, { supercomputer: 1 });
R('radio_control_unit', 'manufacturer', 24, { alu_casing: 32, crystal_oscillator: 1, computer: 1 }, { radio_control_unit: 2 });
// Late game: sulfur, packaging, blending and particle physics
R('compacted_coal', 'assembler', 12, { coal: 5, sulfur: 5 }, { compacted_coal: 5 });
R('empty_canister', 'constructor', 4, { plastic: 2 }, { empty_canister: 4 });
R('packaged_water', 'packager', 2, { water: 2, empty_canister: 2 }, { packaged_water: 2 });
R('packaged_fuel', 'packager', 3, { fuel: 2, empty_canister: 2 }, { packaged_fuel: 2 });
R('packaged_oil', 'packager', 4, { crude_oil: 2, empty_canister: 2 }, { packaged_oil: 2 });
R('unpack_fuel', 'packager', 2, { packaged_fuel: 2 }, { fuel: 2, empty_canister: 2 }, 'Unpack Fuel');
R('heat_sink', 'assembler', 8, { alclad_sheet: 5, copper_sheet: 3 }, { heat_sink: 1 });
R('cooling_system', 'blender', 10, { heat_sink: 2, rubber: 2, water: 5 }, { cooling_system: 1 });
R('turbofuel', 'blender', 8, { fuel: 6, compacted_coal: 4 }, { turbofuel: 5 });
R('turbo_motor', 'manufacturer', 32, { cooling_system: 4, radio_control_unit: 2, motor: 4, rubber: 24 }, { turbo_motor: 1 });
R('quantum_core', 'particle', 60, { cooling_system: 2, crystal_oscillator: 1, alclad_sheet: 10 }, { quantum_core: 1 });

// Alternate recipes: found by analysing Hard Drives from crash sites (Research, U)
function A(id: string, m: string, t: number, inp: Cost, out: Cost, n: string) { R(id, m, t, inp, out, n); RECIPES[id].alt = true; }
A('alt_iron_wire', 'constructor', 4, { iron_ingot: 5 }, { wire: 9 }, 'Iron Wire');
A('alt_cast_screw', 'constructor', 6, { iron_ingot: 5 }, { screw: 20 }, 'Cast Screw');
A('alt_steel_rod', 'constructor', 5, { steel_ingot: 1 }, { iron_rod: 4 }, 'Steel Rod');
A('alt_caterium_wire', 'constructor', 4, { caterium_ingot: 1 }, { wire: 8 }, 'Caterium Wire');
A('alt_stitched_plate', 'assembler', 16, { iron_plate: 10, wire: 20 }, { reinforced_plate: 3 }, 'Stitched Iron Plate');
A('alt_copper_rotor', 'assembler', 16, { copper_sheet: 6, screw: 52 }, { rotor: 3 }, 'Copper Rotor');
A('alt_bolted_frame', 'assembler', 24, { reinforced_plate: 3, screw: 56 }, { modular_frame: 2 }, 'Bolted Frame');
A('alt_steeled_frame', 'assembler', 60, { reinforced_plate: 2, steel_pipe: 10 }, { modular_frame: 3 }, 'Steeled Frame');
A('alt_fused_wire', 'assembler', 20, { copper_ingot: 4, caterium_ingot: 1 }, { wire: 30 }, 'Fused Wire');
A('alt_encased_pipe', 'assembler', 15, { steel_pipe: 7, concrete: 5 }, { encased_beam: 1 }, 'Encased Industrial Pipe');
A('alt_solid_steel', 'foundry', 3, { iron_ingot: 2, coal: 2 }, { steel_ingot: 3 }, 'Solid Steel Ingot');
A('alt_iron_alloy', 'foundry', 6, { iron_ore: 2, copper_ore: 2 }, { iron_ingot: 5 }, 'Iron Alloy Ingot');
A('alt_coated_cable', 'refinery', 8, { wire: 5, heavy_oil: 2 }, { cable: 9 }, 'Coated Cable');
A('alt_pure_iron', 'refinery', 12, { iron_ore: 7, water: 4 }, { iron_ingot: 13 }, 'Pure Iron Ingot');
A('alt_pure_copper', 'refinery', 24, { copper_ore: 6, water: 4 }, { copper_ingot: 15 }, 'Pure Copper Ingot');
A('alt_wet_concrete', 'refinery', 3, { limestone: 6, water: 5 }, { concrete: 4 }, 'Wet Concrete');
A('alt_plastic_smart', 'manufacturer', 24, { reinforced_plate: 1, rotor: 1, plastic: 3 }, { smart_plating: 2 }, 'Plastic Smart Plating');
export const ALT_IDS = Object.keys(RECIPES).filter(k => RECIPES[k].alt);

export const HANDCRAFT = new Set(['smelter', 'constructor', 'assembler']);
export const MACHINE_NAMES: Record<string, string> = { smelter: 'Smelter', constructor: 'Constructor', assembler: 'Assembler', foundry: 'Foundry', refinery: 'Refinery', manufacturer: 'Manufacturer', packager: 'Packager', blender: 'Blender', particle: 'Particle Accelerator' };

// ---------------------------------------------------------------------------
export interface BDef {
  n: string; w: number; h: number; cat: string; cost: Cost; col: string; desc: string; kind: string;
  power?: number;        // MW used when running
  speed?: number;        // belts: tiles per second
  tier?: number;
  rate?: number;         // miners/extractors: items (or units) per minute on a normal node
  machine?: string;      // machine kind for recipes
  on?: string;           // placement requirement: 'node' | 'oil' | 'geyser' | 'water'
  area?: number;         // power pole supply radius (tiles beyond footprint)
  reach?: number;        // power pole wire reach
  mw?: number;           // generator output
  fuels?: Record<string, number>; // seconds of full-power burn per unit
  water?: number;        // generator water per minute at full power
  cap?: number;          // storage / tank / battery capacity
  pipeRate?: number;     // pipes: units per minute
  range?: number;        // tunnels
  noRotate?: boolean;
  logistic?: boolean;    // may be placed on water
  solar?: boolean;       // generator output follows the sun
  dz?: number;           // lifts: which way they go between floors (+1 up, -1 down)
  hidden?: boolean;
}

export const BLD: Record<string, BDef> = {
  // --- Production
  miner1: { n: 'Miner Mk1', w: 2, h: 2, cat: 'prod', kind: 'miner', on: 'node', rate: 120, power: 5, cost: { iron_plate: 10, iron_rod: 10 }, col: '#c77d3a', desc: 'Place on an ore node. Output comes out of the orange arrow. Impure 60 · Normal 120 · Pure 240 /min.' },
  miner2: { n: 'Miner Mk2', w: 2, h: 2, cat: 'prod', kind: 'miner', on: 'node', rate: 240, power: 12, cost: { modular_frame: 5, encased_beam: 10, steel_pipe: 10 }, col: '#e0602f', desc: 'Twice as fast as Mk1 (240/min on a normal node).' },
  miner3: { n: 'Miner Mk3', w: 2, h: 2, cat: 'prod', kind: 'miner', on: 'node', rate: 480, power: 30, cost: { heavy_modular_frame: 4, computer: 4, steel_pipe: 20 }, col: '#e03a4a', desc: '480/min on a normal node. You will need faster belts.' },
  harvester: { n: 'Tree Harvester', w: 2, h: 2, cat: 'prod', kind: 'harvester', power: 3, cost: { iron_plate: 15, iron_rod: 10 }, col: '#6f9a3a', desc: 'Automatically chops trees within 8 tiles and outputs Wood (5 per tree). Move it when the area is cleared.' },
  smelter: { n: 'Smelter', w: 2, h: 2, cat: 'prod', kind: 'machine', machine: 'smelter', power: 4, cost: { iron_plate: 5, iron_rod: 5 }, col: '#c25a3c', desc: 'Melts ore into ingots. One input (blue arrow), one output (orange arrow).' },
  constructor: { n: 'Constructor', w: 2, h: 2, cat: 'prod', kind: 'machine', machine: 'constructor', power: 4, cost: { iron_plate: 8, iron_rod: 8 }, col: '#3a82c2', desc: 'Turns one input into a part.' },
  assembler: { n: 'Assembler', w: 3, h: 3, cat: 'prod', kind: 'machine', machine: 'assembler', power: 15, cost: { iron_plate: 20, screw: 60, cable: 20 }, col: '#7a5cd0', desc: 'Combines two ingredients into an advanced part. Both come in through the one input port: merge the belts with a Merger.' },
  foundry: { n: 'Foundry', w: 3, h: 3, cat: 'prod', kind: 'machine', machine: 'foundry', power: 16, cost: { modular_frame: 10, rotor: 10, concrete: 20 }, col: '#c23e66', desc: 'Two-input smelting: Steel and Aluminum.' },
  refinery: { n: 'Refinery', w: 4, h: 4, cat: 'prod', kind: 'machine', machine: 'refinery', power: 30, cost: { motor: 10, encased_beam: 10, steel_pipe: 30, copper_sheet: 20 }, col: '#c4913a', desc: 'Processes fluids. Pipes attach on any side; items use belts. Byproducts must go somewhere or it stops!' },
  manufacturer: { n: 'Manufacturer', w: 4, h: 4, cat: 'prod', kind: 'machine', machine: 'manufacturer', power: 55, cost: { motor: 5, modular_frame: 20, cable: 50, plastic: 50 }, col: '#2fa596', desc: 'Combines up to four ingredients into high-tech components. Merge the ingredient belts into its single input.' },
  packager: { n: 'Packager', w: 3, h: 3, cat: 'prod', kind: 'machine', machine: 'packager', power: 10, cost: { steel_beam: 20, rubber: 10, plastic: 10 }, col: '#4a8ac2', desc: 'Puts fluids into canisters (and back out). Packaged Fuel rides belts, trucks and trains, and Fuel Generators burn it. Fluids by pipe on any side.' },
  blender: { n: 'Blender', w: 4, h: 4, cat: 'prod', kind: 'machine', machine: 'blender', power: 75, cost: { motor: 20, heavy_modular_frame: 10, alu_casing: 50, computer: 10 }, col: '#3aa0a0', desc: 'Mixes fluids and items into advanced products: Cooling Systems and Turbofuel. Merge item belts into its input; fluids by pipe.' },
  particle_accelerator: { n: 'Particle Accelerator', w: 5, h: 5, cat: 'prod', kind: 'machine', machine: 'particle', power: 400, cost: { radio_control_unit: 25, cooling_system: 50, heavy_modular_frame: 20, alclad_sheet: 200 }, col: '#7a5ae0', desc: 'Makes Quantum Cores for the final Space Elevator phase. Uses a huge 400 MW while running — build serious power first!' },
  water_extractor: { n: 'Water Extractor', w: 2, h: 2, cat: 'prod', kind: 'extractor', on: 'water', rate: 240, power: 20, cost: { copper_sheet: 20, reinforced_plate: 10, rotor: 10 }, col: '#3f8fe0', desc: 'Place fully on water. Pumps 240 Water/min into an adjacent pipe.' },
  oil_extractor: { n: 'Oil Extractor', w: 2, h: 2, cat: 'prod', kind: 'extractor', on: 'oil', rate: 240, power: 40, cost: { motor: 15, encased_beam: 20, cable: 60 }, col: '#6a4a8a', desc: 'Place on an oil node. Pumps Crude Oil into an adjacent pipe. Impure 120 · Normal 240 · Pure 480 /min.' },

  // --- Logistics
  belt1: { n: 'Conveyor Belt Mk1', w: 1, h: 1, cat: 'log', kind: 'belt', tier: 1, speed: 2, logistic: true, cost: { iron_plate: 1 }, col: '#e0a030', desc: '240 items/min. Click-drag to lay a line; R flips the corner.' },
  belt2: { n: 'Conveyor Belt Mk2', w: 1, h: 1, cat: 'log', kind: 'belt', tier: 2, speed: 4, logistic: true, cost: { iron_plate: 2, screw: 4 }, col: '#4cc38a', desc: '480 items/min. Drag over old belts to upgrade them.' },
  belt3: { n: 'Conveyor Belt Mk3', w: 1, h: 1, cat: 'log', kind: 'belt', tier: 3, speed: 8, logistic: true, cost: { steel_beam: 1 }, col: '#4ea1ff', desc: '960 items/min.' },
  belt4: { n: 'Conveyor Belt Mk4', w: 1, h: 1, cat: 'log', kind: 'belt', tier: 4, speed: 12, logistic: true, cost: { encased_beam: 1, plastic: 1 }, col: '#c77dff', desc: '1440 items/min.' },
  tunnel: { n: 'Belt Tunnel', w: 1, h: 1, cat: 'log', kind: 'tunnel', range: 8, speed: 12, logistic: true, cost: { iron_plate: 10, screw: 20 }, col: '#d6a13a', desc: 'Place an entrance, then an exit up to 8 tiles further in the same direction. Belts pass underneath anything.' },
  splitter: { n: 'Splitter', w: 1, h: 1, cat: 'log', kind: 'splitter', logistic: true, cost: { iron_plate: 4, cable: 4 }, col: '#d6b13a', desc: 'Items from the back are split evenly to front / left / right.' },
  merger: { n: 'Merger', w: 1, h: 1, cat: 'log', kind: 'merger', logistic: true, cost: { iron_plate: 4, iron_rod: 4 }, col: '#d6b13a', desc: 'Combines up to three belts (back, left, right) into one belt out the front, taking turns fairly. Use it to feed multi-ingredient machines.' },
  sorter: { n: 'Smart Splitter', w: 1, h: 1, cat: 'log', kind: 'sorter', logistic: true, cost: { reinforced_plate: 2, cable: 10 }, col: '#3ab0d6', desc: 'A splitter with filters. Set each output to an item, Any, Overflow, or None.' },
  storage: { n: 'Storage Container', w: 2, h: 2, cat: 'log', kind: 'storage', cap: 1000, cost: { iron_plate: 20, iron_rod: 20 }, col: '#7c8c4c', desc: 'Buffers 1000 items. In through the blue input arrow, out through the orange output arrow. Can be emptied into your inventory.' },
  storage2: { n: 'Industrial Storage', w: 3, h: 3, cat: 'log', kind: 'storage', cap: 5000, cost: { steel_beam: 20, steel_pipe: 20 }, col: '#5f8c5c', desc: 'Buffers 5000 items.' },
  sink: { n: 'Resource Sink', w: 3, h: 3, cat: 'log', kind: 'sink', power: 30, cost: { reinforced_plate: 15, cable: 30, concrete: 45 }, col: '#d65fa0', desc: 'Destroys any item for Points. Points earn Coupons to spend in the Shop (K). Great for byproducts!' },

  // --- Fluids
  pipe1: { n: 'Pipe Mk1', w: 1, h: 1, cat: 'fluid', kind: 'pipe', tier: 1, pipeRate: 600, logistic: true, cost: { copper_sheet: 1 }, col: '#8a9aa8', desc: 'Carries fluid, 600/min. Connects to neighbours automatically. One fluid per network.' },
  pipe2: { n: 'Pipe Mk2', w: 1, h: 1, cat: 'fluid', kind: 'pipe', tier: 2, pipeRate: 1200, logistic: true, cost: { copper_sheet: 1, plastic: 1 }, col: '#b0c4d4', desc: 'Carries fluid, 1200/min. A network runs at its slowest pipe.' },
  ptunnel: { n: 'Pipe Tunnel', w: 1, h: 1, cat: 'fluid', kind: 'ptunnel', range: 10, logistic: true, cost: { copper_sheet: 10, iron_plate: 10 }, col: '#8a9aa8', desc: 'Place an entrance then an exit up to 10 tiles away in the same direction.' },
  tank: { n: 'Fluid Tank', w: 2, h: 2, cat: 'fluid', kind: 'tank', cap: 2000, cost: { iron_plate: 30, copper_sheet: 10 }, col: '#6a8aa8', desc: 'Adds 2000 capacity to its pipe network.' },

  // --- Power
  pole1: { n: 'Power Pole Mk1', w: 1, h: 1, cat: 'power', kind: 'pole', area: 3, reach: 10, logistic: true, cost: { iron_rod: 2, iron_plate: 1 }, col: '#c9a86a', desc: 'Powers everything within its 7×7 area. Auto-wires to poles within 10 tiles.' },
  pole2: { n: 'Power Pole Mk2', w: 1, h: 1, cat: 'power', kind: 'pole', area: 5, reach: 16, logistic: true, cost: { steel_pipe: 2, cable: 4 }, col: '#d8b870', desc: '11×11 area, 16-tile wire reach.' },
  tower: { n: 'Power Tower', w: 2, h: 2, cat: 'power', kind: 'pole', area: 2, reach: 60, logistic: true, cost: { concrete: 30, iron_rod: 20, cable: 50 }, col: '#e8c870', desc: 'Long-distance power: wires reach 60 tiles to other towers.' },
  biomass_burner: { n: 'Biomass Burner', w: 2, h: 2, cat: 'power', kind: 'gen', mw: 30, fuels: { wood: 4, biomass: 8 }, cost: { iron_plate: 15, iron_rod: 15 }, col: '#8a6a3a', desc: '30 MW. Burns Wood or Biomass (belt it in or load from inventory).' },
  coal_gen: { n: 'Coal Generator', w: 3, h: 3, cat: 'power', kind: 'gen', mw: 75, fuels: { coal: 2, compacted_coal: 8.4 }, water: 90, cost: { rotor: 10, cable: 30, reinforced_plate: 20 }, col: '#4a4a55', desc: '75 MW. Needs Coal (30/min) or Compacted Coal by belt, and Water (90/min) by pipe.' },
  fuel_gen: { n: 'Fuel Generator', w: 3, h: 3, cat: 'power', kind: 'gen', mw: 150, fuels: { fuel: 2.5, turbofuel: 7.5, packaged_fuel: 2.5 }, cost: { computer: 5, heavy_modular_frame: 5, motor: 15, rubber: 50 }, col: '#c86a2a', desc: '150 MW. Burns Fuel (24/min) or Turbofuel (3× longer) by pipe, or Packaged Fuel by belt.' },
  geothermal: { n: 'Geothermal Generator', w: 2, h: 2, cat: 'power', kind: 'gen', on: 'geyser', mw: 150, cost: { motor: 10, modular_frame: 10, cable: 50 }, col: '#d65a3a', desc: 'Free power on a geyser: Impure 75 · Normal 150 · Pure 300 MW.' },
  solar: { n: 'Solar Panel', w: 3, h: 3, cat: 'power', kind: 'gen', solar: true, mw: 20, cost: { reinforced_plate: 10, wire: 60, copper_sheet: 10 }, col: '#2f5f9a', desc: 'Free, clean power from the sun: 20 MW at noon, fading at dusk and nothing at night. Pair with Power Storage to keep the lights on. (Always full power if the day/night cycle is off.)', noRotate: true },
  battery: { n: 'Power Storage', w: 2, h: 2, cat: 'power', kind: 'battery', cap: 6000, mw: 100, cost: { encased_beam: 10, automated_wiring: 5, cable: 50 }, col: '#4ac0a0', desc: 'Stores 6000 MJ (100 MW for a minute). Charges from surplus, discharges during shortages.' },

  // --- Transport
  rail: { n: 'Railway', w: 1, h: 1, cat: 'trans', kind: 'rail', logistic: true, cost: { iron_rod: 1, iron_plate: 1 }, col: '#9a8a7a', desc: 'Click-drag to lay track. Turn off an existing track to make a junction.' },
  station: { n: 'Train Station', w: 3, h: 3, cat: 'trans', kind: 'station', power: 20, cap: 4000, cost: { concrete: 50, cable: 25, iron_plate: 40 }, col: '#b58a4a', desc: 'Place it anywhere, then use Quick Route in its panel to auto-build track and a train to another station. Set Load or Unload. Belts go into the blue input arrow; unloading stations send items out of the orange arrow.' },
  locomotive: { n: 'Locomotive', w: 1, h: 1, cat: 'trans', kind: 'train', cost: { rotor: 10, reinforced_plate: 20, cable: 50 }, col: '#d0503a', desc: 'Click a railway to place a train. Click the train to add wagons and a schedule.', noRotate: false },
  wagon: { n: 'Freight Wagon', w: 1, h: 1, cat: 'trans', kind: 'wagon', hidden: true, cost: { iron_plate: 40, reinforced_plate: 10 }, col: '#8a7a6a', desc: 'Holds 2000 items.' },
  outpost: { n: 'Outpost', w: 3, h: 3, cat: 'trans', kind: 'outpost', area: 8, reach: 16, mw: 10, noRotate: true, cost: { concrete: 60, iron_plate: 80, cable: 40 }, col: '#e89a3a', desc: 'A second base for far-away regions: 10 MW of free power in its area, wires to your grid like a pole, and a fast-travel point (O) in Easy, Normal and Creative. Items still have to be shipped home to the HUB.' },
  truck_station: { n: 'Truck Station', w: 3, h: 3, cat: 'trans', kind: 'tstation', power: 10, cap: 2000, cost: { iron_plate: 30, rotor: 4, concrete: 20 }, col: '#c98a3a', desc: 'Trucks drive between Truck Stations over open ground — no track needed. Belt items into the blue input; set Load or Unload; buy trucks in its panel.' },
  truck: { n: 'Truck', w: 1, h: 1, cat: 'trans', kind: 'vehicle', hidden: true, cost: { rotor: 6, iron_plate: 30, cable: 20 }, col: '#e2742a', desc: 'Carries 800 items between Truck Stations.' },
  drone_port: { n: 'Drone Port', w: 3, h: 3, cat: 'trans', kind: 'drone', power: 50, cap: 2000, cost: { heavy_modular_frame: 10, computer: 10, alclad_sheet: 50 }, col: '#5a9ad8', desc: 'Pick a destination port. Its drone flies anything belted in straight there — no track needed.' },

  // --- Floors
  foundation: { n: 'Foundation', w: 1, h: 1, cat: 'struct', kind: 'foundation', cost: { concrete: 2 }, col: '#9d9a93', desc: 'A floor tile for building on upper floors. Go up a floor (PageUp or the floor buttons), then click-drag a rectangle. Not allowed over mountains.' },
  lift_up: { n: 'Conveyor Lift (up)', w: 1, h: 1, cat: 'struct', kind: 'lift', dz: 1, speed: 4, logistic: true, cost: { iron_plate: 6, iron_rod: 6 }, col: '#e0a030', desc: 'Carries items UP one floor: belt in from behind on this floor, out the front on the floor above (which needs a foundation there).' },
  lift_down: { n: 'Conveyor Lift (down)', w: 1, h: 1, cat: 'struct', kind: 'lift', dz: -1, speed: 4, logistic: true, cost: { iron_plate: 6, iron_rod: 6 }, col: '#e0a030', desc: 'Carries items DOWN one floor: belt in from behind on this floor, out the front on the floor below.' },
  pipe_lift: { n: 'Pipe Lift', w: 1, h: 1, cat: 'struct', kind: 'pipe', dz: 1, tier: 1, pipeRate: 600, logistic: true, cost: { copper_sheet: 4, iron_plate: 4 }, col: '#8a9aa8', desc: 'A vertical pipe joining this floor to the one above. Pipes on either floor connect to it.' },

  // --- Special
  hub: { n: 'HUB', w: 4, h: 4, cat: 'special', kind: 'hub', area: 14, reach: 16, mw: 30, cost: {}, col: '#f5a524', desc: 'Your base. Belt anything in from any side to add it to your inventory. Supplies 30 MW to a large area.', noRotate: true, hidden: true },
  elevator: { n: 'Space Elevator', w: 5, h: 5, cat: 'special', kind: 'elevator', cost: { concrete: 300, iron_plate: 100, iron_rod: 100 }, col: '#dcdcf0', desc: 'Belt Project Parts in to complete Phases and unlock new Tiers. Other items go to your inventory.', noRotate: true },
  statue: { n: 'Golden Nut Statue', w: 2, h: 2, cat: 'special', kind: 'decor', cost: { iron_plate: 10 }, col: '#f0c040', desc: 'Purely decorative. Very shiny.', noRotate: true },
  lamp: { n: 'Flood Light', w: 1, h: 1, cat: 'special', kind: 'decor', logistic: true, cost: { iron_rod: 2, wire: 4 }, col: '#fff2b0', desc: 'Decorative light.', noRotate: true },
};

export const CATS = [
  { id: 'prod', n: 'Production', types: [['miner3', 'miner2', 'miner1'], 'smelter', 'constructor', 'assembler', 'foundry', 'refinery', 'manufacturer', 'harvester', 'water_extractor', 'oil_extractor'] },
  { id: 'adv', n: 'Advanced', types: ['packager', 'blender', 'particle_accelerator'] },
  { id: 'log', n: 'Logistics', types: [['belt4', 'belt3', 'belt2', 'belt1'], 'tunnel', 'splitter', 'merger', 'sorter', ['storage2', 'storage'], 'sink'] },
  { id: 'power', n: 'Power', types: ['pole1', 'pole2', 'tower', 'biomass_burner', 'coal_gen', 'fuel_gen', 'geothermal', 'solar', 'battery'] },
  { id: 'fluid', n: 'Fluids', types: [['pipe2', 'pipe1'], 'ptunnel', 'tank'] },
  { id: 'trans', n: 'Transport', types: ['rail', 'station', 'locomotive', 'truck_station', 'outpost', 'drone_port'] },
  { id: 'struct', n: 'Floors', types: ['foundation', 'lift_up', 'lift_down', 'pipe_lift'] },
  { id: 'special', n: 'Special', types: ['elevator', 'statue', 'lamp'] },
] as { id: string; n: string; types: (string | string[])[] }[];

// ---------------------------------------------------------------------------
export interface Milestone { id: string; tier: number; n: string; req: Cost; un?: string[]; phase?: number; unlockTiers?: number[]; win?: boolean; tip?: string }

export const START_UNLOCKS = ['belt1', 'miner1', 'smelter', 'pole1', 'iron_ingot', 'iron_plate', 'iron_rod'];

export const MILESTONES: Milestone[] = [
  { id: 't0a', tier: 0, n: 'HUB Online', req: { iron_ingot: 20 }, un: ['constructor'] },
  { id: 't0b', tier: 0, n: 'Basic Parts', req: { iron_plate: 150, iron_rod: 150 }, un: ['screw', 'concrete', 'storage', 'biomass', 'biomass_burner', 'harvester'], tip: 'Power! Biomass Burners burn Wood — click trees to chop them, or build a Tree Harvester.' },
  { id: 't0c', tier: 0, n: 'Copper Age', req: { screw: 150, concrete: 50 }, un: ['copper_ingot', 'wire', 'cable', 'merger', 'splitter'], tip: 'Mergers combine belts. Machines that need two ingredients take both through their one blue input, so merge the ingredient belts first.' },

  { id: 't1a', tier: 1, n: 'Part Assembly', req: { wire: 200, cable: 100, iron_plate: 200 }, un: ['assembler', 'reinforced_plate', 'rotor', 'copper_sheet'] },
  { id: 't1b', tier: 1, n: 'Logistics Mk2', req: { reinforced_plate: 50, screw: 500 }, un: ['belt2', 'tunnel', 'sorter', 'truck_station', 'truck', 'outpost', 'foundation', 'lift_up', 'lift_down'], tip: 'Outposts give far-away regions free starter power and a fast-travel point (O). Build upward! Foundations (Floors tab, or press PageUp) let you build on up to three floors, and Conveyor Lifts move items between them. Trucks: place two Truck Stations and buy a truck in one of their panels. Belt Tunnels let belts cross each other. Blueprints (Ctrl+C / B) are always available — copy a line, paste it five times!' },
  { id: 't1c', tier: 1, n: 'Resource Sink', req: { reinforced_plate: 50, rotor: 25, cable: 100 }, un: ['sink'], tip: 'Anything fed into a Resource Sink earns Points → Coupons → Shop (K).' },
  { id: 't2a', tier: 2, n: 'Frameworks', req: { rotor: 50, reinforced_plate: 100 }, un: ['modular_frame', 'smart_plating', 'elevator'], tip: 'The Space Elevator (Special tab) is your big goal. Belt Smart Plating into it!' },
  { id: 't2c', tier: 2, n: 'Railways', req: { reinforced_plate: 100, rotor: 40, cable: 200 }, un: ['rail', 'station', 'locomotive', 'wagon', 'tower'], tip: 'Place two Train Stations, click one and use Quick Route: it lays the track and builds a train for you. Great for far-away resources!' },
  { id: 't2b', tier: 2, n: 'Coal Power', req: { modular_frame: 20, cable: 300, rotor: 50 }, un: ['coal_gen', 'water_extractor', 'pipe1', 'ptunnel', 'tank', 'solar', 'pipe_lift'], tip: 'Coal Generators need Coal by belt AND Water by pipe. Place a Water Extractor on a lake. Solar Panels are free power — but only while the sun is up.' },
  { id: 'p1', tier: 2, phase: 1, n: 'Elevator Phase 1', req: { smart_plating: 50 }, unlockTiers: [3, 4] },

  { id: 't3a', tier: 3, n: 'Steel', req: { concrete: 500, modular_frame: 50, cable: 200 }, un: ['foundry', 'steel_ingot', 'steel_beam', 'steel_pipe', 'encased_beam', 'versatile_framework'] },
  { id: 't3b', tier: 3, n: 'Upgrades', req: { steel_pipe: 200, encased_beam: 100 }, un: ['miner2', 'belt3', 'pole2', 'storage2'] },
  { id: 't3c', tier: 3, n: 'Electromechanics', req: { steel_beam: 200, wire: 600 }, un: ['stator', 'motor', 'automated_wiring'] },
  { id: 't4b', tier: 4, n: 'Caterium', req: { versatile_framework: 50, motor: 50 }, un: ['caterium_ingot', 'quickwire', 'ai_limiter'] },
  { id: 'p2', tier: 4, phase: 2, n: 'Elevator Phase 2', req: { smart_plating: 300, versatile_framework: 300, automated_wiring: 100 }, unlockTiers: [5, 6] },

  { id: 't5a', tier: 5, n: 'Oil Processing', req: { motor: 100, encased_beam: 200, automated_wiring: 50 }, un: ['oil_extractor', 'refinery', 'plastic', 'rubber', 'fuel', 'residual_fuel', 'residual_plastic', 'residual_rubber', 'fuel_gen', 'pipe2'], tip: 'Refineries make byproducts. If a byproduct has nowhere to go, the refinery stops. Sink it or reuse it!' },
  { id: 't5b', tier: 5, n: 'Industrial Manufacturing', req: { plastic: 300, rubber: 300, modular_frame: 100 }, un: ['manufacturer', 'heavy_modular_frame', 'computer', 'circuit_board', 'packager', 'empty_canister', 'packaged_water', 'packaged_fuel', 'packaged_oil', 'unpack_fuel'], tip: 'The Packager (Advanced tab) puts fluids in canisters, so trucks and trains can haul fuel to far-away generators.' },
  { id: 't5c', tier: 5, n: 'Advanced Logistics', req: { heavy_modular_frame: 20, rubber: 200, computer: 10 }, un: ['belt4', 'miner3', 'geothermal', 'battery'] },
  { id: 't6a', tier: 6, n: 'Quartz Technology', req: { computer: 25, heavy_modular_frame: 25 }, un: ['quartz_crystal', 'silica', 'crystal_oscillator', 'high_speed_connector'] },
  { id: 't6b', tier: 6, n: 'Modular Engines', req: { circuit_board: 200, rubber: 300, motor: 100 }, un: ['modular_engine', 'adaptive_control_unit', 'compacted_coal'], tip: 'Sulfur lives out in the highlands and deserts — the Scanner (N) will find it. Compacted Coal burns far longer in Coal Generators.' },
  { id: 'p3', tier: 6, phase: 3, n: 'Elevator Phase 3', req: { versatile_framework: 500, modular_engine: 100, adaptive_control_unit: 50 }, unlockTiers: [7] },

  { id: 't7a', tier: 7, n: 'Aluminum', req: { crystal_oscillator: 50, high_speed_connector: 50 }, un: ['alumina_solution', 'aluminum_scrap', 'aluminum_ingot', 'alclad_sheet', 'alu_casing', 'radio_control_unit', 'heat_sink', 'blender', 'cooling_system', 'turbofuel'], tip: 'Bauxite sits near the edges of the map. The Blender makes Cooling Systems and Turbofuel (3× longer burn in Fuel Generators).' },
  { id: 't7b', tier: 7, n: 'Supercomputing', req: { adaptive_control_unit: 50, high_speed_connector: 100 }, un: ['supercomputer', 'assembly_director', 'drone_port', 'turbo_motor', 'particle_accelerator', 'quantum_core'], tip: 'The Particle Accelerator makes Quantum Cores for the final launch. It needs 400 MW, so plan your power grid.' },
  { id: 'p4', tier: 7, phase: 4, n: 'Launch Project Assembly', req: { assembly_director: 40, turbo_motor: 25, quantum_core: 20, supercomputer: 80 }, win: true },
];
export const MAX_TIER = 7;
/** the original final phase, kept for worlds created before the endgame update */
const P4_LEGACY: Cost = { assembly_director: 50, radio_control_unit: 100, supercomputer: 100, heavy_modular_frame: 200 };
const BASE_REQ = new Map<string, Cost>(MILESTONES.map(m => [m.id, { ...m.req }]));
/** round to friendly numbers (5, 10, 25, 50...) */
function nice(n: number) {
  if (n <= 20) return Math.max(1, Math.round(n));
  const step = n < 100 ? 5 : n < 400 ? 10 : n < 1500 ? 25 : 50;
  return Math.round(n / step) * step;
}
/** set every milestone's requirement for this world: scaled by difficulty (new worlds) or the original amounts */
export function applyGameLength(mult: (tier: number) => number, legacy: boolean) {
  for (const m of MILESTONES) {
    const base = legacy && m.id === 'p4' ? P4_LEGACY : BASE_REQ.get(m.id)!;
    const k = legacy ? 1 : mult(m.tier);
    const r: Cost = {};
    for (const i in base) r[i] = k === 1 ? base[i] : nice(base[i] * k);
    m.req = r;
  }
}
export const TIER_NAMES = ['Onboarding', 'Field Research', 'Base Building', 'Steel & Motors', 'Rail & Caterium', 'Oil & Industry', 'Quartz & Engines', 'Space Race'];

// ---------------------------------------------------------------------------
export interface ShopItem { id: string; n: string; desc: string; cost: number; repeat?: boolean; give?: Cost; unlock?: string }
export const SHOP: ShopItem[] = [
  { id: 'shard', n: 'Power Shard', desc: 'Lets one machine run +50% faster (overclock). Stack up to 3 per machine.', cost: 2, repeat: true, give: { power_shard: 1 } },
  { id: 'amp', n: 'Output Amplifier', desc: 'Doubles a machine\'s output (uses 4× power). One per machine.', cost: 12, repeat: true, give: { amplifier: 1 } },
  { id: 'hands', n: 'Nimble Hands', desc: 'Hand crafting is 3× faster.', cost: 3 },
  { id: 'pick', n: 'Mega Pickaxe', desc: 'Hand-mining gives 5 ore per click; chopping gives double wood.', cost: 3 },
  { id: 'wires', n: 'Long Wires', desc: 'All power poles reach 50% further.', cost: 6 },
  { id: 'statue', n: 'Golden Nut Statue', desc: 'Unlocks a shiny decorative statue.', cost: 2, unlock: 'statue' },
  { id: 'lamp', n: 'Flood Lights', desc: 'Unlocks decorative lights.', cost: 1, unlock: 'lamp' },
  { id: 'gold', n: 'Golden Belts', desc: 'Cosmetic: all your belts shine gold.', cost: 5 },
  { id: 'express', n: 'Express Trains', desc: 'Trains go 50% faster.', cost: 8 },
];

// ---------------------------------------------------------------------------
// Sink point values (computed from recipe depth)
const RAW_VAL: Record<string, number> = { iron_ore: 1, copper_ore: 2, limestone: 1, coal: 2, caterium_ore: 4, raw_quartz: 4, bauxite: 4, wood: 1, water: 0, crude_oil: 1, heavy_oil: 1, fuel: 2, alumina_solution: 2, power_shard: 500, amplifier: 3000, hard_drive: 800, sulfur: 3, turbofuel: 6 };
export function computeValues() {
  const val: Record<string, number> = { ...RAW_VAL };
  for (let pass = 0; pass < 12; pass++) {
    for (const id in RECIPES) {
      const r = RECIPES[id];
      let inV = 0, ok = true;
      for (const k in r.in) { if (val[k] === undefined) { ok = false; break } inV += val[k] * r.in[k] }
      if (!ok) continue;
      inV += r.t * 2;
      const outs = Object.keys(r.out);
      const prim = outs[0];
      if (val[prim] === undefined || id === prim) val[prim] = Math.max(1, Math.round(inV * 1.15 / r.out[prim] * (outs.length > 1 ? 0.85 : 1)));
      for (const o of outs.slice(1)) if (val[o] === undefined) val[o] = Math.max(1, Math.round(val[prim] * 0.3));
    }
  }
  for (const k in ITEMS) ITEMS[k].val = val[k] ?? 1;
}
computeValues();

export function recipesFor(m: string) { return Object.values(RECIPES).filter(r => r.m === m) }
/** the standard (non-alternate) recipe that makes an item, if any */
export function mainRecipe(item: string): Recipe | null {
  if (RECIPES[item] && !RECIPES[item].alt && Object.keys(RECIPES[item].out)[0] === item) return RECIPES[item];
  for (const k in RECIPES) { const r = RECIPES[k]; if (!r.alt && Object.keys(r.out)[0] === item) return r; }
  return null;
}
export const primaryOut = (r: Recipe) => Object.keys(r.out)[0];

// ---------------------------------------------------------------------------
// Visual heights (in tiles) for the isometric view
export const HEIGHT: Record<string, number> = {
  miner1: 0.85, miner2: 0.95, miner3: 1.05, harvester: 0.7, smelter: 1.1, constructor: 0.9, assembler: 1.25, foundry: 1.45,
  refinery: 1.7, manufacturer: 1.6, water_extractor: 0.55, oil_extractor: 1.0, storage: 0.9, storage2: 1.2, sink: 0.8,
  tank: 1.3, biomass_burner: 0.9, coal_gen: 1.4, solar: 0.9, outpost: 1.0, packager: 1.6, blender: 2.2, particle_accelerator: 2.6, truck_station: 0.35, fuel_gen: 1.5, geothermal: 0.7, battery: 1.0, station: 0.35, drone_port: 0.4,
  hub: 1.15, elevator: 0.6, statue: 0.5, lamp: 0.25, splitter: 0.32, merger: 0.32, sorter: 0.32, tower: 0.3, pole1: 0, pole2: 0,
};
export const heightOf = (type: string) => HEIGHT[type] ?? 0.8;
