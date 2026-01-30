// Sappy Seals AR - Fishtank Mode
// ===============================

// Canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ============ FISHTANK CONFIGURATION ============
const FISHTANK = {
  width: 600,
  height: 480,
  depth: 200,
  borderWidth: 0,
  borderColor: 'transparent',
  borderGlow: 'transparent',
  backgroundColor: 'rgba(0, 40, 80, 0.12)'
};

// ============ DEPTH LANES CONFIGURATION ============
const LANES = {
  BACK: 0,
  MIDDLE: 1,
  FRONT: 2
};

const LANE_CONFIG = {
  [LANES.BACK]: {
    z: 160,           // Far from camera
    scale: 0.5,       // Smaller (was 0.6)
    alpha: 0.5,       // More transparent (was 0.6)
    yOffset: -30      // Higher on screen (was -20)
  },
  [LANES.MIDDLE]: {
    z: 100,           // Middle depth
    scale: 0.8,       // (was 0.85)
    alpha: 0.85,
    yOffset: 0
  },
  [LANES.FRONT]: {
    z: 40,            // Close to camera
    scale: 1.1,       // Larger (was 1.0)
    alpha: 1.0,       // Fully opaque
    yOffset: 35       // Lower on screen (was 20)
  }
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

// AR tank positioning - tank stays fixed in world space
let anchorScreenX = 0;
let anchorScreenY = 0;
const AR_SENSITIVITY = 10;  // How much tank moves per degree of tilt (higher = more responsive AR)

// Debug: track if orientation events are firing
let orientationEventCount = 0;
let orientationSetupAttempted = false;

// Motion detection - fish pushed by real movement
let motionCanvas, motionCtx;
let prevFrameData = null;
let motionX = 0, motionY = 0;  // Where motion was detected (screen coords)
let prevMotionX = 0, prevMotionY = 0;  // Previous position for velocity calc
let motionVelX = 0, motionVelY = 0;    // Motion velocity (direction of wave)
let motionIntensity = 0;       // How much motion (0-1)
const MOTION_THRESHOLD = 30;   // Pixel diff threshold
const MOTION_DECAY = 0.9;      // How fast motion fades
const MOTION_VEL_DECAY = 0.85; // How fast velocity fades
let motionFrameSkip = 0;       // Process every N frames for performance

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
let sealLane = LANES.MIDDLE;  // Current depth lane
const SEAL_SMOOTHING = 0.12;
const TILT_SENSITIVITY = 12;  // Increased for more responsive seal movement

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
const tankImg = new Image();

sealImg.src = 'assets/seal.png';
fishImg.src = 'assets/fish.png';
pufferImg.src = 'assets/puffer.png';
reefImg.src = 'assets/reef.png';
sharkImg.src = 'assets/shark.png';
jellyImg.src = 'assets/jelly.png';
tankImg.src = 'assets/tank.png';

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

  // Keyboard controls for desktop testing
  window.addEventListener('keydown', handleKeyboard);

  // Touch controls as fallback for mobile (if gyroscope doesn't work)
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

  // Re-enable gyroscope when page becomes visible again (iOS fix)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && orientationSetupAttempted) {
      console.log('Page visible again, gyroscope should resume');
      // Events should auto-resume, but log for debugging
    }
  });

  // Initialize motion detection for AR fish scatter
  initMotionDetection();
}

// ============ MOTION DETECTION ============
// Analyzes camera feed to detect real-world motion
// Fish will scatter away from detected movement

function initMotionDetection() {
  motionCanvas = document.createElement('canvas');
  motionCanvas.width = 160;  // Low res for performance
  motionCanvas.height = 120;
  motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
}

function detectMotion() {
  // Skip frames for performance (process every 3rd frame)
  motionFrameSkip++;
  if (motionFrameSkip < 3) {
    return;
  }
  motionFrameSkip = 0;

  // Need video to be playing
  if (!video || video.readyState < 2) {
    return;
  }

  try {
    // Draw video frame to motion canvas (scaled down for performance)
    motionCtx.drawImage(video, 0, 0, motionCanvas.width, motionCanvas.height);
    const currentFrame = motionCtx.getImageData(0, 0, motionCanvas.width, motionCanvas.height);

    if (prevFrameData) {
      let motionSumX = 0, motionSumY = 0;
      let motionPixels = 0;

      // Compare frames pixel by pixel
      for (let i = 0; i < currentFrame.data.length; i += 4) {
        const diff = Math.abs(currentFrame.data[i] - prevFrameData.data[i]) +
                     Math.abs(currentFrame.data[i+1] - prevFrameData.data[i+1]) +
                     Math.abs(currentFrame.data[i+2] - prevFrameData.data[i+2]);

        if (diff > MOTION_THRESHOLD * 3) {
          const pixelIndex = i / 4;
          const x = pixelIndex % motionCanvas.width;
          const y = Math.floor(pixelIndex / motionCanvas.width);
          motionSumX += x;
          motionSumY += y;
          motionPixels++;
        }
      }

      if (motionPixels > 80) {  // Significant motion detected
        // Convert to screen coordinates
        const newMotionX = (motionSumX / motionPixels) / motionCanvas.width * canvas.width;
        const newMotionY = (motionSumY / motionPixels) / motionCanvas.height * canvas.height;

        // Calculate velocity (direction of motion) - this is key for push effect
        motionVelX = (newMotionX - prevMotionX) * 0.5 + motionVelX * 0.5;  // Smooth
        motionVelY = (newMotionY - prevMotionY) * 0.5 + motionVelY * 0.5;

        prevMotionX = motionX;
        prevMotionY = motionY;
        motionX = newMotionX;
        motionY = newMotionY;
        motionIntensity = Math.min(1, motionPixels / 300);
      } else {
        motionIntensity *= MOTION_DECAY;  // Fade out gradually
        motionVelX *= MOTION_VEL_DECAY;   // Velocity fades too
        motionVelY *= MOTION_VEL_DECAY;
      }
    }

    prevFrameData = currentFrame;
  } catch (e) {
    // Video might not be ready yet
  }
}

// Push entity in direction of detected motion (wave up → fish move up)
function applyMotionPush(entity, pushStrength = 10) {
  if (motionIntensity < 0.15) return;  // Not enough motion

  const dx = entity.x - motionX;
  const dy = entity.y - motionY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 350) {  // Within push radius
    const falloff = 1 - dist / 350;
    // Push in direction of motion velocity (wave direction)
    entity.x += motionVelX * falloff * pushStrength * motionIntensity;
    entity.y += motionVelY * falloff * pushStrength * motionIntensity;
  }
}

// Touch fallback variables
let touchStartX = 0, touchStartY = 0;
let lastTouchX = 0, lastTouchY = 0;

function handleTouchStart(e) {
  if (!gameRunning || isPaused) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;
}

function handleTouchMove(e) {
  if (!gameRunning || isPaused || isFrozen) return;
  e.preventDefault();

  const touch = e.touches[0];
  const deltaX = touch.clientX - lastTouchX;
  const deltaY = touch.clientY - lastTouchY;
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;

  // Move seal based on touch drag
  const tankHalfW = (FISHTANK.width / 2 - 40) * tankScale;
  const tankHalfH = (FISHTANK.height / 2 - 40) * tankScale;

  targetX = Math.max(tankCenterX - tankHalfW, Math.min(tankCenterX + tankHalfW, targetX + deltaX));
  targetY = Math.max(tankCenterY - tankHalfH, Math.min(tankCenterY + tankHalfH, targetY + deltaY));
}

// Keyboard controls for desktop testing (no gyroscope)
function handleKeyboard(e) {
  if (!gameRunning || isPaused || isFrozen) return;

  const tankHalfH = (FISHTANK.height / 2 - 40) * tankScale;
  const moveStep = 20;

  switch(e.key) {
    case 'ArrowUp':
      // Move seal UP on screen
      targetY = Math.max(tankCenterY - tankHalfH, targetY - moveStep);
      e.preventDefault();
      break;
    case 'ArrowDown':
      // Move seal DOWN on screen
      targetY = Math.min(tankCenterY + tankHalfH, targetY + moveStep);
      e.preventDefault();
      break;
    case 'w':
    case 'W':
      // Move to BACK lane (further from camera, smaller)
      if (sealLane > LANES.BACK) sealLane--;
      e.preventDefault();
      break;
    case 's':
    case 'S':
      // Move to FRONT lane (closer to camera, larger)
      if (sealLane < LANES.FRONT) sealLane++;
      e.preventDefault();
      break;
  }
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
      console.log('Orientation permission response:', response);
      if (response === 'granted') {
        setupDeviceOrientation();
      } else {
        // Try anyway - some browsers still fire events
        console.log('Permission not granted, trying anyway...');
        setupDeviceOrientation();
      }
    } catch (err) {
      console.warn('Orientation permission error:', err);
      // Try anyway as fallback
      setupDeviceOrientation();
    }
  } else {
    // Non-iOS or older browser
    setupDeviceOrientation();
  }

  // Always try to add listener as backup (some devices fire without permission)
  if (!orientationSetupAttempted) {
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

  // Save initial tank screen position (center of screen when anchored)
  anchorScreenX = canvas.width / 2;
  anchorScreenY = canvas.height / 2;
  tankCenterX = anchorScreenX;
  tankCenterY = anchorScreenY;

  // Hide placement overlay
  placementOverlay.style.display = 'none';

  // Start the game
  startGame();
}

function setupDeviceOrientation() {
  if (orientationSetupAttempted) return;  // Don't add duplicate listeners
  orientationSetupAttempted = true;
  console.log('Setting up device orientation listener...');

  window.addEventListener('deviceorientation', (e) => {
    orientationEventCount++;  // Debug: count events
    currentGamma = e.gamma || 0;
    currentBeta = e.beta || 0;

    // Calculate relative tilt from anchor
    let relativeGamma = currentGamma;
    let relativeBeta = currentBeta;

    if (isAnchored) {
      relativeGamma = currentGamma - anchorGamma;
      relativeBeta = currentBeta - anchorBeta;

      // AR positioning: Move tank opposite to tilt direction
      // Tilt right → tank moves left (you're looking right of where tank is)
      // Tilt forward → tank moves up (you're looking below where tank is)
      tankCenterX = anchorScreenX - (relativeGamma * AR_SENSITIVITY);
      tankCenterY = anchorScreenY - (relativeBeta * AR_SENSITIVITY);

      // Perspective scaling: Tank gets slightly larger when tilted toward you
      // Tilt toward (negative beta relative) = closer = larger
      const perspectiveScale = 1.0 - (relativeBeta * 0.003);
      tankScale = Math.max(0.7, Math.min(1.3, perspectiveScale));

      // Boundary limits: Keep tank partially visible
      const halfW = FISHTANK.width / 2 * tankScale;
      const halfH = FISHTANK.height / 2 * tankScale;
      tankCenterX = Math.max(-halfW * 0.5, Math.min(canvas.width + halfW * 0.5, tankCenterX));
      tankCenterY = Math.max(-halfH * 0.3, Math.min(canvas.height + halfH * 0.3, tankCenterY));
    }

    // Update parallax (legacy)
    parallaxX = (relativeGamma * PARALLAX_STRENGTH) / 45;
    parallaxY = (relativeBeta * PARALLAX_STRENGTH) / 45;

    // Update tank rotation for 3D effect (limited range)
    tankRotationY = Math.max(-25, Math.min(25, relativeGamma)) * Math.PI / 180;
    tankRotationX = Math.max(-15, Math.min(15, relativeBeta)) * Math.PI / 180;

    // Update seal lane based on forward/back tilt (beta) - only for large tilts
    updateSealLane(relativeBeta);

    if (!gameRunning || isPaused || isFrozen) return;

    // Update seal target position within tank bounds
    // Seal moves relative to tank center (which is now AR-positioned)
    const tankHalfW = (FISHTANK.width / 2 - 40) * tankScale;
    const tankHalfH = (FISHTANK.height / 2 - 40) * tankScale;

    // Use smaller portion of tilt for seal movement within tank
    targetX = tankCenterX + (relativeGamma * TILT_SENSITIVITY);
    targetY = tankCenterY + (relativeBeta * TILT_SENSITIVITY);

    // Clamp to tank bounds
    targetX = Math.max(tankCenterX - tankHalfW, Math.min(tankCenterX + tankHalfW, targetX));
    targetY = Math.max(tankCenterY - tankHalfH, Math.min(tankCenterY + tankHalfH, targetY));
  });
}

// Update seal's depth lane based on phone tilt
function updateSealLane(relativeBeta) {
  if (!gameRunning || isPaused || isFrozen) return;

  // Phone tilted away (positive beta) = back lane
  // Phone tilted toward (negative beta) = front lane
  // Threshold increased to 25 degrees so small tilts move seal, large tilts change lanes
  if (relativeBeta > 25) {
    sealLane = LANES.BACK;
  } else if (relativeBeta < -25) {
    sealLane = LANES.FRONT;
  } else {
    sealLane = LANES.MIDDLE;
  }
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

  // Reset tank state (but NOT position - that's set by handlePlacementTap for AR)
  // tankCenterX/Y are already set by handlePlacementTap() before this is called
  tankScale = 1.0;
  deviceDistance = 1.0;

  // Reset seal to current tank center (which is the AR-anchored position)
  sealX = tankCenterX;
  sealY = tankCenterY;
  targetX = sealX;
  targetY = sealY;
  sealLane = LANES.MIDDLE;

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
  const halfW = FISHTANK.width / 2 * tankScale;
  const halfH = FISHTANK.height / 2 * tankScale;
  backFish.push({
    x: tankCenterX + halfW * 0.85,  // Inside right edge
    y: tankCenterY - halfH + 20 + Math.random() * (FISHTANK.height * tankScale - 40),
    z: FISHTANK.depth - 20 + Math.random() * 30,  // Back of tank
    speed: 0.3 + Math.random() * 0.4
  });
}

function spawnCollectible() {
  if (!gameRunning) return;

  // Randomly assign to a lane
  const lane = Math.floor(Math.random() * 3);
  const laneConfig = LANE_CONFIG[lane];

  const halfW = FISHTANK.width / 2 * tankScale;
  const halfH = FISHTANK.height / 2 * tankScale;
  collectibles.push({
    x: tankCenterX + halfW * 0.85,  // Inside right edge
    y: tankCenterY - halfH + 30 + Math.random() * (FISHTANK.height * tankScale - 60) + laneConfig.yOffset * tankScale,
    z: laneConfig.z,  // Z determined by lane
    lane: lane,       // Store lane for collision detection
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

  // Randomly assign to a lane
  const lane = Math.floor(Math.random() * 3);
  const laneConfig = LANE_CONFIG[lane];

  const halfW = FISHTANK.width / 2 * tankScale;
  const halfH = FISHTANK.height / 2 * tankScale;
  puffers.push({
    x: tankCenterX + halfW * 0.85,  // Inside right edge
    y: tankCenterY - halfH + 40 + Math.random() * (FISHTANK.height * tankScale - 80) + laneConfig.yOffset * tankScale,
    z: laneConfig.z,  // Z determined by lane
    lane: lane,       // Store lane for collision detection
    hit: false,
    speed: 2.5 + Math.random()
  });
}

function spawnShark() {
  if (!gameRunning) return;

  // Randomly assign to a lane
  const lane = Math.floor(Math.random() * 3);
  const laneConfig = LANE_CONFIG[lane];

  const halfW = FISHTANK.width / 2 * tankScale;
  const halfH = FISHTANK.height / 2 * tankScale;
  sharks.push({
    x: tankCenterX + halfW * 0.85,  // Inside right edge
    y: tankCenterY + laneConfig.yOffset * tankScale,
    baseY: tankCenterY - halfH + 50 + Math.random() * (FISHTANK.height * tankScale - 100) + laneConfig.yOffset * tankScale,
    z: laneConfig.z,  // Z determined by lane
    lane: lane,       // Store lane for collision detection
    speed: 3 + Math.random() * 1.5,
    waveOffset: Math.random() * Math.PI * 2,
    hit: false
  });
}

function spawnReef() {
  if (!gameRunning) return;

  // Randomly assign to a lane
  const lane = Math.floor(Math.random() * 3);
  const laneConfig = LANE_CONFIG[lane];

  const halfW = FISHTANK.width / 2 * tankScale;
  const halfH = FISHTANK.height / 2 * tankScale;
  reefs.push({
    x: tankCenterX + halfW * 0.85,  // Inside right edge
    y: tankCenterY - halfH + 50 + Math.random() * (FISHTANK.height * tankScale - 100) + laneConfig.yOffset * tankScale,
    z: laneConfig.z,  // Z determined by lane
    lane: lane,       // Store lane for collision detection
    speed: 1.5,
    triggered: false
  });
}

function spawnJellyfish() {
  if (!gameRunning) return;

  // Randomly assign to a lane
  const lane = Math.floor(Math.random() * 3);
  const laneConfig = LANE_CONFIG[lane];

  const halfW = FISHTANK.width / 2 * tankScale;
  const halfH = FISHTANK.height / 2 * tankScale;
  jellyfish.push({
    x: tankCenterX + halfW * 0.85,  // Inside right edge
    y: tankCenterY - halfH + 30 + Math.random() * (FISHTANK.height * tankScale - 80) + laneConfig.yOffset * tankScale,
    z: laneConfig.z,  // Z determined by lane
    lane: lane,       // Store lane for collision detection
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
    s.y = s.baseY + Math.sin(Date.now() / 250 + s.waveOffset) * 40;
    s.baseY += (sealY - s.baseY) * 0.008;
    // Sharks stay in their assigned lane (no Z drift)
  });
}

function updateJellyfish() {
  jellyfish.forEach(j => {
    j.x -= j.speed;
    j.y += Math.sin(Date.now() / 400 + j.wobble) * 0.4;
    // Jellyfish stay in their assigned lane (no Z drift)
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

  // Draw tank image (now with transparent background)
  if (tankImg.complete && tankImg.naturalWidth > 0) {
    ctx.drawImage(tankImg, left, top, width, height);
  } else {
    // Fallback: blue rectangle
    ctx.fillStyle = 'rgba(0, 80, 120, 0.6)';
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, 15 * tankScale);
    ctx.fill();
  }

  // Animated caustics pattern (on top of tank image)
  const time = Date.now() / 1000;
  ctx.globalAlpha = 0.06;
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

// Draw horizontal lane divider lines (disabled - tank image has its own visual)
function drawLaneLines() {
  // Disabled - the tank image provides its own visual boundaries
  return;
}

// Draw current lane indicator below tank
function drawLaneIndicator() {
  ctx.save();
  ctx.font = `bold ${14 * tankScale}px sans-serif`;
  ctx.textAlign = 'center';

  const labels = ['BACK', 'MIDDLE', 'FRONT'];
  const colors = ['rgba(150, 180, 255, 0.8)', 'rgba(200, 255, 200, 0.8)', 'rgba(255, 200, 150, 0.8)'];
  const y = tankCenterY + FISHTANK.height / 2 * tankScale + 30;

  // Background pill
  const text = `⬤ ${labels[sealLane]}`;
  const metrics = ctx.measureText(text);
  const padding = 10;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.roundRect(
    tankCenterX - metrics.width / 2 - padding,
    y - 10,
    metrics.width + padding * 2,
    22,
    11
  );
  ctx.fill();

  // Text
  ctx.fillStyle = colors[sealLane];
  ctx.fillText(text, tankCenterX, y + 4);

  ctx.restore();
}

function drawWithParallax(img, x, y, width, height, layer) {
  const offsetX = parallaxX * layer.parallax;
  const offsetY = parallaxY * layer.parallax;
  ctx.drawImage(img, x + offsetX, y + offsetY, width * layer.scale, height * layer.scale);
}

// Draw entity with lane-based scaling
function drawEntityWithDepth(type, entity) {
  // Simplified: All entities at same scale (single plane game)
  const scale = 0.9 * tankScale;

  // Skip if entity is outside tank bounds
  const tankLeft = tankCenterX - FISHTANK.width / 2 * tankScale;
  const tankRight = tankCenterX + FISHTANK.width / 2 * tankScale;
  if (entity.x < tankLeft - 50 || entity.x > tankRight + 50) return;

  ctx.save();
  ctx.globalAlpha = 1.0;  // Full opacity for all entities

  switch (type) {
    case 'backfish':
      ctx.globalAlpha = 0.2;
      ctx.filter = 'grayscale(70%) brightness(0.7)';
      ctx.drawImage(fishImg, entity.x - 12 * scale, entity.y - 9 * scale, 24 * scale, 18 * scale);
      break;

    case 'fish':
      ctx.drawImage(fishImg, entity.x - 27 * scale, entity.y - 20 * scale, 54 * scale, 40 * scale);
      break;

    case 'puffer':
      ctx.drawImage(pufferImg, entity.x - 35 * scale, entity.y - 35 * scale, 70 * scale, 70 * scale);
      break;

    case 'shark':
      if (sharkImg.complete && sharkImg.naturalWidth > 0) {
        ctx.drawImage(sharkImg, entity.x - 45 * scale, entity.y - 30 * scale, 90 * scale, 60 * scale);
      }
      break;

    case 'jelly':
      if (jellyImg.complete && jellyImg.naturalWidth > 0) {
        ctx.drawImage(jellyImg, entity.x - 35 * scale, entity.y - 40 * scale, 70 * scale, 80 * scale);
      }
      break;

    case 'reef':
      if (reefImg.complete && reefImg.naturalWidth > 0) {
        ctx.drawImage(reefImg, entity.x - 35 * scale, entity.y - 30 * scale, 70 * scale, 60 * scale);
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

// Simplified: All entities in same plane, no lane check needed
function inSameLane(entityLane) {
  return true;  // Always collide - single plane game
}

function checkCollisions() {
  // Get collision radius adjusted for current seal lane scale
  const sealScale = LANE_CONFIG[sealLane].scale;

  // Fish collection - must be in same lane
  collectibles.forEach(c => {
    if (c.collected) return;
    if (!inSameLane(c.lane)) return;  // Must be in same lane

    const dist = distance(sealX, sealY, c.x, c.y);
    if (dist < 55 * sealScale) {
      c.collected = true;
      score += 10;
      triggerChomp();
      spawnScorePopup(c.x, c.y, 10);
      updateUI();
    }
  });

  // Puffer collision - must be in same lane
  puffers.forEach(p => {
    if (p.hit) return;
    if (!inSameLane(p.lane)) return;

    const dist = distance(sealX, sealY, p.x, p.y);
    if (dist < 50 * sealScale) {
      p.hit = true;
      takeDamage();
    }
  });

  // Shark collision - must be in same lane
  sharks.forEach(s => {
    if (s.hit) return;
    if (!inSameLane(s.lane)) return;

    const dist = distance(sealX, sealY, s.x, s.y);
    if (dist < 45 * sealScale) {
      s.hit = true;
      takeDamage();
    }
  });

  // Reef collision (sticky) - must be in same lane
  if (!isStuck) {
    reefs.forEach(r => {
      if (r.triggered) return;
      if (!inSameLane(r.lane)) return;

      const dist = distance(sealX, sealY, r.x, r.y);
      if (dist < 40 * sealScale) {
        r.triggered = true;
        isStuck = true;
        stuckTimer = 60;
        navigator.vibrate?.([30, 30, 30]);
      }
    });
  }

  // Jellyfish collision (freeze) - must be in same lane
  if (!isFrozen) {
    jellyfish.forEach(j => {
      if (j.hit) return;
      if (!inSameLane(j.lane)) return;

      const dist = distance(sealX, sealY, j.x, j.y);
      if (dist < 40 * sealScale) {
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
  // Use scaled tank bounds - remove entities when they exit left edge of tank
  const tankLeft = tankCenterX - FISHTANK.width / 2 * tankScale - 50;

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
    if (sharks[i].x < tankLeft || sharks[i].hit) sharks.splice(i, 1);
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

  // AR positioning: Only set to screen center if NOT anchored
  // When anchored, tankCenter is controlled by deviceorientation handler
  if (!isAnchored) {
    tankCenterX = canvas.width / 2;
    tankCenterY = canvas.height / 2;
  }

  // Detect motion in camera feed (for fish scatter effect)
  detectMotion();

  // DEBUG: Show gyroscope status (bottom-left to avoid score overlap)
  const debugY = canvas.height - 145;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(5, debugY, 280, 140);
  ctx.fillStyle = orientationEventCount > 0 ? '#0f0' : '#f00';
  ctx.font = '12px monospace';
  ctx.fillText(`Gyro: ${orientationEventCount} ${orientationSetupAttempted ? '(setup OK)' : '(NOT setup)'}`, 10, debugY + 17);
  ctx.fillStyle = '#0f0';
  ctx.fillText(`Beta: ${currentBeta.toFixed(1)}  Gamma: ${currentGamma.toFixed(1)}`, 10, debugY + 34);
  ctx.fillText(`Anchored: ${isAnchored}  Scale: ${tankScale.toFixed(2)}`, 10, debugY + 51);
  ctx.fillText(`Tank: (${tankCenterX.toFixed(0)}, ${tankCenterY.toFixed(0)})`, 10, debugY + 68);
  ctx.fillText(`Anchor: (${anchorScreenX.toFixed(0)}, ${anchorScreenY.toFixed(0)})`, 10, debugY + 85);
  ctx.fillText(`Seal: (${sealX?.toFixed(0) || 0}, ${sealY?.toFixed(0) || 0})`, 10, debugY + 102);
  ctx.fillText(`Motion: ${(motionIntensity * 100).toFixed(0)}% vel:(${motionVelX.toFixed(0)},${motionVelY.toFixed(0)})`, 10, debugY + 119);
  ctx.restore();

  // Visual feedback: Show motion detection area
  if (motionIntensity > 0.25) {
    ctx.save();
    ctx.globalAlpha = motionIntensity * 0.4;
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(motionX, motionY, 30 + motionIntensity * 40, 0, Math.PI * 2);
    ctx.fill();
    // Ripple effect
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.globalAlpha = motionIntensity * 0.3;
    ctx.beginPath();
    ctx.arc(motionX, motionY, 60 + motionIntensity * 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (gameRunning && !isPaused) {
    updateSeal();
    updateChomp();
    updateScorePopups();
    updateStatusEffects();
    updateSharks();
    updateJellyfish();
  }

  // Move entities (X movement) and apply motion push (wave direction)
  if (gameRunning && !isPaused) {
    backFish.forEach(f => {
      f.x -= f.speed;
      applyMotionPush(f, 6);  // Background fish pushed gently
    });
    collectibles.forEach(c => {
      c.x -= c.speed;
      applyMotionPush(c, 12);  // Fish pushed strongly by waves
    });
    puffers.forEach(p => {
      p.x -= p.speed;
      applyMotionPush(p, 8);  // Puffers pushed moderately
    });
    reefs.forEach(r => r.x -= r.speed);  // Reefs don't move
  }

  // ============ FISHTANK RENDERING ============

  // Draw fishtank background (tank.png)
  drawFishtankBackground();

  // Draw lane divider lines
  drawLaneLines();

  // Collect all entities for depth sorting
  const allEntities = [];

  // Add background fish (decorative, always at back)
  backFish.forEach(f => {
    allEntities.push({ type: 'backfish', entity: f, z: FISHTANK.depth, lane: LANES.BACK });
  });

  // Add reefs with their lane
  reefs.forEach(r => {
    if (!r.triggered) {
      allEntities.push({ type: 'reef', entity: r, z: r.z, lane: r.lane });
    }
  });

  // Add collectibles with their lane
  collectibles.forEach(c => {
    if (!c.collected) {
      allEntities.push({ type: 'fish', entity: c, z: c.z, lane: c.lane });
    }
  });

  // Add jellyfish with their lane
  jellyfish.forEach(j => {
    if (!j.hit) {
      allEntities.push({ type: 'jelly', entity: j, z: j.z, lane: j.lane });
    }
  });

  // Add puffers with their lane
  puffers.forEach(p => {
    if (!p.hit) {
      allEntities.push({ type: 'puffer', entity: p, z: p.z, lane: p.lane });
    }
  });

  // Add sharks with their lane
  sharks.forEach(s => {
    if (!s.hit) {
      allEntities.push({ type: 'shark', entity: s, z: s.z, lane: s.lane });
    }
  });

  // Add seal at its current lane depth
  const sealZ = LANE_CONFIG[sealLane].z;
  allEntities.push({
    type: 'seal',
    entity: { x: sealX, y: sealY, z: sealZ },
    z: sealZ,
    lane: sealLane
  });

  // Sort by Z (furthest/largest Z first = painter's algorithm)
  allEntities.sort((a, b) => b.z - a.z);

  // Set clipping region to keep entities inside tank
  ctx.save();
  const clipHalfW = FISHTANK.width / 2 * tankScale;
  const clipHalfH = FISHTANK.height / 2 * tankScale;
  ctx.beginPath();
  ctx.roundRect(tankCenterX - clipHalfW, tankCenterY - clipHalfH, FISHTANK.width * tankScale, FISHTANK.height * tankScale, 12 * tankScale);
  ctx.clip();

  // Draw all entities in depth order
  allEntities.forEach(item => {
    if (item.type === 'seal') {
      // Draw seal with rotation and chomp (simplified - no lane scaling)
      if (sealImg.complete) {
        ctx.save();
        ctx.translate(sealX, sealY);
        ctx.rotate(sealRotation);
        ctx.scale(chompScale * 0.9 * tankScale, chompScale * 0.9 * tankScale);

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

  // Restore from clipping
  ctx.restore();

  // Draw fishtank border (on top)
  drawFishtankBorder();

  // Lane indicator removed - single plane game now

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
