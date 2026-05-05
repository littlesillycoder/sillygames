// games/shared/firebase.js
// Shared Firebase Auth + Firestore helper for sillygames.
// Load this AFTER the three Firebase SDK compat scripts:
//   firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js

const _sfConfig = {
  apiKey: "AIzaSyD87pzmNs8VsyqiDn5qur0wmfxuyQvy6N4",
  authDomain: "sillygames-29493.firebaseapp.com",
  projectId: "sillygames-29493",
  storageBucket: "sillygames-29493.firebasestorage.app",
  messagingSenderId: "823493598031",
  appId: "1:823493598031:web:2d47adfb1ec6f6ec03c33a"
};

if (!firebase.apps.length) {
  firebase.initializeApp(_sfConfig);
}

const _sfAuth = firebase.auth();
const _sfDb   = firebase.firestore();

const SillyFirebase = {
  currentUser: null,

  // ─── Cloud save ──────────────────────────────────────────────

  _ref(uid, gameId) {
    return _sfDb.collection('users').doc(uid).collection('games').doc(gameId);
  },

  // Save data object to Firestore under users/{uid}/games/{gameId}
  async saveProgress(gameId, data) {
    if (!this.currentUser) return;
    try {
      await this._ref(this.currentUser.uid, gameId).set({
        ...data,
        uid: this.currentUser.uid,
        email: this.currentUser.email
      });
    } catch(e) { console.warn('[SillyFirebase] save failed', e); }
  },

  // Load data from Firestore. Returns plain object or null.
  async loadProgress(gameId) {
    if (!this.currentUser) return null;
    try {
      const snap = await this._ref(this.currentUser.uid, gameId).get();
      return snap.exists ? snap.data() : null;
    } catch(e) { console.warn('[SillyFirebase] load failed', e); return null; }
  },

  // Sync cloud ↔ localStorage on login.
  // gameId   — Firestore doc id (e.g. 'bubbleBobble', 'pacMan')
  // localKey — localStorage key holding the JSON save string
  async syncProgress(gameId, localKey) {
    const cloud = await this.loadProgress(gameId);
    let local = null;
    try { local = JSON.parse(localStorage.getItem(localKey)); } catch(e) {}

    if (!cloud && !local) return;
    if (!cloud && local)  { await this.saveProgress(gameId, local); return; }
    // Cloud exists — stamp it with uid when writing to localStorage
    if (cloud && !local)  { localStorage.setItem(localKey, JSON.stringify({...cloud, uid: this.currentUser.uid})); return; }

    // Both exist — if local has no uid or belongs to a different user, it's guest data; prefer cloud
    if (!local.uid || local.uid !== this.currentUser.uid) {
      localStorage.setItem(localKey, JSON.stringify({...cloud, uid: this.currentUser.uid}));
      return;
    }

    // Both belong to the same authenticated user — use whichever has the newer savedAt timestamp
    if ((cloud.savedAt || 0) > (local.savedAt || 0)) {
      localStorage.setItem(localKey, JSON.stringify(cloud));
    } else {
      await this.saveProgress(gameId, local);
    }
  },

  // ─── Auth ────────────────────────────────────────────────────

  // Open Google sign-in popup.
  // onBeforePopup — optional function called just before the popup opens
  //                 (use this to pause the game, etc.)
  signIn(onBeforePopup) {
    if (typeof onBeforePopup === 'function') onBeforePopup();
    const provider = new firebase.auth.GoogleAuthProvider();
    _sfAuth.signInWithPopup(provider).catch(e => console.warn('[SillyFirebase] sign-in failed', e));
  },

  signOut() {
    _sfAuth.signOut();
  },

  // Register an auth state listener.
  // callback(user) is called whenever the user signs in or out.
  // Also keeps SillyFirebase.currentUser in sync.
  onAuthChanged(callback) {
    let firstCall = true;
    _sfAuth.onAuthStateChanged(user => {
      this.currentUser = user;
      if (user) {
        this._cacheAvatar(user);
      } else if (!firstCall) {
        // Real sign-out — clear cache. Skip on initial null flash at page load.
        this._clearAvatarCache();
      }
      firstCall = false;
      callback(user);
    });
  },

  // ─── Auth bar UI ─────────────────────────────────────────────

  // Render sign-in / sign-out controls into an element.
  // elementId    — id of the container element
  // signInFnName — string of the onclick function for sign-in button,
  //                e.g. 'bbSignIn()' (game-specific wrapper that pauses first)
  renderAuthBar(elementId, signInFnName = 'SillyFirebase.signIn()') {
    const bar = document.getElementById(elementId);
    if (!bar) return;
    if (this.currentUser) {
      bar.innerHTML = `<span id="auth-status">&#9729; ${this.currentUser.email}</span>
        <button class="gbtn signout-btn" onclick="SillyFirebase.signOut()" style="width:100%">Sign out</button>`;
    } else {
      bar.innerHTML = `<button class="gbtn google-btn" onclick="${signInFnName}" style="width:100%">Google Sign In</button>`;
    }
  },

  // ─── Avatar indicator ────────────────────────────────────────

  _AVATAR_CACHE_KEY: '_sfAvatarCache',

  // Generate a consistent HSL color from a string (display name or email).
  avatarColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 65%, 48%)`;
  },

  _cacheAvatar(user) {
    const name = user.displayName || user.email || '?';
    try {
      localStorage.setItem(this._AVATAR_CACHE_KEY, JSON.stringify({
        initial: name.charAt(0).toUpperCase(),
        color: this.avatarColor(name),
        uid: user.uid
      }));
    } catch(e) {}
  },

  _clearAvatarCache() {
    try { localStorage.removeItem(this._AVATAR_CACHE_KEY); } catch(e) {}
  },

  // Render avatar immediately from localStorage cache (no async).
  // Call this before onAuthChanged to avoid pop-in delay for returning users.
  renderAvatarFromCache(elementId) {
    try {
      const cached = JSON.parse(localStorage.getItem(this._AVATAR_CACHE_KEY));
      if (cached) this._renderAvatarCircle(elementId, cached.initial, cached.color, true);
    } catch(e) {}
  },

  _renderAvatarCircle(elementId, initial, color, clickable = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = `<div style="
      width:36px;height:36px;border-radius:50%;
      background:${color};color:#fff;
      font-size:16px;font-weight:700;font-family:sans-serif;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      user-select:none;${clickable ? 'cursor:pointer;' : ''}">${initial}</div>`;
    if (clickable && el.firstChild) {
      el.firstChild.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleAvatarPopup(el.firstChild);
      });
    }
  },

  _toggleAvatarPopup(anchor) {
    const existing = document.getElementById('_sf_avatar_popup');
    if (existing) { existing.remove(); return; }
    const user = this.currentUser;
    if (!user) return;
    const name = user.displayName || user.email || '?';
    const rect = anchor.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.id = '_sf_avatar_popup';
    popup.style.cssText = `
      position:fixed;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;
      background:#1a1a2e;border:1px solid #3a3a60;border-radius:10px;
      padding:14px 16px;min-width:200px;
      box-shadow:0 4px 20px rgba(0,0,0,0.6);z-index:9999;font-family:sans-serif;`;
    popup.innerHTML = `
      <div style="font-weight:700;font-size:14px;color:#fff;margin-bottom:3px;">Hi, ${name}!</div>
      <div style="font-size:12px;color:#888;margin-bottom:12px;">${user.email || ''}</div>
      <button id="_sf_so_btn" style="width:100%;padding:8px;background:#1c1c38;
        border:1px solid #3a3a60;color:#ccc;border-radius:6px;cursor:pointer;
        font-size:13px;font-family:sans-serif;">Sign Out</button>`;
    document.body.appendChild(popup);
    popup.querySelector('#_sf_so_btn').addEventListener('click', () => {
      popup.remove(); this.signOut();
    });
    const close = (e) => {
      if (!popup.contains(e.target) && !anchor.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  },

  // Render avatar circle (signed in) or compact sign-in circle (signed out).
  // onSignIn — optional callback fired before the Google popup opens
  //            (use this to pause the game, etc.)
  renderAvatar(elementId, user, onSignIn) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (user) {
      const name = user.displayName || user.email || '?';
      const initial = name.charAt(0).toUpperCase();
      const color = this.avatarColor(name);
      this._cacheAvatar(user);
      this._renderAvatarCircle(elementId, initial, color, true);
    } else {
      // Same 36×36 size as avatar circle so topbar width never changes
      el.innerHTML = `<div style="
        width:36px;height:36px;border-radius:50%;
        border:2px dashed #3a3a60;color:#666;font-size:20px;
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;user-select:none;" title="Sign in">+</div>`;
      el.firstChild.addEventListener('click', () =>
        this.signIn(typeof onSignIn === 'function' ? onSignIn : undefined));
    }
  },

  // ─── Visit tracking ──────────────────────────────────────────

  // Increment visit counter for pageId and return the new total.
  // Stored at analytics/{pageId} → { total: N }
  async trackVisit(pageId) {
    try {
      const ref = _sfDb.collection('analytics').doc(pageId);
      await ref.set(
        { total: firebase.firestore.FieldValue.increment(1) },
        { merge: true }
      );
      const snap = await ref.get();
      return snap.exists ? (snap.data().total || 0) : 0;
    } catch(e) { console.warn('[SillyFirebase] trackVisit failed', e); return null; }
  }
};
