import { parseScore } from './score.js';
import { Synth } from './synth.js';

// Scores are imported as text rather than fetched. That keeps them out of the
// network path entirely — no loading state, no failure case, and no chance of the
// GitHub Pages base path ('/claude-sandbox/') being left off a URL. The cost is
// that editing a score needs a rebuild, which `npm run dev` does for you.
import themeSource from './scores/theme.txt?raw';
import ambienceSource from './scores/ambience.txt?raw';
import footstepSource from './scores/footstep.txt?raw';
import slideSource from './scores/slide.txt?raw';
import pickupSource from './scores/pickup.txt?raw';
import doorSource from './scores/door.txt?raw';
import switchSource from './scores/switch.txt?raw';
import deathSource from './scores/death.txt?raw';
import winSource from './scores/win.txt?raw';

/** Every score in the game, by name. Sound effects and music are the same thing. */
export const SCORE_SOURCES = {
  theme: themeSource,
  ambience: ambienceSource,
  footstep: footstepSource,
  slide: slideSource,
  pickup: pickupSource,
  door: doorSource,
  switch: switchSource,
  death: deathSource,
  win: winSource,
};

const MUSIC = ['theme', 'ambience'];
const MUTE_KEY = 'tilerunner.muted';

/**
 * The game's view of audio: start it, ask for a sound, mute it. Nothing here
 * touches Web Audio until `start()` runs inside a user gesture.
 */
export function createAudio() {
  const synth = new Synth();
  const scores = {};
  for (const [name, source] of Object.entries(SCORE_SOURCES)) {
    scores[name] = parseScore(source);
  }

  /** @type {?{stop: () => void}[]} */
  let playing = null;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    // Private browsing can refuse localStorage; unmuted is a fine default.
  }
  synth.setMuted(muted);

  return {
    get muted() {
      return muted;
    },

    /** Starts the music. Safe to call repeatedly; only the first call does work. */
    start() {
      synth.unlock();
      if (playing || !synth.ready) return;
      playing = MUSIC.map((name) => synth.play(scores[name]));
    },

    /** Plays a one-shot by name. Unknown names are ignored. */
    sfx(name) {
      const score = scores[name];
      if (score) synth.playOnce(score);
    },

    /** Pulls the music back so a fanfare or a death sting can be heard. */
    duckMusic(level = 0.18) {
      synth.setMusicLevel(level);
    },

    restoreMusic() {
      synth.setMusicLevel(0.75);
    },

    setMuted(value) {
      muted = value;
      synth.setMuted(value);
      try {
        localStorage.setItem(MUTE_KEY, value ? '1' : '0');
      } catch {
        // Not being able to remember the setting is not worth failing over.
      }
    },

    toggleMuted() {
      this.setMuted(!muted);
      return muted;
    },

    /** Suspends audio while the tab is hidden, so the schedule cannot starve. */
    watchVisibility() {
      document.addEventListener('visibilitychange', () => {
        if (!synth.ctx) return;
        // The lookahead scheduler is driven by setInterval, which browsers
        // throttle to about once a second in a background tab. Suspending stops
        // ctx.currentTime as well, so the queue stays consistent either way.
        if (document.hidden) synth.ctx.suspend();
        else synth.ctx.resume();
      });
    },
  };
}

/**
 * Runs `fn` on the first thing the player does, whatever that is. Browsers only
 * allow an AudioContext to start from a gesture, and this keeps that requirement
 * out of the input and touch modules.
 */
export function onFirstGesture(fn) {
  const events = ['pointerdown', 'keydown', 'touchstart'];
  const go = () => {
    for (const type of events) window.removeEventListener(type, go, true);
    fn();
  };
  for (const type of events) window.addEventListener(type, go, true);
}
