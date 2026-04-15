/**
 * POWER CLICK — Game Engine v3
 *
 * Features :
 *   Core     : clics, CPC, CPS, phases visuelles, prestige
 *   Combo    : taper vite construit un multiplicateur x2→x20
 *   Critiques: 8% de chance de coup critique ×10
 *   Daily    : bonus journalier basé sur le CPS accumulé
 *   Lucky    : événement aléatoire toutes les 2–4 min (objet bonus à claquer)
 *   Achievs  : 12 succès avec toast notifications
 *   Save     : localStorage + sync Supabase (window._saveSaveData)
 */

(function () {
  'use strict';

  /* ── Phases ── */
  const PHASES = [
    { min:0,    emoji:'🪨', name:'STONE',    cls:'phase-1', accent:'#8B7355' },
    { min:1e3,  emoji:'💎', name:'CRYSTAL',  cls:'phase-2', accent:'#00bcd4' },
    { min:1e6,  emoji:'⚡', name:'ENERGY',   cls:'phase-3', accent:'#9c27b0' },
    { min:1e9,  emoji:'⭐', name:'STAR',     cls:'phase-4', accent:'#ffd700' },
    { min:1e12, emoji:'🌟', name:'NOVA',     cls:'phase-5', accent:'#ff6b6b' },
    { min:1e15, emoji:'🌌', name:'GALAXY',   cls:'phase-6', accent:'#7c4dff' },
    { min:1e18, emoji:'🌈', name:'UNIVERSE', cls:'phase-7', accent:'#ffffff' },
  ];

  /* ── Upgrades ── */
  const UPGRADES = [
    { id:'cpc1', name:'Power Tap',    icon:'👆', type:'cpc', value:2,      baseCost:50,        desc:'+2 per tap'      },
    { id:'cpc2', name:'Iron Fist',    icon:'✊', type:'cpc', value:10,     baseCost:400,       desc:'+10 per tap'     },
    { id:'cpc3', name:'Mega Strike',  icon:'🥊', type:'cpc', value:50,     baseCost:4000,      desc:'+50 per tap'     },
    { id:'cpc4', name:'Robo-Hand',    icon:'🤖', type:'cpc', value:250,    baseCost:40000,     desc:'+250 per tap'    },
    { id:'cpc5', name:'Quantum Tap',  icon:'⚛️', type:'cpc', value:2000,   baseCost:500000,    desc:'+2,000 per tap'  },
    { id:'cpc6', name:'Nova Punch',   icon:'💥', type:'cpc', value:25000,  baseCost:8000000,   desc:'+25,000 per tap' },
    { id:'cps1', name:'Auto-Tap',     icon:'🖱️', type:'cps', value:1,      baseCost:100,       desc:'+1/sec'          },
    { id:'cps2', name:'Click Drone',  icon:'🚁', type:'cps', value:6,      baseCost:800,       desc:'+6/sec'          },
    { id:'cps3', name:'Bot Factory',  icon:'🏭', type:'cps', value:30,     baseCost:7000,      desc:'+30/sec'         },
    { id:'cps4', name:'Power Grid',   icon:'⚡', type:'cps', value:150,    baseCost:70000,     desc:'+150/sec'        },
    { id:'cps5', name:'Quantum Core', icon:'⚛️', type:'cps', value:800,    baseCost:800000,    desc:'+800/sec'        },
    { id:'cps6', name:'Star Engine',  icon:'⭐', type:'cps', value:5000,   baseCost:12000000,  desc:'+5,000/sec'      },
    { id:'cps7', name:'Galaxy Drive', icon:'🌌', type:'cps', value:40000,  baseCost:200000000, desc:'+40,000/sec'     },
  ];

  /* ── Achievements ── */
  const ACHIEVEMENTS = [
    { id:'first_tap',   icon:'👆', name:'First Tap',        desc:'Click for the first time',            check: s => s.totalClicks >= 1        },
    { id:'tap_100',     icon:'🖱️', name:'Clicker',          desc:'Tap 100 times',                       check: s => s.totalClicks >= 100       },
    { id:'tap_1000',    icon:'⚡', name:'Tap Machine',       desc:'Tap 1,000 times',                     check: s => s.totalClicks >= 1000      },
    { id:'power_1k',    icon:'💎', name:'Crystal Spark',    desc:'Earn 1,000 total power',              check: s => s.totalEarnedAllTime >= 1e3  },
    { id:'power_1m',    icon:'⚡', name:'Energy Surge',      desc:'Earn 1,000,000 power',                check: s => s.totalEarnedAllTime >= 1e6  },
    { id:'power_1b',    icon:'⭐', name:'Star Born',         desc:'Earn 1,000,000,000 power',            check: s => s.totalEarnedAllTime >= 1e9  },
    { id:'first_upgrade',icon:'💰', name:'Investor',         desc:'Buy your first upgrade',              check: s => Object.values(s.upgrades).some(v => v > 0) },
    { id:'first_auto',  icon:'🤖', name:'Going Idle',        desc:'Buy your first auto-generator',       check: s => ['cps1','cps2','cps3','cps4','cps5','cps6','cps7'].some(id => (s.upgrades[id]||0) > 0) },
    { id:'first_combo', icon:'🔥', name:'Combo Starter',     desc:'Reach a x5 combo',                   check: s => s.maxCombo >= 5            },
    { id:'crit_hit',    icon:'💥', name:'Critical!',         desc:'Land your first critical hit',        check: s => s.totalCrits >= 1          },
    { id:'first_prestige',icon:'✨', name:'Reborn',          desc:'Prestige for the first time',         check: s => s.prestigeCount >= 1       },
    { id:'prestige_5',  icon:'🌌', name:'Legendary',         desc:'Reach prestige level 5',              check: s => s.prestigeCount >= 5       },
  ];

  /* ── Game state ── */
  const DEFAULTS = {
    coins:              0,
    totalEarned:        0,
    totalEarnedAllTime: 0,
    clickPower:         1,
    coinsPerSec:        0,
    prestigeCount:      0,
    prestigeMultiplier: 1,
    prestigeThreshold:  1e6,
    upgrades:           {},
    totalClicks:        0,
    totalCrits:         0,
    maxCombo:           0,
    unlockedAchievements: [],
  };
  let state = JSON.parse(JSON.stringify(DEFAULTS));
  let username        = '';
  let currentPhaseIdx = 0;

  /* ── Combo state ── */
  let comboCount    = 1;
  let lastClickTime = 0;
  let comboTimer    = null;
  const COMBO_WINDOW  = 800;  // ms between clicks to maintain combo
  const COMBO_MAX     = 20;
  const CRIT_CHANCE   = 0.08; // 8%
  const CRIT_MULT     = 10;

  /* ── Lucky event state ── */
  let luckyActive    = false;
  let luckyTimeout   = null;
  let luckySpawn     = null;

  let autoInterval = null;
  let uiInterval   = null;

  /* ── DOM refs ── */
  const coinsEl         = document.getElementById('coins-value');
  const cpsEl           = document.getElementById('cps-value');
  const cpcEl           = document.getElementById('cpc-display');
  const totalEarnedEl   = document.getElementById('total-earned-val');
  const prestigeCountEl = document.getElementById('prestige-count-val');
  const multiEl         = document.getElementById('multi-val');
  const shopCoinsEl     = document.getElementById('shop-coins');
  const clickObj        = document.getElementById('click-object');
  const clickEmoji      = document.getElementById('click-emoji');
  const phaseNameEl     = document.getElementById('phase-name');
  const floatZone       = document.getElementById('float-zone');
  const shopItemsEl     = document.getElementById('shop-items');
  const btnPrestige     = document.getElementById('btn-prestige');
  const presIdleLabel   = document.getElementById('prestige-idle-label');
  const comboDisplay    = document.getElementById('combo-display');
  const comboCountEl    = document.getElementById('combo-count');
  const achievListEl    = document.getElementById('achievements-list');
  const achievCountEl   = document.getElementById('achievements-count');
  const toastContainer  = document.getElementById('toast-container');

  /* ── Number formatter ── */
  function fmt(n) {
    if (!n && n !== 0) return '0';
    n = Number(n);
    if (isNaN(n)) return '0';
    if (n >= 1e18) return (n/1e18).toFixed(2)+' Qa';
    if (n >= 1e15) return (n/1e15).toFixed(2)+' Q';
    if (n >= 1e12) return (n/1e12).toFixed(2)+' T';
    if (n >= 1e9)  return (n/1e9).toFixed(2)+' B';
    if (n >= 1e6)  return (n/1e6).toFixed(2)+' M';
    if (n >= 1e3)  return (n/1e3).toFixed(1)+' K';
    return Math.floor(n).toString();
  }

  /* ════════════════════════════════════
     PHASES
  ════════════════════════════════════ */
  function getPhaseIdx(totalEarned) {
    let idx = 0;
    for (let i = PHASES.length - 1; i >= 0; i--) {
      if (totalEarned >= PHASES[i].min) { idx = i; break; }
    }
    return idx;
  }
  function applyPhase(idx, animate) {
    if (!clickObj) return;
    const phase = PHASES[idx];
    PHASES.forEach(p => clickObj.classList.remove(p.cls));
    clickObj.classList.add(phase.cls);
    if (clickEmoji) clickEmoji.textContent = phase.emoji;
    if (phaseNameEl) phaseNameEl.textContent = phase.name;
    document.documentElement.style.setProperty('--phase-accent', phase.accent);
    if (animate) {
      clickObj.classList.remove('phase-up');
      void clickObj.offsetWidth;
      clickObj.classList.add('phase-up');
      spawnFloat('🎉 PHASE UP!', null, null, 'big');
    }
  }

  /* ════════════════════════════════════
     COINS
  ════════════════════════════════════ */
  function addCoins(amount) {
    state.coins              += amount;
    state.totalEarned        += amount;
    state.totalEarnedAllTime += amount;
    const newIdx = getPhaseIdx(state.totalEarned);
    if (newIdx !== currentPhaseIdx) {
      applyPhase(newIdx, newIdx > currentPhaseIdx);
      currentPhaseIdx = newIdx;
    }
    if (state.totalEarned >= state.prestigeThreshold && btnPrestige) {
      btnPrestige.classList.remove('hidden');
      if (presIdleLabel) presIdleLabel.style.display = 'none';
    }
    save();
  }

  /* ════════════════════════════════════
     CLICK HANDLER — combo + critical
  ════════════════════════════════════ */
  function handleClick(e) {
    state.totalClicks++;

    /* ── Combo ── */
    const now = Date.now();
    if (now - lastClickTime < COMBO_WINDOW) {
      comboCount = Math.min(comboCount + 1, COMBO_MAX);
    } else {
      comboCount = 1;
    }
    lastClickTime = now;
    state.maxCombo = Math.max(state.maxCombo, comboCount);

    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
      comboCount = 1;
      if (comboDisplay) comboDisplay.classList.add('hidden');
    }, COMBO_WINDOW * 1.5);

    if (comboDisplay && comboCountEl) {
      if (comboCount >= 2) {
        comboCountEl.textContent = 'x' + comboCount;
        comboDisplay.classList.remove('hidden');
        comboDisplay.classList.remove('combo-pop');
        void comboDisplay.offsetWidth;
        comboDisplay.classList.add('combo-pop');
      } else {
        comboDisplay.classList.add('hidden');
      }
    }

    /* ── Critical hit ── */
    const critChance = CRIT_CHANCE + (state.prestigeCount * 0.005); // +0.5% par prestige
    const isCrit = Math.random() < critChance;
    if (isCrit) state.totalCrits++;

    /* ── Earnings ── */
    const base   = state.clickPower * state.prestigeMultiplier;
    const withCombo  = base * comboCount;
    const final  = isCrit ? withCombo * CRIT_MULT : withCombo;
    addCoins(final);

    /* ── Pulse animation ── */
    if (clickObj) {
      clickObj.classList.remove('clicked');
      void clickObj.offsetWidth;
      clickObj.classList.add('clicked');
      setTimeout(() => clickObj && clickObj.classList.remove('clicked'), 200);
    }

    /* ── Floating number ── */
    const cx = e ? (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX)) : null;
    const cy = e ? (e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY)) : null;
    if (isCrit) {
      spawnFloat('💥 CRITICAL! +' + fmt(final), cx, cy, 'crit');
    } else {
      const prefix = comboCount >= 2 ? `x${comboCount} ` : '';
      spawnFloat(prefix + '+' + fmt(final), cx, cy, comboCount >= 5 ? 'combo' : null);
    }

    checkAchievements();
  }

  /* ════════════════════════════════════
     FLOATING NUMBERS
  ════════════════════════════════════ */
  function spawnFloat(text, x, y, style) {
    if (!floatZone) return;
    const el = document.createElement('div');
    el.className = 'float-num';
    if (style === 'big')   el.classList.add('float-big');
    if (style === 'crit')  el.classList.add('float-crit');
    if (style === 'combo') el.classList.add('float-combo');
    el.textContent = text;
    const rect = floatZone.getBoundingClientRect();
    const cx   = x ? Math.min(Math.max(x - rect.left, 10), rect.width  - 10) : rect.width  / 2 + (Math.random() - 0.5) * 40;
    const cy   = y ? Math.min(Math.max(y - rect.top,  10), rect.height - 10) : rect.height / 2;
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    el.style.setProperty('--drift', ((Math.random() - 0.5) * 80) + 'px');
    floatZone.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 1100);
  }

  /* ════════════════════════════════════
     STATS RECALC
  ════════════════════════════════════ */
  function recalcStats() {
    let cpc = 1, cps = 0;
    UPGRADES.forEach(u => {
      const count = state.upgrades[u.id] || 0;
      if (!count) return;
      if (u.type === 'cpc') cpc += u.value * count;
      if (u.type === 'cps') cps += u.value * count;
    });
    state.clickPower  = cpc;
    state.coinsPerSec = cps;
  }

  /* ════════════════════════════════════
     SHOP
  ════════════════════════════════════ */
  function upgradeCost(u) {
    return Math.floor(u.baseCost * Math.pow(1.15, state.upgrades[u.id] || 0));
  }

  function buildShop() {
    if (!shopItemsEl) return;
    shopItemsEl.innerHTML = '';
    const sec = label => {
      const el = document.createElement('div');
      el.className = 'shop-section-label'; el.textContent = label;
      shopItemsEl.appendChild(el);
    };
    sec('👆 CLICK POWER');
    UPGRADES.filter(u => u.type === 'cpc').forEach(u => shopItemsEl.appendChild(makeItem(u)));
    sec('⚙️ AUTO GENERATORS');
    UPGRADES.filter(u => u.type === 'cps').forEach(u => shopItemsEl.appendChild(makeItem(u)));
  }

  function makeItem(u) {
    const cost  = upgradeCost(u);
    const count = state.upgrades[u.id] || 0;
    const el = document.createElement('div');
    el.className = 'shop-item' + (state.coins >= cost ? ' can-buy' : '');
    el.dataset.id = u.id;
    el.innerHTML = `
      <span class="si-icon">${u.icon}</span>
      <div class="si-info">
        <span class="si-name">${u.name}</span>
        <span class="si-desc">${u.desc}</span>
      </div>
      <div class="si-right">
        <span class="si-cost">${fmt(cost)}</span>
        <span class="si-count">x${count}</span>
      </div>`;
    const buy = () => {
      const c = upgradeCost(u);
      if (state.coins < c) return;
      state.coins -= c;
      state.upgrades[u.id] = (state.upgrades[u.id] || 0) + 1;
      recalcStats();
      updateItemInShop(u);
      spawnFloat(u.icon, null, null, null);
      save();
      checkAchievements();
    };
    el.addEventListener('click', buy);
    el.addEventListener('touchstart', ev => { ev.preventDefault(); buy(); }, { passive: false });
    return el;
  }

  function updateItemInShop(u) {
    const el = shopItemsEl ? shopItemsEl.querySelector(`[data-id="${u.id}"]`) : null;
    if (!el) return;
    const cost  = upgradeCost(u);
    el.classList.toggle('can-buy', state.coins >= cost);
    const costEl  = el.querySelector('.si-cost');
    const countEl = el.querySelector('.si-count');
    if (costEl)  costEl.textContent  = fmt(cost);
    if (countEl) countEl.textContent = 'x' + (state.upgrades[u.id] || 0);
  }

  function refreshShopAffordability() {
    UPGRADES.forEach(u => {
      const el = shopItemsEl ? shopItemsEl.querySelector(`[data-id="${u.id}"]`) : null;
      if (!el) return;
      el.classList.toggle('can-buy', state.coins >= upgradeCost(u));
      const costEl = el.querySelector('.si-cost');
      if (costEl) costEl.textContent = fmt(upgradeCost(u));
    });
  }

  /* ════════════════════════════════════
     DAILY BONUS
  ════════════════════════════════════ */
  function checkDailyBonus() {
    if (!username) return;
    const key   = 'pc_daily_' + username.toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    try {
      const last = localStorage.getItem(key);
      if (last === today) return;
      localStorage.setItem(key, today);
    } catch(e) { return; }

    // Bonus = 30 min de production (ou minimum 500)
    const bonus = Math.max(500, Math.floor(state.coinsPerSec * state.prestigeMultiplier * 1800));
    addCoins(bonus);

    // Show banner
    const banner = document.getElementById('daily-bonus-banner');
    const amtEl  = document.getElementById('daily-bonus-amount');
    if (banner && amtEl) {
      amtEl.textContent = fmt(bonus);
      banner.classList.remove('hidden');
      setTimeout(() => banner.classList.add('hidden'), 4500);
    }
    spawnFloat('🎁 DAILY BONUS! +' + fmt(bonus), null, null, 'big');
  }

  /* ════════════════════════════════════
     LUCKY EVENT — objet bonus aléatoire
  ════════════════════════════════════ */
  function scheduleLuckyEvent() {
    const delay = (120 + Math.random() * 120) * 1000; // 2–4 min
    luckyTimeout = setTimeout(spawnLuckyEvent, delay);
  }

  function spawnLuckyEvent() {
    if (luckyActive) { scheduleLuckyEvent(); return; }
    luckyActive = true;

    const items = ['💰','🌟','🎁','🔮','🍀','⚡','💎','🎰'];
    const icon  = items[Math.floor(Math.random() * items.length)];
    const reward = Math.max(
      state.coins * 0.5,
      state.coinsPerSec * state.prestigeMultiplier * 30
    );

    const btn = document.createElement('button');
    btn.id        = 'lucky-btn';
    btn.className = 'lucky-btn';
    btn.innerHTML = `<span class="lucky-icon">${icon}</span><span class="lucky-label">LUCKY!</span>`;
    btn.style.left = (20 + Math.random() * 60) + '%';
    btn.style.top  = (20 + Math.random() * 40) + '%';

    const click = () => {
      addCoins(reward);
      spawnFloat('🍀 LUCKY! +' + fmt(reward), null, null, 'big');
      btn.remove();
      luckyActive = false;
      scheduleLuckyEvent();
    };
    btn.addEventListener('click',      click);
    btn.addEventListener('touchstart', e => { e.preventDefault(); click(); }, { passive: false });

    const area = document.getElementById('click-area');
    if (area) area.appendChild(btn);

    // Auto-disparaît après 8 s
    setTimeout(() => {
      if (btn.parentNode) { btn.remove(); luckyActive = false; scheduleLuckyEvent(); }
    }, 8000);
  }

  /* ════════════════════════════════════
     ACHIEVEMENTS
  ════════════════════════════════════ */
  function checkAchievements() {
    ACHIEVEMENTS.forEach(a => {
      if (state.unlockedAchievements.includes(a.id)) return;
      if (!a.check(state)) return;
      state.unlockedAchievements.push(a.id);
      showAchievementToast(a);
      renderAchievements();
      save();
    });
  }

  function showAchievementToast(a) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast-icon">${a.icon}</span>
      <div class="toast-body">
        <span class="toast-title">🏅 ACHIEVEMENT</span>
        <span class="toast-sub">${a.name} — ${a.desc}</span>
      </div>`;
    toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3800);
  }

  function renderAchievements() {
    if (!achievListEl) return;
    achievListEl.innerHTML = '';
    const unlocked = state.unlockedAchievements || [];
    ACHIEVEMENTS.forEach(a => {
      const el = document.createElement('div');
      el.className = 'ach-item' + (unlocked.includes(a.id) ? ' unlocked' : '');
      el.innerHTML = `
        <span class="ach-icon">${unlocked.includes(a.id) ? a.icon : '🔒'}</span>
        <div class="ach-info">
          <span class="ach-name">${a.name}</span>
          <span class="ach-desc">${a.desc}</span>
        </div>
        <span class="ach-badge">${unlocked.includes(a.id) ? '✅' : '?'}</span>`;
      achievListEl.appendChild(el);
    });
    if (achievCountEl) {
      achievCountEl.textContent = `${unlocked.length} / ${ACHIEVEMENTS.length}`;
    }
  }

  /* ════════════════════════════════════
     AUTO-TICK + UI TICK
  ════════════════════════════════════ */
  function startAuto() {
    if (autoInterval) clearInterval(autoInterval);
    autoInterval = setInterval(() => {
      const earned = state.coinsPerSec * state.prestigeMultiplier;
      if (earned > 0) addCoins(earned);
    }, 1000);
  }

  function startUi() {
    if (uiInterval) clearInterval(uiInterval);
    uiInterval = setInterval(() => {
      if (coinsEl)         coinsEl.textContent        = fmt(state.coins);
      if (cpsEl)           cpsEl.textContent           = fmt(state.coinsPerSec * state.prestigeMultiplier) + '/s';
      if (cpcEl)           cpcEl.textContent           = '+' + fmt(state.clickPower * state.prestigeMultiplier);
      if (totalEarnedEl)   totalEarnedEl.textContent   = fmt(state.totalEarnedAllTime);
      if (prestigeCountEl) prestigeCountEl.textContent = state.prestigeCount;
      if (multiEl)         multiEl.textContent         = 'x' + state.prestigeMultiplier;
      if (shopCoinsEl)     shopCoinsEl.textContent     = fmt(state.coins);
      refreshShopAffordability();
    }, 200);
  }

  /* ════════════════════════════════════
     PRESTIGE
  ════════════════════════════════════ */
  function doPrestige() {
    state.prestigeCount++;
    state.prestigeMultiplier = state.prestigeCount + 1;
    state.prestigeThreshold  = Math.floor(state.prestigeThreshold * 5);
    const allTime = state.totalEarnedAllTime;

    window.onPrestige && window.onPrestige(state.prestigeCount, state.prestigeMultiplier, allTime);

    state.coins       = 0;
    state.totalEarned = 0;
    state.upgrades    = {};
    state.clickPower  = 1;
    state.coinsPerSec = 0;
    currentPhaseIdx   = 0;
    comboCount        = 1;

    recalcStats();
    applyPhase(0, false);
    buildShop();
    if (btnPrestige) btnPrestige.classList.add('hidden');
    if (presIdleLabel) presIdleLabel.style.display = '';
    checkAchievements();
    save();
  }

  /* ════════════════════════════════════
     SAVE / LOAD
  ════════════════════════════════════ */
  function getSaveObject() {
    return {
      coins:              state.coins,
      totalEarned:        state.totalEarned,
      totalEarnedAllTime: state.totalEarnedAllTime,
      prestigeCount:      state.prestigeCount,
      prestigeMultiplier: state.prestigeMultiplier,
      prestigeThreshold:  state.prestigeThreshold,
      upgrades:           state.upgrades,
      totalClicks:        state.totalClicks,
      totalCrits:         state.totalCrits,
      maxCombo:           state.maxCombo,
      unlockedAchievements: state.unlockedAchievements,
    };
  }

  function save() {
    if (username) {
      try { localStorage.setItem('pc_' + username.toLowerCase(), JSON.stringify(getSaveObject())); } catch(e) {}
    }
    if (window._saveSaveData && username) {
      window._saveSaveData(username, getSaveObject()).catch(() => {});
    }
  }

  function loadFromObject(saved) {
    if (!saved || typeof saved !== 'object') return;
    Object.assign(state, {
      coins:              Number(saved.coins)              || 0,
      totalEarned:        Number(saved.totalEarned)        || 0,
      totalEarnedAllTime: Number(saved.totalEarnedAllTime) || 0,
      prestigeCount:      Number(saved.prestigeCount)      || 0,
      prestigeMultiplier: Number(saved.prestigeMultiplier) || 1,
      prestigeThreshold:  Number(saved.prestigeThreshold)  || 1e6,
      upgrades:           (saved.upgrades && typeof saved.upgrades === 'object') ? saved.upgrades : {},
      totalClicks:        Number(saved.totalClicks)        || 0,
      totalCrits:         Number(saved.totalCrits)         || 0,
      maxCombo:           Number(saved.maxCombo)           || 0,
      unlockedAchievements: Array.isArray(saved.unlockedAchievements) ? saved.unlockedAchievements : [],
    });
    currentPhaseIdx = getPhaseIdx(state.totalEarned);
  }

  function loadFromLocalStorage() {
    if (!username) return;
    try {
      const raw = localStorage.getItem('pc_' + username.toLowerCase());
      if (raw) loadFromObject(JSON.parse(raw));
    } catch(e) {}
  }

  /* ════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════ */
  window._getGameState = function () {
    return {
      coins:              state.coins,
      totalEarned:        state.totalEarned,
      totalEarnedAllTime: state.totalEarnedAllTime,
      prestigeCount:      state.prestigeCount,
      prestigeMultiplier: state.prestigeMultiplier,
      prestigeThreshold:  state.prestigeThreshold,
      clickPower:         state.clickPower,
      coinsPerSec:        state.coinsPerSec,
      totalClicks:        state.totalClicks,
      totalCrits:         state.totalCrits,
      maxCombo:           state.maxCombo,
    };
  };

  window._startGame = function (uname, externalState) {
    username = uname || '';

    if (externalState && typeof externalState === 'object' && Object.keys(externalState).length > 0) {
      loadFromObject(externalState);
    } else {
      loadFromLocalStorage();
    }

    recalcStats();
    applyPhase(currentPhaseIdx, false);
    buildShop();
    renderAchievements();
    startAuto();
    startUi();
    scheduleLuckyEvent();

    if (state.totalEarned >= state.prestigeThreshold && btnPrestige) {
      btnPrestige.classList.remove('hidden');
      if (presIdleLabel) presIdleLabel.style.display = 'none';
    }

    // Daily bonus après 1 seconde (laisse le temps au jeu de s'initialiser)
    setTimeout(() => checkDailyBonus(), 1000);
  };

  /* ── Password show/hide ── */
  const pwdInput  = document.getElementById('password-input');
  const pwdToggle = document.getElementById('pwd-toggle');
  const pwdIcon   = document.getElementById('pwd-toggle-icon');
  if (pwdToggle && pwdInput) {
    pwdToggle.addEventListener('click', () => {
      const isPassword = pwdInput.type === 'password';
      pwdInput.type  = isPassword ? 'text' : 'password';
      if (pwdIcon) pwdIcon.textContent = isPassword ? '🙈' : '👁';
    });
  }

  /* ── Input listeners ── */
  if (clickObj) {
    clickObj.addEventListener('mousedown', e => { e.preventDefault(); handleClick(e); });
    clickObj.addEventListener('touchstart', e => { e.preventDefault(); handleClick(e); }, { passive: false });
  }
  if (btnPrestige) {
    btnPrestige.addEventListener('click', doPrestige);
    btnPrestige.addEventListener('touchstart', e => { e.preventDefault(); doPrestige(); }, { passive: false });
  }
  window.addEventListener('keydown', e => {
    if ((e.code === 'Space' || e.code === 'Enter') &&
        document.getElementById('screen-game') &&
        !document.getElementById('screen-game').classList.contains('hidden') &&
        document.getElementById('overlay') &&
        document.getElementById('overlay').classList.contains('hidden')) {
      e.preventDefault();
      handleClick(null);
    }
  });

})();
