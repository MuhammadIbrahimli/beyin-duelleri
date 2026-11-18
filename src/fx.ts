// Haptics (vibration) and small sounds. Vibration is on by default where the device supports it;
// sound is off until the player turns it on in the Passport. Nothing here ever blocks the experiments' timing.
const SOUND_KEY = "bd_sound";

export const soundOn = () => localStorage.getItem(SOUND_KEY) === "1";
export const setSound = (on: boolean) => localStorage.setItem(SOUND_KEY, on ? "1" : "0");

let ctx: AudioContext | null = null;
function tone(freq: number, ms: number, type: OscillatorType = "sine", gain = 0.05) {
  if (!soundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000);
  } catch { /* audio is a nicety, never an error */ }
}
const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

export const fx = {
  tap() { vibrate(8); },
  good() { vibrate(14); tone(660, 70); },
  bad() { vibrate([30, 40, 30]); tone(170, 170, "square", 0.04); },
  tile(i: number) { tone(300 + i * 45, 130); },
  win() { vibrate([20, 40, 70]); tone(523, 90); setTimeout(() => tone(784, 170), 100); },
};
