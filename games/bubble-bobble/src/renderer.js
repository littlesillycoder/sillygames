import { TILE, COLS, ROWS } from './level.js';
import { FRUIT_TYPES } from './enemy.js';

const CANVAS_W = COLS * TILE; // 208
const CANVAS_H = ROWS * TILE; // 416

export function drawLevel(ctx, map, color) {
  const light = lighten(color, 40);
  const dark  = darken(color, 40);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (map[r][c] === 1) {
        const x = c * TILE;
        const y = r * TILE;
        // Fill
        ctx.fillStyle = color;
        roundRect(ctx, x + 1, y + 1, TILE - 2, TILE - 2, 2);
        ctx.fill();
        // Light edge (top-left)
        ctx.strokeStyle = light;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + TILE - 2);
        ctx.lineTo(x + 2, y + 2);
        ctx.lineTo(x + TILE - 2, y + 2);
        ctx.stroke();
        // Dark edge (bottom-right)
        ctx.strokeStyle = dark;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + TILE - 2);
        ctx.lineTo(x + TILE - 2, y + TILE - 2);
        ctx.lineTo(x + TILE - 2, y + 2);
        ctx.stroke();
      }
    }
  }
}

export function drawPlayer(ctx, player) {
  if (player.dead) return;
  if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2 === 0) return;

  const x = player.x;
  const y = player.y - 9;

  ctx.save();
  if (!player.facingRight) {
    ctx.translate(x * 2, 0);
    ctx.scale(-1, 1);
  }

  // Body ellipse
  ctx.fillStyle = '#4ecdc4';
  ctx.beginPath();
  ctx.ellipse(x, y, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(x + 4, y - 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(x + 5, y - 2, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  ctx.strokeStyle = '#2a8a84';
  ctx.lineWidth = 1.5;
  if (player.shooting) {
    // Open mouth (circle)
    ctx.fillStyle = '#2a8a84';
    ctx.beginPath();
    ctx.arc(x + 7, y + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(x + 6, y + 1, 3, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  // Feet
  ctx.fillStyle = '#3ab8b0';
  ctx.beginPath();
  ctx.ellipse(x - 3, y + 9, 4, 3, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 9, 4, 3, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawBubble(ctx, bubble) {
  const x = bubble.x;
  const y = bubble.y;
  const r = bubble.radius + (bubble.captured ? 3 : 0);
  const wobble = Math.sin(bubble.wobble) * 1.5;

  ctx.save();
  ctx.globalAlpha = 0.85;

  // Bubble fill
  ctx.fillStyle = 'rgba(100,200,255,0.4)';
  ctx.beginPath();
  ctx.arc(x, y, r + wobble, 0, Math.PI * 2);
  ctx.fill();

  // Bubble outline
  ctx.strokeStyle = 'rgba(60,160,220,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.35, r * 0.25, r * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawEnemy(ctx, enemy) {
  if (enemy.dead) return;
  const x = enemy.x;
  const y = enemy.y - 9;
  const wobble = enemy.captured ? Math.sin(enemy.wobbleTimer * 0.3) * 3 : 0;

  if (enemy.captured) return; // drawn inside bubble

  ctx.save();

  // Body
  ctx.fillStyle = enemy.angry ? '#cc0000' : '#ff6b6b';
  ctx.beginPath();
  ctx.arc(x + wobble, y, 9, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  if (enemy.angry) {
    // Squinted eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.ellipse(x + wobble - 3, y - 2, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + wobble + 3, y - 2, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(x + wobble - 3, y - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + wobble + 3, y - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Angry brow
    ctx.strokeStyle = '#880000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + wobble - 5, y - 5);
    ctx.lineTo(x + wobble - 1, y - 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + wobble + 5, y - 5);
    ctx.lineTo(x + wobble + 1, y - 3);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x + wobble - 3, y - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + wobble + 3, y - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(x + wobble - 3, y - 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + wobble + 3, y - 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Feet
  ctx.fillStyle = enemy.angry ? '#aa0000' : '#e05050';
  ctx.beginPath();
  ctx.ellipse(x + wobble - 4, y + 9, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + wobble + 4, y + 9, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawEnemyInBubble(ctx, enemy, bubble) {
  const x = bubble.x;
  const y = bubble.y;
  // Draw mini enemy inside
  ctx.save();
  ctx.globalAlpha = 0.85;
  const wobble = Math.sin(enemy.wobbleTimer * 0.3) * 2;
  ctx.fillStyle = enemy.angry ? '#cc0000' : '#ff6b6b';
  ctx.beginPath();
  ctx.arc(x + wobble, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(x + wobble - 2, y - 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + wobble + 2, y - 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawFruit(ctx, fruit) {
  const x = fruit.x;
  const y = fruit.y;
  const type = FRUIT_TYPES[fruit.type % FRUIT_TYPES.length];
  const alpha = fruit.timer < 60 ? fruit.timer / 60 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (type === 'banana') {
    ctx.strokeStyle = '#f5c518';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y + 2, 7, Math.PI * 1.1, Math.PI * 0.1, true);
    ctx.stroke();
  } else if (type === 'strawberry') {
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.bezierCurveTo(x + 8, y - 8, x + 8, y + 4, x, y + 8);
    ctx.bezierCurveTo(x - 8, y + 4, x - 8, y - 8, x, y - 8);
    ctx.fill();
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x - 4, y - 12);
    ctx.lineTo(x, y - 10);
    ctx.lineTo(x + 4, y - 12);
    ctx.lineTo(x, y - 8);
    ctx.fill();
  } else if (type === 'pineapple') {
    ctx.fillStyle = '#f1c40f';
    roundRect(ctx, x - 5, y - 6, 10, 14, 2);
    ctx.fill();
    ctx.fillStyle = '#27ae60';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 2, y - 6);
      ctx.lineTo(x + i * 2 - 2, y - 12);
      ctx.lineTo(x + i * 2 + 2, y - 12);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // cherry
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(x - 4, y + 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 4, y + 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#27ae60';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 2);
    ctx.quadraticCurveTo(x, y - 10, x + 4, y - 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawHUD(ctx, gs) {
  const W = CANVAS_W;
  // Top HUD bar
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, 0); // HUD is above canvas in DOM

  // Bottom lives
  const livesY = CANVAS_H - 6;
  for (let i = 0; i < gs.lives; i++) {
    drawMiniPlayer(ctx, 14 + i * 18, livesY);
  }
}

function drawMiniPlayer(ctx, x, y) {
  ctx.fillStyle = '#4ecdc4';
  ctx.beginPath();
  ctx.ellipse(x, y, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawTitle(ctx, gs, frame) {
  const W = CANVAS_W;
  const H = CANVAS_H;

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Stars
  ctx.fillStyle = 'white';
  for (let i = 0; i < 30; i++) {
    const sx = ((i * 73 + 11) % W);
    const sy = ((i * 47 + 7) % H);
    ctx.fillRect(sx, sy, 1, 1);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c518';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('BUBBLE', W / 2, H / 2 - 30);
  ctx.fillStyle = '#4ecdc4';
  ctx.fillText('BOBBLE', W / 2, H / 2 - 6);

  if (Math.floor(frame / 30) % 2 === 0) {
    ctx.fillStyle = 'white';
    ctx.font = '9px monospace';
    ctx.fillText('Press ENTER to Start', W / 2, H / 2 + 24);
  }

  ctx.fillStyle = '#aaa';
  ctx.font = '8px monospace';
  ctx.fillText('← → Move   ↑/Z Jump   X/Space Shoot', W / 2, H / 2 + 50);
}

export function drawLevelClear(ctx, gs) {
  const W = CANVAS_W;
  const H = CANVAS_H;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c518';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('LEVEL CLEAR!', W / 2, H / 2 - 10);
  ctx.fillStyle = 'white';
  ctx.font = '10px monospace';
  ctx.fillText(`Score: ${String(gs.score).padStart(6, '0')}`, W / 2, H / 2 + 14);
}

export function drawGameOver(ctx, gs, frame) {
  const W = CANVAS_W;
  const H = CANVAS_H;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('GAME OVER', W / 2, H / 2 - 20);
  ctx.fillStyle = 'white';
  ctx.font = '10px monospace';
  ctx.fillText(`Final Score: ${String(gs.score).padStart(6, '0')}`, W / 2, H / 2 + 4);
  if (Math.floor(frame / 30) % 2 === 0) {
    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    ctx.fillText('Press ENTER to Restart', W / 2, H / 2 + 26);
  }
}

// Helpers
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function lighten(hex, amt) {
  return adjustColor(hex, amt);
}
function darken(hex, amt) {
  return adjustColor(hex, -amt);
}
function adjustColor(hex, amt) {
  let c = parseInt(hex.replace('#',''), 16);
  let r = Math.min(255, Math.max(0, (c >> 16) + amt));
  let g = Math.min(255, Math.max(0, ((c >> 8) & 0xff) + amt));
  let b = Math.min(255, Math.max(0, (c & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}
