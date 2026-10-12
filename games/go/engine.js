// games/go/engine.js
// Go (圍棋) rules engine + Monte-Carlo tree search AI.
// Used by the game page (rules) and by ai-worker.js (AI thinking).
// Rules: area scoring, simple ko.
// allowSuicide = true → Taiwan (Ing) rules: multi-stone suicide is legal.
// allowSuicide = false → Chinese rules: suicide is forbidden.

(function (root) {
  'use strict';

  const EMPTY = 0, BLACK = 1, WHITE = 2, EDGE = 3;
  const PASS = 0; // padded index 0 is always an edge point, so it is free to mean "pass"

  // ───────────────────────────────────────────────────────────
  //  BOARD
  // ───────────────────────────────────────────────────────────
  class Board {
    constructor(n, allowSuicide) {
      this.n = n;
      this.allowSuicide = !!allowSuicide;
      this.W = n + 2;
      this.size = this.W * this.W;
      this.color = new Uint8Array(this.size);
      this.head = new Int32Array(this.size);
      this.next = new Int32Array(this.size);
      this.gsize = new Int32Array(this.size);
      this.mark = new Int32Array(this.size);
      this.gen = 1;
      this.empties = new Int32Array(n * n);
      this.emptyIdx = new Int32Array(this.size).fill(-1);
      this.nEmpty = 0;
      this.dirs = [1, -1, this.W, -this.W];
      this.diags = [this.W + 1, this.W - 1, -this.W + 1, -this.W - 1];
      this.ko = -1;
      this.toPlay = BLACK;
      this.passes = 0;
      this.moveNum = 0;
      this.lastMove = -1;
      this.captures = [0, 0, 0];
      for (let y = 0; y < this.W; y++) {
        for (let x = 0; x < this.W; x++) {
          const p = y * this.W + x;
          if (x === 0 || y === 0 || x === this.W - 1 || y === this.W - 1) {
            this.color[p] = EDGE;
          } else {
            this._addEmpty(p);
          }
        }
      }
    }

    pt(x, y) { return (y + 1) * this.W + (x + 1); }
    xy(p) { return [(p % this.W) - 1, Math.floor(p / this.W) - 1]; }

    clone() {
      const b = Object.create(Board.prototype);
      b.n = this.n; b.W = this.W; b.size = this.size; b.allowSuicide = this.allowSuicide;
      b.color = this.color.slice();
      b.head = this.head.slice();
      b.next = this.next.slice();
      b.gsize = this.gsize.slice();
      b.mark = new Int32Array(this.size);
      b.gen = 1;
      b.empties = this.empties.slice();
      b.emptyIdx = this.emptyIdx.slice();
      b.nEmpty = this.nEmpty;
      b.dirs = this.dirs; b.diags = this.diags;
      b.ko = this.ko; b.toPlay = this.toPlay; b.passes = this.passes;
      b.moveNum = this.moveNum; b.lastMove = this.lastMove;
      b.captures = this.captures.slice();
      return b;
    }

    // Fast copy into an existing board of the same size (used per MCTS iteration)
    copyFrom(o) {
      this.color.set(o.color); this.head.set(o.head); this.next.set(o.next);
      this.gsize.set(o.gsize); this.empties.set(o.empties); this.emptyIdx.set(o.emptyIdx);
      this.nEmpty = o.nEmpty; this.ko = o.ko; this.toPlay = o.toPlay; this.passes = o.passes;
      this.moveNum = o.moveNum; this.lastMove = o.lastMove;
      this.captures[1] = o.captures[1]; this.captures[2] = o.captures[2];
    }

    _addEmpty(p) {
      this.emptyIdx[p] = this.nEmpty;
      this.empties[this.nEmpty++] = p;
    }
    _removeEmpty(p) {
      const i = this.emptyIdx[p];
      const last = this.empties[--this.nEmpty];
      this.empties[i] = last;
      this.emptyIdx[last] = i;
      this.emptyIdx[p] = -1;
    }

    // Count distinct liberties of the group with head h, stopping early at `limit`.
    libs(h, limit) {
      const g = ++this.gen, color = this.color, mark = this.mark, next = this.next, dirs = this.dirs;
      let c = 0, s = h;
      do {
        for (let i = 0; i < 4; i++) {
          const q = s + dirs[i];
          if (color[q] === EMPTY && mark[q] !== g) {
            mark[q] = g;
            if (++c >= limit) return c;
          }
        }
        s = next[s];
      } while (s !== h);
      return c;
    }

    // Any one liberty of the group (use when it is known to be in atari)
    libPoint(h) {
      let s = h;
      do {
        for (let i = 0; i < 4; i++) {
          const q = s + this.dirs[i];
          if (this.color[q] === EMPTY) return q;
        }
        s = this.next[s];
      } while (s !== h);
      return -1;
    }

    // Every stone of the group containing p
    groupStones(p) {
      const h = this.head[p], out = [];
      let s = h;
      do { out.push(s); s = this.next[s]; } while (s !== h);
      return out;
    }

    isLegal(p, c) {
      if (p === PASS) return true;
      if (p <= 0 || p >= this.size || this.color[p] !== EMPTY || p === this.ko) return false;
      const opp = 3 - c;
      for (let i = 0; i < 4; i++) if (this.color[p + this.dirs[i]] === EMPTY) return true;
      for (let i = 0; i < 4; i++) {
        const q = p + this.dirs[i], col = this.color[q];
        if (col === c && this.libs(this.head[q], 2) >= 2) return true;
        if (col === opp && this.libs(this.head[q], 2) === 1) return true;
      }
      // Ing rules: suicide of a group of 2+ stones is allowed (single-stone suicide is not)
      if (this.allowSuicide) {
        for (let i = 0; i < 4; i++) if (this.color[p + this.dirs[i]] === c) return true;
      }
      return false;
    }

    // Is p a true-ish eye of colour c (never fill these in playouts)
    isEye(p, c) {
      const color = this.color;
      for (let i = 0; i < 4; i++) {
        const col = color[p + this.dirs[i]];
        if (col !== c && col !== EDGE) return false;
      }
      let bad = 0, edge = 0;
      const opp = 3 - c;
      for (let i = 0; i < 4; i++) {
        const col = color[p + this.diags[i]];
        if (col === opp) bad++;
        else if (col === EDGE) edge = 1;
      }
      return bad + edge < 2;
    }

    // Would playing p leave the new group with ≤1 liberty (and capture nothing)?
    isSelfAtari(p, c) {
      const opp = 3 - c, color = this.color, dirs = this.dirs;
      for (let i = 0; i < 4; i++) {
        const q = p + dirs[i];
        if (color[q] === opp && this.libs(this.head[q], 2) === 1) return false; // captures
      }
      const g = ++this.gen, mark = this.mark;
      mark[p] = g;
      let c2 = 0;
      for (let i = 0; i < 4; i++) {
        const q = p + dirs[i];
        if (color[q] === EMPTY && mark[q] !== g) { mark[q] = g; if (++c2 >= 2) return false; }
      }
      for (let i = 0; i < 4; i++) {
        const q = p + dirs[i];
        if (color[q] !== c) continue;
        const h = this.head[q];
        let s = h;
        do {
          for (let k = 0; k < 4; k++) {
            const r = s + dirs[k];
            if (color[r] === EMPTY && mark[r] !== g) { mark[r] = g; if (++c2 >= 2) return false; }
          }
          s = this.next[s];
        } while (s !== h);
      }
      return true;
    }

    // Play a (legal) move for the side to move. Returns number of stones captured.
    play(p) {
      const c = this.toPlay, opp = 3 - c;
      this.moveNum++;
      this.lastMove = p;
      this.toPlay = opp;
      if (p === PASS) { this.passes++; this.ko = -1; return 0; }
      this.passes = 0;
      const color = this.color, head = this.head, next = this.next, gsize = this.gsize, dirs = this.dirs;
      color[p] = c; head[p] = p; next[p] = p; gsize[p] = 1;
      this._removeEmpty(p);

      let captured = 0, capPos = -1;
      for (let i = 0; i < 4; i++) {
        const q = p + dirs[i];
        if (color[q] === opp) {
          const h = head[q];
          if (this.libs(h, 1) === 0) {
            captured += gsize[h];
            capPos = q;
            this._removeGroup(h);
          }
        }
      }
      for (let i = 0; i < 4; i++) {
        const q = p + dirs[i];
        if (color[q] === c && head[q] !== head[p]) this._merge(head[p], head[q]);
      }
      const hp = head[p];
      if (captured === 0 && this.libs(hp, 1) === 0) {
        // multi-stone suicide (only reachable when allowSuicide is on)
        this.captures[opp] += gsize[hp];
        this._removeGroup(hp);
        this.ko = -1;
        return 0;
      }
      this.ko = (captured === 1 && gsize[hp] === 1 && this.libs(hp, 2) === 1) ? capPos : -1;
      this.captures[c] += captured;
      return captured;
    }

    _merge(a, b) {
      const head = this.head, next = this.next, gsize = this.gsize;
      if (gsize[a] < gsize[b]) { const t = a; a = b; b = t; }
      let s = b;
      do { head[s] = a; s = next[s]; } while (s !== b);
      const t = next[a]; next[a] = next[b]; next[b] = t;
      gsize[a] += gsize[b];
    }

    _removeGroup(h) {
      let s = h;
      do {
        this.color[s] = EMPTY;
        this._addEmpty(s);
        s = this.next[s];
      } while (s !== h);
    }

    // Area score from Black's point of view (black − white − komi).
    // dead: optional Set/Uint8Array of points whose stones count as captured.
    // owner: optional Int8Array filled with 1 (black), 2 (white) or 0 (neutral) per point.
    score(komi, dead, owner) {
      const n = this.n, W = this.W, color = this.color, dirs = this.dirs;
      const isDead = dead ? (p => (dead.has ? dead.has(p) : dead[p] === 1)) : null;
      const g = ++this.gen, mark = this.mark;
      let b = 0, w = 0;
      const stack = [];
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const p = (y + 1) * W + x + 1;
          const col = color[p];
          const alive = col !== EMPTY && !(isDead && isDead(p));
          if (alive) {
            if (col === BLACK) b++; else w++;
            if (owner) owner[p] = col;
            continue;
          }
          if (mark[p] === g) continue;
          // flood fill a region of empty points + dead stones
          const region = [];
          let touchB = false, touchW = false;
          mark[p] = g; stack.push(p);
          while (stack.length) {
            const s = stack.pop();
            region.push(s);
            for (let i = 0; i < 4; i++) {
              const q = s + dirs[i], qc = color[q];
              if (qc === EDGE) continue;
              const qAlive = qc !== EMPTY && !(isDead && isDead(q));
              if (qAlive) { if (qc === BLACK) touchB = true; else touchW = true; }
              else if (mark[q] !== g) { mark[q] = g; stack.push(q); }
            }
          }
          const who = touchB && !touchW ? BLACK : touchW && !touchB ? WHITE : EMPTY;
          if (who === BLACK) b += region.length; else if (who === WHITE) w += region.length;
          if (owner) for (const s of region) owner[s] = who;
        }
      }
      return { black: b, white: w + komi, diff: b - w - komi };
    }
  }

  // ───────────────────────────────────────────────────────────
  //  PLAYOUT POLICY
  // ───────────────────────────────────────────────────────────
  function policyMove(b, rnd) {
    const c = b.toPlay, last = b.lastMove;
    if (last > 0 && b.color[last] !== EMPTY) {
      // 1) capture the stone that was just played if it is in atari
      const hl = b.head[last];
      if (b.color[last] === 3 - c && b.libs(hl, 2) === 1 && rnd() < 0.9) {
        const q = b.libPoint(hl);
        if (b.isLegal(q, c)) return q;
      }
      // 2) save my own group put into atari by the last move
      for (let i = 0; i < 4; i++) {
        const q = last + b.dirs[i];
        if (b.color[q] === c && b.libs(b.head[q], 2) === 1 && rnd() < 0.8) {
          const lib = b.libPoint(b.head[q]);
          if (b.isLegal(lib, c) && !b.isSelfAtari(lib, c)) return lib;
        }
      }
    }
    // 3) random move that does not fill an own eye and is not a silly self-atari
    const ne = b.nEmpty;
    if (ne === 0) return PASS;
    const start = (rnd() * ne) | 0;
    let fallback = -1;
    for (let k = 0; k < ne; k++) {
      const p = b.empties[(start + k) % ne];
      if (b.isEye(p, c) || !b.isLegal(p, c)) continue;
      if (b.isSelfAtari(p, c)) { if (fallback < 0) fallback = p; continue; }
      return p;
    }
    return fallback > 0 && rnd() < 0.3 ? fallback : PASS;
  }

  function playout(b, rnd, amaf) {
    const limit = b.n * b.n * 3;
    let steps = 0;
    while (b.passes < 2 && steps < limit) {
      const m = policyMove(b, rnd);
      if (amaf && m !== PASS && amaf[m] === 0) amaf[m] = b.toPlay;
      b.play(m);
      steps++;
    }
  }

  // ───────────────────────────────────────────────────────────
  //  MCTS WITH RAVE
  // ───────────────────────────────────────────────────────────
  class Node {
    constructor(move, mover, parent) {
      this.move = move;     // move that leads to this node
      this.mover = mover;   // colour that played it
      this.parent = parent;
      this.children = null;
      this.n = 0; this.w = 0;   // real visits / wins for `mover`
      this.an = 0; this.aw = 0; // AMAF visits / wins
    }
  }

  function makeRng(seed) {
    let s = seed >>> 0 || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function expand(node, b) {
    const c = b.toPlay, n = b.n, kids = [];
    const early = b.moveNum < n * n * 0.25 && n >= 13;
    const last = b.lastMove;
    for (let k = 0; k < b.nEmpty; k++) {
      const p = b.empties[k];
      if (b.isEye(p, c) || !b.isLegal(p, c)) continue;
      const ch = new Node(p, c, node);
      // Priors expressed as virtual AMAF results
      let v = 0.5, w = 6;
      const [x, y] = b.xy(p);
      const line = Math.min(x, y, n - 1 - x, n - 1 - y);
      if (b.isSelfAtari(p, c)) { v = 0.15; w = 30; }
      else {
        for (let i = 0; i < 4; i++) {
          const q = p + b.dirs[i], col = b.color[q];
          if (col === 3 - c && b.libs(b.head[q], 2) === 1) { v = 0.9; w = 30; }      // capture
          else if (col === c && b.libs(b.head[q], 2) === 1) { v = Math.max(v, 0.8); w = 25; } // escape
        }
        if (v === 0.5) {
          if (early && line === 0) { v = 0.25; w = 20; }
          else if (early && line === 1) { v = 0.4; w = 12; }
          else if (early && (line === 2 || line === 3)) { v = 0.58; w = 10; }
          if (last > 0) {
            const [lx, ly] = b.xy(last);
            const d = Math.abs(lx - x) + Math.abs(ly - y);
            if (d <= 2) { v += 0.06; w += 4; }
          }
        }
      }
      ch.an = w; ch.aw = w * v;
      kids.push(ch);
    }
    // Pass is only considered late, or right after the opponent passed, or if nothing else is left
    if (b.passes === 1 || b.moveNum > n * n * 0.55 || kids.length === 0) {
      kids.push(new Node(PASS, c, node));
    }
    node.children = kids;
  }

  function selectChild(node) {
    const lnN = Math.log(node.n + 1);
    let best = null, bestV = -1;
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) {
      const ch = kids[i];
      let v;
      if (ch.move === PASS) {
        v = ch.n > 0 ? ch.w / ch.n + 0.3 * Math.sqrt(lnN / ch.n) : 0.45;
      } else {
        const q = ch.n > 0 ? ch.w / ch.n : 0;
        const aq = ch.an > 0 ? ch.aw / ch.an : 0.5;
        const beta = ch.an / (ch.an + ch.n + ch.an * ch.n / 1500);
        v = (1 - beta) * q + beta * aq + 0.15 * Math.sqrt(lnN / (ch.n + 1));
      }
      if (v > bestV) { bestV = v; best = ch; }
    }
    return best;
  }

  // Main search. Returns { move, winrate, playouts, resign, ownership? }
  function think(rootBoard, komi, opts) {
    const budgetMs = opts.budgetMs || 1000;
    const maxPlayouts = opts.maxPlayouts || 1e9;
    const rnd = makeRng((Math.random() * 4294967296) >>> 0);
    const me = rootBoard.toPlay;
    const root = new Node(-1, 3 - me, null);
    const b = rootBoard.clone();
    const amaf = new Uint8Array(rootBoard.size);
    const t0 = Date.now();
    let iters = 0;

    expand(root, rootBoard.clone());
    if (root.children.length === 1 && root.children[0].move === PASS) {
      return { move: PASS, winrate: 0.5, playouts: 0, resign: false };
    }

    while (iters < maxPlayouts) {
      if ((iters & 31) === 0 && Date.now() - t0 > budgetMs) break;
      b.copyFrom(rootBoard);
      amaf.fill(0);
      let node = root;
      const path = [root];
      // selection
      while (node.children && node.children.length && b.passes < 2) {
        const ch = selectChild(node);
        if (ch.move !== PASS && amaf[ch.move] === 0) amaf[ch.move] = b.toPlay;
        b.play(ch.move);
        node = ch;
        path.push(node);
      }
      // expansion
      if (b.passes < 2 && node.n >= 1 && !node.children) {
        expand(node, b);
        if (node.children.length) {
          const ch = selectChild(node);
          if (ch.move !== PASS && amaf[ch.move] === 0) amaf[ch.move] = b.toPlay;
          b.play(ch.move);
          node = ch;
          path.push(node);
        }
      }
      // simulation
      if (b.passes < 2) playout(b, rnd, amaf);
      const blackWins = b.score(komi).diff > 0;
      // back-propagation (+ RAVE updates on siblings)
      for (let i = 0; i < path.length; i++) {
        const nd = path[i];
        nd.n++;
        const moverWins = (nd.mover === BLACK) === blackWins;
        if (moverWins) nd.w++;
        if (nd.children) {
          for (let k = 0; k < nd.children.length; k++) {
            const ch = nd.children[k];
            if (ch.move !== PASS && amaf[ch.move] === ch.mover) {
              ch.an++;
              if ((ch.mover === BLACK) === blackWins) ch.aw++;
            }
          }
        }
      }
      iters++;
    }

    // choose the most visited child
    let best = null, bestPlay = null;
    for (const ch of root.children) {
      if (!best || ch.n > best.n) best = ch;
      if (ch.move !== PASS && (!bestPlay || ch.n > bestPlay.n)) bestPlay = ch;
    }
    const n = rootBoard.n;
    const passAllowed = rootBoard.passes === 1 || rootBoard.moveNum > n * n * 0.6 || !bestPlay;
    let pick = best;
    if (pick.move === PASS && !passAllowed && bestPlay) pick = bestPlay;

    // Weak level: sometimes pick a random decent candidate instead of the best one
    if (opts.noise && pick.move !== PASS && Math.random() < opts.noise) {
      const top = root.children.filter(ch => ch.move !== PASS && ch.n >= pick.n * 0.15);
      if (top.length) pick = top[(Math.random() * top.length) | 0];
    }

    const winrate = pick.n ? pick.w / pick.n : 0.5;
    const resign = !!opts.allowResign && iters > 300 && winrate < 0.06 &&
      rootBoard.moveNum > n * n * 0.3;
    return { move: pick.move, winrate, playouts: iters, resign };
  }

  // Ownership map from random playouts: own[p] in [-1 (white), +1 (black)]
  function ownership(rootBoard, komi, playouts, budgetMs) {
    const rnd = makeRng((Math.random() * 4294967296) >>> 0);
    const b = rootBoard.clone();
    const own = new Float32Array(rootBoard.size);
    const owner = new Int8Array(rootBoard.size);
    const t0 = Date.now();
    let i = 0;
    for (; i < playouts; i++) {
      if ((i & 15) === 0 && Date.now() - t0 > (budgetMs || 1500)) break;
      b.copyFrom(rootBoard);
      b.passes = 0;
      playout(b, rnd, null);
      b.score(komi, null, owner);
      for (let p = 0; p < own.length; p++) {
        if (owner[p] === BLACK) own[p] += 1; else if (owner[p] === WHITE) own[p] -= 1;
      }
    }
    if (i > 0) for (let p = 0; p < own.length; p++) own[p] /= i;
    return own;
  }

  // Rebuild a board from a list of moves (padded indices, PASS = 0)
  function replay(n, moves, allowSuicide) {
    const b = new Board(n, allowSuicide);
    for (const m of moves) b.play(m);
    return b;
  }

  const GoEngine = { Board, think, ownership, replay, EMPTY, BLACK, WHITE, EDGE, PASS };
  root.GoEngine = GoEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = GoEngine;
})(typeof self !== 'undefined' ? self : this);
