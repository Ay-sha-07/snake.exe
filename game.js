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
let baseSpeed = 150;           // ms per tick
let currentSpeed = baseSpeed;
let lastTick = 0;
let score = 0;
let isGameOver = false;
let isRunning = false;
let lastTurnTime = 0;
let useKeyboard = true;        // fallback if mic fails

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

  // Volume boost (scream)
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

  // Turn detection with debounce
  if (timestamp - lastTurnTime > 280 && pitch > 0) {
    if (pitch >= 90 && pitch <= 250) {
      turnLeft();
      if (actionEl) actionEl.textContent = '← LEFT';
      lastTurnTime = timestamp;
    } else if (pitch >= 360) {
      turnRight();
      if (actionEl) actionEl.textContent = 'RIGHT →';
      lastTurnTime = timestamp;
    } else {
      if (actionEl) actionEl.textContent = 'CRUISING';
    }
  } else if (pitch <= 0) {
    if (actionEl) actionEl.textContent = 'SILENT';
  }
}

/* ---------- Game logic ---------- */
function spawnFood() {
  let valid = false;
  while (!valid) {
    food = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS)
    };
    valid = !snake.some(s => s.x === food.x && s.y === food.y);
  }
}

function resetGame() {
  snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 }
  ];
  direction = 'RIGHT';
  nextDirection = 'RIGHT';
  score = 0;
  currentSpeed = baseSpeed;
  isGameOver = false;
  lastTick = 0;
  lastTurnTime = 0;
  spawnFood();
  updateHud();
}

function updateSnake() {
  direction = nextDirection;
  const head = { ...snake[0] };

  if (direction === 'UP') head.y -= 1;
  else if (direction === 'DOWN') head.y += 1;
  else if (direction === 'LEFT') head.x -= 1;
  else if (direction === 'RIGHT') head.x += 1;

  // Wall collision
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
    gameOver();
    return;
  }

  // Self collision
  for (const part of snake) {
    if (part.x === head.x && part.y === head.y) {
      gameOver();
      return;
    }
  }

  snake.unshift(head);

  // Eat food
  if (head.x === food.x && head.y === food.y) {
    score += 10;
    spawnFood();
    // slight speed up as you grow
    if (baseSpeed > 90) baseSpeed -= 2;
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

/* ---------- Rendering (Nokia green + pixel feel) ---------- */
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

  // Food – bright pixel
  ctx.fillStyle = '#9bbc0f';
  ctx.fillRect(food.x * GRID + 2, food.y * GRID + 2, GRID - 4, GRID - 4);
  // little sparkle
  ctx.fillStyle = '#c4e038';
  ctx.fillRect(food.x * GRID + 5, food.y * GRID + 5, 4, 4);

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
  isGameOver = true;
  isRunning = false;

  document.getElementById('final-score').textContent = score;
  document.getElementById('final-len').textContent = snake.length;

  // brief delay so last frame is visible
  setTimeout(() => {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('hidden');
  }, 600);
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
  ['title-screen', 'game-screen', 'gameover-screen'].forEach(s => {
    document.getElementById(s).classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
}

document.getElementById('start-btn').addEventListener('click', async () => {
  const btn = document.getElementById('start-btn');
  btn.textContent = 'LOADING...';
  btn.disabled = true;

  const ok = await initAudio();
  if (!ok) {
    // still allow keyboard play
    document.getElementById('status-text').textContent = 'KEYBOARD MODE';
  }

  resetGame();
  showScreen('game-screen');
  isRunning = true;
  requestAnimationFrame(gameLoop);
});

document.getElementById('mute-btn').addEventListener('click', toggleMic);

document.getElementById('restart-btn')?.addEventListener('click', () => {
  resetGame();
  isRunning = true;
  requestAnimationFrame(gameLoop);
});

document.getElementById('play-again-btn').addEventListener('click', () => {
  resetGame();
  showScreen('game-screen');
  isRunning = true;
  requestAnimationFrame(gameLoop);
});

// Initial draw on load (nice static board)
resetGame();
draw();
