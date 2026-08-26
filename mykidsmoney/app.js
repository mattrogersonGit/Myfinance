// MyKidsMoney — V1 prototype engine (World 1: Money Explorer, ages 5-8)
// No build step, no backend. State persists to localStorage only.

const SAVE_KEY = 'mkm_state_v1';

function freshState() {
  return {
    child: { name: '', avatar: AVATARS[0], age: 6 },
    xp: 0,
    achievements: [],
    jars: { spend: 0, save: 0, give: 0 },
    goal: null,
    screen: 'welcome',
    settings: { sound: true },
    session: { coinsLeft: 10, allocated: { spend: 0, save: 0, give: 0 }, nwIndex: 0, nwCorrect: 0, newAchievements: [], xpGainedThisLesson: 0 },
  };
}

let state = load() || freshState();
if (!state.settings) state.settings = { sound: true };

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
}

function levelInfo(xp) {
  let current = LEVELS[0];
  let next = LEVELS[1];
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xpRequired) current = LEVELS[i];
    next = LEVELS[i + 1] || null;
  }
  return { current, next };
}

function financialAge() {
  const base = Math.max(3, state.child.age - 3);
  const bonus = Math.floor(state.xp / 40);
  return Math.min(base + bonus, state.child.age + 5);
}

function grantXP(amount) {
  state.xp += amount;
  state.session.xpGainedThisLesson += amount;
}

function grantAchievement(id) {
  if (state.achievements.includes(id)) return;
  state.achievements.push(id);
  state.session.newAchievements.push(id);
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
  pop() {
    if (!state.settings.sound) return;
    const ctx = getAudioCtx();
    playTone(520, ctx.currentTime, 0.12, 'triangle', 0.12);
  },
  correct() {
    if (!state.settings.sound) return;
    const ctx = getAudioCtx();
    playTone(660, ctx.currentTime, 0.15, 'sine', 0.14);
    playTone(880, ctx.currentTime + 0.08, 0.18, 'sine', 0.14);
  },
  gentle() {
    if (!state.settings.sound) return;
    const ctx = getAudioCtx();
    playTone(440, ctx.currentTime, 0.2, 'sine', 0.1);
  },
  fanfare() {
    if (!state.settings.sound) return;
    const ctx = getAudioCtx();
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => playTone(f, ctx.currentTime + i * 0.11, 0.3, 'triangle', 0.13));
  },
};

function goTo(screen) {
  state.screen = screen;
  save();
  render();
}

// ---------- Rendering ----------

const app = document.getElementById('app');
let lastRenderedScreen = null;

function render() {
  const isNewScreen = state.screen !== lastRenderedScreen;
  lastRenderedScreen = state.screen;
  app.innerHTML = '';
  const hud = shouldShowHud() ? renderHud() : '';
  let screenHtml = SCREENS[state.screen]();
  if (!isNewScreen) screenHtml = screenHtml.replace('class="screen"', 'class="screen no-anim"');
  app.innerHTML = hud + screenHtml;
  if (isNewScreen) window.scrollTo(0, 0);
}

function shouldShowHud() {
  return !['welcome', 'profile'].includes(state.screen);
}

function renderHud() {
  const { current } = levelInfo(state.xp);
  return `
    <div class="top-hud">
      <div class="hud-item">${state.child.avatar} ${escapeHtml(state.child.name)}</div>
      <div class="hud-item">⭐ ${state.xp} XP</div>
      <div class="hud-item">${current.name}</div>
      <div class="hud-item sound-toggle" data-action="toggle-sound">${state.settings.sound ? '🔊' : '🔇'}</div>
    </div>
  `;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

const SCREENS = {
  welcome: () => {
    const hasProfile = !!state.child.name;
    return `
      <div class="screen">
        <div class="emoji-hero">🪙</div>
        <div class="title">Welcome to MyKidsMoney</div>
        <div class="subtitle">Let's learn how money works!</div>
        ${hasProfile
          ? `<button class="btn" data-action="continue-profile">Continue as ${state.child.avatar} ${escapeHtml(state.child.name)}</button>
             <button class="btn secondary" data-action="new-profile">Start Over</button>`
          : `<button class="btn" data-action="start">Start</button>`}
      </div>
    `;
  },

  profile: () => `
    <div class="screen">
      <div class="title">Who are you?</div>
      <div class="card">
        <div class="subtitle" style="margin-bottom:10px;">Pick an avatar</div>
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
          ${[5,6,7,8].map(a => `<div class="age-pill ${a === state.child.age ? 'selected' : ''}" data-action="pick-age" data-value="${a}">${a}</div>`).join('')}
        </div>
      </div>
      <button class="btn" data-action="save-profile">Let's Go!</button>
    </div>
  `,

  journey: () => {
    const { current, next } = levelInfo(state.xp);
    const pct = next ? Math.min(100, Math.round(((state.xp - current.xpRequired) / (next.xpRequired - current.xpRequired)) * 100)) : 100;
    return `
      <div class="screen">
        <div class="emoji-hero">${state.child.avatar}</div>
        <div class="title">Your Financial Journey</div>
        <div class="card">
          <div class="stats-row">
            <div class="stat"><div class="value">${state.child.age}</div><div class="label">Real Age</div></div>
            <div class="stat"><div class="value">${financialAge()}</div><div class="label">Financial Age</div></div>
          </div>
        </div>
        <div class="card">
          <div class="subtitle" style="margin-bottom:8px;">Level ${current.id} — ${current.name}</div>
          <div class="progress-wrap"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <button class="btn" data-action="start-lesson">Start Level 1</button>
      </div>
    `;
  },

  'lesson-money': () => `
    <div class="screen">
      <div class="title">What is Money?</div>
      <div class="card" style="text-align:center;">
        <div class="emoji-hero">🪙💵</div>
        <p class="subtitle">Money is coins and notes. You can use it to buy things, save it, or give it away.</p>
      </div>
      <button class="btn" data-action="goto:jars-intro">Got it!</button>
    </div>
  `,

  'jars-intro': () => {
    const seen = state.session.jarsSeen || [];
    const allSeen = seen.length >= 3;
    return `
      <div class="screen">
        <div class="title">The Three Jars</div>
        <div class="subtitle">Tap each jar to learn what it's for</div>
        <div class="jars-row">
          <div class="jar spend" data-action="see-jar" data-value="spend">
            <div class="jar-icon">💰</div><div class="jar-name">SPEND</div>
          </div>
          <div class="jar save" data-action="see-jar" data-value="save">
            <div class="jar-icon">🏦</div><div class="jar-name">SAVE</div>
          </div>
          <div class="jar give" data-action="see-jar" data-value="give">
            <div class="jar-icon">❤️</div><div class="jar-name">GIVE</div>
          </div>
        </div>
        <div class="card">
          <p class="subtitle">${jarExplainer(state.session.lastJarSeen)}</p>
        </div>
        <button class="btn" data-action="goto:first-money" ${allSeen ? '' : 'disabled'}>Continue</button>
      </div>
    `;
  },

  'first-money': () => {
    const s = state.session;
    const coins = Array.from({ length: s.coinsLeft });
    return `
      <div class="screen">
        <div class="title">Your First Money</div>
        <div class="subtitle">You have $10! Tap a jar to put a coin in it.</div>
        <div class="card">
          <div class="coin-pile">${coins.map(() => `<div class="coin">$1</div>`).join('')}</div>
        </div>
        <div class="jars-row">
          <div class="jar spend" data-action="drop-coin" data-value="spend">
            <div class="jar-icon">💰</div><div class="jar-name">SPEND</div>
            <div class="jar-amount spend">$${s.allocated.spend}</div>
          </div>
          <div class="jar save" data-action="drop-coin" data-value="save">
            <div class="jar-icon">🏦</div><div class="jar-name">SAVE</div>
            <div class="jar-amount save">$${s.allocated.save}</div>
          </div>
          <div class="jar give" data-action="drop-coin" data-value="give">
            <div class="jar-icon">❤️</div><div class="jar-name">GIVE</div>
            <div class="jar-amount give">$${s.allocated.give}</div>
          </div>
        </div>
        <button class="btn" data-action="goto:consequence" ${s.coinsLeft === 0 ? '' : 'disabled'}>See What Happens</button>
      </div>
    `;
  },

  consequence: () => {
    const a = state.session.allocated;
    const lines = [];
    if (a.spend > 0) lines.push({ icon: '🎉', text: `You bought something fun with $${a.spend}!` });
    if (a.save > 0) lines.push({ icon: '🌱', text: `Your Save jar is growing with $${a.save}!` });
    if (a.give > 0) lines.push({ icon: '❤️', text: `You made someone smile with $${a.give}!` });
    return `
      <div class="screen">
        <div class="celebrate">✨</div>
        <div class="title">Nice choices!</div>
        <div class="card">
          ${lines.map(l => `<p class="subtitle" style="margin-bottom:8px;">${l.icon} ${l.text}</p>`).join('')}
        </div>
        <div style="text-align:center;"><span class="xp-badge">⭐ +20 XP</span></div>
        <button class="btn" data-action="goto:needs-wants">Continue</button>
      </div>
    `;
  },

  'needs-wants': () => {
    const i = state.session.nwIndex;
    if (i >= NEEDS_WANTS_ITEMS.length) {
      return `
        <div class="screen">
          <div class="emoji-hero">✅</div>
          <div class="title">Great job!</div>
          <p class="subtitle" style="text-align:center;">You got ${state.session.nwCorrect} out of ${NEEDS_WANTS_ITEMS.length} right.</p>
          <button class="btn" data-action="goto:goal">Continue</button>
        </div>
      `;
    }
    const item = NEEDS_WANTS_ITEMS[i];
    const ans = state.session.nwAnswered;
    if (ans) {
      const label = ans.answer === 'need' ? 'a Need' : 'a Want';
      return `
        <div class="screen">
          <div class="title">Need or Want?</div>
          <div class="card" style="text-align:center;">
            <div class="celebrate" style="font-size:48px;">${ans.correct ? '✅' : '💡'}</div>
            <p class="subtitle" style="margin-top:8px;">${item.name} is ${label}!</p>
          </div>
          <button class="btn" data-action="next-nw">Next</button>
        </div>
      `;
    }
    return `
      <div class="screen">
        <div class="title">Need or Want?</div>
        <div class="card" style="text-align:center;">
          <div class="emoji-hero">${item.icon}</div>
          <p class="subtitle">${item.name}</p>
        </div>
        <div class="btn-row">
          <button class="btn secondary" data-action="answer-nw" data-value="need">Need</button>
          <button class="btn secondary" data-action="answer-nw" data-value="want">Want</button>
        </div>
      </div>
    `;
  },

  goal: () => {
    const g = state.goal;
    if (g) {
      const goalDef = GOALS.find(x => x.id === g.id);
      const pct = Math.min(100, Math.round((g.current / goalDef.target) * 100));
      return `
        <div class="screen">
          <div class="title">Save for a Goal</div>
          <div class="card" style="text-align:center;">
            <div class="emoji-hero">${goalDef.icon}</div>
            <p class="subtitle">Saving for a ${goalDef.name}</p>
            <div class="progress-wrap" style="margin-top:12px;"><div class="progress-fill" style="width:${pct}%"></div></div>
            <p class="subtitle" style="margin-top:8px;">$${g.current} of $${goalDef.target}</p>
          </div>
          <button class="btn" data-action="goto:challenge">Continue</button>
        </div>
      `;
    }
    return `
      <div class="screen">
        <div class="title">Save for a Goal</div>
        <div class="subtitle">What do you want to save for?</div>
        <div class="grid">
          ${GOALS.map(g => `<div class="choice-tile" data-action="pick-goal" data-value="${g.id}">${g.icon}<div class="label">${g.name}</div></div>`).join('')}
        </div>
      </div>
    `;
  },

  challenge: () => {
    if (state.session.challengeAnswered) {
      return `
        <div class="screen">
          <div class="celebrate">${state.session.challengeCorrect ? '🎉' : '💡'}</div>
          <div class="title">${state.session.challengeCorrect ? 'Great value!' : 'Good try!'}</div>
          <p class="subtitle" style="text-align:center;">4 small bags for $5 each gives you more snacks for your $20!</p>
          <div style="text-align:center;"><span class="xp-badge">⭐ +15 XP</span></div>
          <button class="btn" data-action="goto:complete">Continue</button>
        </div>
      `;
    }
    return `
      <div class="screen">
        <div class="title">Money Challenge</div>
        <div class="card" style="text-align:center;">
          <div class="emoji-hero">🍿</div>
          <p class="subtitle">${CHALLENGE.prompt}</p>
        </div>
        ${CHALLENGE.options.map(o => `<button class="btn secondary" data-action="answer-challenge" data-value="${o.id}">${o.label}</button>`).join('')}
      </div>
    `;
  },

  complete: () => {
    const { current } = levelInfo(state.xp);
    const newAch = state.session.newAchievements.map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean);
    return `
      <div class="screen">
        ${confettiHtml()}
        <div class="celebrate">🏆</div>
        <div class="title">Level Complete!</div>
        <div class="card" style="text-align:center;">
          <span class="xp-badge pop">⭐ +${state.session.xpGainedThisLesson} XP earned</span>
          <p class="subtitle" style="margin-top:12px;">Financial Age: ${financialAge()} · ${current.name}</p>
        </div>
        ${newAch.map((a, i) => `
          <div class="achievement-card" style="animation-delay:${0.15 + i * 0.12}s">
            <div class="icon">${a.icon}</div>
            <div><div class="title" style="font-size:16px;">${a.title}</div><div class="desc">${a.desc}</div></div>
          </div>
        `).join('')}
        <div class="card" style="text-align:center;">
          <div class="emoji-hero">🔒</div>
          <p class="subtitle">Lesson 2 is coming soon!</p>
        </div>
        <button class="btn" data-action="goto:journey">Back to Journey</button>
      </div>
    `;
  },
};

function confettiHtml() {
  const colors = ['#ffb703', '#ff6b6b', '#2ec4b6', '#ff7fb0', '#7b6cf6'];
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

function jarExplainer(jar) {
  if (jar === 'spend') return '💰 SPEND is money for things you want right now.';
  if (jar === 'save') return '🏦 SAVE is money for things you want later.';
  if (jar === 'give') return '❤️ GIVE is money to help other people.';
  return 'Tap a jar above to find out what it does!';
}

// ---------- Actions ----------

app.addEventListener('input', (e) => {
  if (e.target.id === 'name-input') {
    state.child.name = e.target.value;
  }
});

app.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.getAttribute('data-action');
  const value = target.getAttribute('data-value');
  handleAction(action, value);
});

function handleAction(action, value) {
  switch (action) {
    case 'toggle-sound':
      state.settings.sound = !state.settings.sound;
      save();
      render();
      break;
    case 'start':
      goTo('profile');
      break;
    case 'continue-profile':
      goTo('journey');
      break;
    case 'new-profile': {
      const keepAge = state.child.age;
      state = freshState();
      state.child.age = keepAge;
      goTo('profile');
      break;
    }
    case 'pick-avatar':
      state.child.avatar = value;
      render();
      break;
    case 'pick-age':
      state.child.age = Number(value);
      render();
      break;
    case 'save-profile': {
      const name = state.child.name.trim() || 'Explorer';
      state.child.name = name.slice(0, 16);
      goTo('journey');
      break;
    }
    case 'start-lesson':
      state.session = { coinsLeft: 10, allocated: { spend: 0, save: 0, give: 0 }, nwIndex: 0, nwCorrect: 0, newAchievements: [], xpGainedThisLesson: 0, jarsSeen: [] };
      goTo('lesson-money');
      break;
    case 'see-jar': {
      const seen = state.session.jarsSeen || (state.session.jarsSeen = []);
      if (!seen.includes(value)) seen.push(value);
      state.session.lastJarSeen = value;
      render();
      break;
    }
    case 'drop-coin': {
      const s = state.session;
      if (s.coinsLeft <= 0) return;
      s.allocated[value] += 1;
      s.coinsLeft -= 1;
      Sound.pop();
      render();
      pulseJar(value);
      break;
    }
    case 'answer-nw': {
      const item = NEEDS_WANTS_ITEMS[state.session.nwIndex];
      const isCorrect = item.answer === value;
      if (isCorrect) {
        state.session.nwCorrect += 1;
        grantXP(5);
        Sound.correct();
      } else {
        Sound.gentle();
      }
      state.session.nwAnswered = { chosen: value, correct: isCorrect, answer: item.answer };
      if (state.session.nwCorrect >= 2) grantAchievement('smart-shopper');
      render();
      break;
    }
    case 'next-nw':
      state.session.nwIndex += 1;
      state.session.nwAnswered = null;
      render();
      break;
    case 'pick-goal':
      state.goal = { id: value, current: state.session.allocated.save };
      grantAchievement('first-goal');
      render();
      break;
    case 'answer-challenge': {
      const opt = CHALLENGE.options.find(o => o.id === value);
      state.session.challengeAnswered = true;
      state.session.challengeCorrect = !!opt.best;
      grantXP(15);
      if (opt.best) grantAchievement('smart-shopper');
      opt.best ? Sound.correct() : Sound.gentle();
      render();
      break;
    }
    case 'goto:jars-intro':
      goTo('jars-intro');
      break;
    case 'goto:first-money':
      goTo('first-money');
      break;
    case 'goto:consequence': {
      const a = state.session.allocated;
      grantXP(20);
      if (a.save > 0) grantAchievement('first-save');
      if (a.give > 0) grantAchievement('first-give');
      state.jars.spend += a.spend;
      state.jars.save += a.save;
      state.jars.give += a.give;
      goTo('consequence');
      Sound.correct();
      break;
    }
    case 'goto:needs-wants':
      goTo('needs-wants');
      break;
    case 'goto:goal':
      goTo('goal');
      break;
    case 'goto:challenge':
      goTo('challenge');
      break;
    case 'goto:complete':
      grantAchievement('explorer');
      goTo('complete');
      Sound.fanfare();
      break;
    case 'goto:journey':
      goTo('journey');
      break;
  }
}

render();
