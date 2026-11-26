/**
 * 小游戏共用的小工具。
 */

export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

export function button(label, { className = '', onClick, icon = '' } = {}) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `mini-btn ${className}`.trim();
  if (icon) {
    const span = document.createElement('span');
    span.innerHTML = icon;
    node.appendChild(span.firstChild || span);
  }
  if (label) node.appendChild(document.createTextNode(label));
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

export function hudPill(label, value, className = '') {
  const node = el('span', `hud-pill ${className}`.trim());
  node.append(el('span', '', label), el('strong', '', String(value)));
  return node;
}

export function formatTime(seconds, withMs = false) {
  const total = Math.max(0, Number(seconds) || 0);
  const whole = Math.floor(total);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const base = `${minutes}:${String(rest).padStart(2, '0')}`;
  if (!withMs) return base;
  return `${base}.${String(Math.floor((total % 1) * 10)).padStart(1, '0')}`;
}

export function formatScore(value) {
  return Math.max(0, Number(value) || 0).toLocaleString('zh-CN');
}

export function setChildren(container, children) {
  container.replaceChildren(...children);
}

export function bindSwipe(element, onSwipe) {
  let start = null;
  const down = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const up = (event) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? 'right' : 'left');
    else onSwipe(dy > 0 ? 'down' : 'up');
  };
  const cancel = () => {
    start = null;
  };
  element.addEventListener('pointerdown', down);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', cancel);
  return () => {
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', cancel);
  };
}

export function plainBoard(size, value = 0) {
  return Array.from({ length: size }, () => Array(size).fill(value));
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export const KEY_DIRECTIONS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

export function createKeyHandler(handler) {
  const listener = (event) => {
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const handled = handler(event);
    if (handled) event.preventDefault();
  };
  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
}
