import * as THREE from 'three';
import { disposeTree } from './dispose.js';
import { GLYPHS } from './glyphs.js';
import { WaterSurface } from './water.js';
import { IceShimmer } from './ice.js';

export const TILE_SIZE = 1;

// Two deliberately separate palettes so a "red" thing is never mistaken for a
// "gold" thing. Keys/doors are one system; switches/obstacles are another.
export const KEY_COLORS = {
  gold: 0xf7c948,
  violet: 0x8b5cf6,
  white: 0xe8edf7,
};

export const SWITCH_COLORS = {
  red: 0xef4444,
  cyan: 0x22d3ee,
  pink: 0xec4899,
};

// A third palette, for teleport pads. Neither a key colour nor a switch colour: a pad
// is a place, not a thing you carry or press, and it should not read as either.
export const PAD_COLORS = {
  a: 0x4c9aff,
  b: 0xff9f43,
  c: 0x2ee6a8,
};

/**
 * The vocabulary: every kind of tile there is, by name.
 *
 * Maps are still grids of single characters — see `src/glyphs.js` — but a character
 * is only a binding, and what it binds to is one of these names. Names are what a
 * mechanic claims, and there is no shortage of them: the game used to be capped at
 * however many punctuation marks were still free, which is how it ended up with `)`
 * and `(` for the two ways an enemy can turn.
 *
 * A name is a type, narrowed up to twice:
 *
 *   type                  what it is    wall, floor, water, ice, stair, slide,
 *                                       elevator, crate, spawn, star, tube
 *   type:variant          which one     key:gold, pad:a, plate:red, floor:1
 *   type:variant/state    how it starts switch:red/pressed, elevator/top,
 *                                       obstacle:red/retracted
 *
 * The colour families are generated from the palettes above rather than listed, so a
 * new colour is one line there and nothing here: add `rust` to KEY_COLORS and
 * `key:rust` and `door:rust` both exist.
 *
 *   floor:N   ground N levels up, on top of whatever the layer already contributes.
 *             No character binds to it: height is said by which grid a tile is drawn
 *             on, so that every storey's grid shows exactly the space you can walk on
 *             at that storey. `floor:N` is still here for a stage that wants to bind a
 *             character of its own to it.
 *   stair     joins two floors one level apart, walkable both ways
 *   slide     a chute that only ever carries you downhill. You can step on to the
 *             foot of one, but it tips you straight back off again
 *   elevator  a platform running between the floors beside it, starting at the bottom,
 *             or at the top with `elevator/top` so a pair of them can pass each other
 *   crate     ordinary floor with a pushable crate on it — one tile at a time, and
 *             only from behind
 *   tube      an inner tube, which is what lets you cross water
 *   ice       step onto it and you keep going that way until you are off it
 *   pad:a     a teleport pad. Each variant appears exactly twice, and the two are the
 *             two ends of one trip: step onto either and you arrive at the other.
 *   enemy:vertical, enemy:horizontal   patrols that reverse when blocked
 *   enemy:clockwise, enemy:counterclockwise   patrols that turn when blocked
 *
 * Both ramps work out where they run and how far they climb from the ground on either
 * side of them, so a map never has to state its elevation twice.
 *
 * A map is several grids deep, ground first: one grid per storey, and a tile's height
 * is the grid it is drawn on. That is what a bridge needs — a deck on the layer above
 * the water it crosses — and it is also how all raised ground is said, so reading the
 * grid for a storey tells you the whole of where you can stand on it. A space means
 * "nothing here": the usual case above the ground, and a hole in it down below.
 *
 * A key opens only a door of its own colour. A plate is held down by anything standing
 * on it — you or a crate — and its gate is open for exactly as long as one of its plates
 * is held. Standing in a gateway also holds that gate open, so stepping off the last
 * plate can never shut a gate on you.
 *
 * Obstacles belong to group A (raised at the start) or group B (`/retracted`). Stepping
 * on a switch swaps which group of its colour is raised, so one press both opens and
 * closes. Only one switch of a colour is down at a time: pressing one lets every
 * other switch of that colour back up, and a switch that is already down does
 * nothing when you stand on it. So give a colour at least two switches, or the
 * one it has will be spent after a single press.
 *
 * @type {Record<string, import('./types.js').TileDef>}
 */
export const LEGEND = {
  wall: { type: 'wall' },
  floor: { type: 'floor' },
  water: { type: 'water' },
  ice: { type: 'ice' },
  stair: { type: 'stair' },
  slide: { type: 'slide' },
  elevator: { type: 'elevator' },
  'elevator/top': { type: 'elevator', startUp: true },
  // A crate stands on ordinary floor: the tile is the floor, the crate is a thing
  // on top of it that moves.
  crate: { type: 'floor', block: true },
  spawn: { type: 'spawn' },
  star: { type: 'star' },
  tube: { type: 'tube' },
  // Enemy spawns. The tile itself is ordinary floor; the pattern says which way
  // the enemy turns when something blocks its path.
  'enemy:vertical': { type: 'floor', enemy: 'vertical' },
  'enemy:horizontal': { type: 'floor', enemy: 'horizontal' },
  'enemy:clockwise': { type: 'floor', enemy: 'clockwise' },
  'enemy:counterclockwise': { type: 'floor', enemy: 'counterclockwise' },
};

// The coloured families, one set per palette. Written as a loop because that is the
// promise this format makes: a colour is a line in a palette, and everything that can
// wear it follows automatically.
for (const color of Object.keys(KEY_COLORS)) {
  LEGEND[`key:${color}`] = { type: 'key', color };
  LEGEND[`door:${color}`] = { type: 'door', color };
}

for (const color of Object.keys(SWITCH_COLORS)) {
  LEGEND[`switch:${color}`] = { type: 'switch', color };
  LEGEND[`switch:${color}/pressed`] = { type: 'switch', color, startPressed: true };
  LEGEND[`obstacle:${color}`] = { type: 'obstacle', color, group: 'A' };
  LEGEND[`obstacle:${color}/retracted`] = { type: 'obstacle', color, group: 'B' };
  LEGEND[`plate:${color}`] = { type: 'plate', color };
  LEGEND[`gate:${color}`] = { type: 'gate', color };
}

for (const color of Object.keys(PAD_COLORS)) {
  LEGEND[`pad:${color}`] = { type: 'pad', color };
}

/** A raised floor, `floor:1` and up. The one name with a number in it rather than a list. */
const FLOOR_LEVEL = /^floor:(\d+)$/;

/**
 * The tile a name describes, or null if there is no such tile. Everything in LEGEND,
 * plus `floor:N` for any N — elevation is arithmetic, not a vocabulary, and capping it
 * at two was only ever a shortage of apostrophes.
 *
 * @param {string} name
 * @returns {import('./types.js').TileDef|null}
 */
export function tileDef(name) {
  if (LEGEND[name]) return LEGEND[name];
  const level = FLOOR_LEVEL.exec(name);
  return level ? { type: 'floor', level: Number(level[1]) } : null;
}

// Column heights. Columns are 1.0 tall and centred on the group origin, and the
// floor top is y = 0.
const COLUMN_RAISED_Y = 0.5;
// A retracted column keeps its head above the floor: you can walk over these,
// but you can still see where they are, which is the difference between planning
// a route and being surprised by one coming up under you.
const COLUMN_STUB_HEIGHT = 0.06;
const COLUMN_RETRACTED_Y = COLUMN_STUB_HEIGHT - 0.5;

// How far below the floor plane you stand when you are in the water. The water
// slab spans y -0.21..-0.09, so this submerges a walker to about the knee and
// puts the inner tube right at the surface — which is the point: it shows that
// the tube is what's keeping you up.
export const WATER_SINK = 0.24;

// How far one level of elevation lifts a tile: a whole tile, so a storey is as tall as
// a square is wide. Anything less and a deck is not something you can be *under* — a
// walker is about 0.9 tall, and at half a tile they wade through the planks chest-high
// instead of passing beneath them.
export const LEVEL_RISE = TILE_SIZE;

// Four steps to a stair. Enough that it reads as a staircase from this camera
// distance, few enough that each step is a chunky slab rather than a sliver. Up here
// with the elevation rather than down with the geometry because it decides how high
// a stair is *walked* as well as how one is drawn — see `STAIR_STAND`.
const STAIR_TREADS = 4;

/**
 * How far above a stair's own level the player stands on one: half a step.
 *
 * A stair's steps are spread along the tile rather than stacked at its middle, and
 * `level` is the height of the middle of the flight — halfway up, which is what makes
 * a climb two half-steps instead of one lurch. But the step actually under the feet at
 * that point is the next one up, half a step higher. Standing at the level itself puts
 * the feet in the gap between two steps and the shins through the one in front.
 *
 * Like `WATER_SINK`, this moves the body and not the ground: the camera follows
 * `heightOf`, so a stair still reads as the even climb it is.
 */
export const STAIR_STAND = LEVEL_RISE / (2 * STAIR_TREADS);

// The tile types that join two heights. Neither is ground you can arrive at from
// the side: you take them along their run or not at all.
const RAMPS = new Set(['stair', 'slide']);

/**
 * The opposite direction. `|| 0` because negating a zero gives -0.
 * @param {import('./types.js').Direction} direction
 * @returns {import('./types.js').Direction}
 */
const opposite = ([dx, dz]) => [-dx || 0, -dz || 0];

/**
 * Whether two heights are the same height. Levels are compared rather than equated
 * because a chute's are fractions of a drop, and an elevator's is a moving number
 * that has to count as level with a storey when it arrives at one.
 */
const same = (a, b) => Math.abs(a - b) < 1e-6;

// A platform's cycle: dwell at the bottom, rise, dwell at the top, fall — a quarter
// of the period each. The dwells are what make it rideable; a step takes 0.14s, so a
// second of standing still at each end is room enough to get on and off.
export const ELEVATOR_PERIOD = 4;

// A pressure plate's face, up and held down. Shallower than a button: a plate is a
// flagstone that gives a little, not something with a click in it.
const PLATE_UP_Y = 0.05;
const PLATE_DOWN_Y = 0.015;

// A gate's bars: standing in the doorway, or dropped into the floor out of the way.
const GATE_SHUT_Y = 0.5;
const GATE_OPEN_Y = -0.55;

// How far a wall stands above the highest ground beside it. Chest height on the tile
// you are standing on: unmistakably a wall, without a storey of stone between the
// camera and everything behind it.
const WALL_PARAPET = 0.6;
const WALL_MIN_HEIGHT = 1.0;

// Floor buttons: the grey plate they sit on, and the button's height when up and
// when pressed.
const SWITCH_BASE_SIZE = TILE_SIZE * 0.78;
const SWITCH_UP_Y = 0.09;
const SWITCH_DOWN_Y = 0.035;

/**
 * Builds every tile from basic 3D shapes and owns the level's mutable state:
 * which pickups are gone, which doors are open, and which obstacle group is
 * currently raised per colour.
 *
 * One instance is one loaded stage. The stages themselves live in `src/levels.js`;
 * this class knows the rules, not the content.
 */
export class TileMap {
  /**
   * @param {string[]|string[][]} map one layer's rows of legend characters, or
   *   several layers, ground first — every row the same length. Production passes a
   *   stage's `rows`; tests pass miniature levels. A space means "nothing here",
   *   which on an upper layer is the usual case and on the ground is a hole.
   * @param {{build?: boolean, legend?: import('./types.js').Legend}} [options]
   *   `build: false` skips all mesh construction, which is how the headless tests
   *   run. Every mesh write in this class is guarded, so the rules behave identically
   *   either way. `legend` binds characters for this map only, merged over the
   *   default dialect in `src/glyphs.js` — which is how a stage gets a character of
   *   its own without taking it away from every other stage.
   */
  constructor(map, { build = true, legend } = {}) {
    // One layer or many: a bridge needs two tiles in the same cell, so a map is
    // really a stack of grids. Most stages are one grid deep and say so by passing
    // it directly.
    this.layers = Array.isArray(map[0]) ? /** @type {string[][]} */ (map) : [map];
    this.map = this.layers[0];
    /** What each character means on this map. @type {import('./types.js').Legend} */
    this.legend = legend ? { ...GLYPHS, ...legend } : GLYPHS;
    this.rows = this.map.length;
    this.cols = this.map[0].length;
    this.build = build;
    this.group = new THREE.Group();
    this.spawn = { gx: 1, gz: 1 };

    // Called with no arguments when the player reaches the star.
    this.onWin = null;

    /**
     * Called as things happen on the level, so effects can be hung off the rules
     * without the rules knowing about particles or sound.
     * @type {((name: string, detail: {kind: string, color?: string, position: THREE.Vector3}) => void) | null}
     */
    this.onEvent = null;

    /**
     * Who is standing on the map right now — the player, and any crates. Set by
     * whoever wires the world together; the map asks rather than holding references,
     * so it stays a thing that knows rules and not a thing that knows the cast.
     *
     * Plates read this, and so does anything that has to treat a crate as solid.
     * @type {() => {tile: import('./types.js').Tile, isBlock?: boolean}[]}
     */
    this.occupants = () => [];

    this._elapsed = 0;

    // Decoration that animates: the moving skin on the water and the shine on the
    // ice. Null on a map with none of either, and on every headless map.
    /** @type {?WaterSurface} */
    this._water = null;
    /** @type {?IceShimmer} */
    this._ice = null;

    this._parse();
    if (build) this._build();
    this._resetState();
  }

  // --- Map data -------------------------------------------------------------

  _parse() {
    // `tiles` is the ground layer, one tile per cell — which is what nearly every
    // rule wants. `columns` is the whole stack, ground first, for the places where
    // a cell can hold more than one thing.
    /** @type {(import('./types.js').Tile|null)[][]} */
    this.tiles = [];
    /** @type {import('./types.js').Tile[][][]} */
    this.columns = [];
    /** @type {{gx: number, gz: number, pattern: string}[]} */
    this.enemySpawns = [];
    /** @type {{gx: number, gz: number, layer: number}[]} */
    this.blockSpawns = [];
    /** @type {import('./types.js').Tile[]} */
    this._plates = [];
    /** @type {import('./types.js').Tile[]} */
    this._gates = [];
    /** @type {import('./types.js').Tile[]} */
    this._pads = [];
    // Kept flat, because pressing a switch has to reach every other switch of
    // its colour wherever it is on the map.
    /** @type {import('./types.js').Tile[]} */
    this._switches = [];
    /** @type {import('./types.js').Tile[]} */
    this._elevators = [];

    // Resolved once, up front: the grid sweep below is a lookup, not a parse.
    const defs = this._resolveLegend();

    for (let z = 0; z < this.rows; z++) {
      this.tiles.push(new Array(this.cols).fill(null));
      this.columns.push(Array.from({ length: this.cols }, () => []));
    }

    this.layers.forEach((rows, layer) => {
      // The ground layer says how big the map is, so it has to be square to itself. An
      // upper layer is mostly sky and is padded instead: a storey with one deck on it
      // is two characters and a lot of nothing, and demanding the nothing be typed out
      // would be busywork with a row-length error at the end of it. Since height is now
      // said by which layer a tile is on, most maps have several of these.
      const ground = layer === 0;
      if (ground && rows.length !== this.rows) {
        throw new Error(
          `Map layer ${layer} has ${rows.length} rows, expected ${this.rows}`,
        );
      }
      if (rows.length > this.rows) {
        throw new Error(
          `Map layer ${layer} has ${rows.length} rows, more than the ground's ${this.rows}`,
        );
      }

      for (let z = 0; z < this.rows; z++) {
        const row = rows[z] ?? '';
        if (ground && row.length !== this.cols) {
          throw new Error(
            `Map row ${z} is ${row.length} characters, expected ${this.cols}`,
          );
        }
        if (row.length > this.cols) {
          throw new Error(
            `Map layer ${layer} row ${z} is ${row.length} characters, wider than the ` +
              `ground's ${this.cols}`,
          );
        }

        for (let x = 0; x < row.length; x++) {
          const char = row[x];
          // Nothing on this layer here: the usual case above the ground, and a hole
          // in the ground when it happens down there.
          if (char === ' ') continue;

          const def = defs[char];
          if (!def) {
            throw new Error(`Map character "${char}" at ${x},${z} is not in the legend`);
          }
          if (def.type === 'spawn') this.spawn = { gx: x, gz: z };
          if (def.enemy) this.enemySpawns.push({ gx: x, gz: z, pattern: def.enemy });
          if (def.block) this.blockSpawns.push({ gx: x, gz: z, layer });

          // A layer sets the height, and a character can add to it: `'` on the
          // deck layer is one level above the deck.
          /** @type {import('./types.js').Tile} */
          const tile = {
            ...def,
            gx: x,
            gz: z,
            layer,
            level: layer + (def.level ?? 0),
            baseY: 0,
          };
          if (tile.type === 'switch') this._switches.push(tile);
          if (tile.type === 'elevator') this._elevators.push(tile);
          if (tile.type === 'plate') this._plates.push(tile);
          if (tile.type === 'gate') this._gates.push(tile);
          if (tile.type === 'pad') this._pads.push(tile);

          this.columns[z][x].push(tile);
          if (layer === 0) this.tiles[z][x] = tile;
        }
      }
    });

    this._deriveRamps();
    this._deriveElevators();
    this._derivePads();
  }

  /**
   * The legend with every name looked up. Every binding is resolved, not just the ones
   * this map happens to use: a legend entry naming a tile that doesn't exist is a typo,
   * and the moment to say so is when the stage loads, before any coordinate is involved.
   *
   * @returns {Record<string, import('./types.js').TileDef>}
   */
  _resolveLegend() {
    /** @type {Record<string, import('./types.js').TileDef>} */
    const defs = {};
    for (const [char, entry] of Object.entries(this.legend)) {
      // A name from the vocabulary, or a def written out in full for a genuine
      // one-off that isn't worth a name of its own.
      const def = typeof entry === 'string' ? tileDef(entry) : entry;
      if (!def) {
        throw new Error(`Legend binds "${char}" to "${entry}", which is not a tile`);
      }
      defs[char] = def;
    }
    return defs;
  }

  /** Every tile on every layer, ground first. */
  allTiles() {
    return this.columns.flat(2);
  }

  /**
   * Works out what every stair and slide joins.
   *
   * A ramp is authored as a bare `/` or `\`, and reads the rest from the ground on
   * either side of it — the same trick `_doorFacing` uses to decide which way a
   * door's slab must span. That keeps a map honest: the elevation is stated once,
   * by the floors, and a ramp cannot disagree with the ground it lands on.
   *
   * Each ramp comes out of this with:
   *   `run`   'x' or 'z', the axis it may be taken along
   *   `level` the height of its own surface, halfway up for a stair
   *   `up`    the direction towards its higher end
   *   `dir`   the direction it descends — the only way a slide may be taken
   */
  _deriveRamps() {
    const chutes = new Set();

    for (const tile of this.allTiles()) {
      if (tile.type === 'stair') this._deriveStair(tile);
      if (tile.type === 'slide' && !chutes.has(tile)) {
        for (const part of this._deriveChute(tile)) chutes.add(part);
      }
    }
  }

  /**
   * Every level a ramp on `layer` could land on at one cell.
   *
   * Its own layer answers if it has anything to say, and that is nearly always: a
   * stair between two floors of the same storey reads its ends right there, and
   * taking them keeps a deck overhead from being read as the end of a stair meant
   * for the floor underneath it.
   *
   * Where its own layer is silent — a hole, or open air under a bridge — the ramp
   * looks up and down the column instead. Together with the fallback in
   * `_landingPairs`, that is what lets a stair climb from a plain `.` to the plain `.`
   * of the storey above: neither end has to be spelled as raised ground, and neither
   * has to be on the ramp's own layer.
   *
   * Heights, not tiles: two tiles stacked at the *same* height are one landing to a
   * ramp, which arrives at that height and has no say in which of them it meets.
   * (That they are stacked at all is its own defect, and `level-checks.js` reports
   * it — but it is not the ramp's to complain about.)
   *
   * A `layer` of null drops the preference and reads the whole column, which is what
   * `_landingPairs` falls back to when the ramp's own layer had nothing usable to say.
   */
  _landings(gx, gz, layer) {
    const standable = this.column(gx, gz).filter(
      (t) => t.type !== 'wall' && !RAMPS.has(t.type) && t.type !== 'elevator',
    );
    const own = layer === null ? [] : standable.filter((t) => t.layer === layer);

    /** @type {number[]} */
    const levels = [];
    for (const t of own.length ? own : standable) {
      if (!levels.some((level) => same(level, t.level))) levels.push(t.level);
    }
    return levels;
  }

  /**
   * Every pair of floors a ramp on `layer` between two cells could join: one landing
   * from each end, at different heights. Usually exactly one, which is the answer;
   * none means the ramp joins nothing, and more than one means the map has not said
   * enough for the ramp to know which storeys are its own.
   *
   * @returns {{back: number, forward: number}[]}
   */
  _landingPairs(backCell, forwardCell, layer) {
    const own = this._pairsBetween(backCell, forwardCell, layer);
    if (own.length) return own;

    // Its own layer answered at both ends and gave the same height twice, which is no
    // ramp at all. Look up and down the columns before giving up, because this is what
    // a stair between two plain `.` tiles a storey apart looks like: ordinary floor
    // behind it, and ahead of it a cell holding both ordinary floor and the deck over
    // it. The deck is the landing. What keeps the floor under that deck from being
    // taken for the landing instead is `_rampExit`, which asks the ramp which of its
    // two ends you are walking towards.
    return this._pairsBetween(backCell, forwardCell, null);
  }

  /** @returns {{back: number, forward: number}[]} */
  _pairsBetween([backX, backZ], [forwardX, forwardZ], layer) {
    const pairs = [];
    for (const back of this._landings(backX, backZ, layer)) {
      for (const forward of this._landings(forwardX, forwardZ, layer)) {
        if (!same(back, forward)) pairs.push({ back, forward });
      }
    }
    return pairs;
  }

  /**
   * Complains about a ramp that could join more than one pair of floors. Its own
   * rule was not enough to pick one, and picking for it is how a stair ends up
   * climbing to the deck when it was meant for the floor underneath.
   */
  _ambiguous(tile, what, bothAxes) {
    return new Error(
      bothAxes
        ? `The ${what} at ${tile.gx},${tile.gz} could run either way: it has floors ` +
          'at different heights on both axes'
        : `The ${what} at ${tile.gx},${tile.gz} could join more than one pair of ` +
          'floors: say which by leaving only one of them beside it',
    );
  }

  /**
   * The axis a ramp runs along, judged by the ground at its ends: the one where
   * both sides are standable and at different heights.
   * @returns {{run: 'x'|'z', axis: [number, number], back: number, forward: number,
   *   low: number, high: number}}
   */
  _rampAxis(tile, what) {
    const options = [
      { run: /** @type {const} */ ('x'), axis: /** @type {[number, number]} */ ([1, 0]) },
      { run: /** @type {const} */ ('z'), axis: /** @type {[number, number]} */ ([0, 1]) },
    ];

    const found = [];
    for (const option of options) {
      const [dx, dz] = option.axis;
      const pairs = this._landingPairs(
        [tile.gx - dx, tile.gz - dz],
        [tile.gx + dx, tile.gz + dz],
        tile.layer,
      );
      for (const { back, forward } of pairs) {
        found.push({
          ...option,
          back,
          forward,
          low: Math.min(back, forward),
          high: Math.max(back, forward),
        });
      }
    }

    if (found.length === 0) {
      throw new Error(
        `The ${what} at ${tile.gx},${tile.gz} joins nothing: it needs floors at ` +
          'different heights on opposite sides of it',
      );
    }
    if (found.length > 1) {
      throw this._ambiguous(tile, what, new Set(found.map((f) => f.run)).size > 1);
    }
    return found[0];
  }

  /** A stair climbs exactly one level, and may be taken in either direction. */
  _deriveStair(tile) {
    const { run, axis, forward, low, high } = this._rampAxis(tile, 'stair');
    if (high - low !== 1) {
      throw new Error(
        `The stair at ${tile.gx},${tile.gz} spans ${high - low} levels: a stair ` +
          'joins floors exactly one level apart',
      );
    }

    const higherIsForward = same(forward, high);
    tile.run = run;
    tile.low = low;
    tile.high = high;
    // Halfway up, so a climb is two half-steps rather than one lurch.
    tile.level = low + 0.5;
    tile.up = higherIsForward ? axis : opposite(axis);
    tile.dir = opposite(tile.up);
    // The levels at its two ends. Connectivity asks this rather than working the
    // heights out again, which is what keeps a fractional chute exact.
    tile.joins = [low, high];
  }

  /**
   * A chute is a straight run of slide tiles between a floor at the top and a floor
   * at the bottom, and it descends evenly across them — so a three-tile chute from
   * level 2 to level 0 drops half a level per tile, and the ride reads as one
   * continuous fall rather than a set of steps.
   *
   * @returns {object[]} every tile in the chute, so the caller only derives it once
   */
  _deriveChute(tile) {
    const run = this._chuteRun(tile);
    const [dx, dz] = run === 'x' ? [1, 0] : [0, 1];

    // Walk to both ends of the run of slide tiles.
    const isSlide = (gx, gz) => this.get(gx, gz, tile.layer)?.type === 'slide';
    let backX = tile.gx;
    let backZ = tile.gz;
    while (isSlide(backX - dx, backZ - dz)) {
      backX -= dx;
      backZ -= dz;
    }
    const parts = [];
    for (let x = backX, z = backZ; isSlide(x, z); x += dx, z += dz) {
      parts.push(this.get(x, z, tile.layer));
    }

    const first = parts[0];
    const last = parts[parts.length - 1];
    /** @type {[number, number]} */
    const backCell = [first.gx - dx, first.gz - dz];
    /** @type {[number, number]} */
    const forwardCell = [last.gx + dx, last.gz + dz];
    if (
      this._landings(...backCell, tile.layer).length === 0 ||
      this._landings(...forwardCell, tile.layer).length === 0
    ) {
      throw new Error(
        `The chute at ${first.gx},${first.gz} does not land: a slide needs floor ` +
          'at both ends of its run',
      );
    }

    // Both ends read their whole column, so a chute may fall from a deck to the floor
    // under it just as a stair may climb the other way.
    const pairs = this._landingPairs(backCell, forwardCell, tile.layer);
    if (pairs.length === 0) {
      throw new Error(
        `The chute at ${first.gx},${first.gz} is level: a slide has to go down`,
      );
    }
    if (pairs.length > 1) throw this._ambiguous(first, 'chute', false);
    const { back: above, forward: below } = pairs[0];

    // Downhill sets the direction of travel, whichever way round it was authored.
    const downhill = above > below;
    const descending = downhill ? parts : [...parts].reverse();
    /** @type {import('./types.js').Direction} */
    const step = downhill ? [dx, dz] : opposite([dx, dz]);
    const top = Math.max(above, below);
    const drop = Math.abs(above - below) / (descending.length + 1);

    const bottom = Math.min(above, below);
    descending.forEach((part, index) => {
      part.run = run;
      part.dir = step;
      part.up = opposite(step);
      part.level = top - drop * (index + 1);
      // The storeys the chute spans, as a stair records them. What is built reads
      // `low` to know which floor its stonework stands on, so that a chute between
      // two upper storeys is drawn there and not down through everything below.
      part.low = bottom;
      part.high = top;
    });
    // Each tile joins whatever is behind and ahead of it along the fall, which is
    // either the next tile of the chute or the floor at one end.
    descending.forEach((part, index) => {
      const behind = index === 0 ? top : descending[index - 1].level;
      const ahead = index === descending.length - 1 ? bottom : descending[index + 1].level;
      part.joins = [behind, ahead];
    });

    return parts;
  }

  /**
   * Ties each pair of pads together.
   *
   * A pad is only a pad if it has exactly one partner, so a map with one — or three —
   * of a letter is refused rather than quietly becoming a tile that does nothing.
   */
  _derivePads() {
    for (const color of Object.keys(PAD_COLORS)) {
      const pair = this._pads.filter((tile) => tile.color === color);
      if (pair.length === 0) continue;
      if (pair.length !== 2) {
        const where = pair.map((t) => `${t.gx},${t.gz}`).join(' and ');
        throw new Error(
          `Teleport pad "${color}" appears ${pair.length} times (at ${where}): pads ` +
            'come in pairs',
        );
      }
      pair[0].partner = pair[1];
      pair[1].partner = pair[0];
    }
  }

  /**
   * Works out what every elevator serves.
   *
   * Like a ramp, a platform reads the map rather than being told: it travels
   * between the lowest and highest ground next to it. So the floors say where the
   * storeys are, and the platform goes to all of them.
   */
  _deriveElevators() {
    for (const tile of this._elevators) {
      const levels = new Set();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (const neighbour of this.column(tile.gx + dx, tile.gz + dz)) {
          if (neighbour.type === 'wall' || RAMPS.has(neighbour.type)) continue;
          if (neighbour.type === 'elevator') continue;
          levels.add(neighbour.level);
        }
      }

      if (levels.size < 2) {
        throw new Error(
          `The elevator at ${tile.gx},${tile.gz} goes nowhere: it needs floors at ` +
            'two different heights beside it',
        );
      }

      tile.low = Math.min(...levels);
      tile.high = Math.max(...levels);
      // Half a cycle apart, so a pair of platforms authored `E` and `e` pass each
      // other rather than moving as one.
      tile.phase = tile.startUp ? 0.5 : 0;
      tile.level = tile.startUp ? tile.high : tile.low;
    }
  }

  /**
   * Which way a chute runs. A run of more than one slide tile says so by its own
   * shape; a single tile is judged by the ground around it, like a stair.
   * @returns {'x'|'z'}
   */
  _chuteRun(tile) {
    const isSlide = (gx, gz) => this.get(gx, gz, tile.layer)?.type === 'slide';
    const alongX = isSlide(tile.gx - 1, tile.gz) || isSlide(tile.gx + 1, tile.gz);
    const alongZ = isSlide(tile.gx, tile.gz - 1) || isSlide(tile.gx, tile.gz + 1);

    if (alongX && alongZ) {
      throw new Error(
        `The chute at ${tile.gx},${tile.gz} bends: a slide runs in a straight line`,
      );
    }
    if (alongX) return 'x';
    if (alongZ) return 'z';
    return this._rampAxis(tile, 'slide').run;
  }

  /**
   * One tile. `layer` 0 is the ground, 1 the deck above it, and so on — so the
   * no-argument form still means what it always did.
   *
   * A column is packed rather than sparse: a cell with a hole in the ground and a
   * deck over it holds one tile, and that tile is on layer 1. So the layer has to be
   * asked for, not counted to — indexing by position finds nothing there, which is
   * how a star on a bridge over a hole used to be walked onto and never picked up.
   */
  get(gx, gz, layer = 0) {
    if (gz < 0 || gz >= this.rows || gx < 0 || gx >= this.cols) return null;
    if (layer === 0) return this.tiles[gz][gx];
    return this.columns[gz][gx].find((t) => t.layer === layer) ?? null;
  }

  /**
   * Like `get`, but for the places that have already established the tile is there —
   * inside the build loop, or on a tile handed back by `stepTarget`.
   * @param {?import('./types.js').Tile} tile
   * @returns {import('./types.js').Tile}
   */
  static known(tile) {
    if (!tile) throw new Error('expected a tile');
    return tile;
  }

  /**
   * The crate standing on a tile, if there is one. Crates are solid to everything
   * except a deliberate push from directly behind.
   * @param {?import('./types.js').Tile} tile
   */
  blockOn(tile) {
    if (!tile) return false;
    return this.occupants().some((o) => o.isBlock && o.tile === tile);
  }

  /** Everything stacked in one cell, ground first. Empty off the map. */
  column(gx, gz) {
    if (gz < 0 || gz >= this.rows || gx < 0 || gx >= this.cols) return [];
    return this.columns[gz][gx];
  }

  // Convert grid coordinates to world-space (tiles centered on the origin).
  gridToWorld(gx, gz) {
    return new THREE.Vector3(
      (gx - (this.cols - 1) / 2) * TILE_SIZE,
      0,
      (gz - (this.rows - 1) / 2) * TILE_SIZE,
    );
  }

  /**
   * Terrain-only walkability: what an enemy can cross. Walls, water and doors
   * always block — doors whether open or shut, so a patrol stays in its room —
   * ramps are not for patrols at all, and columns block only while they are raised.
   *
   * This asks about one tile. Whether a patrol can get from where it is *to* that
   * tile is `canPatrol`, which also weighs the height of the two.
   */
  isWalkable(gx, gz) {
    const t = this.get(gx, gz);
    if (!t) return false;
    if (t.type === 'wall' || t.type === 'water' || t.type === 'door') return false;
    if (t.type === 'gate') return false; // like a door: a patrol stays in its room
    if (RAMPS.has(t.type) || t.type === 'elevator') return false;
    if (t.type === 'obstacle') return !this.isRaised(t);
    return true;
  }

  findSpawn() {
    return { ...this.spawn };
  }

  /**
   * How high this tile's ground is, from the elevation authored into the map. Free
   * of the water sink, so it is the height of the *tile* rather than of whatever is
   * standing on it — which is what the camera follows.
   */
  tileHeight(gx, gz, layer = 0) {
    return this.heightOf(this.get(gx, gz, layer));
  }

  /** @param {?import('./types.js').Tile} tile */
  heightOf(tile) {
    return (tile?.level ?? 0) * LEVEL_RISE;
  }

  /**
   * Where something standing on this tile sits. That is the tile's own height, less
   * the sink if it is water — the one tile you stand *in* rather than on — and plus
   * half a step on a stair, where the step under the feet is not the middle of the
   * flight the tile's height names.
   */
  surfaceY(gx, gz, layer = 0) {
    return this.surfaceOf(this.get(gx, gz, layer));
  }

  /** @param {?import('./types.js').Tile} tile */
  surfaceOf(tile) {
    if (!tile) return 0;
    if (tile.type === 'water') return this.heightOf(tile) - WATER_SINK;
    if (tile.type === 'stair') return this.heightOf(tile) + STAIR_STAND;
    return this.heightOf(tile);
  }

  /** True when standing here means sliding on: ice, and the slides that fall. */
  isSlippery(gx, gz, layer = 0) {
    return this.isSlipperyTile(this.get(gx, gz, layer));
  }

  /** @param {?import('./types.js').Tile} tile */
  isSlipperyTile(tile) {
    return tile?.type === 'ice' || tile?.type === 'slide';
  }

  /**
   * Whether two neighbouring tiles are joined, as geometry — before anything about
   * keys or tubes is considered. This is where elevation lives:
   *
   *  - ordinary ground connects only to ground at the same height, so a ledge is a
   *    wall you can see over;
   *  - a stair connects its two ends, and only along its run — its flanks are the
   *    side of a staircase, not a way on;
   *  - a slide may be *left* only downhill, which is what makes a chute a commitment
   *    rather than a shortcut. It may be stepped on to from either end — but coming
   *    at it from the bottom only buys you a tile, since the chute then carries you
   *    straight back off it.
   */
  isConnected(from, to) {
    if (!from || !to) return false;

    /** @type {import('./types.js').Direction} */
    const move = [to.gx - from.gx, to.gz - from.gz];
    if (Math.abs(move[0]) + Math.abs(move[1]) !== 1) return false;
    if (!this._allowsMove(from, move, 'leave')) return false;
    if (!this._allowsMove(to, move, 'enter')) return false;

    // A ramp joins two known levels, and *which* of them is in play depends on the way
    // you are walking it: leaving a ramp puts you at the end you are walking towards,
    // and stepping on to one puts you at the end nearest where you set off. Asking the
    // ramp rather than measuring keeps a chute's fractional heights exact, however
    // many tiles it falls across.
    //
    // It has to be the one end rather than either, because a cell can hold a deck and
    // the floor under it: a stair whose landing is that deck would otherwise be joined
    // to the floor beneath it as well, and walking up would arrive on the ground.
    if (RAMPS.has(from.type) && !same(this._rampExit(from, move), to.level)) return false;
    if (RAMPS.has(to.type) && !same(this._rampExit(to, opposite(move)), from.level)) {
      return false;
    }
    if (RAMPS.has(from.type) || RAMPS.has(to.type)) return true;

    // Ground to ground: the heights must match. An elevator is ground whose height
    // moves, so it is joined to a storey only while it is level with it.
    return same(from.level, to.level);
  }

  /**
   * Which tile you arrive on stepping one tile in a direction, or null if nothing
   * over there joins where you are.
   *
   * This is what layers need: a cell can hold a floor and a bridge deck above it,
   * and which of them you step onto depends on which one you are level with. Since
   * two tiles in a cell are never at the same height, that is never a guess.
   */
  stepTarget(from, dx, dz) {
    if (!from) return null;
    for (const to of this.column(from.gx + dx, from.gz + dz)) {
      if (this.isConnected(from, to)) return to;
    }
    return null;
  }

  /**
   * The level at one end of a ramp: the end you reach by walking `move` along it.
   *
   * The two kinds record their ends differently, and for a reason. A stair is always
   * one tile, so its ends are the floors it joins and `low`/`high` name them. A chute
   * may be one tile of several, so `joins` holds the levels immediately *beside* it
   * along the fall — which is the next tile of the chute rather than the floor at the
   * end of the run — ordered uphill first.
   *
   * @param {import('./types.js').Tile} tile
   * @param {import('./types.js').Direction} move
   */
  _rampExit(tile, [dx, dz]) {
    const [ux, uz] = tile.up ?? [0, 0];
    const uphill = dx === ux && dz === uz;
    if (tile.type === 'slide') return tile.joins?.[uphill ? 0 : 1];
    return uphill ? tile.high : tile.low;
  }

  /**
   * Whether a ramp permits being crossed this way. Ordinary ground permits all.
   * @param {import('./types.js').Tile} tile
   * @param {import('./types.js').Direction} move
   * @param {'enter'|'leave'} role which end of the move this tile is
   */
  _allowsMove(tile, [dx, dz], role) {
    if (!RAMPS.has(tile.type)) return true;
    const alongRun = tile.run === 'x' ? dz === 0 : dx === 0;
    if (!alongRun) return false;
    // A slide only ever *goes* one way. Getting on to it from the bottom is allowed,
    // and is a mistake rather than a route: nothing leaves a chute uphill, so the
    // step is undone by the fall the moment it lands.
    if (tile.type === 'slide' && role === 'leave') {
      const [fallX, fallZ] = tile.dir ?? [0, 0];
      return dx === fallX && dz === fallZ;
    }
    return true;
  }

  /**
   * The way this tile carries whatever comes to rest on it, or null if it does not
   * carry at all. A chute has a fall of its own and imposes it, whichever end you
   * arrived from; ice has none, and hands you back your own momentum by saying null.
   *
   * @param {?import('./types.js').Tile} tile
   * @returns {?import('./types.js').Direction}
   */
  slideDirection(tile) {
    return tile?.type === 'slide' ? (tile.dir ?? null) : null;
  }

  /**
   * The tile a deliberate step from `from` lands on, or null when the step cannot be
   * taken. Two questions in one: is there anything over there joined to where you
   * stand, and does it let you in.
   */
  stepFrom(from, dx, dz, inventory) {
    const to = this.stepTarget(from, dx, dz);
    if (!to || !this.canEnterTile(to, inventory)) return null;
    return to;
  }

  /**
   * The tile a slide carries you on to, or null when the ride ends here. Everything
   * a deliberate step could reach, minus shut doors: a slide is not a decision, so
   * it must not spend a key for you. You stop against the door and open it by
   * walking into it deliberately.
   */
  slideFrom(from, dx, dz, inventory) {
    const to = this.stepTarget(from, dx, dz);
    if (!to || (to.type === 'door' && !to.open)) return null;
    // Out of control is no way to shift a crate: you stop against it.
    if (this.blockOn(to)) return null;
    return this.canEnterTile(to, inventory) ? to : null;
  }

  /**
   * Whether a patrol may take a step. Patrols keep to the level they spawned on:
   * ramps and platforms are not theirs to use, and a ledge stops them exactly as it
   * stops the player. So a raised walkway is a room of its own, the way a door
   * shuts a patrol into one.
   */
  canPatrol(fromGx, fromGz, toGx, toGz) {
    if (!this.isWalkable(toGx, toGz)) return false;
    const from = this.get(fromGx, fromGz);
    const to = this.get(toGx, toGz);
    if (!from || !to || RAMPS.has(from.type)) return false;
    if (this.blockOn(to)) return false; // a crate is a wall to a patrol
    return same(from.level, to.level);
  }

  // --- Rules ----------------------------------------------------------------

  /**
   * True when an obstacle tile's columns are currently up.
   * @param {import('./types.js').Tile} tile
   */
  isRaised(tile) {
    return tile.type === 'obstacle' && tile.group === this.phase[tile.color ?? ''];
  }

  /**
   * Can the player, carrying `inventory`, stand on this tile? Coordinates name the
   * ground layer unless a layer is given; `canEnterTile` is the same question asked
   * about a tile you already have in your hand.
   */
  canEnter(gx, gz, inventory, layer = 0) {
    return this.canEnterTile(this.get(gx, gz, layer), inventory);
  }

  /** @param {?import('./types.js').Tile} t */
  canEnterTile(t, inventory) {
    if (!t) return false;

    switch (t.type) {
      case 'wall':
        return false;
      case 'water':
        return inventory.hasTube;
      case 'door':
        return t.open || inventory.keyCount(t.color) > 0;
      case 'obstacle':
        return !this.isRaised(t);
      case 'gate':
        return t.open === true;
      default:
        return true;
    }
  }

  /**
   * Whether a crate may be pushed onto a tile. Deliberately a short list rather than
   * "everything the player may walk on": a crate on a switch would hold it down for
   * ever, a crate on a key would hide it, and a crate on a ramp or a platform is not
   * a thing this game knows how to draw. Nothing here can be spent or triggered by a
   * crate, so a push can never do something a step would have to be asked for.
   *
   * @param {?import('./types.js').Tile} tile
   */
  canBlockEnter(tile) {
    if (!tile || this.blockOn(tile)) return false;
    switch (tile.type) {
      case 'floor':
      case 'spawn':
      case 'ice':
      case 'plate':
        return true;
      case 'obstacle':
        return !this.isRaised(tile);
      case 'door':
      case 'gate':
        // Already open only: a crate cannot spend a key, and a gate that is held
        // open by the crate's own plate is a puzzle, not a bug.
        return tile.open === true;
      default:
        return false;
    }
  }

  /**
   * Spends a key to open a closed door. Called before the move starts, so the
   * panel has the whole step to swing out of the way as the player walks in.
   */
  openDoor(gx, gz, inventory, layer = 0) {
    const t = this.get(gx, gz, layer);
    if (!t || t.type !== 'door' || t.open) return false;
    if (!inventory.useKey(t.color)) return false;
    t.open = true;
    this._emit('door', t);
    return true;
  }

  /** Applies whatever the tile does once the player has arrived on it. */
  onEnter(gx, gz, inventory, layer = 0) {
    const t = this.get(gx, gz, layer);
    if (!t) return;

    switch (t.type) {
      case 'key':
        if (t.taken) return;
        t.taken = true;
        if (t.mesh) t.mesh.visible = false;
        inventory.addKey(t.color);
        this._emit('pickup', t);
        break;

      case 'tube':
        if (t.taken) return;
        t.taken = true;
        if (t.mesh) t.mesh.visible = false;
        inventory.setTube(true);
        this._emit('pickup', t);
        break;

      case 'switch':
        // A switch already held down does nothing, so standing on it is not an
        // event either — no click, no spark.
        if (this.pressSwitch(t)) this._emit('switch', t);
        break;

      case 'star':
        if (inventory.won) return;
        inventory.setWon(true);
        this._emit('pickup', t);
        this.onWin?.();
        break;
    }
  }

  /**
   * @param {'pickup'|'door'|'switch'|'teleport'} name
   * @param {import('./types.js').Tile} tile
   */
  _emit(name, tile) {
    this.onEvent?.(name, {
      kind: tile.type,
      color: tile.color,
      position: this.gridToWorld(tile.gx, tile.gz),
    });
  }

  /**
   * Presses a switch: it goes down, every other switch of its colour comes back
   * up, and the raised obstacle group of that colour swaps over.
   *
   * A switch that is already down cannot be pressed again — there is nothing
   * left in it to push — so standing on one is a no-op rather than a way to
   * toggle the columns back and forth on the spot.
   *
   * @returns {boolean} whether the press did anything
   */
  pressSwitch(tile) {
    if (tile.type !== 'switch' || tile.pressed) return false;

    const color = tile.color ?? '';
    for (const other of this._switchesOf(color)) other.pressed = false;
    tile.pressed = true;
    this.phase[color] = this.phase[color] === 'A' ? 'B' : 'A';
    return true;
  }

  isPressed(tile) {
    return tile.pressed === true;
  }

  /** Every switch tile of one colour, including any not yet pressed. */
  _switchesOf(color) {
    return this._switches.filter((t) => t.color === color);
  }

  // --- State ----------------------------------------------------------------

  _resetState() {
    // Group A is the one raised at the start of the level.
    /** @type {Record<string, string>} */
    this.phase = { red: 'A', cyan: 'A', pink: 'A' };
    // Platforms and pickup bobs are driven by this, so a retry starts them over.
    this._elapsed = 0;
    this._water?.reset();

    for (const t of this.allTiles()) {
      t.taken = false;
      t.open = false;
      // Whether a switch starts down is authored per tile, by the legend
      // character used for it.
      if (t.type === 'switch') t.pressed = t.startPressed === true;
      if (t.mesh) t.mesh.visible = true;
      if (t.swing) t.swing.rotation.y = 0;
      if (t.columns) {
        t.columns.position.y =
          t.baseY + (this.isRaised(t) ? COLUMN_RAISED_Y : COLUMN_RETRACTED_Y);
      }
      // A button, a plate's face and a gate's bars all hang off a group already
      // standing on the tile, so their heights are local ones — unlike an
      // obstacle's columns, which are placed in the world.
      if (t.button) {
        const down = this.isPressed(t);
        t.button.position.y = down ? SWITCH_DOWN_Y : SWITCH_UP_Y;
        t.button.material.color.copy(down ? t.downColor : t.idleColor);
        t.button.material.emissive.copy(down ? t.downEmissive : t.idleEmissive);
      }
      if (t.type === 'plate') t.pressed = false;
      if (t.type === 'gate') {
        t.open = false;
        if (t.bars) t.bars.position.y = GATE_SHUT_Y;
      }
      if (t.plateTop) t.plateTop.position.y = PLATE_UP_Y;
      if (t.type === 'elevator') {
        t.level = (t.startUp ? t.high : t.low) ?? t.level;
        if (t.platform) t.platform.position.y = this.heightOf(t);
      }

    }
  }

  /**
   * The far end of a pad, and the announcement that the trip happened — both ends, so
   * the sparks show where you went as well as where you were.
   *
   * @param {?import('./types.js').Tile} tile
   * @returns {?import('./types.js').Tile} where the pad leads, or null if it is not one
   */
  takePad(tile) {
    if (!tile || tile.type !== 'pad' || !tile.partner) return null;
    const partner = tile.partner;
    this._emit('teleport', tile);
    this._emit('teleport', partner);
    return partner;
  }

  /** Restores the level to its authored state, for a retry. */
  reset() {
    this._resetState();
  }

  /**
   * Throws this stage's meshes away. Called when a stage is unloaded, since the
   * next one arrives as a whole new TileMap.
   */
  dispose() {
    disposeTree(this.group);
    this.group.clear();
  }

  // --- Per-frame animation --------------------------------------------------

  update(dt) {
    this._elapsed += dt;

    // Decoration first, and on its own clock: neither of these is anything the
    // rules read, so nothing below depends on having run them.
    this._water?.update(dt);
    this._ice?.update(dt);

    const k = 1 - Math.pow(0.002, dt); // exponential smoothing factor
    // Doors get a faster factor: the panel has one 0.14s step to clear the
    // doorway the player is already walking into.
    const kDoor = 1 - Math.pow(0.00002, dt);

    this._applyPressure();

    // Platforms are game state, not decoration: where one is decides what it is
    // joined to, so this runs before anything asks to move. tickWorld already
    // updates the map first, which is what makes that true.
    for (const t of this._elevators) {
      t.level = this._elevatorLevel(t);
      if (t.platform) t.platform.position.y = this.heightOf(t);
    }

    for (const t of this.allTiles()) {
      if (t.columns) {
        const target = t.baseY + (this.isRaised(t) ? COLUMN_RAISED_Y : COLUMN_RETRACTED_Y);
        t.columns.position.y += (target - t.columns.position.y) * k;
      }

      // A door swings out of the doorway rather than blinking out of existence.
      if (t.swing) {
        const target = t.open ? DOOR_OPEN_ANGLE : 0;
        t.swing.rotation.y += (target - t.swing.rotation.y) * kDoor;
      }

      // A gate's bars drop into the floor while it is held open, and rise back
      // into the gateway when it shuts. Bars are the only thing that says which
      // way is through, so this gets the door's faster factor too: the gateway
      // must look clear by the time the player walks into it.
      if (t.bars) {
        const target = t.open ? GATE_OPEN_Y : GATE_SHUT_Y;
        t.bars.position.y += (target - t.bars.position.y) * kDoor;
      }

      // A held plate sinks flush into its recess, which is what says the weight
      // on it counts.
      if (t.plateTop) {
        const target = t.pressed ? PLATE_DOWN_Y : PLATE_UP_Y;
        t.plateTop.position.y += (target - t.plateTop.position.y) * k;
      }

      // A pressed button sinks into its plate and goes distinctly darker —
      // colour is what actually reads at this camera distance.
      if (t.button) {
        const pressed = this.isPressed(t);
        const target = pressed ? SWITCH_DOWN_Y : SWITCH_UP_Y;
        t.button.position.y += (target - t.button.position.y) * k;
        t.button.material.color.lerp(pressed ? t.downColor : t.idleColor, k);
        t.button.material.emissive.lerp(pressed ? t.downEmissive : t.idleEmissive, k);
      }

      // Pickups bob so they read as collectable. Spinning happens on an inner
      // group, so a tilted pickup turns about the vertical axis instead of
      // tumbling — a flat torus spun directly would go edge-on and vanish.
      if (t.mesh && t.bobBase !== undefined && !t.taken) {
        t.mesh.position.y = t.bobBase + Math.sin(this._elapsed * 2 + t.gx + t.gz) * 0.08;
        if (t.spinner) t.spinner.rotation.y += dt * 1.4;
      }

    }
  }

  /**
   * Reads the plates, and opens the gates they hold.
   *
   * This is state, not decoration, like a platform's height: it runs at the top of
   * the frame, from where everything stands at that moment, so a gate is open for
   * exactly as long as something is on a plate of its colour — plus as long as
   * something is standing in the gateway, which is what stops a gate ever shutting on
   * whoever let the plate go.
   */
  _applyPressure() {
    if (!this._plates.length && !this._gates.length) return;
    const standing = this.occupants();
    const held = (tile) => standing.some((o) => o.tile === tile);

    for (const plate of this._plates) plate.pressed = held(plate);

    for (const gate of this._gates) {
      const anyPlate = this._plates.some((p) => p.color === gate.color && p.pressed);
      gate.open = anyPlate || held(gate);
    }
  }

  /**
   * Where a platform is in its cycle: it dwells at the bottom, rises, dwells at the
   * top and falls, a quarter of the period each. The dwells are exact, so a platform
   * standing at a storey counts as level with it; the travel is eased, so it sets
   * off and arrives gently rather than snapping into motion.
   */
  _elevatorLevel(tile) {
    const cycle = (this._elapsed / ELEVATOR_PERIOD + tile.phase) % 1;
    const ease = (t) => t * t * (3 - 2 * t);

    if (cycle < 0.25) return tile.low;
    if (cycle < 0.5) {
      return tile.low + (tile.high - tile.low) * ease((cycle - 0.25) * 4);
    }
    if (cycle < 0.75) return tile.high;
    return tile.high - (tile.high - tile.low) * ease((cycle - 0.75) * 4);
  }

  // --- Mesh construction ----------------------------------------------------

  _build() {
    const floorGeo = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.2, TILE_SIZE * 0.98);

    // One wall geometry per distinct height, shared by every wall that tall.
    const wallGeos = new Map();
    const wallGeoFor = (height) => {
      if (!wallGeos.has(height)) {
        wallGeos.set(height, new THREE.BoxGeometry(TILE_SIZE, height, TILE_SIZE));
      }
      return wallGeos.get(height);
    };
    const waterGeo = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.12, TILE_SIZE * 0.98);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.9 });
    const floorMatAlt = new THREE.MeshStandardMaterial({ color: 0x356a42, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a6270, roughness: 0.8 });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2b6fb0,
      roughness: 0.3,
      metalness: 0.1,
    });
    // Ice reads as ice by being the one bright, glossy thing on the floor: pale,
    // almost no roughness, and faintly lit so it stands out against the grass.
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0xcfe8f5,
      roughness: 0.06,
      metalness: 0.35,
      emissive: 0x24485c,
    });

    // Stone for the sides of raised ground and the frame of a chute, so height
    // reads as built rather than as grass floating in the air.
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a5361, roughness: 0.85 });

    // Raised ground is a plinth rather than a slab, so a plateau has sides. One
    // geometry per distinct height, shared by every tile that stands that tall.
    const plinths = new Map();
    const plinthGeo = (height) => {
      if (!plinths.has(height)) {
        plinths.set(
          height,
          new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.2 + height, TILE_SIZE * 0.98),
        );
      }
      return plinths.get(height);
    };

    // Water and ice are collected as they are met and animated together
    // afterwards: one moving surface for all the water on the map, one shine for
    // all the ice, rather than a piece of each per tile.
    /** @type {import('./water.js').WaterTile[]} */
    const waterTiles = [];
    /** @type {import('./ice.js').IceTile[]} */
    const iceTiles = [];

    for (const tile of this.allTiles()) {
      const { gx: x, gz: z } = tile;
      const world = this.gridToWorld(x, z);
      // Everything that sits on this tile — a door, a button, a pickup's bob —
      // is placed relative to the height of its ground.
      const height = this.heightOf(tile);
      tile.baseY = height;
      world.y = height;

      if (tile.type === 'elevator') {
        // Guides first, standing still, then the platform that rides between
        // them — the platform is its own object so `update` can move it.
        const guides = buildElevatorGuides(tile, stoneMat);
        guides.position.set(world.x, 0, world.z);
        this.group.add(guides);

        const platform = buildPlatform(this._litMaterial(0x7f8ea3, 0.12), stoneMat);
        platform.position.set(world.x, height, world.z);
        tile.platform = platform;
        this.group.add(platform);
        continue;
      }

      if (tile.type === 'wall') {
        // A wall stands above the ground beside it, or a plateau comes out flush with
        // the wall that is meant to be holding it in.
        const top = Math.max(WALL_MIN_HEIGHT, this._tallestNeighbour(tile) + WALL_PARAPET);
        const mesh = new THREE.Mesh(wallGeoFor(top), wallMat);
        mesh.position.set(world.x, top / 2, world.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        continue;
      }

      if (tile.type === 'water') {
        // The slab is the body of the water — what fills the hole and what is
        // seen through the surface. The surface itself is built below, and moves.
        const mesh = new THREE.Mesh(waterGeo, waterMat);
        mesh.position.set(world.x, height - 0.15, world.z);
        mesh.receiveShadow = true;
        this.group.add(mesh);
        waterTiles.push({ gx: x, gz: z, x: world.x, y: height, z: world.z });
        continue;
      }

      if (tile.type === 'stair') {
        const stair = buildStair(tile, this._litMaterial(0x6b7686, 0.08));
        stair.position.set(world.x, 0, world.z);
        this.group.add(stair);
        continue;
      }

      if (tile.type === 'slide') {
        const slide = buildSlide(tile, this._chuteDrop(tile), iceMat, stoneMat);
        slide.position.set(world.x, 0, world.z);
        this.group.add(slide);
        continue;
      }

      // Every other tile gets ground underneath, so opening a door or retracting
      // columns reveals something to stand on rather than a hole. Ice is that
      // ground rather than something on top of it: you glide across the level,
      // not up onto anything.
      const flat = height === 0;
      const mat = tile.type === 'ice' ? iceMat : (x + z) % 2 === 0 ? floorMat : floorMatAlt;
      if (tile.type === 'ice') iceTiles.push({ x: world.x, y: height, z: world.z });

      if (tile.layer > 0) {
        // Anything off the ground is a span on legs. Not solid stone down to the
        // floor plane: a cell that is a space on the grid below is a space, and
        // filling it in would deny what the map plainly says — which is the whole
        // reason height is drawn on the layer it belongs to.
        const deck = buildDeck(height, mat, stoneMat);
        deck.position.set(world.x, 0, world.z);
        this.group.add(deck);
      } else {
        const floor = new THREE.Mesh(flat ? floorGeo : plinthGeo(height), mat);
        floor.position.set(world.x, flat ? -0.1 : height - (0.2 + height) / 2, world.z);
        floor.receiveShadow = true;
        floor.castShadow = !flat;
        this.group.add(floor);
      }

      const feature = this._buildFeature(tile, world);
      if (feature) this.group.add(feature);

    }

    if (waterTiles.length) {
      this._water = new WaterSurface(waterTiles);
      this.group.add(this._water.group);
    }

    if (iceTiles.length) {
      this._ice = new IceShimmer(iceTiles);
      this.group.add(this._ice.group);
    }
  }

  /**
   * The height of the tallest ground next to a tile, for sizing a wall.
   *
   * Ground only: a ramp is measured by the floors it joins, not by its own halfway
   * height, or the wall beside a staircase would come out a hand taller than the wall
   * beside it for no reason a player could see. A platform counts for the top of its
   * travel, since that is where it will be standing when it matters.
   */
  _tallestNeighbour(tile) {
    let tallest = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const neighbour of this.column(tile.gx + dx, tile.gz + dz)) {
        if (neighbour.type === 'wall' || RAMPS.has(neighbour.type)) continue;
        const level = neighbour.type === 'elevator' ? (neighbour.high ?? 0) : neighbour.level;
        tallest = Math.max(tallest, level * LEVEL_RISE);
      }
    }
    return tallest;
  }

  /**
   * How far one tile of a chute falls, in world units. Read off what derivation
   * already worked out — `joins` is [behind, ahead] along the fall, so the drop is
   * the tile's own level less what is ahead of it, whether that is the next tile of
   * the chute or the floor it lands on, and on whichever layer that floor lives.
   */
  _chuteDrop(tile) {
    return (tile.level - tile.joins[1]) * LEVEL_RISE;
  }

  /** Builds the mesh that sits on top of a tile's floor, if it has one. */
  _buildFeature(tile, world) {
    switch (tile.type) {
      case 'door': {
        const door = buildDoor(
          this._litMaterial(KEY_COLORS[tile.color], 0.35),
          this._litMaterial(new THREE.Color(KEY_COLORS[tile.color]).multiplyScalar(0.55), 0.3),
        );
        door.group.position.set(world.x, world.y, world.z);
        door.group.rotation.y = this._doorFacing(tile);
        tile.mesh = door.group;
        tile.swing = door.swing;
        return door.group;
      }

      case 'obstacle': {
        const columns = new THREE.Group();
        const geo = new THREE.BoxGeometry(0.22, 1.0, 0.22);
        const mat = this._litMaterial(SWITCH_COLORS[tile.color], 0.3);
        for (const [ox, oz] of [
          [-0.2, -0.2],
          [0.2, -0.2],
          [-0.2, 0.2],
          [0.2, 0.2],
        ]) {
          const column = new THREE.Mesh(geo, mat);
          column.position.set(ox, 0, oz);
          column.castShadow = true;
          columns.add(column);
        }
        columns.position.set(world.x, world.y + COLUMN_RAISED_Y, world.z);
        tile.columns = columns;
        return columns;
      }

      case 'pad': {
        const group = new THREE.Group();
        group.position.set(world.x, world.y, world.z);

        // A pale face, so a pad reads as a bright patch of nothing-in-particular...
        const face = new THREE.Mesh(
          new THREE.BoxGeometry(TILE_SIZE * 0.88, 0.05, TILE_SIZE * 0.88),
          new THREE.MeshStandardMaterial({
            color: 0xeef3fb,
            roughness: 0.35,
            emissive: 0x30384a,
          }),
        );
        face.position.y = 0.03;
        face.receiveShadow = true;
        group.add(face);

        // ...and a square outline in the pair's own colour, which is the only thing
        // that says where it goes: find the other one wearing this colour.
        const edge = this._litMaterial(PAD_COLORS[tile.color ?? 'a'], 0.6);
        const long = TILE_SIZE * 0.88;
        for (const [ox, oz, sx, sz] of [
          [0, -0.44, long, 0.08],
          [0, 0.44, long, 0.08],
          [-0.44, 0, 0.08, long],
          [0.44, 0, 0.08, long],
        ]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.07, sz), edge);
          bar.position.set(ox, 0.05, oz);
          group.add(bar);
        }

        tile.mesh = group;
        return group;
      }

      case 'plate': {
        const group = new THREE.Group();
        group.position.set(world.x, world.y, world.z);

        // A recess, so a plate reads as set into the floor rather than dropped on it.
        const recess = new THREE.Mesh(
          new THREE.BoxGeometry(TILE_SIZE * 0.9, 0.05, TILE_SIZE * 0.9),
          new THREE.MeshStandardMaterial({ color: 0x2b3240, roughness: 0.9 }),
        );
        recess.position.y = 0.012;
        recess.receiveShadow = true;
        group.add(recess);

        const face = new THREE.Mesh(
          new THREE.BoxGeometry(TILE_SIZE * 0.78, 0.06, TILE_SIZE * 0.78),
          this._litMaterial(SWITCH_COLORS[tile.color ?? 'red'], 0.35),
        );
        face.position.y = PLATE_UP_Y;
        face.receiveShadow = true;
        group.add(face);

        tile.plateTop = face;
        tile.mesh = group;
        return group;
      }

      case 'gate': {
        const group = new THREE.Group();
        group.position.set(world.x, world.y, world.z);
        const material = this._litMaterial(SWITCH_COLORS[tile.color ?? 'red'], 0.3);

        // The bars ride in a group so the whole set can drop into the floor.
        const bars = new THREE.Group();
        bars.position.y = GATE_SHUT_Y;
        for (const offset of [-0.3, 0, 0.3]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.94, 0.12), material);
          bar.position.x = offset;
          bar.castShadow = true;
          bars.add(bar);
        }
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.12, 0.16), material);
        head.position.y = 0.46;
        bars.add(head);
        group.add(bars);
        group.rotation.y = this._doorFacing(tile);

        tile.bars = bars;
        tile.mesh = group;
        return group;
      }

      case 'switch': {
        const group = new THREE.Group();
        group.position.set(world.x, world.y, world.z);

        // A grey plate a little smaller than the tile, so the button reads as a
        // fitting rather than something dropped on the floor.
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(SWITCH_BASE_SIZE, 0.06, SWITCH_BASE_SIZE),
          new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.85 }),
        );
        base.position.y = 0.02;
        base.receiveShadow = true;
        group.add(base);

        const button = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.08, 20),
          this._litMaterial(SWITCH_COLORS[tile.color], 0.45),
        );
        button.position.y = SWITCH_UP_Y;
        button.castShadow = true;
        button.receiveShadow = true;
        group.add(button);

        // _litMaterial hands out a fresh material per call, so darkening this
        // one on press affects only this switch.
        tile.button = button;
        tile.idleColor = button.material.color.clone();
        tile.idleEmissive = button.material.emissive.clone();
        tile.downColor = tile.idleColor.clone().multiplyScalar(0.4);
        tile.downEmissive = tile.idleEmissive.clone().multiplyScalar(0.2);

        tile.mesh = group;
        return group;
      }

      case 'key': {
        const art = buildKey(this._litMaterial(KEY_COLORS[tile.color], 0.5));
        // Upright, so it turns on the spot like a collectable. Leaned towards
        // the camera and rolled slightly so the bow's plane is never parallel to
        // the view — the one angle at which a ring would go invisible.
        art.rotation.set(0.22, 0, 0.14);
        return this._pickup(tile, art, world, 0.5);
      }

      case 'tube': {
        // Left flat and unspun: from this camera a flat torus always reads as a
        // ring, and spinning it would only make it disappear at each quarter.
        const art = buildTube(this._litMaterial(0xff7a45, 0.4));
        const holder = this._pickup(tile, art, world, 0.35);
        tile.spinner = null;
        return holder;
      }

      case 'star': {
        // Left upright and untilted: a star leaning over is a star that has fallen
        // off something. The spinner turns it about the vertical, so it stands the
        // way it is drawn and turns on the spot.
        const art = buildStar(this._litMaterial(0xffe066, 0.7));
        art.castShadow = true;
        return this._pickup(tile, art, world, 0.6);
      }

      default:
        return null;
    }
  }

  /**
   * Wraps a pickup's art in holder -> spinner -> art. The holder carries the
   * position and bob, the spinner turns about world Y, so any tilt baked into
   * the art survives the rotation instead of tumbling with it.
   */
  _pickup(tile, art, world, height) {
    const holder = new THREE.Group();
    const spinner = new THREE.Group();
    spinner.add(art);
    holder.add(spinner);
    holder.position.set(world.x, world.y + height, world.z);
    tile.bobBase = world.y + height;
    tile.spinner = spinner;
    tile.mesh = holder;
    return holder;
  }

  /**
   * Which way a door's slab must face. A door fills a gap in a wall, so the slab
   * has to span that gap: whichever pair of neighbours is solid tells you which
   * way the passage runs.
   * @returns {number} yaw in radians
   */
  _doorFacing(tile) {
    const solid = (gx, gz) => {
      const t = this.get(gx, gz);
      return !t || t.type === 'wall';
    };
    const acrossX = solid(tile.gx - 1, tile.gz) && solid(tile.gx + 1, tile.gz);
    const acrossZ = solid(tile.gx, tile.gz - 1) && solid(tile.gx, tile.gz + 1);
    // A door built along z (its default) blocks a passage running east-west.
    if (acrossZ && !acrossX) return Math.PI / 2;
    return 0;
  }

  /** Standard material with a matching emissive tint so colours stay readable. */
  _litMaterial(color, emissiveStrength) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.1,
      emissive: new THREE.Color(color).multiplyScalar(emissiveStrength),
    });
  }
}

// How far a door swings open: a little past 90 degrees, so it ends up flat
// against the wall beside it rather than half in the doorway.
const DOOR_OPEN_ANGLE = -1.75;

/**
 * A door: a thin panel standing upright in the tile, hinged at one edge.
 *
 * The hinge matters. A panel that pivots about the middle of the tile sweeps
 * through the very square the player is walking into; hinged at the edge it
 * swings away from them instead.
 *
 * @returns {{group: THREE.Group, swing: THREE.Group}} the tile-level group, and
 *   the inner group whose rotation.y animates from 0 to DOOR_OPEN_ANGLE.
 */
function buildDoor(material, panelMaterial) {
  const group = new THREE.Group();

  const swing = new THREE.Group();
  swing.position.x = -0.46; // the hinge, at the tile's edge
  group.add(swing);

  const panel = new THREE.Group();
  panel.position.x = 0.46; // back to the tile's centre
  swing.add(panel);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.94, 0.12), material);
  slab.position.y = 0.49;
  slab.castShadow = true;
  slab.receiveShadow = true;
  panel.add(slab);

  // A recessed rectangle, slightly darker and slightly proud of the slab, which
  // is what stops it reading as a plain coloured wall.
  const inset = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.62, 0.14), panelMaterial);
  inset.position.y = 0.55;
  panel.add(inset);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10),
    panelMaterial,
  );
  handle.rotation.x = Math.PI / 2; // laid along z, poking out of the panel face
  handle.position.set(0.32, 0.48, 0);
  panel.add(handle);

  return { group, swing };
}

// How thick a deck is. The walking surface sits at the level, so the slab hangs below
// it, and every bit of thickness is headroom taken from whatever passes underneath.
// The arithmetic is tight and deliberate: a walker is 0.9 tall, the walk bob lifts it
// 0.05 at the top of a stride, and a storey is 1.0 — so 0.05 is what a deck may have
// if a player is to pass beneath one without ever wearing it as a hat.
const DECK_THICKNESS = 0.05;

// How thick one step is. A stair is four slabs hanging in the air rather than blocks
// standing on anything, so this is the whole of a step's vertical extent — which is
// what keeps a stair out of the storey underneath it however high up it is.
const STAIR_TREAD_THICKNESS = 0.1;

// A chute's ice bed, and the stone soffit closing it from below. Named because what
// goes under the chute is positioned off the underside of the bed, and two literals a
// dozen lines apart is how it came to be poking through in the first place.
const SLIDE_BED = 0.08;
const SLIDE_SOFFIT = 0.14;

/**
 * How far a chute's stonework sinks into the floor it lands on, so that nothing
 * floats. It stops there rather than at the world floor plane: a ramp belongs to the
 * storey it starts from, and a chute between the third floor and the second is drawn
 * on the second — not as a column of masonry through everything under it, blocking
 * out rooms that have their own ground.
 */
const CHUTE_FOOTING = 0.2;

/**
 * A staircase filling one tile: four steps climbing from the low end to the high one,
 * each a slab floating in the air. Nothing holds them up and nothing fills the gaps
 * between them, so a stair occupies only the band of height it actually climbs and
 * the storey underneath is left alone.
 *
 * One material for all four: a step in a different grey from its neighbours reads as
 * a different thing rather than as the same staircase.
 *
 * Each step is at the height of the climb where it *sits* along the run — so the
 * flight straddles the tile's own level rather than starting at it, and the middle of
 * the staircase is the middle of the climb. That is what `STAIR_STAND` is measured
 * against: the player stands on the step under their feet, not on the flight's mean.
 *
 * Built with local +z as the way up, then turned to face the tile's own `up`.
 */
function buildStair(tile, treadMaterial) {
  const group = new THREE.Group();
  const lowY = tile.low * LEVEL_RISE;
  const rise = (tile.high - tile.low) * LEVEL_RISE;
  const depth = (TILE_SIZE * 0.98) / STAIR_TREADS;

  for (let i = 0; i < STAIR_TREADS; i++) {
    const top = lowY + (rise * (i + 0.5)) / STAIR_TREADS;
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE * 0.98, STAIR_TREAD_THICKNESS, depth),
      treadMaterial,
    );
    tread.name = 'stair-tread';
    tread.position.set(
      0,
      top - STAIR_TREAD_THICKNESS / 2,
      -TILE_SIZE / 2 + depth * (i + 0.5),
    );
    tread.castShadow = true;
    tread.receiveShadow = true;
    group.add(tread);
  }

  group.rotation.y = Math.atan2(tile.up[0], tile.up[1]);
  return group;
}

/**
 * One tile of a chute: a slab tilted to match the fall, a rail down each side — which
 * is what tells a chute apart from ice at a glance, since both are the same bright
 * glassy material — and, underneath, a soffit along the slab with a plinth beneath it.
 *
 * Built with local +z as downhill, then turned to face the tile's own `dir`.
 */
function buildSlide(tile, drop, surfaceMaterial, frameMaterial) {
  const group = new THREE.Group();
  const centre = tile.level * LEVEL_RISE;
  // The slab spans one tile along the fall, so its tilt is the fall over a tile.
  const tilt = Math.atan2(drop, TILE_SIZE);
  const length = Math.hypot(TILE_SIZE, drop) * 1.02;
  // How far the downhill end of a tilted slab sits below its middle. `centre` is the
  // height of the middle, so this is the difference between "the height of the chute"
  // and the height of the lowest ice in the tile — which is what anything underneath
  // has to clear.
  const fall = (length / 2) * Math.sin(tilt);

  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE * 0.86, SLIDE_BED, length),
    surfaceMaterial,
  );
  bed.name = 'slide-bed';
  bed.rotation.x = tilt;
  bed.position.y = centre;
  bed.receiveShadow = true;
  group.add(bed);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, length), frameMaterial);
    rail.name = 'slide-rail';
    rail.rotation.x = tilt;
    rail.position.set(side * TILE_SIZE * 0.45, centre + 0.06, 0);
    rail.castShadow = true;
    group.add(rail);
  }

  // The stone under the chute is in two parts, and both of them stop below the ice.
  //
  // It was one flat-topped block reaching up to `centre` — but `centre` is the height
  // of the *middle* of a tilted slab, so across the whole downhill half of the tile the
  // block stood proud of the bed: square-edged, and in the same stone as a stair tread.
  // It read as a step cut through the chute, which is exactly what it looked like.
  //
  // So: a soffit tilted with the bed, which is what actually closes the underside, and
  // a plinth below that, whose flat top is level with the soffit's lowest corner and
  // therefore never reaches the ice anywhere.
  const soffit = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE * 0.86, SLIDE_SOFFIT, length),
    frameMaterial,
  );
  soffit.name = 'slide-soffit';
  soffit.rotation.x = tilt;
  soffit.position.y = centre - SLIDE_BED / 2 - SLIDE_SOFFIT / 2;
  soffit.receiveShadow = true;
  group.add(soffit);

  const plinthTop = centre - SLIDE_BED / 2 - SLIDE_SOFFIT - fall;
  // Down to the floor of the storey the chute lands on, and no further.
  const plinthHeight = plinthTop - tile.low * LEVEL_RISE + CHUTE_FOOTING;
  // A chute that starts low and falls steeply leaves no room for one, and a box of
  // negative height is a box turned inside out.
  if (plinthHeight > 0.02) {
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE * 0.8, plinthHeight, TILE_SIZE * 0.9),
      frameMaterial,
    );
    plinth.name = 'slide-plinth';
    plinth.position.y = plinthTop - plinthHeight / 2;
    plinth.receiveShadow = true;
    group.add(plinth);
  }

  group.rotation.y = Math.atan2(tile.dir[0], tile.dir[1]);
  return group;
}

/**
 * One tile of a deck: a span with legs. A bridge is the one piece of ground where
 * what is underneath matters, so it is built as a slab held up at the corners rather
 * than as a plinth of solid stone.
 */
function buildDeck(height, surfaceMaterial, legMaterial) {
  const group = new THREE.Group();

  const span = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE * 0.98, DECK_THICKNESS, TILE_SIZE * 0.98),
    surfaceMaterial,
  );
  span.position.y = height - DECK_THICKNESS / 2;
  span.castShadow = true;
  span.receiveShadow = true;
  group.add(span);

  // Legs down to below the floor plane, on the diagonal so a run of deck tiles
  // reads as a trestle rather than a solid wall of posts.
  const legHeight = height + 0.08;
  for (const [ox, oz] of [
    [-0.36, -0.36],
    [0.36, 0.36],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, legHeight, 0.1), legMaterial);
    leg.position.set(ox, height - DECK_THICKNESS - legHeight / 2, oz);
    leg.castShadow = true;
    group.add(leg);
  }

  return group;
}

/**
 * The rails an elevator runs in: four corner posts spanning everything it serves, so
 * a platform parked at the top still shows where it comes back down to.
 */
function buildElevatorGuides(tile, material) {
  const group = new THREE.Group();
  const bottom = tile.low * LEVEL_RISE;
  const top = tile.high * LEVEL_RISE;
  const height = top - bottom + 0.3;

  for (const [ox, oz] of [
    [-0.42, -0.42],
    [0.42, -0.42],
    [-0.42, 0.42],
    [0.42, 0.42],
  ]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, 0.08), material);
    post.position.set(ox, bottom - 0.2 + height / 2, oz);
    post.castShadow = true;
    group.add(post);
  }

  return group;
}

/** The platform itself: a plate with a lip, so it reads as something to stand on. */
function buildPlatform(plateMaterial, lipMaterial) {
  const group = new THREE.Group();

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE * 0.82, 0.1, TILE_SIZE * 0.82),
    plateMaterial,
  );
  plate.position.y = -0.05;
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);

  for (const [ox, oz, sx, sz] of [
    [0, -0.4, TILE_SIZE * 0.82, 0.06],
    [0, 0.4, TILE_SIZE * 0.82, 0.06],
    [-0.4, 0, 0.06, TILE_SIZE * 0.82],
    [0.4, 0, 0.06, TILE_SIZE * 0.82],
  ]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.08, sz), lipMaterial);
    lip.position.set(ox, -0.02, oz);
    group.add(lip);
  }

  return group;
}

/**
 * A key, standing upright so it turns like a collectable rather than lying face
 * up. Every part is built to survive being seen edge-on, since a key spun about
 * the vertical axis passes through that view twice per turn: the shaft is round
 * rather than a flat box, and the bow is fat enough to still read as a ring of
 * metal from the side.
 */
function buildKey(material) {
  const group = new THREE.Group();

  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.055, 8, 18), material);
  bow.position.y = 0.17;
  group.add(bow);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8),
    material,
  );
  shaft.position.y = -0.1;
  group.add(shaft);

  // Teeth on both sides, so the silhouette says "key" from either profile.
  for (const x of [0.075, -0.075]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.055, 0.055), material);
    tooth.position.set(x, x > 0 ? -0.19 : -0.26, 0);
    group.add(tooth);
  }

  return group;
}

/**
 * The star: five points, standing upright in the vertical plane.
 *
 * Built by hand rather than out of a stock solid, because the stock solids are all
 * blobs — an octahedron is a gem, not a star. The outline is the ten-point rim every
 * drawn star has, alternating far and near; the solidity comes from raising a ridge
 * to a point at the front and the back of the middle, so each of the ten rim edges
 * becomes two facets meeting along a crease. That is what makes it read as a star
 * rather than as a cut-out while it turns: the creases catch the light one after
 * another, so the shape is legible even at the moment it is nearly edge-on.
 *
 * @param {THREE.Material} material
 */
function buildStar(material) {
  const OUTER = 0.34; // to the tips
  const INNER = 0.145; // to the notches between them
  const RIDGE = 0.075; // how far the ridge stands out either side

  // Ten rim points, the first one straight up: that is what makes it upright, and
  // the rest follow at even tenths of the turn.
  const rim = Array.from({ length: 10 }, (_, i) => {
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? OUTER : INNER;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });

  // Two triangles per rim edge — one to the front ridge point, one to the back —
  // wound so both face outwards. Unindexed, so every facet gets its own flat normal.
  /** @type {number[]} */
  const positions = [];
  for (let i = 0; i < rim.length; i++) {
    const [ax, ay] = rim[i];
    const [bx, by] = rim[(i + 1) % rim.length];
    positions.push(ax, ay, 0, bx, by, 0, 0, 0, RIDGE);
    positions.push(bx, by, 0, ax, ay, 0, 0, 0, -RIDGE);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

/** The inner tube: a flat-lying torus. */
function buildTube(material) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 10, 20), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export { buildTube };
