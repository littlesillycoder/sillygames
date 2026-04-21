let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function playTone(freq, type, duration, gainVal = 0.3, startTime = null) {
  const ac = getCtx();
  const t = startTime ?? ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(gainVal, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.start(t);
  osc.stop(t + duration);
}

function playSlide(freqStart, freqEnd, type, duration, gainVal = 0.3) {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t);
  osc.frequency.linearRampToValueAtTime(freqEnd, t + duration);
  gain.gain.setValueAtTime(gainVal, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.start(t);
  osc.stop(t + duration);
}

export const audio = {
  jump() {
    playSlide(300, 600, 'square', 0.12, 0.2);
  },

  shoot() {
    playTone(120, 'sine', 0.1, 0.25);
  },

  bubblePop() {
    const ac = getCtx();
    const t = ac.currentTime;
    playSlide(800, 200, 'sine', 0.15, 0.3);
    playTone(400, 'square', 0.05, 0.15, t + 0.05);
  },

  enemyCaptured() {
    const ac = getCtx();
    const t = ac.currentTime;
    [300, 400, 500, 600].forEach((f, i) => {
      playTone(f, 'square', 0.1, 0.2, t + i * 0.08);
    });
  },

  collectFruit() {
    const ac = getCtx();
    const t = ac.currentTime;
    [500, 700, 900].forEach((f, i) => {
      playTone(f, 'triangle', 0.12, 0.25, t + i * 0.1);
    });
  },

  playerDie() {
    playSlide(600, 100, 'sawtooth', 0.5, 0.4);
  },

  levelClear() {
    const ac = getCtx();
    const t = ac.currentTime;
    [400, 500, 600, 700, 800].forEach((f, i) => {
      playTone(f, 'square', 0.15, 0.3, t + i * 0.1);
    });
  },
};
