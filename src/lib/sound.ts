let ctx: AudioContext | null = null;
export function alertTone() {
  try {
    ctx ||= new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = ctx.currentTime;
    [880, 660, 880].forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.16); g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.16 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.14);
      o.connect(g).connect(ctx!.destination); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.15);
    });
  } catch { /* audio unavailable */ }
}
