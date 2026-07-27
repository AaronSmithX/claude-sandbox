import * as THREE from 'three';

// Gentle, because these sparks are meant to rise and fade rather than arc over
// and fall back like debris.
const GRAVITY = -1.6;

/**
 * A pool of star-shaped sparks, all drawn as one THREE.Points.
 *
 * Everything is preallocated: a burst writes over the oldest particles rather
 * than creating anything, so collecting items never allocates mid-frame. The
 * fade is done by scaling each particle's colour towards black, which under
 * additive blending is exactly a fade to nothing — no custom shader needed.
 */
export class Particles {
  constructor({ capacity = 160, size = 0.28 } = {}) {
    this.capacity = capacity;

    this._position = new Float32Array(capacity * 3);
    this._color = new Float32Array(capacity * 3); // what is drawn, i.e. faded
    this._base = new Float32Array(capacity * 3); // the colour it started at
    this._velocity = new Float32Array(capacity * 3);
    this._life = new Float32Array(capacity); // seconds left; 0 means free
    this._lifespan = new Float32Array(capacity);
    this._next = 0; // round-robin write cursor

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this._position, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this._color, 3));
    this.geometry = geometry;

    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        map: makeStarTexture(),
      }),
    );
    // One object covers the whole level, so culling it by its (stale) bounds
    // would only ever be wrong.
    this.points.frustumCulled = false;
  }

  /**
   * Sends a few sparks rushing up out of a point.
   * @param {THREE.Vector3} at
   * @param {{color?: number, count?: number, rise?: number, spread?: number,
   *   life?: number}} [options]
   *   `rise` is the upward speed and `spread` how far they wander sideways on the
   *   way up. Keep `spread` small: a wide one reads as an explosion, and this is
   *   meant to read as a column of sparks lifting off the item.
   */
  burst(at, { color = 0xffffff, count = 9, rise = 2.5, spread = 0.5, life = 0.7 } = {}) {
    const tint = new THREE.Color(color);

    for (let n = 0; n < count; n++) {
      this._next = (this._next + 1) % this.capacity;
      const i = this._next;
      const j = i * 3;

      // Scattered around a small circle and launched upward, so the group climbs
      // together and only drifts apart a little as it goes.
      const angle = Math.random() * Math.PI * 2;
      const offset = Math.random() * 0.12;

      this._position[j] = at.x + Math.cos(angle) * offset;
      this._position[j + 1] = at.y;
      this._position[j + 2] = at.z + Math.sin(angle) * offset;

      this._velocity[j] = Math.cos(angle) * spread * Math.random();
      this._velocity[j + 1] = rise * (0.75 + Math.random() * 0.5);
      this._velocity[j + 2] = Math.sin(angle) * spread * Math.random();

      this._base[j] = this._color[j] = tint.r;
      this._base[j + 1] = this._color[j + 1] = tint.g;
      this._base[j + 2] = this._color[j + 2] = tint.b;

      this._lifespan[i] = this._life[i] = life * (0.7 + Math.random() * 0.6);
    }
  }

  update(dt) {
    let live = 0;

    for (let i = 0; i < this.capacity; i++) {
      if (this._life[i] <= 0) continue;
      live++;

      this._life[i] -= dt;
      const j = i * 3;

      if (this._life[i] <= 0) {
        // Snap to black rather than leaving a bright dot behind.
        this._color[j] = this._color[j + 1] = this._color[j + 2] = 0;
        continue;
      }

      this._velocity[j + 1] += GRAVITY * dt;
      this._position[j] += this._velocity[j] * dt;
      this._position[j + 1] += this._velocity[j + 1] * dt;
      this._position[j + 2] += this._velocity[j + 2] * dt;

      const remaining = this._life[i] / this._lifespan[i];
      const fade = remaining * remaining;
      this._color[j] = this._base[j] * fade;
      this._color[j + 1] = this._base[j + 1] * fade;
      this._color[j + 2] = this._base[j + 2] * fade;
    }

    if (live) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
    }
  }

  /** Clears everything in flight, for a restart. */
  reset() {
    this._life.fill(0);
    this._color.fill(0);
    this.geometry.attributes.color.needsUpdate = true;
  }
}

/**
 * A four-pointed star with a bright core, drawn once into a canvas. Round points
 * would read as bubbles; the spikes are what make a pickup feel sparkly.
 */
function makeStarTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;

  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  const long = c * 0.95;
  const short = c * 0.16;
  ctx.moveTo(c, c - long);
  ctx.lineTo(c + short, c - short);
  ctx.lineTo(c + long, c);
  ctx.lineTo(c + short, c + short);
  ctx.lineTo(c, c + long);
  ctx.lineTo(c - short, c + short);
  ctx.lineTo(c - long, c);
  ctx.lineTo(c - short, c - short);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
