// Sappy Seals AR - 2D Parallax Game
// ==================================

// Canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
let score = 0;
let hearts = 3;
let gameRunning = false;

// Collections
const collectibles = [];
const puffers = [];
const backFish = [];
const scorePopups = [];

// Seal position and physics
let sealX, sealY;
let targetX, targetY;
let sealRotation = 0;
const SEAL_SMOOTHING = 0.12;
const TILT_SENSITIVITY = 6;

// Parallax from gyroscope
let parallaxX = 0, parallaxY = 0;
const PARALLAX_STRENGTH = 25;

// Chomp animation
let isChomping = false;
let chompScale = 1.0;
let chompTimer = 0;

// Depth layers for parallax effect
const LAYERS = {
  back: { parallax: 0.3, scale: 0.6 },
  mid: { parallax: 0.6, scale: 0.85 },
  front: { parallax: 1.0, scale: 1.0 }
};

// Images
const sealImg = new Image();
const fishImg = new Image();
const pufferImg = new Image();

sealImg.src = 'assets/seal.png';
fishImg.src = 'assets/fish.png';
pufferImg.src = 'assets/puffer.png';

// DOM elements
const scoreEl = document.getElementById('score');
const heartsEl = document.getElementById('hearts');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const video = document.getElementById('camera');

// ============ INITIALIZATION ============

function init() {
  // Set canvas size
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Button listeners
  document.getElementById('start-btn').addEventListener('click', requestPermissionsAndStart);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  // Initialize seal position
  sealX = canvas.width / 2;
  sealY = canvas.height / 2;
  targetX = sealX;
  targetY = sealY;
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

async function requestPermissionsAndStart() {
  // Request camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.warn('Camera access denied:', err);
    // Game still works without camera
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

  startGame();
}

function setupDeviceOrientation() {
  window.addEventListener('deviceorientation', (e) => {
    const gamma = e.gamma || 0;  // Left/right: -90 to 90
    const beta = e.beta || 0;    // Front/back: -180 to 180

    // Update parallax
    parallaxX = (gamma * PARALLAX_STRENGTH) / 45;
    parallaxY = ((beta - 45) * PARALLAX_STRENGTH) / 45;

    if (!gameRunning) return;

    // Update seal target position
    targetX = canvas.width / 2 + (gamma * TILT_SENSITIVITY);
    targetY = canvas.height / 2 + ((beta - 45) * TILT_SENSITIVITY);

    // Clamp to screen bounds
    targetX = Math.max(60, Math.min(canvas.width - 60, targetX));
    targetY = Math.max(80, Math.min(canvas.height - 80, targetY));
  });
}

// ============ GAME CONTROL ============

function startGame() {
  score = 0;
  hearts = 3;
  gameRunning = true;

  // Reset seal
  sealX = canvas.width / 2;
  sealY = canvas.height / 2;
  targetX = sealX;
  targetY = sealY;

  // Clear arrays
  collectibles.length = 0;
  puffers.length = 0;
  backFish.length = 0;
  scorePopups.length = 0;

  updateUI();
  startScreen.style.display = 'none';
  gameOverScreen.style.display = 'none';

  // Spawn initial background fish
  for (let i = 0; i < 5; i++) {
    spawnBackFish();
  }

  // Start spawning
  spawnCollectible();
  setInterval(() => {
    if (gameRunning) spawnBackFish();
  }, 3000);

  // Game loop
  requestAnimationFrame(gameLoop);
}

function restartGame() {
  gameOverScreen.style.display = 'none';
  startGame();
}

function endGame() {
  gameRunning = false;
  finalScoreEl.textContent = score;
  gameOverScreen.style.display = 'flex';
}

// ============ SPAWNING ============

function spawnBackFish() {
  backFish.push({
    x: canvas.width + Math.random() * 100,
    y: Math.random() * canvas.height,
    speed: 0.5 + Math.random() * 0.5
  });
}

function spawnCollectible() {
  if (!gameRunning) return;

  collectibles.push({
    x: canvas.width + 50,
    y: 80 + Math.random() * (canvas.height - 160),
    collected: false,
    speed: 2 + Math.random()
  });

  // Spawn puffer occasionally after score 30
  if (score >= 30 && Math.random() < 0.3) {
    setTimeout(spawnPuffer, 500 + Math.random() * 1000);
  }

  // Schedule next spawn
  setTimeout(spawnCollectible, 1200 + Math.random() * 800);
}

function spawnPuffer() {
  if (!gameRunning) return;

  puffers.push({
    x: canvas.width + 50,
    y: 80 + Math.random() * (canvas.height - 160),
    hit: false,
    speed: 2.5 + Math.random() * 1.5
  });
}

// ============ UPDATES ============

function updateSeal() {
  // Smooth movement toward target
  sealX += (targetX - sealX) * SEAL_SMOOTHING;
  sealY += (targetY - sealY) * SEAL_SMOOTHING;

  // Visual lean based on movement
  const deltaX = targetX - sealX;
  sealRotation = deltaX * 0.02;
  sealRotation = Math.max(-0.3, Math.min(0.3, sealRotation));
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
  scorePopups.push({
    x, y,
    text: `+${points}`,
    alpha: 1.0,
    vy: -2.5,
    scale: 1.0
  });
}

// ============ DRAWING ============

function drawWithParallax(img, x, y, width, height, layer) {
  const offsetX = parallaxX * layer.parallax;
  const offsetY = parallaxY * layer.parallax;
  const scaledW = width * layer.scale;
  const scaledH = height * layer.scale;
  ctx.drawImage(img, x + offsetX, y + offsetY, scaledW, scaledH);
}

function drawSeal() {
  ctx.save();
  ctx.translate(sealX, sealY);
  ctx.rotate(sealRotation);
  ctx.scale(chompScale, chompScale);
  ctx.drawImage(sealImg, -50, -50, 100, 100);
  ctx.restore();
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

function checkCollisions() {
  // Fish collection
  collectibles.forEach(c => {
    if (c.collected) return;

    const dx = sealX - (c.x + 25);
    const dy = sealY - (c.y + 20);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 60) {
      c.collected = true;
      score += 10;
      triggerChomp();
      spawnScorePopup(c.x + 25, c.y, 10);
      updateUI();
    }
  });

  // Puffer collision
  puffers.forEach(p => {
    if (p.hit) return;

    const dx = sealX - (p.x + 35);
    const dy = sealY - (p.y + 35);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 55) {
      p.hit = true;
      hearts--;
      updateUI();

      // Vibrate if available
      if (navigator.vibrate) navigator.vibrate(150);

      if (hearts <= 0) {
        endGame();
      }
    }
  });
}

// ============ UI ============

function updateUI() {
  scoreEl.textContent = score;

  const heartSpans = heartsEl.querySelectorAll('.heart');
  heartSpans.forEach((heart, i) => {
    heart.style.opacity = i < hearts ? '1' : '0.2';
  });
}

// ============ GAME LOOP ============

function gameLoop() {
  // Clear canvas (transparent - camera shows through)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (gameRunning) {
    updateSeal();
    updateChomp();
    updateScorePopups();
  }

  // Draw background fish (far layer - slow parallax)
  backFish.forEach(f => {
    drawWithParallax(fishImg, f.x, f.y, 35, 25, LAYERS.back);
    f.x -= f.speed;
  });
  // Remove off-screen
  for (let i = backFish.length - 1; i >= 0; i--) {
    if (backFish[i].x < -50) backFish.splice(i, 1);
  }

  // Draw collectibles (mid layer)
  collectibles.forEach(c => {
    if (!c.collected) {
      drawWithParallax(fishImg, c.x, c.y, 55, 40, LAYERS.mid);
    }
    c.x -= c.speed;
  });
  // Remove off-screen or collected
  for (let i = collectibles.length - 1; i >= 0; i--) {
    if (collectibles[i].x < -60 || collectibles[i].collected) {
      collectibles.splice(i, 1);
    }
  }

  // Draw seal
  if (sealImg.complete) {
    drawSeal();
  }

  // Draw puffers (front layer - fast parallax, feels close)
  puffers.forEach(p => {
    if (!p.hit) {
      drawWithParallax(pufferImg, p.x, p.y, 70, 70, LAYERS.front);
    }
    p.x -= p.speed;
  });
  // Remove off-screen
  for (let i = puffers.length - 1; i >= 0; i--) {
    if (puffers[i].x < -80 || puffers[i].hit) {
      puffers.splice(i, 1);
    }
  }

  // Draw score popups
  drawScorePopups();

  // Check collisions
  if (gameRunning) {
    checkCollisions();
  }

  requestAnimationFrame(gameLoop);
}

// ============ START ============

document.addEventListener('DOMContentLoaded', init);
