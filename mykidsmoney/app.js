// MyKidsMoney — screen flow & action dispatch. Owns navigation and wallet/XP/
// mastery side-effects; delegates actual markup to renderers.js and all rules
// to engine.js.

// Normalize away any mid-activity screen from a previous session — resuming
// mid-Stage isn't supported, we land back on the Coinbrook map instead.
if (['activity', 'boss', 'goal-celebration', 'boss-recap'].includes(state.screen)) state.screen = 'coinbrook';

// ---------- Sound (synthesized, no audio files) ----------

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTone(freq, startTime, duration, type, gainPeak) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak || 0.15, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}
const Sound = {
  pop() { if (state.settings.sound) playTone(520, getAudioCtx().currentTime, 0.12, 'triangle', 0.12); },
  correct() { if (state.settings.sound) { const t = getAudioCtx().currentTime; playTone(660, t, 0.15, 'sine', 0.14); playTone(880, t + 0.08, 0.18, 'sine', 0.14); } },
  gentle() { if (state.settings.sound) playTone(440, getAudioCtx().currentTime, 0.2, 'sine', 0.1); },
  fanfare() { if (state.settings.sound) { const t = getAudioCtx().currentTime; [523, 659, 784, 1047].forEach((f, i) => playTone(f, t + i * 0.11, 0.3, 'triangle', 0.13)); } },
};

// ---------- Transient (non-persisted) navigation & activity runtime ----------

let rt = {};
let currentStageId = null;
let currentActivityIndex = 0;
let bossBeats = [];
let bossBeatIndex = 0;
let lastAllocation = null;
let pendingResume = null;
let lastRenderKey = null;

function currentActivity() {
  if (state.screen === 'boss') return bossBeats[bossBeatIndex];
  const stage = WORLD1.stages.find(s => s.id === currentStageId);
  return stage ? stage.activities[currentActivityIndex] : null;
}

function buildBossBeats() {
  const broken = BOSS.brokenThingVariants[Math.floor(Math.random() * BOSS.brokenThingVariants.length)];
  const shop = BOSS.shoppingVariants[Math.floor(Math.random() * BOSS.shoppingVariants.length)];
  const g = goalDef();
  return [
    { id: 'boss-intro', type: 'reveal', skills: [], xpTier: null, content: { cards: [
      { emoji: '🌅', text: g ? `Big day in Coinbrook! It's almost time for your ${g.name.toLowerCase()}...` : 'Big day today in Coinbrook!' },
    ] } },
    { id: 'boss-chore', type: 'chore', skills: [{ skill: 'EARNING', tier: 'boss' }], xpTier: null, content: { chores: [{ id: 'boss-chore', icon: '🧹', name: 'Help around the house', taps: 3, pay: 4 }] } },
    { id: 'boss-broken', type: 'choose', skills: [{ skill: 'NEEDS_WANTS', tier: 'boss' }, { skill: 'TRADE_OFFS', tier: 'boss' }], xpTier: null, content: {
      emoji: '😮', prompt: `${broken.prompt} You have $3 left today.`,
      options: [{ id: 'fix', label: broken.fix, best: true }, { id: 'alt', label: broken.alt }],
    } },
    { id: 'boss-shopping', type: 'compare', skills: [{ skill: 'VALUE', tier: 'boss' }], xpTier: null, content: shop },
    { id: 'boss-endofday', type: 'allocate', skills: [{ skill: 'JAR_LITERACY', tier: 'boss' }, { skill: 'PATIENCE', tier: 'boss' }, { skill: 'GOALS', tier: 'boss' }], xpTier: null, content: { amount: 3, prompt: "End of the day — what's left goes in your jars." } },
  ];
}

// ---------- Rendering ----------

const app = document.getElementById('app');

function renderKey() {
  if (state.screen === 'activity') return `activity:${currentStageId}:${currentActivityIndex}`;
  if (state.screen === 'boss') return `boss:${bossBeatIndex}`;
  return state.screen;
}

function render() {
  const key = renderKey();
  const isNewScreen = key !== lastRenderKey;
  lastRenderKey = key;
  app.innerHTML = '';
  const hud = shouldShowHud() ? renderHud() : '';
  let screenHtml = SCREENS[state.screen] ? SCREENS[state.screen]() : SCREENS.valley();
  if (!isNewScreen) screenHtml = screenHtml.replace('class="screen"', 'class="screen no-anim"');
  app.innerHTML = hud + screenHtml;
  if (isNewScreen) window.scrollTo(0, 0);
  persist();
}

function goToScreen(screen) {
  state.screen = screen;
  render();
}

function shouldShowHud() { return !['welcome', 'profile'].includes(state.screen); }

function renderHud() {
  const { current } = rankInfo(state.xp);
  const badge = state.avatarCosmetic === 'badge' ? ' 🎖️' : '';
  return `
    <div class="top-hud">
      <div class="hud-item">${state.child.avatar}${badge} ${escapeHtml(state.child.name)}</div>
      <div class="hud-item">⭐ ${state.xp} XP</div>
      <div class="hud-item">${current.name}</div>
      <div class="hud-item sound-toggle" data-action="toggle-sound">${state.settings.sound ? '🔊' : '🔇'}</div>
    </div>
  `;
}

function renderActivityBody(activity) {
  switch (activity.type) {
    case 'reveal': return renderReveal(activity.content, rt);
    case 'sort': return renderSort(activity.content, rt);
    case 'jar-explore': return renderJarExplore(activity.content, rt);
    case 'allocate': return renderAllocate(activity.content, rt);
    case 'choose': return renderChoose(activity.content, rt);
    case 'compare': return renderCompare(activity.content, rt);
    case 'chore': return renderChore(activity.content, rt);
    case 'goal-pick': return renderGoalPick();
    case 'consequence': return renderConsequenceBody();
    default: return '';
  }
}

function renderConsequenceBody() {
  const a = lastAllocation || { spend: 0, save: 0, give: 0 };
  const lines = [];
  if (a.spend > 0) lines.push(`🎉 You bought something fun with $${a.spend}!`);
  if (a.save > 0) lines.push(`🌱 Your Save jar grew by $${a.save}!`);
  if (a.give > 0) lines.push(`❤️ You made someone smile with $${a.give}!`);
  return `
    <div class="celebrate">✨</div>
    <div class="title">Nice choices!</div>
    <div class="card">${lines.map(l => `<p class="subtitle" style="margin-bottom:8px;">${l}</p>`).join('')}</div>
    <button class="btn" data-action="activity-continue">Continue</button>
  `;
}

const SCREENS = {
  welcome: () => {
    const hasProfile = !!state.child.name;
    return `
      <div class="screen">
        <div class="emoji-hero">🦊🌳</div>
        <div class="title">Welcome to Sprout Valley</div>
        <div class="subtitle">A world of money adventures — let's explore!</div>
        ${hasProfile
          ? `<button class="btn" data-action="continue-profile">Continue as ${state.child.avatar} ${escapeHtml(state.child.name)}</button>
             <button class="btn secondary" data-action="new-profile">Start Over</button>`
          : `<button class="btn" data-action="start">Start</button>`}
      </div>
    `;
  },

  profile: () => `
    <div class="screen">
      <div class="title">Who's exploring today?</div>
      <div class="card">
        <div class="subtitle" style="margin-bottom:10px;">Pick your traveller</div>
        <div class="grid">
          ${AVATARS.map(a => `<div class="choice-tile ${a === state.child.avatar ? 'selected' : ''}" data-action="pick-avatar" data-value="${a}">${a}</div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="subtitle" style="margin-bottom:10px;">What's your name?</div>
        <input type="text" id="name-input" placeholder="Type your name" value="${escapeHtml(state.child.name)}" maxlength="16">
      </div>
      <div class="card">
        <div class="subtitle" style="margin-bottom:10px;">How old are you?</div>
        <div class="age-picker">
          ${[5, 6, 7, 8].map(a => `<div class="age-pill ${a === state.child.age ? 'selected' : ''}" data-action="pick-age" data-value="${a}">${a}</div>`).join('')}
        </div>
      </div>
      <button class="btn" data-action="save-profile">Let's Go!</button>
    </div>
  `,

  valley: () => {
    const complete = state.coinbrook.bossUnlocked;
    return `
      <div class="screen">
        <div class="title">Sprout Valley</div>
        <div class="subtitle">Your journey through the world of money</div>
        <div class="valley-map">
          <div class="valley-path"></div>
          ${VALLEY_WORLDS.map(w => {
            const cls = w.built ? (complete ? 'done' : 'current') : 'locked';
            return `<div class="valley-node ${cls}" data-action="${w.built ? 'go-coinbrook' : ''}">
              ${cls === 'current' ? `<div class="valley-avatar">${state.child.avatar}</div>` : ''}
              <div class="valley-dot">${w.built ? w.icon : '❔'}</div>
              <div class="valley-label">${w.name}</div>
            </div>`;
          }).join('')}
        </div>
        <button class="btn secondary" data-action="go-museum">🏛️ Money Museum</button>
      </div>
    `;
  },

  coinbrook: () => {
    const stages = WORLD1.stages;
    const completed = state.coinbrook.completedStages;
    const nextIdx = stages.findIndex(s => !completed.includes(s.id));
    const allDone = nextIdx === -1;
    const g = goalDef();
    return `
      <div class="screen">
        <div class="title">Coinbrook</div>
        <div class="subtitle">Tap a stage to begin</div>
        <div class="valley-map">
          <div class="valley-path"></div>
          ${stages.map((s, i) => {
            const done = completed.includes(s.id);
            const cls = done ? 'done' : (i === nextIdx ? 'current' : 'locked');
            return `<div class="valley-node ${cls}" data-action="${cls !== 'locked' ? 'enter-stage' : ''}" data-value="${s.id}">
              ${cls === 'current' ? `<div class="valley-avatar">${state.child.avatar}</div>` : ''}
              <div class="valley-dot">${done ? '🌳' : s.icon}</div>
              <div class="valley-label">${escapeHtml(s.name)}</div>
            </div>`;
          }).join('')}
          <div class="valley-node ${allDone ? 'current' : 'locked'}" data-action="${allDone ? 'enter-boss' : ''}">
            ${allDone ? `<div class="valley-avatar">${state.child.avatar}</div>` : ''}
            <div class="valley-dot">👑</div>
            <div class="valley-label">The Big Day</div>
          </div>
        </div>
        ${g ? `
          <div class="card">
            <div class="subtitle" style="margin-bottom:6px;">${g.icon} Saving for a ${g.name}</div>
            <div class="progress-wrap"><div class="progress-fill" style="width:${goalProgressPct()}%"></div></div>
            <p class="subtitle" style="margin-top:6px;">$${state.wallet.save} of $${g.target}</p>
          </div>
        ` : ''}
        <button class="btn secondary" data-action="go-valley">← Back to Sprout Valley</button>
      </div>
    `;
  },

  activity: () => {
    const stage = WORLD1.stages.find(s => s.id === currentStageId);
    const activity = stage.activities[currentActivityIndex];
    const dots = stage.activities.map((a, i) => i <= currentActivityIndex ? '●' : '○').join(' ');
    return `
      <div class="screen">
        <div class="stage-progress mono">${stage.icon} ${escapeHtml(stage.name)} &nbsp; ${dots}</div>
        <div class="title" style="font-size:22px;">${escapeHtml(activity.title)}</div>
        ${renderActivityBody(activity)}
      </div>
    `;
  },

  boss: () => {
    const activity = bossBeats[bossBeatIndex];
    return `
      <div class="screen">
        <div class="stage-progress mono">🌅 The Big Day &nbsp; ${bossBeatIndex + 1}/${bossBeats.length}</div>
        ${renderActivityBody(activity)}
      </div>
    `;
  },

  'boss-recap': () => {
    const unlocked = state.coinbrook.bossUnlocked;
    const touched = ['EARNING', 'NEEDS_WANTS', 'TRADE_OFFS', 'VALUE', 'JAR_LITERACY', 'PATIENCE', 'GOALS'];
    const lines = touched.filter(s => (state.mastery[s] || 0) > 0).map(s => `• You ${CONFIG.skillDescriptors[s]}`);
    return `
      <div class="screen">
        <div class="celebrate">${unlocked ? '🏆' : '🌱'}</div>
        <div class="title">${unlocked ? 'What a day!' : 'What a day!'}</div>
        <div class="card">
          <p class="subtitle" style="margin-bottom:8px;">Here's what Miro saw today:</p>
          ${lines.map(l => `<p class="subtitle" style="text-align:left; margin-bottom:6px;">${escapeHtml(l)}</p>`).join('')}
        </div>
        ${unlocked ? `
          <div class="card" style="text-align:center;">
            <div class="emoji-hero">🌫️➡️🏦</div>
            <p class="subtitle">You're ready! The fog is lifting over The Bank — World 2 is on the way.</p>
          </div>
        ` : `
          <div class="card" style="text-align:center;">
            <p class="subtitle">You're getting more confident every day! Explore Coinbrook a little more, then come back for another Big Day.</p>
          </div>
        `}
        <button class="btn" data-action="boss-recap-continue">${unlocked ? 'Back to Sprout Valley' : 'Practice More'}</button>
      </div>
    `;
  },

  'goal-celebration': () => {
    const g = goalDef();
    return `
      <div class="screen">
        ${confettiHtml()}
        <div class="celebrate">🎁</div>
        <div class="title">Goal Reached!</div>
        <div class="card" style="text-align:center;">
          <div class="emoji-hero">${g.icon}</div>
          <p class="subtitle">You saved up for your ${g.name}!</p>
        </div>
        <button class="btn" data-action="goal-celebration-continue">Continue</button>
      </div>
    `;
  },

  museum: () => `
    <div class="screen">
      <div class="title">🏛️ Money Museum</div>
      <div class="subtitle">Everything you've discovered so far</div>
      <div class="museum-grid">
        ${ACHIEVEMENT_DEFS.map(a => {
          const rec = state.achievements[a.id];
          return `<div class="museum-card ${rec.earned ? 'earned' : 'locked'}">
            <div class="museum-icon">${rec.earned ? a.icon : '🔒'}</div>
            <div class="museum-title">${escapeHtml(a.title)}</div>
            <div class="museum-desc">${escapeHtml(a.desc)}</div>
            ${rec.earned ? `<div class="museum-date mono">${rec.earnedDate}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
      <button class="btn secondary" data-action="go-valley">← Back to Sprout Valley</button>
    </div>
  `,
};

function confettiHtml() {
  const colors = ['#f3b23e', '#ff7a5c', '#3f9c5c', '#e05b8f', '#5b9bd5'];
  let pieces = '';
  for (let i = 0; i < 20; i++) {
    const left = Math.round(Math.random() * 100);
    const delay = (Math.random() * 0.4).toFixed(2);
    const duration = (1.2 + Math.random() * 0.8).toFixed(2);
    const color = colors[i % colors.length];
    const rotate = Math.round(Math.random() * 360);
    pieces += `<div class="confetti-piece" style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${duration}s;transform:rotate(${rotate}deg)"></div>`;
  }
  return `<div class="confetti-wrap">${pieces}</div>`;
}

function pulseJar(jarKey) {
  const el = app.querySelector('.jar.' + jarKey);
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
  const floater = document.createElement('div');
  floater.className = 'float-coin';
  floater.textContent = '+$1';
  floater.addEventListener('animationend', () => floater.remove());
  el.appendChild(floater);
}

// ---------- Activity completion & progression ----------

function finishActivity() {
  const activity = currentActivity();
  const boss = state.screen === 'boss';

  if (activity.type === 'allocate') {
    state.wallet.spend += rt.allocated.spend;
    state.wallet.save += rt.allocated.save;
    state.wallet.give += rt.allocated.give;
    lastAllocation = { ...rt.allocated };
    if (activity.id === 'first-ten') grantAchievement('first-jar');
  }
  if (activity.id === 'spend-or-save') {
    if (rt.answered === 'save') state.wallet.save += 6; else state.wallet.spend += 6;
  }
  if (activity.id === 'chore-board') grantAchievement('first-earn');
  if (activity.id === 'sort-it-out') grantAchievement('needs-wants-sorter');
  if (activity.id === 'apple-trap' && rt.answered === 'small-bags') grantAchievement('value-spotter');

  grantEvidence(activity.skills);
  if (!boss && activity.xpTier) activityXP(activity.id, activity.xpTier);

  const goalJustCompleted = checkGoalComplete();
  const proceed = () => { boss ? advanceBoss() : advanceStage(); };
  if (goalJustCompleted) {
    grantAchievement('goal-reached');
    addXP(CONFIG.xp.goalComplete);
    Sound.fanfare();
    pendingResume = proceed;
    goToScreen('goal-celebration');
  } else {
    proceed();
  }
}

function advanceStage() {
  currentActivityIndex++;
  const stage = WORLD1.stages.find(s => s.id === currentStageId);
  if (currentActivityIndex >= stage.activities.length) {
    if (!state.coinbrook.completedStages.includes(currentStageId)) {
      state.coinbrook.completedStages.push(currentStageId);
      Sound.fanfare();
      if (coinbrookComplete()) grantAchievement('coinbrook-explorer');
    }
    goToScreen('coinbrook');
  } else {
    rt = {};
    goToScreen('activity');
  }
}

function advanceBoss() {
  bossBeatIndex++;
  if (bossBeatIndex >= bossBeats.length) {
    finishBoss();
  } else {
    rt = {};
    render();
  }
}

function finishBoss() {
  state.coinbrook.bossAttempts++;
  grantAchievement('big-day-complete');
  addXP(CONFIG.xp.bossComplete);
  if (worldUnlockCheck() && !state.coinbrook.bossUnlocked) {
    state.coinbrook.bossUnlocked = true;
    state.avatarCosmetic = 'badge';
    grantAchievement('money-explorer-trophy');
  }
  Sound.fanfare();
  goToScreen('boss-recap');
}

// ---------- Actions ----------

app.addEventListener('input', (e) => {
  if (e.target.id === 'name-input') state.child.name = e.target.value;
});

app.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target || target.disabled || !target.getAttribute('data-action')) return;
  handleAction(target.getAttribute('data-action'), target.getAttribute('data-value'));
});

function handleAction(action, value) {
  switch (action) {
    case 'toggle-sound':
      state.settings.sound = !state.settings.sound;
      render();
      break;

    case 'start': goToScreen('profile'); break;
    case 'continue-profile': goToScreen('valley'); break;
    case 'new-profile': {
      const keepAge = state.child.age;
      state = freshState();
      state.child.age = keepAge;
      goToScreen('profile');
      break;
    }
    case 'pick-avatar': state.child.avatar = value; render(); break;
    case 'pick-age': state.child.age = Number(value); render(); break;
    case 'save-profile': {
      const name = state.child.name.trim() || 'Explorer';
      state.child.name = name.slice(0, 16);
      goToScreen('valley');
      break;
    }

    case 'go-valley': goToScreen('valley'); break;
    case 'go-coinbrook': goToScreen('coinbrook'); break;
    case 'go-museum': goToScreen('museum'); break;

    case 'enter-stage': {
      const stages = WORLD1.stages;
      const idx = stages.findIndex(s => s.id === value);
      const nextIdx = stages.findIndex(s => !state.coinbrook.completedStages.includes(s.id));
      const available = state.coinbrook.completedStages.includes(value) || idx === nextIdx || nextIdx === -1;
      if (!available) return;
      currentStageId = value; currentActivityIndex = 0; rt = {};
      goToScreen('activity');
      break;
    }
    case 'enter-boss': {
      if (!coinbrookComplete()) return;
      bossBeats = buildBossBeats(); bossBeatIndex = 0; rt = {};
      goToScreen('boss');
      break;
    }
    case 'boss-recap-continue':
      goToScreen(state.coinbrook.bossUnlocked ? 'valley' : 'coinbrook');
      break;
    case 'goal-celebration-continue': {
      const fn = pendingResume; pendingResume = null;
      if (fn) fn();
      break;
    }

    case 'reveal-next': {
      const activity = currentActivity();
      const isLast = (rt.index || 0) >= activity.content.cards.length - 1;
      if (isLast) finishActivity(); else { rt.index = (rt.index || 0) + 1; render(); }
      break;
    }
    case 'sort-pick': {
      const [itemId, zone] = value.split(':');
      rt.answers = rt.answers || {};
      rt.answers[itemId] = zone;
      Sound.pop();
      render();
      break;
    }
    case 'jar-explore-tap': {
      rt.seen = rt.seen || [];
      if (!rt.seen.includes(value)) rt.seen.push(value);
      rt.lastSeen = value;
      render();
      break;
    }
    case 'allocate-drop': {
      rt.allocated = rt.allocated || { spend: 0, save: 0, give: 0 };
      if (rt.coinsLeft === undefined) rt.coinsLeft = currentActivity().content.amount;
      if (rt.coinsLeft <= 0) return;
      rt.allocated[value] += 1;
      rt.coinsLeft -= 1;
      Sound.pop();
      render();
      pulseJar(value);
      break;
    }
    case 'choose-pick': {
      const activity = currentActivity();
      const opt = activity.content.options.find(o => o.id === value);
      rt.answered = value;
      if (opt.best === true) Sound.correct(); else if (opt.best === false) Sound.gentle(); else Sound.correct();
      render();
      break;
    }
    case 'choose-followup-pick': {
      const activity = currentActivity();
      const fo = activity.content.followup.options.find(o => o.id === value);
      rt.followupAnswered = value;
      fo.correct ? Sound.correct() : Sound.gentle();
      render();
      break;
    }
    case 'compare-pick': {
      const activity = currentActivity();
      const opt = activity.content.options.find(o => o.id === value);
      rt.answered = value;
      opt.best ? Sound.correct() : Sound.gentle();
      render();
      break;
    }
    case 'chore-tap': {
      const activity = currentActivity();
      const chore = activity.content.chores.find(c => c.id === value);
      rt.taps = rt.taps || {};
      rt.taps[value] = (rt.taps[value] || 0) + 1;
      Sound.pop();
      render();
      break;
    }
    case 'goal-pick': {
      state.goal = value;
      grantAchievement('first-goal-set');
      const activity = currentActivity();
      grantEvidence(activity.skills);
      if (activity.xpTier) activityXP(activity.id, activity.xpTier);
      const goalJustCompleted = checkGoalComplete();
      if (goalJustCompleted) {
        grantAchievement('goal-reached');
        addXP(CONFIG.xp.goalComplete);
        Sound.fanfare();
        pendingResume = advanceStage;
        goToScreen('goal-celebration');
      } else {
        advanceStage();
      }
      break;
    }
    case 'activity-continue':
      finishActivity();
      break;
  }
}

render();
