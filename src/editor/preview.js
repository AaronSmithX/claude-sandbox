import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { StageScene } from '../stage-scene.js';
import { Player } from '../player.js';
import { Inventory } from '../inventory.js';
import { CameraFollow } from '../camera-follow.js';
import { tickWorld } from '../world.js';
import { TILE_SIZE } from '../tilemap.js';
import { configureTextures } from '../textures.js';
import { cameraYaw } from '../billboards.js';

/**
 * The right-hand half of the editor: one stage on the screen, rebuilt as the text
 * changes.
 *
 * This is `src/main.js` with the game taken out of it. The renderer, the scene, the
 * lights and the load-a-stage wiring are the same, because a preview that lit a map
 * differently would be lying about it; the campaign, the HUD, the audio and the
 * overlays are not here, because a level being typed has no progress to track.
 *
 * The one thing it does that the game does not is survive a map that will not parse.
 * `load` builds the new stage before it throws the old one away, so a half-typed row
 * leaves the last good level on the screen instead of a black rectangle.
 *
 * There are no sparks and no sound. Both are feedback on a step rather than anything
 * about the level, and what colour a spark is is a question main.js answers — there
 * is nothing here for a second copy of that to make clearer.
 */

/** How the camera behaves, and what the keys do. */
export const LOOK = 'look';
export const PLAY = 'play';

/** @typedef {(outcome: 'won' | 'died') => void} OutcomeHandler */

export class Preview {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    // Same call as the game makes, for the same reason: this preview has its own
    // renderer, and the texture module has no way to reach either of them itself.
    configureTextures({ anisotropy: this.renderer.capabilities.getMaxAnisotropy() });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1020);
    // The game's fog closes in at 22 units, which is right for a camera that sits
    // behind the player and wrong for one that can be pulled back to see a whole
    // map. Pushed out so that orbiting away does not grey the level out.
    this.scene.fog = new THREE.Fog(0x0b1020, 40, 90);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
    sun.position.set(6, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 50;
    this.scene.add(sun);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.05; // no going under the floor

    /** @type {StageScene | null} */
    this.loaded = null;
    /** @type {Player | null} */
    this.player = null;
    /** @type {CameraFollow | null} */
    this.follow = null;
    /** @type {import('../types.js').World | null} */
    this.world = null;
    this.inventory = new Inventory();
    this.mode = LOOK;
    /**
     * Fired when the run ends, with `'won'` or `'died'`, so the page can say which.
     * The preview puts itself back to the spawn a moment later either way: a level
     * being tested is walked over and over, and a frozen world helps nobody.
     * @type {?OutcomeHandler}
     */
    this.onOutcome = null;
    this._restartIn = 0;
    /** @type {?{position: THREE.Vector3, target: THREE.Vector3}} */
    this._view = null;
    // The orbit camera is framed on the first stage only. After that the view is the
    // author's, and a keystroke must not take it away from them.
    this._framed = false;

    this._resize();
    this._observer = new ResizeObserver(() => this._resize());
    this._observer.observe(container);

    this._clock = new THREE.Clock();
    this._frame = requestAnimationFrame(this._tick);
  }

  /**
   * Puts a stage on the screen, replacing whatever was there.
   *
   * Throws whatever `TileMap` throws for a map it cannot parse — and leaves the
   * previous stage untouched when it does, which is the point of building first.
   *
   * @param {import('../levels.js').Stage} stage
   */
  load(stage) {
    const next = new StageScene(stage);

    if (this.loaded) {
      this.scene.remove(this.loaded.root);
      this.loaded.dispose();
    }
    this.loaded = next;
    this.scene.add(next.root);

    // As in main.js: the player is made on the first load and carried between
    // stages after that, because the camera follows its mesh.
    if (!this.player) {
      const first = new Player(next.tilemap, this.inventory);
      this.player = first;
      this.follow = new CameraFollow(this.camera, first.mesh, {
        groundY: () => first.elevation,
      });
      first.onTeleport = () => this.follow?.snap();
    } else {
      this.player.setTilemap(next.tilemap);
    }

    const player = this.player;
    const { tilemap, blocks } = next;
    next.root.add(player.mesh);
    tilemap.occupants = () => [{ tile: player.tile }, ...blocks.occupants()];
    player.blocks = blocks;
    tilemap.onWin = () => this._end('won');

    this.world = {
      tilemap,
      player,
      enemies: next.enemies,
      inventory: this.inventory,
      blocks,
    };
    this.inventory.reset();
    blocks.reset();
    this._restartIn = 0;

    if (this.mode === PLAY) this.follow?.snap();
    if (!this._framed) {
      this.frame();
      this._framed = true;
    }
  }

  /** Back to the spawn with nothing carried, without rebuilding the meshes. */
  reset() {
    this._restartIn = 0;
    if (!this.loaded || !this.player) return;
    this.loaded.tilemap.reset();
    this.loaded.blocks.reset();
    this.loaded.enemies.reset();
    this.inventory.reset();
    this.player.reset();
    if (this.mode === PLAY) this.follow?.snap();
  }

  /**
   * Pulls the orbit camera back until the whole map is in shot, looking down at it
   * from the same corner the game's camera does.
   */
  frame() {
    if (!this.loaded) return;
    const { cols, rows } = this.loaded.tilemap;
    // Far enough back that the wider of the two dimensions fits across the frame,
    // with a little air around it.
    const span = Math.max(cols, rows) * TILE_SIZE;
    const distance = span / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) + 4;
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, distance * 0.75, distance * 0.65);
    this.controls.update();
  }

  /**
   * Look or play. Leaving play mode lets go of every held key, for the same reason
   * `src/input.js` does on blur: a key held as focus goes away would walk on forever.
   *
   * @param {typeof LOOK | typeof PLAY} mode
   */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.controls.enabled = mode === LOOK;
    if (mode === PLAY) {
      // Where the author was looking, kept for when they come back to it. Playing
      // borrows the camera; it should not cost them the view they set up.
      this._view = {
        position: this.camera.position.clone(),
        target: this.controls.target.clone(),
      };
      this.follow?.snap();
    } else {
      this.player?.releaseAll();
      if (this._view) {
        this.camera.position.copy(this._view.position);
        this.controls.target.copy(this._view.target);
      }
      this.controls.update(); // re-aims the camera, which the follow had frozen
    }
  }

  dispose() {
    cancelAnimationFrame(this._frame);
    this._observer.disconnect();
    this.controls.dispose();
    if (this.loaded) {
      this.scene.remove(this.loaded.root);
      this.loaded.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  _resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * The game's loop, minus the campaign. The world is ticked in look mode too:
   * elevators, patrols and the bob on a key are half of what a level looks like,
   * and freezing them would make the preview less honest, not more.
   */
  _tick = () => {
    this._frame = requestAnimationFrame(this._tick);
    const dt = Math.min(this._clock.getDelta(), 0.05);

    if (this.world && tickWorld(this.world, dt).died) this._end('died');
    if (this._restartIn > 0 && (this._restartIn -= dt) <= 0) this.reset();

    if (this.mode === PLAY) this.follow?.update(dt);
    else this.controls.update();
    // Unlike the game's, this camera really does turn, so anything drawn as a flat
    // card is told where it is looking every frame rather than once per stage.
    this.loaded?.tilemap.setViewYaw(cameraYaw(this.camera));
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * The run is over, one way or the other: say so, and start the clock on putting
   * the level back the way it was.
   * @param {'won' | 'died'} outcome
   */
  _end(outcome) {
    this.onOutcome?.(outcome);
    this._restartIn = 1.2;
  }
}
