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
    // Fired when a crate is shoved, so that can be heard too.
    this.onPush = null;
    // Fired after a pad has moved the player, so the camera can stop following and
    // simply be there: a warp is not a walk, and the frame should not sweep the level.
    this.onTeleport = null;
    /**
     * The crates on this stage — what a step into an occupied tile can shove. Set by
     * whoever wires the world up; a stage without crates leaves it null.
     * @type {?import('./blocks.js').Blocks}
     */
    this.blocks = null;
    this._hasMoved = false;

    const spawn = tilemap.findSpawn();
    this.gx = spawn.gx;
    this.gz = spawn.gz;
    // The tile itself, because a cell can hold more than one: a bridge deck and the
    // water under it are the same gx,gz and very different places to be standing.
    this.tile = tilemap.get(spawn.gx, spawn.gz);
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
    // True while standing on the pad a pad just delivered us to, so the pair is a
    // trip rather than a loop.
    this._arrivedByPad = false;
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

  /** Which layer the player is on: 0 is the ground, 1 a deck above it. */
  get layer() {
    return this.tile?.layer ?? 0;
  }

  get isMoving() {
    return this._moving;
  }

  /** True while ice is carrying the player, when input is ignored. */
  get isSliding() {
    return this._sliding;
  }

  /** Standing height on a given tile, which water lowers. */
  _restY(tile) {
    return this.restingHeight + this.tilemap.surfaceOf(tile);
  }

  _snapToGrid() {
    const p = this.tilemap.gridToWorld(this.gx, this.gz);
    this.mesh.position.set(p.x, this._restY(this.tile), p.z);
    this._fromHeight = this.tilemap.heightOf(this.tile);
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

  /** Keeps the mesh sitting on its tile, for ground that moves under it. */
  _followGround() {
    this._toHeight = this.tilemap.heightOf(this.tile);
    this._fromHeight = this._toHeight;
    this.mesh.position.y = this._restY(this.tile);
  }

  /** Returns the player to the spawn tile with nothing carried. */
  reset() {
    const spawn = this.tilemap.findSpawn();
    this.gx = spawn.gx;
    this.gz = spawn.gz;
    this.tile = this.tilemap.get(spawn.gx, spawn.gz);
    this.prevGx = this.gx;
    this.prevGz = this.gz;
    this._moving = false;
    this._t = 0;
    this._hopScale = 1;
    this._sliding = false;
    this._hasMoved = false;
    this._arrivedByPad = false;
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

  _wading(tile) {
    return tile?.type === 'water';
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
   * Commits a one-tile move, if the map allows it.
   *
   * The map answers *which tile* the step lands on, rather than being asked about a
   * pair of coordinates: a cell can hold a floor and a deck above it, and which of
   * them you arrive on depends on the height you set out from.
   *
   * @param {number} dx
   * @param {number} dz
   * @param {MoveOptions} [options]
   * @returns {boolean} whether the move started
   *
   * @typedef {object} MoveOptions
   * @property {number} [carry] progress left over from the step before, so a slide or
   *   a held walk runs on without pausing for a frame at each tile edge. Held keys are
   *   read on arrival, not on a timer, which is why there is no repeat delay to sit
   *   through.
   * @property {boolean} [silent] suppresses onStep, which stops a slide firing a
   *   footstep for every tile it crosses.
   * @property {boolean} [sliding] asks for a slide's rules instead of a deliberate
   *   step's, which stops a slide opening a door with your key.
   */
  _beginMove(dx, dz, { carry = 0, silent = false, sliding = false } = {}) {
    if (this._moving || this.inventory.won || this.inventory.dead) return false;

    const from = this.tile;
    const to = sliding
      ? this.tilemap.slideFrom(from, dx, dz, this.inventory)
      : this.tilemap.stepFrom(from, dx, dz, this.inventory);
    if (!to) return false;

    // A crate in the way is not a wall: it is a shove, and the step only happens if
    // the shove does. Pushing is deliberate — a slide stops against a crate instead,
    // which slideFrom has already taken care of.
    const block = this.blocks?.at(to) ?? null;
    if (block) {
      if (!block.push([dx, dz])) return false;
      this.onPush?.();
    }

    // Doors open on the way in, spending the matching key.
    this.tilemap.openDoor(to.gx, to.gz, this.inventory, to.layer);

    this.prevGx = from.gx;
    this.prevGz = from.gz;
    // Off the pad, so the next one may take us somewhere.
    this._arrivedByPad = false;
    this.tile = to;
    this.gx = to.gx;
    this.gz = to.gz;

    // Both ends of the tween come from the grid rather than from the current mesh
    // position, so a hop or a bob in progress cannot be baked into the start of the
    // next step. Water tiles sit lower, so the descent into the water happens
    // across the step.
    const origin = this.tilemap.gridToWorld(from.gx, from.gz);
    this._from.set(origin.x, this._restY(from), origin.z);
    const target = this.tilemap.gridToWorld(to.gx, to.gz);
    this._to.set(target.x, this._restY(to), target.z);
    this._fromHeight = this.tilemap.heightOf(from);
    this._toHeight = this.tilemap.heightOf(to);
    this._hopScale = this._wading(from) || this._wading(to) ? 0.25 : 1;
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

    if (!silent) {
      this.onStep?.({ gx: from.gx, gz: from.gz }, { gx: to.gx, gz: to.gz });
    }
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
      // Ground can move: an elevator carries whoever is standing on it, so the
      // mesh is put back on its tile every frame rather than only when a step ends.
      this._followGround();
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
      this.tilemap.onEnter(this.gx, this.gz, this.inventory, this.layer);
      if (!this._takePad()) this._settleOrSlide(carry);
    }
  }

  /**
   * A pad, if this tile is one: the player is put down at the other end.
   *
   * The trip ends whatever was happening — a slide stops, a held direction has to be
   * asked for again — because arriving somewhere else is not a step, and carrying a
   * slide's momentum through a pad would be a way to be flung out of the level.
   *
   * The pad arrived on cannot send you back until you step off it, or the pair would
   * be a loop with no way out.
   *
   * @returns {boolean} whether a pad took the player somewhere
   */
  _takePad() {
    if (this._arrivedByPad) return false;

    const destination = this.tilemap.takePad(this.tile);
    if (!destination) return false;

    this.tile = destination;
    this.gx = destination.gx;
    this.gz = destination.gz;
    // No claim to have come from anywhere: a patrol cannot catch a player who was
    // never between the two tiles.
    this.prevGx = this.gx;
    this.prevGz = this.gz;
    this._arrivedByPad = true;
    this._sliding = false;
    this._moving = false;
    this._t = 0;
    this._snapToGrid();
    this._applyPose();
    this.onTeleport?.();
    return true;
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
    const canGoOn =
      this.tilemap.isSlipperyTile(this.tile) &&
      !this.inventory.won &&
      !this.inventory.dead &&
      this.tilemap.slideFrom(this.tile, dx, dz, this.inventory) !== null;

    if (!canGoOn) {
      this._sliding = false;
      this._continueHeld(carry);
      return;
    }

    if (!this._sliding) {
      this._sliding = true;
      this.onSlideStart?.();
    }
    this._beginMove(dx, dz, { carry, silent: true, sliding: true });
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
