/**
 * 推箱子的纯逻辑层：解析关卡、移动、撤销、胜利判断。
 * 不接触 DOM，便于在 Node 里做单元测试。
 */

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export function keyOf(x, y) {
  return `${x},${y}`;
}

/**
 * @param {{map: string}} level
 */
export function parseLevel(level) {
  const lines = level.map.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
  const rows = lines.length;
  const cols = Math.max(...lines.map((line) => line.length));
  const walls = new Set();
  const goals = new Set();
  const boxes = new Set();
  const cells = [];
  let player = null;

  for (let y = 0; y < rows; y += 1) {
    const line = lines[y].padEnd(cols, ' ');
    const row = [];
    for (let x = 0; x < cols; x += 1) {
      const ch = line[x];
      row.push(ch);
      if (ch === '#') walls.add(keyOf(x, y));
      if (ch === '.' || ch === '*' || ch === '+') goals.add(keyOf(x, y));
      if (ch === '$' || ch === '*') boxes.add(keyOf(x, y));
      if (ch === '@' || ch === '+') {
        if (player) throw new Error('关卡里只能有一个玩家');
        player = { x, y };
      }
      if (!' #.*$@+_-'.includes(ch)) {
        throw new Error(`无法识别的关卡字符：${JSON.stringify(ch)}`);
      }
    }
    cells.push(row);
  }

  if (!player) throw new Error('关卡里没有玩家');
  if (boxes.size === 0) throw new Error('关卡里没有箱子');
  if (boxes.size !== goals.size) {
    throw new Error(`箱子 ${boxes.size} 个，目标点 ${goals.size} 个，数量不一致`);
  }

  return {
    id: level.id,
    name: level.name,
    difficulty: level.difficulty,
    hint: level.hint,
    par: level.par,
    cols,
    rows,
    cells,
    walls,
    goals,
    startPlayer: player,
    startBoxes: [...boxes].sort(),
    map: level.map,
  };
}

function cloneBoxSet(boxes) {
  return [...boxes].sort();
}

function isSolved(boxes, goals) {
  for (const box of boxes) {
    if (!goals.has(box)) return false;
  }
  return true;
}

/**
 * @param {ReturnType<typeof parseLevel>} level
 */
export function createGame(level) {
  return {
    level,
    player: { ...level.startPlayer },
    boxes: new Set(level.startBoxes),
    moves: 0,
    pushes: 0,
    facing: 'down',
    won: false,
    history: [],
  };
}

export function loadStateFromSnapshot(state, snapshot) {
  state.player = { ...snapshot.player };
  state.boxes = new Set(snapshot.boxes);
  state.moves = snapshot.moves;
  state.pushes = snapshot.pushes;
  state.facing = snapshot.facing || 'down';
  state.won = false;
}

/**
 * 执行一步移动。返回本步的事件信息，方便 UI 播放音效/动画。
 * @param {ReturnType<typeof createGame>} state
 * @param {keyof DIRECTIONS} direction
 */
export function move(state, direction) {
  if (state.won) return { moved: false, blocked: true, reason: 'won' };
  const dir = DIRECTIONS[direction];
  if (!dir) return { moved: false, blocked: true, reason: 'direction' };

  const { cols, rows, walls, goals } = state.level;
  const fromX = state.player.x;
  const fromY = state.player.y;
  const toX = fromX + dir.x;
  const toY = fromY + dir.y;

  const previousFacing = state.facing;
  state.facing = direction;

  if (toX < 0 || toY < 0 || toX >= cols || toY >= rows) {
    return { moved: false, blocked: true, reason: 'wall' };
  }
  const toKey = keyOf(toX, toY);
  if (walls.has(toKey)) {
    return { moved: false, blocked: true, reason: 'wall' };
  }

  const snapshot = {
    player: { x: fromX, y: fromY },
    boxes: cloneBoxSet(state.boxes),
    moves: state.moves,
    pushes: state.pushes,
    facing: previousFacing,
  };

  if (state.boxes.has(toKey)) {
    const beyondX = toX + dir.x;
    const beyondY = toY + dir.y;
    if (beyondX < 0 || beyondY < 0 || beyondX >= cols || beyondY >= rows) {
      return { moved: false, blocked: true, reason: 'box-wall' };
    }
    const beyondKey = keyOf(beyondX, beyondY);
    if (walls.has(beyondKey) || state.boxes.has(beyondKey)) {
      return { moved: false, blocked: true, reason: 'box-blocked' };
    }

    state.history.push(snapshot);
    state.boxes.delete(toKey);
    state.boxes.add(beyondKey);
    state.player = { x: toX, y: toY };
    state.moves += 1;
    state.pushes += 1;
    state.won = isSolved(state.boxes, goals);

    return {
      moved: true,
      pushed: true,
      won: state.won,
      box: { from: toKey, to: beyondKey },
      onGoal: goals.has(beyondKey),
      position: { x: toX, y: toY },
    };
  }

  state.history.push(snapshot);
  state.player = { x: toX, y: toY };
  state.moves += 1;
  state.won = isSolved(state.boxes, goals);
  return {
    moved: true,
    pushed: false,
    won: state.won,
    position: { x: toX, y: toY },
  };
}

export function undo(state) {
  if (state.history.length === 0) return false;
  const snapshot = state.history.pop();
  loadStateFromSnapshot(state, snapshot);
  return true;
}

export function reset(state) {
  loadStateFromSnapshot(state, {
    player: state.level.startPlayer,
    boxes: state.level.startBoxes,
    moves: 0,
    pushes: 0,
    facing: 'down',
  });
  state.history = [];
}

export function canUndo(state) {
  return state.history.length > 0;
}

/**
 * 只检查最明显的死锁：不在目标点上的箱子被两面垂直的墙夹住。
 * 不追求完备，够用来提示玩家「可以撤销」。
 */
export function hasSimpleDeadlock(state) {
  const { walls, goals, cols, rows } = state.level;
  for (const box of state.boxes) {
    if (goals.has(box)) continue;
    const [x, y] = box.split(',').map(Number);
    const up = y <= 0 || walls.has(keyOf(x, y - 1));
    const down = y >= rows - 1 || walls.has(keyOf(x, y + 1));
    const left = x <= 0 || walls.has(keyOf(x - 1, y));
    const right = x >= cols - 1 || walls.has(keyOf(x + 1, y));
    if ((up && left) || (up && right) || (down && left) || (down && right)) {
      return true;
    }
  }
  return false;
}

export function countBoxesOnGoals(state) {
  let count = 0;
  for (const box of state.boxes) {
    if (state.level.goals.has(box)) count += 1;
  }
  return count;
}
