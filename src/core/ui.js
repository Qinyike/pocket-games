/**
 * 通用弹层、提示条与格式化工具。
 */

const overlay = document.getElementById('overlay');
const toastEl = document.getElementById('toast');

let dismissible = false;
let lastFocused = null;
let keyHandler = null;
let toastTimer = 0;
let onCloseCallback = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function focusables() {
  if (!overlay) return [];
  return [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && el.offsetParent !== null,
  );
}

function handleKeydown(event) {
  if (!overlay || overlay.hidden) return;
  if (event.key === 'Escape' && dismissible) {
    event.preventDefault();
    hideOverlay();
    return;
  }
  if (event.key !== 'Tab') return;
  const items = focusables();
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * @param {{
 *   kicker?: string,
 *   title: string,
 *   description?: string,
 *   stats?: Array<[string, string]>,
 *   html?: string,
 *   actions?: Array<{label: string, kind?: 'primary'|'cyan'|'ghost'|'danger', onClick?: () => (void|boolean)}>,
 *   dismissible?: boolean,
 *   theme?: string,
 *   onMount?: (card: HTMLElement) => void,
 *   onClose?: () => void,
 * }} options
 */
export function showOverlay(options) {
  if (!overlay) return;
  if (!overlay.hidden) {
    // 直接替换内容时不要触发旧弹层的关闭回调。
    onCloseCallback = null;
  }
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dismissible = options.dismissible !== false;
  onCloseCallback = options.onClose || null;

  const card = overlay.querySelector('.overlay-card');
  card.className = `overlay-card${options.theme ? ` ${options.theme}` : ''}`;
  const stats = (options.stats || [])
    .map(
      ([label, value]) => `
        <div class="overlay-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
      `,
    )
    .join('');
  const actions = (options.actions || [])
    .map(
      (action, index) => `
        <button class="btn ${action.kind === 'primary' ? 'btn-primary' : action.kind === 'cyan' ? 'btn-cyan' : action.kind === 'danger' ? 'btn-danger' : 'btn-ghost'}" type="button" data-overlay-action="${index}">
          ${escapeHtml(action.label)}
        </button>
      `,
    )
    .join('');

  card.innerHTML = `
    ${
      dismissible
        ? `<button class="overlay-close icon-btn" type="button" data-overlay-close aria-label="关闭" style="position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:11px;z-index:2">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>`
        : ''
    }
    ${options.kicker ? `<p class="overlay-kicker">${escapeHtml(options.kicker)}</p>` : ''}
    <h3 id="overlay-title">${escapeHtml(options.title)}</h3>
    ${options.description ? `<p class="overlay-desc">${escapeHtml(options.description)}</p>` : ''}
    ${stats ? `<div class="overlay-stats">${stats}</div>` : ''}
    ${options.html || ''}
    ${actions ? `<div class="overlay-actions">${actions}</div>` : ''}
  `;

  overlay.querySelector('[data-overlay-close]')?.addEventListener('click', hideOverlay);
  overlay.querySelector('[data-overlay-scrim]').onclick = dismissible ? hideOverlay : null;

  card.querySelectorAll('[data-overlay-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = options.actions[Number(button.dataset.overlayAction)];
      if (!action) return;
      const result = action.onClick ? action.onClick() : undefined;
      if (result === false) return;
      hideOverlay();
    });
  });

  overlay.hidden = false;
  document.body.classList.add('overlay-open');
  document.addEventListener('keydown', handleKeydown);
  keyHandler = handleKeydown;
  options.onMount?.(card);
  card.tabIndex = -1;

  // 让对话框本身获得焦点，避免手机触屏上出现一圈「自动聚焦」高亮。
  requestAnimationFrame(() => {
    card.focus({ preventScroll: true });
  });
}

export function hideOverlay() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('overlay-open');
  overlay.querySelector('.overlay-card').innerHTML = '';
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  const callback = onCloseCallback;
  onCloseCallback = null;
  if (lastFocused && document.contains(lastFocused)) {
    lastFocused.focus({ preventScroll: true });
  }
  callback?.();
}

export function isOverlayOpen() {
  return Boolean(overlay && !overlay.hidden);
}

export function toast(message, duration = 1900) {
  if (!toastEl) return;
  window.clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove('is-visible');
  }, duration);
}

export function formatNumber(value) {
  return Math.max(0, Number(value) || 0).toLocaleString('zh-CN');
}

export { escapeHtml };
