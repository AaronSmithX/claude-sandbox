/**
 * What the player has cleared, remembered between visits.
 *
 * The only thing worth saving is the set of stage ids that have been finished —
 * everything else the level list shows (which stages are locked, which is next)
 * is derived from that in campaign.js. Ids rather than indices, so reordering or
 * inserting a stage cannot silently hand someone else's progress to the wrong
 * level.
 *
 * Storage is injected rather than reached for, which is what lets the tests drive
 * this without a browser. It is also allowed to be missing or hostile: Safari's
 * private mode throws from `setItem`, and a user can put anything under our key.
 * Neither is worth losing a session over, so a failure here degrades to
 * remembering nothing rather than throwing into the game's start-up.
 *
 * @typedef {object} ProgressStorage
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */

/** Versioned, so a future change of shape can be told from this one. */
export const STORAGE_KEY = 'tile-runner:progress:v1';

export class Progress {
  /**
   * @param {ProgressStorage | null} [storage] defaults to `localStorage` where there
   *   is one; pass null for a run that deliberately remembers nothing.
   * @param {string} [key]
   */
  constructor(storage = defaultStorage(), key = STORAGE_KEY) {
    this._storage = storage;
    this._key = key;
    /** @type {Set<string>} */
    this._completed = new Set(this._read());
  }

  /** The ids cleared so far. A copy: completing a stage goes through `complete`. */
  get completed() {
    return new Set(this._completed);
  }

  get size() {
    return this._completed.size;
  }

  /** @param {string} id */
  has(id) {
    return this._completed.has(id);
  }

  /**
   * Records a stage as cleared.
   * @param {string} id
   * @returns {boolean} whether this was the first time
   */
  complete(id) {
    if (!id || this._completed.has(id)) return false;
    this._completed.add(id);
    this._write();
    return true;
  }

  /** Forgets everything, on disk as well as in memory. */
  clear() {
    this._completed.clear();
    try {
      this._storage?.removeItem(this._key);
    } catch {
      // Nothing to do about a storage that will not forget.
    }
  }

  /** @returns {string[]} */
  _read() {
    /** @type {string | null} */
    let raw = null;
    try {
      raw = this._storage?.getItem(this._key) ?? null;
    } catch {
      return [];
    }
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      // Anything that is not a list of strings is someone else's data, or ours
      // from a shape we no longer speak. Either way it is not progress.
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((id) => typeof id === 'string');
    } catch {
      return [];
    }
  }

  _write() {
    try {
      this._storage?.setItem(this._key, JSON.stringify([...this._completed]));
    } catch {
      // A full or read-only store still leaves this session playable; it just
      // will not be there tomorrow.
    }
  }
}

/**
 * `localStorage` where the platform has one. Merely touching it can throw when
 * cookies are blocked, so even the lookup is guarded.
 * @returns {ProgressStorage | null}
 */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
