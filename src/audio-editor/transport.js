import { Synth } from '../audio/synth.js';

/**
 * Play, stop, mute, solo — the editor's grip on the synth.
 *
 * The interesting part is what happens when the score changes while it is playing. The
 * synth queues about a sixth of a second ahead and no more, so a mute is a matter of
 * answering differently the next time it asks, and needs no restart. A note that has
 * *moved*, though, means a new score object, and the only honest thing is to start it
 * again — so it is started again from where the old one had got to, and an edit is
 * heard as the music carrying on rather than as a jump back to the top.
 *
 * @typedef {import('../audio/score.js').Score} Score
 */
export class Transport {
  constructor() {
    // Louder than the game's default: nothing else is competing for the speakers here,
    // and a score is being judged rather than played under something.
    this.synth = new Synth({ volume: 0.8 });
    /** @type {?Score} */
    this.score = null;
    /** @type {?{stop: () => void, position: () => number}} */
    this.handle = null;
    /** @type {Set<string>} */
    this.muted = new Set();
    /** @type {Set<string>} */
    this.soloed = new Set();
  }

  get playing() {
    return this.handle !== null;
  }

  /**
   * Whether a track is silent right now. A solo anywhere mutes everything it does not
   * name, which is what makes solo useful and is why it cannot just be a second Set of
   * mutes applied alongside the first.
   *
   * @param {string} name
   */
  isMuted(name) {
    if (this.soloed.size > 0) return !this.soloed.has(name);
    return this.muted.has(name);
  }

  /** Seconds into the score, or 0 when stopped. */
  position() {
    return this.handle?.position() ?? 0;
  }

  /**
   * Starts, or restarts, from `at` seconds in.
   * @param {number} [at]
   */
  start(at = 0) {
    if (!this.score) return;
    this.synth.unlock();
    this.handle?.stop();
    this.handle = this.synth.play(this.score, {
      at,
      isMuted: (name) => this.isMuted(name),
      // A one-shot goes through the bus the game would send a sound effect through,
      // so what you hear here is what the game will do with it.
      bus: this.score.loop ? this.synth.musicBus : this.synth.sfxBus,
    });
  }

  stop() {
    this.handle?.stop();
    this.handle = null;
  }

  /**
   * Takes a newly parsed score. If something is playing, it keeps playing — from the
   * same place, on the new notes.
   *
   * @param {Score} score
   */
  setScore(score) {
    const at = this.playing ? this.position() : 0;
    this.score = score;
    // A score that has got shorter can leave the old position past its end.
    if (this.playing) this.start(score.duration > 0 ? at % score.duration : 0);
  }

  toggle() {
    if (this.playing) this.stop();
    else this.start();
  }

  /** @param {string} name */
  toggleMute(name) {
    if (this.muted.has(name)) this.muted.delete(name);
    else this.muted.add(name);
  }

  /** @param {string} name */
  toggleSolo(name) {
    if (this.soloed.has(name)) this.soloed.delete(name);
    else this.soloed.add(name);
  }

  /** Drops every mute and solo — one button for "let me hear all of it again". */
  clearMutes() {
    this.muted.clear();
    this.soloed.clear();
  }
}
