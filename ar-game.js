// Sappy Seals AR - Fishtank Mode
// ===============================

// Canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ============ FISHTANK CONFIGURATION ============
const FISHTANK = {
  width: 340,           // Logical width in game units
  height: 280,          // Logical height
  depth: 200,           // Z-depth for 3D effect
  borderWidth: 6,
  borderColor: 'rgba(100, 200, 255, 0.5)',
  borderGlow: 'rgba(100, 200, 255, 0.3)',
  backgroundColor: 'rgba(0, 40, 80, 0.12)'
};

// Tank state
let tankCenterX, tankCenterY;
let tankScale = 1.0;
let tankRotationX = 0, tankRotationY = 0;

// Seal Z position (fixed depth)
const SEAL_Z = FISHTANK.depth / 2;
const Z_COLLISION_TOLERANCE = 50;  // How close in Z for collision

// Device motion for distance
let deviceDistance = 1.0;
let lastAccelZ = 0;
let motionPermissionGranted = false;

// Game state
let score = 0;
let hearts = 3;
let gameRunning = false;
let isPaused = false;

// Surface anchoring
let isAnchored = false;
let anchorBeta = 0;
let anchorGamma = 0;
let currentBeta = 0;
let currentGamma = 0;

// Collections
const collectibles = [];
const puffers = [];
const sharks = [];
const reefs = [];
const jellyfish = [];
const backFish = [];
const scorePopups = [];

// Seal state
let sealX, sealY;
let targetX, targetY;
let sealRotation = 0;
const SEAL_SMOOTHING = 0.12;
const TILT_SENSITIVITY = 8;

// Status effects
let isStuck = false;
let stuckTimer = 0;
let isFrozen = false;
let freezeTimer = 0;

// Parallax
let parallaxX = 0, parallaxY = 0;
const PARALLAX_STRENGTH = 20;

// Chomp animation
let isChomping = false;
let chompScale = 1.0;
let chompTimer = 0;

// Depth layers (legacy - kept for compatibility)
const LAYERS = {
  back: { parallax: 0.3, scale: 0.5 },
  mid: { parallax: 0.6, scale: 0.85 },
  front: { parallax: 1.0, scale: 1.0 }
};

// ============ 3D PROJECTION ============

function projectToScreen(x, y, z) {
  const perspective = 500;  // Focal length
  const scale = perspective / (perspective + z);

  return {
    screenX: tankCenterX + (x - tankCenterX) * scale * tankScale,
    screenY: tankCenterY + (y - tankCenterY) * scale * tankScale,
    scale: scale * tankScale
  };
}

function projectWithRotation(x, y, z) {
  // Rotate point around tank center
  const cx = x - tankCenterX;
  const cy = y - tankCenterY;
  const cz = z - FISHTANK.depth / 2;

  // Y-axis rotation (left/right tilt)
  const rx = cx * Math.cos(tankRotationY) - cz * Math.sin(tankRotationY);
  const rz1 = cx * Math.sin(tankRotationY) + cz * Math.cos(tankRotationY);

  // X-axis rotation (forward/back tilt)
  const ry = cy * Math.cos(tankRotationX) - rz1 * Math.sin(tankRotationX);
  const rz2 = cy * Math.sin(tankRotationX) + rz1 * Math.cos(tankRotationX);

  return projectToScreen(rx + tankCenterX, ry + tankCenterY, rz2 + FISHTANK.depth / 2);
}

function distance3D(x1, y1, z1, x2, y2, z2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2);
}

// Images
const sealImg = new Image();
const fishImg = new Image();
const pufferImg = new Image();
const reefImg = new Image();
const sharkImg = new Image();
const jellyImg = new Image();

sealImg.src = 'assets/seal.png';
fishImg.src = 'assets/fish.png';
pufferImg.src = 'assets/puffer.png';
reefImg.src = 'assets/reef.png';
sharkImg.src = 'assets/shark.png';
jellyImg.src = 'assets/jelly.png';

// DOM elements
const scoreEl = document.getElementById('score');
const heartsEl = document.getElementById('hearts');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const video = document.getElementById('camera');
const placementOverlay = document.getElementById('placement-overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const freezeOverlay = document.getElementById('freeze-overlay');
const pauseBtn = document.getElementById('pause-btn');

// ============ INITIALIZATION ============

function init() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  document.getElementById('start-btn').addEventListener('click', requestPermissionsAndStart);
  document.getElementById('restart-btn').addEventListener('click', restartGame);
  document.getElementById('resume-btn').addEventListener('click', resumeGame);
  document.getElementById('reanchor-btn').addEventListener('click', findNewSurface);
  pauseBtn.addEventListener('click', showPauseMenu);

  // Initialize tank and seal position
  tankCenterX = canvas.width / 2;
  tankCenterY = canvas.height / 2;
  sealX = tankCenterX;
  sealY = tankCenterY;
  targetX = sealX;
  targetY = sealY;

  // Hide pause button initially
  pauseBtn.style.display = 'none';
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

async function requestPermissionsAndStart() {
  // Start camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.warn('Camera access denied:', err);
  }

  // Request device orientation (iOS 13+)
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response === 'granted') {
        setupDeviceOrientation();
      }
    } catch (err) {
      console.warn('Orientation permission denied:', err);
    }
  } else {
    setupDeviceOrientation();
  }

  // Request device motion (iOS 13+) - for distance scaling
  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const response = await DeviceMotionEvent.requestPermission();
      if (response === 'granted') {
        motionPermissionGranted = true;
        setupDeviceMotion();
      }
    } catch (err) {
      console.warn('Motion permission denied:', err);
    }
  } else {
    motionPermissionGranted = true;
    setupDeviceMotion();
  }

  // Hide start screen, show placement overlay
  startScreen.style.display = 'none';
  placementOverlay.style.display = 'flex';

  // Wait for tap to anchor (listen on overlay, not canvas - overlay has higher z-index)
  placementOverlay.addEventListener('click', handlePlacementTap, { once: true });

  // Start render loop (shows preview while placing)
  requestAnimationFrame(gameLoop);
}

function handlePlacementTap() {
  if (isAnchored) return;

  // Anchor to current orientation
  anchorBeta = currentBeta;
  anchorGamma = currentGamma;
  isAnchored = true;

  // Hide placement overlay
  placementOverlay.style.display = 'none';

  // Start the game
  startGame();
}

function setupDeviceOrientation() {
  window.addEventListener('deviceorientation', (e) => {
    currentGamma = e.gamma || 0;
    currentBeta = e.beta || 0;

    // Calculate relative tilt from anchor
    let relativeGamma = currentGamma;
    let relativeBeta = currentBeta;

    if (isAnchored) {
      relativeGamma = currentGamma - anchorGamma;
      relativeBeta = currentBeta - anchorBeta;
    }

    // Update parallax (legacy)
    parallaxX = (relativeGamma * PARALLAX_STRENGTH) / 45;
    parallaxY = (relativeBeta * PARALLAX_STRENGTH) / 45;

    // Update tank rotation for 3D effect (limited range)
    tankRotationY = Math.max(-25, Math.min(25, relativeGamma)) * Math.PI / 180;
    tankRotationX = Math.max(-15, Math.min(15, relativeBeta)) * Math.PI / 180;

    if (!gameRunning || isPaused || isFrozen) return;

    // Update seal target position within tank bounds
    const tankHalfW = (FISHTANK.width / 2 - 40) * tankScale;
    const tankHalfH = (FISHTANK.height / 2 - 40) * tankScale;

    targetX = tankCenterX + (relativeGamma * TILT_SENSITIVITY);
    targetY = tankCenterY + (relativeBeta * TILT_SENSITIVITY);

    // Clamp to tank bounds
    targetX = Math.max(tankCenterX - tankHalfW, Math.min(tankCenterX + tankHalfW, targetX));
    targetY = Math.max(tankCenterY - tankHalfH, Math.min(tankCenterY + tankHalfH, targetY));
  });
}

function setupDeviceMotion() {
  window.addEventListener('devicemotion', (e) => {
    if (!motionPermissionGranted) return;

    const accel = e.accelerationIncludingGravity;
    if (!accel) return;

    const accelZ = accel.z || 0;

    // Smooth the acceleration reading
    const smoothedAccelZ = accelZ * 0.3 + lastAccelZ * 0.7;
    const deltaZ = smoothedAccelZ - lastAccelZ;
    lastAccelZ = smoothedAccelZ;

    // Adjust device distance based on forward/backward motion
    // Moving phone forward (toward surface) = smaller Z accel = closer
    if (Math.abs(deltaZ) > 0.1) {
      deviceDistance = Math.max(0.7, Math.min(1.4, deviceDistance - deltaZ * 0.008));
      tankScale = 1.0 / deviceDistance;
    }
  });
}

// ============ GAME CONTROL ============

function startGame() {
  score = 0;
  hearts = 3;
  gameRunning = true;
  isPaused = false;

  // Reset tank state
  tankCenterX = canvas.width / 2;
  tankCenterY = canvas.height / 2;
  tankScale = 1.0;
  deviceDistance = 1.0;

  // Reset seal to tank center
  sealX = tankCenterX;
  sealY = tankCenterY;
  targetX = sealX;
  targetY = sealY;

  // Clear status effects
  isStuck = false;
  stuckTimer = 0;
  isFrozen = false;
  freezeTimer = 0;
  freezeOverlay.classList.remove('active');

  // Clear arrays
  collectibles.length = 0;
  puffers.length = 0;
  sharks.length = 0;
  reefs.length = 0;
  jellyfish.length = 0;
  backFish.length = 0;
  scorePopups.length = 0;

  updateUI();
  gameOverScreen.style.display = 'none';
  pauseBtn.style.display = 'block';

  // Spawn initial background fish
  for (let i = 0; i < 3; i++) spawnBackFish();

  // Start spawning collectibles
  spawnCollectible();
}

function restartGame() {
  gameOverScreen.style.display = 'none';
  startGame();
}

function endGame() {
  gameRunning = false;
  pauseBtn.style.display = 'none';
  finalScoreEl.textContent = score;
  gameOverScreen.style.display = 'flex';
}

function showPauseMenu() {
  isPaused = true;
  pauseOverlay.style.display = 'flex';
}

function resumeGame() {
  isPaused = false;
  pauseOverlay.style.display = 'none';
}

function findNewSurface() {
  isPaused = false;
  isAnchored = false;
  pauseOverlay.style.display = 'none';
  placementOverlay.style.display = 'flex';
  placementOverlay.addEventListener('click', handlePlacementTap, { once: true });
}

// ============ SPAWNING ============

function spawnBackFish() {
  const tankRight = tankCenterX + FISHTANK.width / 2;
  const tankTop = tankCenterY - FISHTANK.height / 2;
  backFish.push({
    x: tankRight + 50,
    y: tankTop + 20 + Math.random() * (FISHTANK.height - 40),
    z: FISHTANK.depth - 20 + Math.random() * 30,  // Back of tank
    speed: 0.3 + Math.random() * 0.4
  });
}

function spawnCollectible() {
  if (!gameRunning) return;

  const tankRight = tankCenterX + FISHTANK.width / 2;
  const tankTop = tankCenterY - FISHTANK.height / 2;
  collectibles.push({
    x: tankRight + 50,
    y: tankTop + 30 + Math.random() * (FISHTANK.height - 60),
    z: 30 + Math.random() * (FISHTANK.depth - 60),  // Various depths
    collected: false,
    speed: 2 + Math.random() * 0.5,
    zSpeed: (Math.random() - 0.5) * 0.3  // Slight Z drift
  });

  // Spawn obstacles based on score
  if (score >= 20 && Math.random() < 0.25) {
    setTimeout(spawnPuffer, 300 + Math.random() * 500);
  }
  if (score >= 50 && Math.random() < 0.2) {
    setTimeout(spawnShark, 500 + Math.random() * 700);
  }
  if (score >= 30 && Math.random() < 0.15) {
    setTimeout(spawnReef, 400 + Math.random() * 600);
  }
  if (score >= 70 && Math.random() < 0.15) {
    setTimeout(spawnJellyfish, 600 + Math.random() * 800);
  }

  // Spawn background fish occasionally
  if (Math.random() < 0.3) spawnBackFish();

  setTimeout(spawnCollectible, 1000 + Math.random() * 600);
}

function spawnPuffer() {
  if (!gameRunning) return;
  const tankRight = tankCenterX + FISHTANK.width / 2;
  const tankTop = tankCenterY - FISHTANK.height / 2;
  puffers.push({
    x: tankRight + 50,
    y: tankTop + 40 + Math.random() * (FISHTANK.height - 80),
    z: 20 + Math.random() * (FISHTANK.depth - 40),  // Various depths
    hit: false,
    speed: 2.5 + Math.random(),
    zSpeed: (Math.random() - 0.5) * 0.2
  });
}

function spawnShark() {
  if (!gameRunning) return;
  const tankRight = tankCenterX + FISHTANK.width / 2;
  const tankTop = tankCenterY - FISHTANK.height / 2;
  sharks.push({
    x: tankRight + 80,
    y: tankCenterY,
    baseY: tankTop + 50 + Math.random() * (FISHTANK.height - 100),
    z: FISHTANK.depth - 30,  // Start at back, swim forward
    speed: 3 + Math.random() * 1.5,
    zSpeed: -0.8,  // Swim toward front
    waveOffset: Math.random() * Math.PI * 2,
    hit: false
  });
}

function spawnReef() {
  if (!gameRunning) return;
  const tankRight = tankCenterX + FISHTANK.width / 2;
  const tankTop = tankCenterY - FISHTANK.height / 2;
  reefs.push({
    x: tankRight + 50,
    y: tankTop + 50 + Math.random() * (FISHTANK.height - 100),
    z: FISHTANK.depth - 30,  // Reefs at back of tank (on "floor")
    speed: 1.5,
    triggered: false
  });
}

function spawnJellyfish() {
  if (!gameRunning) return;
  const tankRight = tankCenterX + FISHTANK.width / 2;
  const tankTop = tankCenterY - FISHTANK.height / 2;
  jellyfish.push({
    x: tankRight + 50,
    y: tankTop + 30 + Math.random() * (FISHTANK.height - 80),
    z: 40 + Math.random() * (FISHTANK.depth - 80),  // Various depths
    speed: 1.2,
    zSpeed: (Math.random() - 0.5) * 0.3,
    wobble: Math.random() * Math.PI * 2,
    hit: false
  });
}

// ============ UPDATES ============

function updateSeal() {
  if (isFrozen) return;

  const smoothing = isStuck ? 0.02 : SEAL_SMOOTHING;
  sealX += (targetX - sealX) * smoothing;
  sealY += (targetY - sealY) * smoothing;

  const deltaX = targetX - sealX;
  sealRotation = Math.max(-0.3, Math.min(0.3, deltaX * 0.02));
}

function updateStatusEffects() {
  if (isStuck) {
    stuckTimer--;
    if (stuckTimer <= 0) isStuck = false;
  }

  if (isFrozen) {
    freezeTimer--;
    if (freezeTimer <= 0) {
      isFrozen = false;
      freezeOverlay.classList.remove('active');
      hearts--;
      updateUI();
      if (hearts <= 0) endGame();
    }
  }
}

function updateChomp() {
  if (!isChomping) return;
  chompTimer++;

  if (chompTimer < 4) {
    chompScale = 1.0 + (chompTimer / 4) * 0.35;
  } else if (chompTimer < 8) {
    chompScale = 1.35 - ((chompTimer - 4) / 4) * 0.45;
  } else if (chompTimer < 12) {
    chompScale = 0.9 + ((chompTimer - 8) / 4) * 0.1;
  } else {
    chompScale = 1.0;
    isChomping = false;
  }
}

function triggerChomp() {
  isChomping = true;
  chompTimer = 0;
}

function updateScorePopups() {
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const p = scorePopups[i];
    p.y += p.vy;
    p.alpha -= 0.025;
    p.scale += 0.01;
    if (p.alpha <= 0) scorePopups.splice(i, 1);
  }
}

function spawnScorePopup(x, y, points) {
  scorePopups.push({ x, y, text: `+${points}`, alpha: 1.0, vy: -2.5, scale: 1.0 });
}

function updateSharks() {
  sharks.forEach(s => {
    s.x -= s.speed;
    s.y = s.baseY + Math.sin(Date.now() / 250 + s.waveOffset) * 40;
    s.baseY += (sealY - s.baseY) * 0.008;
    // Move toward front of tank
    if (s.z > 30) s.z += s.zSpeed;
  });
}

function updateJellyfish() {
  jellyfish.forEach(j => {
    j.x -= j.speed;
    j.y += Math.sin(Date.now() / 400 + j.wobble) * 0.4;
    // Drift in Z
    j.z += j.zSpeed;
    j.z = Math.max(30, Math.min(FISHTANK.depth - 30, j.z));
  });
}

function updateEntitiesZ() {
  // Update Z position for collectibles
  collectibles.forEach(c => {
    if (c.zSpeed) {
      c.z += c.zSpeed;
      c.z = Math.max(20, Math.min(FISHTANK.depth - 20, c.z));
    }
  });

  // Update Z position for puffers
  puffers.forEach(p => {
    if (p.zSpeed) {
      p.z += p.zSpeed;
      p.z = Math.max(20, Math.min(FISHTANK.depth - 20, p.z));
    }
  });
}

// ============ DRAWING ============

// ============ FISHTANK DRAWING ============

function drawFishtankBackground() {
  ctx.save();

  const halfW = FISHTANK.width / 2 * tankScale;
  const halfH = FISHTANK.height / 2 * tankScale;
  const left = tankCenterX - halfW;
  const top = tankCenterY - halfH;
  const width = FISHTANK.width * tankScale;
  const height = FISHTANK.height * tankScale;

  // Semi-transparent blue background
  ctx.fillStyle = FISHTANK.backgroundColor;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, 12 * tankScale);
  ctx.fill();

  // Animated caustics pattern
  const time = Date.now() / 1000;
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    const cx = tankCenterX + Math.sin(time * 0.8 + i * 1.2) * halfW * 0.6;
    const cy = tankCenterY + Math.cos(time * 0.6 + i * 0.9) * halfH * 0.5;
    const rx = 25 * tankScale + Math.sin(time + i) * 10 * tankScale;
    const ry = 12 * tankScale + Math.cos(time + i) * 5 * tankScale;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, time * 0.3 + i, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFishtankBorder() {
  ctx.save();

  const halfW = FISHTANK.width / 2 * tankScale;
  const halfH = FISHTANK.height / 2 * tankScale;
  const left = tankCenterX - halfW;
  const top = tankCenterY - halfH;
  const width = FISHTANK.width * tankScale;
  const height = FISHTANK.height * tankScale;

  // Glow effect
  ctx.shadowColor = FISHTANK.borderGlow;
  ctx.shadowBlur = 15 * tankScale;
  ctx.strokeStyle = FISHTANK.borderColor;
  ctx.lineWidth = FISHTANK.borderWidth * tankScale;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, 12 * tankScale);
  ctx.stroke();

  // Inner highlight (top edge)
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2 * tankScale;
  ctx.beginPath();
  ctx.moveTo(left + 15 * tankScale, top + 3 * tankScale);
  ctx.lineTo(left + width - 15 * tankScale, top + 3 * tankScale);
  ctx.stroke();

  ctx.restore();
}

function drawWithParallax(img, x, y, width, height, layer) {
  const offsetX = parallaxX * layer.parallax;
  const offsetY = parallaxY * layer.parallax;
  ctx.drawImage(img, x + offsetX, y + offsetY, width * layer.scale, height * layer.scale);
}

// Draw entity with 3D projection
function drawEntityWithDepth(type, entity) {
  const proj = projectWithRotation(entity.x, entity.y, entity.z);

  // Clamp drawing to tank bounds with some margin
  const tankLeft = tankCenterX - FISHTANK.width / 2 * tankScale - 30;
  const tankRight = tankCenterX + FISHTANK.width / 2 * tankScale + 30;
  if (proj.screenX < tankLeft || proj.screenX > tankRight) return;

  // Depth-based alpha (farther = more transparent)
  const depthAlpha = 0.5 + 0.5 * proj.scale;

  ctx.save();
  ctx.globalAlpha = Math.min(1.0, depthAlpha);

  switch (type) {
    case 'backfish':
      ctx.globalAlpha = 0.2 * proj.scale;
      ctx.filter = 'grayscale(70%) brightness(0.7)';
      ctx.drawImage(fishImg, proj.screenX - 12 * proj.scale, proj.screenY - 9 * proj.scale, 24 * proj.scale, 18 * proj.scale);
      break;

    case 'fish':
      ctx.drawImage(fishImg, proj.screenX - 27 * proj.scale, proj.screenY - 20 * proj.scale, 54 * proj.scale, 40 * proj.scale);
      break;

    case 'puffer':
      ctx.drawImage(pufferImg, proj.screenX - 35 * proj.scale, proj.screenY - 35 * proj.scale, 70 * proj.scale, 70 * proj.scale);
      break;

    case 'shark':
      if (sharkImg.complete && sharkImg.naturalWidth > 0) {
        ctx.drawImage(sharkImg, proj.screenX - 45 * proj.scale, proj.screenY - 30 * proj.scale, 90 * proj.scale, 60 * proj.scale);
      }
      break;

    case 'jelly':
      if (jellyImg.complete && jellyImg.naturalWidth > 0) {
        ctx.drawImage(jellyImg, proj.screenX - 35 * proj.scale, proj.screenY - 40 * proj.scale, 70 * proj.scale, 80 * proj.scale);
      }
      break;

    case 'reef':
      if (reefImg.complete && reefImg.naturalWidth > 0) {
        ctx.drawImage(reefImg, proj.screenX - 35 * proj.scale, proj.screenY - 30 * proj.scale, 70 * proj.scale, 60 * proj.scale);
      }
      break;

    case 'seal':
      // Seal is drawn separately with rotation/chomp
      break;
  }

  ctx.restore();
}

function drawBackFish() {
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.filter = 'grayscale(70%) brightness(0.7)';

  backFish.forEach(f => {
    const offsetX = parallaxX * LAYERS.back.parallax;
    const offsetY = parallaxY * LAYERS.back.parallax;
    ctx.drawImage(fishImg, f.x + offsetX, f.y + offsetY, 25, 18);
  });

  ctx.restore();
}

function drawSeal() {
  ctx.save();
  ctx.translate(sealX, sealY);
  ctx.rotate(sealRotation);
  ctx.scale(chompScale, chompScale);

  if (isFrozen) {
    ctx.filter = 'hue-rotate(180deg) brightness(1.2)';
  } else if (isStuck) {
    ctx.filter = 'sepia(50%)';
  }

  ctx.drawImage(sealImg, -50, -50, 100, 100);
  ctx.restore();
}

function drawShark(s) {
  const offsetX = parallaxX * LAYERS.front.parallax;
  const offsetY = parallaxY * LAYERS.front.parallax;
  const x = s.x + offsetX;
  const y = s.y + offsetY;

  if (sharkImg.complete && sharkImg.naturalWidth > 0) {
    ctx.drawImage(sharkImg, x, y, 90, 60);
  } else {
    // Fallback: draw shark shape
    ctx.save();
    ctx.translate(x + 40, y + 25);

    ctx.fillStyle = '#4a5568';
    ctx.beginPath();
    ctx.moveTo(-40, 0);
    ctx.lineTo(40, -5);
    ctx.lineTo(40, 5);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(15, -25);
    ctx.lineTo(25, -5);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-35, 0);
    ctx.lineTo(-50, -15);
    ctx.lineTo(-50, 15);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(30, -2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(31, -2, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawJellyfish(j) {
  const offsetX = parallaxX * LAYERS.mid.parallax;
  const offsetY = parallaxY * LAYERS.mid.parallax;
  const x = j.x + offsetX;
  const y = j.y + offsetY;

  if (jellyImg.complete && jellyImg.naturalWidth > 0) {
    ctx.drawImage(jellyImg, x, y, 70, 80);
  } else {
    // Fallback: draw jellyfish shape
    const cx = x + 30;
    const cy = y + 20;

    ctx.save();

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    gradient.addColorStop(0, 'rgba(255, 150, 220, 0.8)');
    gradient.addColorStop(1, 'rgba(180, 100, 200, 0.4)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28, 20, 0, Math.PI, 0);
    ctx.fill();

    ctx.strokeStyle = 'rgba(200, 150, 255, 0.6)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const tx = cx - 20 + i * 10;
      const wave = Math.sin(Date.now() / 200 + i) * 5;
      ctx.beginPath();
      ctx.moveTo(tx, cy);
      ctx.quadraticCurveTo(tx + wave, cy + 30, tx - wave, cy + 50);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawReef(r) {
  const offsetX = parallaxX * LAYERS.mid.parallax;
  const offsetY = parallaxY * LAYERS.mid.parallax;

  if (reefImg.complete && reefImg.naturalWidth > 0) {
    ctx.drawImage(reefImg, r.x + offsetX, r.y + offsetY, 70, 60);
  } else {
    // Fallback: draw coral shape
    ctx.save();
    ctx.translate(r.x + offsetX + 35, r.y + offsetY + 30);

    ctx.fillStyle = '#ff6b6b';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(-20 + i * 10, Math.sin(i) * 10, 8, 20 + i * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawScorePopups() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  scorePopups.forEach(p => {
    ctx.font = `bold ${24 * p.scale}px "Comic Sans MS", cursive`;
    ctx.fillStyle = `rgba(255, 215, 0, ${p.alpha})`;
    ctx.strokeStyle = `rgba(0, 0, 0, ${p.alpha * 0.5})`;
    ctx.lineWidth = 3;
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillText(p.text, p.x, p.y);
  });
}

// ============ COLLISIONS ============

// Check if entity is within Z collision range of seal
function inZRange(entityZ) {
  return Math.abs(entityZ - SEAL_Z) < Z_COLLISION_TOLERANCE;
}

function checkCollisions() {
  // Fish collection - requires Z proximity
  collectibles.forEach(c => {
    if (c.collected) return;
    if (!inZRange(c.z)) return;  // Must be at similar depth

    const dist = distance(sealX, sealY, c.x, c.y);
    if (dist < 55) {
      c.collected = true;
      score += 10;
      triggerChomp();
      spawnScorePopup(c.x, c.y, 10);
      updateUI();
    }
  });

  // Puffer collision - requires Z proximity
  puffers.forEach(p => {
    if (p.hit) return;
    if (!inZRange(p.z)) return;

    const dist = distance(sealX, sealY, p.x, p.y);
    if (dist < 50) {
      p.hit = true;
      takeDamage();
    }
  });

  // Shark collision - requires Z proximity
  sharks.forEach(s => {
    if (s.hit) return;
    if (!inZRange(s.z)) return;

    const dist = distance(sealX, sealY, s.x, s.y);
    if (dist < 45) {
      s.hit = true;
      takeDamage();
    }
  });

  // Reef collision (sticky) - requires Z proximity
  if (!isStuck) {
    reefs.forEach(r => {
      if (r.triggered) return;
      if (!inZRange(r.z)) return;

      const dist = distance(sealX, sealY, r.x, r.y);
      if (dist < 40) {
        r.triggered = true;
        isStuck = true;
        stuckTimer = 60;
        navigator.vibrate?.([30, 30, 30]);
      }
    });
  }

  // Jellyfish collision (freeze) - requires Z proximity
  if (!isFrozen) {
    jellyfish.forEach(j => {
      if (j.hit) return;
      if (!inZRange(j.z)) return;

      const dist = distance(sealX, sealY, j.x, j.y);
      if (dist < 40) {
        j.hit = true;
        isFrozen = true;
        freezeTimer = 90;
        freezeOverlay.classList.add('active');
        navigator.vibrate?.([50, 30, 50, 30, 100]);
      }
    });
  }
}

function takeDamage() {
  hearts--;
  navigator.vibrate?.(150);
  updateUI();
  if (hearts <= 0) endGame();
}

function distance(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// ============ UI ============

function updateUI() {
  scoreEl.textContent = score;
  const heartSpans = heartsEl.querySelectorAll('.heart');
  heartSpans.forEach((heart, i) => {
    heart.style.opacity = i < hearts ? '1' : '0.2';
  });
}

// ============ CLEANUP ============

function cleanupOffscreen() {
  const tankLeft = tankCenterX - FISHTANK.width / 2 - 80;

  for (let i = backFish.length - 1; i >= 0; i--) {
    if (backFish[i].x < tankLeft) backFish.splice(i, 1);
  }
  for (let i = collectibles.length - 1; i >= 0; i--) {
    if (collectibles[i].x < tankLeft || collectibles[i].collected) collectibles.splice(i, 1);
  }
  for (let i = puffers.length - 1; i >= 0; i--) {
    if (puffers[i].x < tankLeft || puffers[i].hit) puffers.splice(i, 1);
  }
  for (let i = sharks.length - 1; i >= 0; i--) {
    if (sharks[i].x < tankLeft - 50 || sharks[i].hit) sharks.splice(i, 1);
  }
  for (let i = reefs.length - 1; i >= 0; i--) {
    if (reefs[i].x < tankLeft) reefs.splice(i, 1);
  }
  for (let i = jellyfish.length - 1; i >= 0; i--) {
    if (jellyfish[i].x < tankLeft || jellyfish[i].hit) jellyfish.splice(i, 1);
  }
}

// ============ GAME LOOP ============

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update tank center on resize
  tankCenterX = canvas.width / 2;
  tankCenterY = canvas.height / 2;

  if (gameRunning && !isPaused) {
    updateSeal();
    updateChomp();
    updateScorePopups();
    updateStatusEffects();
    updateSharks();
    updateJellyfish();
    updateEntitiesZ();
  }

  // Move entities (X movement)
  if (gameRunning && !isPaused) {
    backFish.forEach(f => f.x -= f.speed);
    collectibles.forEach(c => c.x -= c.speed);
    puffers.forEach(p => p.x -= p.speed);
    reefs.forEach(r => r.x -= r.speed);
  }

  // ============ FISHTANK RENDERING ============

  // Draw fishtank background
  drawFishtankBackground();

  // Collect all entities for depth sorting
  const allEntities = [];

  // Add background fish
  backFish.forEach(f => {
    allEntities.push({ type: 'backfish', entity: f, z: f.z || FISHTANK.depth });
  });

  // Add reefs
  reefs.forEach(r => {
    allEntities.push({ type: 'reef', entity: r, z: r.z || FISHTANK.depth - 20 });
  });

  // Add collectibles
  collectibles.forEach(c => {
    if (!c.collected) {
      allEntities.push({ type: 'fish', entity: c, z: c.z });
    }
  });

  // Add jellyfish
  jellyfish.forEach(j => {
    if (!j.hit) {
      allEntities.push({ type: 'jelly', entity: j, z: j.z });
    }
  });

  // Add puffers
  puffers.forEach(p => {
    if (!p.hit) {
      allEntities.push({ type: 'puffer', entity: p, z: p.z });
    }
  });

  // Add sharks
  sharks.forEach(s => {
    if (!s.hit) {
      allEntities.push({ type: 'shark', entity: s, z: s.z });
    }
  });

  // Add seal at fixed depth
  allEntities.push({
    type: 'seal',
    entity: { x: sealX, y: sealY, z: SEAL_Z },
    z: SEAL_Z
  });

  // Sort by Z (furthest/largest Z first = painter's algorithm)
  allEntities.sort((a, b) => b.z - a.z);

  // Draw all entities in depth order
  allEntities.forEach(item => {
    if (item.type === 'seal') {
      // Draw seal with rotation and chomp
      if (sealImg.complete) {
        const proj = projectWithRotation(sealX, sealY, SEAL_Z);
        ctx.save();
        ctx.translate(proj.screenX, proj.screenY);
        ctx.rotate(sealRotation);
        ctx.scale(chompScale * proj.scale, chompScale * proj.scale);

        if (isFrozen) {
          ctx.filter = 'hue-rotate(180deg) brightness(1.2)';
        } else if (isStuck) {
          ctx.filter = 'sepia(50%)';
        }

        ctx.drawImage(sealImg, -50, -50, 100, 100);
        ctx.restore();
      }
    } else {
      drawEntityWithDepth(item.type, item.entity);
    }
  });

  // Draw fishtank border (on top)
  drawFishtankBorder();

  // Draw score popups (UI layer)
  drawScorePopups();

  if (gameRunning && !isPaused) {
    checkCollisions();
    cleanupOffscreen();
  }

  requestAnimationFrame(gameLoop);
}

// ============ START ============

document.addEventListener('DOMContentLoaded', init);
