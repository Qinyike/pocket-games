// Original scores. Numbers are MIDI pitches, with rests on unassigned eighth notes.
const tracks = {
  trail: {
    bpm:132, voice:'triangle', rhythm:'stride', pulse:[0,4],
    melody:[
      [76,,79,81,,79,74,], [72,74,,76,79,,76,],
      [77,,81,84,,81,79,], [76,74,,71,74,,79,],
      [81,,84,83,79,,76,], [74,76,,79,81,,84,],
      [86,,84,81,,77,76,], [74,71,,74,79,,74,],
    ],
    bass:[48,52,53,55,57,50,53,55],
  },
  crates: {
    bpm:92, voice:'sine', rhythm:'workshop', pulse:[0,3,6],
    melody:[
      [67,,,64,,62,,], [65,,69,,,72,,69],
      [67,,,63,,65,,], [62,,60,,,58,,62],
      [63,,,67,,70,,], [69,,65,,,62,,65],
      [67,,72,,,67,,63], [62,,,65,,59,,],
    ],
    bass:[48,53,51,46,51,50,48,43],
  },
  tanks: {
    bpm:146, voice:'sawtooth', rhythm:'drive', pulse:[0,2,3,4,6],
    melody:[
      [64,64,,65,67,,64,], [62,,65,62,,60,62,],
      [64,64,,67,70,,69,], [67,,65,64,,62,59,],
      [64,,67,71,,72,71,], [69,69,,65,67,,65,],
      [67,,70,72,74,70,,67], [65,,62,59,,62,63,],
    ],
    bass:[40,38,40,43,45,41,46,47],
  },
  blocks: {
    bpm:118, voice:'square', rhythm:'syncopated', pulse:[1,3,4,7],
    melody:[
      [71,,74,76,,74,,69], [,72,76,,79,,76,],
      [69,,73,77,,76,,73], [,69,72,,76,74,,72],
      [71,,74,78,,76,,74], [,76,79,,83,,79,],
      [81,,78,76,,74,,73], [,76,72,,69,66,,69],
    ],
    bass:[47,48,45,45,47,52,50,42],
  },
  gomoku: {
    bpm:74, voice:'sine', rhythm:'quiet', pulse:[0,5],
    melody:[
      [74,,,,69,,,76], [79,,,77,,,,74],
      [72,,,,76,,,79], [81,,,76,,,,],
      [77,,,,74,,,69], [67,,,74,,,,77],
      [76,,,,72,,,71], [69,,,64,,,,],
    ],
    bass:[50,55,48,45,53,55,52,45],
  },
};

// Each layer specifies offset, waveform, start and end frequency, duration, and gain.
const effects = {
  trail: {
    jump:[[0,'square',220,465,.11,.05]], land:[[0,'noise',680,235,.075,.045]],
    collect:[[0,'triangle',880,880,.085,.13],[.055,'triangle',1320,1320,.15,.1]],
    stomp:[[0,'noise',880,190,.12,.12],[0,'square',196,98,.11,.05]],
    checkpoint:[[0,'triangle',392,392,.13,.1],[.10,'triangle',587,587,.17,.1],[.20,'triangle',784,784,.26,.1]],
    shield:[[0,'sine',442,664,.18,.12],[.08,'triangle',884,1105,.24,.08]],
    impact:[[0,'noise',1250,250,.16,.14],[0,'triangle',250,120,.20,.08]],
    fall:[[0,'triangle',290,80,.31,.16]],
    clear:[[0,'triangle',523,523,.15,.12],[.12,'triangle',659,659,.15,.12],[.24,'triangle',880,880,.32,.12]],
  },
  crates: {
    step:[[0,'noise',440,260,.038,.045]], push:[[0,'noise',620,175,.14,.16],[0,'triangle',164,82,.12,.07]],
    target:[[0,'sine',520,520,.10,.12],[.055,'triangle',700,700,.17,.08]],
    undo:[[0,'sine',495,280,.11,.12]],
    clear:[[0,'sine',392,392,.23,.15],[.125,'triangle',523,523,.3,.12],[.25,'sine',659,659,.40,.14]],
  },
  tanks: {
    fire:[[0,'noise',1650,220,.095,.14],[0,'square',155,67,.105,.07]],
    brick:[[0,'noise',910,235,.115,.13]], armor:[[0,'triangle',870,422,.13,.14],[0,'sine',1310,710,.10,.08]],
    blast:[[0,'noise',540,70,.26,.19],[0,'sine',90,38,.27,.17]],
    damage:[[0,'noise',370,68,.25,.14],[0,'sawtooth',125,48,.26,.09]],
    clear:[[0,'square',196,196,.13,.07],[.14,'triangle',294,294,.16,.13],[.28,'triangle',392,392,.35,.13]],
    fail:[[0,'square',185,125,.24,.08],[.18,'sine',90,40,.39,.15]],
  },
  blocks: {
    move:[[0,'sine',290,210,.056,.08]], rotate:[[0,'square',290,502,.069,.062]],
    hold:[[0,'triangle',593,310,.13,.11]], lock:[[0,'triangle',163,93,.09,.14]],
    line:[[0,'square',461,755,.095,.07],[.064,'triangle',860,1120,.175,.13]],
    combo:[[0,'square',520,780,.13,.08],[.085,'triangle',980,1240,.17,.12],[.17,'triangle',1568,1568,.21,.12]],
    fail:[[0,'square',245,180,.18,.09],[.14,'triangle',149,65,.35,.14]],
  },
  gomoku: {
    black:[[0,'noise',1200,720,.047,.13],[0,'sine',390,240,.065,.12]],
    white:[[0,'noise',1720,990,.042,.12],[0,'sine',540,330,.065,.11]],
    undo:[[0,'sine',390,295,.105,.12]],
    clear:[[0,'triangle',440,440,.31,.10],[.10,'sine',659,659,.36,.13],[.23,'sine',880,880,.62,.11]],
    draw:[[0,'sine',349,349,.30,.13],[.16,'sine',330,330,.46,.12]],
  },
};

const hz = pitch => 440 * 2 ** ((pitch - 69) / 12);

export function createAudio(enabled) {
  let context, noise, master, music, game, step, next, timer, paused = false;

  function note(bus, start, type, from, to, time, peak, attack = .008) {
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + attack);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + time);
    envelope.connect(bus);
    let source;
    if (type === 'noise') {
      source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = .7;
      filter.frequency.setValueAtTime(from, start);
      filter.frequency.exponentialRampToValueAtTime(to, start + time);
      source.connect(filter).connect(envelope);
    } else {
      source = context.createOscillator();
      source.type = type;
      source.frequency.setValueAtTime(from, start);
      source.frequency.exponentialRampToValueAtTime(to, start + time);
      source.connect(envelope);
    }
    source.onended = () => envelope.disconnect();
    source.start(start);
    source.stop(start + time);
  }

  function stopMusic() {
    clearInterval(timer);
    timer = undefined;
    if (!music) return;
    const bus = music;
    const now = context.currentTime;
    bus.gain.setTargetAtTime(0, now, .01);
    setTimeout(() => bus.disconnect(), 70);
    music = undefined;
  }

  function sync() {
    if (!enabled || paused || document.hidden || !tracks[game] || context?.state !== 'running') {
      stopMusic();
      return;
    }
    if (timer !== undefined) return;
    const { bpm, voice, rhythm, pulse, melody, bass } = tracks[game];
    const beat = 30 / bpm;
    music = context.createGain();
    music.gain.setValueAtTime(.01, context.currentTime);
    music.gain.setTargetAtTime(.66, context.currentTime, .035);
    music.connect(master);
    next = context.currentTime + .030;
    function schedule() {
      if (next < context.currentTime) next = context.currentTime + .025;
      while (next < context.currentTime + .12) {
        const bar = Math.floor(step / 8);
        const tick = step % 8;
        const lead = melody[bar][tick];
        if (lead !== undefined) {
          const sustain = rhythm === 'quiet' ? 1.8 : .76;
          const level = voice === 'sawtooth' || voice === 'square' ? .025 : .05;
          note(music, next, voice, hz(lead), hz(lead), beat * sustain, level, .019);
          if (rhythm === 'quiet') note(music, next + .08, 'sine', hz(lead + 12), hz(lead + 12), beat, .014, .024);
        }
        if (pulse.includes(tick)) {
          const root = hz(bass[bar] + (tick === pulse[0] ? 0 : 7));
          const type = rhythm === 'drive' ? 'triangle' : 'sine';
          note(music, next, type, root, root, beat * (rhythm === 'quiet' ? 2.2 : .85), .068, .021);
        }
        if (rhythm !== 'quiet' && (tick === 2 || tick === 6 || (rhythm === 'drive' && tick === 0))) {
          const low = rhythm === 'drive' ? 170 : 1050;
          note(music, next, 'noise', low, low * .6, .061, .044);
        }
        step = (step + 1) % (melody.length * 8);
        next += beat;
      }
    }
    schedule();
    timer = setInterval(schedule, 35);
  }

  function unlock() {
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!enabled || !Audio) return;
    if (!context) {
      context = new Audio();
      master = context.createGain();
      master.gain.value = .72;
      master.connect(context.destination);
      noise = context.createBuffer(1, Math.ceil(context.sampleRate * .5), context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      context.addEventListener('statechange', sync);
    }
    if (context.state !== 'running') context.resume().then(sync).catch(() => {});
    else sync();
  }

  return {
    unlock, sync,
    select(nextGame) {
      if (nextGame === game) return;
      stopMusic();
      game = nextGame;
      step = 0;
      paused = false;
      sync();
    },
    pause(value) {
      paused = value;
      sync();
    },
    enable(value) {
      enabled = value;
      if (master) master.gain.setTargetAtTime(enabled ? .72 : 0, context.currentTime, .012);
      if (enabled) unlock();
      else sync();
    },
    play(name) {
      if (!enabled || document.hidden || context?.state !== 'running') return;
      const layers = effects[game]?.[name];
      if (!layers) return;
      const now = context.currentTime + .005;
      for (const [offset, type, from, to, time, peak] of layers) {
        note(master, now + offset, type, from, to, time, peak);
      }
    },
  };
}
