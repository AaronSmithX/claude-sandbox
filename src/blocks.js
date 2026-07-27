import * as THREE from 'three';
import { disposeTree } from './dispose.js';

const MOVE_DURATION = 0.14; // the player's step, so a crate keeps up with the push

const CRATE_COLOR = 0xc98a4b;
const TRIM_COLOR = 0x8a5a2b;

/**
 * A crate: one tile of the map, pushed rather than walked.
 *
 * It moves like everything else in the game — the grid position changes the moment a
 * push is committed, and the mesh catches up over one step — so every rule that asks
 * "is there a crate here" gets the same answer the player's own move already assumed.
 */
export class Block {
  /**
   * @param {import('./tilemap.js').TileMap} tilemap
   * @param {{gx: number, gz: number, layer: number}} spawn
   */
  constructor(tilemap, spawn) {
    this.tilemap = tilemap;
    this.spawn = spawn;
    this.mesh = buildCrate();
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    /** @type {import('./types.js').Tile} */
    this.tile = /** @type {any} */ (null);
    /** @type {import('./types.js').Direction} */
    this._direction = [0, 1];
    this._t = 0;
    this._moving = false;
    this.reset();
  }

  get gx() {
    return this.tile.gx;
  }

  get gz() {
    return this.tile.gz;
  }

  get isMoving() {
    return this._moving;
  }

  reset() {
    const { gx, gz, layer } = this.spawn;
    this.tile = /** @type {import('./types.js').Tile} */ (this.tilemap.get(gx, gz, layer));
    this._moving = false;
    this._t = 0;
    this._direction = [0, 1];
    this._snapToGrid();
  }

  _snapToGrid() {
    const p = this.tilemap.gridToWorld(this.gx, this.gz);
    this.mesh.position.set(p.x, this.tilemap.surfaceOf(this.tile), p.z);
  }

  /**
   * Shoves the crate one tile, if there is somewhere for it to go. Called by the
   * player, from directly behind: a crate is never pushed by anything else, and never
   * pulled.
   *
   * @param {import('./types.js').Direction} direction
   * @returns {boolean} whether the crate moved
   */
  push([dx, dz]) {
    if (this._moving) return false; // one shove at a time
    return this._slideTo(dx, dz);
  }

  /** Starts a tile of travel, if the tile ahead will take a crate. */
  _slideTo(dx, dz) {
    const to = this.tilemap.stepTarget(this.tile, dx, dz);
    if (!to || !this.tilemap.canBlockEnter(to)) return false;

    const from = this.tile;
    this.tile = to;
    this._direction = [dx, dz];

    const origin = this.tilemap.gridToWorld(from.gx, from.gz);
    this._from.set(origin.x, this.tilemap.surfaceOf(from), origin.z);
    const target = this.tilemap.gridToWorld(to.gx, to.gz);
    this._to.set(target.x, this.tilemap.surfaceOf(to), target.z);
    this._t = 0;
    this._moving = true;
    return true;
  }

  /** @returns {boolean} whether the crate came to rest this frame */
  update(dt) {
    if (!this._moving) return false;

    this._t += dt / MOVE_DURATION;
    let landed = false;
    if (this._t >= 1) {
      this._t = 1;
      this._moving = false;
      landed = true;
    }

    const e = this._t * this._t * (3 - 2 * this._t);
    this.mesh.position.lerpVectors(this._from, this._to, e);

    // Ice carries a crate exactly as it carries the player: it keeps going the way it
    // was shoved until something stops it. Which is how a crate ends up somewhere you
    // did not intend, and why R restarts a stage.
    if (landed && this.tilemap.isSlipperyTile(this.tile)) {
      this._slideTo(this._direction[0], this._direction[1]);
    }
    return landed;
  }
}

/** Every crate on the level, and the group their meshes live in. */
export class Blocks {
  /** @param {import('./tilemap.js').TileMap} tilemap */
  constructor(tilemap) {
    this.group = new THREE.Group();
    this.list = tilemap.blockSpawns.map((spawn) => {
      const block = new Block(tilemap, spawn);
      this.group.add(block.mesh);
      return block;
    });
  }

  /**
   * The crate standing on a tile, or null.
   * @param {?import('./types.js').Tile} tile
   */
  at(tile) {
    if (!tile) return null;
    return this.list.find((block) => block.tile === tile) ?? null;
  }

  /** What the map needs to know: which tiles have a crate on them. */
  occupants() {
    return this.list.map((block) => ({ tile: block.tile, isBlock: true }));
  }

  update(dt) {
    for (const block of this.list) block.update(dt);
  }

  reset() {
    for (const block of this.list) block.reset();
  }

  dispose() {
    disposeTree(this.group);
    this.group.clear();
    this.list = [];
  }
}

/**
 * A wooden crate: a box, with a narrower box crossing each face as a band. Slightly
 * under a tile, so a row of crates reads as several crates rather than a wall.
 */
function buildCrate() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.82, 0.82),
    new THREE.MeshStandardMaterial({ color: CRATE_COLOR, roughness: 0.75 }),
  );
  body.position.y = 0.41;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const trimMaterial = new THREE.MeshStandardMaterial({
    color: TRIM_COLOR,
    roughness: 0.7,
  });
  for (const [sx, sy, sz] of [
    [0.86, 0.12, 0.7],
    [0.7, 0.12, 0.86],
  ]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), trimMaterial);
    band.position.y = 0.41;
    group.add(band);
  }

  return group;
}
