// games/rummikub/engine.js
// Rummikub (拉密) rules + CPU players.
//
// 106 tiles: colours 0..3 (red, blue, orange, black) × numbers 1..13 × 2 copies, plus 2 jokers.
// Tile ids: 0..103 = copy*52 + colour*13 + (n-1); 104, 105 = jokers.
// A table is an array of melds; a meld is an array of tile ids.

(function (root) {
  'use strict';

  const JOKER_IDS = [104, 105];
  const TILES = [];
  for (let id = 0; id < 106; id++) {
    if (id >= 104) TILES.push({ id, j: true, c: -1, n: 0 });
    else TILES.push({ id, j: false, c: Math.floor((id % 52) / 13), n: (id % 13) + 1 });
  }
  const T = id => TILES[id];
  const isJ = id => id >= 104;
  const penalty = id => (isJ(id) ? 30 : T(id).n);

  // ── RNG ─────────────────────────────────────────────────
  function rng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function shuffle(a, r) {
    r = r || Math.random;
    for (let i = a.length - 1; i > 0; i--) { const k = (r() * (i + 1)) | 0; [a[i], a[k]] = [a[k], a[i]]; }
    return a;
  }

  function deal(nPlayers, r) {
    const pool = shuffle([...Array(106).keys()], r);
    const racks = [];
    for (let p = 0; p < nPlayers; p++) racks.push(pool.splice(0, 14));
    return { pool, racks };
  }

  // ── Meld validation ─────────────────────────────────────
  // Returns { ok, kind, value, order } — order = tile ids in display order, value = sum of the numbers
  // the tiles stand for (jokers count as the tile they replace). When a meld could be both a group and
  // a run, the higher-value reading is used.
  function meldInfo(ids) {
    const L = ids.length;
    if (L < 3) return { ok: false };
    const jokers = ids.filter(isJ), real = ids.filter(id => !isJ(id));
    if (!real.length) return { ok: false };
    let best = null;

    // group: 3–4 tiles, same number, all different colours
    if (L <= 4) {
      const n = T(real[0]).n;
      const colours = new Set(real.map(id => T(id).c));
      if (real.every(id => T(id).n === n) && colours.size === real.length) {
        const order = real.slice().sort((a, b) => T(a).c - T(b).c).concat(jokers);
        best = { ok: true, kind: 'group', value: n * L, order, number: n };
      }
    }

    // run: 3+ tiles, same colour, consecutive numbers (jokers fill gaps / extend)
    if (L <= 13) {
      const c = T(real[0]).c;
      const nums = real.map(id => T(id).n).sort((a, b) => a - b);
      const sameColour = real.every(id => T(id).c === c);
      const distinct = new Set(nums).size === nums.length;
      if (sameColour && distinct) {
        const lo = nums[0], hi = nums[nums.length - 1];
        const span = hi - lo + 1;
        if (span <= L) {
          // extra jokers go on top first (up to 13), then below
          let extra = L - span, start = lo, end = hi;
          while (extra > 0 && end < 13) { end++; extra--; }
          while (extra > 0 && start > 1) { start--; extra--; }
          if (extra === 0) {
            const byNum = new Map(real.map(id => [T(id).n, id]));
            const js = jokers.slice();
            const order = [];
            let value = 0;
            for (let k = start; k <= end; k++) { order.push(byNum.has(k) ? byNum.get(k) : js.shift()); value += k; }
            if (!best || value > best.value) best = { ok: true, kind: 'run', value, order, start, colour: c };
          }
        }
      }
    }
    return best || { ok: false };
  }

  const tableValid = table => table.every(m => meldInfo(m).ok);

  // ── Turn validation (used for the human player) ─────────
  // start/end: { table, rack } ; opened: has this player already made the initial meld?
  function checkTurn(startTable, endTable, startRack, endRack, opened) {
    const startRackSet = new Set(startRack);
    const endRackSet = new Set(endRack);
    const played = startRack.filter(id => !endRackSet.has(id));
    if (endRack.some(id => !startRackSet.has(id))) return { ok: false, reason: 'tookFromTable' };
    const startTiles = new Set(startTable.flat());
    const endTiles = endTable.flat();
    if (endTiles.length !== startTiles.size + played.length) return { ok: false, reason: 'tookFromTable' };
    if (!played.length) return { ok: false, reason: 'noTiles' };
    const bad = endTable.findIndex(m => !meldInfo(m).ok);
    if (bad >= 0) return { ok: false, reason: 'invalid', meld: bad };
    if (!opened) {
      // table melds that existed at the start must be untouched; new melds only from own tiles
      const key = m => m.slice().sort((a, b) => a - b).join(',');
      const endKeys = new Map();
      endTable.forEach(m => endKeys.set(key(m), (endKeys.get(key(m)) || 0) + 1));
      for (const m of startTable) {
        const k = key(m);
        if (!endKeys.get(k)) return { ok: false, reason: 'notOpenedTouch' };
        endKeys.set(k, endKeys.get(k) - 1);
      }
      const playedSet = new Set(played);
      const newMelds = endTable.filter(m => m.some(id => playedSet.has(id)));
      if (newMelds.some(m => m.some(id => !playedSet.has(id)))) return { ok: false, reason: 'notOpenedTouch' };
      const value = newMelds.reduce((s, m) => s + meldInfo(m).value, 0);
      if (value < 30) return { ok: false, reason: 'under30', value };
      return { ok: true, played, value, opened: true };
    }
    return { ok: true, played };
  }

  // ── Candidate melds from a set of tiles ─────────────────
  // first: optional tile id that must be part of every candidate (it is preferred over its duplicate)
  function candidates(ids, mustContain) {
    const buckets = new Map(); // c*16+n -> [ids]
    const jokers = [];
    for (const id of ids) {
      if (isJ(id)) { jokers.push(id); continue; }
      const k = T(id).c * 16 + T(id).n;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(id);
    }
    if (mustContain !== undefined && !isJ(mustContain)) {
      const b = buckets.get(T(mustContain).c * 16 + T(mustContain).n);
      if (b) { b.splice(b.indexOf(mustContain), 1); b.unshift(mustContain); }
    }
    if (mustContain !== undefined && isJ(mustContain)) { jokers.splice(jokers.indexOf(mustContain), 1); jokers.unshift(mustContain); }
    const J = jokers.length;
    const pick = (c, n) => { const b = buckets.get(c * 16 + n); return b && b.length ? b[0] : -1; };
    const out = [];
    const want = mustContain;
    const push = m => { if (want === undefined || m.includes(want)) out.push(m); };

    // groups
    for (let n = 1; n <= 13; n++) {
      if (want !== undefined && !isJ(want) && T(want).n !== n) continue;
      const avail = [0, 1, 2, 3].filter(c => pick(c, n) >= 0);
      const subsets = [];
      const rec = (i, cur) => {
        if (cur.length) subsets.push(cur.slice());
        for (let k = i; k < avail.length; k++) { cur.push(avail[k]); rec(k + 1, cur); cur.pop(); }
      };
      rec(0, []);
      for (const sub of subsets) {
        for (let size = 3; size <= 4; size++) {
          const needJ = size - sub.length;
          if (needJ < 0 || needJ > J) continue;
          push(sub.map(c => pick(c, n)).concat(jokers.slice(0, needJ)));
        }
      }
    }
    // runs
    for (let c = 0; c < 4; c++) {
      if (want !== undefined && !isJ(want) && T(want).c !== c) continue;
      for (let s = 1; s <= 11; s++) {
        let missing = 0;
        const seq = [];
        for (let n = s; n <= 13; n++) {
          const id = pick(c, n);
          if (id < 0) missing++;
          if (missing > J) break;
          seq.push(id);
          if (seq.length >= 3) {
            if (seq.every(x => x < 0)) continue;
            let ji = 0;
            push(seq.map(x => (x >= 0 ? x : jokers[ji++])));
          }
        }
      }
    }
    return out;
  }

  // best set of disjoint melds from `ids` (maximise tiles, then value); minValue for the initial meld
  function bestMeldSet(ids, opts) {
    opts = opts || {};
    const minValue = opts.minValue || 0, nodeLimit = opts.nodeLimit || 20000;
    const cands = candidates(ids).map(m => ({ m, v: meldInfo(m).value }))
      .filter(x => meldInfo(x.m).ok)
      .sort((a, b) => b.m.length - a.m.length || b.v - a.v);
    let best = { melds: [], tiles: 0, value: 0 };
    let nodes = 0;
    const used = new Set();
    const cur = [];
    const rec = (i, tiles, value) => {
      if (++nodes > nodeLimit) return;
      if (value >= minValue && (tiles > best.tiles || (tiles === best.tiles && value > best.value))) {
        best = { melds: cur.map(x => x.slice()), tiles, value };
      }
      if (tiles + (ids.length - used.size) <= best.tiles && value >= minValue) return; // bound
      for (let k = i; k < cands.length; k++) {
        const { m, v } = cands[k];
        if (m.some(id => used.has(id))) continue;
        m.forEach(id => used.add(id)); cur.push(m);
        rec(k + 1, tiles + m.length, value + v);
        cur.pop(); m.forEach(id => used.delete(id));
        if (nodes > nodeLimit) return;
      }
    };
    rec(0, 0, 0);
    return best.value >= minValue && best.melds.length ? best : null;
  }

  // add single hand tiles onto table melds (ends of runs, 4th of a group, or split a run)
  function extendTable(table, hand, allowJokers) {
    table = table.map(m => m.slice());
    hand = hand.slice();
    const played = [];
    let changed = true;
    while (changed) {
      changed = false;
      const order = hand.slice().sort((a, b) => (isJ(a) - isJ(b)));
      for (const t of order) {
        if (isJ(t) && !allowJokers) continue;
        let done = false;
        for (let i = 0; i < table.length && !done; i++) {
          const m = table[i];
          if (meldInfo(m.concat(t)).ok) { table[i] = meldInfo(m.concat(t)).order; done = true; break; }
          // split a run around a duplicate number: [3..9] + 6 → [3..6] [6..9]
          const info = meldInfo(m);
          if (!isJ(t) && info.kind === 'run' && info.colour === T(t).c && m.length >= 5) {
            const pos = T(t).n - info.start;
            if (pos >= 2 && pos <= m.length - 3) {
              const a = info.order.slice(0, pos + 1), b = [t].concat(info.order.slice(pos + 1));
              if (meldInfo(a).ok && meldInfo(b).ok) { table.splice(i, 1, meldInfo(a).order, meldInfo(b).order); done = true; }
            }
          }
        }
        if (done) { hand.splice(hand.indexOf(t), 1); played.push(t); changed = true; }
      }
    }
    return { table, played };
  }

  // full rearrangement search: every table tile must stay in a valid meld, use as many hand tiles as possible
  function solveTable(table, hand, budgetMs) {
    const deadline = Date.now() + (budgetMs || 300);
    const mandatory = table.flat();
    let best = null, nodes = 0;
    const melds = [];
    const rec = (mand, opt) => {
      if (++nodes > 6000 || Date.now() > deadline) return;
      if (!mand.length) {
        const extra = opt.length >= 3 ? bestMeldSet(opt, { nodeLimit: 3000 }) : null;
        const used = (hand.length - opt.length) + (extra ? extra.tiles : 0);
        if (!best || used > best.used) best = { used, table: melds.map(m => m.slice()).concat(extra ? extra.melds : []) };
        return;
      }
      // a mandatory non-joker tile first (fewer options), smallest number
      const x = mand.slice().sort((a, b) => (isJ(a) - isJ(b)) || (T(a).n - T(b).n))[0];
      const pool = mand.concat(opt);
      const cs = candidates(pool, x).filter(m => meldInfo(m).ok);
      // prefer melds that pull in hand tiles
      const optSet = new Set(opt);
      cs.sort((a, b) => b.filter(id => optSet.has(id)).length - a.filter(id => optSet.has(id)).length || a.length - b.length);
      for (const m of cs) {
        const ms = new Set(m);
        melds.push(m);
        rec(mand.filter(id => !ms.has(id)), opt.filter(id => !ms.has(id)));
        melds.pop();
        if (best && best.used === hand.length) return;
        if (nodes > 6000 || Date.now() > deadline) return;
      }
    };
    rec(mandatory, hand.slice());
    if (!best || !best.used) return null;
    const placed = new Set(best.table.flat());
    return { table: best.table.map(m => meldInfo(m).order), played: hand.filter(id => placed.has(id)) };
  }

  // ── CPU move ─────────────────────────────────────────────
  // returns { table, played } or null (→ draw a tile)
  function cpuMove(table, rack, opened, level, r) {
    r = r || Math.random;
    if (!opened) {
      const first = bestMeldSet(rack, { minValue: 30, nodeLimit: level === 'easy' ? 4000 : 25000 });
      if (!first) return null;
      let melds = first.melds;
      if (level === 'easy') {
        // easy: lay down only as much as needed to reach 30
        melds = melds.slice().sort((a, b) => meldInfo(b).value - meldInfo(a).value);
        const keep = []; let v = 0;
        for (const m of melds) { keep.push(m); v += meldInfo(m).value; if (v >= 30) break; }
        melds = keep;
      }
      return { table: table.map(m => m.slice()).concat(melds.map(m => meldInfo(m).order)), played: melds.flat(), opened: true };
    }
    // 1) melds from the hand
    let t = table.map(m => m.slice());
    let hand = rack.slice();
    let played = [];
    const own = bestMeldSet(hand, { nodeLimit: level === 'easy' ? 3000 : 20000 });
    if (own) {
      if (level === 'easy' && r() < 0.3) own.melds = own.melds.slice(0, 1);
      for (const m of own.melds) { t.push(meldInfo(m).order); played.push(...m); }
      hand = hand.filter(id => !played.includes(id));
    }
    // 2) add single tiles to the table
    if (level !== 'easy' || r() < 0.7) {
      const ext = extendTable(t, hand, level !== 'easy');
      t = ext.table; played.push(...ext.played);
      hand = hand.filter(id => !ext.played.includes(id));
    }
    // 3) full rearrangement if it places more tiles
    // (medium also tries it, more briefly, when it would otherwise have to draw)
    if (hand.length && (level === 'hard' || (level === 'medium' && !played.length))) {
      const sol = solveTable(table, rack, level === 'hard' ? 350 : 150);
      if (sol && sol.played.length > played.length) { t = sol.table; played = sol.played; }
    }
    if (!played.length) return null;
    return { table: t, played };
  }

  const handValue = rack => rack.reduce((s, id) => s + penalty(id), 0);

  const Rummikub = {
    TILES, JOKER_IDS, isJ, penalty, rng, shuffle, deal,
    meldInfo, tableValid, checkTurn, candidates, bestMeldSet, extendTable, solveTable, cpuMove, handValue,
  };
  root.Rummikub = Rummikub;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rummikub;
})(typeof self !== 'undefined' ? self : this);
