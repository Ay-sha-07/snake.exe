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
let isGameOver = false;
let isRunning = false;
let lastTurnTime = 0;
let lastVoiceZone = 'none'; // only turn when entering low/high zone
let useKeyboard = true;        // fallback if mic fails
let difficulty = 'medium';

const DIFFICULTY_SPEEDS = {
  easy: 200,
  medium: 150,
  hard: 90
};

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

  // No speed boost — keep steady speed (user requested)
  currentSpeed = baseSpeed;
  if (speedInd) {
    speedInd.textContent = '1×';
    speedInd.className = 'speed-normal';
  }
  if (statusEl && (statusEl.textContent === 'BOOST' || statusEl.textContent === '')) {
    statusEl.textContent = 'RUNNING';
  }

  // Turn detection — less sensitive to reduce false triggers
  // Low "mmm / hum" ~100–220 Hz = LEFT
  // High "eee / whistle" ~380+ Hz = RIGHT
  // Big mid gap + higher volume floor + longer cooldown
  let zone = 'none';
  if (pitch >= 100 && pitch <= 220) zone = 'low';
  else if (pitch >= 380) zone = 'high';
  else if (pitch > 0) zone = 'mid';

  if (pitch <= 0) {
    if (actionEl) actionEl.textContent = 'SILENT';
    lastVoiceZone = 'none';
  } else if (timestamp - lastTurnTime > 420) {   // was 280 → slower reaction, fewer false turns
    if (zone === 'low' && lastVoiceZone !== 'low') {
      turnLeft();
      if (actionEl) actionEl.textContent = '← LEFT';
      lastTurnTime = timestamp;
    } else if (zone === 'high' && lastVoiceZone !== 'high') {
      turnRight();
      if (actionEl) actionEl.textContent = 'RIGHT →';
      lastTurnTime = timestamp;
    } else if (zone === 'mid') {
      if (actionEl) actionEl.textContent = 'CRUISING';
    }
    lastVoiceZone = zone;
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
  // Apply difficulty speed
  const sel = document.getElementById('opt-difficulty');
  if (sel) difficulty = sel.value;
  baseSpeed = DIFFICULTY_SPEEDS[difficulty] || 150;

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

  // Wraparound walls — exit one side, appear on the opposite side
  if (head.x < 0) head.x = COLS - 1;
  else if (head.x >= COLS) head.x = 0;
  if (head.y < 0) head.y = ROWS - 1;
  else if (head.y >= ROWS) head.y = 0;

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

  // Submit score (Supabase + local fallback)
  saveScore(score);

  document.getElementById('final-score').textContent = score;
  document.getElementById('final-len').textContent = snake.length;

  // brief delay so last frame is visible, then show board + leaderboard
  setTimeout(async () => {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('hidden');
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
  return difficulty || 'medium';
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

// Initial draw on load
resetGame();
draw();
