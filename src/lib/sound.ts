/**
 * Synthesized sound effects via Web Audio API — no audio files needed.
 * All sounds are generated programmatically so they work offline and load instantly.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('callout:mute') === 'true';
}

export function toggleMute(): boolean {
  const next = !isMuted();
  localStorage.setItem('callout:mute', String(next));
  return next;
}

/** Play a single synthesized tone */
function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainVal = 0.25,
  startDelay = 0,
) {
  const c = getCtx();
  if (!c || isMuted()) return;

  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.connect(gain);
  gain.connect(c.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + startDelay);

  // Fade out to avoid clicks
  gain.gain.setValueAtTime(gainVal, c.currentTime + startDelay);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startDelay + duration);

  osc.start(c.currentTime + startDelay);
  osc.stop(c.currentTime + startDelay + duration + 0.01);
}

/** Short satisfying "pop" when marking a square */
export function playMark() {
  playTone(700, 0.07, 'sine', 0.18);
}

/** Triumphant arpeggio (C-E-G-C) when bingo is confirmed */
export function playBingo() {
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    playTone(freq, 0.35, 'triangle', 0.22, i * 0.1);
  });
  // Add a final sustain on the top note
  playTone(1047, 0.6, 'sine', 0.15, 0.4);
}

/** Quick two-note ascending "game on" when a new round starts */
export function playRoundStart() {
  playTone(440, 0.12, 'sine', 0.2, 0);
  playTone(660, 0.18, 'sine', 0.2, 0.13);
}
