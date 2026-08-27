// MyKidsMoney — Money Museum exhibits. Every achievement is modelled the same
// way so the Museum can grow without a data migration later.
// Shape: { id, icon, title, desc, earned: bool, earnedDate: string|null }

const ACHIEVEMENT_DEFS = [
  { id: 'first-jar', icon: '🏺', title: 'First Jars', desc: 'You gave money to Spend, Save and Give for the first time.' },
  { id: 'first-earn', icon: '⚒️', title: 'First Earnings', desc: 'You earned money by doing chores.' },
  { id: 'first-goal-set', icon: '🎯', title: 'A Goal in Sight', desc: 'You picked something to save up for.' },
  { id: 'goal-reached', icon: '🎁', title: 'Goal Reached!', desc: 'You saved enough to reach your goal.' },
  { id: 'value-spotter', icon: '🔎', title: 'Value Spotter', desc: 'You spotted the better deal, even when it looked smaller.' },
  { id: 'needs-wants-sorter', icon: '🗂️', title: 'Sharp Sorter', desc: 'You sorted a whole board of needs and wants.' },
  { id: 'coinbrook-explorer', icon: '🧭', title: 'Coinbrook Explorer', desc: 'You visited every stage in Coinbrook.' },
  { id: 'big-day-complete', icon: '🌅', title: 'The Big Day', desc: 'You made it through a whole day of money decisions.' },
  { id: 'money-explorer-trophy', icon: '🏆', title: 'Money Explorer', desc: 'You mastered the basics of Coinbrook and unlocked the next world.' },
];
