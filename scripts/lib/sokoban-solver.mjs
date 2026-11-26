/**
 * 推箱子关卡分析与求解器（仅用于生成关卡和测试，不进入线上包）。
 *
 * 求解按「推动」为单位做 BFS：箱子布局相同、玩家可达区域相同的状态
 * 视为等价，因此可以大幅剪枝。返回最少推动次数。
 */

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const WALL = '#';
const GOAL = '.';
const PLAYER = '@';
const BOX = '$';
const BOX_ON_GOAL = '*';
const PLAYER_ON_GOAL = '+';

/**
 * @param {string} text
 */
export function parseLevel(text) {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const rows = raw.length;
  const cols = Math.max(...raw.map((line) => line.length));
  const walls = new Uint8Array(cols * rows);
  const goals = new Set();
  const boxes = [];
  let player = -1;

  for (let y = 0; y < rows; y += 1) {
    const line = raw[y].padEnd(cols, ' ');
    for (let x = 0; x < cols; x += 1) {
      const ch = line[x];
      const cell = y * cols + x;
      if (ch === WALL) {
        walls[cell] = 1;
        continue;
      }
      if (ch === GOAL || ch === BOX_ON_GOAL || ch === PLAYER_ON_GOAL) {
        goals.add(cell);
      }
      if (ch === BOX || ch === BOX_ON_GOAL) {
        boxes.push(cell);
      }
      if (ch === PLAYER || ch === PLAYER_ON_GOAL) {
        if (player !== -1) {
          throw new Error('关卡里只能有一个玩家');
        }
        player = cell;
      }
      if (
        ch !== ' ' &&
        ch !== '-' &&
        ch !== '_' &&
        ch !== WALL &&
        ch !== GOAL &&
        ch !== BOX &&
        ch !== BOX_ON_GOAL &&
        ch !== PLAYER &&
        ch !== PLAYER_ON_GOAL
      ) {
        throw new Error(`无法识别的字符：${JSON.stringify(ch)}`);
      }
    }
  }

  if (player === -1) {
    throw new Error('关卡里没有玩家');
  }
  if (boxes.length === 0) {
    throw new Error('关卡里没有箱子');
  }
  if (boxes.length !== goals.size) {
    throw new Error(`箱子 ${boxes.length} 个，目标点 ${goals.size} 个，数量不一致`);
  }
  for (const box of boxes) {
    if (walls[box]) {
      throw new Error('箱子在墙里');
    }
  }
  if (walls[player]) {
    throw new Error('玩家在墙里');
  }

  // 预先计算每个格子的四邻，避免 BFS 中反复做边界判断。
  const neighbors = new Int32Array(cols * rows * 4).fill(-1);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = y * cols + x;
      for (let d = 0; d < 4; d += 1) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
          neighbors[cell * 4 + d] = ny * cols + nx;
        }
      }
    }
  }

  return {
    cols,
    rows,
    walls,
    goals,
    boxes: boxes.sort((a, b) => a - b),
    player,
    neighbors,
    text: raw.join('\n'),
  };
}

/**
 * 推箱子 BFS。
 * @param {ReturnType<typeof parseLevel>} level
 * @param {{maxStates?: number}} [options]
 */
export function solve(level, options = {}) {
  const { maxStates = 400_000, timeLimitMs = 0 } = options;
  const { goals, walls, neighbors, cols, rows } = level;
  const stateSize = cols * rows;

  const reachable = new Int32Array(stateSize);
  let reachStamp = 0;

  const nextReach = new Int32Array(stateSize);
  let nextStamp = 0;

  /** 标记从 player 出发的可达区域，返回最小格号。 */
  function flood(player, boxesSet, marks, marksStamp) {
    const queue = [player];
    let head = 0;
    marks[player] = marksStamp;
    let minCell = player;
    while (head < queue.length) {
      const cell = queue[head];
      head += 1;
      if (cell < minCell) minCell = cell;
      for (let d = 0; d < 4; d += 1) {
        const next = neighbors[cell * 4 + d];
        if (next === -1 || walls[next] || boxesSet.has(next)) continue;
        if (marks[next] === marksStamp) continue;
        marks[next] = marksStamp;
        queue.push(next);
      }
    }
    return minCell;
  }

  const startBoxes = level.boxes.slice();
  const startSet = new Set(startBoxes);
  const startMin = flood(level.player, startSet, reachable, ++reachStamp);
  const startKey = `${startBoxes.join(',')}|${startMin}`;

  const queue = [{ boxes: startBoxes, player: level.player, pushes: 0 }];
  const visited = new Set([startKey]);
  const startedAt = Date.now();
  let head = 0;

  while (head < queue.length) {
    const state = queue[head];
    head += 1;

    if (timeLimitMs > 0 && (head & 255) === 0 && Date.now() - startedAt > timeLimitMs) {
      return {
        solvable: false,
        pushes: null,
        explored: visited.size,
        truncated: true,
      };
    }

    if (state.boxes.every((box) => goals.has(box))) {
      return {
        solvable: true,
        pushes: state.pushes,
        explored: visited.size,
        truncated: false,
      };
    }

    if (visited.size >= maxStates) {
      return {
        solvable: false,
        pushes: null,
        explored: visited.size,
        truncated: true,
      };
    }

    const boxSet = new Set(state.boxes);
    const currentStamp = ++reachStamp;
    flood(state.player, boxSet, reachable, currentStamp);

    for (let i = 0; i < state.boxes.length; i += 1) {
      const box = state.boxes[i];
      for (let d = 0; d < 4; d += 1) {
        const stand = neighbors[box * 4 + ((d + 2) % 4)];
        const dest = neighbors[box * 4 + d];
        if (stand === -1 || dest === -1) continue;
        if (walls[stand] || walls[dest]) continue;
        if (reachable[stand] !== currentStamp) continue;
        if (boxSet.has(dest)) continue;

        const nextBoxes = state.boxes.slice();
        nextBoxes[i] = dest;
        nextBoxes.sort((a, b) => a - b);
        const nextSet = new Set(nextBoxes);
        const nextMin = flood(box, nextSet, nextReach, ++nextStamp);
        const key = `${nextBoxes.join(',')}|${nextMin}`;
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ boxes: nextBoxes, player: box, pushes: state.pushes + 1 });
      }
    }
  }

  return {
    solvable: false,
    pushes: null,
    explored: visited.size,
    truncated: false,
  };
}

export function formatMap(level) {
  const boxSet = new Set(level.boxes);
  const chars = [];
  for (let y = 0; y < level.rows; y += 1) {
    let line = '';
    for (let x = 0; x < level.cols; x += 1) {
      const cell = y * level.cols + x;
      if (level.walls[cell]) line += WALL;
      else if (level.goals.has(cell) && boxSet.has(cell)) line += BOX_ON_GOAL;
      else if (level.goals.has(cell)) line += GOAL;
      else if (boxSet.has(cell)) line += BOX;
      else if (level.player === cell) line += PLAYER;
      else line += ' ';
    }
    chars.push(line);
  }
  return chars.join('\n');
}
