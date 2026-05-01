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
    if (cloud && !local)  { localStorage.setItem(localKey, JSON.stringify(cloud)); return; }

    // Both exist — use whichever has the newer savedAt timestamp
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
  }
};
