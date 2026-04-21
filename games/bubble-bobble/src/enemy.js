import { TILE, COLS, ROWS, isSolid } from './level.js';
import { audio } from './audio.js';

const GRAVITY = 0.4;
const MAX_FALL = 8;
const NORMAL_SPEED = 1.5;
const CHASE_SPEED = 2.5;
const ANGRY_SPEED = 3.0;
const JUMP_VEL = -9;
const ESCAPE_TIME = 300; // 5 seconds at 60fps
const ENEMY_W = 18;
const ENEMY_H = 18;

export const FRUIT_SCORES = [100, 200, 500, 1000];
export const FRUIT_TYPES = ['banana', 'strawberry', 'pineapple', 'cherry'];

export class Enemy {
  constructor(x, y, id) {
    this.x = x;
    this.y = y;
    this.vx = (id % 2 === 0) ? NORMAL_SPEED : -NORMAL_SPEED;
    this.vy = 0;
    this.onGround = false;
    this.facingRight = this.vx > 0;
    this.captured = false;
    this.captureTimer = 0;
    this.angry = false;
    this.dead = false;
    this.jumpTimer = Math.floor(Math.random() * 120);
    this.id = id;
    this.wobbleDir = 1;
    this.wobbleTimer = 0;
  }

  get left()   { return this.x - ENEMY_W / 2; }
  get right()  { return this.x + ENEMY_W / 2; }
  get top()    { return this.y - ENEMY_H; }
  get bottom() { return this.y; }

  update(map, player) {
    if (this.dead) return;
    if (this.captured) {
      this.captureTimer++;
      // Struggle inside bubble
      this.wobbleTimer++;
      if (this.wobbleTimer % 20 === 0) this.wobbleDir *= -1;

      if (this.captureTimer >= ESCAPE_TIME) {
        this.escape();
      }
      return;
    }

    // Determine speed
    const dx = player.x - this.x;
    const dist = Math.abs(dx);
    let speed = this.angry ? ANGRY_SPEED : NORMAL_SPEED;
    if (dist < 80 && !this.angry) speed = CHASE_SPEED;

    this.vx = this.facingRight ? speed : -speed;

    // Jump timer
    this.jumpTimer--;
    if (this.jumpTimer <= 0) {
      this.jumpTimer = 80 + Math.floor(Math.random() * 120);
      if (this.onGround) {
        this.vy = JUMP_VEL;
        this.onGround = false;
      }
    }

    // Gravity
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);

    // Move X
    this.x += this.vx;
    // Wrap X
    const w = COLS * TILE;
    if (this.x < 0) this.x += w;
    if (this.x >= w) this.x -= w;

    // Resolve X collisions (turn around)
    const rowMid = Math.floor((this.y - ENEMY_H / 2) / TILE);
    const colL = Math.floor(this.left / TILE);
    const colR = Math.floor((this.right - 1) / TILE);
    if (isSolid(map, colL, rowMid)) {
      this.x = (colL + 1) * TILE + ENEMY_W / 2;
      this.facingRight = true;
    } else if (isSolid(map, colR, rowMid)) {
      this.x = colR * TILE - ENEMY_W / 2;
      this.facingRight = false;
    }

    // Move Y
    this.y += this.vy;
    this.onGround = false;

    if (this.vy >= 0) {
      const row = Math.floor(this.bottom / TILE);
      const c1 = Math.floor(this.left / TILE);
      const c2 = Math.floor((this.right - 1) / TILE);
      let hit = false;
      for (let c = c1; c <= c2; c++) {
        if (isSolid(map, c, row)) { hit = true; break; }
      }
      if (hit) {
        this.y = row * TILE;
        this.vy = 0;
        this.onGround = true;
      }
    } else {
      const row = Math.floor(this.top / TILE);
      const c1 = Math.floor(this.left / TILE);
      const c2 = Math.floor((this.right - 1) / TILE);
      for (let c = c1; c <= c2; c++) {
        if (isSolid(map, c, row)) {
          this.y = (row + 1) * TILE + ENEMY_H;
          this.vy = 0;
          break;
        }
      }
    }

    // Clamp
    if (this.bottom > ROWS * TILE) { this.y = ROWS * TILE; this.vy = 0; this.onGround = true; }
    if (this.top < 0) { this.y = ENEMY_H; this.vy = 0; }
  }

  capture() {
    this.captured = true;
    this.captureTimer = 0;
    this.vy = 0;
    this.vx = 0;
    audio.enemyCaptured();
  }

  escape() {
    this.captured = false;
    this.captureTimer = 0;
    this.angry = true;
    this.facingRight = Math.random() > 0.5;
  }

  touchesPlayer(player) {
    if (this.captured || this.dead) return false;
    const dx = Math.abs(this.x - player.x);
    const dy = Math.abs(this.y - (player.y - 9));
    return dx < 16 && dy < 16;
  }
}

export class Fruit {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type; // index into FRUIT_TYPES
    this.timer = 180; // 3 seconds
    this.dead = false;
    this.score = FRUIT_SCORES[type % FRUIT_SCORES.length];
  }

  update() {
    this.timer--;
    if (this.timer <= 0) this.dead = true;
  }

  touchesPlayer(player) {
    const dx = Math.abs(this.x - player.x);
    const dy = Math.abs(this.y - player.y);
    return dx < 18 && dy < 18;
  }
}
