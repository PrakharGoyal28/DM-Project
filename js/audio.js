/*
 * audio.js — tiny sound effects generated with the Web Audio API.
 * No sound files are downloaded. Sound is OFF until the player turns it on,
 * and the game is fully playable without it.
 */
(function (root) {
  'use strict';

  let context = null;
  let enabled = false;

  function getContext() {
    if (!context) {
      const AudioCtx = root.AudioContext || root.webkitAudioContext;
      if (!AudioCtx) return null;
      context = new AudioCtx();
    }
    if (context.state === 'suspended') context.resume();
    return context;
  }

  /** Plays a sequence of [frequencyHz, durationSeconds] notes. */
  function playNotes(notes, type, volume) {
    if (!enabled) return;
    const ctx = getContext();
    if (!ctx) return;
    let time = ctx.currentTime;
    for (const [frequency, duration] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(time);
      osc.stop(time + duration + 0.02);
      time += duration * 0.85;
    }
  }

  const SOUNDS = {
    move: () => playNotes([[520, 0.06]], 'sine', 0.05),
    bump: () => playNotes([[160, 0.12]], 'triangle', 0.08),
    gem: () => playNotes([[880, 0.08], [1320, 0.12]], 'sine', 0.08),
    hint: () => playNotes([[660, 0.08], [780, 0.1]], 'sine', 0.06),
    goal: () => playNotes([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]], 'triangle', 0.09),
    complete: () => playNotes([[784, 0.12], [988, 0.12], [1175, 0.3]], 'sine', 0.08),
    step: () => playNotes([[440, 0.05]], 'sine', 0.04)
  };

  const api = {
    play(name) { if (SOUNDS[name]) SOUNDS[name](); },
    setEnabled(value) {
      // The AudioContext is created lazily inside the first sound, which is
      // always triggered by a click or key press (browser autoplay rules).
      enabled = Boolean(value);
    },
    isEnabled() { return enabled; }
  };

  root.MazeAudio = api;
})(window);
