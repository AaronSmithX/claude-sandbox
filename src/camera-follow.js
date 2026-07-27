import * as THREE from 'three';

const _change = new THREE.Vector3();
const _temp = new THREE.Vector3();

/**
 * Critically damped spring, as in Unity's SmoothDamp. Unlike a plain lerp it has
 * continuous velocity, so a change of direction eases instead of snapping —
 * which is what used to read as camera shake when the player turned a corner.
 */
function smoothDamp(current, target, vel, smoothTime, dt) {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  _change.subVectors(current, target);
  _temp.copy(vel).addScaledVector(_change, omega).multiplyScalar(dt);
  vel.addScaledVector(_temp, -omega).multiplyScalar(decay);
  current.copy(target).add(_change.add(_temp).multiplyScalar(decay));
}

/**
 * Keeps an angled overhead camera at a fixed offset from the player.
 *
 * The camera's orientation is computed once and then frozen: the world slides
 * underneath a camera that never turns. Re-aiming with `lookAt` every frame is
 * the obvious approach but a bad one here — the camera always lags the player a
 * little, and `lookAt` turns that positional lag into a rotation swing whose
 * axis depends on which way the player is walking. The frame visibly rocks on
 * every step. A frozen orientation cannot do that.
 */
export class CameraFollow {
  constructor(camera, target, { offset, smoothTime = 0.3, followY = 0.35 } = {}) {
    this.camera = camera;
    this.target = target; // an Object3D whose .position we track
    // Above and behind. Pulled back from the original 9/7 to suit the larger
    // 16x16 level, so a whole room and its exits fit on screen at once.
    this.offset = (offset ?? new THREE.Vector3(0, 11, 8.5)).clone();
    this.smoothTime = smoothTime;
    // The height the camera pretends the player is at, so that the walk bob,
    // the hop and the water sink never move the frame.
    this.followY = followY;

    this._desired = new THREE.Vector3();
    this._velocity = new THREE.Vector3();

    // Aim once at the origin from the offset, then keep that rotation forever.
    this.camera.position.copy(this.offset);
    this.camera.lookAt(0, 0, 0);
    this._quaternion = this.camera.quaternion.clone();

    this.snap();
  }

  /** Where the camera wants to be, ignoring the target's height. */
  _focus(out) {
    return out
      .set(this.target.position.x, this.followY, this.target.position.z)
      .add(this.offset);
  }

  /** Teleports the camera into place and kills its momentum, as on a restart. */
  snap() {
    this.camera.position.copy(this._focus(this._desired));
    this.camera.quaternion.copy(this._quaternion);
    this._velocity.set(0, 0, 0);
  }

  update(dt) {
    smoothDamp(
      this.camera.position,
      this._focus(this._desired),
      this._velocity,
      this.smoothTime,
      dt,
    );
    this.camera.quaternion.copy(this._quaternion);
  }
}
