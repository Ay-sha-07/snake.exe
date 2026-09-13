/* ===== SCREAMING SNAKE – GAME ENGINE ===== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GRID = 20;               // cell size in px
const COLS = canvas.width / GRID;
const ROWS = canvas.height / GRID;

let snake = [];
let direction = 'RIGHT';
let nextDirection = 'RIGHT';
let food = { x: 0, y: 0 };
let baseSpeed = 150;           // ms per tick (medium)
let currentSpeed = baseSpeed;
let lastTick = 0;
let score = 0;
let lives = 3;
const MAX_LIVES = 3;
let isGameOver = false;
let isRunning = false;
let lastTurnTime = 0;
let lastVoiceZone = 'none'; // only turn when entering low/high zone
let useKeyboard = true;        // fallback if mic fails
let difficulty = 'medium';
let gameMode = 'classic';
let walls = new Set();         // "x,y" keys for solid cells

const DIFFICULTY_SPEEDS = {
  easy: 200,
  medium: 150,
  hard: 90
};

/* ---------- SFX (preloaded so they work in every mode) ---------- */
let eatAudio = null;
let crashAudio = null;
let crashAudio2 = null;
let clickAudio = null;
let crashToggle = 0; // alternates between crash.mp3 and crash2.mp3

function preloadSfx() {
  try {
    eatAudio = new Audio('eat.mp3');
    eatAudio.preload = 'auto';
    eatAudio.volume = 0.85;
    eatAudio.load();
  } catch (e) {}
  try {
    crashAudio = new Audio('crash.mp3');
    crashAudio.preload = 'auto';
    crashAudio.volume = 0.9;
    crashAudio.load();
  } catch (e) {}
  try {
    crashAudio2 = new Audio('crash2.mp3');
    crashAudio2.preload = 'auto';
    crashAudio2.volume = 0.35; // quieter cat laugh
    crashAudio2.load();
  } catch (e) {}
  try {
    clickAudio = new Audio('click.wav');
    clickAudio.preload = 'auto';
    clickAudio.volume = 0.7;
    clickAudio.load();
  } catch (e) {}
}

function playClickSound() {
  try {
    if (!clickAudio) preloadSfx();
    const a = clickAudio.cloneNode();
    a.volume = 0.7;
    a.currentTime = 0;
    a.play().catch(() => {
      const b = new Audio('click.wav');
      b.volume = 0.7;
      b.play().catch(() => {});
    });
  } catch (e) {
    try {
      new Audio('click.wav').play().catch(() => {});
    } catch (_) {}
  }
}

function playEatSound() {
  try {
    if (!eatAudio) preloadSfx();
    // clone so overlapping eats still play
    const a = eatAudio.cloneNode();
    a.volume = 0.85;
    a.currentTime = 0;
    a.play().catch(() => {
      // fallback: recreate
      const b = new Audio('eat.mp3');
      b.volume = 0.85;
      b.play().catch(() => {});
    });
  } catch (e) {
    try {
      new Audio('eat.mp3').play().catch(() => {});
    } catch (_) {}
  }
}

function playCrashSound() {
  // Life lost (still have lives) → always faah
  try {
    if (!crashAudio) preloadSfx();
    const a = crashAudio ? crashAudio.cloneNode() : new Audio('crash.mp3');
    a.volume = 0.9;
    a.currentTime = 0;
    a.play().catch(() => {
      const b = new Audio('crash.mp3');
      b.volume = 0.9;
      b.play().catch(() => {});
    });
  } catch (e) {
    try { new Audio('crash.mp3').play().catch(() => {}); } catch (_) {}
  }
}

function playFinalCrashSound() {
  // Final death / no lives left -> crash2 at quieter intensity
  try {
    if (!crashAudio2) preloadSfx();
    const a = crashAudio2 ? crashAudio2.cloneNode() : new Audio('crash2.mp3');
    a.volume = 0.35;
    a.currentTime = 0;
    a.play().catch(() => {
      const b = new Audio('crash2.mp3');
      b.volume = 0.35;
      b.play().catch(() => {});
    });
  } catch (e) {
    try {
      const b = new Audio('crash2.mp3');
      b.volume = 0.35;
      b.play().catch(() => {});
    } catch (_) {}
  }
}

// Preload as soon as script loads
preloadSfx();

/* ---------- Mode wall layouts (24×24 grid) ---------- */
function wallKey(x, y) { return x + ',' + y; }

function isWall(x, y) {
  return walls.has(wallKey(x, y));
}

function buildWalls(mode) {
  walls = new Set();
  const W = COLS;
  const H = ROWS;

  if (mode === 'classic') {
    // open field + wraparound — no walls
    return;
  }

  if (mode === 'box') {
    // solid border
    for (let x = 0; x < W; x++) {
      walls.add(wallKey(x, 0));
      walls.add(wallKey(x, H - 1));
    }
    for (let y = 0; y < H; y++) {
      walls.add(wallKey(0, y));
      walls.add(wallKey(W - 1, y));
    }
    return;
  }

  if (mode === 'tunnel') {
    // two long parallel horizontal walls → tight corridors
    // leave gaps at left & right ends so snake can pass between lanes
    for (let x = 3; x < W - 3; x++) {
      walls.add(wallKey(x, 7));
      walls.add(wallKey(x, 16));
    }
    return;
  }

  if (mode === 'rails') {
    // multiple broken parallel lines (railroad tracks)
    const railYs = [5, 9, 14, 18];
    for (const y of railYs) {
      for (let x = 2; x < W - 2; x++) {
        // broken segments — gaps every few cells
        if (x % 5 !== 0 && x % 5 !== 1) {
          walls.add(wallKey(x, y));
        }
      }
    }
    return;
  }

  if (mode === 'mills') {
    // four large L-shaped corner blocks (windmill sails)
    // top-left L
    for (let i = 2; i <= 8; i++) walls.add(wallKey(i, 2));
    for (let i = 2; i <= 8; i++) walls.add(wallKey(2, i));
    // top-right L
    for (let i = W - 9; i <= W - 3; i++) walls.add(wallKey(i, 2));
    for (let i = 2; i <= 8; i++) walls.add(wallKey(W - 3, i));
    // bottom-left L
    for (let i = 2; i <= 8; i++) walls.add(wallKey(i, H - 3));
    for (let i = H - 9; i <= H - 3; i++) walls.add(wallKey(2, i));
    // bottom-right L
    for (let i = W - 9; i <= W - 3; i++) walls.add(wallKey(i, H - 3));
    for (let i = H - 9; i <= H - 3; i++) walls.add(wallKey(W - 3, i));
    return;
  }

  if (mode === 'apartment') {
    // grid of rooms with narrow doorways
    // vertical dividers
    const vLines = [8, 15];
    for (const vx of vLines) {
      for (let y = 1; y < H - 1; y++) {
        // leave doorways
        if (y !== 6 && y !== 7 && y !== 16 && y !== 17) {
          walls.add(wallKey(vx, y));
        }
      }
    }
    // horizontal dividers
    const hLines = [8, 15];
    for (const hy of hLines) {
      for (let x = 1; x < W - 1; x++) {
        if (x !== 4 && x !== 5 && x !== 11 && x !== 12 && x !== 18 && x !== 19) {
          walls.add(wallKey(x, hy));
        }
      }
    }
    return;
  }

  if (mode === 'pillars') {
    // individual solid blocks / pillars in the center
    const pillars = [
      [6, 6], [6, 7], [7, 6], [7, 7],
      [16, 6], [16, 7], [17, 6], [17, 7],
      [6, 16], [6, 17], [7, 16], [7, 17],
      [16, 16], [16, 17], [17, 16], [17, 17],
      [11, 11], [12, 11], [11, 12], [12, 12],
      [4, 11], [5, 12],
      [18, 11], [19, 12],
      [11, 4], [12, 5],
      [11, 18], [12, 19]
    ];
    for (const [x, y] of pillars) {
      if (x >= 0 && x < W && y >= 0 && y < H) walls.add(wallKey(x, y));
    }
    return;
  }
}

// Keyboard fallback (WASD / arrows)
const keyMap = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
  W: 'UP', S: 'DOWN', A: 'LEFT', D: 'RIGHT'
};

document.addEventListener('keydown', (e) => {
  if (!isRunning || isGameOver) return;
  const dir = keyMap[e.key];
  if (!dir) return;

  // Prevent 180° reverse
  const opposite = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
  if (dir !== opposite[direction]) {
    nextDirection = dir;
  }
});

/* ---------- Relative turns (voice) ---------- */
function turnLeft() {
  const map = { RIGHT: 'UP', UP: 'LEFT', LEFT: 'DOWN', DOWN: 'RIGHT' };
  nextDirection = map[direction];
}

function turnRight() {
  const map = { RIGHT: 'DOWN', DOWN: 'LEFT', LEFT: 'UP', UP: 'RIGHT' };
  nextDirection = map[direction];
}

/* ---------- Voice → controls ---------- */
function processVoiceControls(timestamp) {
  if (!isAudioReady) return;

  const vol = getVolume();
  const pitch = getPitch();

  // Update meters
  const volEl = document.getElementById('vol-val');
  const pitchEl = document.getElementById('pitch-val');
  const actionEl = document.getElementById('action-val');
  const volBar = document.getElementById('vol-bar');
  const pitchBar = document.getElementById('pitch-bar');
  const speedInd = document.getElementById('speed-indicator');
  const statusEl = document.getElementById('status-text');

  if (volEl) volEl.textContent = vol.toFixed(2);
  if (volBar) volBar.style.width = Math.min(100, vol * 250) + '%';

  if (pitch > 0) {
    if (pitchEl) pitchEl.textContent = Math.round(pitch) + ' Hz';
    // Map 70-900 Hz roughly to bar width
    const pct = Math.min(100, Math.max(0, ((pitch - 70) / 830) * 100));
    if (pitchBar) pitchBar.style.width = pct + '%';
  } else {
    if (pitchEl) pitchEl.textContent = '--- Hz';
    if (pitchBar) pitchBar.style.width = '0%';
  }

  // Volume boost (scream) → 2× speed
  if (vol > 0.22) {
    currentSpeed = 65; // ~2.3× faster
    if (speedInd) {
      speedInd.textContent = '2×';
      speedInd.className = 'speed-boost';
    }
    if (statusEl) statusEl.textContent = 'BOOST';
  } else {
    currentSpeed = baseSpeed;
    if (speedInd) {
      speedInd.textContent = '1×';
      speedInd.className = 'speed-normal';
    }
    if (statusEl && statusEl.textContent === 'BOOST') statusEl.textContent = 'RUNNING';
  }

  // Turn detection
  // Low "mmm / hum" ~80–280 Hz = LEFT   (widened so real hums register)
  // High "eee / whistle" ~340+ Hz = RIGHT
  // Mid gap still ignored to reduce noise
  let zone = 'none';
  if (pitch >= 80 && pitch <= 280) zone = 'low';
  else if (pitch >= 340) zone = 'high';
  else if (pitch > 0) zone = 'mid';

  if (pitch <= 0) {
    if (actionEl) actionEl.textContent = 'SILENT';
    lastVoiceZone = 'none';
  } else {
    // Always update the status label so player can see the zone
    if (zone === 'low') {
      if (actionEl) actionEl.textContent = '← LEFT';
    } else if (zone === 'high') {
      if (actionEl) actionEl.textContent = 'RIGHT →';
    } else {
      if (actionEl) actionEl.textContent = 'CRUISING';
    }

    // Only actually turn when entering the zone + cooldown
    if (timestamp - lastTurnTime > 380) {
      if (zone === 'low' && lastVoiceZone !== 'low') {
        turnLeft();
        lastTurnTime = timestamp;
      } else if (zone === 'high' && lastVoiceZone !== 'high') {
        turnRight();
        lastTurnTime = timestamp;
      }
      lastVoiceZone = zone;
    }
  }
}

/* ---------- Game logic ---------- */
function spawnFood() {
  let valid = false;
  let attempts = 0;
  while (!valid && attempts < 500) {
    food = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS)
    };
    valid = !snake.some(s => s.x === food.x && s.y === food.y) && !isWall(food.x, food.y);
    attempts++;
  }
}

function resetGame() {
  // Apply difficulty + mode
  const sel = document.getElementById('opt-difficulty');
  if (sel) difficulty = sel.value;
  baseSpeed = DIFFICULTY_SPEEDS[difficulty] || 150;

  const modeSel = document.getElementById('opt-mode');
  if (modeSel) gameMode = modeSel.value || 'classic';
  buildWalls(gameMode);

  // Safe start position (avoid walls)
  let startX = 8, startY = 10;
  if (isWall(startX, startY) || isWall(startX - 1, startY) || isWall(startX - 2, startY)) {
    startX = 4; startY = 12;
  }
  if (isWall(startX, startY)) {
    startX = 3; startY = 3;
  }

  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY }
  ];
  direction = 'RIGHT';
  nextDirection = 'RIGHT';
  score = 0;
  lives = MAX_LIVES;
  currentSpeed = baseSpeed;
  isGameOver = false;
  lastTick = 0;
  lastTurnTime = 0;
  spawnFood();
  updateHud();
  updateLivesDisplay();
}

function updateSnake() {
  direction = nextDirection;
  const head = { ...snake[0] };

  if (direction === 'UP') head.y -= 1;
  else if (direction === 'DOWN') head.y += 1;
  else if (direction === 'LEFT') head.x -= 1;
  else if (direction === 'RIGHT') head.x += 1;

  // Always wrap around edges (like Classic).
  // Modes with border walls (e.g. Box) still kill you because those cells are walls.
  if (head.x < 0) head.x = COLS - 1;
  else if (head.x >= COLS) head.x = 0;
  if (head.y < 0) head.y = ROWS - 1;
  else if (head.y >= ROWS) head.y = 0;

  // Hit an obstacle wall → lose a life
  if (isWall(head.x, head.y)) {
    loseLife();
    return;
  }

  // Self collision
  for (const part of snake) {
    if (part.x === head.x && part.y === head.y) {
      loseLife();
      return;
    }
  }

  snake.unshift(head);

  // Eat food
  if (head.x === food.x && head.y === food.y) {
    score += 10;
    playEatSound();
    spawnFood();
    // slight speed up as you grow
    const minSpeed = difficulty === 'easy' ? 140 : difficulty === 'hard' ? 55 : 90;
    if (baseSpeed > minSpeed) baseSpeed -= 2;
  } else {
    snake.pop();
  }

  updateHud();
}

function updateHud() {
  const scoreEl = document.getElementById('score-val');
  const lenEl = document.getElementById('len-val');
  if (scoreEl) scoreEl.textContent = String(score).padStart(4, '0');
  if (lenEl) lenEl.textContent = String(snake.length).padStart(3, '0');
}

function updateLivesDisplay() {
  const hearts = document.querySelectorAll('#lives-row .heart');
  hearts.forEach((heart, i) => {
    if (i < lives) {
      heart.classList.add('full');
    } else {
      heart.classList.remove('full');
    }
  });
}

/* Respawn snake after losing a life (keep score, reset position & length) */
function respawnSnake() {
  let startX = 8, startY = 10;
  if (isWall(startX, startY) || isWall(startX - 1, startY) || isWall(startX - 2, startY)) {
    startX = 4; startY = 12;
  }
  if (isWall(startX, startY)) {
    startX = 3; startY = 3;
  }
  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY }
  ];
  direction = 'RIGHT';
  nextDirection = 'RIGHT';
  lastTurnTime = 0;
  spawnFood();
  updateHud();
}

function loseLife() {
  if (isGameOver) return;

  lives = Math.max(0, lives - 1);
  updateLivesDisplay();

  const statusEl = document.getElementById('status-text');
  if (lives > 0) {
    // Still have lives → normal crash sound + respawn
    playCrashSound();
    if (statusEl) statusEl.textContent = lives + ' LIFE' + (lives === 1 ? '' : 'S') + ' LEFT';
    respawnSnake();
    // short pause so player sees the crash
    isRunning = false;
    setTimeout(() => {
      if (!isGameOver && lives > 0) {
        if (statusEl) statusEl.textContent = 'READY';
        isRunning = true;
        requestAnimationFrame(gameLoop);
      }
    }, 900);
  } else {
    // No lives left → play crash2 (final sting / "bgm") then game over
    playFinalCrashSound();
    if (statusEl) statusEl.textContent = 'GAME OVER';
    gameOver();
  }
}

/* ---------- Rendering (Nokia green + pixel feel) ---------- */
function drawApple(px, py) {
  const cx = px + GRID / 2;
  const cy = py + GRID / 2 + 1;
  const r = GRID / 2 - 3;

  // Apple body (two overlapping circles for classic shape)
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(cx - 2, cy, r - 1, 0, Math.PI * 2);
  ctx.arc(cx + 2, cy, r - 1, 0, Math.PI * 2);
  ctx.fill();

  // Highlight / shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 3, 3, 0, Math.PI * 2);
  ctx.fill();

  // Stem
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 1);
  ctx.lineTo(cx + 1, cy - r - 3);
  ctx.stroke();

  // Leaf
  ctx.fillStyle = '#2ecc71';
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy - r - 1, 4, 2.5, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  // Background – classic Nokia dark green
  ctx.fillStyle = '#0f380f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle grid
  ctx.strokeStyle = 'rgba(48, 98, 48, 0.35)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * GRID, 0);
    ctx.lineTo(x * GRID, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * GRID);
    ctx.lineTo(canvas.width, y * GRID);
    ctx.stroke();
  }

  // Walls / obstacles (mode layouts) — yellow like the buttons
  if (walls.size > 0) {
    ctx.fillStyle = '#f0c040';
    walls.forEach(key => {
      const [wx, wy] = key.split(',').map(Number);
      ctx.fillRect(wx * GRID + 1, wy * GRID + 1, GRID - 2, GRID - 2);
    });
    // slightly darker inner for depth
    ctx.fillStyle = '#d4a820';
    walls.forEach(key => {
      const [wx, wy] = key.split(',').map(Number);
      ctx.fillRect(wx * GRID + 3, wy * GRID + 3, GRID - 6, GRID - 6);
    });
  }

  // Food – cute apple
  drawApple(food.x * GRID, food.y * GRID);

  // Snake
  const isBoost = currentSpeed < baseSpeed - 20;
  snake.forEach((part, i) => {
    if (i === 0) {
      // Head – slightly brighter + eyes
      ctx.fillStyle = isBoost ? '#ffb347' : '#9bbc0f';
      ctx.fillRect(part.x * GRID + 1, part.y * GRID + 1, GRID - 2, GRID - 2);

      // Eyes based on direction
      ctx.fillStyle = '#0f380f';
      const ex = part.x * GRID;
      const ey = part.y * GRID;
      if (direction === 'RIGHT') {
        ctx.fillRect(ex + 12, ey + 5, 3, 3);
        ctx.fillRect(ex + 12, ey + 12, 3, 3);
      } else if (direction === 'LEFT') {
        ctx.fillRect(ex + 5, ey + 5, 3, 3);
        ctx.fillRect(ex + 5, ey + 12, 3, 3);
      } else if (direction === 'UP') {
        ctx.fillRect(ex + 5, ey + 5, 3, 3);
        ctx.fillRect(ex + 12, ey + 5, 3, 3);
      } else {
        ctx.fillRect(ex + 5, ey + 12, 3, 3);
        ctx.fillRect(ex + 12, ey + 12, 3, 3);
      }
    } else {
      // Body – darker gradient feel
      const alpha = 1 - (i / snake.length) * 0.4;
      ctx.fillStyle = isBoost
        ? `rgba(255, 160, 50, ${alpha})`
        : `rgba(155, 188, 15, ${alpha})`;
      ctx.fillRect(part.x * GRID + 2, part.y * GRID + 2, GRID - 4, GRID - 4);
    }
  });
}

function gameOver() {
  if (isGameOver) return; // prevent double-fire
  isGameOver = true;
  isRunning = false;

  // Crash sound already played in loseLife(); only play if called directly
  // (kept for safety / future direct calls)

  document.getElementById('final-score').textContent = score;
  document.getElementById('final-len').textContent = snake.length;

  // brief delay so last frame is visible, then show board + leaderboard
  setTimeout(async () => {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('hidden');

    // Check for HIGH SCORE before (or while) submitting
    const banner = document.getElementById('highscore-banner');
    if (banner) banner.classList.add('hidden');

    let isHighScore = false;
    try {
      if (typeof fetchTopScores === 'function') {
        const { entries } = await fetchTopScores(1);
        const previousTop = (entries && entries[0]) ? entries[0].score : 0;
        if (score > 0 && score >= previousTop) {
          isHighScore = true;
        }
      } else {
        // local-only fallback
        isHighScore = score > 0;
      }
    } catch (e) {
      console.warn('High-score check failed', e);
      isHighScore = score > 0;
    }

    if (isHighScore && banner) {
      banner.classList.remove('hidden');
    }

    // Submit after we have the previous top
    saveScore(score);

    await renderLeaderboardInto('gameover-leaderboard');
  }, 600);
}

async function renderLeaderboardInto(containerId) {
  const list = document.getElementById(containerId);
  if (!list) return;
  list.innerHTML = '<p class="empty">Loading...</p>';

  if (typeof fetchTopScores !== 'function') {
    list.innerHTML = '<p class="empty">No scores yet</p>';
    return;
  }

  try {
    // small delay so submit can finish
    await new Promise((r) => setTimeout(r, 400));
    const { entries } = await fetchTopScores(10);
    if (!entries || entries.length === 0) {
      list.innerHTML = '<p class="empty">No scores yet. Be the first!</p>';
      return;
    }
    list.innerHTML = entries.map((s, i) =>
      `<div class="entry"><span><span class="rank">#${i + 1}</span>${s.name || 'PLAYER'}</span><span>${s.score} pts</span></div>`
    ).join('');
  } catch (err) {
    console.warn(err);
    list.innerHTML = '<p class="empty">Could not load scores</p>';
  }
}

/* ---------- Main loop ---------- */
function gameLoop(timestamp) {
  if (!isRunning || isGameOver) return;

  processVoiceControls(timestamp);

  if (timestamp - lastTick > currentSpeed) {
    updateSnake();
    lastTick = timestamp;
  }

  draw();
  requestAnimationFrame(gameLoop);
}

/* ---------- UI wiring ---------- */
function showScreen(id) {
  const screens = [
    'title-screen', 'name-screen', 'game-screen', 'gameover-screen',
    'howto-screen', 'options-screen', 'leaderboard-screen'
  ];
  screens.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');
}

/* Leaderboard helpers — uses teammate Supabase backend (leaderboard.js) */
function getPlayerName() {
  const input = document.getElementById('player-name');
  const name = (input?.value || '').trim().toUpperCase();
  return name || 'PLAYER';
}

function getModeLabel() {
  return (gameMode || 'classic') + '-' + (difficulty || 'medium');
}

function saveScore(score) {
  // Fire-and-forget; leaderboard.js handles Supabase + local fallback
  if (typeof submitScore === 'function') {
    submitScore(getPlayerName(), score, snake.length, getModeLabel())
      .then((res) => console.log('[LEADERBOARD] submit:', res))
      .catch((err) => console.warn('[LEADERBOARD] submit error:', err));
  }
}

async function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = '<p class="empty">Loading...</p>';

  if (typeof fetchTopScores !== 'function') {
    list.innerHTML = '<p class="empty">Leaderboard unavailable</p>';
    return;
  }

  try {
    const { entries, source } = await fetchTopScores(10);
    if (!entries || entries.length === 0) {
      list.innerHTML = '<p class="empty">No scores yet. Be the first!</p>';
      return;
    }
    list.innerHTML = entries.map((s, i) =>
      `<div class="entry"><span><span class="rank">#${i + 1}</span>${s.name || 'PLAYER'}</span><span>${s.score} pts</span></div>`
    ).join('');
    if (source) {
      list.insertAdjacentHTML('beforeend', `<p class="empty" style="margin-top:12px;font-size:12px">source: ${source}</p>`);
    }
  } catch (err) {
    console.warn(err);
    list.innerHTML = '<p class="empty">Could not load scores</p>';
  }
}

/* START on title → name screen */
document.getElementById('start-btn').addEventListener('click', () => {
  showScreen('name-screen');
  const input = document.getElementById('player-name');
  if (input) {
    input.focus();
    input.select?.();
  }
});

/* START GAME on name screen → actually begin */
document.getElementById('start-game-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('start-game-btn');
  if (btn) {
    btn.textContent = 'LOADING...';
    btn.disabled = true;
  }

  const ok = await initAudio();
  if (!ok) {
    const st = document.getElementById('status-text');
    if (st) st.textContent = 'KEYBOARD MODE';
  }

  // Unlock SFX on user gesture (needed for all modes)
  preloadSfx();
  try {
    if (eatAudio) {
      eatAudio.muted = true;
      eatAudio.play().then(() => {
        eatAudio.pause();
        eatAudio.currentTime = 0;
        eatAudio.muted = false;
      }).catch(() => {});
    }
    if (crashAudio) {
      crashAudio.muted = true;
      crashAudio.play().then(() => {
        crashAudio.pause();
        crashAudio.currentTime = 0;
        crashAudio.muted = false;
      }).catch(() => {});
    }
    if (crashAudio2) {
      crashAudio2.muted = true;
      crashAudio2.play().then(() => {
        crashAudio2.pause();
        crashAudio2.currentTime = 0;
        crashAudio2.muted = false;
      }).catch(() => {});
    }
    if (clickAudio) {
      clickAudio.muted = true;
      clickAudio.play().then(() => {
        clickAudio.pause();
        clickAudio.currentTime = 0;
        clickAudio.muted = false;
      }).catch(() => {});
    }
  } catch (e) {}

  resetGame();
  showScreen('game-screen');
  isRunning = true;
  requestAnimationFrame(gameLoop);

  if (btn) {
    btn.textContent = 'START GAME';
    btn.disabled = false;
  }
});

/* Enter key on name field */
document.getElementById('player-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('start-game-btn')?.click();
});

/* Menu navigation */
document.getElementById('howto-btn')?.addEventListener('click', () => showScreen('howto-screen'));
document.getElementById('options-btn')?.addEventListener('click', () => showScreen('options-screen'));
document.getElementById('leaderboard-btn')?.addEventListener('click', () => {
  renderLeaderboard();
  showScreen('leaderboard-screen');
});

document.getElementById('howto-back')?.addEventListener('click', () => showScreen('title-screen'));
document.getElementById('options-back')?.addEventListener('click', () => showScreen('title-screen'));
document.getElementById('leaderboard-back')?.addEventListener('click', () => showScreen('title-screen'));
document.getElementById('name-back-btn')?.addEventListener('click', () => showScreen('title-screen'));

/* Options toggles */
document.getElementById('opt-mic-btn')?.addEventListener('click', (e) => {
  toggleMic();
  e.target.textContent = micEnabled ? 'ON' : 'OFF';
});

document.getElementById('mute-btn')?.addEventListener('click', toggleMic);

function goHome() {
  isRunning = false;
  isGameOver = false;
  showScreen('title-screen');
}

document.getElementById('back-home-btn')?.addEventListener('click', goHome);
document.getElementById('go-home-btn')?.addEventListener('click', goHome);

document.getElementById('restart-btn')?.addEventListener('click', () => {
  resetGame();
  isRunning = true;
  requestAnimationFrame(gameLoop);
});

document.getElementById('play-again-btn')?.addEventListener('click', () => {
  resetGame();
  showScreen('game-screen');
  isRunning = true;
  requestAnimationFrame(gameLoop);
});

// Button click SFX for every button / select
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t) return;
  if (
    t.tagName === 'BUTTON' ||
    t.closest('button') ||
    t.tagName === 'SELECT' ||
    t.classList?.contains('pixel-btn') ||
    t.classList?.contains('os-btn')
  ) {
    playClickSound();
  }
});

// Initial draw on load
resetGame();
updateLivesDisplay();
draw();
