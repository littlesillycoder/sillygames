import { gameState } from './gameState.js';
import { getLevel, getLevelColor, TILE, COLS, ROWS } from './level.js';
import { Player } from './player.js';
import { Bubble } from './bubble.js';
import { Enemy, Fruit } from './enemy.js';
import { wasPressed } from './input.js';
import { audio } from './audio.js';
import {
  drawLevel, drawPlayer, drawBubble, drawEnemy, drawEnemyInBubble,
  drawFruit, drawHUD, drawTitle, drawLevelClear, drawGameOver
} from './renderer.js';

const CANVAS_W = COLS * TILE;
const CANVAS_H = ROWS * TILE;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Outer HUD canvas (score/lives above and below game)
const hudCanvas = document.getElementById('hud');
const hudCtx = hudCanvas.getContext('2d');

let player, bubbles, enemies, fruits, map, levelColor;
let frame = 0;
let levelClearDelay = 0;

function spawnEnemies() {
  enemies = [];
  const count = [0, 4, 6, 8][Math.min(gameState.level, 3)];
  const spawnX = [TILE * 3, TILE * 5, TILE * 7, TILE * 9, TILE * 4, TILE * 8, TILE * 2, TILE * 10];
  for (let i = 0; i < count; i++) {
    const x = spawnX[i % spawnX.length];
    enemies.push(new Enemy(x, TILE * 3, i));
  }
}

function initLevel() {
  map = getLevel(gameState.level);
  levelColor = getLevelColor(gameState.level);
  bubbles = [];
  fruits = [];
  player = new Player(CANVAS_W / 2, CANVAS_H - TILE * 2);
  spawnEnemies();
  levelClearDelay = 0;
}

function onShoot(x, y, goRight) {
  if (bubbles.filter(b => !b.captured).length < 5) {
    bubbles.push(new Bubble(x, y, goRight));
  }
}

function update() {
  frame++;

  if (gameState.state === 'title') {
    if (wasPressed('enter')) {
      gameState.reset();
      gameState.state = 'playing';
      initLevel();
    }
    return;
  }

  if (gameState.state === 'gameOver') {
    if (wasPressed('enter')) {
      gameState.reset();
      gameState.state = 'playing';
      initLevel();
    }
    return;
  }

  if (gameState.state === 'levelClear') {
    levelClearDelay--;
    if (levelClearDelay <= 0) {
      gameState.nextLevel();
      initLevel();
    }
    return;
  }

  // --- Playing ---

  // Player update
  player.update(map, bubbles, onShoot);

  // Respawn if dead
  if (player.dead && player.respawnTimer <= 0) {
    player.respawn(CANVAS_W / 2, CANVAS_H - TILE * 2);
  }

  // Bubble updates
  for (const b of bubbles) {
    b.update(map);
  }

  // Enemy updates
  for (const e of enemies) {
    if (!e.dead) e.update(map, player);
  }

  // Fruit updates
  for (const f of fruits) {
    f.update();
  }

  // --- Collision: bubble vs enemy ---
  for (const b of bubbles) {
    if (b.dead || b.captured) continue;
    for (const e of enemies) {
      if (e.dead || e.captured) continue;
      const dx = Math.abs(b.x - e.x);
      const dy = Math.abs(b.y - (e.y - 9));
      if (dx < b.radius + 9 && dy < b.radius + 9) {
        e.capture();
        b.captured = e;
        b.floating = true;
        b.vx *= 0.1;
        break;
      }
    }
  }

  // --- Collision: player vs captured bubble (pop) ---
  if (!player.dead) {
    for (const b of bubbles) {
      if (b.dead || !b.captured) continue;
      if (b.isPlayerOnTop(player)) {
        const e = b.captured;
        b.pop();
        audio.bubblePop();
        e.dead = true;
        // Spawn fruit
        const fruitType = Math.floor(Math.random() * 4);
        fruits.push(new Fruit(b.x, b.y, fruitType));
        gameState.addScore(100);
      }
    }
  }

  // --- Collision: player vs uncaptured enemy ---
  if (!player.dead && player.invincible === 0) {
    for (const e of enemies) {
      if (e.touchesPlayer(player)) {
        const died = player.die();
        if (died) gameState.loseLife();
        break;
      }
    }
  }

  // --- Collision: player vs fruit ---
  if (!player.dead) {
    for (const f of fruits) {
      if (f.dead) continue;
      if (f.touchesPlayer(player)) {
        gameState.addScore(f.score);
        audio.collectFruit();
        f.dead = true;
      }
    }
  }

  // Clean up dead objects
  bubbles = bubbles.filter(b => !b.dead);
  fruits  = fruits.filter(f => !f.dead);
  enemies = enemies.filter(e => !e.dead);

  // Check level clear
  const aliveEnemies = enemies.filter(e => !e.dead);
  if (aliveEnemies.length === 0 && gameState.state === 'playing') {
    gameState.state = 'levelClear';
    levelClearDelay = 120; // 2 seconds
    audio.levelClear();
  }

  if (gameState.state === 'gameOver') {
    // handled next frame
  }
}

function renderHUD() {
  const W = hudCanvas.width;
  hudCtx.fillStyle = '#0d0d1a';
  hudCtx.fillRect(0, 0, W, hudCanvas.height);

  hudCtx.textAlign = 'left';
  hudCtx.font = 'bold 10px monospace';
  hudCtx.fillStyle = '#aaa';
  hudCtx.fillText('1UP', 4, 12);
  hudCtx.fillStyle = 'white';
  hudCtx.fillText(String(gameState.score).padStart(6, '0'), 4, 24);

  hudCtx.textAlign = 'center';
  hudCtx.fillStyle = '#aaa';
  hudCtx.fillText('HI', W / 2, 12);
  hudCtx.fillStyle = '#f5c518';
  hudCtx.fillText(String(gameState.hiScore).padStart(6, '0'), W / 2, 24);

  hudCtx.textAlign = 'right';
  hudCtx.fillStyle = '#aaa';
  hudCtx.fillText('LV', W - 4, 12);
  hudCtx.fillStyle = 'white';
  hudCtx.fillText(String(gameState.level).padStart(2, '0'), W - 4, 24);

  // Lives at bottom
  const livesCanvas = document.getElementById('lives');
  const livesCtx = livesCanvas.getContext('2d');
  livesCtx.fillStyle = '#0d0d1a';
  livesCtx.fillRect(0, 0, livesCanvas.width, livesCanvas.height);
  livesCtx.fillStyle = '#4ecdc4';
  for (let i = 0; i < gameState.lives; i++) {
    livesCtx.beginPath();
    livesCtx.ellipse(12 + i * 20, 10, 6, 5, 0, 0, Math.PI * 2);
    livesCtx.fill();
  }
}

function render() {
  // Clear
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (gameState.state === 'title') {
    drawTitle(ctx, gameState, frame);
    renderHUD();
    return;
  }

  // Draw level
  drawLevel(ctx, map, levelColor);

  // Draw fruits
  for (const f of fruits) drawFruit(ctx, f);

  // Draw bubbles (and enemies inside)
  for (const b of bubbles) {
    drawBubble(ctx, b);
    if (b.captured) drawEnemyInBubble(ctx, b.captured, b);
  }

  // Draw free enemies
  for (const e of enemies) {
    if (!e.captured) drawEnemy(ctx, e);
  }

  // Draw player
  drawPlayer(ctx, player);

  // Overlays
  if (gameState.state === 'levelClear') drawLevelClear(ctx, gameState);
  if (gameState.state === 'gameOver')   drawGameOver(ctx, gameState, frame);

  renderHUD();
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

// Init title screen
gameState.state = 'title';
map = getLevel(1);
levelColor = getLevelColor(1);
bubbles = [];
fruits = [];
enemies = [];
player = new Player(CANVAS_W / 2, CANVAS_H - TILE * 2);

loop();
