const canvas = document.querySelector('#field');
const ctx = canvas.getContext('2d', { alpha: false });
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const sceneNames = ['intro', 'thermal', 'chemical', 'vibration', 'spatial'];
const copy = {
  intro: 'AN ENVIRONMENT, UNSEEN', thermal: 'INFRARED RADIATION · THERMAL CONTRAST',
  chemical: 'CHEMICAL PARTICLES · SCENT TRAIL', vibration: 'GROUND VIBRATION · MECHANICAL SIGNAL',
  spatial: 'MULTISENSORY INTEGRATION · ENVIRONMENTAL CUES',
};
const state = {
  w: 0, h: 0, dpr: 1, time: 0, last: 0, scene: 'intro', motion: !reduced.matches,
  pointer: { x: .53, y: .5, px: .53, py: .5, active: false, down: false },
  particles: [], pulses: [], flick: 0, intensity: 2, dragging: false,
  heat: { x: .72, y: .48 }, snake: { x: .49, y: .53 },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const palettes = {
  intro: [[75, 223, 207], [77, 141, 241], [169, 105, 245], [242, 169, 106]],
  thermal: [[36, 154, 184], [59, 211, 202], [255, 197, 100], [255, 119, 55]],
  chemical: [[70, 205, 219], [143, 117, 246], [214, 106, 237], [93, 168, 251]],
  vibration: [[63, 179, 216], [103, 221, 224], [152, 196, 238], [206, 142, 239]],
  spatial: [[76, 222, 196], [242, 172, 102], [176, 115, 236], [84, 169, 244]],
};

function makeParticles() {
  const count = Math.min(7200, Math.max(2100, Math.floor(state.w * state.h / 185)));
  state.particles = Array.from({ length: count }, (_, i) => {
    const x = Math.random(), y = Math.random();
    return { x, y, ox: x, oy: y, vx: rand(-.0002, .0002), vy: rand(-.0002, .0002),
      phase: rand(0, Math.PI * 2), depth: Math.random(), size: Math.random() < .91 ? rand(.35, 1.05) : rand(1.1, 1.7),
      hue: Math.random(), seed: i };
  });
}
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.35 : 1.65);
  state.w = innerWidth; state.h = innerHeight; state.dpr = dpr;
  canvas.width = Math.round(state.w * dpr); canvas.height = Math.round(state.h * dpr);
  canvas.style.width = `${state.w}px`; canvas.style.height = `${state.h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); makeParticles();
}
function noise(x, y, t) {
  return Math.sin(x * 7.7 + t * .43) * Math.cos(y * 6.2 - t * .31) +
    .55 * Math.sin((x + y) * 12 + t * .23) + .25 * Math.cos(y * 19 - x * 8 + t * .18);
}
function scentPath(x, t) {
  const dx = x - .51;
  return .48 + dx * .28 + Math.sin(dx * 13 + t * .12) * .105 + Math.sin(dx * 26 - t * .07) * .025;
}
function sampleColor(p, thermal, trail, wave) {
  let amount = p.hue;
  if (state.scene === 'thermal' || state.scene === 'spatial') amount = clamp(thermal * .82 + p.hue * .16, 0, .99);
  else if (state.scene === 'chemical') amount = trail > .18 ? .48 + p.hue * .46 : .05 + p.hue * .25;
  else if (state.scene === 'vibration') amount = wave > .12 ? .3 + p.hue * .56 : .12 + p.hue * .3;
  const pal = palettes[state.scene]; const f = amount * (pal.length - 1); const i = Math.min(pal.length - 2, Math.floor(f));
  const k = f - i; return pal[i].map((v, c) => Math.round(v * (1 - k) + pal[i + 1][c] * k));
}
function drawAtmosphere(t) {
  const g = ctx.createRadialGradient(state.w * .69, state.h * .49, 0, state.w * .69, state.h * .49, Math.max(state.w, state.h) * .72);
  const color = state.scene === 'thermal' ? '13,31,35' : state.scene === 'chemical' ? '23,17,39' : state.scene === 'vibration' ? '12,27,36' : '12,25,29';
  g.addColorStop(0, `rgba(${color},.42)`); g.addColorStop(.5, `rgba(${color},.16)`); g.addColorStop(1, 'rgba(5,7,10,0)');
  ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, state.w, state.h); ctx.fillStyle = g; ctx.fillRect(0, 0, state.w, state.h);
  if (state.scene === 'vibration' || state.scene === 'spatial') {
    const ground = state.h * .75;
    const grd = ctx.createLinearGradient(0, ground - 60, 0, state.h);
    grd.addColorStop(0, 'rgba(15,38,45,0)'); grd.addColorStop(1, 'rgba(19,46,52,.32)');
    ctx.fillStyle = grd; ctx.fillRect(0, ground - 60, state.w, state.h - ground + 60);
    ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(state.w, ground);
    ctx.strokeStyle = 'rgba(107,199,213,.14)'; ctx.lineWidth = 1; ctx.stroke();
  }
}
function drawParticles(now) {
  const t = state.time * .001;
  const ptr = state.pointer;
  const pointerX = ptr.x, pointerY = ptr.y;
  const thermalX = state.heat.x, thermalY = state.heat.y;
  const pitX = state.snake.x + .1, pitY = state.snake.y - .035;
  const maxDist = Math.hypot(state.w, state.h);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.particles) {
    let x = p.x, y = p.y;
    const flow = noise(p.ox, p.oy, t + p.phase) * .00011;
    let ax = Math.cos(p.phase + t * .19) * .000018 + flow;
    let ay = Math.sin(p.phase + t * .15) * .000017 - flow * .55;
    let thermal = 0, trail = 0, wave = 0;
    if (state.scene === 'thermal' || state.scene === 'spatial') {
      const dx = x - thermalX, dy = y - thermalY, d = Math.hypot(dx, dy);
      thermal = Math.exp(-d * d / .013) * (state.scene === 'spatial' ? .84 : 1);
      const pullX = x - pitX, pullY = y - pitY, pd = Math.hypot(pullX, pullY) + .001;
      const influence = Math.exp(-pd * 15) * .000007;
      ax -= pullX / pd * influence; ay -= pullY / pd * influence;
      const heatDx = x - thermalX, heatDy = y - thermalY, hd = Math.hypot(heatDx, heatDy) + .001;
      const heatForce = thermal * .000012;
      ax += heatDx / hd * heatForce; ay += heatDy / hd * heatForce;
    }
    if (state.scene === 'chemical' || state.scene === 'spatial') {
      const sy = scentPath(x, t);
      const delta = y - sy;
      trail = Math.exp(-delta * delta / .0015);
      if (state.scene === 'spatial') trail *= .64;
      ay += clamp(-delta, -.2, .2) * trail * .000012;
      ax += Math.sin(y * 22 + t) * trail * .000004;
      const flickAge = (now - state.flick) / 1000;
      if (flickAge >= 0 && flickAge < 1.2) {
        const f = clamp(flickAge / .34, 0, 1), side = x < state.snake.x ? -1 : 1;
        const tongueX = state.snake.x + side * f * .14;
        const tongueY = state.snake.y + (x < state.snake.x ? -.045 : .045) * f;
        const d = Math.hypot(x - tongueX, y - tongueY);
        if (d < .055) { ax += (x - tongueX) * .00011; ay += (y - tongueY) * .0001; trail = Math.max(trail, .8); }
      }
    }
    if (state.scene === 'vibration' || state.scene === 'spatial') {
      for (const pulse of state.pulses) {
        const age = (now - pulse.at) / 1000;
        if (age < 4) {
          const dx = (x - pulse.x) * state.w, dy = (y - pulse.y) * state.h;
          const d = Math.hypot(dx, dy), radius = age * (190 + pulse.power * 150);
          const band = Math.abs(d - radius);
          const amp = Math.exp(-band * band / (380 + pulse.power * 380)) * Math.max(0, 1 - age / 4) * pulse.power;
          wave = Math.max(wave, amp);
          const force = Math.sin((d - radius) * .055) * amp * .000035;
          ax += dx / (d + 1) * force; ay += dy / (d + 1) * force;
        }
      }
    }
    const dxp = x - pointerX, dyp = y - pointerY, pdist = Math.hypot(dxp, dyp);
    const pointerRange = state.scene === 'intro' ? .22 : .13;
    if (ptr.active && pdist < pointerRange) {
      const force = (1 - pdist / pointerRange) * .000032;
      const sign = ptr.down ? -1 : 1;
      ax += dxp / (pdist + .002) * force * sign - (ptr.x - ptr.px) * .0001;
      ay += dyp / (pdist + .002) * force * sign - (ptr.y - ptr.py) * .0001;
    }
    const n = noise(x, y, t * .65 + p.phase);
    ax += Math.cos(n * 2 + p.phase) * .000012; ay += Math.sin(n * 2 + p.phase) * .000012;
    p.vx = (p.vx + ax) * .986; p.vy = (p.vy + ay) * .986;
    p.x += p.vx; p.y += p.vy;
    if (p.x < -.02) p.x = 1.02; if (p.x > 1.02) p.x = -.02;
    if (p.y < -.02) p.y = 1.02; if (p.y > 1.02) p.y = -.02;
    const color = sampleColor(p, thermal, trail, wave);
    const near = ptr.active ? Math.max(0, 1 - pdist / .2) : 0;
    const alpha = (.18 + p.depth * .46 + thermal * .62 + trail * .37 + wave * .7 + near * .3) * (0.7 + .3 * Math.sin(t * 1.4 + p.phase));
    const size = p.size * (1 + thermal * 1.15 + wave * .65 + near * .4);
    ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${clamp(alpha, .08, .95)})`;
    ctx.fillRect(x * state.w, y * state.h, size, size);
  }
  ctx.globalCompositeOperation = 'source-over';
  ptr.px = ptr.x; ptr.py = ptr.y;
  state.pulses = state.pulses.filter(p => now - p.at < 4300);
}
function drawAccents(now) {
  const t = state.time * .001;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  if (state.scene === 'thermal' || state.scene === 'spatial') {
    const hx = state.heat.x * state.w, hy = state.heat.y * state.h;
    const gradient = ctx.createRadialGradient(hx, hy, 1, hx, hy, Math.min(state.w, state.h) * .22);
    gradient.addColorStop(0, 'rgba(255,189,103,.12)'); gradient.addColorStop(.4, 'rgba(255,141,78,.035)'); gradient.addColorStop(1, 'rgba(255,141,78,0)');
    ctx.fillStyle = gradient; ctx.fillRect(hx - 260, hy - 260, 520, 520);
    ctx.beginPath(); ctx.arc(hx, hy, 12 + Math.sin(t * 2) * 1.5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,190,110,.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(state.snake.x * state.w, state.snake.y * state.h, 4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(126,231,210,.9)'; ctx.shadowColor = '#72dfcb'; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(state.snake.x * state.w, state.snake.y * state.h, 17, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(115,221,205,.28)'; ctx.stroke();
  }
  if (state.scene === 'chemical' || state.scene === 'spatial') {
    ctx.beginPath(); const left = state.w * .18, right = state.w * .85;
    for (let i = 0; i <= 80; i++) { const x = left + (right - left) * i / 80, y = scentPath(x / state.w, t) * state.h; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = 'rgba(180,123,240,.2)'; ctx.lineWidth = 1; ctx.setLineDash([2, 10]); ctx.stroke(); ctx.setLineDash([]);
    const fx = state.snake.x * state.w, fy = state.snake.y * state.h, flickAge = (now - state.flick) / 1000;
    if (flickAge >= 0 && flickAge < 1.2) {
      const extent = Math.min(1, flickAge * 2) * 78;
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(126,234,220,.85)';
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx - extent * .4, fy - extent * .44, fx - extent, fy - extent * .2); ctx.stroke();
      ctx.strokeStyle = 'rgba(205,132,245,.85)'; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + extent * .4, fy + extent * .44, fx + extent, fy + extent * .2); ctx.stroke();
    }
  }
  if (state.scene === 'vibration' || state.scene === 'spatial') {
    for (const p of state.pulses) {
      const age = (now - p.at) / 1000, radius = age * (190 + p.power * 150), alpha = Math.max(0, 1 - age / 3.7);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(p.x * state.w, p.y * state.h, radius + i * 22, (radius + i * 22) * .22, -.02, 0, Math.PI * 2); ctx.strokeStyle = `rgba(104,212,231,${alpha * (.33 - i * .07)})`; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }
  ctx.restore();
}
function frame(now) {
  const dt = Math.min(40, now - (state.last || now)); state.last = now;
  if (state.motion) state.time += dt;
  drawAtmosphere(state.time); drawParticles(now); drawAccents(now);
  if (state.motion) requestAnimationFrame(frame);
}
function start() { state.last = 0; requestAnimationFrame(frame); }
function renderStatic() { if (!state.motion) frame(performance.now()); }
function setScene(scene) {
  if (!sceneNames.includes(scene)) return;
  state.scene = scene;
  document.querySelectorAll('.nav-item').forEach(b => { const on = b.dataset.scene === scene; b.classList.toggle('active', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  document.querySelectorAll('.scene-copy').forEach(el => el.classList.toggle('active', el.dataset.copy === scene));
  document.querySelector('#field-label').textContent = copy[scene];
  document.querySelector('#count-current').textContent = String(Math.max(0, sceneNames.indexOf(scene))).padStart(2, '0');
  renderStatic();
}
function coords(event) { const r = canvas.getBoundingClientRect(); return { x: clamp((event.clientX - r.left) / r.width, 0, 1), y: clamp((event.clientY - r.top) / r.height, 0, 1) }; }
document.addEventListener('pointermove', e => {
  const p = coords(e); state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.active = true;
  if (state.dragging) { state.heat.x = p.x; state.heat.y = p.y; }
  canvas.style.cursor = (state.scene === 'thermal' && Math.hypot(p.x - state.heat.x, p.y - state.heat.y) < .06) ? 'grab' : 'crosshair'; renderStatic();
});
document.addEventListener('pointerout', e => { if (!e.relatedTarget) { state.pointer.active = false; state.pointer.down = false; state.dragging = false; renderStatic(); } });
document.addEventListener('pointerdown', e => {
  if (e.target.closest('button,a')) return;
  const p = coords(e); state.pointer.down = true;
  if (state.scene === 'thermal' && Math.hypot(p.x - state.heat.x, p.y - state.heat.y) < .09) state.dragging = true;
  else if (state.scene === 'vibration' || state.scene === 'spatial') state.pulses.push({ x: p.x, y: p.y, at: performance.now(), power: state.intensity / 3 });
  renderStatic();
});
document.addEventListener('pointerup', () => { state.pointer.down = false; state.dragging = false; });
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => setScene(b.dataset.scene)));
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => setScene(b.dataset.go)));
document.querySelector('#next').addEventListener('click', () => {
  const i = sceneNames.indexOf(state.scene), next = sceneNames[(i + 1) % sceneNames.length];
  if (next === 'intro') { state.pulses.push({ x: .52, y: .52, at: performance.now(), power: .7 }); }
  setScene(next);
});
document.querySelector('#flick').addEventListener('click', () => { state.flick = performance.now(); state.pulses.push({ x: state.snake.x, y: state.snake.y, at: state.flick, power: .35 }); renderStatic(); });
document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => { state.intensity = Number(b.dataset.level); document.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('selected', x === b)); }));
const motionButton = document.querySelector('#motion');
function setMotion(on) { state.motion = on; motionButton.setAttribute('aria-pressed', String(!on)); motionButton.lastElementChild.textContent = `MOTION ${on ? 'ON' : 'OFF'}`; if (on) start(); else { frame(performance.now()); } }
motionButton.addEventListener('click', () => setMotion(!state.motion));
reduced.addEventListener?.('change', e => { if (e.matches) setMotion(false); });
document.querySelector('#facts-toggle').addEventListener('click', () => { document.querySelector('#facts').hidden = false; });
document.querySelector('#facts-close').addEventListener('click', () => { document.querySelector('#facts').hidden = true; });
addEventListener('resize', resize, { passive: true });
resize(); setScene('intro'); if (state.motion) start(); else renderStatic();
