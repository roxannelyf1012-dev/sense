const root = document.querySelector('#experience');
const canvas = document.querySelector('#heat-field');
const ctx = canvas.getContext('2d');
const video = document.querySelector('#hand-video');
const cameraButton = document.querySelector('#hand-toggle');
const statusMessage = document.querySelector('#status-message');
const cameraPreview = document.querySelector('#camera-preview-wrap');
const reticle = document.querySelector('#reticle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = { stage: 'scales', start: performance.now(), last: 0, width: 0, height: 0, dpr: 1, raf: 0, field: [], pointer: { x: .76, y: .54 }, stream: null, tracker: null, tracking: false, loading: false, trackRaf: 0, lastVideo: -1, lastTrack: 0, gesture: '', handCandidate: '', handCandidateSince: 0 };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function resize() {
  state.width = innerWidth; state.height = innerHeight;
  state.dpr = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1 : 1.25);
  canvas.width = Math.round(state.width * state.dpr); canvas.height = Math.round(state.height * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  state.field = Array.from({ length: innerWidth < 700 ? 145 : 270 }, (_, index) => ({
    u: (index % 19) / 18, v: Math.floor(index / 19) / 14, phase: Math.random() * Math.PI * 2,
    speed: .3 + Math.random() * .7, radius: Math.random() < .12 ? 1.2 : .55 + Math.random() * .55,
  }));
}
function goStage(stage) {
  if (state.stage === stage) return;
  state.stage = stage;
  document.body.classList.remove('stage-eye', 'stage-thermal');
  if (stage !== 'scales') document.body.classList.add(`stage-${stage}`);
  const view = document.querySelector('#view-name');
  const title = document.querySelector('#story-title');
  const copy = document.querySelector('#story-copy');
  const eyebrow = document.querySelector('#eyebrow');
  const enter = document.querySelector('#enter-vision');
  const pit = document.querySelector('#pit-label');
  if (stage === 'scales') {
    view.textContent = 'SCALE MEMORY'; title.innerHTML = 'A world<br>felt through heat.';
    copy.textContent = 'In darkness, a warm body leaves a signal.'; eyebrow.textContent = 'CROTALUS · FIELD OF VIEW';
    enter.querySelector('span').textContent = 'ENTER THERMAL VIEW'; pit.style.opacity = '0';
    document.querySelector('#sequence-label').textContent = '01 — SCALE / EYE / HEAT';
  } else if (stage === 'eye') {
    view.textContent = 'PIT ORGAN'; title.innerHTML = 'Sensing what<br>eyes cannot see.';
    copy.textContent = 'Heat-sensitive pits register infrared radiation.'; eyebrow.textContent = 'LOREAL PIT · INFRARED RECEPTOR';
    enter.querySelector('span').textContent = 'FOLLOW THE HEAT'; pit.style.opacity = '1';
    document.querySelector('#sequence-label').textContent = '02 — INFRARED RECEPTION';
  } else {
    view.textContent = 'THERMAL VISION'; title.innerHTML = 'Warmth, in<br>the dark.';
    copy.textContent = 'A living body glows against the cooler ground.'; eyebrow.textContent = 'THERMAL CONTRAST · NIGHT';
    enter.querySelector('span').textContent = 'REPLAY TRANSFORMATION'; pit.style.opacity = '1';
    document.querySelector('#sequence-label').textContent = '03 — WARM SIGNAL DETECTED';
    placeTarget(innerWidth * .76, innerHeight * .54);
  }
}
function journey() {
  if (state.stage === 'scales' && performance.now() - state.start > (reducedMotion.matches ? 600 : 2200)) goStage('eye');
  if (state.stage === 'eye' && performance.now() - state.start > (reducedMotion.matches ? 1400 : 5600)) goStage('thermal');
}
function paintHeat(now) {
  const { width: w, height: h, pointer: p } = state;
  ctx.clearRect(0, 0, w, h);
  if (state.stage !== 'thermal') return;
  const sensor = { x: w * .27, y: h * .73 }, source = { x: w * p.x, y: h * p.y };
  const span = Math.hypot(source.x - sensor.x, source.y - sensor.y);
  const glow = ctx.createRadialGradient(source.x, source.y, 0, source.x, source.y, Math.max(100, w * .23));
  glow.addColorStop(0, 'rgba(255,245,239,.2)'); glow.addColorStop(.08, 'rgba(250,60,72,.18)'); glow.addColorStop(.45, 'rgba(177,14,31,.09)'); glow.addColorStop(1, 'rgba(92,5,14,0)');
  ctx.fillStyle = glow; ctx.fillRect(source.x - w * .25, source.y - h * .35, w * .5, h * .7);
  const dx = sensor.x - source.x, dy = sensor.y - source.y;
  for (const mote of state.field) {
    const t = (mote.v + (now * .000035 * mote.speed) + (mote.phase / 25)) % 1;
    const bend = Math.sin(t * 7 + mote.phase) * Math.min(26, span * .04);
    const x = source.x + dx * t + bend;
    const y = source.y + dy * t - Math.sin(t * Math.PI) * Math.min(78, h * .09) + Math.cos(now * .001 + mote.phase) * 3;
    const alpha = (.12 + .55 * Math.sin(t * Math.PI)) * (.55 + .45 * Math.sin(now * .002 + mote.phase));
    const hot = t > .77;
    ctx.fillStyle = hot ? `rgba(255,246,239,${alpha})` : `rgba(245,54,67,${alpha * .82})`;
    ctx.beginPath(); ctx.arc(x, y, mote.radius, 0, Math.PI * 2); ctx.fill();
    if (mote.radius > 1 && hot) {
      ctx.strokeStyle = `rgba(255,238,231,${alpha * .26})`; ctx.lineWidth = .55;
      ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.stroke();
    }
  }
}
function animate(now) {
  journey();
  if (!state.last || now - state.last > 28) { state.last = now; paintHeat(now); }
  state.raf = requestAnimationFrame(animate);
}
function placeTarget(clientX, clientY) {
  const x = clamp(clientX / innerWidth, .57, .91), y = clamp(clientY / innerHeight, .37, .76);
  state.pointer.x = x; state.pointer.y = y;
  root.style.setProperty('--target-x', `${x * 100}%`); root.style.setProperty('--target-y', `${y * 100}%`);
  reticle.style.left = `${clientX}px`; reticle.style.top = `${clientY}px`;
}
root.addEventListener('pointermove', event => {
  if (state.stage === 'thermal' && event.pointerType !== 'touch') placeTarget(event.clientX, event.clientY);
});
root.addEventListener('pointerdown', event => {
  if (state.stage === 'thermal' && event.pointerType === 'touch' && !event.target.closest('button,.info-panel,.camera-preview-wrap')) placeTarget(event.clientX, event.clientY);
});
document.querySelector('#enter-vision').addEventListener('click', () => {
  if (state.stage === 'thermal') { state.start = performance.now(); goStage('scales'); }
  else { state.start = performance.now() - 6000; goStage('thermal'); }
});
document.querySelector('#replay').addEventListener('click', () => { state.start = performance.now(); goStage('scales'); });
document.querySelector('#panel-toggle').addEventListener('click', event => {
  const button = event.currentTarget, panel = document.querySelector('#panel-content');
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(expanded)); panel.hidden = !expanded;
  button.querySelector('.toggle-icon').textContent = expanded ? '−' : '+';
});

function showStatus(message, error = false) {
  statusMessage.hidden = !message;
  statusMessage.textContent = message;
  statusMessage.dataset.state = error ? 'error' : 'ready';
}
function classifyHand(points) {
  const raised = (tip, joint) => points[tip].y < points[joint].y - .015;
  const index = raised(8, 6), middle = raised(12, 10), ring = raised(16, 14), pinky = raised(20, 18);
  const pinch = Math.hypot(points[4].x - points[8].x, points[4].y - points[8].y) < .07;
  const count = [index, middle, ring, pinky].filter(Boolean).length;
  if (pinch) return 'PINCH / FOLLOW HEAT';
  if (index && middle && !ring && !pinky) return 'TWO FINGERS / SAMPLE';
  if (count === 0) return 'FIST / GROUND PULSE';
  if (count >= 4) return 'OPEN PALM / SCAN';
  return 'HAND TRACKED';
}
function handLoop(now) {
  if (!state.tracking || !state.tracker) return;
  if (video.readyState >= 2 && video.currentTime !== state.lastVideo && now - state.lastTrack > 140) {
    state.lastVideo = video.currentTime; state.lastTrack = now;
    try {
      const result = state.tracker.detectForVideo(video, now), points = result.landmarks?.[0];
      if (points) {
        const next = classifyHand(points), palm = points[9];
        if (next !== state.handCandidate) { state.handCandidate = next; state.handCandidateSince = now; }
        if (now - state.handCandidateSince > 110) {
          document.querySelector('#camera-caption').textContent = next;
          placeTarget((1 - palm.x) * innerWidth, palm.y * innerHeight);
        }
      } else document.querySelector('#camera-caption').textContent = 'SHOW ONE HAND';
    } catch (error) { console.warn('Hand landmark frame skipped', error); }
  }
  state.trackRaf = requestAnimationFrame(handLoop);
}
async function startCamera() {
  if (state.loading) return;
  state.loading = true; cameraButton.disabled = true; cameraButton.querySelector('.hand-label').textContent = 'OPENING CAMERA…';
  showStatus('Requesting camera permission…');
  let phase = 'camera';
  try {
    if (!window.isSecureContext) throw new Error('Camera access requires HTTPS. Open the published HTTPS page directly.');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not expose camera access here. Open the HTTPS page in Safari, Chrome, or Edge instead of an embedded preview.');
    if (!state.stream) {
      try {
        state.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
      } catch (firstError) {
        if (!['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(firstError.name)) throw firstError;
        state.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      video.srcObject = state.stream;
      await video.play();
    }
    cameraPreview.hidden = false;
    phase = 'tracker';
    showStatus('Camera is on. Loading the hand tracker…');
    document.querySelector('#camera-caption').textContent = 'CAMERA CONNECTED';
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm');
    const options = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .55, minTrackingConfidence: .5 };
    try { state.tracker = await vision.HandLandmarker.createFromOptions(files, options); }
    catch { options.baseOptions.delegate = 'CPU'; state.tracker = await vision.HandLandmarker.createFromOptions(files, options); }
    state.tracking = true; state.handCandidate = ''; cameraButton.classList.add('active');
    cameraButton.querySelector('.hand-label').textContent = 'CLOSE CAMERA';
    document.querySelector('#camera-caption').textContent = 'SHOW ONE HAND';
    showStatus('Camera ready. Open palm to scan; pinch to follow heat.');
    state.trackRaf = requestAnimationFrame(handLoop);
  } catch (error) {
    const cameraOpened = Boolean(state.stream);
    if (cameraOpened && phase === 'tracker') {
      cameraPreview.hidden = false; cameraButton.classList.add('active');
      cameraButton.querySelector('.hand-label').textContent = 'RETRY TRACKER';
      document.querySelector('#camera-caption').textContent = 'CAMERA CONNECTED';
      showStatus(`Camera is working, but the hand tracker failed to load. ${error.message || error.name || 'Check the network and retry.'}`, true);
    } else {
      await stopCamera(false);
      cameraButton.querySelector('.hand-label').textContent = 'RETRY CAMERA';
      const hints = {
        NotAllowedError: 'Allow camera access in the browser address-bar/site settings, then retry.',
        PermissionDeniedError: 'Allow camera access in the browser address-bar/site settings, then retry.',
        NotFoundError: 'No camera was found. Connect or enable a camera, then retry.',
        NotReadableError: 'The camera is busy in another app. Close other camera apps and retry.',
        AbortError: 'The browser could not start the camera. Close other camera apps and retry.',
        SecurityError: 'The browser blocked camera access for this page. Open the HTTPS site directly and allow camera access.',
      };
      showStatus(`${hints[error.name] || error.message || 'Camera could not start.'}${error.name ? ` (${error.name})` : ''}`, true);
    }
  } finally { state.loading = false; cameraButton.disabled = false; }
}
async function stopCamera(clearMessage = true) {
  state.tracking = false;
  if (state.trackRaf) cancelAnimationFrame(state.trackRaf); state.trackRaf = 0;
  if (state.tracker) { try { state.tracker.close(); } catch {} state.tracker = null; }
  state.stream?.getTracks().forEach(track => track.stop()); state.stream = null;
  video.srcObject = null; cameraPreview.hidden = true; cameraButton.classList.remove('active');
  cameraButton.querySelector('.hand-label').textContent = 'OPEN CAMERA';
  if (clearMessage) showStatus('');
}
cameraButton.addEventListener('click', () => {
  if (state.loading) return;
  if (state.stream && state.tracking) stopCamera();
  else startCamera();
});
document.querySelector('#camera-close').addEventListener('click', () => stopCamera());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.raf) cancelAnimationFrame(state.raf); state.raf = 0;
    if (state.trackRaf) cancelAnimationFrame(state.trackRaf); state.trackRaf = 0;
  } else {
    if (!state.raf) state.raf = requestAnimationFrame(animate);
    if (state.tracking) state.trackRaf = requestAnimationFrame(handLoop);
  }
});
window.addEventListener('resize', resize, { passive: true });
resize(); state.raf = requestAnimationFrame(animate);
