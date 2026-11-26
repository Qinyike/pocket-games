/**
 * 用 WebAudio 现场合成音效，不依赖任何音频文件。
 */

let audioContext = null;
let masterGain = null;
let enabled = true;

function ensureContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    audioContext = new Ctx();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(audioContext.destination);
  } catch {
    audioContext = null;
  }
  return audioContext;
}

export function unlockAudio() {
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export function setSoundEnabled(value) {
  enabled = Boolean(value);
  if (enabled) unlockAudio();
}

function tone({ freq, endFreq, type = 'sine', duration = 0.08, volume = 0.05, delay = 0 }) {
  if (!enabled) return;
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(30, freq), start);
  if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), start + duration);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const SOUNDS = {
  move() {
    tone({ freq: 190, endFreq: 150, type: 'triangle', duration: 0.035, volume: 0.025 });
  },
  push() {
    tone({ freq: 105, endFreq: 78, type: 'triangle', duration: 0.075, volume: 0.05 });
  },
  goal() {
    tone({ freq: 660, type: 'sine', duration: 0.09, volume: 0.04 });
    tone({ freq: 990, type: 'sine', duration: 0.12, volume: 0.035, delay: 0.06 });
  },
  undo() {
    tone({ freq: 330, endFreq: 220, type: 'sine', duration: 0.07, volume: 0.03 });
  },
  blocked() {
    tone({ freq: 90, type: 'square', duration: 0.035, volume: 0.018 });
  },
  win() {
    [523, 659, 784, 1046].forEach((freq, i) => {
      tone({ freq, type: 'triangle', duration: 0.18, volume: 0.05, delay: i * 0.09 });
    });
  },
  rotate() {
    tone({ freq: 470, endFreq: 520, type: 'triangle', duration: 0.035, volume: 0.022 });
  },
  lock() {
    tone({ freq: 130, endFreq: 90, type: 'triangle', duration: 0.06, volume: 0.035 });
  },
  hardDrop() {
    tone({ freq: 95, endFreq: 55, type: 'sine', duration: 0.09, volume: 0.06 });
  },
  clear() {
    [660, 880, 1100].forEach((freq, i) => {
      tone({ freq, type: 'triangle', duration: 0.13, volume: 0.04, delay: i * 0.05 });
    });
  },
  tetris() {
    [523, 659, 784, 1046, 1318].forEach((freq, i) => {
      tone({ freq, type: 'triangle', duration: 0.16, volume: 0.05, delay: i * 0.06 });
    });
  },
  hold() {
    tone({ freq: 420, endFreq: 500, type: 'sine', duration: 0.06, volume: 0.025 });
  },
  pause() {
    tone({ freq: 360, type: 'sine', duration: 0.08, volume: 0.025 });
  },
  gameover() {
    [330, 280, 220, 160].forEach((freq, i) => {
      tone({ freq, type: 'triangle', duration: 0.22, volume: 0.04, delay: i * 0.11 });
    });
  },
};

export function playSound(name) {
  if (!enabled) return;
  const sound = SOUNDS[name];
  if (sound) sound();
}

export function isSoundEnabled() {
  return enabled;
}
