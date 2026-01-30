// Sappy Seals AR - Enhanced 2D Parallax Game
// ============================================

// Canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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

// Depth layers
const LAYERS = {
  back: { parallax: 0.3, scale: 0.5 },
  mid: { parallax: 0.6, scale: 0.85 },
  front: { parallax: 1.0, scale: 1.0 }
};

// Images
const sealImg = new Image();
const fishImg = new Image();
const pufferImg = new Image();
const reefImg = new Image();

sealImg.src = 'assets/seal.png';
fishImg.src = 'assets/fish.png';
pufferImg.src = 'assets/puffer.png';
reefImg.src = 'assets/reef.png';

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

  sealX = canvas.width / 2;
  sealY = canvas.height / 2;
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

  // Hide start screen, show placement overlay
  startScreen.style.display = 'none';
  placementOverlay.style.display = 'flex';

  // Wait for tap to anchor
  canvas.addEventListener('click', handlePlacementTap, { once: true });

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

    // Update parallax
    parallaxX = (relativeGamma * PARALLAX_STRENGTH) / 45;
    parallaxY = (relativeBeta * PARALLAX_STRENGTH) / 45;

    if (!gameRunning || isPaused || isFrozen) return;

    // Update seal target position
    targetX = canvas.width / 2 + (relativeGamma * TILT_SENSITIVITY);
    targetY = canvas.height / 2 + (relativeBeta * TILT_SENSITIVITY);

    // Clamp to screen bounds
    targetX = Math.max(60, Math.min(canvas.width - 60, targetX));
    targetY = Math.max(100, Math.min(canvas.height - 100, targetY));
  });
}

// ============ GAME CONTROL ============

function startGame() {
  score = 0;
  hearts = 3;
  gameRunning = true;
  isPaused = false;

  // Reset seal
  sealX = canvas.width / 2;
  sealY = canvas.height / 2;
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

  // Spawn initial elements
  for (let i = 0; i < 4; i++) spawnBackFish();

  // Start spawning
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
  canvas.addEventListener('click', handlePlacementTap, { once: true });
}

// ============ SPAWNING ============

function spawnBackFish() {
  backFish.push({
    x: canvas.width + Math.random() * 200,
    y: Math.random() * canvas.height,
    speed: 0.3 + Math.random() * 0.4
  });
}

function spawnCollectible() {
  if (!gameRunning) return;

  collectibles.push({
    x: canvas.width + 50,
    y: 100 + Math.random() * (canvas.height - 200),
    collected: false,
    speed: 2 + Math.random() * 0.5
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
  puffers.push({
    x: canvas.width + 50,
    y: 100 + Math.random() * (canvas.height - 200),
    hit: false,
    speed: 2.5 + Math.random()
  });
}

function spawnShark() {
  if (!gameRunning) return;
  sharks.push({
    x: canvas.width + 100,
    y: canvas.height / 2,
    baseY: 100 + Math.random() * (canvas.height - 200),
    speed: 4 + Math.random() * 2,
    waveOffset: Math.random() * Math.PI * 2,
    hit: false
  });
}

function spawnReef() {
  if (!gameRunning) return;
  reefs.push({
    x: canvas.width + 50,
    y: 120 + Math.random() * (canvas.height - 240),
    speed: 1.5,
    triggered: false
  });
}

function spawnJellyfish() {
  if (!gameRunning) return;
  jellyfish.push({
    x: canvas.width + 50,
    y: Math.random() * (canvas.height - 100),
    speed: 1.2,
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
    s.y = s.baseY + Math.sin(Date.now() / 250 + s.waveOffset) * 60;
    s.baseY += (sealY - s.baseY) * 0.008;
  });
}

function updateJellyfish() {
  jellyfish.forEach(j => {
    j.x -= j.speed;
    j.y += Math.sin(Date.now() / 400 + j.wobble) * 0.4;
  });
}

// ============ DRAWING ============

function drawWithParallax(img, x, y, width, height, layer) {
  const offsetX = parallaxX * layer.parallax;
  const offsetY = parallaxY * layer.parallax;
  ctx.drawImage(img, x + offsetX, y + offsetY, width * layer.scale, height * layer.scale);
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

  ctx.save();
  ctx.translate(x + 40, y + 25);

  // Shark body (dark gray)
  ctx.fillStyle = '#4a5568';
  ctx.beginPath();
  ctx.moveTo(-40, 0);
  ctx.lineTo(40, -5);
  ctx.lineTo(40, 5);
  ctx.closePath();
  ctx.fill();

  // Dorsal fin
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(15, -25);
  ctx.lineTo(25, -5);
  ctx.closePath();
  ctx.fill();

  // Tail fin
  ctx.beginPath();
  ctx.moveTo(-35, 0);
  ctx.lineTo(-50, -15);
  ctx.lineTo(-50, 15);
  ctx.closePath();
  ctx.fill();

  // Eye
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

function drawJellyfish(j) {
  const offsetX = parallaxX * LAYERS.mid.parallax;
  const offsetY = parallaxY * LAYERS.mid.parallax;
  const x = j.x + offsetX + 30;
  const y = j.y + offsetY + 20;

  ctx.save();

  // Bell (translucent pink/purple)
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, 30);
  gradient.addColorStop(0, 'rgba(255, 150, 220, 0.8)');
  gradient.addColorStop(1, 'rgba(180, 100, 200, 0.4)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, 28, 20, 0, Math.PI, 0);
  ctx.fill();

  // Tentacles
  ctx.strokeStyle = 'rgba(200, 150, 255, 0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const tx = x - 20 + i * 10;
    const wave = Math.sin(Date.now() / 200 + i) * 5;
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.quadraticCurveTo(tx + wave, y + 30, tx - wave, y + 50);
    ctx.stroke();
  }

  ctx.restore();
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

function checkCollisions() {
  // Fish collection
  collectibles.forEach(c => {
    if (c.collected) return;
    const dist = distance(sealX, sealY, c.x + 27, c.y + 20);
    if (dist < 60) {
      c.collected = true;
      score += 10;
      triggerChomp();
      spawnScorePopup(c.x + 27, c.y, 10);
      updateUI();
    }
  });

  // Puffer collision
  puffers.forEach(p => {
    if (p.hit) return;
    const dist = distance(sealX, sealY, p.x + 35, p.y + 35);
    if (dist < 55) {
      p.hit = true;
      takeDamage();
    }
  });

  // Shark collision
  sharks.forEach(s => {
    if (s.hit) return;
    const dist = distance(sealX, sealY, s.x + 40, s.y + 25);
    if (dist < 50) {
      s.hit = true;
      takeDamage();
    }
  });

  // Reef collision (sticky)
  if (!isStuck) {
    reefs.forEach(r => {
      if (r.triggered) return;
      const dist = distance(sealX, sealY, r.x + 35, r.y + 30);
      if (dist < 45) {
        r.triggered = true;
        isStuck = true;
        stuckTimer = 60;
        navigator.vibrate?.([30, 30, 30]);
      }
    });
  }

  // Jellyfish collision (freeze)
  if (!isFrozen) {
    jellyfish.forEach(j => {
      if (j.hit) return;
      const dist = distance(sealX, sealY, j.x + 30, j.y + 20);
      if (dist < 45) {
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
  for (let i = backFish.length - 1; i >= 0; i--) {
    if (backFish[i].x < -60) backFish.splice(i, 1);
  }
  for (let i = collectibles.length - 1; i >= 0; i--) {
    if (collectibles[i].x < -70 || collectibles[i].collected) collectibles.splice(i, 1);
  }
  for (let i = puffers.length - 1; i >= 0; i--) {
    if (puffers[i].x < -80 || puffers[i].hit) puffers.splice(i, 1);
  }
  for (let i = sharks.length - 1; i >= 0; i--) {
    if (sharks[i].x < -100 || sharks[i].hit) sharks.splice(i, 1);
  }
  for (let i = reefs.length - 1; i >= 0; i--) {
    if (reefs[i].x < -80) reefs.splice(i, 1);
  }
  for (let i = jellyfish.length - 1; i >= 0; i--) {
    if (jellyfish[i].x < -80 || jellyfish[i].hit) jellyfish.splice(i, 1);
  }
}

// ============ GAME LOOP ============

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (gameRunning && !isPaused) {
    updateSeal();
    updateChomp();
    updateScorePopups();
    updateStatusEffects();
    updateSharks();
    updateJellyfish();
  }

  // Move entities
  if (gameRunning && !isPaused) {
    backFish.forEach(f => f.x -= f.speed);
    collectibles.forEach(c => c.x -= c.speed);
    puffers.forEach(p => p.x -= p.speed);
    reefs.forEach(r => r.x -= r.speed);
  }

  // Draw in depth order
  drawBackFish();

  reefs.forEach(r => drawReef(r));

  collectibles.forEach(c => {
    if (!c.collected) {
      drawWithParallax(fishImg, c.x, c.y, 55, 40, LAYERS.mid);
    }
  });

  jellyfish.forEach(j => {
    if (!j.hit) drawJellyfish(j);
  });

  if (sealImg.complete) drawSeal();

  puffers.forEach(p => {
    if (!p.hit) {
      drawWithParallax(pufferImg, p.x, p.y, 70, 70, LAYERS.front);
    }
  });

  sharks.forEach(s => {
    if (!s.hit) drawShark(s);
  });

  drawScorePopups();

  if (gameRunning && !isPaused) {
    checkCollisions();
    cleanupOffscreen();
  }

  requestAnimationFrame(gameLoop);
}

// ============ START ============

document.addEventListener('DOMContentLoaded', init);
