// MyKidsMoney — screen flow & action dispatch. Owns navigation and wallet/XP/
// mastery side-effects; delegates actual markup to renderers.js and all rules
// to engine.js.

// Reload safety: only a handful of screens don't depend on transient,
// non-persisted queue state (activityQueue etc). Anything else falls back to
// Home (or Welcome, if onboarding was never finished) — no mid-scene resume.
const SAFE_RELOAD_SCREENS = ['welcome', 'profile', 'home', 'jobboard', 'museum', 'valley'];
if (!SAFE_RELOAD_SCREENS.includes(state.screen)) {
  state.screen = state.coinbrook.onboarded ? 'home' : 'welcome';
}

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

// ---------- Generic activity queue ----------
// One mechanism reused for onboarding, a single job, a Market visit, an
// Event, the "decide" jar allocation, and the multi-beat Big Day — anything
// that's "step through N activities, then do something."

let activityQueue = [];
let activityIndex = 0;
let queueHeading = '';
let queueGen = 0;
let onQueueDone = null;
let rt = {};
let pendingResume = null;
let lastCompletedGoal = null;
let lastRenderKey = null;

function runQueue(list, heading, onDone) {
  activityQueue = list;
  activityIndex = 0;
  queueHeading = heading;
  onQueueDone = onDone;
  queueGen += 1;
  rt = {};
}

function currentActivity() {
  return activityQueue[activityIndex];
}

function advanceQueue() {
  activityIndex += 1;
  if (activityIndex >= activityQueue.length) {
    const fn = onQueueDone;
    onQueueDone = null;
    if (fn) fn();
  } else {
    rt = {};
    render();
  }
}

// Runs after every activity-continue (and goal-pick): domain side-effects
// first, then the shared evidence/XP/goal machinery, then advance.
function finishActivityStep() {
  const act = currentActivity();
  if (act.onFinish) act.onFinish();
  grantEvidence(act.skills);
  if (act.xpTier) activityXP(act.id || act.type, act.xpTier);
  const completedGoal = checkGoalComplete();
  if (completedGoal) {
    lastCompletedGoal = completedGoal;
    grantAchievement('goal-reached');
    addXP(CONFIG.xp.goalComplete);
    Sound.fanfare();
    pendingResume = advanceQueue;
    goToScreen('goal-celebration');
  } else {
    advanceQueue();
  }
}

// ---------- Entering each kind of scene ----------

function enterOnboarding() {
  runQueue(ONBOARDING, '', finishOnboarding);
  goToScreen('activity');
}

function finishOnboarding() {
  state.coinbrook.onboarded = true;
  startNewWeek();
  goToScreen('home');
}

function enterJob(jobId) {
  const job = JOBS.find(j => j.id === jobId);
  if (!job || state.coinbrook.jobsDoneThisWeek.includes(jobId)) return;
  const base = {
    id: job.id, title: job.name, skills: [{ skill: 'EARNING', tier: 'medium' }], xpTier: 'small',
    onFinish: () => {
      state.cash += job.pay;
      state.coinbrook.jobsDoneThisWeek.push(job.id);
      grantAchievement('first-earn');
    },
  };
  let activity;
  if (job.type === 'chore') activity = { ...base, type: 'chore', content: { chores: [{ id: job.id, icon: job.icon, name: job.name, taps: job.content.taps, pay: job.pay }] } };
  else if (job.type === 'clear-grid') activity = { ...base, type: 'clear-grid', content: job.content };
  else activity = { ...base, type: 'sort', content: job.content };
  runQueue([activity], `Week ${state.coinbrook.weekNumber} · Job Board`, () => { completeCurrentDay(); Sound.fanfare(); goToScreen('home'); });
  goToScreen('activity');
}

function enterMarket() {
  const scene = MARKET_SCENES.find(s => s.id === state.coinbrook.marketScene);
  const affordable = scene.options.filter(o => (o.cost || 0) <= state.jars.spend);
  const options = affordable.length ? affordable : scene.options.filter(o => (o.cost || 0) === 0);
  const content = { ...scene, options };
  const activity = {
    type: 'market-scene',
    skills: [{ skill: 'NEEDS_WANTS', tier: 'medium' }, { skill: 'TRADE_OFFS', tier: 'medium' }, { skill: 'VALUE', tier: 'medium' }],
    xpTier: 'moderate',
    content,
    onFinish: () => {
      const picked = content.options.find(o => o.id === rt.answered);
      state.jars.spend -= (picked.cost || 0);
      if (picked.best) grantAchievement('value-spotter');
    },
  };
  runQueue([activity], `Week ${state.coinbrook.weekNumber} · Market`, () => { completeCurrentDay(); goToScreen('home'); });
  goToScreen('activity');
}

function enterEvent() {
  const day = currentDay();
  const ev = EVENTS.find(e => e.id === day.eventId);
  const activity = {
    type: 'choose',
    skills: [{ skill: 'NEEDS_WANTS', tier: 'low' }, { skill: 'TRADE_OFFS', tier: 'low' }],
    xpTier: 'small',
    content: { emoji: ev.icon, prompt: ev.prompt, options: ev.options, feedback: Object.fromEntries(ev.options.map(o => [o.id, o.feedback])) },
    onFinish: () => {
      const picked = ev.options.find(o => o.id === rt.answered);
      if (picked.cost) state.cash = Math.max(0, state.cash - picked.cost);
      if (picked.gain) state.cash += picked.gain;
    },
  };
  runQueue([activity], `Week ${state.coinbrook.weekNumber} · Today`, () => { completeCurrentDay(); goToScreen('home'); });
  goToScreen('activity');
}

function enterDecide() {
  if (state.cash <= 0) return;
  const amount = state.cash;
  const activity = {
    type: 'allocate', title: 'Decide',
    skills: [{ skill: 'JAR_LITERACY', tier: 'low' }, { skill: 'PATIENCE', tier: 'low' }], xpTier: 'small',
    content: { amount, prompt: `You have $${amount}. Tap a jar to decide.` },
    onFinish: () => {
      state.jars.spend += rt.allocated.spend;
      state.jars.save += rt.allocated.save;
      state.jars.give += rt.allocated.give;
      state.cash = 0;
      grantAchievement('first-jar');
    },
  };
  runQueue([activity], `Week ${state.coinbrook.weekNumber}`, () => goToScreen('home'));
  goToScreen('activity');
}

function enterGoalPick() {
  const activity = {
    type: 'goal-pick', skills: [{ skill: 'GOALS', tier: 'low' }], xpTier: 'small', content: {},
    onFinish: () => grantAchievement('first-goal-set'),
  };
  runQueue([activity], '', () => goToScreen('home'));
  goToScreen('activity');
}

function enterBoss() {
  const broken = BOSS.brokenThingVariants[Math.floor(Math.random() * BOSS.brokenThingVariants.length)];
  const shop = BOSS.shoppingVariants[Math.floor(Math.random() * BOSS.shoppingVariants.length)];
  const g = goalDef();
  const beats = [
    { type: 'reveal', skills: [], content: { cards: [
      { emoji: '🌅', text: g ? `Big day in Coinbrook! It's almost time for your ${g.name.toLowerCase()}...` : 'Big day today in Coinbrook!' },
    ] } },
    { type: 'chore', skills: [{ skill: 'EARNING', tier: 'boss' }], content: { chores: [{ id: 'boss-chore', icon: '🧹', name: 'Help around the house', taps: 3, pay: 4 }] } },
    { type: 'choose', skills: [{ skill: 'NEEDS_WANTS', tier: 'boss' }, { skill: 'TRADE_OFFS', tier: 'boss' }], content: {
      emoji: '😮', prompt: `${broken.prompt} You have $3 left today.`,
      options: [{ id: 'fix', label: broken.fix, best: true }, { id: 'alt', label: broken.alt }],
    } },
    { type: 'compare', skills: [{ skill: 'VALUE', tier: 'boss' }], content: shop },
    { type: 'allocate', skills: [{ skill: 'JAR_LITERACY', tier: 'boss' }, { skill: 'PATIENCE', tier: 'boss' }, { skill: 'GOALS', tier: 'boss' }],
      content: { amount: 3, prompt: "End of the day — what's left goes in your jars." },
      onFinish: () => { state.jars.spend += rt.allocated.spend; state.jars.save += rt.allocated.save; state.jars.give += rt.allocated.give; } },
  ];
  runQueue(beats, '👑 The Big Day', finishBoss);
  goToScreen('activity');
}

function finishBoss() {
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

// ---------- Rendering ----------

const app = document.getElementById('app');

function renderKey() {
  if (state.screen === 'activity') return `activity:${queueGen}:${activityIndex}`;
  return state.screen;
}

function render() {
  const key = renderKey();
  const isNewScreen = key !== lastRenderKey;
  lastRenderKey = key;
  app.innerHTML = '';
  const hud = shouldShowHud() ? renderHud() : '';
  let screenHtml = SCREENS[state.screen] ? SCREENS[state.screen]() : SCREENS.home();
  if (!isNewScreen) screenHtml = screenHtml.replace('class="screen"', 'class="screen no-anim"').replace('class="screen home-screen"', 'class="screen home-screen no-anim"');
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
    case 'clear-grid': return renderClearGrid(activity.content, rt);
    case 'market-scene': return renderMarketScene(activity.content, rt);
    default: return '';
  }
}

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function calendarHtml() {
  const c = state.coinbrook;
  return `<div class="calendar">${c.days.map((d, i) => {
    let cls = 'day';
    if (i < c.dayIndex || (i === c.dayIndex && d.done)) cls += ' done';
    else if (i === c.dayIndex) cls += ' today';
    const em = d.type === 'payday' ? '💰' : d.type === 'event' ? '❓' : d.type === 'review' ? '📊' : '·';
    return `<div class="${cls}"><div class="em">${em}</div>${DAY_LABELS[i] || ''}</div>`;
  }).join('')}</div>`;
}

const SCREENS = {
  welcome: () => {
    const hasProfile = !!state.child.name;
    return `
      <div class="screen">
        <div class="emoji-hero">🦊🌳</div>
        <div class="title">Welcome to Sprout Valley</div>
        <div class="subtitle">Miro's waiting to show you around.</div>
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

  activity: () => {
    const act = currentActivity();
    const dots = activityQueue.length > 1 ? activityQueue.map((a, i) => i <= activityIndex ? '●' : '○').join(' ') : '';
    return `
      <div class="screen">
        ${queueHeading ? `<div class="stage-progress mono">${queueHeading}${dots ? ' &nbsp; ' + dots : ''}</div>` : ''}
        ${act.title ? `<div class="title" style="font-size:22px;">${escapeHtml(act.title)}</div>` : ''}
        ${renderActivityBody(act)}
      </div>
    `;
  },

  jobboard: () => `
    <div class="screen">
      <div class="title">💼 Job Board</div>
      <p class="subtitle">Pick a job for today</p>
      <div class="chore-board">
        ${JOBS.map(j => {
          const done = state.coinbrook.jobsDoneThisWeek.includes(j.id);
          return `<div class="chore-tile ${done ? 'done' : ''}" data-action="${done ? '' : 'pick-job'}" data-value="${j.id}">
            <div class="chore-icon">${j.icon}</div>
            <div class="chore-name">${escapeHtml(j.name)}</div>
            <div class="chore-progress">${done ? 'Done this week' : '+$' + j.pay}</div>
          </div>`;
        }).join('')}
      </div>
      <button class="btn secondary" data-action="go-home">← Back Home</button>
    </div>
  `,

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
      <button class="btn secondary" data-action="go-home">← Back Home</button>
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
            return `<div class="valley-node ${cls}" data-action="${w.built ? 'go-home' : ''}">
              ${cls === 'current' ? `<div class="valley-avatar">${state.child.avatar}</div>` : ''}
              <div class="valley-dot">${w.built ? w.icon : '❔'}</div>
              <div class="valley-label">${w.name}</div>
            </div>`;
          }).join('')}
        </div>
        <button class="btn secondary" data-action="go-home">← Back Home</button>
      </div>
    `;
  },

  home: () => {
    const day = currentDay();
    const g = goalDef();
    const giving = givingMomentReady();
    const bigDay = bigDayReady() && !state.coinbrook.bossUnlocked;

    let todayBlock;
    if (day.type === 'choice' && !day.done) {
      todayBlock = `<div class="btn-row"><button class="btn" data-action="go-jobboard">💼 Job Board</button><button class="btn secondary" data-action="go-market">🛒 Market</button></div>`;
    } else if (day.type === 'event' && !day.done) {
      todayBlock = `<button class="btn" data-action="go-event">❓ Something's happening today!</button>`;
    } else if (day.type === 'review' && !day.done) {
      todayBlock = `<button class="btn" data-action="go-review">📊 Weekly Review</button>`;
    } else {
      todayBlock = `<p class="subtitle">All done for today — come back tomorrow.</p>`;
    }

    return `
      <div class="screen home-screen">
        ${calendarHtml()}
        <div class="home-board">
          <div class="hb-card hb-goal">
            <div class="subtitle" style="margin-bottom:6px;">${g ? `${g.icon} Saving for a ${g.name}` : '🎯 No goal yet'}</div>
            ${g ? `
              <div class="progress-wrap"><div class="progress-fill" style="width:${goalProgressPct()}%"></div></div>
              <p class="subtitle" style="margin-top:6px;">$${state.jars.save} of $${g.target}</p>
            ` : `<button class="btn secondary" data-action="go-goalpick">Pick a Goal</button>`}
          </div>

          <div class="hb-card hb-home">
            <div class="emoji-hero" style="font-size:52px;">🏠</div>
            <div class="title" style="font-size:20px;">Home</div>
            ${todayBlock}
            ${giving ? `<button class="btn secondary" data-action="go-giving" style="margin-top:10px;">❤️ A Giving Moment awaits</button>` : ''}
            ${bigDay ? `<button class="btn" data-action="go-boss" style="margin-top:10px;">👑 Ready for the Big Day?</button>` : ''}
          </div>

          <div class="hb-card hb-job">
            <div class="subtitle">💼 Job Board</div>
            <p class="subtitle" style="font-size:13px;">${state.coinbrook.jobsDoneThisWeek.length}/${JOBS.length} jobs done this week</p>
          </div>

          <div class="hb-card hb-market">
            <div class="subtitle">🛒 Market</div>
            <p class="subtitle" style="font-size:13px;">${day.done && day.type !== 'choice' ? 'Closed for today' : 'Open for business'}</p>
          </div>

          <div class="hb-card hb-wallet">
            <div class="stats-row">
              <div class="stat"><div class="value">$${state.cash}</div><div class="label">Wallet</div></div>
              <div class="stat"><div class="value">$${state.jars.spend}</div><div class="label">Spend</div></div>
              <div class="stat"><div class="value">$${state.jars.give}</div><div class="label">Give</div></div>
            </div>
            ${state.cash > 0 ? `<button class="btn" data-action="go-decide" style="margin-top:12px;">🪙 Decide what to do with $${state.cash}</button>` : ''}
          </div>

          <div class="hb-card hb-museum" data-action="go-museum">
            <div class="subtitle">🏛️ Museum</div>
          </div>

          <div class="hb-card hb-valley" data-action="go-valley">
            <div class="subtitle">🗺️ Sprout Valley</div>
          </div>
        </div>
      </div>
    `;
  },

  'weekly-review': () => {
    const touched = ['EARNING', 'NEEDS_WANTS', 'TRADE_OFFS', 'VALUE', 'JAR_LITERACY', 'PATIENCE', 'GOALS'];
    const lines = touched.filter(s => (state.mastery[s] || 0) > 0).map(s => `• You ${CONFIG.skillDescriptors[s]}`);
    return `
      <div class="screen">
        <div class="celebrate">📊</div>
        <div class="title">Week ${state.coinbrook.weekNumber} complete!</div>
        <div class="card">
          <p class="subtitle" style="margin-bottom:8px;">Miro says:</p>
          ${lines.slice(0, 3).map(l => `<p class="subtitle" style="text-align:left; margin-bottom:6px;">${escapeHtml(l)}</p>`).join('')}
        </div>
        <button class="btn" data-action="review-continue">Start Next Week</button>
      </div>
    `;
  },

  'giving-moment': () => `
    <div class="screen">
      <div class="emoji-hero">❤️</div>
      <div class="title">A Giving Moment</div>
      <p class="subtitle" style="text-align:center;">You have $${state.jars.give} in your Give jar. Where should it go?</p>
      <div class="grid">
        ${GIVING_OPTIONS.map(o => `<div class="choice-tile" data-action="give-pick" data-value="${o.id}">${o.icon}<div class="label">${o.label}</div></div>`).join('')}
      </div>
    </div>
  `,

  'giving-thanks': () => {
    const opt = GIVING_OPTIONS.find(o => o.id === state.lastGivingChoice);
    return `
      <div class="screen">
        ${confettiHtml()}
        <div class="celebrate">${opt ? opt.icon : '❤️'}</div>
        <div class="title">Thank you!</div>
        <p class="subtitle" style="text-align:center;">Your giving made a difference.</p>
        <button class="btn" data-action="go-home">Continue</button>
      </div>
    `;
  },

  'goal-celebration': () => `
    <div class="screen">
      ${confettiHtml()}
      <div class="celebrate">🎁</div>
      <div class="title">Goal Reached!</div>
      <div class="card" style="text-align:center;">
        <div class="emoji-hero">${lastCompletedGoal ? lastCompletedGoal.icon : '🎉'}</div>
        <p class="subtitle">You saved up for your ${lastCompletedGoal ? lastCompletedGoal.name : 'goal'}!</p>
      </div>
      <button class="btn" data-action="goal-celebration-continue">Continue</button>
    </div>
  `,

  'boss-recap': () => {
    const unlocked = state.coinbrook.bossUnlocked;
    const touched = ['EARNING', 'NEEDS_WANTS', 'TRADE_OFFS', 'VALUE', 'JAR_LITERACY', 'PATIENCE', 'GOALS'];
    const lines = touched.filter(s => (state.mastery[s] || 0) > 0).map(s => `• You ${CONFIG.skillDescriptors[s]}`);
    return `
      <div class="screen">
        <div class="celebrate">${unlocked ? '🏆' : '🌱'}</div>
        <div class="title">What a day!</div>
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
            <p class="subtitle">You're getting more confident every day! Keep living week to week in Coinbrook, then try another Big Day.</p>
          </div>
        `}
        <button class="btn" data-action="boss-recap-continue">${unlocked ? 'Back to Sprout Valley' : 'Back Home'}</button>
      </div>
    `;
  },
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
    case 'continue-profile':
      state.coinbrook.onboarded ? goToScreen('home') : enterOnboarding();
      break;
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
      enterOnboarding();
      break;
    }

    case 'go-home': goToScreen('home'); break;
    case 'go-valley': goToScreen('valley'); break;
    case 'go-museum': goToScreen('museum'); break;
    case 'go-jobboard':
      if (currentDay().type !== 'choice' || currentDay().done) return;
      goToScreen('jobboard');
      break;
    case 'go-market':
      if (currentDay().type !== 'choice' || currentDay().done) return;
      enterMarket();
      break;
    case 'go-event':
      if (currentDay().type !== 'event' || currentDay().done) return;
      enterEvent();
      break;
    case 'go-review':
      if (currentDay().type !== 'review' || currentDay().done) return;
      goToScreen('weekly-review');
      break;
    case 'go-decide': enterDecide(); break;
    case 'go-goalpick': enterGoalPick(); break;
    case 'go-giving':
      if (!givingMomentReady()) return;
      goToScreen('giving-moment');
      break;
    case 'go-boss':
      if (!bigDayReady()) return;
      enterBoss();
      break;

    case 'pick-job': enterJob(value); break;

    case 'give-pick': {
      grantEvidence([{ skill: 'JAR_LITERACY', tier: 'low' }]);
      addXP(CONFIG.xp.small);
      grantAchievement('giving-moment-done');
      state.jars.give = 0;
      state.coinbrook.givingMomentDoneThisWeek = true;
      state.lastGivingChoice = value;
      Sound.fanfare();
      goToScreen('giving-thanks');
      break;
    }

    case 'review-continue':
      grantAchievement('first-week');
      state.coinbrook.weeksCompleted += 1;
      startNewWeek();
      goToScreen('home');
      break;

    case 'goal-celebration-continue': {
      const fn = pendingResume; pendingResume = null;
      if (fn) fn();
      break;
    }
    case 'boss-recap-continue':
      goToScreen(state.coinbrook.bossUnlocked ? 'valley' : 'home');
      break;

    case 'reveal-next': {
      const act = currentActivity();
      const isLast = (rt.index || 0) >= act.content.cards.length - 1;
      if (isLast) finishActivityStep(); else { rt.index = (rt.index || 0) + 1; render(); }
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
      const act = currentActivity();
      const opt = act.content.options.find(o => o.id === value);
      rt.answered = value;
      if (opt.best === true) Sound.correct(); else if (opt.best === false) Sound.gentle(); else Sound.correct();
      render();
      break;
    }
    case 'choose-followup-pick': {
      const act = currentActivity();
      const fo = act.content.followup.options.find(o => o.id === value);
      rt.followupAnswered = value;
      fo.correct ? Sound.correct() : Sound.gentle();
      render();
      break;
    }
    case 'compare-pick': {
      const act = currentActivity();
      const opt = act.content.options.find(o => o.id === value);
      rt.answered = value;
      if (opt.best) { Sound.correct(); grantAchievement('value-spotter'); } else { Sound.gentle(); }
      render();
      break;
    }
    case 'chore-tap': {
      rt.taps = rt.taps || {};
      rt.taps[value] = (rt.taps[value] || 0) + 1;
      Sound.pop();
      render();
      break;
    }
    case 'clear-tap': {
      rt.cleared = rt.cleared || {};
      rt.cleared[value] = true;
      Sound.pop();
      render();
      break;
    }
    case 'market-pick': {
      const act = currentActivity();
      const opt = act.content.options.find(o => o.id === value);
      rt.answered = value;
      opt.best ? Sound.correct() : Sound.gentle();
      render();
      break;
    }
    case 'goal-pick': {
      state.goal = value;
      finishActivityStep();
      break;
    }
    case 'activity-continue':
      finishActivityStep();
      break;
  }
}

render();
