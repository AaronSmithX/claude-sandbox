import * as THREE from 'three';
import { buildTube } from './tilemap.js';
import { buildPlayerRig, HIP_HEIGHT } from './player-rig.js';

const MOVE_DURATION = 0.14; // seconds per tile step

// One tile step is half a gait cycle — left leg forward, then right — so the
// gait advances by exactly PI per step. That matters: sin() is then zero at every
// step boundary, so the legs are always closed and the body at rest height the
// moment a step lands, however many steps came before.
const GAIT_PER_STEP = Math.PI;
const SWING = 0.75; // radians the legs swing at full stride
const BOB = 0.05; // how far the hips rise at the top of a stride
const BLEND_IN = 12; // how quickly the walk cycle fades in and out
const BLEND_OUT = 8;
// Turning must beat the step it belongs to: a tile takes 0.14s, so a body that
// takes longer than that to come round appears to walk sideways. These say "all
// but 2% of the turn is done within 0.08 seconds".
const TURN_SECONDS = 0.08;
const TURN_REMAINDER = 0.02;

/**
 * The player: a small boxy person on the tile grid. Movement snaps tile-to-tile
 * but slides smoothly between tiles, the body turns to face the way it is going,
 * and the legs walk. What it may step onto depends on the inventory it carries.
 */
export class Player {
  constructor(tilemap, inventory) {
    this.tilemap = tilemap;
    this.inventory = inventory;

    // Fired the first time a move starts on the loaded stage, so the UI can drop
    // the hint. Reset with the player, so each stage's hint gets its own chance.
    this.onFirstMove = null;
    // Fired with ({gx,gz} from, {gx,gz} to) once a move is committed. A slide's
    // own tiles do not fire it — one event per deliberate step.
    this.onStep = null;
    // Fired when a slide begins, so it can be heard.
    this.onSlideStart = null;
    this._hasMoved = false;

    const spawn = tilemap.findSpawn();
    this.gx = spawn.gx;
    this.gz = spawn.gz;
    // The tile stepped off, so an enemy can tell it walked through us.
    this.prevGx = this.gx;
    this.prevGz = this.gz;

    const rig = buildPlayerRig();
    // `mesh` is still the thing the scene holds and the camera follows.
    this.mesh = rig.root;
    this.body = rig.body;
    this.parts = rig.parts;

    // The inner tube, once collected, is worn around the waist.
    this.tube = buildTube(
      new THREE.MeshStandardMaterial({
        color: 0xff7a45,
        roughness: 0.4,
        metalness: 0.1,
        emissive: 0x662d15,
      }),
    );
    this.tube.position.y = 0.02;
    this.tube.visible = false;
    this.body.add(this.tube);

    this.restingHeight = HIP_HEIGHT;

    // Tween state.
    this._moving = false;
    this._t = 0;
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    // Scales the hop: a step into or out of water is a wade, not a hop.
    this._hopScale = 1;
    // The way the last step went, which is the way a slide carries on.
    this._direction = [0, 1];
    this._sliding = false;
    // Directions currently held down, oldest first. The last one wins, so
    // pressing a second direction takes over and letting it go hands control
    // back to the one still held.
    this._held = [];

    // Which way the body is turned, and which way it is turning to. Spawning
    // faces +z, which is towards the camera.
    this._facing = 0;
    this._facingTarget = 0;
    this._gait = 0;
    this._gaitBase = 0;
    this._blend = 0;

    this._snapToGrid();
  }

  get isMoving() {
    return this._moving;
  }

  /** True while ice is carrying the player, when input is ignored. */
  get isSliding() {
    return this._sliding;
  }

  /** Standing height on a given tile, which water lowers. */
  _restY(gx, gz) {
    return this.restingHeight + this.tilemap.surfaceY(gx, gz);
  }

  _snapToGrid() {
    const p = this.tilemap.gridToWorld(this.gx, this.gz);
    this.mesh.position.set(p.x, this._restY(this.gx, this.gz), p.z);
    this._fromHeight = this.tilemap.tileHeight(this.gx, this.gz);
    this._toHeight = this._fromHeight;
  }

  /**
   * The height of the ground the player is on, interpolated across a step and free
   * of the bob, the hop and the water sink. The camera follows this: climbing a
   * stair has to move the frame, and a walk cycle must never.
   */
  get elevation() {
    if (!this._moving) return this._toHeight;
    const e = this._t * this._t * (3 - 2 * this._t);
    return this._fromHeight + (this._toHeight - this._fromHeight) * e;
  }

  /**
   * Moves the player onto another stage's map. One Player lives for the whole run
   * — the camera follows its mesh and the input is bound to it, so replacing the
   * instance between stages would strand both — and this is how it changes level.
   */
  setTilemap(tilemap) {
    this.tilemap = tilemap;
    this.reset();
  }

  /** Returns the player to the spawn tile with nothing carried. */
  reset() {
    const spawn = this.tilemap.findSpawn();
    this.gx = spawn.gx;
    this.gz = spawn.gz;
    this.prevGx = this.gx;
    this.prevGz = this.gz;
    this._moving = false;
    this._t = 0;
    this._hopScale = 1;
    this._sliding = false;
    this._hasMoved = false;
    this._held.length = 0;
    this._direction = [0, 1];
    this._facing = 0;
    this._facingTarget = 0;
    this._gait = 0;
    this._gaitBase = 0;
    this._blend = 0;
    this.body.rotation.y = 0;
    this.tube.visible = false;
    this._applyPose();
    this._snapToGrid();
  }

  _wading(gx, gz) {
    return this.tilemap.get(gx, gz)?.type === 'water';
  }

  /**
   * Attempt to move by one tile in grid space. Ignored mid-move, if blocked, or
   * while sliding — on ice you are a passenger until you come to rest.
   */
  tryMove(dx, dz) {
    if (this._sliding) return;
    this._beginMove(dx, dz);
  }

  /**
   * A direction went down. The first tile starts at once, and the player keeps
   * walking that way — with no pause at the tile edges — until it is released.
   */
  press(dx, dz) {
    this._release(dx, dz); // so a re-press moves it to the front
    this._held.push([dx, dz]);
    this.tryMove(dx, dz);
  }

  /** A direction came up. Walking carries on if another one is still down. */
  release(dx, dz) {
    this._release(dx, dz);
  }

  /** Drops every held direction, e.g. when the window loses focus. */
  releaseAll() {
    this._held.length = 0;
  }

  _release(dx, dz) {
    const i = this._held.findIndex(([hx, hz]) => hx === dx && hz === dz);
    if (i !== -1) this._held.splice(i, 1);
  }

  /**
   * Starts the next tile of a held walk. `carry` is the progress the step that
   * just landed overshot by, so a held direction flows tile to tile at exactly
   * the speed of a single step instead of stalling for a frame at each edge.
   */
  _continueHeld(carry = 0) {
    const dir = this._held[this._held.length - 1];
    if (!dir) return false;
    return this._beginMove(dir[0], dir[1], { carry });
  }

  /**
   * Commits a one-tile move, if the tile allows it.
   * @param {{carry?: number, silent?: boolean}} [options]
   *   `carry` is progress left over from the step before, so a slide or a held
   *   walk runs on without pausing for a frame at each tile edge. Held keys are
   *   read on arrival, not on a timer, which is why there is no repeat delay to
   *   sit through. `silent` suppresses onStep,
   *   which stops a slide firing a footstep for every tile it crosses.
   * @returns {boolean} whether the move started
   */
  _beginMove(dx, dz, { carry = 0, silent = false } = {}) {
    if (this._moving || this.inventory.won || this.inventory.dead) return false;

    const nx = this.gx + dx;
    const nz = this.gz + dz;
    // canStep, not canEnter: as well as asking whether the tile lets you in, this
    // asks whether the two tiles are joined — a ledge, a stair taken from the side
    // or a slide taken uphill all fail here.
    if (!this.tilemap.canStep(this.gx, this.gz, nx, nz, this.inventory)) return false;

    // Doors open on the way in, spending the matching key.
    this.tilemap.openDoor(nx, nz, this.inventory);

    const from = { gx: this.gx, gz: this.gz };
    this.prevGx = this.gx;
    this.prevGz = this.gz;
    this.gx = nx;
    this.gz = nz;

    // Both ends of the slide come from the grid rather than from the current
    // mesh position, so a hop or a bob in progress cannot be baked into the
    // start of the next step. Water tiles sit lower, so the descent into the
    // water happens across the step.
    const origin = this.tilemap.gridToWorld(from.gx, from.gz);
    this._from.set(origin.x, this._restY(from.gx, from.gz), origin.z);
    const target = this.tilemap.gridToWorld(nx, nz);
    this._to.set(target.x, this._restY(nx, nz), target.z);
    this._fromHeight = this.tilemap.tileHeight(from.gx, from.gz);
    this._toHeight = this.tilemap.tileHeight(nx, nz);
    this._hopScale = this._wading(from.gx, from.gz) || this._wading(nx, nz) ? 0.25 : 1;
    this._t = carry;
    this._moving = true;
    this._direction = [dx, dz];
    // The gait is measured from here, so it advances exactly half a cycle over
    // the step no matter how the frames fall.
    this._gaitBase = this._gait;

    // The rig is built facing +z, and +z is towards the camera, so atan2(dx, dz)
    // turns it to look along the direction of travel.
    this._facingTarget = Math.atan2(dx, dz);

    if (!this._hasMoved) {
      this._hasMoved = true;
      this.onFirstMove?.();
    }

    if (!silent) this.onStep?.(from, { gx: nx, gz: nz });
    return true;
  }

  update(dt) {
    // The tube shows as soon as it is picked up. It is worn, not spun.
    this.tube.visible = this.inventory.hasTube;

    this._turn(dt);

    // A direction still held keeps the walk going. Normally the next tile has
    // already started the instant the last one landed (see `_settleOrSlide`,
    // which hands over the leftover progress); this picks the walk back up when
    // the way was blocked at that moment and has since opened.
    if (!this._moving && !this._sliding) this._continueHeld();

    if (!this._moving) {
      this._relax(dt);
      this._applyPose();
      return;
    }

    this._t += dt / MOVE_DURATION;
    let carry = 0;
    if (this._t >= 1) {
      // Kept, so a slide can hand it to the next tile instead of resting for a
      // frame at every tile edge.
      carry = this._t - 1;
      this._t = 1;
      this._moving = false;
    }

    if (this._sliding) {
      // Feet planted, gliding: no stride, and no bob to go with it.
      this._relax(dt);
    } else {
      // Driving the gait from the step's own progress rather than from elapsed
      // time means it lands on exactly half a cycle: legs together, hips down.
      this._gait = this._gaitBase + GAIT_PER_STEP * this._t;
      this._blend = Math.min(1, this._blend + dt * BLEND_IN);
    }
    this._applyPose();

    // Smoothstep easing for the step, which interpolates height as well as
    // position — so entering water lowers the player over the whole step.
    const e = this._t * this._t * (3 - 2 * this._t);
    this.mesh.position.lerpVectors(this._from, this._to, e);

    // The hips rise twice per gait cycle, which is what a walk does. Added on
    // top of the interpolated height so wading still sits low in the water.
    if (!this._sliding) {
      this.mesh.position.y += Math.abs(Math.sin(this._gait)) * BOB * this._hopScale;
    }

    // Arriving on the tile is what triggers pickups, switches and the goal.
    if (!this._moving) {
      this.tilemap.onEnter(this.gx, this.gz, this.inventory);
      this._settleOrSlide(carry);
    }
  }

  /**
   * Called the moment a step lands. Ice carries you on in the same direction:
   * the slide only ends when you come to rest somewhere that is not ice, or when
   * something is in the way. Off the ice, a direction still held down carries you
   * on the same way — both hand the overshoot to the next tile, so a walk and a
   * slide are equally free of a hitch at the tile edges.
   */
  _settleOrSlide(carry) {
    const [dx, dz] = this._direction;
    const onIce = this.tilemap.isSlippery(this.gx, this.gz);
    const canGoOn =
      onIce &&
      !this.inventory.won &&
      !this.inventory.dead &&
      this.tilemap.canSlideInto(this.gx, this.gz, this.gx + dx, this.gz + dz, this.inventory);

    if (!canGoOn) {
      this._sliding = false;
      this._continueHeld(carry);
      return;
    }

    if (!this._sliding) {
      this._sliding = true;
      this.onSlideStart?.();
    }
    this._beginMove(dx, dz, { carry, silent: true });
  }

  /** Turns the body towards the way it is walking, the short way round. */
  _turn(dt) {
    const TWO_PI = Math.PI * 2;
    const delta =
      ((((this._facingTarget - this._facing + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) -
      Math.PI;
    this._facing += delta * (1 - Math.pow(TURN_REMAINDER, dt / TURN_SECONDS));
    this.body.rotation.y = this._facing;
  }

  /** Eases out of the walk cycle when standing still. */
  _relax(dt) {
    this._blend = Math.max(0, this._blend - dt * BLEND_OUT);
    // Settle to the nearest half cycle, where the legs are together.
    const closed = Math.round(this._gait / Math.PI) * Math.PI;
    this._gait += (closed - this._gait) * Math.min(1, dt * BLEND_OUT);
  }

  _applyPose() {
    const swing = Math.sin(this._gait) * SWING * this._blend;
    const { legL, legR, armL, armR } = this.parts;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    // Arms counter-swing, a touch less than the legs.
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8;
  }
}
