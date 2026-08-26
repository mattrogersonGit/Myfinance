// MyKidsMoney — content data (World 1: Money Explorer, ages 5-8)
// Kept separate from app.js so lessons/achievements/goals can grow without touching engine code.

const AVATARS = ['🦊','🐼','🦁','🐸','🐧','🦄','🐯','🐨','🐵','🐶'];

const LEVELS = [
  { id: 1, name: 'Money Rookie', xpRequired: 0 },
  { id: 2, name: 'Money Explorer', xpRequired: 80 },
  { id: 3, name: 'Money Saver', xpRequired: 200 },
  { id: 4, name: 'Money Manager', xpRequired: 400 },
  { id: 5, name: 'Money Master', xpRequired: 700 },
];

const GOALS = [
  { id: 'game', name: 'Game', icon: '🎮', target: 20 },
  { id: 'toy', name: 'Toy', icon: '🧸', target: 15 },
  { id: 'football', name: 'Football', icon: '⚽', target: 12 },
  { id: 'bike', name: 'Bike', icon: '🚲', target: 40 },
];

const ACHIEVEMENTS = [
  { id: 'first-save', title: 'First Save', icon: '🏆', desc: 'You saved money for the first time!' },
  { id: 'first-give', title: 'Giving Hero', icon: '❤️', desc: 'You gave money to help someone.' },
  { id: 'smart-shopper', title: 'Smart Shopper', icon: '🛍️', desc: 'You made a smart choice with your money.' },
  { id: 'first-goal', title: 'First Goal', icon: '🎯', desc: 'You started saving for a goal.' },
  { id: 'explorer', title: 'Money Explorer', icon: '🧭', desc: 'You finished your first Money Explorer lesson.' },
];

// Needs vs Wants mini-round content
const NEEDS_WANTS_ITEMS = [
  { name: 'A warm coat', icon: '🧥', answer: 'need' },
  { name: 'A new video game', icon: '🎮', answer: 'want' },
  { name: 'Lunch', icon: '🍱', answer: 'need' },
  { name: 'Candy', icon: '🍬', answer: 'want' },
];

// Money Challenge scenario (Screen 10)
const CHALLENGE = {
  prompt: 'You have $20 to buy snacks. Which is the best value?',
  options: [
    { id: 'a', label: '1 big bag for $20', value: 1, best: false },
    { id: 'b', label: '4 small bags for $5 each', value: 4, best: true },
  ],
};
