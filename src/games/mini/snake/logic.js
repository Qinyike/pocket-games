/**
 * 贪吃蛇纯逻辑。
 */

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export class SnakeEngine {
  constructor({ size = 20, rng = Math.random } = {}) {
    this.size = size;
    this.rng = rng;
    this.reset();
  }

  reset() {
    const center = Math.floor(this.size / 2);
    this.snake = [
      { x: center, y: center },
      { x: center - 1, y: center },
      { x: center - 2, y: center },
    ];
    this.direction = 'right';
    this.nextDirection = 'right';
    this.score = 0;
    this.alive = true;
    this.grow = 0;
    this.ate = false;
    this.placeFood();
  }

  setDirection(direction) {
    if (!DIRECTIONS[direction]) return false;
    if (direction === OPPOSITE[this.direction]) return false;
    this.nextDirection = direction;
    return true;
  }

  placeFood() {
    const occupied = new Set(this.snake.map((part) => `${part.x},${part.y}`));
    const empty = [];
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (!occupied.has(`${x},${y}`)) empty.push({ x, y });
      }
    }
    if (empty.length === 0) {
      this.food = null;
      return;
    }
    this.food = empty[Math.floor(this.rng() * empty.length)];
  }

  step() {
    if (!this.alive) return { alive: false, ate: false, score: this.score };
    this.direction = this.nextDirection;
    const delta = DIRECTIONS[this.direction];
    const head = this.snake[0];
    const next = { x: head.x + delta.x, y: head.y + delta.y };

    if (next.x < 0 || next.y < 0 || next.x >= this.size || next.y >= this.size) {
      this.alive = false;
      return { alive: false, ate: false, score: this.score, reason: 'wall' };
    }

    const eats = this.food && next.x === this.food.x && next.y === this.food.y;
    const body = eats ? this.snake : this.snake.slice(0, -1);
    if (body.some((part) => part.x === next.x && part.y === next.y)) {
      this.alive = false;
      return { alive: false, ate: false, score: this.score, reason: 'self' };
    }

    this.snake.unshift(next);
    if (eats) {
      this.score += 10;
      this.ate = true;
      this.placeFood();
      return { alive: true, ate: true, score: this.score };
    }
    this.snake.pop();
    this.ate = false;
    return { alive: true, ate: false, score: this.score };
  }

  get speed() {
    return Math.max(70, 150 - Math.floor(this.score / 50) * 8);
  }
}
