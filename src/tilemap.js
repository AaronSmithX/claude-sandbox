import * as THREE from 'three';
import { disposeTree } from './dispose.js';

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

/**
 * Map legend. Case convention: an uppercase letter is the thing that blocks
 * you, its lowercase partner is the state that doesn't.
 *
 *   #  wall          .  floor         ~  water        @  player spawn
 *   *  star (goal)   O  inner tube (lets you cross water)
 *   i  ice — step onto it and you keep going that way until you are off it
 *
 *   '  floor one level up      "  floor two levels up
 *   /  stair — joins two floors one level apart, walkable both ways
 *   \  slide — a chute you can only enter at the top, and only ride down
 *
 *   g v w   keys  — gold, violet, white
 *   G V W   doors — gold, violet, white (a key opens only its own colour)
 *
 *   1 2 3   switches that start up   — red, cyan, pink
 *   4 5 6   switches that start down — red, cyan, pink (1 pairs with 4, and so on)
 *   X Y Z   obstacle columns that start RAISED    — red, cyan, pink
 *   x y z   obstacle columns that start RETRACTED — red, cyan, pink
 *
 *   | -     enemy patrolling vertically / horizontally (reverses when blocked)
 *   ) (     enemy turning clockwise / anticlockwise when blocked
 *
 * Obstacles belong to group A (uppercase) or group B (lowercase). Stepping on a
 * switch swaps which group of its colour is raised, so one press both opens and
 * closes. Only one switch of a colour is down at a time: pressing one lets every
 * other switch of that colour back up, and a switch that is already down does
 * nothing when you stand on it. So give a colour at least two switches, or the
 * one it has will be spent after a single press.
 */
export const LEGEND = {
  '#': { type: 'wall' },
  '.': { type: 'floor' },
  '~': { type: 'water' },
  i: { type: 'ice' },
  // Ground that sits higher up. One apostrophe per level, so the map shows its
  // own contours: a run of `'` reads as raised, `"` as raised further.
  "'": { type: 'floor', level: 1 },
  '"': { type: 'floor', level: 2 },
  // Ramps. Both work out where they run and how far they climb from the ground on
  // either side of them, so a map never has to state it twice.
  '/': { type: 'stair' },
  '\\': { type: 'slide' },
  '@': { type: 'spawn' },
  '*': { type: 'star' },
  O: { type: 'tube' },
  g: { type: 'key', color: 'gold' },
  v: { type: 'key', color: 'violet' },
  w: { type: 'key', color: 'white' },
  G: { type: 'door', color: 'gold' },
  V: { type: 'door', color: 'violet' },
  W: { type: 'door', color: 'white' },
  1: { type: 'switch', color: 'red' },
  2: { type: 'switch', color: 'cyan' },
  3: { type: 'switch', color: 'pink' },
  // The same three switches, but already held down at the start of the level.
  4: { type: 'switch', color: 'red', startPressed: true },
  5: { type: 'switch', color: 'cyan', startPressed: true },
  6: { type: 'switch', color: 'pink', startPressed: true },
  X: { type: 'obstacle', color: 'red', group: 'A' },
  Y: { type: 'obstacle', color: 'cyan', group: 'A' },
  Z: { type: 'obstacle', color: 'pink', group: 'A' },
  x: { type: 'obstacle', color: 'red', group: 'B' },
  y: { type: 'obstacle', color: 'cyan', group: 'B' },
  z: { type: 'obstacle', color: 'pink', group: 'B' },
  // Enemy spawns. The tile itself is ordinary floor; the pattern says which way
  // the enemy turns when something blocks its path.
  '|': { type: 'floor', enemy: 'vertical' },
  '-': { type: 'floor', enemy: 'horizontal' },
  ')': { type: 'floor', enemy: 'clockwise' },
  '(': { type: 'floor', enemy: 'counterclockwise' },
};

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

// How far one level of elevation lifts a tile. Half a tile: enough that a plateau
// reads as being above the floor at this camera angle, and low enough that a
// single stride up onto a stair still looks like a step rather than a climb.
export const LEVEL_RISE = 0.5;

// The tile types that join two heights. Neither is ground you can arrive at from
// the side: you take them along their run or not at all.
const RAMPS = new Set(['stair', 'slide']);

/** The opposite direction. `|| 0` because negating a zero gives -0. */
const opposite = ([dx, dz]) => [-dx || 0, -dz || 0];

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
   * @param {string[]} map rows of legend characters; every row must be the same
   *   length. Production passes a stage's `rows`; tests pass miniature levels.
   * @param {{build?: boolean}} [options] `build: false` skips all mesh
   *   construction, which is how the headless tests run. Every mesh write in
   *   this class is guarded, so the rules behave identically either way.
   */
  constructor(map, { build = true } = {}) {
    this.map = map;
    this.rows = map.length;
    this.cols = map[0].length;
    this.build = build;
    this.group = new THREE.Group();
    this.spawn = { gx: 1, gz: 1 };

    // Called with no arguments when the player reaches the star.
    this.onWin = null;

    /**
     * Called as things happen on the level, so effects can be hung off the rules
     * without the rules knowing about particles or sound.
     * @type {?(name: 'pickup'|'door'|'switch', detail: object) => void}
     */
    this.onEvent = null;

    this._elapsed = 0;
    this._parse();
    if (build) this._build();
    this._resetState();
  }

  // --- Map data -------------------------------------------------------------

  _parse() {
    this.tiles = [];
    this.enemySpawns = [];
    // Kept flat, because pressing a switch has to reach every other switch of
    // its colour wherever it is on the map.
    this._switches = [];
    for (let z = 0; z < this.rows; z++) {
      if (this.map[z].length !== this.cols) {
        throw new Error(
          `Map row ${z} is ${this.map[z].length} characters, expected ${this.cols}`,
        );
      }
      const row = [];
      for (let x = 0; x < this.cols; x++) {
        const char = this.map[z][x];
        const def = LEGEND[char];
        if (!def) throw new Error(`Unknown map character "${char}" at ${x},${z}`);
        if (def.type === 'spawn') this.spawn = { gx: x, gz: z };
        if (def.enemy) this.enemySpawns.push({ gx: x, gz: z, pattern: def.enemy });
        const tile = { level: 0, ...def, gx: x, gz: z };
        if (tile.type === 'switch') this._switches.push(tile);
        row.push(tile);
      }
      this.tiles.push(row);
    }

    this._deriveRamps();
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

    for (const tile of this.tiles.flat()) {
      if (tile.type === 'stair') this._deriveStair(tile);
      if (tile.type === 'slide' && !chutes.has(tile)) {
        for (const part of this._deriveChute(tile)) chutes.add(part);
      }
    }
  }

  /** The level of a tile you can stand on, or null for walls and ramps. */
  _groundLevel(gx, gz) {
    const t = this.get(gx, gz);
    if (!t || t.type === 'wall' || RAMPS.has(t.type)) return null;
    return t.level;
  }

  /**
   * The axis a ramp runs along, judged by the ground at its ends: the one where
   * both sides are standable and at different heights.
   * @returns {{run: 'x'|'z', axis: [number, number], low: number, high: number}}
   */
  _rampAxis(tile, what) {
    const options = [
      { run: /** @type {const} */ ('x'), axis: /** @type {[number, number]} */ ([1, 0]) },
      { run: /** @type {const} */ ('z'), axis: /** @type {[number, number]} */ ([0, 1]) },
    ];

    const found = [];
    for (const option of options) {
      const [dx, dz] = option.axis;
      const back = this._groundLevel(tile.gx - dx, tile.gz - dz);
      const forward = this._groundLevel(tile.gx + dx, tile.gz + dz);
      if (back === null || forward === null || back === forward) continue;
      found.push({ ...option, low: Math.min(back, forward), high: Math.max(back, forward) });
    }

    if (found.length === 0) {
      throw new Error(
        `The ${what} at ${tile.gx},${tile.gz} joins nothing: it needs floors at ` +
          'different heights on opposite sides of it',
      );
    }
    if (found.length === 2) {
      throw new Error(
        `The ${what} at ${tile.gx},${tile.gz} could run either way: it has floors ` +
          'at different heights on both axes',
      );
    }
    return found[0];
  }

  /** A stair climbs exactly one level, and may be taken in either direction. */
  _deriveStair(tile) {
    const { run, axis, low, high } = this._rampAxis(tile, 'stair');
    if (high - low !== 1) {
      throw new Error(
        `The stair at ${tile.gx},${tile.gz} spans ${high - low} levels: a stair ` +
          'joins floors exactly one level apart',
      );
    }

    const higherIsForward = this._groundLevel(tile.gx + axis[0], tile.gz + axis[1]) === high;
    tile.run = run;
    tile.low = low;
    tile.high = high;
    // Halfway up, so a climb is two half-steps rather than one lurch.
    tile.level = low + 0.5;
    tile.up = higherIsForward ? axis : opposite(axis);
    tile.dir = opposite(tile.up);
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
    const isSlide = (gx, gz) => this.get(gx, gz)?.type === 'slide';
    let backX = tile.gx;
    let backZ = tile.gz;
    while (isSlide(backX - dx, backZ - dz)) {
      backX -= dx;
      backZ -= dz;
    }
    const parts = [];
    for (let x = backX, z = backZ; isSlide(x, z); x += dx, z += dz) {
      parts.push(this.get(x, z));
    }

    const first = parts[0];
    const last = parts[parts.length - 1];
    const above = this._groundLevel(first.gx - dx, first.gz - dz);
    const below = this._groundLevel(last.gx + dx, last.gz + dz);
    if (above === null || below === null) {
      throw new Error(
        `The chute at ${first.gx},${first.gz} does not land: a slide needs floor ` +
          'at both ends of its run',
      );
    }
    if (above === below) {
      throw new Error(
        `The chute at ${first.gx},${first.gz} is level: a slide has to go down`,
      );
    }

    // Downhill sets the direction of travel, whichever way round it was authored.
    const downhill = above > below;
    const descending = downhill ? parts : [...parts].reverse();
    const step = downhill ? [dx, dz] : opposite([dx, dz]);
    const top = Math.max(above, below);
    const drop = Math.abs(above - below) / (descending.length + 1);

    descending.forEach((part, index) => {
      part.run = run;
      part.dir = step;
      part.up = opposite(step);
      part.level = top - drop * (index + 1);
    });

    return parts;
  }

  /**
   * Which way a chute runs. A run of more than one slide tile says so by its own
   * shape; a single tile is judged by the ground around it, like a stair.
   * @returns {'x'|'z'}
   */
  _chuteRun(tile) {
    const isSlide = (gx, gz) => this.get(gx, gz)?.type === 'slide';
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

  get(gx, gz) {
    if (gz < 0 || gz >= this.rows || gx < 0 || gx >= this.cols) return null;
    return this.tiles[gz][gx];
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
    if (RAMPS.has(t.type)) return false;
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
  tileHeight(gx, gz) {
    return (this.get(gx, gz)?.level ?? 0) * LEVEL_RISE;
  }

  /**
   * Where something standing on this tile sits. That is the tile's own height, less
   * the sink if it is water — the one tile you stand *in* rather than on.
   */
  surfaceY(gx, gz) {
    const t = this.get(gx, gz);
    if (!t) return 0;
    return t.level * LEVEL_RISE - (t.type === 'water' ? WATER_SINK : 0);
  }

  /** True when standing here means sliding on: ice, and the slides that fall. */
  isSlippery(gx, gz) {
    const type = this.get(gx, gz)?.type;
    return type === 'ice' || type === 'slide';
  }

  /**
   * Whether two neighbouring tiles are joined, as geometry — before anything about
   * keys or tubes is considered. This is where elevation lives:
   *
   *  - ordinary ground connects only to ground at the same height, so a ledge is a
   *    wall you can see over;
   *  - a stair connects its two ends, and only along its run — its flanks are the
   *    side of a staircase, not a way on;
   *  - a slide is one-way. It may only be entered at the top and only ridden
   *    downhill, which is what makes a chute a commitment rather than a shortcut.
   */
  isConnected(fromGx, fromGz, toGx, toGz) {
    const from = this.get(fromGx, fromGz);
    const to = this.get(toGx, toGz);
    if (!from || !to) return false;

    const move = [toGx - fromGx, toGz - fromGz];
    if (!this._allowsMove(from, move)) return false;
    if (!this._allowsMove(to, move)) return false;

    // Neither end is a ramp, so this is ground to ground: the heights must match.
    if (!RAMPS.has(from.type) && !RAMPS.has(to.type)) return from.level === to.level;
    return true;
  }

  /** Whether a ramp permits being crossed this way. Ordinary ground permits all. */
  _allowsMove(tile, [dx, dz]) {
    if (!RAMPS.has(tile.type)) return true;
    const alongRun = tile.run === 'x' ? dz === 0 : dx === 0;
    if (!alongRun) return false;
    // A slide only ever goes one way.
    if (tile.type === 'slide') return dx === tile.dir[0] && dz === tile.dir[1];
    return true;
  }

  /**
   * Whether the player, carrying `inventory`, may take one step from one tile to
   * the next: the destination has to allow them in, and the two tiles have to be
   * joined. Doors and water are the destination's business; height is the pair's.
   */
  canStep(fromGx, fromGz, toGx, toGz, inventory) {
    if (!this.canEnter(toGx, toGz, inventory)) return false;
    return this.isConnected(fromGx, fromGz, toGx, toGz);
  }

  /**
   * Whether something sliding out of control may carry on into the next tile.
   * Everything the player could walk onto, minus shut doors: a slide is not a
   * decision, so it must not spend a key for you. You stop against the door and
   * open it by walking into it deliberately.
   */
  canSlideInto(fromGx, fromGz, toGx, toGz, inventory) {
    const t = this.get(toGx, toGz);
    if (!t) return false;
    if (t.type === 'door' && !t.open) return false;
    return this.canStep(fromGx, fromGz, toGx, toGz, inventory);
  }

  /**
   * Whether a patrol may take a step. Patrols keep to the level they spawned on:
   * stairs and slides are not theirs to use, and a ledge stops them exactly as it
   * stops the player. So a raised walkway is a room of its own, the way a door
   * shuts a patrol into one.
   */
  canPatrol(fromGx, fromGz, toGx, toGz) {
    if (!this.isWalkable(toGx, toGz)) return false;
    const from = this.get(fromGx, fromGz);
    const to = this.get(toGx, toGz);
    if (!from || !to || RAMPS.has(from.type)) return false;
    return from.level === to.level;
  }

  // --- Rules ----------------------------------------------------------------

  /** True when an obstacle tile's columns are currently up. */
  isRaised(tile) {
    return tile.type === 'obstacle' && tile.group === this.phase[tile.color];
  }

  /** Can the player, carrying `inventory`, step onto this tile? */
  canEnter(gx, gz, inventory) {
    const t = this.get(gx, gz);
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
      default:
        return true;
    }
  }

  /**
   * Spends a key to open a closed door. Called before the move starts, so the
   * panel has the whole step to swing out of the way as the player walks in.
   */
  openDoor(gx, gz, inventory) {
    const t = this.get(gx, gz);
    if (!t || t.type !== 'door' || t.open) return false;
    if (!inventory.useKey(t.color)) return false;
    t.open = true;
    this._emit('door', t);
    return true;
  }

  /** Applies whatever the tile does once the player has arrived on it. */
  onEnter(gx, gz, inventory) {
    const t = this.get(gx, gz);
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

  /** @param {'pickup'|'door'|'switch'} name */
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

    for (const other of this._switchesOf(tile.color)) other.pressed = false;
    tile.pressed = true;
    this.phase[tile.color] = this.phase[tile.color] === 'A' ? 'B' : 'A';
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
    this.phase = { red: 'A', cyan: 'A', pink: 'A' };

    for (const row of this.tiles) {
      for (const t of row) {
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
        if (t.button) {
          const down = this.isPressed(t);
          t.button.position.y = t.baseY + (down ? SWITCH_DOWN_Y : SWITCH_UP_Y);
          t.button.material.color.copy(down ? t.downColor : t.idleColor);
          t.button.material.emissive.copy(down ? t.downEmissive : t.idleEmissive);
        }
      }
    }
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
    const k = 1 - Math.pow(0.002, dt); // exponential smoothing factor
    // Doors get a faster factor: the panel has one 0.14s step to clear the
    // doorway the player is already walking into.
    const kDoor = 1 - Math.pow(0.00002, dt);

    for (const row of this.tiles) {
      for (const t of row) {
        if (t.columns) {
          const target = t.baseY + (this.isRaised(t) ? COLUMN_RAISED_Y : COLUMN_RETRACTED_Y);
          t.columns.position.y += (target - t.columns.position.y) * k;
        }

        // A door swings out of the doorway rather than blinking out of existence.
        if (t.swing) {
          const target = t.open ? DOOR_OPEN_ANGLE : 0;
          t.swing.rotation.y += (target - t.swing.rotation.y) * kDoor;
        }

        // A pressed button sinks into its plate and goes distinctly darker —
        // colour is what actually reads at this camera distance.
        if (t.button) {
          const pressed = this.isPressed(t);
          const target = t.baseY + (pressed ? SWITCH_DOWN_Y : SWITCH_UP_Y);
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
  }

  // --- Mesh construction ----------------------------------------------------

  _build() {
    const floorGeo = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.2, TILE_SIZE * 0.98);
    const wallGeo = new THREE.BoxGeometry(TILE_SIZE, 1.0, TILE_SIZE);
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

    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.cols; x++) {
        const tile = this.tiles[z][x];
        const world = this.gridToWorld(x, z);
        // Everything that sits on this tile — a door, a button, a pickup's bob —
        // is placed relative to the height of its ground.
        const height = this.tileHeight(x, z);
        tile.baseY = height;
        world.y = height;

        if (tile.type === 'wall') {
          const mesh = new THREE.Mesh(wallGeo, wallMat);
          mesh.position.set(world.x, 0.5, world.z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.group.add(mesh);
          continue;
        }

        if (tile.type === 'water') {
          const mesh = new THREE.Mesh(waterGeo, waterMat);
          mesh.position.set(world.x, height - 0.15, world.z);
          mesh.receiveShadow = true;
          this.group.add(mesh);
          continue;
        }

        if (tile.type === 'stair') {
          const stair = buildStair(tile, this._litMaterial(0x6b7686, 0.08), stoneMat);
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
        const floor = new THREE.Mesh(flat ? floorGeo : plinthGeo(height), mat);
        floor.position.set(world.x, flat ? -0.1 : height - (0.2 + height) / 2, world.z);
        floor.receiveShadow = true;
        floor.castShadow = !flat;
        this.group.add(floor);

        const feature = this._buildFeature(tile, world);
        if (feature) this.group.add(feature);
      }
    }
  }

  /** How far one tile of a chute falls, in world units. */
  _chuteDrop(tile) {
    const [dx, dz] = tile.dir;
    const next = this.get(tile.gx + dx, tile.gz + dz);
    const below = next?.type === 'slide' ? next.level : this._groundLevel(tile.gx + dx, tile.gz + dz);
    return (tile.level - (below ?? tile.level)) * LEVEL_RISE;
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
        const art = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.32),
          this._litMaterial(0xffe066, 0.7),
        );
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

// Three treads to a stair. Enough that it reads as a staircase from this camera
// distance, few enough that each tread is a chunky block rather than a sliver.
const STAIR_TREADS = 3;

/**
 * A staircase filling one tile: treads climbing from the low end to the high one,
 * each a block standing on the ground rather than a step floating above it.
 *
 * Built with local +z as the way up, then turned to face the tile's own `up`.
 */
function buildStair(tile, treadMaterial, sideMaterial) {
  const group = new THREE.Group();
  const lowY = tile.low * LEVEL_RISE;
  const rise = (tile.high - tile.low) * LEVEL_RISE;
  const depth = (TILE_SIZE * 0.98) / STAIR_TREADS;

  for (let i = 0; i < STAIR_TREADS; i++) {
    const top = lowY + (rise * (i + 1)) / STAIR_TREADS;
    const height = top + 0.2; // down past the floor plane, so nothing floats
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE * 0.98, height, depth),
      i === STAIR_TREADS - 1 ? treadMaterial : sideMaterial,
    );
    tread.position.set(0, top - height / 2, -TILE_SIZE / 2 + depth * (i + 0.5));
    tread.castShadow = true;
    tread.receiveShadow = true;
    group.add(tread);
  }

  group.rotation.y = Math.atan2(tile.up[0], tile.up[1]);
  return group;
}

/**
 * One tile of a chute: a slab tilted to match the fall, a plinth holding it up, and
 * a rail down each side — which is what tells a chute apart from ice at a glance,
 * since both are the same bright glassy material.
 *
 * Built with local +z as downhill, then turned to face the tile's own `dir`.
 */
function buildSlide(tile, drop, surfaceMaterial, frameMaterial) {
  const group = new THREE.Group();
  const centre = tile.level * LEVEL_RISE;
  // The slab spans one tile along the fall, so its tilt is the fall over a tile.
  const tilt = Math.atan2(drop, TILE_SIZE);
  const length = Math.hypot(TILE_SIZE, drop) * 1.02;

  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE * 0.86, 0.08, length),
    surfaceMaterial,
  );
  bed.rotation.x = tilt;
  bed.position.y = centre;
  bed.receiveShadow = true;
  group.add(bed);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, length), frameMaterial);
    rail.rotation.x = tilt;
    rail.position.set(side * TILE_SIZE * 0.45, centre + 0.06, 0);
    rail.castShadow = true;
    group.add(rail);
  }

  // A plinth under the bed, from below the floor plane up to the chute.
  const support = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE * 0.8, centre + 0.2, TILE_SIZE * 0.9),
    frameMaterial,
  );
  support.position.y = centre - (centre + 0.2) / 2;
  support.receiveShadow = true;
  group.add(support);

  group.rotation.y = Math.atan2(tile.dir[0], tile.dir[1]);
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

/** The inner tube: a flat-lying torus. */
function buildTube(material) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 10, 20), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export { buildTube };
