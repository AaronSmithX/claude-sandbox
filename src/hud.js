import { KEY_COLORS } from './tilemap.js';

/**
 * The inventory HUD: a glass bar pinned to the top of the screen showing the
 * keys, the inner tube and the star. Chips are dimmed until the item is held,
 * so the bar doubles as a checklist of what the level expects you to find.
 *
 * Which chips are on the bar depends on the stage: a stage with no water has
 * nothing to say about the inner tube, and a dimmed chip for an item that does not
 * exist reads as something missed rather than something absent.
 *
 * @returns {{setStage: (info: {tilemap: object, name: string, index: number, total: number}) => void}}
 */
export function setupHud(inventory) {
  const root = document.getElementById('hud');
  const label = document.getElementById('stage-label');
  if (!root) return { setStage() {} };

  const chips = {};

  for (const [color, hex] of Object.entries(KEY_COLORS)) {
    chips[color] = addChip(root, `${color} key`, keySvg(cssHex(hex)));
  }
  chips.tube = addChip(root, 'inner tube', tubeSvg('#ff7a45'));
  chips.star = addChip(root, 'star', starSvg('#ffe066'));

  function render(inv) {
    for (const color of Object.keys(KEY_COLORS)) {
      const count = inv.keyCount(color);
      chips[color].classList.toggle('is-held', count > 0);
      chips[color].querySelector('.chip-count').textContent = count > 1 ? `x${count}` : '';
    }
    chips.tube.classList.toggle('is-held', inv.hasTube);
    chips.star.classList.toggle('is-held', inv.won);
  }

  inventory.onChange = render;
  render(inventory);

  return {
    setStage({ tilemap, name, index, total }) {
      if (label) label.textContent = `${index + 1}/${total} — ${name}`;

      // What the stage actually contains. A door counts as well as a key: the
      // colour is worth showing the moment the stage can ask you for it.
      const present = new Set();
      for (const tile of tilemap.tiles.flat()) {
        if (tile.type === 'key' || tile.type === 'door') present.add(tile.color);
        if (tile.type === 'tube' || tile.type === 'water') present.add('tube');
      }

      for (const color of Object.keys(KEY_COLORS)) {
        chips[color].classList.toggle('is-absent', !present.has(color));
      }
      chips.tube.classList.toggle('is-absent', !present.has('tube'));

      render(inventory);
    },
  };
}

function addChip(root, label, svg) {
  const chip = document.createElement('div');
  chip.className = 'hud-chip';
  chip.title = label;
  chip.setAttribute('aria-label', label);
  chip.innerHTML = `${svg}<span class="chip-count"></span>`;
  root.appendChild(chip);
  return chip;
}

function cssHex(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function keySvg(fill) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="8" cy="8" r="4.4" fill="none" stroke="${fill}" stroke-width="2.4" />
    <path d="M11 11 L20 20 M17 20 L20 17" fill="none" stroke="${fill}"
      stroke-width="2.4" stroke-linecap="round" />
  </svg>`;
}

function tubeSvg(fill) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8" fill="none" stroke="${fill}" stroke-width="4" />
  </svg>`;
}

function starSvg(fill) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5 14.9 9l7 .6-5.3 4.6 1.6 6.8L12 17.4 5.8 21l1.6-6.8L2.1 9.6l7-.6z"
      fill="${fill}" />
  </svg>`;
}
