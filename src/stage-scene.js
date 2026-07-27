import * as THREE from 'three';
import { TileMap } from './tilemap.js';
import { Enemies } from './enemy.js';
import { Blocks } from './blocks.js';
import { stageLayers } from './levels.js';

/**
 * Everything one stage puts on the screen, built together and thrown away together.
 *
 * A stage exists only while it is being played: the title screen, the level list and
 * the win panel have no map behind them, because there is no map. That means loading
 * and unloading happen far more often than they did when a stage was built once at
 * start-up, and it is worth having a single object that knows what a stage owns —
 * three groups' worth of meshes, none of which are garbage collected on their own.
 *
 * The player and the sparks are deliberately not here. Those outlive a stage: the
 * camera follows the player's mesh and the input is bound to it, so it is made once
 * and moved from map to map. main.js parents both to this root while a stage is
 * loaded, which is why unloading clears the root rather than disposing it.
 */
export class StageScene {
  /** @param {import('./levels.js').Stage} stage */
  constructor(stage) {
    this.tilemap = new TileMap(stageLayers(stage));
    this.enemies = new Enemies(this.tilemap);
    this.blocks = new Blocks(this.tilemap);

    /** One handle on the whole stage, for adding it to a scene and taking it out. */
    this.root = new THREE.Group();
    this.root.add(this.tilemap.group, this.enemies.group, this.blocks.group);
  }

  /**
   * Hands back every geometry and material the stage built, and empties the root —
   * including anything parented to it from outside, which is how the player and the
   * sparks come back out of a stage they are only visiting.
   */
  dispose() {
    this.tilemap.dispose();
    this.enemies.dispose();
    this.blocks.dispose();
    this.root.clear();
  }
}
