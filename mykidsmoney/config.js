// MyKidsMoney — tunable config. Every number that affects difficulty, reward,
// or progression pacing lives here, not in the renderer or curriculum files.

const CONFIG = {
  xp: {
    small: 5,
    moderate: 12,
    high: 18,
    checkpoint: 10,
    goalComplete: 40,
    bossComplete: 90,
    repeatFactor: 0.2, // replaying an already-completed activity pays this fraction of its first-time XP
  },

  mastery: {
    max: 100,
    bands: [
      { min: 0, label: 'Just Started' },
      { min: 25, label: 'Getting It' },
      { min: 60, label: 'Confident' },
      { min: 85, label: 'Mastered' },
    ],
    // "foundation" is for skills touched by only one activity in all of World 1
    // (right now, just MONEY_SENSE) — it has to clear the unlock floor alone.
    evidence: { foundation: 26, low: 8, medium: 18, high: 24, checkpoint: 20, boss: 36 },
  },

  world1: {
    // World 2 unlocks when every skill is at least at the "floor" band AND the
    // average of all skills is at least the "confident" band.
    unlockFloorBand: 'Getting It',
    unlockAverageBand: 'Confident',
  },

  ranks: [
    { id: 1, name: 'Money Rookie', xpRequired: 0 },
    { id: 2, name: 'Money Explorer', xpRequired: 120 },
    { id: 3, name: 'Money Saver', xpRequired: 280 },
    { id: 4, name: 'Money Manager', xpRequired: 500 },
    { id: 5, name: 'Money Master', xpRequired: 800 },
  ],

  goals: [
    { id: 'football', name: 'Football', icon: '⚽', target: 8 },
    { id: 'toy', name: 'Toy', icon: '🧸', target: 10 },
    { id: 'game', name: 'Game', icon: '🎮', target: 14 },
    { id: 'bike', name: 'Bike', icon: '🚲', target: 20 },
  ],

  // Plain-language sentences a parent could eventually read. Keyed by skill id,
  // shown to the child only inside the Boss Challenge recap (never as a number).
  skillDescriptors: {
    MONEY_SENSE: 'can tell money apart from things that aren’t money',
    JAR_LITERACY: 'can explain Spend, Save and Give',
    NEEDS_WANTS: 'can tell a need from a want',
    PATIENCE: 'can choose to wait and save instead of spending right away',
    TRADE_OFFS: 'can weigh one choice against another',
    GOALS: 'can save money toward a goal',
    VALUE: 'can spot the better deal',
    EARNING: 'understand that money can be earned through effort',
  },
};
