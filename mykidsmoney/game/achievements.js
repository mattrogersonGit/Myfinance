// MyKidsMoney — Money Museum exhibits. Every achievement is modelled the same
// way so the Museum can grow without a data migration later.
// Shape: { id, icon, title, desc, earned: bool, earnedDate: string|null }

const ACHIEVEMENT_DEFS = [
  { id: 'first-jar', icon: '🏺', title: 'First Jars', desc: 'You decided what to do with your first Wallet money.' },
  { id: 'first-earn', icon: '⚒️', title: 'First Earnings', desc: 'You earned money doing a job.' },
  { id: 'first-goal-set', icon: '🎯', title: 'A Goal in Sight', desc: 'You picked something to save up for.' },
  { id: 'goal-reached', icon: '🎁', title: 'Goal Reached!', desc: 'You saved enough to reach a goal.' },
  { id: 'value-spotter', icon: '🔎', title: 'Value Spotter', desc: 'You spotted the better deal.' },
  { id: 'first-week', icon: '📅', title: 'First Week Done', desc: 'You lived through your first game week in Coinbrook.' },
  { id: 'giving-moment-done', icon: '❤️', title: 'Giving Hero', desc: 'You gave your Give jar money to something that mattered.' },
  { id: 'big-day-complete', icon: '🌅', title: 'The Big Day', desc: 'You made it through a whole day of money decisions.' },
  { id: 'money-explorer-trophy', icon: '🏆', title: 'Money Explorer', desc: 'You mastered the basics of Coinbrook and unlocked the next world.' },
];
