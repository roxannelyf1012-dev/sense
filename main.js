const canvas = document.querySelector('#field');
const ctx = canvas.getContext('2d', { alpha: false });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const video = document.querySelector('#hand-video');
const handButton = document.querySelector('#hand-toggle');
const state = {
  w: 0, h: 0, dpr: 1, time: 0, last: 0, motion: !reduceMotion.matches,
  pointer: { x: .68, y: .53, px: .68, py: .53, active: false, down: false },
  heat: { x: .87, y: .43 }, particles: [], pulses: [], intensity: 2,
  draggingHeat: false, holdTimer: 0, holdStarted: 0, flickUntil: 0,
  sample: { x: .72, y: .53 }, tapStart: 0,
  handActive: false, handLoading: false, handStream: null, handLandmarker: null,
  lastVideoTime: -1, lastHandFrame: 0, handCandidate: '', handCandidateAt: 0,
  handGesture: '', lastGestureAction: 0,
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rand = (a, b) => a + Math.random() * (b - a);
const palettes = [
  [[53, 128, 232], [119, 92, 243], [220, 111, 235], [255, 148, 167], [255, 207, 141]],
  [[47, 193, 216], [111, 143, 246], [194, 114, 245], [244, 137, 211], [255, 197, 231]],
  [[54, 165, 207], [102, 208, 226], [134, 230, 220], [176, 190, 239], [219, 166, 236]],
  [[78, 231, 200], [117, 190, 250], [188, 135, 249], [255, 150, 205], [255, 194, 130]],
];

function resize() {
  state.w = innerWidth; state.h = innerHeight;
  state.dpr = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.25 : 1.55);
  canvas.width = Math.round(state.w * state.dpr); canvas.height = Math.round(state.h * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0); resetField();
}
function snakePoint(u) {
  const angle = .3 + u * Math.PI * 4.8;
  const radius = .238 - u * .174;
  return { x: .69 + Math.cos(angle) * radius * 1.16, y: .53 + Math.sin(angle) * radius * .87 };
}
function resetField() {
  const count = Math.min(11800, Math.max(4700, Math.floor(state.w * state.h / 150)));
  const bodyCount = Math.floor(count * .21);
  state.particles = Array.from({ length: count }, (_, i) => {
    const kind = i < bodyCount ? 3 : i < count * .43 ? 0 : i < count * .69 ? 1 : 2;
    const x = Math.random(), y = Math.random();
    return { x, y, vx: rand(-.00018, .00018), vy: rand(-.00018, .00018),
      phase: rand(0, Math.PI * 2), depth: Math.random(), size: Math.random() < .89 ? rand(.42, 1.25) : rand(1.25, 1.9),
      kind, u: Math.random(), seed: i };
  });
  ctx.fillStyle = '#030607'; ctx.fillRect(0, 0, state.w, state.h);
}
function flow(x, y, t, p) {
  return Math.sin(x * 8 + t * .38 + p) * Math.cos(y * 6 - t * .29) + .52 * Math.sin((x + y) * 13 + t * .2);
}
function scentLine(x, side, t) {
  const head = snakePoint(.975), dx = x - head.x;
  return head.y + side * (.018 + Math.abs(dx) * .2) + Math.sin(dx * 22 + t * .48 + side) * .027;
}
function interpolateColor(p, heat, scent, vibration, body) {
  let amount = p.depth * .2;
  if (p.kind === 0) amount += .06 + heat * .91;
  else if (p.kind === 1) amount += .16 + scent * .77;
  else if (p.kind === 2) amount += vibration * .88;
  else amount += body * .32;
  amount = clamp(amount, 0, .999);
  const colors = palettes[p.kind], at = amount * (colors.length - 1), index = Math.floor(at), mix = at - index;
  return colors[index].map((c, i) => Math.round(c * (1 - mix) + colors[index + 1][i] * mix));
}
function drawBackdrop() {
  ctx.fillStyle = 'rgba(3,6,7,.18)'; ctx.fillRect(0, 0, state.w, state.h);
  const aura = ctx.createRadialGradient(state.w * .7, state.h * .5, 0, state.w * .7, state.h * .5, Math.max(state.w, state.h) * .67);
  aura.addColorStop(0, 'rgba(38,37,92,.16)'); aura.addColorStop(.35, 'rgba(21,46,69,.10)'); aura.addColorStop(.72, 'rgba(13,40,39,.05)'); aura.addColorStop(1, 'rgba(3,6,7,0)');
  ctx.fillStyle = aura; ctx.fillRect(0, 0, state.w, state.h);
  const floorY = state.h * .78;
  const floor = ctx.createLinearGradient(0, floorY - 100, 0, state.h);
  floor.addColorStop(0, 'rgba(18,42,59,0)'); floor.addColorStop(1, 'rgba(19,46,61,.2)');
  ctx.fillStyle = floor; ctx.fillRect(0, floorY - 100, state.w, state.h - floorY + 100);
}
function updateParticles(now) {
  const t = state.time * .001, ptr = state.pointer, heatSource = state.heat;
  const head = snakePoint(.975);
  const bodyCount = Math.floor(state.particles.length * .21);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.particles) {
    const x = p.x, y = p.y;
    const n = flow(x, y, t, p.phase);
    let ax = Math.cos(n * 1.8 + p.phase) * .000013 + Math.sin(t * .18 + p.phase) * .000009;
    let ay = Math.sin(n * 1.7 + p.phase) * .000013 + Math.cos(t * .17 + p.phase) * .000009;

    const dxh = x - heatSource.x, dyh = y - heatSource.y, dh = Math.hypot(dxh, dyh) + .0001;
    const heat = Math.exp(-(dh * dh) / .008);
    if (p.kind === 0) {
      const pull = heat * .000026;
      ax -= dxh / dh * pull; ay -= dyh / dh * pull;
      ax += Math.cos(t * 1.3 + p.phase) * heat * .000014;
      ay += Math.sin(t * 1.4 + p.phase) * heat * .000014;
    }

    const leftTrail = scentLine(x, -1, t), rightTrail = scentLine(x, 1, t);
    const leftDelta = y - leftTrail, rightDelta = y - rightTrail;
    const leftSignal = Math.exp(-(leftDelta * leftDelta) / .00085);
    const rightSignal = Math.exp(-(rightDelta * rightDelta) / .00085);
    const scent = Math.max(leftSignal, rightSignal);
    if (p.kind === 1) {
      const delta = leftSignal > rightSignal ? leftDelta : rightDelta;
      ax += Math.sin(y * 19 + t) * scent * .00001;
      ay += clamp(-delta, -.15, .15) * .000012;
    }
    if (now < state.flickUntil && p.kind === 1) {
      const d = Math.hypot(x - state.sample.x, y - state.sample.y);
      if (d < .12) { ax += (head.x - x) * .000018; ay += (head.y - y) * .000018; }
    }

    let vibration = 0;
    for (const pulse of state.pulses) {
      const age = (now - pulse.at) / 1000;
      if (age > 4.2) continue;
      const dx = (x - pulse.x) * state.w, dy = (y - pulse.y) * state.h;
      const distance = Math.hypot(dx, dy), radius = age * (230 + pulse.power * 190);
      const band = Math.abs(distance - radius);
      const amp = Math.exp(-band * band / (680 + pulse.power * 720)) * Math.max(0, 1 - age / 4.2) * pulse.power;
      vibration = Math.max(vibration, amp);
      const force = Math.sin((distance - radius) * .05) * amp * .000041;
      ax += dx / (distance + 1) * force; ay += dy / (distance + 1) * force;
    }
    if (p.kind === 2 && y > .64) {
      const groundY = .77 + Math.sin(x * 8 + t * .26) * .02;
      ay += clamp(groundY - y, -.2, .2) * .000009;
    }

    const bodyPoint = snakePoint(p.u);
    const bodyDistance = Math.hypot(x - bodyPoint.x, y - bodyPoint.y);
    const body = p.seed < bodyCount ? Math.exp(-bodyDistance * bodyDistance / .00023) : 0;
    if (p.seed < bodyCount) {
      ax += (bodyPoint.x - x) * .000024; ay += (bodyPoint.y - y) * .000024;
    }
    if (ptr.active) {
      const dx = x - ptr.x, dy = y - ptr.y, distance = Math.hypot(dx, dy);
      if (distance < .19) {
        const force = (1 - distance / .19) * .000039;
        ax += dx / (distance + .002) * force - (ptr.x - ptr.px) * .00012;
        ay += dy / (distance + .002) * force - (ptr.y - ptr.py) * .00012;
      }
    }

    p.vx = (p.vx + ax) * .985; p.vy = (p.vy + ay) * .985;
    p.x += p.vx; p.y += p.vy;
    if (p.x < -.02) p.x = 1.02; if (p.x > 1.02) p.x = -.02;
    if (p.y < -.02) p.y = 1.02; if (p.y > 1.02) p.y = -.02;
    const rgb = interpolateColor(p, heat, scent, vibration, body);
    const near = ptr.active ? Math.max(0, 1 - Math.hypot(x - ptr.x, y - ptr.y) / .22) : 0;
    const opacity = clamp(.24 + p.depth * .5 + heat * .76 + scent * .62 + vibration * .84 + body * .82 + near * .4, .12, 1);
    const size = p.size * (1 + heat * .85 + scent * .65 + vibration * .8 + body * .8 + near * .5);
    const px = p.x * state.w, py = p.y * state.h;
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${opacity})`;
    if (p.seed % 5 === 0 && opacity > .32) {
      ctx.globalAlpha = .18 + opacity * .17;
      ctx.fillRect(px - size * .4, py - size * .4, size * 2.5, size * 2.5);
      ctx.globalAlpha = 1;
    }
    ctx.fillRect(px, py, size, size);
  }
  ctx.globalCompositeOperation = 'source-over';
  ptr.px = ptr.x; ptr.py = ptr.y;
  state.pulses = state.pulses.filter(p => now - p.at < 4600);
}
function cubic(a, b, c, d, t) {
  const k = 1 - t;
  return { x: k*k*k*a.x + 3*k*k*t*b.x + 3*k*t*t*c.x + t*t*t*d.x,
    y: k*k*k*a.y + 3*k*k*t*b.y + 3*k*t*t*c.y + t*t*t*d.y };
}
function drawTongue(now, rootX, rootY) {
  const tipX = state.sample.x * state.w, tipY = state.sample.y * state.h;
  let dx = tipX - rootX, dy = tipY - rootY, length = Math.hypot(dx, dy) || 1;
  dx /= length; dy /= length;
  const nx = -dy, ny = dx;
  const split = { x: rootX + dx * length * .45, y: rootY + dy * length * .45 };
  const fork = [-1, 1].map(side => {
    const end = { x: tipX + nx * side * 13, y: tipY + ny * side * 13 };
    return { end, c1: { x: split.x + dx * length * .18 + nx * side * 10, y: split.y + dy * length * .18 + ny * side * 10 },
      c2: { x: tipX - dx * length * .18 + nx * side * 15, y: tipY - dy * length * .18 + ny * side * 15 } };
  });
  const progress = clamp((now - state.holdStarted) / 480, 0, 1);
  const reveal = Math.max(.06, progress);
  const stem = { c1: { x: rootX + dx * length * .17 + nx * 2, y: rootY + dy * length * .17 + ny * 2 },
    c2: { x: split.x - dx * length * .12, y: split.y - dy * length * .12 } };
  const drawPass = (wide) => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(rootX, rootY); ctx.quadraticCurveTo(stem.c1.x, stem.c1.y, split.x, split.y);
    ctx.strokeStyle = wide ? 'rgba(139,235,224,.22)' : 'rgba(222,255,247,.94)'; ctx.lineWidth = wide ? 8 : 1.1;
    ctx.shadowColor = '#9a83ff'; ctx.shadowBlur = wide ? 16 : 4; ctx.stroke();
    fork.forEach((branch, i) => {
      const color = i === 0 ? (wide ? 'rgba(113,225,240,.24)' : 'rgba(150,250,241,.96)') : (wide ? 'rgba(221,115,245,.24)' : 'rgba(255,180,231,.96)');
      ctx.beginPath(); ctx.moveTo(split.x, split.y);
      const end = { x: split.x + (branch.end.x - split.x) * reveal, y: split.y + (branch.end.y - split.y) * reveal };
      const c1 = { x: split.x + (branch.c1.x - split.x) * reveal, y: split.y + (branch.c1.y - split.y) * reveal };
      const c2 = { x: split.x + (branch.c2.x - split.x) * reveal, y: split.y + (branch.c2.y - split.y) * reveal };
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
      ctx.strokeStyle = color; ctx.lineWidth = wide ? 7 : 1.15; ctx.shadowColor = i === 0 ? '#74e4ef' : '#e684f4'; ctx.shadowBlur = wide ? 14 : 4; ctx.stroke();
    });
  };
  ctx.save(); ctx.globalCompositeOperation = 'screen'; drawPass(true); drawPass(false); ctx.shadowBlur = 0;
  for (let side = 0; side < 2; side++) {
    const branch = fork[side];
    for (let i = 0; i < 13; i++) {
      const u = (i / 13 + now * .00055) % 1;
      const p = cubic(split, branch.c1, branch.c2, branch.end, u * reveal);
      const c = side === 0 ? '122,246,235' : '255,177,234';
      ctx.fillStyle = `rgba(${c},${.44 + .5 * (1 - u)})`;
      const s = i % 4 === 0 ? 1.8 : 1.05; ctx.fillRect(p.x, p.y, s, s);
    }
  }
  ctx.restore();
}
function drawSignals(now) {
  const t = state.time * .001, heat = state.heat;
  const heatX = heat.x * state.w, heatY = heat.y * state.h;
  const head = snakePoint(.975), headX = head.x * state.w, headY = head.y * state.h;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const warm = ctx.createRadialGradient(heatX, heatY, 0, heatX, heatY, Math.min(state.w, state.h) * .25);
  warm.addColorStop(0, 'rgba(255,205,151,.2)'); warm.addColorStop(.13, 'rgba(255,153,179,.12)');
  warm.addColorStop(.38, 'rgba(166,104,242,.065)'); warm.addColorStop(.68, 'rgba(75,139,255,.025)'); warm.addColorStop(1, 'rgba(30,70,255,0)');
  ctx.fillStyle = warm; ctx.fillRect(heatX - state.h * .26, heatY - state.h * .26, state.h * .52, state.h * .52);
  ctx.beginPath(); ctx.arc(heatX, heatY, 5.5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,220,170,.95)'; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.beginPath(); ctx.arc(heatX, heatY, 15 + Math.sin(t * 2) * 2, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,166,188,.48)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(heatX, heatY, 25 + Math.sin(t * 1.2) * 3, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(153,124,255,.22)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(headX, headY, 3.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(164,255,228,.98)'; ctx.shadowColor = '#80f3d4'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;

  ctx.setLineDash([1, 8]); ctx.lineWidth = 1.1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 62; i++) {
      const x = .12 + i / 62 * .81, y = scentLine(x, side, t);
      if (i === 0) ctx.moveTo(x * state.w, y * state.h); else ctx.lineTo(x * state.w, y * state.h);
    }
    ctx.strokeStyle = side < 0 ? 'rgba(92,227,245,.43)' : 'rgba(226,112,248,.47)'; ctx.stroke();
  }
  ctx.setLineDash([]);
  const floorY = state.h * .78;
  ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(state.w, floorY); ctx.strokeStyle = 'rgba(118,208,232,.22)'; ctx.stroke();
  if (now < state.flickUntil) drawTongue(now, headX, headY);
  for (const pulse of state.pulses) {
    const age = (now - pulse.at) / 1000, radius = age * (230 + pulse.power * 190), alpha = Math.max(0, 1 - age / 4.2);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.ellipse(pulse.x * state.w, pulse.y * state.h, radius + i * 21, (radius + i * 21) * .23, -.04, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(109,216,244,${alpha * (.48 - i * .075)})`; ctx.lineWidth = i === 0 ? 1.35 : 1; ctx.stroke();
    }
  }
  if (state.pointer.active) {
    const x = state.pointer.x * state.w, y = state.pointer.y * state.h;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(229,255,247,.82)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 12 + Math.sin(t * 3) * 2, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(143,231,226,.22)'; ctx.stroke();
  }
  ctx.restore();
}
function frame(now) {
  const dt = Math.min(40, now - (state.last || now)); state.last = now;
  if (state.motion) state.time += dt;
  drawBackdrop(); updateParticles(now); drawSignals(now);
  if (state.motion) requestAnimationFrame(frame);
}
function start() { state.last = 0; requestAnimationFrame(frame); }
function renderPaused() { if (!state.motion) frame(performance.now()); }
function pointFromEvent(e) { return { x: clamp(e.clientX / innerWidth, 0, 1), y: clamp(e.clientY / innerHeight, 0, 1) }; }
function inField(e) {
  if (state.w <= 620) return e.clientY < document.querySelector('.side-panel').getBoundingClientRect().top;
  return e.clientX > document.querySelector('.side-panel').getBoundingClientRect().right;
}
function setNote(text, label = 'HEAT · CHEMISTRY · GROUND MOVEMENT') {
  document.querySelector('#interaction-note').textContent = text;
  document.querySelector('#readout').textContent = label;
}
function triggerFlick(p) {
  state.sample = p; state.holdStarted = performance.now(); state.flickUntil = state.holdStarted + 1600;
  setNote('Two chemical samples spiral into the shared field.', 'FORKED TONGUE / CHEMICAL SAMPLES');
  renderPaused();
}
function nearHeat(p) { return Math.hypot(p.x - state.heat.x, p.y - state.heat.y) < .065; }

document.addEventListener('pointermove', e => {
  if (!state.draggingHeat && !inField(e)) return;
  const p = pointFromEvent(e); state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.active = true;
  if (state.draggingHeat) {
    state.heat.x = p.x; state.heat.y = p.y;
    setNote('Warm source moved: watch its luminous thermal halo trail through the field.', 'INFRARED / THERMAL CONTRAST');
  }
  if (state.pointer.down && !state.holdStarted) state.sample = p;
  renderPaused();
});
document.addEventListener('pointerout', e => { if (!e.relatedTarget) { state.pointer.active = false; renderPaused(); } });
document.addEventListener('pointerdown', e => {
  if (!inField(e) || e.target.closest('button,a')) return;
  const p = pointFromEvent(e); state.pointer.down = true; state.holdStarted = 0;
  if (nearHeat(p)) {
    state.draggingHeat = true; setNote('Drag the amber source; the heat halo and nearby particles follow.', 'INFRARED / THERMAL CONTRAST'); renderPaused(); return;
  }
  state.sample = p; state.tapStart = performance.now();
  state.holdTimer = window.setTimeout(() => { state.holdStarted = performance.now(); triggerFlick(state.sample); }, 470);
});
document.addEventListener('pointerup', e => {
  if (state.draggingHeat) { state.draggingHeat = false; state.pointer.down = false; renderPaused(); return; }
  if (!state.pointer.down) return;
  window.clearTimeout(state.holdTimer);
  const p = pointFromEvent(e), duration = performance.now() - state.tapStart;
  if (state.holdStarted) state.flickUntil = Math.max(state.flickUntil, performance.now() + 420);
  else if (duration < 420 && inField(e)) {
    state.pulses.push({ x: p.x, y: p.y, at: performance.now(), power: state.intensity / 3 });
    setNote(`${['Low', 'Medium', 'High'][state.intensity - 1]} ground pulse expanding through the field.`, 'GROUND VIBRATION / MECHANICAL SIGNAL');
  }
  state.pointer.down = false; renderPaused();
});

document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => {
  state.intensity = Number(button.dataset.level);
  document.querySelectorAll('[data-level]').forEach(el => el.classList.toggle('selected', el === button));
  setNote(`Ground pulse strength: ${button.textContent.toLowerCase()}. Tap or make a fist to send it.`, 'GROUND VIBRATION / MECHANICAL SIGNAL');
}));

function classifyHand(landmarks) {
  const up = (tip, joint) => landmarks[tip].y < landmarks[joint].y - .015;
  const index = up(8, 6), middle = up(12, 10), ring = up(16, 14), pinky = up(20, 18);
  const pinch = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y) < .062;
  const count = [index, middle, ring, pinky].filter(Boolean).length;
  if (pinch) return 'pinch';
  if (index && middle && !ring && !pinky) return 'two-fingers';
  if (count === 0) return 'fist';
  if (count >= 4) return 'open-palm';
  return 'point';
}
function handAction(gesture, p, now) {
  state.pointer.px = state.pointer.x; state.pointer.py = state.pointer.y;
  state.pointer.x += (p.x - state.pointer.x) * .38; state.pointer.y += (p.y - state.pointer.y) * .38;
  state.pointer.active = true;
  if (gesture === 'pinch') {
    state.heat.x += (p.x - state.heat.x) * .32; state.heat.y += (p.y - state.heat.y) * .32;
    if (state.handGesture !== gesture) setNote('Pinch and move to carry the warm signal through the field.', 'HAND GESTURE / THERMAL SIGNAL');
  } else if (gesture === 'open-palm' && state.handGesture !== gesture) {
    setNote('Open palm: nearby particles flow away from your hand.', 'HAND GESTURE / FIELD DISTURBANCE');
  } else if (gesture === 'point' && state.handGesture !== gesture) {
    setNote('Your hand is tracing a path through all three signals.', 'HAND GESTURE / FIELD EXPLORATION');
  }
  if (gesture !== state.handGesture) {
    if (gesture === 'two-fingers' && now - state.lastGestureAction > 900) {
      triggerFlick(p); state.lastGestureAction = now;
    } else if (gesture === 'fist' && now - state.lastGestureAction > 700) {
      state.pulses.push({ x: p.x, y: p.y, at: now, power: state.intensity / 3 });
      setNote('Closed fist: a ground pulse spreads from your hand.', 'HAND GESTURE / GROUND VIBRATION');
      state.lastGestureAction = now;
    }
  }
  state.handGesture = gesture; renderPaused();
}
function processHandResults(result, now) {
  const landmarks = result.landmarks?.[0];
  if (!landmarks) { state.handGesture = ''; return; }
  const palm = landmarks[9];
  const p = { x: clamp(.34 + (1 - palm.x) * .64, .35, .98), y: clamp(.09 + palm.y * .78, .1, .86) };
  const candidate = classifyHand(landmarks);
  if (candidate !== state.handCandidate) { state.handCandidate = candidate; state.handCandidateAt = now; }
  if (now - state.handCandidateAt > 110) handAction(candidate, p, now);
}
function trackHands(now) {
  if (!state.handActive || !state.handLandmarker) return;
  if (video.readyState >= 2 && video.currentTime !== state.lastVideoTime && now - state.lastHandFrame > 72) {
    state.lastVideoTime = video.currentTime; state.lastHandFrame = now;
    try { processHandResults(state.handLandmarker.detectForVideo(video, now), now); }
    catch (error) { console.warn('Hand tracking frame skipped', error); }
  }
  requestAnimationFrame(trackHands);
}
async function startHandTracking() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs a secure HTTPS page or localhost.');
  state.handLoading = true; handButton.disabled = true;
  handButton.querySelector('.hand-label').textContent = 'STARTING CAMERA…';
  setNote('Waiting for camera permission. Video stays on this device.', 'HAND TRACKING / CAMERA PERMISSION');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
    state.handStream = stream; video.srcObject = stream; await video.play();
    const { FilesetResolver, HandLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
    const options = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .55, minTrackingConfidence: .5 };
    try { state.handLandmarker = await HandLandmarker.createFromOptions(files, options); }
    catch { options.baseOptions.delegate = 'CPU'; state.handLandmarker = await HandLandmarker.createFromOptions(files, options); }
    state.handActive = true; state.handGesture = ''; state.handCandidate = '';
    video.classList.add('active'); handButton.classList.add('active');
    handButton.querySelector('.hand-label').textContent = 'HAND GESTURES ON';
    handButton.querySelector('i').textContent = 'CAMERA LIVE';
    setNote('Show one hand: open palm stirs, pinch moves heat, two fingers sample, fist sends a pulse.', 'HAND TRACKING / LIVE');
    requestAnimationFrame(trackHands);
  } catch (error) {
    stopHandTracking();
    handButton.querySelector('.hand-label').textContent = 'ENABLE HAND GESTURES';
    handButton.querySelector('i').textContent = 'CAMERA IS LOCAL';
    setNote(error.message || 'Camera could not start. Touch gestures still work.', 'HAND TRACKING / UNAVAILABLE');
  } finally { state.handLoading = false; handButton.disabled = false; }
}
function stopHandTracking() {
  state.handActive = false;
  if (state.handLandmarker) { state.handLandmarker.close(); state.handLandmarker = null; }
  state.handStream?.getTracks().forEach(track => track.stop()); state.handStream = null;
  video.pause(); video.srcObject = null; video.classList.remove('active'); handButton.classList.remove('active');
  state.handGesture = ''; state.pointer.active = false;
}
handButton.addEventListener('click', () => {
  if (state.handLoading) return;
  if (state.handActive) {
    stopHandTracking(); handButton.querySelector('.hand-label').textContent = 'ENABLE HAND GESTURES';
    handButton.querySelector('i').textContent = 'CAMERA IS LOCAL';
    setNote('Hand tracking stopped. Mouse and touch gestures remain available.', 'HEAT · CHEMISTRY · GROUND MOVEMENT');
  } else startHandTracking();
});

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
