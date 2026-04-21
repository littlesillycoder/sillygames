import { TILE, COLS, ROWS, isSolid } from './level.js';

const BUBBLE_SPEED = 6;
const FLOAT_SPEED = 0.6;
const BUBBLE_RADIUS = 9;
const CAPTURE_RADIUS = 12;
const LIFETIME = 480; // 8 seconds at 60fps

export class Bubble {
  constructor(x, y, goRight) {
    this.x = x;
    this.y = y;
    this.vx = goRight ? BUBBLE_SPEED : -BUBBLE_SPEED;
    this.vy = 0;
    this.floating = false;
    this.lifetime = LIFETIME;
    this.captured = null; // enemy reference
    this.dead = false;
    this.radius = BUBBLE_RADIUS;
    this.wobble = 0;
  }

  update(map) {
    if (this.dead) return;

    this.lifetime--;
    if (this.lifetime <= 0) { this.dead = true; return; }

    this.wobble += 0.15;

    if (this.captured) {
      // If the enemy escaped on its own, free the bubble
      if (!this.captured.captured) {
        this.captured = null;
        this.floating = true;
        return;
      }
      // Float upward with enemy inside
      this.vy = -FLOAT_SPEED * 0.7;
      this.x += this.vx * 0.05;
      this.y += this.vy;
      // Wrap X
      const w = COLS * TILE;
      if (this.x < 0) this.x += w;
      if (this.x >= w) this.x -= w;
      // Clamp Y
      if (this.y < TILE + this.radius) {
        this.y = TILE + this.radius;
        this.vy = 0;
      }
      // Sync enemy position
      this.captured.x = this.x;
      this.captured.y = this.y;
      return;
    }

    if (this.floating) {
      // Slowly float up
      this.vy = -FLOAT_SPEED;
      this.vx *= 0.95;
    } else {
      // Travel horizontally
      this.vx += 0; // constant
    }

    this.x += this.vx;
    this.y += this.vy;

    // Wrap X
    const w = COLS * TILE;
    if (this.x < 0) this.x += w;
    if (this.x >= w) this.x -= w;

    // Clamp Y
    if (this.y < TILE + this.radius) {
      this.y = TILE + this.radius;
      this.dead = true;
      return;
    }
    if (this.y > (ROWS - 1) * TILE) {
      this.y = (ROWS - 1) * TILE;
      this.floating = true;
    }

    // Wall collision → start floating
    if (!this.floating) {
      const col = Math.floor(this.x / TILE);
      const row = Math.floor(this.y / TILE);
      if (isSolid(map, col, row)) {
        this.floating = true;
        this.vx = 0;
      }
    }
  }

  // Check if player can pop it (jump on top)
  isPlayerOnTop(player) {
    const dx = this.x - player.x;
    const dy = this.y - player.bottom;
    return Math.abs(dx) < this.radius + 8 && Math.abs(dy) < this.radius + 4 && player.vy >= 0;
  }

  pop() {
    this.dead = true;
  }
}
