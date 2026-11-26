/**
 * 音效与原创芯片音乐，全部由 WebAudio 实时合成。
 *
 * 这里没有任何外部音频文件，也没有采样任天堂或其他游戏的旋律：
 * 所有 loop 都是为本项目写的简单和弦进行与音阶。
 */

let audioContext = null;
let masterGain = null;
let musicGain = null;
let enabled = true;
let musicEnabled = true;
let musicTimer = 0;
let musicStep = 0;
let nextNoteTime = 0;
let currentTrack = null;
let pendingTrack = null;
let lastTrack = null;

function ensureContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    audioContext = new Ctx();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(audioContext.destination);

    musicGain = audioContext.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(masterGain);
  } catch {
    audioContext = null;
  }
  return audioContext;
}

export function unlockAudio() {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => {
      if (pendingTrack) startMusic(pendingTrack);
    }).catch(() => {});
  } else if (pendingTrack) {
    startMusic(pendingTrack);
  }
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
  jump() {
    tone({ freq: 280, endFreq: 620, type: 'triangle', duration: 0.11, volume: 0.04 });
  },
  coin() {
    tone({ freq: 1046, type: 'triangle', duration: 0.07, volume: 0.04 });
    tone({ freq: 1568, type: 'sine', duration: 0.1, volume: 0.03, delay: 0.045 });
  },
  stomp() {
    tone({ freq: 150, endFreq: 65, type: 'square', duration: 0.09, volume: 0.045 });
    tone({ freq: 520, endFreq: 260, type: 'triangle', duration: 0.08, volume: 0.03 });
  },
  hurt() {
    tone({ freq: 240, endFreq: 90, type: 'square', duration: 0.2, volume: 0.04 });
  },
  checkpoint() {
    [523, 784].forEach((freq, i) => {
      tone({ freq, type: 'triangle', duration: 0.12, volume: 0.04, delay: i * 0.08 });
    });
  },
  fall() {
    tone({ freq: 380, endFreq: 80, type: 'triangle', duration: 0.35, volume: 0.04 });
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

export function setSoundEnabled(value) {
  enabled = Boolean(value);
  if (enabled) unlockAudio();
}

/* ───────────────────────── 音乐 ───────────────────────── */

const seq = (notes, step = 4) =>
  Array.from({ length: 64 }, (_, index) => (index % step === 0 ? notes[index / step] ?? null : null));

/**
 * 每个 loop 都是 4 小节 × 16 个十六分音符。
 * 数字为 MIDI 音高，null 为休止。旋律均为本项目原创。
 */
const TRACKS = {
  home: {
    bpm: 84,
    lead: 'triangle',
    bassWave: 'sine',
    drums: false,
    melody: seq([76, 79, 83, 81, 79, 76, 74, 72, 72, 76, 79, 81, 79, 76, 74, 72], 4),
    bass: seq([48, 43, 45, 40, 41, 36, 43, 38], 8),
    chords: [
      [48, 52, 55, 59],
      [45, 48, 52, 55],
      [41, 45, 48, 52],
      [43, 47, 50, 52],
    ],
  },
  sokoban: {
    bpm: 72,
    lead: 'triangle',
    bassWave: 'sine',
    drums: false,
    melody: seq([69, null, 72, null, 76, null, 74, null, 72, null, 69, null, 67, null, 64, null], 4),
    bass: seq([45, 52, 41, 48, 48, 55, 43, 50], 8),
    chords: [
      [45, 48, 52],
      [41, 45, 48],
      [48, 52, 55],
      [43, 47, 50],
    ],
  },
  tetris: {
    bpm: 132,
    lead: 'square',
    bassWave: 'triangle',
    drums: true,
    melody: seq(
      [76, 79, 83, 79, 76, 74, 71, 67, 72, 76, 79, 76, 72, 71, 67, 64,
       74, 79, 83, 79, 74, 71, 67, 64, 78, 81, 86, 81, 78, 74, 69, 66],
      2,
    ),
    bass: seq([40, 40, 43, 43, 36, 36, 40, 40, 43, 43, 47, 47, 38, 38, 42, 42], 4),
    chords: [
      [40, 43, 47],
      [36, 40, 43],
      [43, 47, 50],
      [38, 42, 45],
    ],
  },
  platform: {
    bpm: 150,
    lead: 'triangle',
    bassWave: 'triangle',
    drums: true,
    melody: seq(
      [67, 71, 74, 79, 74, 71, 69, 71, 74, 78, 81, 78, 74, 69, 66, 69,
       76, 79, 83, 79, 76, 71, 67, 71, 72, 76, 79, 76, 72, 67, 64, 67],
      2,
    ),
    bass: seq([43, null, 38, null, 43, null, 38, null, 40, null, 35, null, 36, null, 43, null], 4),
    chords: [
      [43, 47, 50],
      [38, 42, 45],
      [40, 43, 47],
      [36, 40, 43],
    ],
  },
};

function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function scheduleNote(midi, when, duration, volume, type) {
  if (!audioContext || !musicGain) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.value = midiToFreq(midi);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(musicGain);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function scheduleKick(when) {
  if (!audioContext || !musicGain) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(92, when);
  osc.frequency.exponentialRampToValueAtTime(45, when + 0.13);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.035, when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
  osc.connect(gain);
  gain.connect(musicGain);
  osc.start(when);
  osc.stop(when + 0.18);
}

function scheduleAhead() {
  if (!audioContext || !currentTrack) return;
  const track = TRACKS[currentTrack];
  if (!track) return;
  const stepDuration = 60 / track.bpm / 4;

  while (nextNoteTime < audioContext.currentTime + 0.16) {
    const step = musicStep % 64;
    const bar = Math.floor(step / 16);
    const note = track.melody[step];
    if (note) {
      scheduleNote(note, nextNoteTime, stepDuration * 1.7, 0.045, track.lead);
    }
    const bass = track.bass[step];
    if (bass) {
      scheduleNote(bass, nextNoteTime, stepDuration * 1.9, 0.065, track.bassWave);
    }
    if (step % 16 === 0) {
      const chord = track.chords[bar % track.chords.length];
      for (const midi of chord) {
        scheduleNote(midi, nextNoteTime, stepDuration * 15, 0.012, 'sine');
      }
    }
    if (track.drums) {
      if (step % 8 === 0) scheduleKick(nextNoteTime);
    }
    nextNoteTime += stepDuration;
    musicStep += 1;
  }
}

function beginScheduler(name) {
  if (!musicEnabled || !TRACKS[name]) return;
  if (currentTrack === name && musicTimer) return;
  stopMusic(false);
  const ctx = ensureContext();
  if (!ctx) return;
  currentTrack = name;
  pendingTrack = null;
  lastTrack = name;
  musicStep = 0;
  nextNoteTime = ctx.currentTime + 0.08;
  if (musicGain) {
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setTargetAtTime(0.18, ctx.currentTime, 0.08);
  }
  musicTimer = window.setInterval(scheduleAhead, 60);
  scheduleAhead();
}

export function startMusic(name) {
  if (!TRACKS[name]) return;
  lastTrack = name;
  pendingTrack = name;
  if (!musicEnabled) return;
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => beginScheduler(name)).catch(() => {});
    return;
  }
  beginScheduler(name);
}

export function stopMusic(clearPending = true) {
  if (musicTimer) window.clearInterval(musicTimer);
  musicTimer = 0;
  currentTrack = null;
  if (clearPending) pendingTrack = null;
  if (audioContext && musicGain) {
    musicGain.gain.cancelScheduledValues(audioContext.currentTime);
    musicGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.05);
  }
}

export function setMusicEnabled(value) {
  musicEnabled = Boolean(value);
  if (!musicEnabled) {
    stopMusic(false);
    pendingTrack = lastTrack;
  } else if (lastTrack) {
    startMusic(lastTrack);
  }
}

export function isMusicEnabled() {
  return musicEnabled;
}
