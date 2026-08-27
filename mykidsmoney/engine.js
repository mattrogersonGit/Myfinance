// MyKidsMoney — progression engine. Pure state/logic: no DOM, no rendering.
// Renderers and app.js call into this; this file never reaches into them.

const SAVE_KEY = 'mkm_state_v3';
const SKILL_IDS = ['MONEY_SENSE', 'JAR_LITERACY', 'NEEDS_WANTS', 'PATIENCE', 'TRADE_OFFS', 'GOALS', 'VALUE', 'EARNING'];

function freshState() {
  const mastery = {};
  SKILL_IDS.forEach(s => { mastery[s] = 0; });
  const achievements = {};
  ACHIEVEMENT_DEFS.forEach(a => { achievements[a.id] = { earned: false, earnedDate: null }; });
  return {
    child: { name: '', avatar: AVATARS[0], age: 6 },
    settings: { sound: true },
    xp: 0,
    mastery,
    cash: 0,                          // undecided wallet money
    jars: { spend: 0, save: 0, give: 0 }, // persistent, purposeful
    goal: null,                        // goal id, or null between goals
    achievements,
    avatarCosmetic: null,
    coinbrook: {
      onboarded: false,
      weekNumber: 0,
      weeksCompleted: 0,
      dayIndex: 0,
      days: [],
      jobsDoneThisWeek: [],
      marketScene: null,
      givingMomentDoneThisWeek: false,
      bossUnlocked: false,
    },
    screen: 'welcome',
  };
}

let state = load() || freshState();
if (!state.settings) state.settings = { sound: true };
if (!state.mastery) { state.mastery = {}; SKILL_IDS.forEach(s => { state.mastery[s] = 0; }); }
if (state.cash === undefined) state.cash = 0;
if (!state.jars) state.jars = { spend: 0, save: 0, give: 0 };
if (!state.coinbrook) state.coinbrook = freshState().coinbrook;
if (!state.achievements) { state.achievements = {}; ACHIEVEMENT_DEFS.forEach(a => { state.achievements[a.id] = { earned: false, earnedDate: null }; }); }

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
}

// ---------- Rank (XP) ----------

function rankInfo(xp) {
  let current = CONFIG.ranks[0];
  let next = CONFIG.ranks[1];
  for (let i = 0; i < CONFIG.ranks.length; i++) {
    if (xp >= CONFIG.ranks[i].xpRequired) current = CONFIG.ranks[i];
    next = CONFIG.ranks[i + 1] || null;
  }
  return { current, next };
}

function addXP(amount) {
  state.xp += amount;
}

// activityId is used only to track first-time-vs-repeat for the XP trickle;
// it's fine for it to be reused across weeks (e.g. a job id) — the trickle is
// a soft anti-farming nudge, not a hard one-time gate (that's Mastery's job).
const XP_SEEN = {};
function activityXP(activityId, xpTier) {
  if (!xpTier) return;
  const seen = XP_SEEN[activityId] || 0;
  const base = CONFIG.xp[xpTier] || 0;
  const amount = seen === 0 ? base : Math.max(1, Math.round(base * CONFIG.xp.repeatFactor));
  addXP(amount);
  XP_SEEN[activityId] = seen + 1;
  return amount;
}

// ---------- Mastery ----------

function bandForScore(score) {
  const bands = CONFIG.mastery.bands;
  let band = bands[0];
  for (const b of bands) { if (score >= b.min) band = b; }
  return band;
}

function bandIndex(label) {
  return CONFIG.mastery.bands.findIndex(b => b.label === label);
}

function masteryBand(skill) {
  return bandForScore(state.mastery[skill] || 0).label;
}

function addMastery(skill, tier) {
  if (!tier || !(skill in state.mastery)) return;
  const points = CONFIG.mastery.evidence[tier] || 0;
  state.mastery[skill] = Math.min(CONFIG.mastery.max, state.mastery[skill] + points);
}

function grantEvidence(skillsList) {
  (skillsList || []).forEach(s => addMastery(s.skill, s.tier));
}

// ---------- Achievements ----------

function grantAchievement(id) {
  const a = state.achievements[id];
  if (!a || a.earned) return false;
  a.earned = true;
  a.earnedDate = new Date().toISOString().slice(0, 10);
  return true;
}

// ---------- Goal ----------

function goalDef() {
  return state.goal ? CONFIG.goals.find(g => g.id === state.goal) : null;
}

function goalProgressPct() {
  const g = goalDef();
  if (!g) return 0;
  return Math.min(100, Math.round((state.jars.save / g.target) * 100));
}

// Returns true exactly once, the moment Save crosses the goal's target —
// deducts the target (the goal was "bought" with savings) and clears the
// goal so a new one can be picked. Save keeps whatever's left over.
function checkGoalComplete() {
  const g = goalDef();
  if (!g) return false;
  if (state.jars.save >= g.target) {
    state.jars.save -= g.target;
    state.goal = null;
    return true;
  }
  return false;
}

// ---------- World 1 unlock check ----------

function worldUnlockCheck() {
  const floorIdx = bandIndex(CONFIG.world1.unlockFloorBand);
  const avgIdx = bandIndex(CONFIG.world1.unlockAverageBand);
  const scores = SKILL_IDS.map(s => state.mastery[s]);
  const allAtFloor = SKILL_IDS.every(s => bandIndex(masteryBand(s)) >= floorIdx);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const avgAtTarget = bandIndex(bandForScore(avgScore).label) >= avgIdx;
  return allAtFloor && avgAtTarget;
}

function bigDayReady() {
  return state.coinbrook.weeksCompleted >= CONFIG.world1.weeksBeforeBigDay;
}

// ---------- Weekly calendar ----------

function currentDay() {
  return state.coinbrook.days[state.coinbrook.dayIndex];
}

function startNewWeek() {
  const c = state.coinbrook;
  c.weekNumber += 1;
  c.jobsDoneThisWeek = [];
  c.marketScene = MARKET_SCENES[Math.floor(Math.random() * MARKET_SCENES.length)].id;
  c.givingMomentDoneThisWeek = false;
  const days = [{ type: 'payday', done: true }];
  CONFIG.weekPattern.forEach(type => {
    if (type === 'event') {
      days.push({ type: 'event', done: false, eventId: EVENTS[Math.floor(Math.random() * EVENTS.length)].id });
    } else {
      days.push({ type: 'choice', done: false });
    }
  });
  days.push({ type: 'review', done: false });
  c.days = days;
  c.dayIndex = 1;
  state.cash += CONFIG.pocketMoney;
}

function completeCurrentDay() {
  currentDay().done = true;
  if (state.coinbrook.dayIndex < state.coinbrook.days.length - 1) state.coinbrook.dayIndex += 1;
}

function givingMomentReady() {
  return state.jars.give > 0
    && state.coinbrook.weekNumber % CONFIG.givingMomentEveryWeeks === 0
    && !state.coinbrook.givingMomentDoneThisWeek;
}
