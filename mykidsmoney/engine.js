// MyKidsMoney — progression engine. Pure state/logic: no DOM, no rendering.
// Renderers and app.js call into this; this file never reaches into them.

const SAVE_KEY = 'mkm_state_v2';
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
    wallet: { spend: 0, save: 0, give: 0 },
    mastery,
    goal: null,
    goalCelebrated: false,
    achievements,
    avatarCosmetic: null,
    map: { position: 'w1' },
    coinbrook: { completedStages: [], activityCompletions: {}, bossAttempts: 0, bossUnlocked: false },
    screen: 'welcome',
  };
}

let state = load() || freshState();
if (!state.settings) state.settings = { sound: true };
if (!state.wallet) state.wallet = { spend: 0, save: 0, give: 0 };
if (!state.mastery) { state.mastery = {}; SKILL_IDS.forEach(s => { state.mastery[s] = 0; }); }
if (!state.coinbrook) state.coinbrook = { completedStages: [], activityCompletions: {}, bossAttempts: 0, bossUnlocked: false };
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

function activityXP(activityId, xpTier) {
  if (!xpTier) return;
  const count = state.coinbrook.activityCompletions[activityId] || 0;
  const base = CONFIG.xp[xpTier] || 0;
  const amount = count === 0 ? base : Math.max(1, Math.round(base * CONFIG.xp.repeatFactor));
  addXP(amount);
  state.coinbrook.activityCompletions[activityId] = count + 1;
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

// ---------- Goals ----------

function goalDef() {
  return state.goal ? CONFIG.goals.find(g => g.id === state.goal) : null;
}

function goalProgressPct() {
  const g = goalDef();
  if (!g) return 0;
  return Math.min(100, Math.round((state.wallet.save / g.target) * 100));
}

function checkGoalComplete() {
  const g = goalDef();
  if (!g || state.goalCelebrated) return false;
  if (state.wallet.save >= g.target) { state.goalCelebrated = true; return true; }
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

function coinbrookComplete() {
  return WORLD1.stages.every(s => state.coinbrook.completedStages.includes(s.id));
}
