const canvas = document.querySelector('#sense-canvas');
const ctx = canvas.getContext('2d');
const motionToggle = document.querySelector('#motion-toggle');
const motionLabel = document.querySelector('.motion-label');
const tooltip = document.querySelector('#sense-tooltip');
const tongueButton = document.querySelector('#tongue-trigger');
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  width: 0, height: 0, dpr: 1, pointer: { x: 0, y: 0, active: false },
  time: 0, lastTime: 0, motion: !reducedQuery.matches, flickAt: -1000,
  pulses: [], activeLayers: new Set(['thermal', 'infrared', 'chemical', 'vibration']),
  hotSpots: [], hoveredSpot: -1,
};

const senses = {
  thermal: 'Pit organs detect infrared radiation from nearby warm objects. This glow is an artistic interpretation, not a literal thermal image.',
  infrared: 'The paired pit organs help a rattlesnake locate warm prey in darkness by sensing infrared radiation.',
  chemical: 'A forked tongue gathers chemical particles from the air; the Jacobson’s organ helps compare each side.',
  vibration: 'Vibrations travel through the ground and are detected through contact with the lower jaw and body.',
};

const anatomyCopy = {
  pit: 'Pit organ · Heat-sensitive receptors help locate warm animals in darkness.',
  tongue: 'Forked tongue · Samples airborne chemicals on both sides to follow a scent trail.',
  jaw: 'Jaw & ground · Ground-borne vibration reaches the skull through contact with the ground.',
  body: 'Whole-body vibration · The body senses substrate movement as it rests or moves.',
};

function resize() {
  const rect = canvas.getBoundingClientRect();
  state.width = rect.width;
  state.height = rect.height;
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * state.dpr);
  canvas.height = Math.round(rect.height * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  state.hotSpots = [
    { x: rect.width * .67, y: rect.height * .36, r: 21, hue: 28, name: 'Warm body · 1.8 m', note: 'A warm animal radiates infrared energy. The pit organ helps resolve its position.' },
    { x: rect.width * .78, y: rect.height * .59, r: 15, hue: 8, name: 'Heat trace · 3.2 m', note: 'A fading thermal cue. Distance softens the signal.' },
    { x: rect.width * .53, y: rect.height * .69, r: 12, hue: 44, name: 'Ground warmth · 4.6 m', note: 'Residual warmth leaves a quieter signal in the surrounding field.' },
  ];
}

function pointOnSnake(t, now) {
  const w = state.width;
  const h = state.height;
  const x = w * .48 + Math.sin(t * Math.PI * 2 + now * .00022) * w * .15 + (t - .5) * w * .22;
  const y = h * .48 + Math.sin(t * Math.PI * 4 + now * .00032) * h * .19 + Math.cos(t * Math.PI * 3 + now * .00018) * h * .035;
  return { x, y };
}

function drawBackground(now) {
  const { width: w, height: h } = state;
  const wash = ctx.createRadialGradient(w * .68, h * .45, 10, w * .68, h * .45, Math.max(w, h) * .68);
  wash.addColorStop(0, 'rgba(52, 23, 73, .26)');
  wash.addColorStop(.55, 'rgba(19, 25, 43, .12)');
  wash.addColorStop(1, 'rgba(8, 7, 14, 0)');
  ctx.fillStyle = '#08070e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = .17;
  ctx.strokeStyle = 'rgba(188, 146, 206, .16)';
  ctx.lineWidth = 1;
  const grid = 58;
  for (let x = (w % grid); x < w; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = (h % grid); y < h; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.restore();

  // Fine field motes add depth while remaining deterministic and inexpensive.
  for (let i = 0; i < 54; i++) {
    const x = ((i * 173.7 + Math.sin(now * .00016 + i) * 9) % w + w) % w;
    const y = ((i * 97.3 + Math.cos(now * .00012 + i * 2) * 8) % h + h) % h;
    ctx.fillStyle = i % 4 === 0 ? 'rgba(128, 216, 214, .42)' : 'rgba(229, 200, 242, .26)';
    ctx.fillRect(x, y, i % 6 === 0 ? 2 : 1, 1);
  }
}

function drawSnake(now) {
  const points = Array.from({ length: 124 }, (_, i) => pointOnSnake(i / 123, now));
  const drawLine = () => {
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = points[i - 1];
        const midX = (prev.x + p.x) / 2;
        const midY = (prev.y + p.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
    });
    const tail = points[points.length - 1];
    ctx.lineTo(tail.x, tail.y);
  };

  const bodyGradient = ctx.createLinearGradient(state.width * .3, state.height * .65, state.width * .78, state.height * .3);
  bodyGradient.addColorStop(0, '#42d8c6');
  bodyGradient.addColorStop(.28, '#8773ff');
  bodyGradient.addColorStop(.57, '#ed63c2');
  bodyGradient.addColorStop(.82, '#fa8c67');
  bodyGradient.addColorStop(1, '#f6c76b');

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'screen';
  drawLine(); ctx.strokeStyle = bodyGradient; ctx.lineWidth = Math.max(26, state.width * .024); ctx.globalAlpha = .18;
  ctx.shadowColor = '#d760ed'; ctx.shadowBlur = 45; ctx.stroke();
  drawLine(); ctx.strokeStyle = bodyGradient; ctx.lineWidth = Math.max(15, state.width * .013); ctx.globalAlpha = .63;
  ctx.shadowBlur = 19; ctx.stroke();
  drawLine(); ctx.strokeStyle = 'rgba(255, 227, 248, .8)'; ctx.lineWidth = 1.2; ctx.globalAlpha = .82; ctx.shadowBlur = 8; ctx.stroke();

  // Small sensory nodes travel along the living contour.
  for (let i = 8; i < 118; i += 9) {
    const p = points[i];
    const pulse = .5 + .5 * Math.sin(now * .002 + i);
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.1 + pulse * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#79f2dd' : '#ffb484'; ctx.globalAlpha = .34 + pulse * .45; ctx.fill();
  }
  ctx.restore();
  return points;
}

function drawThermal(now) {
  if (!state.activeLayers.has('thermal')) return;
  state.hotSpots.forEach((spot, i) => {
    const breathe = state.motion ? Math.sin(now * .0012 + i * 1.9) * 3 : 0;
    const radius = spot.r + breathe;
    const glow = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, radius * 5.8);
    glow.addColorStop(0, `hsla(${spot.hue}, 100%, 68%, .78)`);
    glow.addColorStop(.18, `hsla(${spot.hue}, 100%, 58%, .3)`);
    glow.addColorStop(1, `hsla(${spot.hue}, 100%, 52%, 0)`);
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(spot.x, spot.y, radius * 5.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(spot.x, spot.y, radius * .45, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${spot.hue}, 100%, 76%, .9)`; ctx.shadowColor = `hsl(${spot.hue}, 100%, 60%)`; ctx.shadowBlur = 22; ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(spot.x, spot.y, radius * 1.15, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${spot.hue}, 100%, 72%, .45)`; ctx.lineWidth = 1; ctx.stroke();
  });
  if (state.pointer.active) {
    const dx = state.pointer.x - state.pointer.prevX;
    const dy = state.pointer.y - state.pointer.prevY;
    const distance = Math.hypot(dx, dy);
    if (distance > 1) {
      const trail = ctx.createRadialGradient(state.pointer.x, state.pointer.y, 0, state.pointer.x, state.pointer.y, 44);
      trail.addColorStop(0, 'rgba(255, 143, 94, .16)'); trail.addColorStop(1, 'rgba(255, 143, 94, 0)');
      ctx.fillStyle = trail; ctx.fillRect(state.pointer.x - 44, state.pointer.y - 44, 88, 88);
    }
    state.pointer.prevX = state.pointer.x; state.pointer.prevY = state.pointer.y;
  }
}

function drawInfrared(now) {
  if (!state.activeLayers.has('infrared')) return;
  state.hotSpots.forEach((spot, i) => {
    for (let ring = 0; ring < 3; ring++) {
      const phase = state.motion ? (now * .018 + i * 32 + ring * 40) % 120 : 35 + ring * 35;
      ctx.beginPath(); ctx.ellipse(spot.x, spot.y, 25 + phase * .7, 12 + phase * .38, -.2, 0, Math.PI * 2);
      ctx.strokeStyle = ring % 2 ? 'rgba(100, 239, 226, .19)' : 'rgba(183, 112, 255, .2)';
      ctx.lineWidth = 1; ctx.setLineDash([2, 7]); ctx.stroke();
    }
  });
}

function drawChemical(now) {
  if (!state.activeLayers.has('chemical')) return;
  const age = (now - state.flickAt) / 1000;
  if (age < 2.4) {
    const startX = state.width * .56;
    const startY = state.height * .53;
    const progress = Math.max(0, age / 1.35);
    for (let side = -1; side <= 1; side += 2) {
      const spread = 185 * Math.min(1, progress);
      ctx.beginPath(); ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(startX + 32, startY - 26, startX + side * spread * .44, startY + 10, startX + side * spread, startY + side * 19);
      ctx.strokeStyle = side < 0 ? 'rgba(104, 237, 212, .65)' : 'rgba(189, 122, 255, .64)'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 6]); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 22; i++) {
        const t = ((i / 22) + progress * 1.15) % 1;
        const x = startX + side * spread * t;
        const y = startY - 26 * t + side * 19 * t + Math.sin(t * 15 + i) * 8;
        const size = 1 + ((i * 7) % 3);
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fillStyle = side < 0 ? 'rgba(111, 255, 223, .8)' : 'rgba(204, 151, 255, .8)'; ctx.fill();
      }
    }
  }
}

function drawVibration(now) {
  if (!state.activeLayers.has('vibration')) return;
  state.pulses = state.pulses.filter(pulse => now - pulse.at < 1800);
  state.pulses.forEach(pulse => {
    const age = state.motion ? now - pulse.at : 500;
    const radius = age * .22;
    const alpha = Math.max(0, 1 - age / 1800);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.ellipse(pulse.x, pulse.y, radius + i * 24, (radius + i * 24) * .35, -.05, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(101, 214, 240, ${alpha * .37})`; ctx.lineWidth = 1; ctx.stroke();
    }
  });
}

function draw(now) {
  const delta = Math.min(40, now - (state.lastTime || now));
  state.lastTime = now;
  if (state.motion) state.time += delta;
  const t = state.motion ? state.time : 900;
  drawBackground(t);
  drawSnake(t);
  drawThermal(t);
  drawInfrared(t);
  drawChemical(t);
  drawVibration(t);
  if (state.motion) requestAnimationFrame(draw);
}

function startAnimation() {
  state.lastTime = 0;
  requestAnimationFrame(draw);
}

function refreshCanvas() {
  if (!state.motion) draw(performance.now());
}

function setMotion(enabled) {
  state.motion = enabled;
  motionToggle.setAttribute('aria-pressed', String(!enabled));
  motionLabel.textContent = enabled ? 'MOTION ON' : 'MOTION OFF';
  motionToggle.title = enabled ? 'Turn motion off' : 'Turn motion on';
  if (enabled) startAnimation(); else draw(performance.now());
}

function positionTooltip(spot) {
  if (!spot) { tooltip.hidden = true; return; }
  tooltip.innerHTML = `<strong>${spot.name}</strong><br>${spot.note}`;
  tooltip.hidden = false;
  const x = Math.min(Math.max(14, spot.x + 24), state.width - 236);
  const y = Math.min(Math.max(90, spot.y - 28), state.height - 95);
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function nearestSpot(x, y) {
  return state.hotSpots.findIndex(spot => Math.hypot(spot.x - x, spot.y - y) < spot.r * 2.1);
}

canvas.addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect();
  state.pointer.x = event.clientX - rect.left;
  state.pointer.y = event.clientY - rect.top;
  state.pointer.active = true;
  const index = nearestSpot(state.pointer.x, state.pointer.y);
  state.hoveredSpot = index;
  positionTooltip(index >= 0 ? state.hotSpots[index] : null);
  canvas.style.cursor = index >= 0 ? 'pointer' : 'crosshair';
  refreshCanvas();
});
canvas.addEventListener('pointerleave', () => { state.pointer.active = false; state.hoveredSpot = -1; positionTooltip(null); refreshCanvas(); });
canvas.addEventListener('pointerdown', event => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const index = nearestSpot(x, y);
  if (index >= 0) positionTooltip(state.hotSpots[index]);
  state.pulses.push({ x, y, at: performance.now() });
  refreshCanvas();
});

document.querySelectorAll('.sense-chip').forEach(button => {
  button.addEventListener('click', () => {
    const layer = button.dataset.sense;
    const willEnable = !state.activeLayers.has(layer);
    if (willEnable) state.activeLayers.add(layer); else state.activeLayers.delete(layer);
    button.classList.toggle('is-active', willEnable);
    button.setAttribute('aria-pressed', String(willEnable));
    button.querySelector('.chip-status').textContent = willEnable ? 'LIVE' : 'OFF';
    tooltip.textContent = senses[layer];
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(state.width - 240, 24)}px`;
    tooltip.style.top = `${Math.max(92, state.height - 190)}px`;
    window.setTimeout(() => { tooltip.hidden = true; }, 4200);
    refreshCanvas();
  });
});

tongueButton.addEventListener('click', () => {
  state.flickAt = performance.now();
  state.pulses.push({ x: state.width * .56, y: state.height * .53, at: performance.now() });
  if (!state.activeLayers.has('chemical')) {
    state.activeLayers.add('chemical');
    document.querySelector('[data-sense="chemical"]').classList.add('is-active');
  }
  refreshCanvas();
});

motionToggle.addEventListener('click', () => setMotion(!state.motion));
reducedQuery.addEventListener?.('change', event => { if (event.matches) setMotion(false); });

const anatomyTooltip = document.querySelector('#anatomy-tooltip');
document.querySelectorAll('.anatomy-point').forEach(point => {
  const show = () => { anatomyTooltip.textContent = anatomyCopy[point.dataset.part]; };
  point.addEventListener('pointerenter', show);
  point.addEventListener('focus', show);
  point.addEventListener('click', show);
  point.setAttribute('tabindex', '0');
  point.setAttribute('role', 'button');
  point.setAttribute('aria-label', anatomyCopy[point.dataset.part]);
});

const sections = [...document.querySelectorAll('main > section')];
const navLinks = [...document.querySelectorAll('.nav-link')];
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navLinks.forEach(link => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
  });
}, { threshold: .52 });
sections.forEach(section => observer.observe(section));

window.addEventListener('resize', resize, { passive: true });
resize();
document.querySelectorAll('.sense-chip').forEach(button => button.setAttribute('aria-pressed', 'true'));
setMotion(state.motion);
