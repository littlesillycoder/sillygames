export const gameState = {
  score: 0,
  hiScore: 0,
  lives: 3,
  level: 1,
  state: 'title', // 'title' | 'playing' | 'levelClear' | 'gameOver'
  levelClearTimer: 0,
  blinkTimer: 0,

  reset() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.state = 'title';
  },

  addScore(pts) {
    this.score += pts;
    if (this.score > this.hiScore) this.hiScore = this.score;
  },

  nextLevel() {
    this.level++;
    this.state = 'playing';
  },

  loseLife() {
    this.lives--;
    if (this.lives <= 0) {
      this.state = 'gameOver';
    }
  }
};
