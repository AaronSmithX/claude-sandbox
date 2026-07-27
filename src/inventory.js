/**
 * What the player is carrying. Deliberately free of Three.js and DOM so the
 * rules in tilemap.js and the HUD can both read it without coupling.
 */
export class Inventory {
  constructor() {
    /** @type {((inventory: Inventory) => void) | null} */
    this.onChange = null;
    /** @type {Record<string, number>} */
    this.keys = {};
    this.hasTube = false;
    this.won = false;
    this.dead = false;
    this.reset();
  }

  reset() {
    this.keys = { gold: 0, violet: 0, white: 0 };
    this.hasTube = false;
    this.won = false;
    this.dead = false;
    this._changed();
  }

  keyCount(color) {
    return this.keys[color] ?? 0;
  }

  addKey(color) {
    this.keys[color] = this.keyCount(color) + 1;
    this._changed();
  }

  /** Spends one key of `color`. Returns false when there is none to spend. */
  useKey(color) {
    if (this.keyCount(color) <= 0) return false;
    this.keys[color] -= 1;
    this._changed();
    return true;
  }

  setTube(value) {
    this.hasTube = value;
    this._changed();
  }

  setWon(value) {
    this.won = value;
    this._changed();
  }

  setDead(value) {
    this.dead = value;
    this._changed();
  }

  _changed() {
    this.onChange?.(this);
  }
}
