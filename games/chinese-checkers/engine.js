// games/chinese-checkers/engine.js
// Chinese checkers (中國跳棋) — star board geometry, move generation, win check and AI.
//
// Board: 121 holes on a triangular lattice, stored with axial coordinates (q, r), s = -q - r.
// The star is the union of two big triangles: {q,r,s ≥ -4} ∪ {q,r,s ≤ 4}.
// The six points (corners) are the regions where one coordinate is beyond ±4.

(function (root) {
  'use strict';

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

  // ── Cells ────────────────────────────────────────────────
  const cells = [];              // { q, r, s, x, y }
  const index = new Map();       // "q,r" → cell index
  for (let r = -8; r <= 8; r++) {
    for (let q = -8; q <= 8; q++) {
      const s = -q - r;
      const t1 = q >= -4 && r >= -4 && s >= -4;
      const t2 = q <= 4 && r <= 4 && s <= 4;
      if (!t1 && !t2) continue;
      index.set(q + ',' + r, cells.length);
      cells.push({ q, r, s, x: q + r / 2, y: r * Math.sqrt(3) / 2 });
    }
  }
  const N = cells.length; // 121
  const at = (q, r) => { const i = index.get(q + ',' + r); return i === undefined ? -1 : i; };

  // neighbour and jump-landing tables: nb[i*6+d], jump[i*6+d]
  const nb = new Int16Array(N * 6).fill(-1);
  const jump = new Int16Array(N * 6).fill(-1);
  for (let i = 0; i < N; i++) {
    const { q, r } = cells[i];
    for (let d = 0; d < 6; d++) {
      nb[i * 6 + d] = at(q + DIRS[d][0], r + DIRS[d][1]);
      jump[i * 6 + d] = at(q + 2 * DIRS[d][0], r + 2 * DIRS[d][1]);
    }
  }

  // ── Corners (the six triangles), ordered clockwise starting at the bottom ──
  const coord = (c, axis) => axis === 'q' ? c.q : axis === 'r' ? c.r : c.s;
  const rawCorners = [];
  for (const axis of ['q', 'r', 's']) {
    for (const sign of [1, -1]) {
      const pts = [];
      for (let i = 0; i < N; i++) if (sign * coord(cells[i], axis) > 4) pts.push(i);
      let cx = 0, cy = 0;
      for (const i of pts) { cx += cells[i].x; cy += cells[i].y; }
      cx /= pts.length; cy /= pts.length;
      let ang = Math.atan2(-cx, cy); if (ang < 0) ang += Math.PI * 2; // 0 = bottom, increasing clockwise on screen
      const tip = pts.find(i => sign * coord(cells[i], axis) === 8);
      rawCorners.push({ axis, sign, cells: pts, tip, ang });
    }
  }
  rawCorners.sort((a, b) => a.ang - b.ang);
  const corners = rawCorners; // corners[k], k = 0 bottom, 1 bottom-left, 2 top-left, 3 top, 4 top-right, 5 bottom-right
  const cornerOf = new Int8Array(N).fill(-1);
  corners.forEach((c, k) => c.cells.forEach(i => { cornerOf[i] = k; }));
  const opposite = k => (k + 3) % 6;

  // Which corners are used for each player count (players start in these, aim for the opposite one)
  const SEATS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 6: [0, 1, 2, 3, 4, 5] };

  // hex distance from every cell to every corner tip
  const hexDist = (a, b) => (Math.abs(cells[a].q - cells[b].q) + Math.abs(cells[a].r - cells[b].r) + Math.abs(cells[a].s - cells[b].s)) / 2;
  const distTip = corners.map(c => { const d = new Int8Array(N); for (let i = 0; i < N; i++) d[i] = hexDist(i, c.tip); return d; });

  // ── Game state ───────────────────────────────────────────
  // board: Int8Array(N), -1 = empty, otherwise corner index (= player colour id) of the marble
  function newBoard(nPlayers) {
    const b = new Int8Array(N).fill(-1);
    for (const k of SEATS[nPlayers]) for (const i of corners[k].cells) b[i] = k;
    return b;
  }

  // All legal destinations for the marble on `from`. Returns [{ from, to, path }]
  function movesFrom(b, from) {
    const out = [];
    for (let d = 0; d < 6; d++) {
      const n = nb[from * 6 + d];
      if (n >= 0 && b[n] === -1) out.push({ from, to: n, path: [from, n], jump: false });
    }
    // chained jumps (BFS); the moving marble has left `from`
    const seen = new Uint8Array(N);
    seen[from] = 1;
    const queue = [[from]];
    while (queue.length) {
      const path = queue.shift();
      const p = path[path.length - 1];
      for (let d = 0; d < 6; d++) {
        const over = nb[p * 6 + d], land = jump[p * 6 + d];
        if (over < 0 || land < 0 || seen[land]) continue;
        if (over === from || b[over] === -1) continue;
        if (b[land] !== -1) continue;
        seen[land] = 1;
        const np = path.concat(land);
        out.push({ from, to: land, path: np, jump: true });
        queue.push(np);
      }
    }
    return out;
  }

  function allMoves(b, player) {
    const out = [];
    for (let i = 0; i < N; i++) if (b[i] === player) {
      const ms = movesFrom(b, i);
      for (let k = 0; k < ms.length; k++) out.push(ms[k]);
    }
    return out;
  }

  // Won = all ten of your marbles are in the target triangle.
  // Anti-blocking rule: if the target is full, you have at least one marble there, and the other
  // marbles in it were parked there by third players (not the target owner's own marbles that
  // simply haven't left home yet), you also win — so nobody can block you by parking.
  function hasWon(b, player) {
    const tgt = opposite(player);
    let mine = 0, ownerLeft = 0;
    for (const i of corners[tgt].cells) {
      if (b[i] === -1) return false;
      if (b[i] === player) mine++;
      else if (b[i] === tgt) ownerLeft++;
    }
    return mine === 10 || (mine > 0 && ownerLeft === 0);
  }

  function inTarget(b, player) {
    let n = 0;
    for (const i of corners[opposite(player)].cells) if (b[i] === player) n++;
    return n;
  }

  // total distance of a player's marbles from their target tip (0..; 20 = target filled)
  function cost(b, player) {
    const dt = distTip[opposite(player)];
    let c = 0;
    for (let i = 0; i < N; i++) if (b[i] === player) c += dt[i];
    return c;
  }

  // ── AI ───────────────────────────────────────────────────
  // Score for moving a marble: lower = better.
  function moveScore(b, player, m, dt, tgtCorner, maxDist) {
    let sc = dt[m.to] - dt[m.from];                          // progress towards the tip
    const fromIn = cornerOf[m.from] === tgtCorner, toIn = cornerOf[m.to] === tgtCorner;
    if (fromIn && !toIn) sc += 6;                            // never leave the target once inside
    if (!fromIn && toIn) sc -= 0.6;                          // entering the target is extra good
    sc -= dt[m.from] / (maxDist + 1) * 0.45;                 // prefer moving stragglers
    // don't stop inside a non-target corner (it blocks others and wastes time)
    const cTo = cornerOf[m.to];
    if (cTo >= 0 && cTo !== tgtCorner && cTo !== player) sc += 0.4;
    return sc;
  }

  // choose a move for `player`. level: 'easy' | 'medium' | 'hard'. last: previous move of this player (anti-oscillation)
  function chooseMove(b, player, level, last, rnd) {
    rnd = rnd || Math.random;
    const moves = allMoves(b, player);
    if (!moves.length) return null;
    const tgt = opposite(player), dt = distTip[tgt];
    let maxDist = 0;
    for (let i = 0; i < N; i++) if (b[i] === player && dt[i] > maxDist) maxDist = dt[i];

    const scored = moves.map(m => {
      let sc = moveScore(b, player, m, dt, tgt, maxDist);
      if (last && m.from === last.to && m.to === last.from) sc += 3; // avoid undoing my last move
      if (level === 'hard') sc += rnd() * 0.08;                        // tiny noise so games vary
      return { m, sc };
    });

    // A move that wins right away is always taken
    for (const s of scored) {
      b[s.m.from] = -1; b[s.m.to] = player;
      const w = hasWon(b, player);
      b[s.m.to] = -1; b[s.m.from] = player;
      if (w) return s.m;
    }

    if (level === 'hard') {
      // two-move lookahead with my own follow-up (opponents ignored — works well in multiplayer)
      scored.sort((a, c) => a.sc - c.sc);
      const top = scored.slice(0, 40);
      for (const s of top) {
        const m = s.m;
        b[m.from] = -1; b[m.to] = player;
        let md = 0;
        for (let i = 0; i < N; i++) if (b[i] === player && dt[i] > md) md = dt[i];
        let best2 = 0;
        const ms2 = allMoves(b, player);
        for (const m2 of ms2) {
          const v = moveScore(b, player, m2, dt, tgt, md);
          if (v < best2) best2 = v;
        }
        b[m.to] = -1; b[m.from] = player;
        s.sc2 = s.sc + 0.85 * best2;
      }
      top.sort((a, c) => a.sc2 - c.sc2 || c.m.path.length - a.m.path.length);
      return top[0].m;
    }

    if (level === 'medium') {
      scored.forEach(s => { s.sc += rnd() * 0.25; });
      scored.sort((a, c) => a.sc - c.sc);
      return scored[0].m;
    }

    // easy: usually a reasonable forward move, often not the best, sometimes a plain step
    scored.sort((a, c) => a.sc - c.sc);
    const good = scored.filter(s => s.sc < 0);
    const pool = good.length ? good : scored;
    if (rnd() < 0.35) {
      const steps = pool.filter(s => !s.m.jump);
      if (steps.length) return steps[(rnd() * steps.length) | 0].m;
    }
    const k = Math.min(pool.length, 6);
    return pool[(rnd() * k) | 0].m;
  }

  const CC = {
    cells, N, nb, corners, cornerOf, opposite, SEATS, distTip,
    newBoard, movesFrom, allMoves, hasWon, inTarget, cost, chooseMove,
  };
  root.ChineseCheckers = CC;
  if (typeof module !== 'undefined' && module.exports) module.exports = CC;
})(typeof self !== 'undefined' ? self : this);
