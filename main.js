import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('sceneCanvas');
const templateGrid = document.getElementById('templateGrid');
const templateLabel = document.getElementById('templateLabel');
const colorPicker = document.getElementById('colorPicker');
const cameraButton = document.getElementById('cameraButton');
const camStatus = document.getElementById('camStatus');
const gestureReadout = document.getElementById('gestureReadout');
const cameraPreview = document.getElementById('cameraPreview');
const handOverlay = document.getElementById('handOverlay');
const handsStatus = document.getElementById('handsStatus');
const gestureMode = document.getElementById('gestureMode');
const handAssign = document.getElementById('handAssign');
const calibrateButton = document.getElementById('calibrateButton');
const pinchFill = document.getElementById('pinchFill');
const openFill = document.getElementById('openFill');

const templates = [
  { id: 'heart', label: 'Heart bloom', desc: 'Soft clustered heart' },
  { id: 'flower', label: 'Flower burst', desc: 'Petal-like petals' },
  { id: 'saturn', label: 'Saturn rings', desc: 'Planet with rings' },
  { id: 'buddha', label: 'Buddha statue', desc: 'Seated sculpture' },
  { id: 'fireworks', label: 'Fireworks', desc: 'Radial explosion' },
  { id: 'nebula', label: 'Nebula', desc: 'Clouded sphere' },
];

let activeTemplate = 'heart';
let targetColor = new THREE.Color(colorPicker.value);
let currentScale = 1;
let targetScale = 1;
let currentSpread = 1;
let targetSpread = 1;
let gestureIntensity = 0.2;
let currentRotationX = 0;
let currentRotationY = 0;
let currentRotationZ = 0;
let targetRotationX = 0;
let targetRotationY = 0;
let pinchValue = 1;
let openValue = 0;
let openBaseline = 0.3;
let cameraReady = false;
let handsSeen = false;
let handLandmarksCache = [];

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x08111c, 8, 22);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 0.5, 8);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 18;

const ambient = new THREE.AmbientLight(0xffffff, 1.6);
scene.add(ambient);
const keyLight = new THREE.DirectionalLight(0x8be9fd, 2.5);
keyLight.position.set(4, 8, 6);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.9);
fillLight.position.set(-3, 2, 4);
scene.add(fillLight);

let particleSystem = null;
let geometry = null;
let basePositions = [];
let morphStartPositions = [];
let morphProgress = 1;
let velocities = [];
let particlesAtRest = true;
let activeGestureState = 'waiting';

const handOverlayCtx = handOverlay.getContext('2d');

function resizeHandOverlay() {
  const rect = cameraPreview.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  handOverlay.width = Math.max(1, Math.floor(rect.width * dpr));
  handOverlay.height = Math.max(1, Math.floor(128 * dpr));
  handOverlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function createShapePoints(type, count) {
  const points = [];
  const push = (x, y, z = 0) => points.push([x, y, z]);
  const jitter = (amount) => (Math.random() - 0.5) * amount;

  if (type === 'heart') {
    // Fill the heart volume instead of sampling only the outline.
    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 2 - 1) * 1.25;
      const y = (Math.random() * 2 - 1) * 1.45;
      const a = x * x + y * y - 1;
      const heartMask = a * a * a - x * x * y * y * y;
      if (heartMask <= 0) {
        const depth = (1 - Math.min(1, Math.abs(heartMask) * 2.2));
        push(x * 0.95, y * 0.95 + 0.12, (Math.random() - 0.5) * (0.85 + depth * 0.6));
      } else {
        i--;
      }
    }
  } else if (type === 'flower') {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const petal = 1 + 0.16 * Math.sin(6 * a);
      const r = Math.sqrt(Math.random()) * 1.45 * petal;
      const z = jitter(0.42) + Math.sin(a * 3) * 0.08;
      push(Math.cos(a) * r, Math.sin(a) * r, z);
    }
  } else if (type === 'saturn') {
    for (let i = 0; i < count; i++) {
      const body = Math.random() < 0.82;
      if (body) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 0.8 + Math.random() * 0.22;
        const squash = 0.72;
        push(
          Math.cos(theta) * Math.sin(phi) * r * squash,
          Math.cos(phi) * r * 0.72,
          Math.sin(theta) * Math.sin(phi) * r * squash
        );
      } else {
        const angle = Math.random() * Math.PI * 2;
        const ringRadius = 1.35 + Math.random() * 0.55;
        push(
          Math.cos(angle) * ringRadius,
          jitter(0.06),
          Math.sin(angle) * ringRadius * 0.34
        );
      }
    }
  } else if (type === 'buddha') {
    for (let i = 0; i < count; i++) {
      const y = (Math.random() - 0.5) * 3.6;
      const head = Math.exp(-((y - 1.35) * (y - 1.35)) / 0.14) * 0.48;
      const shoulders = Math.exp(-((y - 0.6) * (y - 0.6)) / 0.18) * 0.88;
      const torso = Math.exp(-(y * y) / 2.8) * 0.95;
      const lap = Math.exp(-((y + 0.95) * (y + 0.95)) / 0.28) * 1.55;
      const profile = torso + shoulders + lap + head;
      const x = (Math.random() - 0.5) * (0.7 + profile * 1.1);
      const z = (Math.random() - 0.5) * (0.6 + profile * 0.9);
      const taper = y > 1.0 ? 0.48 : 1;
      push(x * taper, y, z * taper);
    }
  } else if (type === 'fireworks') {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3().randomDirection();
      const mag = Math.pow(Math.random(), 1.7) * 1.8;
      const burst = Math.random() < 0.12 ? 1.25 : 1;
      push(dir.x * mag * burst, dir.y * mag * burst, dir.z * mag * burst);
    }
  } else {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3().randomDirection();
      const mag = Math.cbrt(Math.random()) * 1.4;
      push(dir.x * mag, dir.y * mag, dir.z * mag);
    }
  }

  return points;
}

function rebuildParticles(type) {
  const count = 6500;
  morphStartPositions = geometry ? Array.from(geometry.attributes.position.array) : [];
  morphProgress = geometry ? 0 : 1;
  basePositions = createShapePoints(type, count);
  velocities = basePositions.map(() => new THREE.Vector3(
    (Math.random() - 0.5) * 0.01,
    (Math.random() - 0.5) * 0.01,
    (Math.random() - 0.5) * 0.01
  ));

  if (particleSystem) scene.remove(particleSystem);
  geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const p = basePositions[i];
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
    colors[i * 3] = targetColor.r;
    colors[i * 3 + 1] = targetColor.g;
    colors[i * 3 + 2] = targetColor.b;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.075,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);
  if (!morphStartPositions.length) {
    morphStartPositions = Array.from(positions);
    morphProgress = 1;
  }
}

function setActiveTemplate(id) {
  activeTemplate = id;
  templateLabel.textContent = templates.find(t => t.id === id)?.label ?? id;
  templateGrid.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.template === id);
  });
  rebuildParticles(id);
  particlesAtRest = true;
  currentScale = 1;
  targetScale = 1;
  currentSpread = 1;
  targetSpread = 1;
  currentRotationX = 0;
  currentRotationY = 0;
  currentRotationZ = 0;
  targetRotationX = 0;
  targetRotationY = 0;
  activeGestureState = 'waiting';
  gestureMode.textContent = 'Gesture: waiting';
  gestureMode.className = 'overlay-pill subtle';
}

templates.forEach((template, index) => {
  const btn = document.createElement('button');
  btn.className = 'template-btn';
  btn.dataset.template = template.id;
  btn.innerHTML = `<strong>${template.label}</strong><span>${template.desc}</span>`;
  btn.addEventListener('click', () => setActiveTemplate(template.id));
  templateGrid.appendChild(btn);
  if (index === 0) btn.classList.add('active');
});

if (calibrateButton) {
  calibrateButton.addEventListener('click', () => {
    const sortedHands = [...handLandmarksCache].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
    const zoomHand = sortedHands[1] || sortedHands[0] || null;
    if (!zoomHand) {
      gestureReadout.textContent = 'Calibration needs a hand in view.';
      return;
    }
    const indexMcp = zoomHand.landmarks[5];
    const middleMcp = zoomHand.landmarks[9];
    const indexTip = zoomHand.landmarks[8];
    const middleTip = zoomHand.landmarks[12];
    const zoomFingerCurl = THREE.MathUtils.clamp(
      (((indexMcp.y - indexTip.y) + (middleMcp.y - middleTip.y)) * 2.6),
      0,
      1.6
    );
    openBaseline = THREE.MathUtils.clamp(1.3 - zoomFingerCurl, 0, 1.3);
    gestureReadout.textContent = `Base calibrated at ${openBaseline.toFixed(2)}.`;
  });
}

colorPicker.addEventListener('input', () => {
  targetColor.set(colorPicker.value);
  if (particleSystem) {
    const colors = particleSystem.geometry.attributes.color.array;
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = targetColor.r;
      colors[i + 1] = targetColor.g;
      colors[i + 2] = targetColor.b;
    }
    particleSystem.geometry.attributes.color.needsUpdate = true;
  }
});

function updateFromHands(handData) {
  if (!handData.length) return;
  const sortedHands = [...handData].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
  const leftHand = sortedHands[0] || null;
  const rightHand = sortedHands[1] || null;
  const hasPair = !!leftHand && !!rightHand;
  const zoomHand = rightHand;
  const rotateHand = leftHand;

  if (!zoomHand && !rotateHand) return;
  if (!zoomHand) {
    openValue = 0;
    targetScale = 1;
    targetSpread = 1;
  }

  const zoomWrist = zoomHand ? zoomHand.landmarks[0] : null;
  const zoomIndexMcp = zoomHand ? zoomHand.landmarks[5] : null;
  const zoomIndexTip = zoomHand ? zoomHand.landmarks[8] : null;
  const zoomMiddleTip = zoomHand ? zoomHand.landmarks[12] : null;
  const zoomMiddleMcp = zoomHand ? zoomHand.landmarks[9] : null;
  const rotateWrist = rotateHand ? rotateHand.landmarks[0] : null;
  const rotateThumbTip = rotateHand ? rotateHand.landmarks[4] : null;
  const rotateIndexTip = rotateHand ? rotateHand.landmarks[8] : null;

  const zoomFingerCurl = zoomHand
    ? THREE.MathUtils.clamp(
        (((zoomIndexMcp.y - zoomIndexTip.y) + (zoomMiddleMcp.y - zoomMiddleTip.y)) * 2.6),
        0,
        1.6
      )
    : 1.6;
  const zoomOpenRaw = zoomHand ? THREE.MathUtils.clamp(1.3 - zoomFingerCurl, 0, 1.3) : 0;
  const zoomOpen = zoomHand ? THREE.MathUtils.clamp((zoomOpenRaw - openBaseline) * 2.9, 0, 1.3) : 0;
  const zoomDepth = zoomWrist ? zoomWrist.z || 0 : 0;

  const pinch = rotateHand
    ? Math.hypot(
        rotateThumbTip.x - rotateIndexTip.x,
        rotateThumbTip.y - rotateIndexTip.y,
        (rotateThumbTip.z || 0) - (rotateIndexTip.z || 0)
      )
    : 1;
  const pinchStrength = rotateHand ? THREE.MathUtils.clamp((0.18 - pinch) / 0.18, 0, 1) : 0;
  const rotateX = rotateHand ? THREE.MathUtils.clamp((0.5 - rotateWrist.y) * 2.4, -1.25, 1.25) : 0;
  const rotateY = rotateHand ? THREE.MathUtils.clamp((rotateWrist.x - 0.5) * 2.8, -1.5, 1.5) : 0;

  pinchValue = pinchStrength;
  openValue = zoomOpen;

  if (zoomHand) {
    targetScale = THREE.MathUtils.clamp(1.0 + zoomOpen * 3.2, 1.0, 3.4);
    targetSpread = THREE.MathUtils.clamp(1.0 + zoomOpen * 0.8, 1.0, 2.25);
    gestureIntensity = THREE.MathUtils.clamp(0.3 + (0.4 - zoomDepth) * 1.0 + zoomOpen * 0.25, 0.08, 1.9);
  }

  const pinchActive = !!rotateHand && pinchStrength > 0.22;
  if (pinchActive) {
    targetRotationY = rotateY * (1.2 + pinchStrength * 2.8);
    targetRotationX = rotateX * (1.2 + pinchStrength * 2.2);
  } else if (!hasPair) {
    targetRotationX = 0;
    targetRotationY = 0;
  }
  particlesAtRest = false;

  gestureReadout.textContent = `Right zoom ${zoomOpenRaw.toFixed(2)} | base ${openBaseline.toFixed(2)} | scale ${currentScale.toFixed(2)} | left pinch ${pinch.toFixed(2)}`;
  handsStatus.textContent = `${handData.length} hand${handData.length > 1 ? 's' : ''} detected`;
  if (pinchFill) pinchFill.style.width = `${Math.round(pinchStrength * 100)}%`;
  if (openFill) openFill.style.width = `${Math.round(THREE.MathUtils.clamp(zoomOpen / 1.3, 0, 1) * 100)}%`;
  if (handAssign) handAssign.textContent = hasPair ? 'Assign: left=rotate / right=zoom' : (rotateHand ? 'Assign: left=rotate / right=missing' : 'Assign: left=missing / right=zoom');
  if (pinchActive) {
    activeGestureState = 'pinch';
    gestureMode.textContent = 'Gesture: left pinch and move to rotate';
  } else if (zoomHand && zoomOpen > 0.04) {
    activeGestureState = 'zoom-out';
    gestureMode.textContent = 'Gesture: open hand to zoom out';
  } else {
    activeGestureState = 'zoom-in';
    gestureMode.textContent = 'Gesture: neutral base';
  }
  gestureMode.className = 'overlay-pill active-gesture';
}

function drawHandOverlay(handData) {
  const width = handOverlay.width;
  const height = handOverlay.height;
  handOverlayCtx.clearRect(0, 0, width, height);

  if (!handData.length) return;

  const points = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16],
    [0, 17, 18, 19, 20],
    [5, 9, 13, 17],
  ];

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = width / dpr;
  const h = height / dpr;
  const mapPoint = (lm) => ({
    x: (1 - lm.x) * w,
    y: lm.y * h,
  });

  handOverlayCtx.lineWidth = 2;
  handOverlayCtx.strokeStyle = 'rgba(139, 233, 253, 1)';
  handOverlayCtx.shadowColor = 'rgba(139, 233, 253, 1)';
  handOverlayCtx.shadowBlur = 14;
  handOverlayCtx.fillStyle = 'rgba(182, 255, 156, 1)';

  handData.forEach((hand) => {
    const isLeft = (hand.handedness || '').toLowerCase() === 'left';
    const wrist = mapPoint(hand.landmarks[0]);
    handOverlayCtx.fillStyle = isLeft ? 'rgba(182, 255, 156, 1)' : 'rgba(139, 233, 253, 1)';
    handOverlayCtx.font = '600 12px Inter, sans-serif';
    handOverlayCtx.fillText(isLeft ? 'L' : 'R', wrist.x + 8, wrist.y - 8);

    const thumb = mapPoint(hand.landmarks[4]);
    const index = mapPoint(hand.landmarks[8]);
    handOverlayCtx.beginPath();
    handOverlayCtx.moveTo(thumb.x, thumb.y);
    handOverlayCtx.lineTo(index.x, index.y);
    handOverlayCtx.strokeStyle = 'rgba(182, 255, 156, 1)';
    handOverlayCtx.lineWidth = 3;
    handOverlayCtx.stroke();

    points.forEach((chain) => {
      handOverlayCtx.beginPath();
      chain.forEach((index, i) => {
        const p = mapPoint(hand.landmarks[index]);
        if (i === 0) handOverlayCtx.moveTo(p.x, p.y);
        else handOverlayCtx.lineTo(p.x, p.y);
      });
      handOverlayCtx.stroke();
    });

    hand.landmarks.forEach((lm, index) => {
      const p = mapPoint(lm);
      handOverlayCtx.beginPath();
      handOverlayCtx.arc(p.x, p.y, index === 8 || index === 4 ? 5 : 2.8, 0, Math.PI * 2);
      handOverlayCtx.fill();
    });

    handOverlayCtx.strokeStyle = 'rgba(139, 233, 253, 1)';
    handOverlayCtx.lineWidth = 2;
  });
}

async function initCamera() {
  const HandsCtor = window.Hands;
  if (!HandsCtor) {
    throw new Error('MediaPipe failed to load. Check the network tab and CDN access.');
  }

  const video = document.createElement('video');
  video.style.display = 'none';
  video.setAttribute('playsinline', '');
  document.body.appendChild(video);

  const hands = new HandsCtor({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  hands.onResults((results) => {
    const handsData = [];
    if (results.multiHandLandmarks?.length) {
      results.multiHandLandmarks.forEach((landmarks, index) => {
        handsData.push({ landmarks, handedness: results.multiHandedness?.[index]?.label || 'Hand' });
      });
      handLandmarksCache = handsData;
      handsSeen = true;
      updateFromHands(handsData);
      camStatus.textContent = 'Camera live';
      camStatus.className = 'badge badge-ok';
      cameraReady = true;
      handsStatus.textContent = handsData.length === 1 ? 'Hands: 1 detected' : 'Hands: 2 detected';
    } else {
      handLandmarksCache = [];
      handsStatus.textContent = 'Hands: none';
      activeGestureState = 'waiting';
      openBaseline = 0.3;
      openValue = 0;
      pinchValue = 0;
      targetRotationX = 0;
      targetRotationY = 0;
      if (handAssign) handAssign.textContent = 'Assign: waiting';
      gestureMode.textContent = 'Gesture: waiting';
      gestureMode.className = 'overlay-pill subtle';
      if (handsSeen) {
        gestureReadout.textContent = 'No hands detected. Put one hand inside the camera frame.';
      } else {
        gestureReadout.textContent = 'Camera on. Show one hand to activate gesture control.';
      }
    }
    drawHandOverlay(handsData);
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: 640, height: 480 },
  });
  video.srcObject = stream;
  cameraPreview.srcObject = stream;
  await video.play();

  const pump = async () => {
    if (video.readyState >= 2) {
      await hands.send({ image: video });
    }
    if (stream.active) requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
}

cameraButton.addEventListener('click', async () => {
  if (!cameraReady) {
    cameraButton.disabled = true;
    cameraButton.textContent = 'Starting...';
    try {
      await initCamera();
      cameraButton.textContent = 'Camera enabled';
      camStatus.textContent = 'Waiting hands';
      camStatus.className = 'badge badge-warn';
    } catch (error) {
      console.error(error);
      cameraButton.disabled = false;
      cameraButton.textContent = 'Enable camera';
      camStatus.textContent = 'Camera blocked';
      camStatus.className = 'badge badge-warn';
      gestureReadout.textContent = error?.message || 'Allow camera access to control the particles with both hands.';
    }
  }
});

function resize() {
  const { width, height } = canvas.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function animate(time) {
  requestAnimationFrame(animate);
  controls.update();
  resize();
  resizeHandOverlay();

  if (particleSystem && geometry) {
    const pullToIdle = !handsSeen || handLandmarksCache.length < 1;
    const scaleTarget = pullToIdle ? 1 : targetScale;
    const spreadTarget = pullToIdle ? 1 : targetSpread;
    currentScale += (scaleTarget - currentScale) * 0.16;
    currentSpread += (spreadTarget - currentSpread) * 0.1;
    currentRotationX += ((pullToIdle ? 0 : targetRotationX) - currentRotationX) * 0.2;
    currentRotationY += ((pullToIdle ? 0 : targetRotationY) - currentRotationY) * 0.2;
    currentRotationZ += ((pullToIdle ? 0 : targetRotationY * 0.55) - currentRotationZ) * 0.16;
    morphProgress += (1 - morphProgress) * 0.05;

    const positions = geometry.attributes.position.array;
    for (let i = 0; i < basePositions.length; i++) {
      const base = basePositions[i];
      const startIndex = i * 3;
      const vel = velocities[i];
      const swirl = pullToIdle ? 0.00003 : 0.00055 + gestureIntensity * 0.001;
      vel.x += Math.sin(time * 0.0009 + i * 0.01) * swirl;
      vel.y += Math.cos(time * 0.0011 + i * 0.008) * swirl;
      vel.z += Math.sin(time * 0.0007 + i * 0.012) * swirl;
      vel.multiplyScalar(pullToIdle ? 0.95 : 0.992);

      const sx = morphStartPositions[startIndex] ?? base[0];
      const sy = morphStartPositions[startIndex + 1] ?? base[1];
      const sz = morphStartPositions[startIndex + 2] ?? base[2];
      const tx = base[0];
      const ty = base[1];
      const tz = base[2];
      const mx = THREE.MathUtils.lerp(sx, tx, morphProgress);
      const my = THREE.MathUtils.lerp(sy, ty, morphProgress);
      const mz = THREE.MathUtils.lerp(sz, tz, morphProgress);

      positions[startIndex] = (mx * currentScale + vel.x * 12) * currentSpread;
      positions[startIndex + 1] = (my * currentScale + vel.y * 12) * currentSpread;
      positions[startIndex + 2] = (mz * currentScale + vel.z * 12) * currentSpread;
    }
    geometry.attributes.position.needsUpdate = true;
    particleSystem.rotation.y += pullToIdle ? 0.00015 : 0.00035 + gestureIntensity * 0.00045;
    particleSystem.rotation.x = currentRotationX + Math.sin(time * 0.00022) * 0.02;
    particleSystem.rotation.z = currentRotationZ;
    if (pullToIdle) {
      currentRotationX *= 0.98;
      currentRotationY *= 0.98;
      currentRotationZ *= 0.98;
    }
    if (pullToIdle) {
      particlesAtRest = true;
    }
    gestureReadout.textContent = `One hand | open ${(openValue ?? 0).toFixed(2)} | pinch ${(pinchValue ?? 0).toFixed(2)} | zoom ${currentScale.toFixed(2)}`;
  }

  renderer.render(scene, camera);
}

setActiveTemplate(activeTemplate);
gestureReadout.textContent = 'Camera off. Press Enable camera, then show one hand.';
resize();
animate(0);
