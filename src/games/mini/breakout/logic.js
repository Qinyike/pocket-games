/**
 * 打砖块纯逻辑（固定世界坐标 480×300）。
 */

export const WORLD = { width: 480, height: 300 };

const LEVELS = [
  {
    rows: 4,
    cols: 7,
    speed: 210,
    colors: ['#ff7188', '#ffb454', '#57d999', '#62e6ff'],
  },
  {
    rows: 5,
    cols: 8,
    speed: 245,
    colors: ['#a78bfa', '#ff7188', '#ffd45c', '#57d999', '#62e6ff'],
  },
  {
    rows: 6,
    cols: 9,
    speed: 280,
    colors: ['#62e6ff', '#a78bfa', '#ff7188', '#ffb454', '#57d999', '#ff8e6e'],
  },
];

export class BreakoutEngine {
  constructor({ level = 0 } = {}) {
    this.levelIndex = Math.min(level, LEVELS.length - 1);
    this.score = 0;
    this.lives = 3;
    this.won = false;
    this.gameOver = false;
    this.events = [];
    this.resetLevel();
  }

  get levelCount() {
    return LEVELS.length;
  }

  resetLevel() {
    const config = LEVELS[this.levelIndex];
    this.config = config;
    this.paddle = { x: WORLD.width / 2 - 44, y: WORLD.height - 22, width: 88, height: 10 };
    this.ball = {
      x: WORLD.width / 2,
      y: this.paddle.y - 9,
      vx: 0,
      vy: 0,
      radius: 6,
    };
    this.launched = false;
    this.bricks = [];
    const padding = 24;
    const gap = 8;
    const brickW = (WORLD.width - padding * 2 - gap * (config.cols - 1)) / config.cols;
    const brickH = 16;
    const top = 42;
    for (let row = 0; row < config.rows; row += 1) {
      for (let col = 0; col < config.cols; col += 1) {
        this.bricks.push({
          x: padding + col * (brickW + gap),
          y: top + row * (brickH + gap),
          width: brickW,
          height: brickH,
          color: config.colors[row % config.colors.length],
          alive: true,
        });
      }
    }
    this.events = [];
  }

  resetRun() {
    this.score = 0;
    this.lives = 3;
    this.levelIndex = 0;
    this.won = false;
    this.gameOver = false;
    this.resetLevel();
  }

  launch() {
    if (this.launched || this.gameOver || this.won) return false;
    this.launched = true;
    const angle = (-60 * Math.PI) / 180;
    this.ball.vx = Math.cos(angle) * this.config.speed;
    this.ball.vy = Math.sin(angle) * this.config.speed;
    this.events.push({ type: 'launch' });
    return true;
  }

  movePaddleTo(centerX) {
    this.paddle.x = Math.max(0, Math.min(WORLD.width - this.paddle.width, centerX - this.paddle.width / 2));
    if (!this.launched) {
      this.ball.x = this.paddle.x + this.paddle.width / 2;
      this.ball.y = this.paddle.y - this.ball.radius - 2;
    }
  }

  movePaddle(dt, direction) {
    if (!direction) return;
    this.paddle.x += direction * 420 * dt;
    this.paddle.x = Math.max(0, Math.min(WORLD.width - this.paddle.width, this.paddle.x));
    if (!this.launched) {
      this.ball.x = this.paddle.x + this.paddle.width / 2;
      this.ball.y = this.paddle.y - this.ball.radius - 2;
    }
  }

  bounceBallOffPaddle() {
    const ball = this.ball;
    const paddleCenter = this.paddle.x + this.paddle.width / 2;
    const relative = (ball.x - paddleCenter) / (this.paddle.width / 2);
    const angle = relative * (Math.PI / 3);
    const speed = Math.hypot(ball.vx, ball.vy) || this.config.speed;
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.abs(Math.cos(angle) * speed);
    ball.y = this.paddle.y - ball.radius - 1;
    this.events.push({ type: 'paddle' });
  }

  step(dt) {
    if (!this.launched || this.gameOver || this.won) return this.events;
    const ball = this.ball;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.radius < 0) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x + ball.radius > WORLD.width) {
      ball.x = WORLD.width - ball.radius;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - ball.radius < 0) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
    }

    if (ball.vy > 0 && ball.y + ball.radius >= this.paddle.y && ball.y - ball.radius <= this.paddle.y + this.paddle.height) {
      if (ball.x >= this.paddle.x - ball.radius && ball.x <= this.paddle.x + this.paddle.width + ball.radius) {
        this.bounceBallOffPaddle();
      }
    }

    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      if (
        ball.x + ball.radius > brick.x &&
        ball.x - ball.radius < brick.x + brick.width &&
        ball.y + ball.radius > brick.y &&
        ball.y - ball.radius < brick.y + brick.height
      ) {
        brick.alive = false;
        this.score += 100;
        this.events.push({ type: 'brick', x: brick.x, y: brick.y, color: brick.color });
        const overlapX = Math.min(ball.x + ball.radius - brick.x, brick.x + brick.width - (ball.x - ball.radius));
        const overlapY = Math.min(ball.y + ball.radius - brick.y, brick.y + brick.height - (ball.y - ball.radius));
        if (overlapX < overlapY) ball.vx *= -1;
        else ball.vy *= -1;
        break;
      }
    }

    if (ball.y - ball.radius > WORLD.height) {
      this.lives -= 1;
      this.events.push({ type: 'miss', lives: this.lives });
      if (this.lives <= 0) {
        this.gameOver = true;
        this.events.push({ type: 'gameover' });
      } else {
        this.launched = false;
        this.ball.x = this.paddle.x + this.paddle.width / 2;
        this.ball.y = this.paddle.y - this.ball.radius - 2;
        this.ball.vx = 0;
        this.ball.vy = 0;
      }
    }

    if (this.bricks.every((brick) => !brick.alive)) {
      if (this.levelIndex >= LEVELS.length - 1) {
        this.won = true;
        this.events.push({ type: 'win' });
      } else {
        this.levelIndex += 1;
        this.resetLevelKeepStats();
        this.events.push({ type: 'levelup', level: this.levelIndex + 1 });
      }
    }

    return this.events;
  }

  resetLevelKeepStats() {
    const score = this.score;
    const lives = this.lives;
    const level = this.levelIndex;
    this.levelIndex = level;
    this.resetLevel();
    this.score = score;
    this.lives = lives;
    this.launched = false;
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
