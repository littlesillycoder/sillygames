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
    _sfAuth.onAuthStateChanged(user => {
      this.currentUser = user;
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

  // Generate a consistent HSL color from a string (display name or email).
  avatarColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 65%, 48%)`;
  },

  // Render a read-only avatar circle (initial letter) into an element.
  // Shows when signed in, clears when signed out.
  renderAvatar(elementId, user) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (user) {
      const name = user.displayName || user.email || '?';
      const initial = name.charAt(0).toUpperCase();
      const color = this.avatarColor(name);
      el.innerHTML = `<div style="
        width:36px;height:36px;border-radius:50%;
        background:${color};color:#fff;
        font-size:16px;font-weight:700;font-family:sans-serif;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
        user-select:none;">${initial}</div>`;
    } else {
      el.innerHTML = '';
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
