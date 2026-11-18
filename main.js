const canvas = document.querySelector('#field');
const ctx = canvas.getContext('2d', { alpha: false });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = {
  w: 0, h: 0, dpr: 1, time: 0, last: 0, motion: !reduceMotion.matches,
  pointer: { x: .66, y: .52, px: .66, py: .52, active: false, down: false },
  heat: { x: .87, y: .43 }, particles: [], pulses: [], intensity: 2,
  draggingHeat: false, holdTimer: 0, holdStarted: 0, flickUntil: 0, sample: { x: .7, y: .5 },
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rand = (a, b) => a + Math.random() * (b - a);
const palettes = [
  [[45, 148, 160], [95, 220, 193], [245, 181, 101], [255, 121, 62]],
  [[54, 177, 195], [131, 131, 236], [207, 135, 237], [115, 222, 219]],
  [[60, 133, 158], [104, 195, 219], [122, 221, 215], [169, 190, 222]],
  [[50, 176, 184], [116, 224, 194], [187, 139, 226], [243, 180, 105]],
];

function resize() {
  state.w = innerWidth; state.h = innerHeight;
  state.dpr = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.2 : 1.45);
  canvas.width = Math.round(state.w * state.dpr); canvas.height = Math.round(state.h * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0); resetField();
}
function snakePoint(u) {
  const angle = .28 + u * Math.PI * 4.7;
  const r = .205 - u * .147;
  return { x: .69 + Math.cos(angle) * r * 1.13, y: .53 + Math.sin(angle) * r * .84 };
}
function resetField() {
  const count = Math.min(6500, Math.max(2600, Math.floor(state.w * state.h / 250)));
  state.particles = Array.from({ length: count }, (_, i) => {
    const kind = i < count * .18 ? 0 : i < count * .45 ? 1 : i < count * .72 ? 2 : 3;
    const x = Math.random(), y = Math.random();
    return { x, y, ox: x, oy: y, vx: rand(-.00018, .00018), vy: rand(-.00018, .00018),
      phase: rand(0, Math.PI * 2), depth: Math.random(), size: Math.random() < .93 ? rand(.35, 1.05) : rand(1.1, 1.65),
      kind, u: Math.random(), seed: i };
  });
  ctx.fillStyle = '#030607'; ctx.fillRect(0, 0, state.w, state.h);
}
function flow(x, y, t, p) {
  return Math.sin(x * 8 + t * .38 + p) * Math.cos(y * 6 - t * .29) + .45 * Math.sin((x + y) * 13 + t * .2);
}
function scentLine(x, side, t) {
  const head = snakePoint(.965);
  const vx = x - head.x;
  return head.y + side * (.018 + Math.abs(vx) * .22) + Math.sin(vx * 24 + t * .55 + side) * .024;
}
function colorFor(p, heat, scent, ground, body) {
  let mix = 0;
  if (p.kind === 0) mix = clamp(.05 + heat * .91 + p.depth * .13, 0, .99);
  else if (p.kind === 1) mix = clamp(.36 + scent * .48 + p.depth * .16, 0, .99);
  else if (p.kind === 2) mix = clamp(.04 + ground * .43 + p.depth * .46, 0, .99);
  else mix = clamp(.22 + body * .48 + p.depth * .28, 0, .99);
  const pal = palettes[p.kind]; const f = mix * (pal.length - 1); const j = Math.min(pal.length - 2, Math.floor(f)); const k = f - j;
  return pal[j].map((c, q) => Math.round(c * (1 - k) + pal[j + 1][q] * k));
}
function drawBackdrop(t) {
  ctx.fillStyle = 'rgba(3,6,7,.24)'; ctx.fillRect(0, 0, state.w, state.h);
  const glow = ctx.createRadialGradient(state.w * .7, state.h * .5, 0, state.w * .7, state.h * .5, Math.max(state.w, state.h) * .62);
  glow.addColorStop(0, 'rgba(16,43,41,.11)'); glow.addColorStop(.53, 'rgba(14,29,32,.055)'); glow.addColorStop(1, 'rgba(3,6,7,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, state.w, state.h);
  const groundY = state.h * .78;
  const horizon = ctx.createLinearGradient(0, groundY - 95, 0, state.h);
  horizon.addColorStop(0, 'rgba(12,30,34,0)'); horizon.addColorStop(1, 'rgba(15,39,43,.15)');
  ctx.fillStyle = horizon; ctx.fillRect(0, groundY - 95, state.w, state.h - groundY + 95);
}
function updateParticles(now) {
  const t = state.time * .001, heat = state.heat, ptr = state.pointer;
  const pit = snakePoint(.965), headX = pit.x, headY = pit.y;
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.particles) {
    const { x, y } = p; let ax = 0, ay = 0;
    const n = flow(x, y, t, p.phase);
    ax += Math.cos(n * 2 + p.phase) * .000012; ay += Math.sin(n * 1.8 + p.phase) * .000012;
    const drift = Math.sin(t * .2 + p.phase) * .00001;
    ax += drift; ay += Math.cos(t * .17 + p.phase) * .00001;

    const dxh = x - heat.x, dyh = y - heat.y, dh = Math.hypot(dxh, dyh) + .0001;
    const thermal = Math.exp(-(dh * dh) / .0065);
    if (p.kind === 0) {
      const pull = thermal * .000022;
      ax -= dxh / dh * pull; ay -= dyh / dh * pull;
      ax += Math.cos(t * 1.5 + p.phase) * thermal * .000012;
      ay += Math.sin(t * 1.3 + p.phase) * thermal * .000012;
    }

    const lineA = scentLine(x, -1, t), lineB = scentLine(x, 1, t);
    const da = y - lineA, db = y - lineB;
    const chemA = Math.exp(-(da * da) / .00065), chemB = Math.exp(-(db * db) / .00065);
    const chemical = Math.max(chemA, chemB);
    if (p.kind === 1) {
      const side = chemA > chemB ? -1 : 1, d = side < 0 ? da : db;
      ay += clamp(-d, -.12, .12) * .000009;
      ax += Math.sin(y * 22 + t + side) * chemical * .000008;
    }
    const ageFlick = now < state.flickUntil ? 1 - (state.flickUntil - now) / 1250 : 0;
    if (ageFlick > 0 && p.kind === 1) {
      const sx = state.sample.x, sy = state.sample.y;
      const d = Math.hypot(x - sx, y - sy);
      if (d < .09) { ax += (headX - x) * .000015; ay += (headY - y) * .000015; }
    }

    let ground = 0;
    for (const pulse of state.pulses) {
      const age = (now - pulse.at) / 1000;
      if (age > 3.7) continue;
      const dx = (x - pulse.x) * state.w, dy = (y - pulse.y) * state.h;
      const dist = Math.hypot(dx, dy), radius = age * (180 + pulse.power * 155);
      const band = Math.abs(dist - radius);
      const amp = Math.exp(-band * band / (460 + pulse.power * 420)) * Math.max(0, 1 - age / 3.7) * pulse.power;
      ground = Math.max(ground, amp);
      const push = Math.sin((dist - radius) * .047) * amp * .000035;
      ax += dx / (dist + 1) * push; ay += dy / (dist + 1) * push;
    }
    if (p.kind === 2 && y > .66) {
      const plane = .77 + Math.sin(x * 6 + t * .25) * .025;
      ay += clamp(plane - y, -.2, .2) * .000006;
    }

    const target = snakePoint(p.u), bodyDist = Math.hypot(x - target.x, y - target.y);
    const body = p.seed < state.particles.length * .18 ? Math.exp(-bodyDist * bodyDist / .0002) : 0;
    if (p.seed < state.particles.length * .18) {
      ax += (target.x - x) * .000021; ay += (target.y - y) * .000021;
    }
    if (ptr.active) {
      const mx = x - ptr.x, my = y - ptr.y, md = Math.hypot(mx, my);
      if (md < .15) {
        const f = (1 - md / .15) * .000027;
        ax += mx / (md + .003) * f - (ptr.x - ptr.px) * .0001;
        ay += my / (md + .003) * f - (ptr.y - ptr.py) * .0001;
      }
    }
    p.vx = (p.vx + ax) * .986; p.vy = (p.vy + ay) * .986;
    p.x += p.vx; p.y += p.vy;
    if (p.x < -.02) p.x = 1.02; if (p.x > 1.02) p.x = -.02;
    if (p.y < -.02) p.y = 1.02; if (p.y > 1.02) p.y = -.02;
    const c = colorFor(p, thermal, chemical, ground, body);
    const pointerDist = ptr.active ? Math.hypot(x - ptr.x, y - ptr.y) : 1;
    const near = ptr.active ? Math.max(0, 1 - pointerDist / .18) : 0;
    const opacity = clamp(.14 + p.depth * .43 + thermal * .57 + chemical * .38 + ground * .68 + body * .68 + near * .25, .08, .94);
    const size = p.size * (1 + thermal * .6 + chemical * .45 + ground * .45 + body * .7 + near * .3);
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${opacity})`;
    ctx.fillRect(p.x * state.w, p.y * state.h, size, size);
  }
  ctx.globalCompositeOperation = 'source-over'; ptr.px = ptr.x; ptr.py = ptr.y;
  state.pulses = state.pulses.filter(p => now - p.at < 3900);
}
function drawSignals(now) {
  const t = state.time * .001, hx = state.heat.x * state.w, hy = state.heat.y * state.h;
  const pit = snakePoint(.965), px = pit.x * state.w, py = pit.y * state.h;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const warmth = ctx.createRadialGradient(hx, hy, 0, hx, hy, Math.min(state.w, state.h) * .25);
  warmth.addColorStop(0, 'rgba(255,185,105,.095)'); warmth.addColorStop(.32, 'rgba(247,142,74,.035)'); warmth.addColorStop(1, 'rgba(247,142,74,0)');
  ctx.fillStyle = warmth; ctx.fillRect(hx - state.h * .26, hy - state.h * .26, state.h * .52, state.h * .52);
  ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,197,126,.83)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(hx, hy, 13 + Math.sin(t * 2) * 1.2, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,190,115,.27)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(120,228,207,.9)'; ctx.shadowColor = '#78e4cf'; ctx.shadowBlur = 13; ctx.fill(); ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(120,228,207,.25)'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, state.h * .78); ctx.lineTo(state.w, state.h * .78); ctx.strokeStyle = 'rgba(100,190,205,.1)'; ctx.lineWidth = 1; ctx.stroke();

  const head = snakePoint(.965);
  ctx.setLineDash([1, 11]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(187,134,238,.16)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 58; i++) {
      const x = .15 + i / 58 * .75, y = scentLine(x, side, t);
      if (i === 0) ctx.moveTo(x * state.w, y * state.h); else ctx.lineTo(x * state.w, y * state.h);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (now < state.flickUntil) {
    const progress = clamp((now - state.holdStarted) / 450, 0, 1);
    const tx = state.sample.x * state.w, ty = state.sample.y * state.h;
    ctx.lineWidth = 1.15; ctx.strokeStyle = `rgba(122,232,214,${.72 * (1 - progress * .3)})`;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + (tx - px) * .42, py - 34, px + (tx - px) * .82, py - 12); ctx.stroke();
    ctx.strokeStyle = `rgba(207,139,241,${.76 * (1 - progress * .3)})`;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + (tx - px) * .42, py + 34, px + (tx - px) * .82, py + 12); ctx.stroke();
  }
  for (const pulse of state.pulses) {
    const age = (now - pulse.at) / 1000, r = age * (180 + pulse.power * 155), alpha = Math.max(0, 1 - age / 3.7);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.ellipse(pulse.x * state.w, pulse.y * state.h, r + i * 24, (r + i * 24) * .21, -.035, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(112,214,228,${alpha * (.3 - i * .065)})`; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  ctx.restore();
}
function frame(now) {
  const dt = Math.min(40, now - (state.last || now)); state.last = now;
  if (state.motion) state.time += dt;
  drawBackdrop(state.time); updateParticles(now); drawSignals(now);
  if (state.motion) requestAnimationFrame(frame);
}
function start() { state.last = 0; requestAnimationFrame(frame); }
function renderPaused() { if (!state.motion) frame(performance.now()); }
function point(e) { return { x: clamp(e.clientX / innerWidth, 0, 1), y: clamp(e.clientY / innerHeight, 0, 1) }; }
function note(text, label = 'HEAT · CHEMISTRY · GROUND MOVEMENT') {
  document.querySelector('#interaction-note').textContent = text;
  document.querySelector('#readout').textContent = label;
}
function flickAt(p) {
  state.sample = p; state.holdStarted = performance.now(); state.flickUntil = state.holdStarted + 1250;
  note('Tongue flick: collecting two nearby chemical samples.', 'CHEMICAL SAMPLES / TONGUE FLICK');
  renderPaused();
}
function nearestHeat(p) { return Math.hypot(p.x - state.heat.x, p.y - state.heat.y) < .055; }

document.addEventListener('pointermove', e => {
  const p = point(e); state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.active = true;
  if (state.draggingHeat) {
    state.heat.x = p.x; state.heat.y = p.y;
    note('Warm source moved: watch its thermal signal cross the field.', 'INFRARED / THERMAL CONTRAST');
  } else if (state.pointer.down && !state.holdStarted) state.sample = p;
  renderPaused();
});
document.addEventListener('pointerout', e => { if (!e.relatedTarget) { state.pointer.active = false; renderPaused(); } });
document.addEventListener('pointerdown', e => {
  if (e.target.closest('button,a')) return;
  const p = point(e); state.pointer.down = true; state.holdStarted = 0;
  if (nearestHeat(p)) {
    state.draggingHeat = true; note('Drag the warm source; the nearby particles brighten and shift toward amber.', 'INFRARED / THERMAL CONTRAST');
    renderPaused(); return;
  }
  state.sample = p;
  state.holdTimer = window.setTimeout(() => { state.holdStarted = performance.now(); flickAt(state.sample); }, 430);
  state.tapStart = performance.now(); state.tapPoint = p;
});
document.addEventListener('pointerup', e => {
  if (state.draggingHeat) { state.draggingHeat = false; state.pointer.down = false; renderPaused(); return; }
  if (!state.pointer.down) return;
  window.clearTimeout(state.holdTimer);
  const p = point(e), duration = performance.now() - (state.tapStart || 0);
  if (state.holdStarted) {
    state.flickUntil = Math.max(state.flickUntil, performance.now() + 360);
  } else if (duration < 400 && !e.target.closest('button,a')) {
    state.pulses.push({ x: p.x, y: p.y, at: performance.now(), power: state.intensity / 3 });
    note(`Ground pulse: ${['low', 'medium', 'high'][state.intensity - 1]} intensity.`, 'GROUND VIBRATION / MECHANICAL CUE');
  }
  state.pointer.down = false; renderPaused();
});
document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => {
  state.intensity = Number(button.dataset.level);
  document.querySelectorAll('[data-level]').forEach(el => el.classList.toggle('selected', el === button));
  note(`Vibration strength set to ${button.textContent.toLowerCase()}. Tap anywhere in the field to send a pulse.`, 'GROUND VIBRATION / MECHANICAL CUE');
}));
const motionButton = document.querySelector('#motion');
function setMotion(on) {
  state.motion = on; motionButton.setAttribute('aria-pressed', String(!on));
  motionButton.querySelector('span:last-child').textContent = on ? 'PAUSE FIELD' : 'RESUME FIELD';
  motionButton.querySelector('.motion-icon').textContent = on ? 'Ⅱ' : '▶';
  if (on) start(); else frame(performance.now());
}
motionButton.addEventListener('click', () => setMotion(!state.motion));
reduceMotion.addEventListener?.('change', e => { if (e.matches) setMotion(false); });
document.querySelector('#sources-toggle').addEventListener('click', () => { document.querySelector('#sources').hidden = false; });
document.querySelector('#sources-close').addEventListener('click', () => { document.querySelector('#sources').hidden = true; });
addEventListener('resize', resize, { passive: true });
resize(); if (state.motion) start(); else frame(performance.now());
