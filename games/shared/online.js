// games/shared/online.js
// Online rooms for sillygames — create a room, share the 6-digit code (or link),
// friends join without signing in, the host can fill empty seats with CPU players,
// late-comers watch as spectators. One room = one game.
//
// Backends
//   • Firestore (default): rooms/{code}. Uses the signed-in user, or an anonymous
//     Firebase account when nobody is signed in (enable "Anonymous" in Firebase Auth).
//   • Local (?online=local): rooms live in localStorage — lets two tabs of the same
//     browser play each other. Used for development and automated tests.
//
// A game page uses it like this:
//   SillyOnline.mount({
//     game: 'chess', title: {zh:'西洋棋', en:'Chess'}, seats: 2,
//     seatLabel: (i, lang, room) => ..., seatColor: (i, room) => '#fff',
//     seatCounts: [2,3,4], defaultSeats: () => 2,      // optional: host picks the number of seats
//     options: [{ key, label:{zh,en}, values:[{v, label}] }], defaultOpts: () => ({}),   // optional room options
//     cpuLevels: ['easy','medium','hard'],
//     newState: room => ({ moves: [] }),             // state when the host presses Start
//     rematch: room => room,                          // optional: changes for "play again"
//     onLeaveGame: (room, seat) => room,              // optional: e.g. leaving = resigning
//     onRoom: room => { ... },                        // every update while playing
//     onExit: () => { ... },                          // the player left the room
//   });
//   SillyOnline.openEntry();                          // name + create / join dialog
//   SillyOnline.mutate(room => { room.state.moves.push(m); return room; });
//   SillyOnline.mySeat()                              // seat index, -1 = spectator
//   SillyOnline.isHost(), SillyOnline.me.id, SillyOnline.room

(function (root) {
  'use strict';

  const PRESENCE_MS = 20000, OFFLINE_MS = 65000;
  const LS_ROOM = 'sg_online_room', LS_NICK = 'sg_nick';
  const params = new URLSearchParams(location.search);
  const LOCAL = params.get('online') === 'local';

  // ─────────────────────────────── language
  const DICT = {
    zh: {
      online: '🌐 連線對戰', yourName: '你的暱稱', namePh: '輸入暱稱',
      create: '＋ 建立房間', join: '加入', codePh: '6 位數房間代碼', or: '或輸入朋友給你的代碼',
      entryIntro: '不用登入！建立房間後把代碼傳給朋友，朋友輸入代碼就能一起玩。',
      roomCode: '房間代碼', copy: '📋 複製代碼', copyLink: '🔗 複製邀請連結', copied: '已複製！',
      waiting: '等待加入…', addCpu: '＋ 電腦', removeCpu: '移除', host: '房主', you: '你', offline: '離線',
      cpuName: lv => `電腦（${({ easy: '簡單', medium: '中等', hard: '困難' })[lv] || lv}）`,
      spectators: '觀戰', noSpectators: '目前沒有人觀戰',
      start: '▶ 開始', swap: '🔀 交換座位', leave: '✕ 離開', cancel: '取消',
      cpuShort: lv => '🤖 ' + ({ easy: '簡單', medium: '中等', hard: '困難' })[lv], addCpuLabel: '補電腦：',
      waitHost: '等待房主開始遊戲…', needPlayers: '座位坐滿才能開始（可以補電腦）',
      lobbyTip: '把代碼或連結傳給朋友。空位可以按「＋ 電腦」補上電腦玩家。',
      joining: '連線中…', creating: '建立房間中…',
      errName: '請先輸入暱稱', errCode: '請輸入 6 位數字的房間代碼', errNoRoom: '找不到這個房間，請確認代碼',
      errGame: g => `這個代碼是「${g}」的房間`, errOffline: '連線功能暫時無法使用，請檢查網路後重新整理',
      errAnon: '連線功能還沒開放（Firebase 尚未啟用匿名登入）', errPerm: '連線功能還沒開放（資料庫規則尚未設定）',
      errGeneric: '連線失敗，請再試一次', errClosed: '房間已經關閉了', kicked: '你已離開房間',
      spectating: '你正在觀戰', rejoin: '回到房間', roomFull: '座位已滿，你會以觀戰身分加入',
      cpuLevel: '電腦難度', numPlayers: '人數',
    },
    en: {
      online: '🌐 Play Online', yourName: 'Your nickname', namePh: 'Type a nickname',
      create: '＋ Create Room', join: 'Join', codePh: '6-digit room code', or: 'or enter a code from a friend',
      entryIntro: 'No sign-in needed! Create a room and send the code to your friends — they type it in to join.',
      roomCode: 'Room code', copy: '📋 Copy code', copyLink: '🔗 Copy invite link', copied: 'Copied!',
      waiting: 'Waiting…', addCpu: '＋ CPU', removeCpu: 'Remove', host: 'Host', you: 'You', offline: 'offline',
      cpuName: lv => `CPU (${({ easy: 'Easy', medium: 'Medium', hard: 'Hard' })[lv] || lv})`,
      spectators: 'Watching', noSpectators: 'Nobody is watching yet',
      start: '▶ Start', swap: '🔀 Swap', leave: '✕ Leave', cancel: 'Cancel',
      cpuShort: lv => '🤖 ' + ({ easy: 'Easy', medium: 'Medium', hard: 'Hard' })[lv], addCpuLabel: 'Add CPU:',
      waitHost: 'Waiting for the host to start…', needPlayers: 'Fill every seat to start (you can add CPUs)',
      lobbyTip: 'Send the code or link to your friends. Press "＋ CPU" to fill an empty seat with a computer player.',
      joining: 'Connecting…', creating: 'Creating room…',
      errName: 'Please enter a nickname', errCode: 'Please enter the 6-digit room code', errNoRoom: "Can't find that room — check the code",
      errGame: g => `That code belongs to a ${g} room`, errOffline: 'Online play is unavailable right now — check your connection and reload',
      errAnon: 'Online play is not switched on yet (Firebase anonymous sign-in is off)', errPerm: 'Online play is not switched on yet (database rules missing)',
      errGeneric: 'Connection failed — please try again', errClosed: 'The room has closed', kicked: 'You left the room',
      spectating: "You're watching", rejoin: 'Back to room', roomFull: 'The seats are full — you will join as a spectator',
      cpuLevel: 'CPU level', numPlayers: 'Players',
    },
  };
  const GAME_NAMES = { chess: { zh: '西洋棋', en: 'Chess' }, go: { zh: '圍棋', en: 'Go' }, 'chinese-checkers': { zh: '跳棋', en: 'Chinese Checkers' }, rummikub: { zh: '拉密', en: 'Rummikub' } };
  const lang = () => { try { const v = localStorage.getItem('sg_lang'); if (v === 'zh' || v === 'en') return v; } catch (e) {} return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'; };
  const t = (k, ...a) => { const v = DICT[lang()][k] ?? DICT.zh[k] ?? k; return typeof v === 'function' ? v(...a) : v; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ─────────────────────────────── backends
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  const clone = o => JSON.parse(JSON.stringify(o));
  // members = uids of the people sitting in a seat (the security rules use this list)
  const withMembers = r => { if (r && Array.isArray(r.seats)) r.members = r.seats.filter(x => x && !x.cpu && !x.left && x.id).map(x => x.id); return r; };

  const LocalBackend = {
    name: 'local',
    async init() {
      let id = sessionStorage.getItem('sgo_local_id');
      if (!id) { id = 'L' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('sgo_local_id', id); }
      return { id };
    },
    _key: code => 'sgo_room_' + code,
    async get(code) { try { return JSON.parse(localStorage.getItem(this._key(code))); } catch (e) { return null; } },
    async transact(code, fn) {
      const cur = await this.get(code);
      const next = withMembers(fn(cur ? clone(cur) : null));
      if (next === undefined) return cur;
      if (next === null) localStorage.removeItem(this._key(code));
      else localStorage.setItem(this._key(code), JSON.stringify(next));
      this._fire(code);
      return next;
    },
    async expired(limit) {
      const out = [];
      for (let i = 0; i < localStorage.length && out.length < limit; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('sgo_room_')) continue;
        try { const r = JSON.parse(localStorage.getItem(k)); if (r && r.expireAt < Date.now()) out.push(r); } catch (e) {}
      }
      return out;
    },
    async remove(code) { localStorage.removeItem(this._key(code)); this._fire(code); },
    _subs: {},
    _fire(code) { (this._subs[code] || []).forEach(f => f()); },
    watch(code, cb) {
      const read = () => this.get(code).then(cb);
      const onStorage = e => { if (e.key === this._key(code)) read(); };
      window.addEventListener('storage', onStorage);
      (this._subs[code] = this._subs[code] || []).push(read);
      read();
      return () => { window.removeEventListener('storage', onStorage); this._subs[code] = (this._subs[code] || []).filter(f => f !== read); };
    },
  };

  const FireBackend = {
    name: 'firestore',
    db: null,
    async init() {
      if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) throw { code: 'offline' };
      const auth = firebase.auth();
      this.db = firebase.firestore();
      // wait for the first auth state, then fall back to an anonymous account
      let user = await new Promise(res => { let off = null, done = false; off = auth.onAuthStateChanged(u => { if (done) return; done = true; res(u); setTimeout(() => off && off(), 0); }); });
      if (!user) user = (await auth.signInAnonymously()).user;
      return { id: user.uid, displayName: user.isAnonymous ? '' : (user.displayName || '') };
    },
    _ref(code) { return this.db.collection('rooms').doc(code); },
    async get(code) { const s = await this._ref(code).get(); return s.exists ? s.data() : null; },
    async transact(code, fn) {
      const ref = this._ref(code);
      return this.db.runTransaction(async tx => {
        const s = await tx.get(ref);
        const next = withMembers(fn(s.exists ? clone(s.data()) : null));
        if (next === undefined) return s.exists ? s.data() : null;
        if (next === null) tx.delete(ref); else tx.set(ref, next);
        return next;
      });
    },
    async expired(limit) {
      const q = await this.db.collection('rooms').where('expireAt', '<', Date.now()).limit(limit).get();
      return q.docs.map(d => d.data());
    },
    async remove(code) { await this._ref(code).delete(); },
    watch(code, cb) { return this._ref(code).onSnapshot(s => cb(s.exists ? s.data() : null), () => cb(undefined)); },
  };

  // ─────────────────────────────── core
  const O = {
    backend: LOCAL ? LocalBackend : FireBackend,
    me: null, room: null, code: null, cfg: null,
    _unsub: null, _ready: null, _beat: null, _lastStatus: null, _lastVersion: -1,

    ready() {
      if (!this._ready) this._ready = this.backend.init().then(me => (this.me = me)).catch(e => { this._ready = null; throw e; });
      return this._ready;
    },
    errText(e) {
      const c = (e && (e.code || e.message)) || '';
      if (typeof e === 'string') return e;
      if (c === 'offline') return t('errOffline');
      if (/operation-not-allowed|admin-restricted/.test(c)) return t('errAnon');
      if (/permission/.test(c)) return t('errPerm');
      if (e && e.userMsg) return e.userMsg;
      return t('errGeneric');
    },

    nick() { try { return localStorage.getItem(LS_NICK) || ''; } catch (e) { return ''; } },
    setNick(n) { try { localStorage.setItem(LS_NICK, n); } catch (e) {} },

    mySeat(room = this.room) { return room && this.me ? room.seats.findIndex(s => s && !s.cpu && s.id === this.me.id) : -1; },
    isHost(room = this.room) { return !!(room && this.me && room.host === this.me.id); },
    isOnline(room, id) { const ts = room && room.seen && room.seen[id]; return !!ts && Date.now() - ts < OFFLINE_MS; },
    seatName(i, room = this.room) {
      const s = room && room.seats[i];
      if (!s) return '';
      return s.cpu ? t('cpuName', s.level) : s.name;
    },

    async create(name) {
      await this.ready();
      const cfg = this.cfg;
      for (let tries = 0; tries < 8; tries++) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        let made = false;
        await this.backend.transact(code, cur => {
          if (cur && cur.expireAt > Date.now()) return undefined;     // taken
          made = true;
          const now = Date.now();
          return {
            code, game: cfg.game, host: this.me.id, status: 'lobby', version: 0,
            seats: Array.from({ length: (cfg.defaultSeats ? cfg.defaultSeats() : cfg.seats) }, (_, i) => i === 0 ? { id: this.me.id, name } : null),
            opts: cfg.defaultOpts ? cfg.defaultOpts() : {},
            spectators: {}, seen: { [this.me.id]: now }, state: null,
            createdAt: now, expireAt: now + 24 * 3600 * 1000,
          };
        });
        if (made) { this._enter(code); this._sweep(); return code; }
      }
      throw { userMsg: t('errGeneric') };
    },

    // tidy up: delete a few rooms whose 24 hours are over (rooms people closed the tab on)
    async _sweep() {
      try {
        const old = await this.backend.expired(5);
        for (const r of old) {
          const lastSeen = Math.max(0, ...Object.values(r.seen || {}));
          if (Date.now() - lastSeen < 3600 * 1000) continue;          // someone was still around an hour ago
          await this.backend.remove(r.code).catch(() => {});
        }
      } catch (e) { /* best effort */ }
    },

    async join(code, name) {
      await this.ready();
      const cfg = this.cfg;
      const room = await this.backend.transact(code, cur => {
        if (!cur || cur.expireAt < Date.now()) throw { userMsg: t('errNoRoom') };
        if (cur.game !== cfg.game) throw { userMsg: t('errGame', (GAME_NAMES[cur.game] || {})[lang()] || cur.game) };
        const id = this.me.id;
        cur.seen = cur.seen || {}; cur.seen[id] = Date.now();
        if (cur.seats.some(s => s && s.id === id)) { cur.seats.forEach(s => { if (s && s.id === id) s.name = name; }); return cur; }
        const free = cur.seats.findIndex(s => !s);
        if (cur.status === 'lobby' && free >= 0) { cur.seats[free] = { id, name }; delete cur.spectators[id]; }
        else cur.spectators[id] = { name };
        return cur;
      });
      this._enter(code);
      return room;
    },

    // run fn on the latest room; fn returns the changed room (or undefined to cancel)
    async mutate(fn) {
      if (!this.code) return null;
      return this.backend.transact(this.code, cur => {
        if (!cur) return undefined;
        const next = fn(cur);
        if (next === undefined) return undefined;
        next.version = (cur.version || 0) + 1;
        return next;
      });
    },

    async leave() {
      const code = this.code;
      if (!code) return;
      const id = this.me.id, cfg = this.cfg;
      this._stop();
      try {
        await this.backend.transact(code, cur => {
          if (!cur) return undefined;
          const seat = cur.seats.findIndex(s => s && !s.cpu && s.id === id);
          if (cur.status === 'playing' && seat >= 0 && cfg.onLeaveGame) cur = cfg.onLeaveGame(cur, seat) || cur;
          if (cur.status === 'lobby' && seat >= 0) cur.seats[seat] = null;
          else if (seat >= 0) cur.seats[seat] = Object.assign({}, cur.seats[seat], { left: true });
          delete cur.spectators[id];
          if (cur.seen) delete cur.seen[id];
          if (cur.host === id) {
            const next = cur.seats.find(s => s && !s.cpu && !s.left && s.id !== id);
            if (!next) return null;                       // nobody left — close the room
            cur.host = next.id;
          }
          cur.version = (cur.version || 0) + 1;
          return cur;
        });
      } catch (e) { console.warn('[online] leave', e); }
      this._forget();
      this.room = null; this.code = null;
      UI.close();
      if (cfg.onExit) cfg.onExit();
    },

    _enter(code) {
      this._stop();
      this.code = code;
      this._remember(code);
      this._lastStatus = null; this._lastVersion = -1;
      try { const u = new URL(location.href); u.searchParams.set('room', code); history.replaceState(null, '', u); } catch (e) {}
      this._unsub = this.backend.watch(code, room => this._onRoom(room));
      this._beat = setInterval(() => this._presence(), PRESENCE_MS);
    },
    _stop() {
      if (this._unsub) { try { this._unsub(); } catch (e) {} this._unsub = null; }
      if (this._beat) { clearInterval(this._beat); this._beat = null; }
      try { const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u); } catch (e) {}
    },
    _presence() {
      if (!this.code || !this.me) return;
      this.backend.transact(this.code, cur => {
        if (!cur) return undefined;
        cur.seen = cur.seen || {}; cur.seen[this.me.id] = Date.now();
        return cur;
      }).catch(() => {});
    },
    _onRoom(room) {
      if (room === undefined) return;                       // transient listener error
      if (!room) {
        const had = !!this.room;
        this._stop(); this._forget(); this.room = null; this.code = null;
        UI.close();
        if (had) UI.toast(t('errClosed'));
        if (this.cfg.onExit) this.cfg.onExit();
        return;
      }
      // removed from the room (e.g. stale tab after leaving)
      const id = this.me.id;
      const inRoom = room.seats.some(s => s && s.id === id && !s.left) || (room.spectators && room.spectators[id]);
      if (!inRoom) { this._stop(); this._forget(); this.room = null; this.code = null; UI.close(); if (this.cfg.onExit) this.cfg.onExit(); return; }
      this.room = room;
      if (room.status === 'lobby') { UI.lobby(room); }
      else {
        UI.closeLobby();
        this.cfg.onRoom(room, { started: this._lastStatus !== 'playing' });
      }
      this._lastStatus = room.status;
      this._lastVersion = room.version;
    },

    // host actions
    addCpu(i, level) { return this.mutate(r => { if (!this.isHost(r) || r.seats[i]) return; r.seats[i] = { cpu: true, level }; return r; }); },
    removeSeat(i) { return this.mutate(r => { if (!this.isHost(r) || !r.seats[i] || !r.seats[i].cpu) return; r.seats[i] = null; return r; }); },
    setSeatCount(n) {
      return this.mutate(r => {
        if (!this.isHost(r) || r.seats.length === n) return;
        const people = r.seats.filter(s => s && !s.cpu), cpus = r.seats.filter(s => s && s.cpu);
        if (people.length > n) return;
        const keep = r.seats.slice();
        // drop empty seats first, then CPUs, from the end
        while (keep.length > n) {
          let i = keep.lastIndexOf(null);
          if (i < 0) i = keep.map(s => !!(s && s.cpu)).lastIndexOf(true);
          keep.splice(i, 1);
        }
        while (keep.length < n) keep.push(null);
        r.seats = keep;
        return r;
      });
    },
    setOpt(key, val) { return this.mutate(r => { if (!this.isHost(r)) return; r.opts = Object.assign({}, r.opts || {}, { [key]: val }); return r; }); },
    swapSeats() { return this.mutate(r => { if (!this.isHost(r)) return; r.seats.length === 2 ? r.seats.reverse() : r.seats.unshift(r.seats.pop()); return r; }); },
    start() {
      return this.mutate(r => {
        if (!this.isHost(r) || r.seats.some(s => !s)) return;
        r.status = 'playing'; r.state = this.cfg.newState(r); r.round = (r.round || 0) + 1;
        return r;
      });
    },
    rematch() {
      return this.mutate(r => {
        if (!this.isHost(r)) return;
        r.seats = r.seats.map(s => (s && s.left) ? null : s);
        if (this.cfg.rematch) r = this.cfg.rematch(r) || r;
        if (r.seats.some(s => !s)) { r.status = 'lobby'; r.state = null; return r; }
        r.state = this.cfg.newState(r); r.status = 'playing'; r.round = (r.round || 0) + 1;
        return r;
      });
    },
    backToLobby() { return this.mutate(r => { if (!this.isHost(r)) return; r.seats = r.seats.map(s => (s && s.left) ? null : s); r.status = 'lobby'; r.state = null; return r; }); },

    _remember(code) { try { localStorage.setItem(LS_ROOM, JSON.stringify({ game: this.cfg.game, code, at: Date.now() })); } catch (e) {} },
    _forget() { try { localStorage.removeItem(LS_ROOM); } catch (e) {} },
    savedRoom() {
      try {
        const s = JSON.parse(localStorage.getItem(LS_ROOM));
        if (s && s.game === this.cfg.game && Date.now() - s.at < 24 * 3600 * 1000) return s.code;
      } catch (e) {}
      return null;
    },

    mount(cfg) {
      this.cfg = cfg;
      UI.injectCss();
      // a shared invite link (?room=123456) or a room we were in before
      const code = (params.get('room') || '').replace(/\D/g, '');
      const saved = this.savedRoom();
      const go = () => { if (code.length === 6) this.resume(code, true); else if (saved) this.resume(saved, false); };
      // wait for the Firebase scripts at the end of the page
      if (document.readyState === 'complete') setTimeout(go, 0); else window.addEventListener('load', go);
    },
    // rejoin silently if we are already in that room; otherwise open the entry dialog with the code filled in
    async resume(code, fromLink) {
      try {
        await this.ready();
        const room = await this.backend.get(code);
        const id = this.me.id;
        if (room && room.game === this.cfg.game && (room.seats.some(s => s && s.id === id && !s.left) || (room.spectators && room.spectators[id]))) {
          this._enter(code);
          return true;
        }
        if (!room) { this._forget(); if (fromLink) { UI.entry(code); UI.error(t('errNoRoom')); } return false; }
        if (fromLink) UI.entry(code);
        else this._forget();
      } catch (e) { if (fromLink) { UI.entry(code); UI.error(this.errText(e)); } }
      return false;
    },
    openEntry() { UI.entry(''); },
    t, lang, esc,
  };

  // ─────────────────────────────── UI (uses the page's .overlay / .modal / .btn styles)
  const UI = {
    injectCss() {
      if (document.getElementById('sgo-css')) return;
      const st = document.createElement('style');
      st.id = 'sgo-css';
      st.textContent = `
        .sgo-modal { max-width: 540px; }
        .sgo-field { text-align: left; margin: 0.4rem 0 0.9rem; }
        .sgo-field label { display: block; font-size: 0.92rem; font-weight: 700; color: var(--muted, #aab4c5); margin-bottom: 0.35rem; }
        .sgo-input { width: 100%; padding: 0.7rem 0.9rem; border-radius: 10px; border: 1px solid var(--border, #2a2a50);
          background: var(--bg, #0d0d1a); color: var(--text, #eef2f7); font-size: 1.1rem; font-family: inherit; outline: none; }
        .sgo-input:focus { border-color: var(--accent2, #06b6d4); }
        .sgo-code-input { letter-spacing: 0.35em; font-weight: 800; text-align: center; font-size: 1.35rem; }
        .sgo-row { display: flex; gap: 0.6rem; align-items: stretch; }
        .sgo-row .sgo-input { flex: 1; min-width: 0; }
        .sgo-row .btn { white-space: nowrap; }
        .sgo-or { color: var(--muted, #aab4c5); font-size: 0.92rem; margin: 1rem 0 0.4rem; text-align: left; }
        .sgo-err { color: #fca5a5; font-weight: 700; min-height: 1.4em; margin: 0.3rem 0 0.2rem; font-size: 0.98rem; }
        .sgo-code { font-size: 2.6rem; font-weight: 900; letter-spacing: 0.3em; color: #fde047; margin: 0.1rem 0 0.4rem; padding-left: 0.3em; font-variant-numeric: tabular-nums; }
        .sgo-code-label { color: var(--muted, #aab4c5); font-size: 0.95rem; font-weight: 700; }
        .sgo-copy { display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 1rem; flex-wrap: wrap; }
        .sgo-copy .btn { padding: 0.45rem 0.9rem; font-size: 0.95rem; }
        .sgo-seats { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.9rem; }
        .sgo-seat { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.7rem; padding: 0.6rem 0.8rem; border-radius: 12px;
          background: var(--bg, #0d0d1a); border: 1px solid var(--border, #2a2a50); text-align: left; min-height: 52px; }
        .sgo-seat .dot { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 2px rgba(255,255,255,0.15); }
        .sgo-seat .lbl { color: var(--muted, #aab4c5); font-weight: 700; font-size: 0.92rem; min-width: 3.5em; }
        .sgo-seat .who { flex: 1 0 auto; min-width: 5.5em; font-weight: 700; font-size: 1.05rem; color: var(--text, #eef2f7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sgo-seat .who.empty { color: #6b7590; font-weight: 600; }
        .sgo-tag { display: inline-block; font-size: 0.75rem; font-weight: 800; padding: 0.1rem 0.45rem; border-radius: 999px; margin-left: 0.35rem; vertical-align: middle; }
        .sgo-tag.host { background: #f59e0b; color: #2a1a00; } .sgo-tag.you { background: var(--accent2, #06b6d4); color: #062a33; }
        .sgo-tag.off { background: #374151; color: #cbd5e1; }
        .sgo-seat .btn { padding: 0.35rem 0.75rem; font-size: 0.9rem; }
        .sgo-levels { margin-left: auto; display: flex; gap: 0.3rem; align-items: center; flex-wrap: wrap; }
        .sgo-addlbl { color: var(--muted, #aab4c5); font-size: 0.85rem; font-weight: 700; }
        .sgo-levels .pill { padding: 0.3rem 0.7rem; font-size: 0.85rem; margin: 0; }
        .sgo-opt { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.7rem; flex-wrap: wrap; }
        .sgo-opt-lbl { color: var(--muted, #aab4c5); font-weight: 700; font-size: 0.92rem; min-width: 3.5em; text-align: left; }
        .sgo-opt .pills { margin: 0; justify-content: flex-start; }
        .sgo-opt .pill { padding: 0.35rem 0.9rem; }
        .pill.sgo-ro { cursor: default; opacity: 0.55; } .pill.sgo-ro.active { opacity: 1; }
        .sgo-spec { color: var(--muted, #aab4c5); font-size: 0.92rem; margin-bottom: 0.8rem; text-align: left; }
        .sgo-tip { color: var(--muted, #aab4c5) !important; font-size: 0.92rem !important; margin-bottom: 0.8rem !important; text-align: left; }
        .sgo-wait { color: var(--soft, #d3dae6); font-weight: 700; margin: 0.4rem 0 0.8rem; }
        .sgo-modal .modal-btns { flex-wrap: nowrap; }
        .sgo-modal .modal-btns .btn { min-width: 0; white-space: nowrap; padding: 0.7rem 1rem; }
        .sgo-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: rgba(10,10,25,0.95);
          color: #fff; border: 1px solid var(--border, #2a2a50); padding: 0.6rem 1.2rem; border-radius: 14px; font-weight: 700;
          z-index: 9999; opacity: 0; pointer-events: none; transition: opacity .2s; }
        .sgo-toast.show { opacity: 1; }
        @media (max-width: 480px) { .sgo-modal .modal-btns .btn { padding: 0.65rem 0.75rem; font-size: 1rem; } .sgo-code { font-size: 2.1rem; } .sgo-seat .lbl { display: none; } .sgo-addlbl { display: none; } }
      `;
      document.head.appendChild(st);
    },
    _overlay(id) {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'overlay'; el.id = id;
        el.innerHTML = '<div class="modal sgo-modal"></div>';
        document.body.appendChild(el);
      }
      return el;
    },
    close() { ['sgoEntry', 'sgoLobby'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); }); },
    closeLobby() { const el = document.getElementById('sgoLobby'); if (el) el.classList.remove('active'); },
    hideOthers() { document.querySelectorAll('.overlay.active').forEach(o => { if (!o.id.startsWith('sgo')) o.classList.remove('active'); }); },
    toast(msg) {
      let el = document.getElementById('sgoToast');
      if (!el) { el = document.createElement('div'); el.id = 'sgoToast'; el.className = 'sgo-toast'; document.body.appendChild(el); }
      el.textContent = msg; el.classList.add('show');
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2400);
    },
    error(msg) { const el = document.querySelector('#sgoEntry .sgo-err'); if (el) el.textContent = msg || ''; },

    entry(code) {
      const ov = this._overlay('sgoEntry');
      const name = O.nick();
      const title = (O.cfg.title || {})[lang()] || '';
      ov.querySelector('.modal').innerHTML = `
        <div class="modal-icon">🌐</div>
        <h2>${esc(title)} · ${esc(t('online').replace('🌐 ', ''))}</h2>
        <p class="sgo-tip">${esc(t('entryIntro'))}</p>
        <div class="sgo-field"><label>${esc(t('yourName'))}</label>
          <input class="sgo-input" id="sgoName" maxlength="12" placeholder="${esc(t('namePh'))}" value="${esc(name)}"></div>
        <button class="btn btn-primary" id="sgoCreate" style="width:100%;font-size:1.1rem;padding:0.8rem">${esc(t('create'))}</button>
        <div class="sgo-or">${esc(t('or'))}</div>
        <div class="sgo-row">
          <input class="sgo-input sgo-code-input" id="sgoCode" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="${esc(t('codePh'))}" value="${esc(code || '')}">
          <button class="btn btn-primary" id="sgoJoin">${esc(t('join'))}</button>
        </div>
        <div class="sgo-err"></div>
        <div class="modal-btns"><button class="btn btn-ghost" id="sgoEntryCancel">${esc(t('cancel'))}</button></div>`;
      const nameEl = ov.querySelector('#sgoName'), codeEl = ov.querySelector('#sgoCode');
      codeEl.addEventListener('input', () => { codeEl.value = codeEl.value.replace(/\D/g, '').slice(0, 6); });
      const getName = () => {
        const n = nameEl.value.trim().slice(0, 12);
        if (!n) { this.error(t('errName')); nameEl.focus(); return null; }
        O.setNick(n); return n;
      };
      const busy = (b, label) => { ov.querySelectorAll('button').forEach(x => x.disabled = b); if (b) this.error(label); };
      ov.querySelector('#sgoCreate').addEventListener('click', async () => {
        const n = getName(); if (!n) return;
        busy(true, t('creating'));
        try { await O.create(n); this.error(''); }
        catch (e) { busy(false); this.error(O.errText(e)); }
      });
      const doJoin = async () => {
        const n = getName(); if (!n) return;
        const c = codeEl.value.trim();
        if (!/^\d{6}$/.test(c)) { this.error(t('errCode')); codeEl.focus(); return; }
        busy(true, t('joining'));
        try { await O.join(c, n); this.error(''); }
        catch (e) { busy(false); this.error(O.errText(e)); }
      };
      ov.querySelector('#sgoJoin').addEventListener('click', doJoin);
      codeEl.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
      ov.querySelector('#sgoEntryCancel').addEventListener('click', () => {
        ov.classList.remove('active');
        if (O.cfg.onCancelEntry) O.cfg.onCancelEntry();
      });
      this.hideOthers();
      ov.classList.add('active');
      setTimeout(() => (name ? (code ? ov.querySelector('#sgoJoin') : codeEl) : nameEl).focus(), 60);
    },

    lobby(room) {
      document.getElementById('sgoEntry') && document.getElementById('sgoEntry').classList.remove('active');
      const ov = this._overlay('sgoLobby');
      const host = O.isHost(room), cfg = O.cfg, L = lang();
      const title = (cfg.title || {})[L] || '';
      const full = room.seats.every(Boolean);
      const seatsHtml = room.seats.map((s, i) => {
        let who, right = '';
        if (!s) {
          who = `<span class="who empty">${esc(t('waiting'))}</span>`;
          if (host) right = `<div class="sgo-levels"><span class="sgo-addlbl">${esc(t('addCpuLabel'))}</span>${(cfg.cpuLevels || ['medium']).map(lv => `<div class="pill" data-cpu="${i}" data-lv="${lv}">${esc(t('cpuShort', lv))}</div>`).join('')}</div>`;
        } else if (s.cpu) {
          who = `<span class="who">🤖 ${esc(t('cpuName', s.level))}</span>`;
          if (host) right = `<button class="btn btn-ghost" data-rm="${i}">${esc(t('removeCpu'))}</button>`;
        } else {
          const tags = (s.id === room.host ? `<span class="sgo-tag host">${esc(t('host'))}</span>` : '') +
            (s.id === O.me.id ? `<span class="sgo-tag you">${esc(t('you'))}</span>` : '') +
            (s.id !== O.me.id && !O.isOnline(room, s.id) ? `<span class="sgo-tag off">${esc(t('offline'))}</span>` : '');
          who = `<span class="who">${esc(s.name)}${tags}</span>`;
        }
        return `<div class="sgo-seat"><div class="dot" style="background:${cfg.seatColor ? cfg.seatColor(i, room) : '#888'}"></div>
          <span class="lbl">${esc(cfg.seatLabel ? cfg.seatLabel(i, L, room) : '#' + (i + 1))}</span>${who}${right}</div>`;
      }).join('');
      const specs = Object.values(room.spectators || {}).map(s => esc(s.name));
      // room options (host can change them; others see the choice)
      const optRow = (label, items) => `<div class="sgo-opt"><span class="sgo-opt-lbl">${esc(label)}</span><div class="pills">${items}</div></div>`;
      let optsHtml = '';
      if (cfg.seatCounts && cfg.seatCounts.length > 1) {
        const humansIn = room.seats.filter(x => x && !x.cpu).length;
        optsHtml += optRow(t('numPlayers'), cfg.seatCounts.map(n =>
          `<div class="pill ${room.seats.length === n ? 'active' : ''} ${host && n >= humansIn ? '' : 'sgo-ro'}" data-seatn="${n}">${n}</div>`).join(''));
      }
      for (const o of cfg.options || []) {
        const cur = (room.opts || {})[o.key];
        optsHtml += optRow(o.label[L] || o.label.zh, o.values.map(v =>
          `<div class="pill ${cur === v.v ? 'active' : ''} ${host ? '' : 'sgo-ro'}" data-opt="${o.key}" data-v="${v.v}">${esc(typeof v.label === 'string' ? v.label : (v.label[L] || v.label.zh))}</div>`).join(''));
      }
      ov.querySelector('.modal').innerHTML = `
        <h2>${esc(title)} · ${esc(t('online').replace('🌐 ', ''))}</h2>
        <div class="sgo-code-label">${esc(t('roomCode'))}</div>
        <div class="sgo-code" id="sgoCodeShow">${esc(room.code)}</div>
        <div class="sgo-copy">
          <button class="btn btn-ghost" id="sgoCopy">${esc(t('copy'))}</button>
          <button class="btn btn-ghost" id="sgoCopyLink">${esc(t('copyLink'))}</button>
        </div>
        ${optsHtml}
        <div class="sgo-seats">${seatsHtml}</div>
        <div class="sgo-spec">👀 ${esc(t('spectators'))}：${specs.length ? specs.join('、') : esc(t('noSpectators'))}</div>
        ${host ? `<p class="sgo-tip">${esc(full ? t('lobbyTip') : t('needPlayers'))}</p>` : `<div class="sgo-wait">${esc(O.mySeat(room) < 0 ? t('spectating') + ' · ' : '')}${esc(t('waitHost'))}</div>`}
        <div class="modal-btns">
          ${host ? `<button class="btn btn-primary" id="sgoStart" ${full ? '' : 'disabled'}>${esc(t('start'))}</button>
                    <button class="btn btn-ghost" id="sgoSwap">${esc(t('swap'))}</button>` : ''}
          <button class="btn btn-danger" id="sgoLeave">${esc(t('leave'))}</button>
        </div>`;
      const copy = async (text) => {
        try { await navigator.clipboard.writeText(text); }
        catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) {} ta.remove(); }
        this.toast(t('copied'));
      };
      ov.querySelector('#sgoCopy').addEventListener('click', () => copy(room.code));
      ov.querySelector('#sgoCopyLink').addEventListener('click', () => {
        const u = new URL(location.href); u.search = ''; u.searchParams.set('room', room.code);
        if (LOCAL) u.searchParams.set('online', 'local');
        copy(u.toString());
      });
      if (host) {
        ov.querySelectorAll('[data-seatn]:not(.sgo-ro)').forEach(b => b.addEventListener('click', () => O.setSeatCount(+b.dataset.seatn)));
        ov.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
          const o = (cfg.options || []).find(x => x.key === b.dataset.opt); if (!o) return;
          const v = o.values.find(x => String(x.v) === b.dataset.v); if (v) O.setOpt(o.key, v.v);
        }));
      }
      ov.querySelectorAll('[data-cpu]').forEach(b => b.addEventListener('click', () => O.addCpu(+b.dataset.cpu, b.dataset.lv)));
      ov.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => O.removeSeat(+b.dataset.rm)));
      const st = ov.querySelector('#sgoStart'); if (st) st.addEventListener('click', () => O.start());
      const sw = ov.querySelector('#sgoSwap'); if (sw) sw.addEventListener('click', () => O.swapSeats());
      ov.querySelector('#sgoLeave').addEventListener('click', () => O.leave());
      this.hideOthers();
      ov.classList.add('active');
    },
  };
  O.ui = UI;

  root.SillyOnline = O;
})(window);
