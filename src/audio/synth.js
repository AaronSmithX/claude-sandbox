/**
 * A tiny Web Audio synthesiser: it plays the scores from score.js with
 * oscillators and gain envelopes. Nothing is loaded from a media file, so the
 * whole soundtrack is a few kilobytes of text.
 */

// How far ahead notes are queued with the audio clock, and how often we top the
// queue up. Scheduling against ctx.currentTime rather than the render loop is
// what keeps the music in time regardless of frame rate.
const LOOKAHEAD = 0.15;
const PUMP_MS = 40;

const OSCILLATOR_TYPES = {
  sine: 'sine',
  square: 'square',
  triangle: 'triangle',
  saw: 'sawtooth',
};

export class Synth {
  /** @param {{volume?: number}} [options] */
  constructor({ volume = 0.5 } = {}) {
    // Everything below is built together by unlock(), and only from inside a user
    // gesture — so until then there is no graph at all, not a half-built one.
    /** @type {?AudioContext} */
    this.ctx = null;
    /** @type {?GainNode} */
    this.master = null;
    /** @type {?GainNode} */
    this.musicBus = null;
    /** @type {?GainNode} */
    this.sfxBus = null;
    this.volume = volume;
    this.muted = false;
    /** @type {?AudioBuffer} */
    this._noiseBuffer = null;
  }

  get ready() {
    return this.ctx !== null;
  }

  /**
   * Builds the audio graph. Must be called from inside a user gesture: browsers
   * refuse to start an AudioContext otherwise, which is also why nothing here
   * happens at module load.
   */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }

    const AudioContextClass =
      window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AudioContextClass) return; // no Web Audio: the game is simply silent
    this.ctx = new AudioContextClass();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);

    // Two buses, so a sound effect can cut through without the music ducking it.
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.75;
    this.musicBus.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);
  }

  setMuted(muted) {
    this.muted = muted;
    const { ctx, master } = this;
    if (!ctx || !master) return;
    // A short ramp rather than a jump, which would click.
    master.gain.setTargetAtTime(muted ? 0 : this.volume, ctx.currentTime, 0.02);
  }

  /** Fades the music down (or back up) without touching sound effects. */
  setMusicLevel(level, seconds = 0.4) {
    const { ctx, musicBus } = this;
    if (!ctx || !musicBus) return;
    musicBus.gain.setTargetAtTime(level, ctx.currentTime, seconds / 3);
  }

  /** Plays a whole short score immediately — for sound effects. */
  playOnce(score) {
    if (!this.ctx) return;
    const start = this.ctx.currentTime + 0.005;
    for (const track of score.tracks) {
      for (const note of track.notes) {
        this._schedule(track, note, start + note.time, this.sfxBus);
      }
    }
  }

  /**
   * Starts a looping score on the music bus.
   *
   * @param {import('./score.js').Score} score
   * @param {object} [options]
   * @param {(trackName: string) => boolean} [options.isMuted] asked before each note is
   *   queued rather than once at the start, so a track can be dropped and brought back
   *   while the score plays. Nothing is queued more than `LOOKAHEAD` ahead, which is
   *   what lets this work without a gain node per track: the change is audible within
   *   about a sixth of a second and needs no restart.
   * @param {GainNode|null} [options.bus] where to play it, defaulting to the music bus.
   * @param {number} [options.at] seconds into the score to take up from. The music
   *   editor uses it to carry on from where it was when you changed a note, rather
   *   than snapping back to the top on every keystroke.
   * @returns {{stop: () => void, position: () => number}} `position` is seconds since
   *   the score began, wrapped into its length — where a playhead goes.
   */
  play(score, { isMuted, bus, at = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return { stop() {}, position: () => 0 };

    const target = bus ?? this.musicBus;
    const cursors = score.tracks.map(() => 0);
    // Where note time 0 sits on the clock. Taking up part-way through puts it in the
    // past, and the notes already gone by are dropped by `_schedule` as too late to be
    // heard — their cursors still advance, so the queue catches up on the first pump.
    const begin = ctx.currentTime + 0.1 - at;
    let origin = begin;

    const pump = () => {
      const until = ctx.currentTime + LOOKAHEAD;

      // The loop below may cross the end of the score, in which case it rewinds
      // and keeps filling — so a short score never leaves a gap at the seam.
      for (let guard = 0; guard < 64; guard++) {
        score.tracks.forEach((track, i) => {
          while (cursors[i] < track.notes.length) {
            const note = track.notes[cursors[i]];
            if (origin + note.time >= until) break;
            if (!isMuted?.(track.name)) {
              this._schedule(track, note, origin + note.time, target);
            }
            cursors[i]++;
          }
        });

        const finished = cursors.every((c, i) => c >= score.tracks[i].notes.length);
        if (!finished || !score.loop || origin + score.duration >= until) break;
        origin += score.duration;
        cursors.fill(0);
      }
    };

    pump();
    const timer = setInterval(pump, PUMP_MS);
    return {
      stop: () => clearInterval(timer),
      // From `begin`, not from `origin` — `origin` walks forward a loop at a time as
      // the queue is filled, and is already ahead of what is being heard.
      position: () => {
        const elapsed = Math.max(0, ctx.currentTime - begin);
        if (!(score.duration > 0)) return elapsed;
        // A one-shot runs out rather than coming round, so its playhead stops at the
        // end instead of wrapping to somewhere nothing is playing.
        return score.loop ? elapsed % score.duration : Math.min(elapsed, score.duration);
      },
    };
  }

  /** One note: a source through its own envelope, into the given bus. */
  _schedule(track, note, at, bus) {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    if (note.freq === null && !note.hit) return; // a rest
    if (at < ctx.currentTime) return; // too late to be heard

    const [attack, decay, sustain, release] = track.env;
    const peak = track.gain;
    // Never ramp to a true zero: exponentialRampToValueAtTime cannot reach it.
    const held = Math.max(peak * sustain, 0.0001);
    // A note shorter than its own attack and decay is stretched to fit them,
    // which keeps every automation event in increasing time order.
    const bodyEnd = Math.max(at + note.dur, at + attack + decay);
    const stopAt = bodyEnd + release;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(peak, at + attack);
    envelope.gain.linearRampToValueAtTime(held, at + attack + decay);
    envelope.gain.setValueAtTime(held, bodyEnd);
    envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    envelope.connect(bus);

    let source;
    if (track.voice === 'noise') {
      source = ctx.createBufferSource();
      source.buffer = this._noise();
      source.loop = true;
    } else {
      source = ctx.createOscillator();
      source.type = OSCILLATOR_TYPES[track.voice];
      source.frequency.setValueAtTime(note.freq ?? 0, at);
    }
    source.connect(envelope);
    source.start(at);
    source.stop(stopAt + 0.02);
    source.onended = () => envelope.disconnect();
  }

  /** A second of white noise, made once and reused by every percussion hit. */
  _noise() {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this._noiseBuffer) {
      const length = ctx.sampleRate;
      this._noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this._noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this._noiseBuffer;
  }
}
