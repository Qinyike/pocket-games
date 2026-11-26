/**
 * 横版跳跃游戏的核心逻辑。
 *
 * 关卡使用字符网格描述：
 *   #  实心地形        =  单向平台（可从下方穿过）
 *   o  金币            E  小怪
 *   P  出生点          G  终点水晶
 *   C  检查点          ^  尖刺
 *
 * 物理以「格」为单位，固定时间步进，方便测试和跨设备一致。
 */

export const PLAYER_WIDTH = 0.62;
export const PLAYER_HEIGHT = 0.86;

const RUN_SPEED = 6.2;
const GROUND_ACCEL = 52;
const AIR_ACCEL = 34;
const FRICTION = 58;
const GRAVITY = 38;
const MAX_FALL = 18;
const JUMP_SPEED = 13.2;
const JUMP_CUT = 9.0;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;
const INVINCIBLE_TIME = 1.35;

export const THEMES = {
  day: {
    skyTop: '#69c6f4',
    skyBottom: '#e4f7ff',
    hillFar: '#8fd7b3',
    hillNear: '#5fbd8b',
    cloud: 'rgba(255,255,255,0.85)',
    ground: '#8b5a35',
    groundDark: '#6b4126',
    grass: '#63c76e',
    grassDark: '#3f9e54',
    stone: '#75839a',
    stoneDark: '#536075',
    platform: '#c48a4d',
    platformDark: '#8d5a2e',
    accent: '#ffd45c',
  },
  sunset: {
    skyTop: '#ff9a76',
    skyBottom: '#ffe3ad',
    hillFar: '#c47b8d',
    hillNear: '#8e536e',
    cloud: 'rgba(255,240,220,0.75)',
    ground: '#6d3f3a',
    groundDark: '#4f2b2c',
    grass: '#d7a04a',
    grassDark: '#a66f2c',
    stone: '#7a5a62',
    stoneDark: '#543c46',
    platform: '#b1744d',
    platformDark: '#7b472d',
    accent: '#ffe08a',
  },
  night: {
    skyTop: '#11162e',
    skyBottom: '#2b3460',
    hillFar: '#2b3158',
    hillNear: '#1d2344',
    cloud: 'rgba(180,195,255,0.18)',
    ground: '#3b3550',
    groundDark: '#27223a',
    grass: '#6c6aa8',
    grassDark: '#4b477d',
    stone: '#4c4a6d',
    stoneDark: '#33314f',
    platform: '#7b6583',
    platformDark: '#4f4059',
    accent: '#ffd36e',
  },
};

const EMPTY = new Set([' ', '.']);

function key(col, row) {
  return `${col},${row}`;
}

function makeRect(x, y, width, height) {
  return { x, y, width, height };
}

function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function parsePlatformLevel(definition) {
  const lines = definition.map.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
  const height = lines.length;
  const width = Math.max(...lines.map((line) => line.length));
  const grid = lines.map((line) => line.padEnd(width, ' ').split(''));

  let start = null;
  let goal = null;
  let checkpoint = null;
  const coins = [];
  const enemies = [];
  const spikes = [];
  const solids = [];
  const oneways = [];

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const ch = grid[row][col];
      if (ch === '#') solids.push({ col, row });
      if (ch === '=') oneways.push({ col, row });
      if (ch === 'o') coins.push({ col, row, collected: false });
      if (ch === '^') spikes.push({ col, row });
      if (ch === 'E') enemies.push({ col, row });
      if (ch === 'C') checkpoint = { col, row };
      if (ch === 'P') start = { col, row };
      if (ch === 'G') goal = { col, row };
      if (!EMPTY.has(ch) && !'#=o^ECPG'.includes(ch)) {
        throw new Error(`关卡 ${definition.id} 含未知字符：${JSON.stringify(ch)}`);
      }
    }
  }

  if (!start) throw new Error(`关卡 ${definition.id} 没有出生点`);
  if (!goal) throw new Error(`关卡 ${definition.id} 没有终点`);
  if (coins.length === 0) throw new Error(`关卡 ${definition.id} 没有金币`);

  return {
    ...definition,
    width,
    height,
    grid,
    solids,
    oneways,
    spikes,
    coins,
    enemies,
    start,
    goal,
    checkpoint,
    totalCoins: coins.length,
  };
}

function tileAt(level, col, row) {
  if (row < 0 || row >= level.height) return ' ';
  if (col < 0 || col >= level.width) return '#';
  return level.grid[row][col];
}

function isSolidAt(level, col, row) {
  const ch = tileAt(level, col, row);
  return ch === '#';
}

function isOneWayAt(level, col, row) {
  return tileAt(level, col, row) === '=';
}

function rectHitsSolid(level, rect) {
  const startCol = Math.floor(rect.x);
  const endCol = Math.floor(rect.x + rect.width - 0.0001);
  const startRow = Math.floor(rect.y);
  const endRow = Math.floor(rect.y + rect.height - 0.0001);
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      if (isSolidAt(level, col, row)) return true;
    }
  }
  return false;
}

function solidSets(level) {
  const solids = new Set(level.solids.map((tile) => key(tile.col, tile.row)));
  const oneways = new Set(level.oneways.map((tile) => key(tile.col, tile.row)));
  return { solids, oneways };
}

export class PlatformEngine {
  constructor(levelDefinition) {
    this.level = parsePlatformLevel(levelDefinition);
    const { solids, oneways } = solidSets(this.level);
    this.solidSet = solids;
    this.onewaySet = oneways;
    this.reset();
  }

  reset() {
    const { start, totalCoins } = this.level;
    this.player = {
      x: start.col + (1 - PLAYER_WIDTH) / 2,
      y: start.row + 1 - PLAYER_HEIGHT,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
    };
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.grounded = true;
    this.coyote = COYOTE_TIME;
    this.jumpBuffer = 0;
    this.prevJump = false;
    this.hearts = 3;
    this.coins = 0;
    this.totalCoins = totalCoins;
    this.elapsed = 0;
    this.invincible = 0;
    this.won = false;
    this.gameOver = false;
    this.prevJump = false;
    this.events = [];
    this.checkpoint = { ...start };
    this.checkpointActive = false;
    this.coinState = this.level.coins.map((coin) => ({ ...coin, collected: false }));
    this.enemyState = this.level.enemies.map((enemy) => ({
      x: enemy.col + (1 - 0.72) / 2,
      y: enemy.row + 1 - 0.55,
      width: 0.72,
      height: 0.55,
      vx: 1.45,
      alive: true,
    }));
  }

  spawnAt(cell) {
    this.player.x = cell.col + (1 - PLAYER_WIDTH) / 2;
    this.player.y = cell.row + 1 - PLAYER_HEIGHT;
    this.vx = 0;
    this.vy = 0;
    this.grounded = true;
  }

  get viewTime() {
    return this.elapsed;
  }

  isSupport(col, row) {
    return this.solidSet.has(key(col, row)) || this.onewaySet.has(key(col, row));
  }

  standing() {
    const { x, y, width, height } = this.player;
    const row = Math.floor(y + height + 0.03);
    const left = Math.floor(x + 0.05);
    const right = Math.floor(x + width - 0.05);
    if (this.solidSet.has(key(left, row)) || this.solidSet.has(key(right, row))) return true;
    // 单向平台：只有脚正好在平台顶面附近时才算站立。
    const foot = y + height;
    for (let col = left; col <= right; col += 1) {
      if (this.onewaySet.has(key(col, row)) && foot <= row + 0.06) return true;
    }
    return false;
  }

  addEvent(event) {
    this.events.push(event);
  }

  respawnFromFall() {
    this.hearts -= 1;
    this.addEvent({ type: 'fall', hearts: this.hearts });
    if (this.hearts <= 0) {
      this.gameOver = true;
      this.addEvent({ type: 'gameover' });
      return;
    }
    this.spawnAt(this.checkpoint);
    this.invincible = INVINCIBLE_TIME;
    this.addEvent({ type: 'respawn' });
  }

  hurt(reason) {
    if (this.invincible > 0 || this.won || this.gameOver) return;
    this.hearts -= 1;
    this.invincible = INVINCIBLE_TIME;
    this.addEvent({ type: 'hurt', hearts: this.hearts, reason });
    if (this.hearts <= 0) {
      this.gameOver = true;
      this.addEvent({ type: 'gameover' });
      return;
    }
    this.vy = -5.2;
    this.vx = this.facing * -5;
  }

  updateEnemies(dt) {
    for (const enemy of this.enemyState) {
      if (!enemy.alive) continue;
      enemy.vy = (enemy.vy || 0) + GRAVITY * dt;
      enemy.vy = Math.min(enemy.vy, MAX_FALL);

      const nextX = enemy.x + enemy.vx * dt;
      const testX = makeRect(nextX, enemy.y, enemy.width, enemy.height);
      if (rectHitsSolid(this.level, testX)) {
        enemy.vx *= -1;
      } else {
        enemy.x = nextX;
      }

      const nextY = enemy.y + enemy.vy * dt;
      const testY = makeRect(enemy.x, nextY, enemy.width, enemy.height);
      if (rectHitsSolid(this.level, testY)) {
        if (enemy.vy > 0) {
          enemy.y = Math.floor(nextY + enemy.height) - enemy.height;
        }
        enemy.vy = 0;
      } else {
        enemy.y = nextY;
      }

      // 走到平台边缘就掉头，避免集体掉坑。
      const frontX = enemy.vx > 0 ? enemy.x + enemy.width + 0.08 : enemy.x - 0.08;
      const footRow = Math.floor(enemy.y + enemy.height + 0.05);
      if (!this.isSupport(Math.floor(frontX), footRow) && enemy.vy >= 0) {
        enemy.vx *= -1;
      }
    }
  }

  checkEnemyCollisions() {
    const playerRect = makeRect(
      this.player.x,
      this.player.y,
      this.player.width,
      this.player.height,
    );
    for (const enemy of this.enemyState) {
      if (!enemy.alive) continue;
      const enemyRect = makeRect(enemy.x, enemy.y, enemy.width, enemy.height);
      if (!intersects(playerRect, enemyRect)) continue;
      const playerBottom = this.player.y + this.player.height;
      const stomping = this.vy > 0 && playerBottom - enemy.y < 0.5;
      if (stomping) {
        enemy.alive = false;
        this.vy = -8.5;
        this.addEvent({ type: 'stomp', x: enemy.x, y: enemy.y });
      } else {
        this.hurt('enemy');
      }
    }
  }

  step(dt, input = {}) {
    // 每一步只返回本步产生的事件；否则 UI 会反复播放旧的吃金币/跳跃事件，
    // 导致音效和粒子越积越多。
    this.events = [];
    if (this.won || this.gameOver) return this.events;
    const left = Boolean(input.left);
    const right = Boolean(input.right);
    const jump = Boolean(input.jump);

    this.elapsed += dt;
    if (this.invincible > 0) this.invincible = Math.max(0, this.invincible - dt);

    const move = (right ? 1 : 0) - (left ? 1 : 0);
    const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
    if (move !== 0) {
      this.vx += move * accel * dt;
      this.vx = Math.max(-RUN_SPEED, Math.min(RUN_SPEED, this.vx));
      this.facing = move;
    } else {
      const drag = (this.grounded ? FRICTION : AIR_ACCEL * 0.45) * dt;
      if (this.vx > 0) this.vx = Math.max(0, this.vx - drag);
      else if (this.vx < 0) this.vx = Math.min(0, this.vx + drag);
    }

    if (jump && !this.prevJump) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.prevJump = jump;

    if (this.grounded) {
      this.coyote = COYOTE_TIME;
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = -JUMP_SPEED;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.addEvent({ type: 'jump' });
    }

    if (!jump && this.vy < -JUMP_CUT) {
      this.vy = -JUMP_CUT;
    }

    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);

    // 水平移动与墙体碰撞
    const nextX = this.player.x + this.vx * dt;
    const horizontalRect = makeRect(nextX, this.player.y, this.player.width, this.player.height);
    if (rectHitsSolid(this.level, horizontalRect)) {
      this.vx = 0;
    } else {
      this.player.x = nextX;
    }

    // 垂直移动：先处理正下方，再处理头顶。
    const oldBottom = this.player.y + this.player.height;
    const nextY = this.player.y + this.vy * dt;
    let landed = false;

    if (this.vy >= 0) {
      const newBottom = nextY + this.player.height;
      const leftCol = Math.floor(this.player.x + 0.04);
      const rightCol = Math.floor(this.player.x + this.player.width - 0.04);
      let landingRow = null;
      for (let row = Math.floor(oldBottom); row <= Math.floor(newBottom + 0.001); row += 1) {
        for (let col = leftCol; col <= rightCol; col += 1) {
          if (this.solidSet.has(key(col, row)) || this.onewaySet.has(key(col, row))) {
            if (oldBottom <= row + 0.08 && newBottom >= row) {
              if (landingRow === null || row < landingRow) landingRow = row;
            }
          }
        }
      }
      if (landingRow !== null) {
        this.player.y = landingRow - this.player.height;
        this.vy = 0;
        this.grounded = true;
        landed = true;
      } else {
        this.player.y = nextY;
      }
    } else {
      const headRow = Math.floor(nextY);
      const leftCol = Math.floor(this.player.x + 0.04);
      const rightCol = Math.floor(this.player.x + this.player.width - 0.04);
      for (let col = leftCol; col <= rightCol; col += 1) {
        if (this.solidSet.has(key(col, headRow))) {
          this.player.y = headRow + 1;
          this.vy = 0;
          break;
        }
      }
      if (this.vy < 0) this.player.y = nextY;
    }

    if (!landed) {
      this.grounded = this.standing();
    }

    this.updateEnemies(dt);
    this.checkEnemyCollisions();

    // 尖刺
    const playerRect = makeRect(
      this.player.x,
      this.player.y,
      this.player.width,
      this.player.height,
    );
    for (const spike of this.level.spikes) {
      const spikeRect = makeRect(spike.col + 0.08, spike.row + 0.72, 0.84, 0.28);
      if (intersects(playerRect, spikeRect)) {
        this.hurt('spike');
        break;
      }
    }

    // 金币
    for (const coin of this.coinState) {
      if (coin.collected) continue;
      const coinRect = makeRect(coin.col + 0.22, coin.row + 0.22, 0.56, 0.56);
      if (intersects(playerRect, coinRect)) {
        coin.collected = true;
        this.coins += 1;
        this.addEvent({ type: 'coin', x: coin.col + 0.5, y: coin.row + 0.5 });
      }
    }

    // 检查点
    if (this.level.checkpoint) {
      const cp = this.level.checkpoint;
      const cpRect = makeRect(cp.col + 0.1, cp.row + 0.2, 0.8, 0.8);
      if (!this.checkpointActive && intersects(playerRect, cpRect)) {
        this.checkpointActive = true;
        this.checkpoint = { ...cp };
        this.addEvent({ type: 'checkpoint' });
      }
    }

    // 终点
    const goal = this.level.goal;
    const goalRect = makeRect(goal.col + 0.1, goal.row - 0.8, 0.8, 1.8);
    if (intersects(playerRect, goalRect)) {
      this.won = true;
      this.addEvent({ type: 'win' });
    }

    if (this.player.y > this.level.height + 1.2) {
      this.respawnFromFall();
    }

    return this.events;
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
