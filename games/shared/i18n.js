// games/shared/i18n.js
// Shared 中文 / English language switch for every sillygames page.
//
// Usage in a game page (load before the game script):
//   <script src="../shared/i18n.js"></script>
//   SillyI18n.add({ zh: { start: '開始' }, en: { start: 'Start' } });
//   SillyI18n.t('start')                      → text in the current language
//   <span data-i18n="start"></span>           → filled automatically (textContent)
//   <p data-i18n-html="help"></p>             → filled automatically (innerHTML)
//   data-i18n-title / data-i18n-placeholder  → title / placeholder attributes
//   <div data-lang-switch></div>              → replaced by the 中 | EN switch
//   <div data-lang-switch="full"></div>       → 中文 | English switch
//   SillyI18n.onChange(lang => redraw())     → react to a switch
//   SillyI18n.en('key')                       → always English (in-game canvas text stays English)
//
// One preference for the whole site (localStorage "sg_lang"). First visit: browser language.

(function (root) {
  'use strict';

  const KEY = 'sg_lang';
  const OLD_KEYS = ['go_lang', 'cc_lang', 'chess_lang'];

  function detect() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'zh' || v === 'en') return v;
      for (const k of OLD_KEYS) {
        const o = localStorage.getItem(k);
        if (o === 'zh' || o === 'en') return o;
      }
    } catch (e) {}
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  let lang = detect();
  const dict = { zh: {}, en: {} };
  const listeners = [];

  const CSS = `
    .lang-switch { display: inline-flex; border: 1px solid #2a2a50; border-radius: 999px; overflow: hidden;
      background: #0d0d1a; flex-shrink: 0; vertical-align: middle; }
    .lang-switch button { background: none; border: none; color: #aab4c5; cursor: pointer;
      padding: 0.32rem 0.7rem; font-size: 0.85rem; font-weight: 700; font-family: inherit; line-height: 1.2;
      transition: background 0.15s, color 0.15s; }
    .lang-switch button.active { background: #06b6d4; color: #062a33; }
    @media (max-width: 860px) { .lang-switch button { padding: 0.28rem 0.5rem; font-size: 0.8rem; } }`;

  function injectCss() {
    if (document.getElementById('sg-i18n-css')) return;
    const st = document.createElement('style');
    st.id = 'sg-i18n-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function switchHTML(full) {
    return `<div class="lang-switch" role="group" aria-label="Language">` +
      `<button type="button" data-lang="zh">${full ? '中文' : '中'}</button>` +
      `<button type="button" data-lang="en">${full ? 'English' : 'EN'}</button></div>`;
  }

  const I18n = {
    get lang() { return lang; },

    add(d) {
      for (const l of ['zh', 'en']) if (d[l]) Object.assign(dict[l], d[l]);
      return I18n;
    },

    t(key, ...args) {
      const v = dict[lang][key] ?? dict.zh[key] ?? dict.en[key] ?? key;
      return typeof v === 'function' ? v(...args) : v;
    },

    // English regardless of the switch — used for text drawn inside the game canvas (kept in English)
    en(key, ...args) {
      const v = dict.en[key] ?? key;
      return typeof v === 'function' ? v(...args) : v;
    },

    // translate everything marked with data-i18n* inside `scope`
    apply(scope) {
      const r = scope || document;
      injectCss();
      r.querySelectorAll('[data-lang-switch]').forEach(el => {
        el.outerHTML = switchHTML(el.getAttribute('data-lang-switch') === 'full');
      });
      r.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = I18n.t(el.dataset.i18n); });
      r.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = I18n.t(el.dataset.i18nHtml); });
      r.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = I18n.t(el.dataset.i18nTitle); });
      r.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = I18n.t(el.dataset.i18nPlaceholder); });
      document.querySelectorAll('.lang-switch button[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
      document.documentElement.lang = lang === 'zh' ? 'zh-Hant-TW' : 'en';
      if (dict[lang].pageTitle) document.title = I18n.t('pageTitle');
    },

    set(l) {
      if (l !== 'zh' && l !== 'en') return;
      lang = l;
      try { localStorage.setItem(KEY, l); } catch (e) {}
      I18n.apply();
      listeners.forEach(f => { try { f(l); } catch (e) { console.warn(e); } });
    },

    onChange(f) { listeners.push(f); },
    switchHTML,
  };

  // one click handler for every switch on the page
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.lang-switch button[data-lang]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    I18n.set(b.dataset.lang);
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => I18n.apply());
  else I18n.apply();

  root.SillyI18n = I18n;
})(typeof window !== 'undefined' ? window : this);
