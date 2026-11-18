const canvas = document.querySelector('#sense-field');
const ctx = canvas.getContext('2d', { alpha: false });
const video = document.querySelector('#camera-video');
const cameraStop = document.querySelector('#camera-stop');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const ui = {
  title: document.querySelector('#state-title'), index: document.querySelector('#state-index'), copy: document.querySelector('#state-copy'),
  note: document.querySelector('#note-copy'), cue: document.querySelector('#interaction-cue'), stage: document.querySelector('#stage-label'),
  status: document.querySelector('#status'), camera: document.querySelector('#camera-toggle'), cameraLabel: document.querySelector('#camera-label'),
};
const state = { w: 0, h: 0, dpr: 1, mode: 'infrared', intro: 'head', introAt: performance.now(), time: 0, last: 0, raf: 0, pointer: { x: .72, y: .54, px: .72, py: .54, active: false }, particles: [], pulses: [], intensity: 1, targetVersion: 0, lastScentMorph: 0, lastMovePulse: 0, stream: null, tracker: null, tracking: false, loading: false, trackRaf: 0, lastVideo: -1, lastTrack: 0, candidate: '', candidateAt: 0, gesture: '' };
const COLORS = ['rgba(242,244,247,', 'rgba(255,48,70,', 'rgba(71,125,255,'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const random = (lo, hi) => lo + Math.random() * (hi - lo);
function addLine(a, b, count, color = 0, spread = .0015, points = []) {
  for (let i = 0; i < count; i++) { const t = Math.random(), n = random(-spread, spread); points.push({ x: a.x + (b.x - a.x) * t + n, y: a.y + (b.y - a.y) * t - n, c: color }); }
}
function addCurve(fn, count, color = 0, spread = .0014, points = []) {
  for (let i = 0; i < count; i++) { const t = Math.random(), p = fn(t), n = random(-spread, spread); points.push({ x: p.x + n, y: p.y - n, c: color }); }
}
function addEllipse(cx, cy, rx, ry, count, color = 0, fill = false, points = [], start = 0, end = Math.PI * 2) {
  for (let i = 0; i < count; i++) {
    const a = random(start, end), r = fill ? Math.sqrt(Math.random()) : 1 + random(-.018, .018);
    points.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r, c: color });
  }
}
function addSnakeHead(points, density = 1, tongue = false) {
  const outline = [{ x: .22, y: .51 }, { x: .28, y: .36 }, { x: .43, y: .27 }, { x: .61, y: .3 }, { x: .73, y: .41 }, { x: .82, y: .53 }, { x: .72, y: .64 }, { x: .59, y: .75 }, { x: .42, y: .72 }, { x: .28, y: .63 }, { x: .22, y: .51 }];
  for (let i = 0; i < outline.length - 1; i++) addLine(outline[i], outline[i + 1], Math.round(115 * density), 0, .0015, points);
  // Scale rows follow the head's tapered silhouette.
  for (let row = 0; row < 8; row++) {
    const y = .34 + row * .047, taper = Math.abs(y - .51) / .18, x0 = .31 + taper * .075, x1 = .73 - taper * .12;
    for (let x = x0; x < x1; x += .035) {
      const rx = .016 + random(-.002, .002), ry = .019;
      addEllipse(x + (row % 2) * .016, y, rx, ry, Math.round(9 * density), 0, false, points);
    }
  }
  // Eye orbit and vertical pupil; the dark gap is preserved by leaving its center empty.
  addEllipse(.59, .405, .09, .064, Math.round(160 * density), 0, false, points);
  addEllipse(.59, .405, .066, .046, Math.round(90 * density), 2, false, points);
  addEllipse(.594, .405, .014, .043, Math.round(95 * density), 1, true, points);
  addEllipse(.755, .54, .034, .026, Math.round(94 * density), 2, false, points);
  addEllipse(.755, .54, .022, .016, Math.round(52 * density), 1, false, points);
  addEllipse(.83, .55, .008, .006, 16, 0, true, points);
  if (tongue) {
    const base = { x: .84, y: .59 }, fork = { x: .89, y: .59 };
    addCurve(t => ({ x: base.x + (fork.x - base.x) * t, y: base.y + .004 * Math.sin(t * Math.PI) }), 190, 1, .001, points);
    addCurve(t => ({ x: fork.x + .09 * t, y: fork.y - .075 * t }), 130, 2, .001, points);
    addCurve(t => ({ x: fork.x + .085 * t, y: fork.y + .075 * t }), 130, 2, .001, points);
  }
}
function createTargets(mode) {
  const points = [];
  if (mode === 'head') { addSnakeHead(points, 1.5, false); }
  else if (mode === 'scales') {
    for (let row = 0; row < 13; row++) {
      const y = .18 + row * .052;
      for (let col = -1; col < 24; col++) {
        const x = .04 + col * .044 + (row % 2) * .022;
        if (x < .015 || x > .99) continue;
        addEllipse(x, y, .024, .034, 22, row % 5 === 0 ? 2 : 0, false, points);
        if (Math.random() < .7) addEllipse(x, y + .001, .013, .018, 5, 0, true, points);
      }
    }
    addCurve(t => ({ x: .04 + t * .92, y: .11 + Math.sin(t * 8) * .035 }), 160, 0, .002, points);
    addCurve(t => ({ x: .04 + t * .92, y: .89 + Math.sin(t * 8 + 2) * .035 }), 160, 0, .002, points);
  } else if (mode === 'eye') { addSnakeHead(points, 1.9, true); }
  else if (mode === 'infrared') {
    // Cold environment: sparse white depth planes, with a warm animal built only from red/white points.
    for (let row = 0; row < 18; row++) {
      const y = .54 + row * .025;
      addCurve(t => ({ x: t, y: y + Math.sin(t * 9 + row * .4) * (.004 + row * .00025) }), 110, row % 7 === 0 ? 2 : 0, .0012, points);
    }
    for (let i = 0; i < 470; i++) points.push({ x: random(.04, .98), y: random(.12, .86), c: Math.random() < .18 ? 2 : 0 });
    // Mouse-responsive prey silhouette, a small warm-bodied mammal in profile.
    const x = .74, y = .52;
    addEllipse(x, y, .065, .028, 250, 1, true, points);
    addEllipse(x + .057, y - .02, .025, .022, 120, 1, true, points);
    addEllipse(x + .045, y - .041, .012, .017, 55, 1, true, points, Math.PI, Math.PI * 2);
    addEllipse(x + .068, y - .004, .004, .004, 14, 0, true, points);
    addCurve(t => ({ x: x - .055 - .08 * t, y: y + .004 + Math.sin(t * 5) * .012 }), 95, 1, .0014, points);
    addLine({ x: x - .025, y: y + .02 }, { x: x - .034, y: y + .067 }, 48, 1, .003, points);
    addLine({ x: x + .035, y: y + .02 }, { x: x + .046, y: y + .065 }, 48, 1, .003, points);
    // Thermal radiation contours around the prey.
    for (let ring = 0; ring < 4; ring++) addEllipse(x, y, .09 + ring * .035, .05 + ring * .021, 125, 1, false, points);
  } else if (mode === 'chemical') {
    addSnakeHead(points, 1.1, false);
    const cursor = state.pointer;
    for (let side of [-1, 1]) {
      const end = { x: clamp(cursor.x, .43, .97), y: clamp(cursor.y + side * .035, .12, .88) };
      const start = { x: .84, y: .59 };
      addCurve(t => ({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t + side * Math.sin(t * Math.PI) * .08 + Math.sin(t * 11) * .006 }), 580, 2, .003, points);
      addCurve(t => ({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t + side * Math.sin(t * Math.PI) * .08 + Math.sin(t * 11) * .006 }), 130, 0, .009, points);
    }
    for (let i = 0; i < 220; i++) points.push({ x: random(.08, .95), y: random(.16, .86), c: 2 });
  } else if (mode === 'vibration') {
    for (let row = 0; row < 24; row++) {
      const y = .67 + row * .012;
      addCurve(t => ({ x: t, y: y + Math.sin(t * 8 + row * .2) * .004 }), 115, row % 6 === 0 ? 2 : 0, .001, points);
    }
    // Low body silhouette grounded into the same granular surface.
    addCurve(t => ({ x: .18 + .47 * t, y: .6 + .07 * Math.sin(t * Math.PI * 1.6) }), 560, 0, .004, points);
    addEllipse(.22, .59, .06, .045, 190, 0, false, points);
    addEllipse(.22, .59, .009, .027, 28, 1, true, points);
    for (let r = 0; r < 5; r++) addEllipse(state.pointer.x, .68 + r * .035, .04 + r * .044, .012 + r * .006, 180, r % 2 ? 2 : 1, false, points, Math.PI, Math.PI * 2);
  } else if (mode === 'spatial') {
    // Depth planes and recognizable distant forms made from sparse particles.
    for (let row = 0; row < 14; row++) {
      const y = .28 + row * .045;
      addCurve(t => ({ x: t, y: y + Math.sin(t * 7 + row) * .025 }), 92 + row * 4, row % 4 === 0 ? 2 : 0, .0014 + row * .00008, points);
    }
    addSnakeHead(points, .8, false);
    // Distant rock / brush silhouettes at different depths.
    for (const [x, y, s, n] of [[.12,.47,.06,180],[.87,.4,.045,120],[.91,.67,.09,260],[.5,.18,.035,75]]) {
      for (let i = 0; i < n; i++) { const a = random(0, Math.PI * 2), r = Math.sqrt(Math.random()); points.push({ x: x + Math.cos(a) * s * r, y: y + Math.sin(a) * s * r * .6, c: Math.random() < .1 ? 1 : 0 }); }
    }
  }
  if (!points.length) addSnakeHead(points, 1, false);
  return points;
}
function setMode(mode) {
  state.mode = mode; state.intro = '';
  document.querySelectorAll('.sense-button').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  const content = {
    infrared: ['01 / INFRARED', 'Warmth<br>in the dark.', 'Move close to reveal a living heat signature.', 'Pit organs detect infrared radiation from warm animals. The red and white view is an artistic interpretation of thermal contrast.', 'MOVE POINTER TO FOLLOW THE WARM SIGNAL', 'HEAT SIGNAL / PREY DETECTED'],
    chemical: ['02 / CHEMICAL', 'Two samples.<br>One trail.', 'Move to bend the forked chemical paths.', 'A forked tongue gathers chemical samples from both sides. The paired streams converge at the vomeronasal organ.', 'MOVE POINTER TO BEND THE SCENT TRAILS', 'FORKED TONGUE / CHEMICAL SAMPLE'],
    vibration: ['03 / VIBRATION', 'Movement<br>through ground.', 'Move or tap to send a ground-borne pulse.', 'Ground vibrations travel through the body and lower jaw apparatus. The waves here are a visual model of mechanical signals.', 'MOVE OR TAP TO SEND A VIBRATION', 'GROUND-BORNE / MECHANICAL SIGNAL'],
    spatial: ['04 / SPATIAL', 'A world made<br>of many cues.', 'Move through the shared sensory field.', 'Thermal, chemical and mechanical cues contribute to awareness of nearby objects, direction and movement.', 'MOVE TO EXPLORE DEPTH AND DISTANCE', 'MULTISENSORY / ENVIRONMENTAL CUES'],
  }[mode];
  ui.index.textContent = content[0]; ui.title.innerHTML = content[1]; ui.copy.textContent = content[2]; ui.note.textContent = content[3]; ui.cue.textContent = content[4]; ui.stage.textContent = content[5];
  morph();
}
function morph() {
  const key = state.intro || state.mode;
  const targets = createTargets(key);
  for (let i = 0; i < state.particles.length; i++) {
    const target = targets[(i * 37) % targets.length];
    state.particles[i].tx = target.x; state.particles[i].ty = target.y; state.particles[i].color = target.c;
  }
  state.targetVersion++;
}
function resize() {
  state.w = innerWidth; state.h = innerHeight; state.dpr = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1 : 1.35);
  canvas.width = Math.round(state.w * state.dpr); canvas.height = Math.round(state.h * state.dpr); ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  const count = Math.min(innerWidth < 700 ? 2400 : 4200, Math.max(innerWidth < 700 ? 1500 : 2300, Math.floor(state.w * state.h / (innerWidth < 700 ? 390 : 310))));
  state.particles = Array.from({ length: count }, (_, i) => ({ x: Math.random(), y: Math.random(), vx: 0, vy: 0, tx: .5, ty: .5, phase: random(0, 6.28), size: Math.random() < .91 ? random(.68, 1.35) : random(1.4, 1.9), color: 0, depth: Math.random(), seed: i }));
  morph();
  // Start in the first biological form so the canvas is visibly alive on its very first frame.
  for (const p of state.particles) { p.x = p.tx + random(-.009, .009); p.y = p.ty + random(-.009, .009); }
}
function addPulse(x, y, power = 1) { state.pulses.push({ x, y, at: performance.now(), power }); if (state.pulses.length > 5) state.pulses.shift(); }
function render(now) {
  const dt = Math.min(.05, Math.max(.008, (now - (state.last || now)) / 1000)); state.last = now; state.time += dt;
  if (state.intro && !reduced.matches) {
    const age = now - state.introAt;
    if (state.intro === 'head' && age > 1800) { state.intro = 'scales'; morph(); }
    else if (state.intro === 'scales' && age > 4100) { state.intro = 'eye'; morph(); }
    else if (state.intro === 'eye' && age > 6900) { state.intro = ''; setMode(state.mode); }
  }
  ctx.fillStyle = 'rgba(4,5,7,.27)'; ctx.fillRect(0, 0, state.w, state.h);
  const px = state.pointer.x * state.w, py = state.pointer.y * state.h;
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.particles) {
    const tx = p.tx * state.w, ty = p.ty * state.h;
    const dx = p.x - state.pointer.x, dy = p.y - state.pointer.y, d2 = dx * dx + dy * dy;
    const near = state.pointer.active ? Math.max(0, 1 - Math.sqrt(d2) / .24) : 0;
    let ax = (p.tx - p.x) * 20 + Math.sin(state.time * .7 + p.phase) * .0014;
    let ay = (p.ty - p.y) * 20 + Math.cos(state.time * .61 + p.phase) * .0014;
    if (near > 0 && d2 > .000001) { const force = (state.mode === 'infrared' ? -.42 : .16) * near; ax += dx / Math.sqrt(d2) * force; ay += dy / Math.sqrt(d2) * force; }
    if (state.mode === 'vibration') {
      for (const pulse of state.pulses) {
        const age = (now - pulse.at) / 1000, ddx = (p.x - pulse.x) * state.w, ddy = (p.y - pulse.y) * state.h;
        const dist = Math.hypot(ddx, ddy), radius = age * (230 + pulse.power * 140), band = dist - radius;
        const wave = Math.exp(-band * band / 260) * Math.max(0, 1 - age / 3.5) * pulse.power;
        ax += ddx / (dist + 1) * wave * .015; ay += ddy / (dist + 1) * wave * .015;
      }
    }
    p.vx = (p.vx + ax * dt) * .88; p.vy = (p.vy + ay * dt) * .88;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const hotDistance = Math.hypot(p.tx - state.pointer.x, p.ty - state.pointer.y);
    let alpha = .58 + p.depth * .3 + near * .5;
    let size = p.size * (1 + near * .9);
    if (state.mode === 'infrared' && p.color === 1) { const proximity = Math.max(0, 1 - hotDistance / (.16 + near * .18)); alpha += proximity * (.35 + near * .75); size *= 1 + proximity * (.5 + near); }
    if (state.mode === 'chemical' && p.color === 2) alpha += .15;
    if (state.mode === 'vibration') { const age = state.pulses.length ? (now - state.pulses[state.pulses.length - 1].at) / 1000 : 4; alpha += Math.max(0, 1 - age / 3.5) * .28; }
    const color = COLORS[p.color] || COLORS[0];
    ctx.fillStyle = `${color}${clamp(alpha, .12, .94)})`;
    const x = p.x * state.w, y = p.y * state.h;
    ctx.fillRect(x, y, size, size);
    if (size > 1.5 && alpha > .56) { ctx.fillStyle = `${color}${clamp(alpha * .17, .05, .2)})`; ctx.fillRect(x - 2, y - 2, size + 4, size + 4); }
  }
  ctx.globalCompositeOperation = 'source-over';
  state.pulses = state.pulses.filter(p => now - p.at < 3700);
  if (state.pointer.active) { state.pointer.px = state.pointer.x; state.pointer.py = state.pointer.y; }
  state.raf = requestAnimationFrame(render);
}
function pointerPoint(e) { return { x: clamp(e.clientX / state.w, 0, 1), y: clamp(e.clientY / state.h, 0, 1) }; }
canvas.addEventListener('pointermove', e => {
  const p = pointerPoint(e); state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.active = true;
  const now = performance.now();
  if (state.mode === 'chemical' && now - state.lastScentMorph > 220) { state.lastScentMorph = now; morph(); }
  if (state.mode === 'vibration' && now - state.lastMovePulse > 260) { state.lastMovePulse = now; addPulse(p.x, p.y, state.intensity); }
});
canvas.addEventListener('pointerleave', () => { state.pointer.active = false; });
canvas.addEventListener('pointerdown', e => { const p = pointerPoint(e); state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.active = true; if (state.mode === 'vibration') addPulse(p.x, p.y, state.intensity); });
canvas.addEventListener('pointerup', e => { if (state.mode === 'chemical') { const p = pointerPoint(e); state.pointer.x = p.x; state.pointer.y = p.y; } });
document.querySelectorAll('.sense-button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelector('#note-toggle').addEventListener('click', e => { const button = e.currentTarget, panel = document.querySelector('#field-note'), open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(open)); panel.hidden = !open; document.querySelector('#note-icon').textContent = open ? '−' : '+'; });
document.addEventListener('keydown', e => { const modes = ['infrared', 'chemical', 'vibration', 'spatial']; if (e.key >= '1' && e.key <= '4') setMode(modes[Number(e.key) - 1]); });

function showStatus(message) { ui.status.hidden = !message; ui.status.textContent = message; }
function classify(points) {
  const up = (tip, joint) => points[tip].y < points[joint].y - .015;
  const index = up(8, 6), middle = up(12, 10), ring = up(16, 14), pinky = up(20, 18);
  const pinch = Math.hypot(points[4].x - points[8].x, points[4].y - points[8].y) < .065;
  const count = [index, middle, ring, pinky].filter(Boolean).length;
  if (pinch) return 'infrared'; if (index && middle && !ring && !pinky) return 'chemical'; if (count === 0) return 'vibration'; if (count >= 4) return 'spatial'; return state.mode;
}
function handFrame(now) {
  if (!state.tracking || !state.tracker) return;
  if (video.readyState >= 2 && video.currentTime !== state.lastVideo && now - state.lastTrack > 130) {
    state.lastVideo = video.currentTime; state.lastTrack = now;
    try {
      const result = state.tracker.detectForVideo(video, now), points = result.landmarks?.[0];
      if (points) {
        const mode = classify(points), palm = points[9];
        if (mode !== state.candidate) { state.candidate = mode; state.candidateAt = now; }
        state.pointer.x = clamp(.28 + (1 - palm.x) * .68, .02, .98); state.pointer.y = clamp(.1 + palm.y * .8, .02, .98); state.pointer.active = true;
        if (now - state.candidateAt > 180 && mode !== state.gesture) { state.gesture = mode; setMode(mode); }
      }
    } catch (error) { console.warn('Hand tracker frame error', error); }
  }
  state.trackRaf = requestAnimationFrame(handFrame);
}
async function stopCamera(show = true) {
  state.tracking = false; if (state.trackRaf) cancelAnimationFrame(state.trackRaf); state.trackRaf = 0;
  if (state.tracker) { try { state.tracker.close(); } catch {} state.tracker = null; }
  state.stream?.getTracks().forEach(t => t.stop()); state.stream = null; video.srcObject = null; video.hidden = true; video.classList.remove('live'); ui.camera.classList.remove('active');
  ui.cameraLabel.textContent = 'HAND TRACKING'; cameraStop.hidden = true; if (show) showStatus('');
}
async function startCamera() {
  if (state.loading) return; state.loading = true; ui.camera.disabled = true; ui.cameraLabel.textContent = 'CONNECTING…'; showStatus('Allow camera access in your browser.');
  cameraStop.hidden = true;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs a secure HTTPS page opened directly in your browser.');
    if (!state.stream) {
      try { state.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } } }); }
      catch (error) {
        if (!['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error.name)) throw error;
        state.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      video.srcObject = state.stream; await video.play(); video.hidden = false; video.classList.add('live');
    }
    showStatus('Camera connected. Loading hand gestures…');
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm');
    const options = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .55, minTrackingConfidence: .5 };
    try { state.tracker = await vision.HandLandmarker.createFromOptions(files, options); } catch { options.baseOptions.delegate = 'CPU'; state.tracker = await vision.HandLandmarker.createFromOptions(files, options); }
    state.tracking = true; cameraStop.hidden = true; ui.camera.classList.add('active'); ui.cameraLabel.textContent = 'CAMERA ON'; showStatus('Open palm: spatial · pinch: infrared · two fingers: chemical · fist: vibration.'); state.trackRaf = requestAnimationFrame(handFrame);
  } catch (error) {
    const cameraOn = !!state.stream;
    if (!cameraOn) {
      await stopCamera(false); ui.cameraLabel.textContent = 'RETRY CAMERA';
      const advice = { NotAllowedError: 'Allow camera permission in browser site settings.', NotFoundError: 'No camera was found.', NotReadableError: 'Camera is busy in another app.', SecurityError: 'Open the HTTPS page directly, then allow camera access.' };
      showStatus(`${advice[error.name] || error.message || 'Camera could not start.'}${error.name ? ` (${error.name})` : ''}`);
    } else { cameraStop.hidden = false; ui.camera.classList.add('active'); ui.cameraLabel.textContent = 'RETRY TRACKER'; showStatus(`Camera is on, but hand tracking could not load. ${error.message || ''}`); }
  } finally { state.loading = false; ui.camera.disabled = false; }
}
ui.camera.addEventListener('click', () => { if (state.loading) return; if (state.tracking) stopCamera(); else startCamera(); });
cameraStop.addEventListener('click', () => stopCamera());
resize(); if (reduced.matches) { state.intro = ''; setMode('infrared'); } state.raf = requestAnimationFrame(render);
