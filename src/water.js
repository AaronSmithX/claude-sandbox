import * as THREE from 'three';
import { TILE_SIZE } from './tilemap.js';

/**
 * The moving skin on top of the water.
 *
 * A pond is a flat blue slab until it moves, so this is what says "water" rather
 * than "blue floor": crossing swells lift the surface into peaks, foam gathers on
 * the crests and ebbs away again, and every second or two a drop lands somewhere
 * and sends a ring out across it.
 *
 * All of it is one mesh per water level and one material, animated on the CPU:
 * the maths below is a pure function of world position and time, so every vertex
 * is independent and a pond stays continuous across the tiles it is made of. The
 * numbers are tiny — a big pond is a few thousand vertices — and keeping it out
 * of a shader means the shape of the water is something the tests can read.
 *
 * Nothing here is game state. The rules of water live in `tilemap.js`; this only
 * decides where the surface is drawn.
 */

/** How far the still surface sits below the bank it is set into. */
export const SURFACE_DROP = 0.05;

/**
 * Peak height of the swell, and of a ripple's ring. Their sum is `SURFACE_DROP`,
 * so the highest a peak can ever reach is exactly level with the bank — water
 * laps at the edge of the land and never over it.
 */
export const WAVE_HEIGHT = 0.028;
export const RIPPLE_HEIGHT = 0.022;

/**
 * Three swells crossing at angles that do not divide into each other, which is
 * what stops the surface settling into a visible repeating pattern. The
 * amplitudes sum to 1, so `waveAt` stays within -1..1.
 */
const SWELLS = [
  { kx: 2.1, kz: 0.9, speed: 1.15, amp: 0.45 },
  { kx: -1.0, kz: 1.8, speed: 0.9, amp: 0.35 },
  { kx: 3.1, kz: 2.6, speed: 1.9, amp: 0.2 },
];

/** Where a crest has to reach before foam forms on it. */
const FOAM_EDGE = 0.3;

const RIPPLE_LIFE = 1.9; // seconds a ring lasts before it has faded out
const RIPPLE_SPEED = 0.8; // world units per second the ring travels outwards
const RIPPLE_WIDTH = 0.34; // half the width of the band of water the ring disturbs
const RIPPLE_GAP = [0.9, 2.6]; // seconds between drops, picked from this range

const DEEP = new THREE.Color(0x1b4d84);
const CREST = new THREE.Color(0x3f8ac9);
const FOAM = new THREE.Color(0xdcf0ff);

/**
 * The height of the swell at a point, in -1..1. Multiply by `WAVE_HEIGHT` for
 * world units.
 * @param {number} x @param {number} z @param {number} t seconds
 */
export function waveAt(x, z, t) {
  let height = 0;
  for (const swell of SWELLS) {
    height += swell.amp * Math.sin(x * swell.kx + z * swell.kz + t * swell.speed);
  }
  return height;
}

/**
 * How much foam is on the water at a point, 0..1.
 *
 * Foam rides the crests, so the lines of it travel with the swell. A slow tide
 * crossing the pond in its own direction then fades each line up and down as it
 * goes, which is the ebb and flow — without it the foam would be a fixed pattern
 * sliding past, and read as a printed texture rather than as something happening.
 *
 * @param {number} x @param {number} z @param {number} t seconds
 */
export function foamAt(x, z, t) {
  const crest = waveAt(x, z, t);
  if (crest <= FOAM_EDGE) return 0;

  const band = smoothstep((crest - FOAM_EDGE) / (1 - FOAM_EDGE));
  const tide = 0.5 + 0.5 * Math.sin(x * 0.55 + z * 0.35 - t * 0.45);
  return band * (0.3 + 0.7 * tide);
}

/** The usual 0..1 ease, clamped. @param {number} t */
function smoothstep(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/**
 * The rings spreading from drops that have landed recently.
 *
 * A ring is a crest travelling outwards with a shallow trough either side of it,
 * fading as it goes. Keeping them as plain numbers — rather than as rings of
 * geometry laid on the water — means they lift the same surface the swell does,
 * so a ripple crossing a wave rides over it instead of clipping through it.
 */
export class Ripples {
  /**
   * @param {{random?: () => number, capacity?: number}} [options]
   *   `random` is injectable so a test can say exactly when the next drop falls
   *   and where.
   */
  constructor({ random = Math.random, capacity = 4 } = {}) {
    /** @type {{x: number, z: number, age: number}[]} */
    this.list = [];
    this.capacity = capacity;
    this._random = random;
    this._wait = this._gap();
  }

  /**
   * Ages the rings, drops the spent ones, and lets one more drop fall when its
   * turn comes round.
   *
   * @param {number} dt seconds
   * @param {() => ?{x: number, z: number}} where called only when a drop is due,
   *   and may decline by returning null — there is nowhere for a drop to land on
   *   a map with no water in it.
   */
  update(dt, where) {
    for (const ripple of this.list) ripple.age += dt;
    this.list = this.list.filter((ripple) => ripple.age < RIPPLE_LIFE);

    this._wait -= dt;
    if (this._wait > 0) return;

    this._wait = this._gap();
    const at = where();
    if (at) this.spawn(at.x, at.z);
  }

  /** @param {number} x @param {number} z */
  spawn(x, z) {
    // The oldest ring is the faintest, so it is the one to lose if this pond is
    // already as busy as it is allowed to get.
    if (this.list.length >= this.capacity) this.list.shift();
    this.list.push({ x, z, age: 0 });
  }

  /**
   * How far the rings lift the water at a point, in -1..1. Zero — the common
   * case — everywhere no ring has reached yet or has already passed.
   * @param {number} x @param {number} z
   */
  liftAt(x, z) {
    let lift = 0;

    for (const ripple of this.list) {
      const front = ripple.age * RIPPLE_SPEED;
      const offset = Math.hypot(x - ripple.x, z - ripple.z) - front;
      if (Math.abs(offset) > RIPPLE_WIDTH) continue;

      const across = offset / RIPPLE_WIDTH;
      const fade = 1 - ripple.age / RIPPLE_LIFE;
      // A crest on the ring itself, dropping into shallow troughs to either
      // side; squared fade so a ring dies away rather than winking out.
      lift += Math.cos(across * Math.PI) * Math.exp(-across * across * 2) * fade * fade;
    }

    return lift;
  }

  reset() {
    this.list.length = 0;
    this._wait = this._gap();
  }

  _gap() {
    return RIPPLE_GAP[0] + this._random() * (RIPPLE_GAP[1] - RIPPLE_GAP[0]);
  }
}

/**
 * @typedef {object} WaterTile
 * @property {number} gx @property {number} gz
 * @property {number} x @property {number} z world centre of the tile
 * @property {number} y the height of the bank the water is set into
 */

export class WaterSurface {
  /**
   * @param {WaterTile[]} tiles every water tile on the map
   * @param {{random?: () => number, segments?: number}} [options]
   *   `segments` is how finely one tile is divided: fine enough that a ripple's
   *   ring is a circle rather than a polygon, and no finer — the whole surface is
   *   rewritten every frame, so this is what the cost of the water is made of. Six
   *   puts four rows of vertices across a ring, and the largest pond in the game
   *   at about an eighth of a millisecond a frame.
   */
  constructor(tiles, { random = Math.random, segments = 6 } = {}) {
    this.group = new THREE.Group();
    this.tiles = tiles;
    this._random = random;
    this._ripples = new Ripples({ random });
    this._elapsed = 0;
    this._tint = new THREE.Color();

    // One sheet per water level: vertices are shared between neighbouring tiles,
    // which is what makes a pond one continuous surface instead of a grid of
    // squares with a crease down every edge. Two ponds at different heights
    // cannot share vertices, so they are separate sheets.
    /** @type {Map<number, WaterTile[]>} */
    const levels = new Map();
    for (const tile of tiles) {
      const at = levels.get(tile.y);
      if (at) at.push(tile);
      else levels.set(tile.y, [tile]);
    }

    this._sheets = [...levels].map(([y, group]) => buildSheet(group, y, segments));
    for (const sheet of this._sheets) this.group.add(sheet.mesh);

    // A sheet is built with no colour in it at all, which is black. Settling it
    // once here means the first frame drawn is water rather than a hole.
    this.update(0);
  }

  /** @param {number} dt seconds */
  update(dt) {
    this._elapsed += dt;
    const t = this._elapsed;
    this._ripples.update(dt, () => this._dropPoint());

    for (const sheet of this._sheets) {
      const position = sheet.position;
      const color = sheet.color;
      const points = position.array;
      const tint = color.array;

      for (let v = 0; v < position.count; v++) {
        const i = v * 3;
        const x = points[i];
        const z = points[i + 2];

        const swell = waveAt(x, z, t);
        const ring = this._ripples.liftAt(x, z);
        points[i + 1] = sheet.base + swell * WAVE_HEIGHT + ring * RIPPLE_HEIGHT;

        // A ring carries its own foam, so the circle reads even where the swell
        // under it is in a trough and has none of its own.
        const foam = Math.min(1, foamAt(x, z, t) + Math.max(0, ring) * 0.85);
        this._tint.copy(DEEP).lerp(CREST, 0.5 + 0.5 * swell).lerp(FOAM, foam);
        tint[i] = this._tint.r;
        tint[i + 1] = this._tint.g;
        tint[i + 2] = this._tint.b;
      }

      position.needsUpdate = true;
      color.needsUpdate = true;
      // The peaks are what the light has to catch, and a peak with a flat normal
      // is not a peak.
      sheet.mesh.geometry.computeVertexNormals();
    }
  }

  /** Stills the water, for a retry. The swell carries on; the drops start over. */
  reset() {
    this._ripples.reset();
  }

  /** Somewhere for the next drop to land: a random point on a random tile. */
  _dropPoint() {
    if (!this.tiles.length) return null;
    const tile = this.tiles[Math.floor(this._random() * this.tiles.length)];
    // Kept off the very edge, so a ring opens out on the water rather than half
    // of it starting under the bank.
    return {
      x: tile.x + (this._random() - 0.5) * TILE_SIZE * 0.6,
      z: tile.z + (this._random() - 0.5) * TILE_SIZE * 0.6,
    };
  }
}

/**
 * One continuous sheet of water: a lattice over the tiles at a given height, with
 * one vertex per lattice point however many tiles meet there.
 *
 * @param {WaterTile[]} tiles all at the same height
 * @param {number} y @param {number} segments
 */
function buildSheet(tiles, y, segments) {
  const step = TILE_SIZE / segments;
  // Lattice point (0, 0) is the near corner of tile (0, 0), so a point's world
  // position follows from its lattice coordinates alone — which is what lets two
  // tiles agree on the vertex they share.
  const first = tiles[0];
  const originX = first.x - TILE_SIZE / 2 - first.gx * TILE_SIZE;
  const originZ = first.z - TILE_SIZE / 2 - first.gz * TILE_SIZE;

  /** @type {Map<number, number>} lattice point to vertex index */
  const seen = new Map();
  /** @type {number[]} */
  const points = [];
  /** @type {number[]} */
  const faces = [];

  /** @param {number} i @param {number} j */
  const vertex = (i, j) => {
    const key = i * 0x10000 + j;
    let index = seen.get(key);
    if (index === undefined) {
      index = points.length / 3;
      seen.set(key, index);
      points.push(originX + i * step, y - SURFACE_DROP, originZ + j * step);
    }
    return index;
  };

  for (const tile of tiles) {
    const i0 = tile.gx * segments;
    const j0 = tile.gz * segments;

    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const a = vertex(i0 + i, j0 + j);
        const b = vertex(i0 + i + 1, j0 + j);
        const c = vertex(i0 + i, j0 + j + 1);
        const d = vertex(i0 + i + 1, j0 + j + 1);
        // Wound so the surface faces up: from above, a-c-b turns anticlockwise.
        faces.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(points), 3);
  const color = new THREE.BufferAttribute(new Float32Array(points.length), 3);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  geometry.setIndex(faces);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.22,
      metalness: 0.18,
    }),
  );
  mesh.receiveShadow = true;
  // The surface moves every frame, so its bounds as built are wrong by the first
  // one — and a pond is small enough that culling it was never worth much.
  mesh.frustumCulled = false;

  return { mesh, position, color, base: y - SURFACE_DROP };
}
