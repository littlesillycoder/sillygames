import { TILE, COLS, ROWS, isSolid } from './level.js';
import { keys, wasPressed } from './input.js';
import { audio } from './audio.js';

const GRAVITY = 0.4;
const MAX_FALL = 8;
const MOVE_SPEED = 3;
const JUMP_VEL = -10;
const PLAYER_W = 20;
const PLAYER_H = 18;
const INVINCIBLE_DURATION = 120; // frames

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facingRight = true;
    this.shooting = false;
    this.shootCooldown = 0;
    this.invincible = 0;
    this.dead = false;
    this.respawnTimer = 0;
    this.alive = true;
  }

  get left()   { return this.x - PLAYER_W / 2; }
  get right()  { return this.x + PLAYER_W / 2; }
  get top()    { return this.y - PLAYER_H; }
  get bottom() { return this.y; }

  update(map, bubbles, onShoot) {
    if (this.dead) {
      this.respawnTimer--;
      if (this.respawnTimer <= 0) this.dead = false;
      return;
    }

    if (this.invincible > 0) this.invincible--;
    if (this.shootCooldown > 0) this.shootCooldown--;

    // Horizontal
    this.vx = 0;
    if (keys.left)  { this.vx = -MOVE_SPEED; this.facingRight = false; }
    if (keys.right) { this.vx =  MOVE_SPEED; this.facingRight = true; }

    // Jump
    if (wasPressed('jump') && this.onGround) {
      this.vy = JUMP_VEL;
      this.onGround = false;
      audio.jump();
    }

    // Shoot
    this.shooting = false;
    if (wasPressed('shoot') && this.shootCooldown === 0) {
      this.shooting = true;
      this.shootCooldown = 20;
      audio.shoot();
      onShoot(this.x, this.y - PLAYER_H / 2, this.facingRight);
    }

    // Gravity
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);

    // Move X with wrap
    this.x += this.vx;
    const canvasW = COLS * TILE;
    if (this.x < 0) this.x += canvasW;
    if (this.x >= canvasW) this.x -= canvasW;

    // Collide X with walls
    this._resolveX(map);

    // Move Y
    this.y += this.vy;
    this.onGround = false;
    this._resolveY(map);
  }

  _resolveX(map) {
    const row1 = Math.floor(this.top / TILE);
    const row2 = Math.floor((this.bottom - 1) / TILE);
    for (let r = row1; r <= row2; r++) {
      const colL = Math.floor(this.left / TILE);
      const colR = Math.floor((this.right - 1) / TILE);
      if (isSolid(map, colL, r)) {
        this.x = (colL + 1) * TILE + PLAYER_W / 2;
      } else if (isSolid(map, colR, r)) {
        this.x = colR * TILE - PLAYER_W / 2;
      }
    }
  }

  _resolveY(map) {
    const col1 = Math.floor(this.left / TILE);
    const col2 = Math.floor((this.right - 1) / TILE);

    if (this.vy >= 0) {
      // Falling — check tile below feet
      const row = Math.floor(this.bottom / TILE);
      if (row < ROWS) {
        let hit = false;
        for (let c = col1; c <= col2 && !hit; c++) {
          if (isSolid(map, c, row)) hit = true;
        }
        if (hit) {
          this.y = row * TILE;
          this.vy = 0;
          this.onGround = true;
        }
      }
    } else {
      // Rising — check tile at head
      const row = Math.floor(this.top / TILE);
      if (row >= 0) {
        let hit = false;
        for (let c = col1; c <= col2 && !hit; c++) {
          if (isSolid(map, c, row)) hit = true;
        }
        if (hit) {
          this.y = (row + 1) * TILE + PLAYER_H;
          this.vy = 0;
        }
      }
    }

    // Clamp to canvas bounds
    if (this.bottom > ROWS * TILE) {
      this.y = ROWS * TILE;
      this.vy = 0;
      this.onGround = true;
    }
    if (this.top < 0) {
      this.y = PLAYER_H;
      this.vy = 0;
    }
  }

  die() {
    if (this.invincible > 0 || this.dead) return false;
    audio.playerDie();
    this.dead = true;
    this.respawnTimer = 90;
    this.invincible = INVINCIBLE_DURATION;
    this.vy = 0;
    this.vx = 0;
    return true;
  }

  respawn(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.dead = false;
    this.invincible = INVINCIBLE_DURATION;
  }
}
