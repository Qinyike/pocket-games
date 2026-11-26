import { BreakoutEngine, WORLD } from './logic.js';
import { miniState, updateMini } from '../../../core/storage.js';
import { playSound, startMusic, stopMusic } from '../../../core/sound.js';
import { vibrate } from '../../../core/haptics.js';
import { showOverlay, hideOverlay, isOverlayOpen } from '../../../core/ui.js';
import { el, hudPill, button, formatScore } from '../shared.js';

export class BreakoutGame {
  constructor({ stage, hud, controls, help, onExit, onProgressChange }) {
    this.stage = stage;
    this.hud = hud;
    this.controls = controls;
    this.help = help;
    this.onExit = onExit;
    this.onProgressChange = onProgressChange;
    this.engine = new BreakoutEngine();
    this.best = miniState('breakout').best || 0;
    this.bestLevel = miniState('breakout').bestLevel || 1;
    this.paused = false;
    this.raf = 0;
    this.last = 0;
    this.acc = 0;
    this.cleanup = [];
    this.keys = { left: false, right: false };
    this.scale = 1;
  }

  start() {
    startMusic('action');
    this.help.textContent = '拖动挡板或按左右键接球，打光所有砖块过关。';
    this.build();
    this.bind();
    this.newGame();
    this.loop();
  }

  build() {
    this.hud.replaceChildren(
      hudPill('分数', 0),
      hudPill('关卡', '1 / 3'),
      hudPill('生命', 3),
      hudPill('最佳', this.best),
    );
    this.scorePill = this.hud.children[0].querySelector('strong');
    this.levelPill = this.hud.children[1].querySelector('strong');
    this.lifePill = this.hud.children[2].querySelector('strong');
    this.bestPill = this.hud.children[3].querySelector('strong');

    this.canvas = el('canvas', 'breakout-canvas');
    this.canvas.setAttribute('aria-label', '打砖块游戏');
    const wrap = el('div', 'breakout-wrap');
    wrap.appendChild(this.canvas);
    this.stage.replaceChildren(wrap);
    this.ctx = this.canvas.getContext('2d');

    this.launchBtn = button('发球', { className: 'is-primary', onClick: () => this.launch() });
    this.leftBtn = button('左', { onClick: () => {} });
    this.rightBtn = button('右', { onClick: () => {} });
    this.controls.replaceChildren(this.leftBtn, this.launchBtn, this.rightBtn);
    this.bindHold(this.leftBtn, 'left');
    this.bindHold(this.rightBtn, 'right');
    this.syncHud();
  }

  bindHold(node, dir) {
    node.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      node.classList.add('is-pressed');
      this.keys[dir] = true;
    });
    const release = () => {
      node.classList.remove('is-pressed');
      this.keys[dir] = false;
    };
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
    node.addEventListener('pointerleave', release);
  }

  bind() {
    const keydown = (event) => {
      if (isOverlayOpen()) return;
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        this.keys.left = true;
        event.preventDefault();
      } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        this.keys.right = true;
        event.preventDefault();
      } else if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        this.launch();
        event.preventDefault();
      } else if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
        this.pause();
      }
    };
    const keyup = (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') this.keys.left = false;
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') this.keys.right = false;
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    this.cleanup.push(() => document.removeEventListener('keydown', keydown));
    this.cleanup.push(() => document.removeEventListener('keyup', keyup));

    let dragging = false;
    const moveTo = (clientX) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * WORLD.width;
      this.engine.movePaddleTo(x);
    };
    this.canvas.addEventListener('pointerdown', (event) => {
      dragging = true;
      moveTo(event.clientX);
      if (!this.engine.launched && !this.engine.gameOver) this.launch();
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (dragging) moveTo(event.clientX);
    });
    const stop = () => { dragging = false; };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.cleanup.push(() => {});
    this.resize = () => this.fit();
    window.addEventListener('resize', this.resize);
    this.cleanup.push(() => window.removeEventListener('resize', this.resize));
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.stage);
    this.cleanup.push(() => this.resizeObserver.disconnect());
  }

  newGame() {
    hideOverlay();
    this.engine.resetRun();
    this.paused = false;
    this.acc = 0;
    this.last = 0;
    this.particles = [];
    this.syncHud();
    this.fit();
    this.draw();
    startMusic('action');
    updateMini('breakout', (state) => {
      state.plays += 1;
    });
    this.onProgressChange?.();
  }

  launch() {
    if (this.paused || isOverlayOpen()) return;
    if (this.engine.launch()) {
      playSound('paddle');
      vibrate(5);
    }
  }

  loop() {
    cancelAnimationFrame(this.raf);
    const frame = (now) => {
      if (!this.last) this.last = now;
      const delta = Math.min(60, now - this.last);
      this.last = now;
      if (!this.paused && !isOverlayOpen() && !this.engine.gameOver && !this.engine.won) {
        this.keys.left && this.engine.movePaddle(delta / 1000, -1);
        this.keys.right && this.engine.movePaddle(delta / 1000, 1);
        this.acc += delta;
        while (this.acc >= 1000 / 120) {
          this.acc -= 1000 / 120;
          const events = this.engine.step(1 / 120);
          for (const event of events) this.handleEvent(event);
        }
      }
      this.updateParticles(delta / 1000);
      this.draw();
      this.syncHud();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  handleEvent(event) {
    if (event.type === 'brick') {
      playSound('brick');
      this.spawnBurst(event.x, event.y, event.color);
      vibrate(3);
    } else if (event.type === 'paddle') {
      playSound('paddle');
    } else if (event.type === 'miss') {
      playSound('hurt');
      vibrate([14, 40, 20]);
      this.syncHud();
    } else if (event.type === 'gameover') {
      this.endGame(false);
    } else if (event.type === 'win') {
      this.endGame(true);
    } else if (event.type === 'levelup') {
      playSound('clear');
      showOverlay({
        kicker: 'LEVEL UP',
        title: `第 ${event.level} 关`,
        theme: 'mini-theme',
        description: '球速会更快，挡板要跟上。',
        dismissible: false,
        actions: [
          { label: '继续', kind: 'primary', onClick: () => { this.engine.launched = false; hideOverlay(); } },
        ],
      });
    }
  }

  spawnBurst(worldX, worldY, color) {
    const ctx = this.ctx;
    const x = worldX * this.scale;
    const y = worldY * this.scale;
    this.particles = this.particles || [];
    for (let i = 0; i < 8; i += 1) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120,
        life: 0.4,
        color,
      });
    }
  }

  updateParticles(dt) {
    if (!this.particles) return;
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  fit() {
    if (!this.canvas) return;
    const rect = this.stage.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const scale = Math.min(rect.width / WORLD.width, rect.height / WORLD.height);
    const width = Math.floor(WORLD.width * scale);
    const height = Math.floor(WORLD.height * scale);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    this.scale = scale;
    this.draw();
  }

  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    const bg = ctx.createLinearGradient(0, 0, 0, WORLD.height);
    bg.addColorStop(0, '#0e1528');
    bg.addColorStop(1, '#070b14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < WORLD.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.height);
      ctx.stroke();
    }

    for (const brick of this.engine.bricks) {
      if (!brick.alive) continue;
      ctx.fillStyle = brick.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 4);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.fillRect(brick.x + 3, brick.y + 2, brick.width - 6, 2);
      ctx.globalAlpha = 1;
    }

    const paddle = this.engine.paddle;
    const paddleGrad = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
    paddleGrad.addColorStop(0, '#62e6ff');
    paddleGrad.addColorStop(1, '#8fb0ff');
    ctx.fillStyle = paddleGrad;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 5);
    ctx.fill();

    const ball = this.engine.ball;
    ctx.fillStyle = '#fff6d8';
    ctx.shadowColor = 'rgba(255,220,140,0.8)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!this.engine.launched && !this.engine.gameOver && !this.engine.won) {
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('点击发球', WORLD.width / 2, WORLD.height - 54);
    }
    if (this.particles) {
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life / 0.4);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
    }
  }

  syncHud() {
    this.scorePill.textContent = formatScore(this.engine.score);
    this.levelPill.textContent = `${this.engine.levelIndex + 1} / 3`;
    this.lifePill.textContent = String(this.engine.lives);
    this.bestPill.textContent = formatScore(this.best);
  }

  endGame(won) {
    stopMusic();
    const score = this.engine.score;
    const level = this.engine.levelIndex + 1;
    const isBest = score > this.best;
    if (isBest) {
      this.best = score;
      updateMini('breakout', (state) => {
        state.best = score;
      });
    }
    updateMini('breakout', (state) => {
      state.bestLevel = Math.max(state.bestLevel || 1, level);
    });
    this.onProgressChange?.();
    playSound(won ? 'win' : 'gameover');
    vibrate(won ? [16, 50, 24, 50, 50] : [20, 60, 20, 60, 60]);
    showOverlay({
      kicker: won ? 'ALL CLEAR' : 'GAME OVER',
      title: won ? '三关全部打穿' : '球掉光了',
      theme: 'mini-theme',
      description: isBest ? '刷新了最高分。' : '挡板再快一点，就能多接几个球。',
      stats: [
        ['分数', formatScore(score)],
        ['到达关卡', `${level} / 3`],
        ['最佳', formatScore(this.best)],
      ],
      dismissible: false,
      actions: [
        { label: '再来一局', kind: 'primary', onClick: () => this.newGame() },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  pause() {
    if (this.paused || this.engine.gameOver || this.engine.won || isOverlayOpen()) return;
    this.paused = true;
    stopMusic();
    showOverlay({
      kicker: 'PAUSED',
      title: '暂停一下',
      theme: 'mini-theme',
      stats: [
        ['分数', formatScore(this.engine.score)],
        ['关卡', `${this.engine.levelIndex + 1} / 3`],
        ['生命', String(this.engine.lives)],
      ],
      dismissible: false,
      actions: [
        { label: '继续', kind: 'primary', onClick: () => { hideOverlay(); this.paused = false; this.last = 0; startMusic('action'); } },
        { label: '重新开始', onClick: () => this.newGame() },
        { label: '返回大厅', onClick: () => this.onExit() },
      ],
    });
  }

  restart() {
    this.newGame();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    stopMusic();
    hideOverlay();
  }
}
