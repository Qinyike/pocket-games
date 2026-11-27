export function puzzleGrid(stage, size, label, onAction, onMark, rows = size) {
  const grid = document.createElement('div');
  grid.className = 'puzzle-grid';
  grid.style.setProperty('--columns', size);
  grid.setAttribute('aria-label', label);
  grid.setAttribute('role', 'group');
  const cells = Array.from({ length: size * rows }, (_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'puzzle-cell';
    button.tabIndex = index === 0 ? 0 : -1;
    return button;
  });
  let selected = 0;
  grid.append(...cells);
  stage.querySelector('.puzzle-grid')?.remove();
  stage.prepend(grid);
  const indexOf = target => cells.indexOf(target.closest('.puzzle-cell'));
  grid.addEventListener('focusin', event => {
    const index = indexOf(event.target);
    if (index < 0 || index === selected) return;
    cells[selected].tabIndex = -1;
    selected = index;
    cells[selected].tabIndex = 0;
  });
  grid.addEventListener('click', event => {
    const index = indexOf(event.target);
    if (index >= 0) onAction(index);
  });
  if (onMark) grid.addEventListener('contextmenu', event => {
    const index = indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    onMark(index);
  });
  grid.addEventListener('keydown', event => {
    const index = indexOf(event.target);
    if (index < 0) return;
    const x = index % size, y = Math.floor(index / size);
    const move = { ArrowLeft:x>0 && index-1, ArrowRight:x<size-1 && index+1, ArrowUp:y>0 && index-size, ArrowDown:y<rows-1 && index+size };
    if (Object.hasOwn(move, event.key)) {
      event.preventDefault();
      if (move[event.key] !== false) cells[move[event.key]].focus();
    } else if (onMark && event.code === 'KeyF') {
      event.preventDefault();
      onMark(index);
    }
  });
  return cells;
}
