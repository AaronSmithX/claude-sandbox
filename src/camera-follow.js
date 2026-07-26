import * as THREE from 'three';

/**
 * Keeps an angled overhead camera at a fixed offset from the player and smoothly
 * following it — the classic grid/top-down look with a bit of perspective.
 */
export class CameraFollow {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target; // an Object3D whose .position we track
    this.offset = new THREE.Vector3(0, 9, 7); // above and behind
    this._look = new THREE.Vector3();

    // Snap into place on creation.
    this.camera.position.copy(this.target.position).add(this.offset);
    this.camera.lookAt(this.target.position);
  }

  update(dt) {
    const desired = this._look.copy(this.target.position).add(this.offset);
    // Exponential smoothing toward the desired position.
    const k = 1 - Math.pow(0.001, dt);
    this.camera.position.lerp(desired, k);
    this.camera.lookAt(this.target.position);
  }
}
