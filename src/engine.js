export const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
export const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem('pocket-arcade:3:' + key)) ?? fallback; }
  catch { return fallback; }
}

export function save(key, value) {
  try { localStorage.setItem('pocket-arcade:3:' + key, JSON.stringify(value)); }
  catch { /* The current game remains playable without storage. */ }
}

export function input(signal, mapping, press, active) {
  const sources = new Map();
  const actions = new Map();
  function down(source, action) {
    if (sources.has(source)) return;
    sources.set(source, action);
    const count = actions.get(action) ?? 0;
    actions.set(action, count + 1);
    if (!count) press(action);
  }
  function up(source) {
    const action = sources.get(source);
    if (!action) return;
    sources.delete(source);
    const count = actions.get(action) - 1;
    if (count) actions.set(action, count);
    else actions.delete(action);
  }
  function clear() {
    for (const source of sources.keys()) {
      if (typeof source === 'object') source.button.classList.remove('is-down');
    }
    sources.clear();
    actions.clear();
  }
  window.addEventListener('keydown', event => {
    const action = mapping[event.code];
    if (!action || event.target.closest?.('select,input,textarea') || event.ctrlKey || event.metaKey || event.altKey || !active()) return;
    if (event.code === 'Space' && event.target.closest?.('button,a') && !event.target.closest('.touch')) return;
    event.preventDefault();
    if (!event.repeat) down(event.code, action);
  }, { signal });
  window.addEventListener('keyup', event => up(event.code), { signal });
  window.addEventListener('blur', clear, { signal });
  signal.addEventListener('abort', clear, { once:true });
  function bind(button, action) {
    const source = { button };
    let pointer = null;
    button.addEventListener('pointerdown', event => {
      if (pointer !== null || event.button !== 0 || !active()) return;
      event.preventDefault();
      pointer = event.pointerId;
      button.setPointerCapture(pointer);
      button.classList.add('is-down');
      down(source, action);
    }, { signal });
    const release = event => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      button.classList.remove('is-down');
      up(source);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release, { signal });
    button.addEventListener('click', event => {
      if (event.detail === 0 && active()) press(action);
    }, { signal });
  }
  return { held: action => actions.has(action), clear, bind };
}

export function loop(signal, update, draw) {
  const step = 1 / 120;
  let frame;
  let previous = 0;
  let lag = 0;
  function tick(now) {
    if (previous) lag += Math.min(.05, (now - previous) / 1000);
    previous = now;
    while (lag >= step) {
      update(step);
      lag -= step;
    }
    draw();
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  signal.addEventListener('abort', () => cancelAnimationFrame(frame), { once:true });
}

export const arrows = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down', KeyA:'left', KeyD:'right', KeyW:'up', KeyS:'down' };
export const directions = { left:[-1,0], right:[1,0], up:[0,-1], down:[0,1] };
