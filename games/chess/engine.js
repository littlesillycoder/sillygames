// games/chess/engine.js
// Chess rules (FIDE) + a small alpha-beta engine.
// Board: 0x88 layout, a1 = 0, h1 = 7, a8 = 112. White moves "up" (+16).
// Pieces: white P1 N2 B3 R4 Q5 K6, black = 8 + type (9..14).
// Move: from | to << 7 | promo << 14 | flags << 17

(function (root) {
  'use strict';

  const WHITE = 0, BLACK = 1;
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8, F_PROMO = 16;
  const colorOf = p => p >> 3;
  const typeOf = p => p & 7;
  const mFrom = m => m & 127, mTo = m => (m >> 7) & 127, mPromo = m => (m >> 14) & 7, mFlags = m => m >> 17;
  const mk = (from, to, promo, flags) => from | (to << 7) | (promo << 14) | (flags << 17);

  const KNIGHT = [33, 31, 18, 14, -33, -31, -18, -14];
  const BISHOP = [15, 17, -15, -17];
  const ROOK = [16, -16, 1, -1];
  const KING = [15, 16, 17, 1, -1, -15, -16, -17];

  const sqName = s => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
  const sqFromName = n => (n.charCodeAt(0) - 97) + (n.charCodeAt(1) - 49) * 16;

  // castling right masks (bit 1 = W O-O, 2 = W O-O-O, 4 = B O-O, 8 = B O-O-O)
  const CASTLE_MASK = new Int8Array(128).fill(15);
  CASTLE_MASK[0] = 15 & ~2; CASTLE_MASK[7] = 15 & ~1; CASTLE_MASK[4] = 15 & ~3;
  CASTLE_MASK[112] = 15 & ~8; CASTLE_MASK[119] = 15 & ~4; CASTLE_MASK[116] = 15 & ~12;

  // ── Zobrist keys (deterministic) ──
  let seed = 0x2545F491;
  const rnd32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const Z_PIECE = new Int32Array(16 * 128).map(() => rnd32());
  const Z_SIDE = rnd32();
  const Z_CASTLE = new Int32Array(16).map(() => rnd32());
  const Z_EP = new Int32Array(8).map(() => rnd32());

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  class Position {
    constructor(fen) {
      this.b = new Int8Array(128);
      this.kings = [0, 0];
      this.stack = [];
      this.hashHist = [];
      this.setFEN(fen || START_FEN);
    }

    setFEN(fen) {
      const [pos, side, cast, ep, half, full] = fen.split(/\s+/);
      this.b.fill(0);
      let rank = 7, file = 0;
      for (const ch of pos) {
        if (ch === '/') { rank--; file = 0; continue; }
        if (/\d/.test(ch)) { file += +ch; continue; }
        const lower = ch.toLowerCase();
        const t = { p: P, n: N, b: B, r: R, q: Q, k: K }[lower];
        const piece = (ch === lower ? 8 : 0) | t;
        const s = rank * 16 + file;
        this.b[s] = piece;
        if (t === K) this.kings[colorOf(piece)] = s;
        file++;
      }
      this.side = side === 'b' ? BLACK : WHITE;
      this.castle = 0;
      if (cast && cast !== '-') {
        if (cast.includes('K')) this.castle |= 1;
        if (cast.includes('Q')) this.castle |= 2;
        if (cast.includes('k')) this.castle |= 4;
        if (cast.includes('q')) this.castle |= 8;
      }
      this.ep = ep && ep !== '-' ? sqFromName(ep) : -1;
      this.half = +(half || 0);
      this.full = +(full || 1);
      this.stack = [];
      this.hash = this.computeHash();
      this.hashHist = [this.hash];
    }

    computeHash() {
      let h = 0;
      for (let s = 0; s < 128; s++) if (!(s & 0x88) && this.b[s]) h ^= Z_PIECE[this.b[s] * 128 + s];
      if (this.side) h ^= Z_SIDE;
      h ^= Z_CASTLE[this.castle];
      if (this.ep >= 0) h ^= Z_EP[this.ep & 7];
      return h;
    }

    fen() {
      let out = '';
      for (let r = 7; r >= 0; r--) {
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.b[r * 16 + f];
          if (!p) { empty++; continue; }
          if (empty) { out += empty; empty = 0; }
          const c = ' pnbrqk'[typeOf(p)];
          out += colorOf(p) ? c : c.toUpperCase();
        }
        if (empty) out += empty;
        if (r) out += '/';
      }
      let c = '';
      if (this.castle & 1) c += 'K'; if (this.castle & 2) c += 'Q';
      if (this.castle & 4) c += 'k'; if (this.castle & 8) c += 'q';
      return `${out} ${this.side ? 'b' : 'w'} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
    }

    attacked(s, by) {
      const b = this.b;
      // pawns
      if (by === WHITE) {
        if (!((s - 15) & 0x88) && b[s - 15] === P) return true;
        if (!((s - 17) & 0x88) && b[s - 17] === P) return true;
      } else {
        if (!((s + 15) & 0x88) && b[s + 15] === 9) return true;
        if (!((s + 17) & 0x88) && b[s + 17] === 9) return true;
      }
      const side8 = by << 3;
      for (let i = 0; i < 8; i++) {
        const t = s + KNIGHT[i];
        if (!(t & 0x88) && b[t] === (side8 | N)) return true;
      }
      for (let i = 0; i < 8; i++) {
        const t = s + KING[i];
        if (!(t & 0x88) && b[t] === (side8 | K)) return true;
      }
      for (let i = 0; i < 4; i++) {
        const d = BISHOP[i];
        for (let t = s + d; !(t & 0x88); t += d) {
          const p = b[t];
          if (p) { if (p === (side8 | B) || p === (side8 | Q)) return true; break; }
        }
      }
      for (let i = 0; i < 4; i++) {
        const d = ROOK[i];
        for (let t = s + d; !(t & 0x88); t += d) {
          const p = b[t];
          if (p) { if (p === (side8 | R) || p === (side8 | Q)) return true; break; }
        }
      }
      return false;
    }

    inCheck(side = this.side) { return this.attacked(this.kings[side], side ^ 1); }

    // pseudo-legal moves into `out`; capturesOnly also includes queen promotions
    gen(out, capturesOnly) {
      const b = this.b, side = this.side, opp = side ^ 1;
      const dir = side ? -16 : 16, startRank = side ? 6 : 1, lastRank = side ? 0 : 7;
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const p = b[s];
        if (!p || colorOf(p) !== side) continue;
        const t = typeOf(p);
        if (t === P) {
          const to = s + dir;
          if (!(to & 0x88) && !b[to]) {
            if ((to >> 4) === lastRank) {
              out.push(mk(s, to, Q, F_PROMO));
              if (!capturesOnly) { out.push(mk(s, to, N, F_PROMO)); out.push(mk(s, to, R, F_PROMO)); out.push(mk(s, to, B, F_PROMO)); }
            } else if (!capturesOnly) {
              out.push(mk(s, to, 0, 0));
              if ((s >> 4) === startRank && !b[to + dir]) out.push(mk(s, to + dir, 0, F_DOUBLE));
            }
          }
          for (const c of [dir - 1, dir + 1]) {
            const to2 = s + c;
            if (to2 & 0x88) continue;
            const q = b[to2];
            if (q && colorOf(q) === opp) {
              if ((to2 >> 4) === lastRank) {
                out.push(mk(s, to2, Q, F_CAP | F_PROMO));
                if (!capturesOnly) { out.push(mk(s, to2, N, F_CAP | F_PROMO)); out.push(mk(s, to2, R, F_CAP | F_PROMO)); out.push(mk(s, to2, B, F_CAP | F_PROMO)); }
              } else out.push(mk(s, to2, 0, F_CAP));
            } else if (to2 === this.ep) out.push(mk(s, to2, 0, F_CAP | F_EP));
          }
        } else if (t === N || t === K) {
          const offs = t === N ? KNIGHT : KING;
          for (let i = 0; i < 8; i++) {
            const to = s + offs[i];
            if (to & 0x88) continue;
            const q = b[to];
            if (!q) { if (!capturesOnly) out.push(mk(s, to, 0, 0)); }
            else if (colorOf(q) === opp) out.push(mk(s, to, 0, F_CAP));
          }
          if (t === K && !capturesOnly) {
            if (side === WHITE && s === 4) {
              if ((this.castle & 1) && !b[5] && !b[6] && b[7] === R && !this.attacked(4, opp) && !this.attacked(5, opp) && !this.attacked(6, opp)) out.push(mk(4, 6, 0, F_CASTLE));
              if ((this.castle & 2) && !b[3] && !b[2] && !b[1] && b[0] === R && !this.attacked(4, opp) && !this.attacked(3, opp) && !this.attacked(2, opp)) out.push(mk(4, 2, 0, F_CASTLE));
            } else if (side === BLACK && s === 116) {
              if ((this.castle & 4) && !b[117] && !b[118] && b[119] === 12 && !this.attacked(116, opp) && !this.attacked(117, opp) && !this.attacked(118, opp)) out.push(mk(116, 118, 0, F_CASTLE));
              if ((this.castle & 8) && !b[115] && !b[114] && !b[113] && b[112] === 12 && !this.attacked(116, opp) && !this.attacked(115, opp) && !this.attacked(114, opp)) out.push(mk(116, 114, 0, F_CASTLE));
            }
          }
        } else {
          const dirs = t === B ? BISHOP : t === R ? ROOK : KING;
          for (let i = 0; i < dirs.length; i++) {
            const d = dirs[i];
            for (let to = s + d; !(to & 0x88); to += d) {
              const q = b[to];
              if (!q) { if (!capturesOnly) out.push(mk(s, to, 0, 0)); continue; }
              if (colorOf(q) === opp) out.push(mk(s, to, 0, F_CAP));
              break;
            }
          }
        }
      }
      return out;
    }

    // Make a pseudo-legal move. Returns false (and undoes it) if it leaves the mover in check.
    make(m) {
      const b = this.b, side = this.side;
      const from = mFrom(m), to = mTo(m), flags = mFlags(m);
      const piece = b[from];
      let capSq = to;
      if (flags & F_EP) capSq = to + (side ? 16 : -16);
      const captured = b[capSq];
      this.stack.push({ m, captured, capSq, castle: this.castle, ep: this.ep, half: this.half, hash: this.hash });
      let h = this.hash;
      h ^= Z_CASTLE[this.castle];
      if (this.ep >= 0) h ^= Z_EP[this.ep & 7];
      h ^= Z_PIECE[piece * 128 + from];
      if (captured) { h ^= Z_PIECE[captured * 128 + capSq]; b[capSq] = 0; }
      b[from] = 0;
      const promo = mPromo(m);
      const placed = promo ? ((side << 3) | promo) : piece;
      b[to] = placed;
      h ^= Z_PIECE[placed * 128 + to];
      if (flags & F_CASTLE) {
        let rf, rt;
        if (to === 6) { rf = 7; rt = 5; } else if (to === 2) { rf = 0; rt = 3; }
        else if (to === 118) { rf = 119; rt = 117; } else { rf = 112; rt = 115; }
        const rook = b[rf];
        b[rf] = 0; b[rt] = rook;
        h ^= Z_PIECE[rook * 128 + rf] ^ Z_PIECE[rook * 128 + rt];
      }
      if (typeOf(piece) === K) this.kings[side] = to;
      this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
      h ^= Z_CASTLE[this.castle];
      this.ep = (flags & F_DOUBLE) ? from + (side ? -16 : 16) : -1;
      if (this.ep >= 0) h ^= Z_EP[this.ep & 7];
      this.half = (typeOf(piece) === P || captured) ? 0 : this.half + 1;
      if (side === BLACK) this.full++;
      this.side = side ^ 1;
      h ^= Z_SIDE;
      this.hash = h;
      this.hashHist.push(h);
      if (this.attacked(this.kings[side], side ^ 1)) { this.unmake(); return false; }
      return true;
    }

    unmake() {
      const u = this.stack.pop();
      this.hashHist.pop();
      const b = this.b;
      const m = u.m, from = mFrom(m), to = mTo(m), flags = mFlags(m);
      this.side ^= 1;
      const side = this.side;
      if (side === BLACK) this.full--;
      const moved = b[to];
      const piece = mPromo(m) ? ((side << 3) | P) : moved;
      b[from] = piece;
      b[to] = 0;
      if (u.captured) b[u.capSq] = u.captured;
      if (flags & F_CASTLE) {
        let rf, rt;
        if (to === 6) { rf = 7; rt = 5; } else if (to === 2) { rf = 0; rt = 3; }
        else if (to === 118) { rf = 119; rt = 117; } else { rf = 112; rt = 115; }
        b[rf] = b[rt]; b[rt] = 0;
      }
      if (typeOf(piece) === K) this.kings[side] = from;
      this.castle = u.castle; this.ep = u.ep; this.half = u.half; this.hash = u.hash;
    }

    makeNull() {
      this.stack.push({ m: 0, null: true, ep: this.ep, hash: this.hash, half: this.half });
      let h = this.hash;
      if (this.ep >= 0) h ^= Z_EP[this.ep & 7];
      this.ep = -1;
      this.side ^= 1;
      h ^= Z_SIDE;
      this.hash = h;
      this.hashHist.push(h);
    }
    unmakeNull() {
      const u = this.stack.pop();
      this.hashHist.pop();
      this.side ^= 1; this.ep = u.ep; this.hash = u.hash; this.half = u.half;
    }

    legalMoves() {
      const out = [];
      for (const m of this.gen([], false)) if (this.make(m)) { this.unmake(); out.push(m); }
      return out;
    }

    // repetition count of the current position in the game history (same side to move)
    repetitions() {
      let n = 0;
      const h = this.hash;
      for (let i = this.hashHist.length - 1, k = 0; i >= 0 && k <= this.half; i -= 2, k += 2) if (this.hashHist[i] === h) n++;
      return n;
    }

    insufficientMaterial() {
      const minors = [];
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const p = this.b[s];
        if (!p) continue;
        const t = typeOf(p);
        if (t === K) continue;
        if (t === P || t === R || t === Q) return false;
        minors.push({ t, s });
      }
      if (minors.length <= 1) return true;
      // only bishops, all on the same colour
      if (minors.every(x => x.t === B)) {
        const c = (minors[0].s + (minors[0].s >> 4)) & 1;
        return minors.every(x => ((x.s + (x.s >> 4)) & 1) === c);
      }
      return false;
    }

    // { over, result: '1-0' | '0-1' | '1/2-1/2', reason }
    status() {
      const legal = this.legalMoves();
      if (!legal.length) {
        if (this.inCheck()) return { over: true, result: this.side ? '1-0' : '0-1', reason: 'checkmate' };
        return { over: true, result: '1/2-1/2', reason: 'stalemate' };
      }
      if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty' };
      if (this.repetitions() >= 3) return { over: true, result: '1/2-1/2', reason: 'repetition' };
      if (this.insufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'material' };
      return { over: false, check: this.inCheck(), legal };
    }

    san(m, legal) {
      legal = legal || this.legalMoves();
      const from = mFrom(m), to = mTo(m), flags = mFlags(m), piece = this.b[from], t = typeOf(piece);
      let s;
      if (flags & F_CASTLE) s = (to & 7) === 6 ? 'O-O' : 'O-O-O';
      else {
        const cap = flags & F_CAP;
        if (t === P) {
          s = (cap ? 'abcdefgh'[from & 7] + 'x' : '') + sqName(to);
          if (mPromo(m)) s += '=' + ' PNBRQK'[mPromo(m)];
        } else {
          s = ' PNBRQK'[t];
          const others = legal.filter(o => o !== m && mTo(o) === to && this.b[mFrom(o)] === piece);
          if (others.length) {
            const sameFile = others.some(o => (mFrom(o) & 7) === (from & 7));
            const sameRank = others.some(o => (mFrom(o) >> 4) === (from >> 4));
            if (!sameFile) s += 'abcdefgh'[from & 7];
            else if (!sameRank) s += (from >> 4) + 1;
            else s += sqName(from);
          }
          s += (cap ? 'x' : '') + sqName(to);
        }
      }
      if (this.make(m)) {
        if (this.inCheck()) s += this.legalMoves().length ? '+' : '#';
        this.unmake();
      }
      return s;
    }

    uci(m) { return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? ' pnbrqk'[mPromo(m)] : ''); }
    fromUci(u) {
      const from = sqFromName(u.slice(0, 2)), to = sqFromName(u.slice(2, 4));
      const promo = u[4] ? { n: N, b: B, r: R, q: Q }[u[4]] : 0;
      return this.legalMoves().find(m => mFrom(m) === from && mTo(m) === to && mPromo(m) === promo) || 0;
    }
  }

  // ───────────────────────────────────────────────────────────
  //  EVALUATION (simplified PST + tapered king, mop-up in won endings)
  // ───────────────────────────────────────────────────────────
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const PST = {
    1: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    2: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    3: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    4: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    5: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    6: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    7: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
  };
  const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

  function evaluate(pos) {
    const b = pos.b;
    let mg = [0, 0], kingMid = [0, 0], kingEnd = [0, 0], mat = [0, 0], phase = 0, bishops = [0, 0], pawnAdv = [0, 0];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (!p) continue;
      const c = colorOf(p), t = typeOf(p), r = s >> 4, f = s & 7;
      const idx = c === WHITE ? (7 - r) * 8 + f : r * 8 + f;
      phase += PHASE_W[t];
      if (t === K) { kingMid[c] = PST[6][idx]; kingEnd[c] = PST[7][idx]; continue; }
      mat[c] += VAL[t];
      mg[c] += PST[t][idx];
      if (t === B) bishops[c]++;
      if (t === P) { const adv = c === WHITE ? r - 1 : 6 - r; pawnAdv[c] += adv * adv * 2; }
    }
    if (phase > 24) phase = 24;
    let score = [0, 0];
    for (let c = 0; c < 2; c++) {
      score[c] = mat[c] + mg[c] + (kingMid[c] * phase + kingEnd[c] * (24 - phase)) / 24
        + (bishops[c] >= 2 ? 30 : 0) + pawnAdv[c] * (24 - phase) / 24;
    }
    // mop-up: drive the lone/weak king to the edge and bring our king closer
    const diff = mat[0] - mat[1];
    if (phase <= 8 && Math.abs(diff) >= 300) {
      const strong = diff > 0 ? 0 : 1, weak = strong ^ 1;
      const wk = pos.kings[weak], sk = pos.kings[strong];
      const wf = wk & 7, wr = wk >> 4;
      const center = Math.max(3 - wf, wf - 4) + Math.max(3 - wr, wr - 4);
      const dist = Math.abs((wk & 7) - (sk & 7)) + Math.abs((wk >> 4) - (sk >> 4));
      score[strong] += center * 12 + (14 - dist) * 5;
    }
    const s = Math.round(score[0] - score[1]);
    return pos.side === WHITE ? s : -s;
  }

  // ───────────────────────────────────────────────────────────
  //  SEARCH
  // ───────────────────────────────────────────────────────────
  const MATE = 30000, INF = 32000;
  const TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const ttKey = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE), ttScore = new Int16Array(TT_SIZE);
  const ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE); // 1 exact, 2 lower, 3 upper

  class Searcher {
    constructor(pos) {
      this.pos = pos;
      this.killers = Array.from({ length: 128 }, () => [0, 0]);
      this.history = new Int32Array(16 * 128);
      this.nodes = 0; this.stop = false; this.deadline = Infinity;
    }

    timeUp() {
      if ((++this.nodes & 2047) === 0 && Date.now() > this.deadline) this.stop = true;
      return this.stop;
    }

    order(moves, ttm, ply) {
      const b = this.pos.b, k = this.killers[ply];
      const sc = new Int32Array(moves.length);
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        if (m === ttm) sc[i] = 1e7;
        else if (mFlags(m) & F_CAP) {
          const victim = (mFlags(m) & F_EP) ? P : typeOf(b[mTo(m)]);
          sc[i] = 1e6 + victim * 10 - typeOf(b[mFrom(m)]);
        } else if (mPromo(m)) sc[i] = 9e5 + mPromo(m);
        else if (m === k[0]) sc[i] = 8e5;
        else if (m === k[1]) sc[i] = 7e5;
        else sc[i] = this.history[b[mFrom(m)] * 128 + mTo(m)];
      }
      // selection-friendly full sort (lists are short)
      const idx = moves.map((_, i) => i).sort((a, c) => sc[c] - sc[a]);
      return idx.map(i => moves[i]);
    }

    quiesce(alpha, beta, ply) {
      if (this.timeUp()) return 0;
      const pos = this.pos;
      const stand = evaluate(pos);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (ply > 60) return stand;
      const moves = this.order(pos.gen([], true), 0, Math.min(ply, 127));
      for (const m of moves) {
        // delta pruning
        if (!mPromo(m)) {
          const victim = (mFlags(m) & F_EP) ? P : typeOf(pos.b[mTo(m)]);
          if (stand + VAL[victim] + 200 < alpha) continue;
        }
        if (!pos.make(m)) continue;
        const sc = -this.quiesce(-beta, -alpha, ply + 1);
        pos.unmake();
        if (this.stop) return 0;
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }

    search(depth, alpha, beta, ply, allowNull) {
      const pos = this.pos;
      if (this.timeUp()) return 0;
      if (ply > 0) {
        if (pos.half >= 100) return 0;
        // repetition inside the search or with game history → draw
        const h = pos.hash, hh = pos.hashHist;
        for (let i = hh.length - 3, k = 2; i >= 0 && k <= pos.half; i -= 2, k += 2) if (hh[i] === h) return 0;
        // mate distance pruning
        alpha = Math.max(alpha, -MATE + ply);
        beta = Math.min(beta, MATE - ply - 1);
        if (alpha >= beta) return alpha;
      }
      const inCheck = pos.inCheck();
      if (inCheck) depth++;
      if (depth <= 0) return this.quiesce(alpha, beta, ply);

      const ti = pos.hash & TT_MASK;
      let ttm = 0;
      if (ttKey[ti] === pos.hash) {
        ttm = ttMove[ti];
        if (ply > 0 && ttDepth[ti] >= depth) {
          let s = ttScore[ti];
          if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
          const f = ttFlag[ti];
          if (f === 1 || (f === 2 && s >= beta) || (f === 3 && s <= alpha)) return s;
        }
      }

      // null-move pruning
      if (allowNull && !inCheck && depth >= 3 && ply > 0 && this.hasPieces(pos.side)) {
        pos.makeNull();
        const s = -this.search(depth - 3, -beta, -beta + 1, ply + 1, false);
        pos.unmakeNull();
        if (this.stop) return 0;
        if (s >= beta) return beta;
      }

      const moves = this.order(pos.gen([], false), ttm, Math.min(ply, 127));
      let best = -INF, bestMove = 0, legal = 0, flag = 3;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        if (!pos.make(m)) continue;
        legal++;
        const quiet = !(mFlags(m) & F_CAP) && !mPromo(m);
        let sc;
        if (legal === 1) sc = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
        else {
          let red = (depth >= 3 && legal > 4 && quiet && !inCheck) ? 1 + (legal > 12 ? 1 : 0) : 0;
          sc = -this.search(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
          if (sc > alpha && (red || sc < beta)) sc = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
        }
        pos.unmake();
        if (this.stop) return 0;
        if (sc > best) { best = sc; bestMove = m; }
        if (sc > alpha) {
          alpha = sc; flag = 1;
          if (sc >= beta) {
            flag = 2;
            if (quiet) {
              const k = this.killers[Math.min(ply, 127)];
              if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
              this.history[pos.b[mFrom(m)] * 128 + mTo(m)] += depth * depth;
            }
            break;
          }
        }
      }
      if (!legal) return inCheck ? -MATE + ply : 0;
      let st = best;
      if (st > MATE - 200) st += ply; else if (st < -MATE + 200) st -= ply;
      ttKey[ti] = pos.hash; ttMove[ti] = bestMove; ttScore[ti] = st; ttDepth[ti] = depth; ttFlag[ti] = flag;
      return best;
    }

    hasPieces(side) {
      const b = this.pos.b;
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const p = b[s];
        if (p && colorOf(p) === side) { const t = typeOf(p); if (t !== P && t !== K) return true; }
      }
      return false;
    }

    // score every root move with a full window at a fixed depth (used by the easy level)
    rootScores(depth) {
      const pos = this.pos, out = [];
      for (const m of pos.legalMoves()) {
        pos.make(m);
        const s = -this.search(depth - 1, -INF, INF, 1, true);
        pos.unmake();
        out.push({ m, s });
      }
      return out.sort((a, c) => c.s - a.s);
    }

    iterate(maxDepth, ms) {
      const pos = this.pos;
      this.deadline = Date.now() + ms;
      this.stop = false; this.nodes = 0;
      const legal = pos.legalMoves();
      if (!legal.length) return { move: 0, score: 0, depth: 0 };
      let bestMove = legal[0], bestScore = 0, done = 0;
      let rootMoves = legal.slice();
      for (let d = 1; d <= maxDepth; d++) {
        let alpha = -INF, beta = INF, curBest = 0, curScore = -INF;
        rootMoves = this.order(rootMoves, bestMove, 0);
        for (let i = 0; i < rootMoves.length; i++) {
          const m = rootMoves[i];
          pos.make(m);
          let sc;
          if (i === 0) sc = -this.search(d - 1, -beta, -alpha, 1, true);
          else {
            sc = -this.search(d - 1, -alpha - 1, -alpha, 1, true);
            if (sc > alpha && !this.stop) sc = -this.search(d - 1, -beta, -alpha, 1, true);
          }
          pos.unmake();
          if (this.stop) break;
          if (sc > curScore) { curScore = sc; curBest = m; }
          if (sc > alpha) alpha = sc;
        }
        if (this.stop && !curBest) break;
        if (curBest) { bestMove = curBest; bestScore = curScore; done = d; }
        if (this.stop) break;
        if (Math.abs(bestScore) > MATE - 100) break; // found a forced mate
        if (Date.now() > this.deadline - ms * 0.45) break; // next depth would likely not finish
      }
      return { move: bestMove, score: bestScore, depth: done, nodes: this.nodes };
    }
  }

  // Tiny opening book (keyed by the UCI move history) so games don't always start the same way
  const BOOK = {
    '': ['e2e4', 'e2e4', 'd2d4', 'd2d4', 'c2c4', 'g1f3'],
    'e2e4': ['e7e5', 'e7e5', 'c7c5', 'e7e6', 'c7c6'],
    'd2d4': ['d7d5', 'g8f6'],
    'c2c4': ['e7e5', 'g8f6'],
    'g1f3': ['d7d5', 'g8f6'],
    'e2e4 e7e5': ['g1f3'],
    'e2e4 e7e5 g1f3': ['b8c6', 'b8c6', 'g8f6'],
    'e2e4 e7e5 g1f3 b8c6': ['f1b5', 'f1c4', 'd2d4'],
    'e2e4 c7c5': ['g1f3', 'b1c3'],
    'e2e4 c7c5 g1f3': ['d7d6', 'b8c6', 'e7e6'],
    'e2e4 e7e6': ['d2d4'], 'e2e4 e7e6 d2d4': ['d7d5'],
    'e2e4 c7c6': ['d2d4'], 'e2e4 c7c6 d2d4': ['d7d5'],
    'd2d4 d7d5': ['c2c4', 'g1f3'],
    'd2d4 d7d5 c2c4': ['e7e6', 'c7c6', 'd5c4'],
    'd2d4 g8f6': ['c2c4', 'g1f3'],
    'd2d4 g8f6 c2c4': ['e7e6', 'g7g6'],
    'c2c4 e7e5': ['b1c3'], 'c2c4 g8f6': ['b1c3', 'g1f3'],
    'g1f3 d7d5': ['d2d4', 'g2g3'], 'g1f3 g8f6': ['c2c4', 'd2d4'],
  };

  // level: 'easy' | 'medium' | 'hard' | 'hint'; history: array of UCI moves played so far (optional)
  function think(pos, level, history) {
    if (history && level !== 'easy') {
      const opts = BOOK[history.join(' ')];
      if (opts) {
        const m = pos.fromUci(opts[(Math.random() * opts.length) | 0]);
        if (m) return { move: m, score: 0, depth: 0, book: true };
      }
    }
    const s = new Searcher(pos);
    if (level === 'easy') {
      const scored = s.rootScores(2);
      if (!scored.length) return { move: 0 };
      const best = scored[0].s;
      // pick among reasonable moves, sometimes a clear mistake
      const pool = scored.filter(x => x.s >= best - (Math.random() < 0.2 ? 400 : 120));
      const pick = pool[(Math.random() * Math.min(pool.length, 5)) | 0];
      return { move: pick.m, score: pick.s, depth: 2 };
    }
    if (level === 'medium') {
      const r = s.iterate(4, 700);
      return r;
    }
    if (level === 'hint') return s.iterate(64, 1200);
    return s.iterate(64, 2200);
  }

  function perft(pos, depth) {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of pos.gen([], false)) {
      if (!pos.make(m)) continue;
      n += depth === 1 ? 1 : perft(pos, depth - 1);
      pos.unmake();
    }
    return n;
  }

  const Chess = {
    Position, think, perft, evaluate, START_FEN,
    WHITE, BLACK, P, N, B, R, Q, K, F_CAP, F_EP, F_CASTLE, F_DOUBLE, F_PROMO,
    colorOf, typeOf, mFrom, mTo, mPromo, mFlags, sqName, sqFromName,
  };
  root.Chess = Chess;
  if (typeof module !== 'undefined' && module.exports) module.exports = Chess;
})(typeof self !== 'undefined' ? self : this);
