// Sappy Seals AR - Game Logic
// ============================

// Game State
let score = 0;
let hearts = 3;
let gameRunning = false;
let spawnInterval = null;
let gameLoop = null;

// Collections
const collectibles = [];
const obstacles = [];

// DOM Elements
const scoreEl = document.getElementById('score');
const heartsEl = document.getElementById('hearts');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const seal = document.getElementById('seal');

// Device orientation for seal movement
let sealX = 0;
let sealY = 0;
const SEAL_SPEED = 0.03;
const BOUNDS = { x: 1.5, y: 1 };

// Initialize game
function init() {
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  // Request device orientation permission (iOS 13+)
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    document.getElementById('start-btn').addEventListener('click', () => {
      DeviceOrientationEvent.requestPermission()
        .then(response => {
          if (response === 'granted') {
            setupDeviceOrientation();
          }
        })
        .catch(console.error);
    });
  } else {
    setupDeviceOrientation();
  }
}

// Setup device orientation controls
function setupDeviceOrientation() {
  window.addEventListener('deviceorientation', (event) => {
    if (!gameRunning) return;

    // gamma: left/right tilt (-90 to 90)
    // beta: front/back tilt (-180 to 180)
    const gamma = event.gamma || 0;
    const beta = event.beta || 0;

    // Map tilt to seal position
    sealX = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, gamma * SEAL_SPEED));
    sealY = Math.max(-BOUNDS.y, Math.min(BOUNDS.y, (beta - 45) * SEAL_SPEED * 0.5));

    // Update seal position
    seal.setAttribute('position', {
      x: sealX,
      y: sealY,
      z: -2
    });
  });

  // Fallback: touch/mouse controls
  let isDragging = false;
  let lastTouch = { x: 0, y: 0 };

  document.addEventListener('touchstart', (e) => {
    if (!gameRunning) return;
    isDragging = true;
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });

  document.addEventListener('touchmove', (e) => {
    if (!gameRunning || !isDragging) return;
    e.preventDefault();

    const deltaX = (e.touches[0].clientX - lastTouch.x) * 0.01;
    const deltaY = (e.touches[0].clientY - lastTouch.y) * 0.01;

    sealX = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, sealX + deltaX));
    sealY = Math.max(-BOUNDS.y, Math.min(BOUNDS.y, sealY - deltaY));

    seal.setAttribute('position', { x: sealX, y: sealY, z: -2 });

    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });

  document.addEventListener('touchend', () => {
    isDragging = false;
  });
}

// Start the game
function startGame() {
  score = 0;
  hearts = 3;
  gameRunning = true;
  sealX = 0;
  sealY = 0;

  updateUI();
  startScreen.style.display = 'none';
  gameOverScreen.style.display = 'none';

  // Clear any existing entities
  clearEntities();

  // Start spawning
  spawnInterval = setInterval(() => {
    if (Math.random() < 0.7) {
      spawnFish();
    } else if (score >= 50) {
      spawnPuffer();
    }
  }, 1500);

  // Start game loop
  gameLoop = setInterval(update, 50);

  // Initial spawns
  spawnFish();
  spawnFish();
}

// Restart game
function restartGame() {
  gameOverScreen.style.display = 'none';
  startGame();
}

// End game
function endGame() {
  gameRunning = false;
  clearInterval(spawnInterval);
  clearInterval(gameLoop);

  finalScoreEl.textContent = score;
  gameOverScreen.style.display = 'flex';
}

// Clear all entities
function clearEntities() {
  const collectiblesContainer = document.getElementById('collectibles');
  const obstaclesContainer = document.getElementById('obstacles');

  while (collectiblesContainer.firstChild) {
    collectiblesContainer.removeChild(collectiblesContainer.firstChild);
  }
  while (obstaclesContainer.firstChild) {
    obstaclesContainer.removeChild(obstaclesContainer.firstChild);
  }

  collectibles.length = 0;
  obstacles.length = 0;
}

// Spawn a fish collectible
function spawnFish() {
  const container = document.getElementById('collectibles');
  const fish = document.createElement('a-image');

  const x = (Math.random() - 0.5) * 3;
  const y = (Math.random() - 0.5) * 1.5;
  const z = -4 - Math.random() * 2;

  fish.setAttribute('src', '#fish-img');
  fish.setAttribute('position', { x, y, z });
  fish.setAttribute('scale', '0.25 0.25 0.25');
  fish.setAttribute('look-at', '[camera]');
  fish.setAttribute('animation', `
    property: position;
    to: ${x} ${y} 0;
    dur: 5000;
    easing: linear
  `);

  container.appendChild(fish);
  collectibles.push({
    el: fish,
    type: 'fish',
    collected: false
  });

  // Remove after animation
  setTimeout(() => {
    if (fish.parentNode) {
      fish.parentNode.removeChild(fish);
      const idx = collectibles.findIndex(c => c.el === fish);
      if (idx !== -1) collectibles.splice(idx, 1);
    }
  }, 5000);
}

// Spawn a puffer obstacle
function spawnPuffer() {
  const container = document.getElementById('obstacles');
  const puffer = document.createElement('a-sphere');

  const x = (Math.random() - 0.5) * 3;
  const y = (Math.random() - 0.5) * 1.5;
  const z = -4 - Math.random() * 2;

  puffer.setAttribute('color', '#9932CC');
  puffer.setAttribute('radius', '0.15');
  puffer.setAttribute('position', { x, y, z });
  puffer.setAttribute('animation', `
    property: position;
    to: ${x} ${y} 0;
    dur: 4000;
    easing: linear
  `);
  puffer.setAttribute('animation__pulse', `
    property: scale;
    to: 1.2 1.2 1.2;
    dur: 500;
    easing: easeInOutSine;
    loop: true;
    dir: alternate
  `);

  container.appendChild(puffer);
  obstacles.push({
    el: puffer,
    type: 'puffer',
    hit: false
  });

  // Remove after animation
  setTimeout(() => {
    if (puffer.parentNode) {
      puffer.parentNode.removeChild(puffer);
      const idx = obstacles.findIndex(o => o.el === puffer);
      if (idx !== -1) obstacles.splice(idx, 1);
    }
  }, 4000);
}

// Game update loop
function update() {
  if (!gameRunning) return;

  const sealPos = seal.object3D.position;

  // Check fish collisions
  collectibles.forEach((c, index) => {
    if (c.collected) return;

    const fishPos = c.el.object3D.position;
    const distance = sealPos.distanceTo(fishPos);

    if (distance < 0.4) {
      c.collected = true;
      score += 10;
      updateUI();

      // Visual feedback
      c.el.setAttribute('animation__collect', `
        property: scale;
        to: 0 0 0;
        dur: 200;
        easing: easeInQuad
      `);

      setTimeout(() => {
        if (c.el.parentNode) {
          c.el.parentNode.removeChild(c.el);
        }
      }, 200);
    }
  });

  // Check puffer collisions
  obstacles.forEach((o, index) => {
    if (o.hit) return;

    const pufferPos = o.el.object3D.position;
    const distance = sealPos.distanceTo(pufferPos);

    if (distance < 0.35) {
      o.hit = true;
      hearts--;
      updateUI();

      // Visual feedback - flash red
      seal.setAttribute('animation__hit', `
        property: material.color;
        from: #FF0000;
        to: #FFFFFF;
        dur: 500;
        easing: easeOutQuad
      `);

      if (hearts <= 0) {
        endGame();
      }
    }
  });
}

// Update UI
function updateUI() {
  scoreEl.textContent = score;

  // Update hearts display
  const heartSpans = heartsEl.querySelectorAll('.heart');
  heartSpans.forEach((heart, i) => {
    heart.style.opacity = i < hearts ? '1' : '0.2';
  });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
