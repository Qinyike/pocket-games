#!/usr/bin/env node
/**
 * 原创推箱子关卡生成器。
 *
 * 思路：先摆好「箱子已在目标点上」的通关状态，再随机执行合法的「反向拉箱」，
 * 同时让玩家真实走过去。因此每个产出的关卡天然可解。
 * 最后用推动 BFS 求出最少推动次数，按难度区间筛选。
 *
 * 用法：
 *   node scripts/generate-levels.mjs --seed 20261126
 *   node scripts/generate-levels.mjs --seed 7 --per-config 6 --json out.json
 */

import { writeFileSync } from 'node:fs';
import { parseLevel, solve, formatMap } from './lib/sokoban-solver.mjs';

const DIRS = [
  { dx: 0, dy: -1, name: 'up' },
  { dx: 1, dy: 0, name: 'right' },
  { dx: 0, dy: 1, name: 'down' },
  { dx: -1, dy: 0, name: 'left' },
];

const CONFIGS = [
  // 新手：单个箱子，开阔的房间。
  { id: 'tutorial', width: 7, height: 7, boxes: 1, walls: [0, 1], minLB: 2, maxLB: 4, pulls: 12, count: 4 },
  { id: 'easy', width: 8, height: 8, boxes: 1, walls: [1, 2], minLB: 4, maxLB: 7, pulls: 20, count: 4 },
  // 入门：两个箱子。
  { id: 'warmup', width: 9, height: 8, boxes: 2, walls: [1, 2], minLB: 7, maxLB: 11, pulls: 30, count: 5 },
  // 进阶：两个或三个箱子，开始需要规划顺序。
  { id: 'medium', width: 10, height: 9, boxes: 2, walls: [2, 3], minLB: 11, maxLB: 15, pulls: 40, count: 4 },
  { id: 'tricky', width: 11, height: 9, boxes: 3, walls: [2, 3], minLB: 15, maxLB: 20, pulls: 52, count: 4 },
  { id: 'hard', width: 11, height: 10, boxes: 3, walls: [2, 3], minLB: 17, maxLB: 22, pulls: 80, count: 4 },
  // 挑战：四个箱子。
  { id: 'expert', width: 12, height: 10, boxes: 3, walls: [2, 3], minLB: 21, maxLB: 27, pulls: 96, count: 3 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function shuffle(rng, list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cellAt(cols, x, y) {
  return y * cols + x;
}

function neighborsOf(cols, rows, cell) {
  const x = cell % cols;
  const y = Math.floor(cell / cols);
  const result = [];
  for (const d of DIRS) {
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) result.push(cellAt(cols, nx, ny));
  }
  return result;
}

function isCorner(walls, cols, rows, cell) {
  const x = cell % cols;
  const y = Math.floor(cell / cols);
  const up = y === 0 || walls[cellAt(cols, x, y - 1)];
  const down = y === rows - 1 || walls[cellAt(cols, x, y + 1)];
  const left = x === 0 || walls[cellAt(cols, x - 1, y)];
  const right = x === cols - 1 || walls[cellAt(cols, x + 1, y)];
  return (up && left) || (up && right) || (down && left) || (down && right);
}

/** 生成一个带边框、内部若干墙块的连通房间。 */
function makeRoom(rng, width, height, wallClusters) {
  const cols = width;
  const rows = height;
  const walls = new Uint8Array(cols * rows);

  const setWall = (x, y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    walls[cellAt(cols, x, y)] = 1;
  };

  for (let x = 0; x < cols; x += 1) {
    setWall(x, 0);
    setWall(x, rows - 1);
  }
  for (let y = 0; y < rows; y += 1) {
    setWall(0, y);
    setWall(cols - 1, y);
  }

  const targetWalls = Math.max(0, wallClusters);
  let attempts = 0;
  let placedClusters = 0;
  while (placedClusters < targetWalls && attempts < 80) {
    attempts += 1;
    const horizontal = rng() < 0.5;
    const length = 1 + Math.floor(rng() * 3);
    const x = 1 + Math.floor(rng() * (cols - 2));
    const y = 1 + Math.floor(rng() * (rows - 2));
    const cells = [];
    for (let i = 0; i < length; i += 1) {
      const nx = x + (horizontal ? i : 0);
      const ny = y + (horizontal ? 0 : i);
      if (nx <= 0 || ny <= 0 || nx >= cols - 1 || ny >= rows - 1) break;
      cells.push(cellAt(cols, nx, ny));
    }
    // 已占用就不放，保持墙块形状清晰。
    if (cells.some((cell) => walls[cell])) continue;
    const backup = cells.map((cell) => walls[cell]);
    for (const cell of cells) walls[cell] = 1;
    if (!isConnectedFloor(walls, cols, rows) || countFloor(walls) < (cols - 2) * (rows - 2) * 0.55) {
      cells.forEach((cell, i) => {
        walls[cell] = backup[i];
      });
      continue;
    }
    placedClusters += 1;
  }

  return { cols, rows, walls };
}

function countFloor(walls) {
  let count = 0;
  for (let i = 0; i < walls.length; i += 1) if (!walls[i]) count += 1;
  return count;
}

function isConnectedFloor(walls, cols, rows) {
  const start = walls.findIndex((wall, i) => !wall && i > 0);
  if (start === -1) return false;
  const seen = new Uint8Array(walls.length);
  const queue = [start];
  seen[start] = 1;
  let head = 0;
  while (head < queue.length) {
    const cell = queue[head];
    head += 1;
    for (const next of neighborsOf(cols, rows, cell)) {
      if (walls[next] || seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  for (let i = 0; i < walls.length; i += 1) {
    if (!walls[i] && !seen[i]) return false;
  }
  return true;
}

function reachableFrom(cols, rows, walls, boxes, from) {
  const seen = new Uint8Array(cols * rows);
  const queue = [from];
  seen[from] = 1;
  let head = 0;
  while (head < queue.length) {
    const cell = queue[head];
    head += 1;
    for (const next of neighborsOf(cols, rows, cell)) {
      if (walls[next] || seen[next] || boxes.has(next)) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return seen;
}

function chooseGoals(rng, room, count, clustered = false) {
  const { cols, rows, walls } = room;
  const candidates = [];
  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      const cell = cellAt(cols, x, y);
      if (walls[cell]) continue;
      if (isCorner(walls, cols, rows, cell)) continue;
      const openNeighbors = neighborsOf(cols, rows, cell).filter((n) => !walls[n]).length;
      if (openNeighbors < 3) continue;
      candidates.push({ cell, x, y, openNeighbors });
    }
  }

  if (candidates.length < count) return null;

  let pool = candidates;
  if (clustered && count > 1) {
    const cornerX = rng() < 0.5 ? 1 : cols - 2;
    const cornerY = rng() < 0.5 ? 1 : rows - 2;
    const nearby = candidates.filter((c) => Math.abs(c.x - cornerX) <= 5 && Math.abs(c.y - cornerY) <= 4);
    if (nearby.length >= count * 2) pool = nearby;
  }

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const shuffled = shuffle(rng, pool);
    const picked = [];
    for (const candidate of shuffled) {
      let ok = true;
      for (const other of picked) {
        const distance = Math.abs(candidate.x - other.x) + Math.abs(candidate.y - other.y);
        if (distance < 2) {
          ok = false;
          break;
        }
      }
      if (ok) picked.push(candidate);
      if (picked.length === count) break;
    }
    if (picked.length === count) {
      // 目标点之间别太挤，也别全贴同一面墙。
      const xs = picked.map((p) => p.x);
      const ys = picked.map((p) => p.y);
      const spreadOk =
        count === 1 ||
        (Math.max(...xs) - Math.min(...xs) >= 2 && Math.max(...ys) - Math.min(...ys) >= 2);
      if (spreadOk) return picked.map((p) => p.cell);
    }
  }
  return null;
}

function choosePlayer(rng, room, boxes, goals) {
  const { cols, rows, walls } = room;
  const candidates = [];
  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      const cell = cellAt(cols, x, y);
      if (walls[cell] || boxes.has(cell) || goals.has(cell)) continue;
      if (isCorner(walls, cols, rows, cell)) continue;
      candidates.push(cell);
    }
  }
  if (candidates.length === 0) return -1;
  return pick(rng, candidates);
}

/** 反向拉箱：玩家真实走到箱子的「后方」，然后向后退一步把箱子拉过来。 */
function scramble(rng, room, goals, targetLB, maxPulls) {
  const { cols, rows, walls } = room;
  const boxes = new Set(goals);
  // 这里 goals 数量与 boxCount 相同。
  let player = choosePlayer(rng, room, boxes, goals);
  if (player === -1) return null;

  let lastBox = -1;
  let lastDir = -1;
  const reversed = [];
  let lowerBound = assignmentDistance([...boxes], goals, cols);

  for (let step = 0; step < maxPulls * 2; step += 1) {
    if (reversed.length >= maxPulls) break;
    if (reversed.length >= Math.max(6, goals.size * 3) && lowerBound >= targetLB) break;

    const reach = reachableFrom(cols, rows, walls, boxes, player);
    const candidates = [];

    for (const box of boxes) {
      for (let d = 0; d < DIRS.length; d += 1) {
        const dir = DIRS[d];
        const standX = (box % cols) - dir.dx;
        const standY = Math.floor(box / cols) - dir.dy;
        const destX = standX - dir.dx;
        const destY = standY - dir.dy;
        if (standX <= 0 || standX >= cols - 1 || standY <= 0 || standY >= rows - 1) continue;
        if (destX <= 0 || destX >= cols - 1 || destY <= 0 || destY >= rows - 1) continue;

        const stand = cellAt(cols, standX, standY);
        const dest = cellAt(cols, destX, destY);
        if (walls[stand] || walls[dest]) continue;
        if (!reach[stand]) continue;
        if (boxes.has(stand) || boxes.has(dest)) continue;
        // 别把箱子拉进死角（除非那是目标点，但目标点已经在箱子上，拉走后就不是了）。
        if (isCorner(walls, cols, rows, stand)) continue;

        function nearestGoalDistance(cell) {
          const cx = cell % cols;
          const cy = Math.floor(cell / cols);
          let best = Infinity;
          for (const goal of goals) {
            const gx = goal % cols;
            const gy = Math.floor(goal / cols);
            best = Math.min(best, Math.abs(cx - gx) + Math.abs(cy - gy));
          }
          return best;
        }

        let score = rng() * 2;
        // 把箱子往远离目标点的方向拉，才能做出需要长距离搬运的关卡。
        score += (nearestGoalDistance(stand) - nearestGoalDistance(box)) * 0.7;
        if (box === lastBox) score -= 2.2;
        if (d === lastDir) score -= 0.4;
        if (goals.has(stand)) score -= 3; // 更希望把箱子拉离目标点
        if (isCorner(walls, cols, rows, dest)) score -= 4;
        // 避免箱子贴着墙滑不动。
        const wallNeighbors = neighborsOf(cols, rows, stand).filter((n) => walls[n]).length;
        score -= wallNeighbors * 0.25;
        // 箱子之间稍微分开。
        for (const other of boxes) {
          if (other === box) continue;
          const ox = other % cols;
          const oy = Math.floor(other / cols);
          score += Math.min(3, Math.abs(ox - standX) + Math.abs(oy - standY)) * 0.15;
        }
        candidates.push({ box, dirIndex: d, stand, dest, score });
      }
    }

    if (candidates.length === 0) break;
    candidates.sort((a, b) => b.score - a.score);
    const choice = candidates[Math.floor(rng() * Math.min(4, candidates.length))];

    boxes.delete(choice.box);
    boxes.add(choice.stand);
    player = choice.dest;
    lastBox = choice.stand;
    lastDir = choice.dirIndex;
    reversed.push(choice);
    lowerBound = assignmentDistance([...boxes], goals, cols);

  }

  if (reversed.length < Math.max(5, goals.size * 2)) return null;

  return { boxes: [...boxes].sort((a, b) => a - b), player, moves: reversed.length, lowerBound };
}

function renderRoom(room, boxes, goals, player) {
  const { cols, rows, walls } = room;
  const boxSet = new Set(boxes);
  const lines = [];
  for (let y = 0; y < rows; y += 1) {
    let line = '';
    for (let x = 0; x < cols; x += 1) {
      const cell = cellAt(cols, x, y);
      if (walls[cell]) line += '#';
      else if (boxSet.has(cell) && goals.has(cell)) line += '*';
      else if (goals.has(cell)) line += '.';
      else if (boxSet.has(cell)) line += '$';
      else if (cell === player) line += '@';
      else line += ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function irregularityScore(room) {
  const { cols, rows, walls } = room;
  let score = 0;
  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      if (walls[cellAt(cols, x, y)]) score += 1;
    }
  }
  return score;
}

function assignmentDistance(boxes, goals, cols) {
  const goalList = [...goals];
  const used = new Array(goalList.length).fill(false);
  let best = Infinity;

  function walk(index, sum) {
    if (sum >= best) return;
    if (index === boxes.length) {
      best = sum;
      return;
    }
    const box = boxes[index];
    const bx = box % cols;
    const by = Math.floor(box / cols);
    for (let i = 0; i < goalList.length; i += 1) {
      if (used[i]) continue;
      used[i] = true;
      const goal = goalList[i];
      const gx = goal % cols;
      const gy = Math.floor(goal / cols);
      walk(index + 1, sum + Math.abs(bx - gx) + Math.abs(by - gy));
      used[i] = false;
    }
  }

  walk(0, 0);
  return best;
}

function generateCandidate(rng, config, stats) {
  const wallClusters = config.walls[0] + Math.floor(rng() * (config.walls[1] - config.walls[0] + 1));
  const room = makeRoom(rng, config.width, config.height, wallClusters);
  const clustered = config.boxes >= 3;
  const goalsArr = chooseGoals(rng, room, config.boxes, clustered);
  if (!goalsArr) { stats && (stats.noGoals += 1); return null; }
  const goals = new Set(goalsArr);
  const scrambled = scramble(rng, room, goals, config.minLB + 1, config.pulls);
  if (!scrambled) { stats && (stats.noScramble += 1); return null; }

  const boxes = scrambled.boxes;
  // 开局箱子不能已经全部在目标点上；最好一个都不在。
  if (boxes.filter((box) => goals.has(box)).length > 0) { stats && (stats.onGoal += 1); return null; }

  const text = renderRoom(room, boxes, goals, scrambled.player);
  let parsed;
  try {
    parsed = parseLevel(text);
  } catch {
    return null;
  }

  const lowerBound = assignmentDistance(boxes, goals, room.cols);
  if (lowerBound < config.minLB || lowerBound > config.maxLB) { stats && (stats.lb += 1); return null; }

  const solution = solve(parsed, { maxStates: 300_000, timeLimitMs: 2_000 });
  if (!solution.solvable || solution.truncated) { stats && (stats.solve += 1); return null; }
  stats && (stats.accepted += 1);

  // 静态评分：箱子离目标越远、越分散，通常越有意思。
  const distance = lowerBound;

  return {
    config: config.id,
    width: room.cols,
    height: room.rows,
    boxes: config.boxes,
    pushes: solution.pushes,
    lowerBound,
    explored: solution.explored,
    map: text,
    score: distance + solution.pushes * 0.5 + irregularityScore(room) * 0.6,
  };
}

function parseArgs(argv) {
  const args = { seed: 20261126, perConfig: 4, maxAttempts: 80, json: null, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--seed') {
      args.seed = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--per-config') {
      args.perConfig = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--json') {
      args.json = argv[i + 1];
      i += 1;
    } else if (arg === '--max-attempts') {
      args.maxAttempts = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--only') {
      args.only = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rng = mulberry32(args.seed);
  const results = [];

  for (const config of CONFIGS) {
    if (args.only && config.id !== args.only) continue;
    const found = [];
    let attempts = 0;
    const stats = { noGoals: 0, noScramble: 0, onGoal: 0, lb: 0, solve: 0, accepted: 0 };
    while (found.length < args.perConfig && attempts < args.maxAttempts) {
      attempts += 1;
      process.stderr.write('.');
      const candidate = generateCandidate(rng, config, stats);
      if (candidate) {
        found.push(candidate);
      }
    }
    process.stderr.write('\n');
    found.sort((a, b) => a.pushes - b.pushes || a.boxes - b.boxes);
    results.push(...found);
    console.log(`\n=== ${config.id} (${found.length}/${args.perConfig}, ${attempts} 次尝试) ===`);
    console.log(`# stats ${JSON.stringify(stats)}`);
    for (const candidate of found) {
      console.log(`\n# ${candidate.config} pushes=${candidate.pushes} lb=${candidate.lowerBound} boxes=${candidate.boxes} ${candidate.width}x${candidate.height}`);
      console.log(candidate.map);
    }
  }

  const payload = { seed: args.seed, generatedAt: new Date().toISOString(), levels: results };
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(payload, null, 2));
    console.log(`\n已写入 ${args.json}`);
  }
}

main();
