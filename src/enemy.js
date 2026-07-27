import * as THREE from 'three';
import { disposeTree } from './dispose.js';

const MOVE_DURATION = 0.14; // matches Player, so everything slides in lockstep

// White for the shell and spike, a deeper red than the red switch (0xef4444)
// for the dome, since a switch and an enemy can share a screen.
const SHELL_COLOR = 0xe8edf7;
const DOME_COLOR = 0xe03131;

/**
 * A movement pattern is just a rule for which way to turn when the way ahead is
 * blocked, plus the heading to set off in. Vertical and horizontal bounce along
 * a line; the two rotational patterns wall-follow around a room.
 */
export const PATTERNS = {
  vertical: { start: [0, 1], turn: ([dx, dz]) => [-dx, -dz] },
  horizontal: { start: [1, 0], turn: ([dx, dz]) => [-dx, -dz] },
  clockwise: { start: [1, 0], turn: ([dx, dz]) => [-dz, dx] },
  counterclockwise: { start: [1, 0], turn: ([dx, dz]) => [dz, -dx] },
};

// Seconds per tile, and where in that cycle each enemy starts. Both are looked
// up by spawn order — which is row-major and so stable for a given map — rather
// than randomised, so a level always plays the same way and the tests are
// deterministic. No two neighbouring entries share a period, so patrols drift
// out of phase with each other instead of marching in lockstep. Everything here
// is well over the player's 0.14s step, so you can always out-walk a patrol.
const INTERVALS = [0.62, 0.74, 0.55, 0.68, 0.8];
const PHASES = [0, 0.5, 0.25, 0.75, 0.1];

/**
 * One patrolling enemy: a white disc, a smaller red dome, and a white spike —
 * a spike sitting on a shell. Steps on its own timer, independently of the
 * player and of the other enemies.
 */
export class Enemy {
  /**
   * @param {{index?: number, interval?: number, phase?: number}} [options]
   *   Production passes `index` (the spawn's position in the map) and lets the
   *   tables above choose the pacing; tests pass `interval`/`phase` directly.
   */
  constructor(tilemap, spawn, options = {}) {
    this.tilemap = tilemap;
    this.spawn = spawn; // { gx, gz, pattern }
    this.pattern = PATTERNS[spawn.pattern];
    if (!this.pattern) throw new Error(`Unknown enemy pattern "${spawn.pattern}"`);

    const index = options.index ?? 0;
    this.interval = options.interval ?? INTERVALS[index % INTERVALS.length];
    this.phase = options.phase ?? PHASES[index % PHASES.length];

    this.mesh = buildEnemyMesh();

    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.gx = this.spawn.gx;
    this.gz = this.spawn.gz;
    // Patrols live on the ground layer. Nothing moves them off it — they take
    // neither ramps nor platforms — so this is a constant, and it is here so that
    // catching the player can ask whether the two are even on the same level.
    this.layer = 0;
    this.prevGx = this.gx;
    this.prevGz = this.gz;
    this.dir = [...this.pattern.start];
    this._moving = false;
    this._t = 0;
    // Staggered, so a room full of patrols doesn't fire on the same frame.
    this._timer = this.phase * this.interval;
    const p = this.tilemap.gridToWorld(this.gx, this.gz);
    // Patrols keep to the level they spawned on, so their height is whatever the
    // ground under them is — a patrol on a raised walkway rides at that height.
    this.mesh.position.set(p.x, this.tilemap.tileHeight(this.gx, this.gz), p.z);
  }

  /**
   * Takes one tile step. Tries straight ahead first; if blocked, applies the
   * pattern's turn rule and tries again, up to a full circle. Turning and
   * moving happen in the same step, so a blocked enemy never loses a turn.
   */
  step() {
    let dir = this.dir;
    // Recorded on every step, however the step was triggered, because the
    // pass-through check in Enemies.hits() reads it.
    this.prevGx = this.gx;
    this.prevGz = this.gz;

    for (let attempt = 0; attempt < 4; attempt++) {
      const nx = this.gx + dir[0];
      const nz = this.gz + dir[1];

      if (this.tilemap.canPatrol(this.gx, this.gz, nx, nz)) {
        this.dir = dir;
        this.gx = nx;
        this.gz = nz;

        this._from.copy(this.mesh.position);
        const target = this.tilemap.gridToWorld(nx, nz);
        this._to.set(target.x, this.tilemap.tileHeight(nx, nz), target.z);
        this._t = 0;
        this._moving = true;
        return;
      }

      dir = this.pattern.turn(dir);
    }

    // Walled in on all four sides — hold position but keep the last turn.
    this.dir = dir;
  }

  /**
   * Advances the timer and, when it comes round, takes a tile step. The tween
   * keeps running even while frozen, so nothing is left stranded between tiles.
   * @returns {boolean} whether a tile step was taken this frame
   */
  update(dt, frozen = false) {
    let stepped = false;

    if (!frozen) {
      this._timer += dt;
      if (this._timer >= this.interval) {
        this._timer -= this.interval;
        // One step per frame at most: a long dt (a backgrounded tab, a slow
        // first frame) must not let an enemy teleport across several tiles.
        if (this._timer >= this.interval) this._timer = 0;
        this.step();
        stepped = true;
      }
    }

    if (!this._moving) return stepped;

    this._t += dt / MOVE_DURATION;
    if (this._t >= 1) {
      this._t = 1;
      this._moving = false;
    }

    const e = this._t * this._t * (3 - 2 * this._t);
    this.mesh.position.lerpVectors(this._from, this._to, e);
    return stepped;
  }
}

/** Owns every enemy on the level and the group their meshes live in. */
export class Enemies {
  /** @param {{interval?: number, phase?: number}} [options] applied to every enemy, for tests */
  constructor(tilemap, options = {}) {
    this.group = new THREE.Group();
    this.list = tilemap.enemySpawns.map((spawn, index) => {
      const enemy = new Enemy(tilemap, spawn, { index, ...options });
      this.group.add(enemy.mesh);
      return enemy;
    });
  }

  /**
   * Forces every enemy to step now, ignoring its timer. Nothing in the game
   * calls this any more — it is here for tests, and for anyone who wants the
   * old lockstep behaviour back.
   */
  step() {
    for (const enemy of this.list) enemy.step();
  }

  /**
   * The enemy that has caught the player, or null. Grid coordinates are the
   * truth here; the tweens are only decoration. There are two ways to be caught:
   *
   *  - occupancy: something is standing on the player's tile;
   *  - pass-through: the two swapped tiles, each ending up on the other's
   *    previous one, so they crossed without ever sharing a tile.
   *
   * Both arms require the two to be on the same layer: a patrol under a bridge is
   * not a patrol you can walk into.
   *
   * Both sides now move on their own clocks, so this is checked every frame
   * rather than only when the player moves. A stale `player.prev` cannot cause
   * a false positive: for the pass-through arm to match, the enemy's previous
   * tile must be the player's *current* tile, which the occupancy arm would
   * already have caught on an earlier frame.
   */
  hits(player) {
    return (
      this.list.find(
        (e) =>
          e.layer === player.layer &&
          ((e.gx === player.gx && e.gz === player.gz) ||
            (e.gx === player.prevGx &&
              e.gz === player.prevGz &&
              e.prevGx === player.gx &&
              e.prevGz === player.gz)),
      ) ?? null
    );
  }

  /** @returns {boolean} whether any enemy took a tile step this frame */
  update(dt, frozen = false) {
    let stepped = false;
    for (const enemy of this.list) stepped = enemy.update(dt, frozen) || stepped;
    return stepped;
  }

  reset() {
    for (const enemy of this.list) enemy.reset();
  }

  /**
   * Throws away this stage's enemy meshes. Each enemy builds its own materials, so
   * unloading a stage without this would leave them on the GPU.
   */
  dispose() {
    disposeTree(this.group);
    this.group.clear();
    this.list = [];
  }
}

/** A white disc, a narrower red hemisphere, and a small white spike on top. */
function buildEnemyMesh() {
  const group = new THREE.Group();

  const shellMat = new THREE.MeshStandardMaterial({
    color: SHELL_COLOR,
    roughness: 0.5,
    metalness: 0.05,
    emissive: 0x2a3040,
  });
  const domeMat = new THREE.MeshStandardMaterial({
    color: DOME_COLOR,
    roughness: 0.4,
    metalness: 0.1,
    emissive: 0x4a0f0f,
  });

  // Disc: spans y 0 .. 0.12.
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 20), shellMat);
  disc.position.y = 0.06;
  disc.castShadow = true;
  group.add(disc);

  // Dome: a hemisphere sitting on the disc, spans 0.12 .. 0.34.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat,
  );
  dome.position.y = 0.12;
  dome.castShadow = true;
  group.add(dome);

  // Spike: sits on the dome, spans 0.34 .. 0.56.
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 12), shellMat);
  spike.position.y = 0.45;
  spike.castShadow = true;
  group.add(spike);

  return group;
}
