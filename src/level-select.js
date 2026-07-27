/**
 * The level list: one row per stage, locked ones behind a padlock and a row of
 * question marks, cleared ones with a star.
 *
 * All the deciding happens in campaign.js — this is handed rows that already know
 * what they are called and whether they can be clicked, and turns them into
 * buttons. A locked row is a disabled button rather than a styled div, so it
 * announces itself as unavailable and cannot be tabbed onto or clicked.
 */

/**
 * @param {{onSelect: (index: number) => void}} handlers
 * @returns {{render: (levels: import('./campaign.js').LevelEntry[]) => void}}
 */
export function setupLevelSelect({ onSelect }) {
  const root = document.getElementById('level-list');
  if (!root) return { render() {} };

  // One listener on the list rather than one per row, so a re-render is not also a
  // round of unbinding.
  root.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const button = target.closest?.('.level-row');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    onSelect(Number(button.dataset.index));
  });

  return {
    render(levels) {
      root.replaceChildren(
        ...levels.map((level) => {
          const item = document.createElement('li');
          item.appendChild(row(level));
          return item;
        }),
      );
    },
  };
}

/** @param {import('./campaign.js').LevelEntry} level */
function row({ index, name, locked, completed }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'level-row';
  button.dataset.index = String(index);
  button.disabled = locked;
  if (locked) button.classList.add('is-locked');
  if (completed) button.classList.add('is-cleared');

  // The mark on the left says whether you may go in; the one on the right says
  // whether you have. A locked row is read out as locked rather than as '???'.
  const mark = locked ? lockSvg() : `<span class="level-number">${index + 1}</span>`;
  const clear = completed ? starSvg() : '';
  button.innerHTML =
    `<span class="level-mark">${mark}</span>` +
    `<span class="level-name">${escapeHtml(name)}</span>` +
    `<span class="level-clear">${clear}</span>`;

  button.setAttribute(
    'aria-label',
    locked
      ? `Level ${index + 1}, locked`
      : `Level ${index + 1}, ${name}${completed ? ', cleared' : ''}`,
  );
  return button;
}

/**
 * Stage names are ours, not the player's, but they land in innerHTML — and the
 * hints next door are already written as markup, so it is not obvious from the
 * data which of the two a name is.
 * @param {string} text
 */
function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function lockSvg() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>`;
}

function starSvg() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5 14.9 9l7 .6-5.3 4.6 1.6 6.8L12 17.4 5.8 21l1.6-6.8L2.1 9.6l7-.6z"
      fill="#ffe066" />
  </svg>`;
}
