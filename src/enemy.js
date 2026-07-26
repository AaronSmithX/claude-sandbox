import * as THREE from 'three';

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
const PATTERNS = {
  vertical: { start: [0, 1], turn: ([dx, dz]) => [-dx, -dz] },
  horizontal: { start: [1, 0], turn: ([dx, dz]) => [-dx, -dz] },
  clockwise: { start: [1, 0], turn: ([dx, dz]) => [-dz, dx] },
  counterclockwise: { start: [1, 0], turn: ([dx, dz]) => [dz, -dx] },
};

/**
 * One patrolling enemy: a white disc, a smaller red dome, and a white spike —
 * a spike sitting on a shell. Moves one tile per player move.
 */
export class Enemy {
  constructor(tilemap, spawn) {
    this.tilemap = tilemap;
    this.spawn = spawn; // { gx, gz, pattern }
    this.pattern = PATTERNS[spawn.pattern];
    if (!this.pattern) throw new Error(`Unknown enemy pattern "${spawn.pattern}"`);

    this.mesh = buildEnemyMesh();

    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.gx = this.spawn.gx;
    this.gz = this.spawn.gz;
    this.dir = [...this.pattern.start];
    this._moving = false;
    this._t = 0;
    const p = this.tilemap.gridToWorld(this.gx, this.gz);
    this.mesh.position.set(p.x, 0, p.z);
  }

  /**
   * Takes one tile step. Tries straight ahead first; if blocked, applies the
   * pattern's turn rule and tries again, up to a full circle. Turning and
   * moving happen in the same step, so a blocked enemy never loses a turn.
   */
  step() {
    let dir = this.dir;

    for (let attempt = 0; attempt < 4; attempt++) {
      const nx = this.gx + dir[0];
      const nz = this.gz + dir[1];

      if (this.tilemap.isWalkable(nx, nz)) {
        this.dir = dir;
        this.gx = nx;
        this.gz = nz;

        this._from.copy(this.mesh.position);
        const target = this.tilemap.gridToWorld(nx, nz);
        this._to.set(target.x, 0, target.z);
        this._t = 0;
        this._moving = true;
        return;
      }

      dir = this.pattern.turn(dir);
    }

    // Walled in on all four sides — hold position but keep the last turn.
    this.dir = dir;
  }

  update(dt) {
    if (!this._moving) return;

    this._t += dt / MOVE_DURATION;
    if (this._t >= 1) {
      this._t = 1;
      this._moving = false;
    }

    const e = this._t * this._t * (3 - 2 * this._t);
    this.mesh.position.lerpVectors(this._from, this._to, e);
  }
}

/** Owns every enemy on the level and the group their meshes live in. */
export class Enemies {
  constructor(tilemap) {
    this.group = new THREE.Group();
    this.list = tilemap.enemySpawns.map((spawn) => {
      const enemy = new Enemy(tilemap, spawn);
      this.group.add(enemy.mesh);
      return enemy;
    });
  }

  /** Every enemy takes one step. Called once per successful player move. */
  step() {
    for (const enemy of this.list) {
      enemy.prevGx = enemy.gx;
      enemy.prevGz = enemy.gz;
      enemy.step();
    }
  }

  /**
   * True when an enemy has caught the player. Covers landing on the player's
   * tile, and the swap case where the two walked through each other:
   * the player went `from` -> current while an enemy went the other way.
   */
  hits(player, from) {
    return this.list.some(
      (e) =>
        (e.gx === player.gx && e.gz === player.gz) ||
        (e.gx === from.gx &&
          e.gz === from.gz &&
          e.prevGx === player.gx &&
          e.prevGz === player.gz),
    );
  }

  update(dt) {
    for (const enemy of this.list) enemy.update(dt);
  }

  reset() {
    for (const enemy of this.list) enemy.reset();
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
