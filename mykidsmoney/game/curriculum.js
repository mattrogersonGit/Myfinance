// MyKidsMoney — Coinbrook content. Pure data: onboarding, jobs, market
// scenes, events, giving moments, and the Boss Challenge. Engine/renderers
// read this; nothing here knows how to draw a screen.

// ---------- Onboarding (once, before Week 1) ----------

const ONBOARDING = [
  {
    id: 'miro-intro', type: 'reveal', skills: [], xpTier: null,
    content: { cards: [
      { emoji: '🦊', text: "Hi there! I'm Miro." },
      { emoji: '🌳', text: "Welcome to Sprout Valley — I'll be your guide, but this is your story." },
      { emoji: '🏘️', text: "This little town is Coinbrook. Let's get you settled in." },
    ] },
  },
  {
    id: 'money-or-not', type: 'sort', title: 'Money or Not?', skills: [{ skill: 'MONEY_SENSE', tier: 'foundation' }], xpTier: 'small',
    content: {
      zoneLabels: { yes: 'Money', no: 'Not Money' },
      items: [
        { id: 'coin', icon: '🪙', name: 'A coin', answer: 'yes' },
        { id: 'note', icon: '💵', name: 'A note', answer: 'yes' },
        { id: 'tap', icon: '📱', name: 'Tap to pay', answer: 'yes' },
        { id: 'rock', icon: '🪨', name: 'A rock', answer: 'no' },
        { id: 'leaf', icon: '🍃', name: 'A leaf', answer: 'no' },
        { id: 'teddy', icon: '🧸', name: 'A teddy bear', answer: 'no' },
        { id: 'sticker', icon: '⭐', name: 'A sticker', answer: 'no' },
        { id: 'shell', icon: '🐚', name: 'A seashell', answer: 'no' },
      ],
    },
  },
  {
    id: 'meet-jars', type: 'jar-explore', title: 'Meet the Jars', skills: [{ skill: 'JAR_LITERACY', tier: 'low' }], xpTier: 'small',
    content: {
      jars: [
        { id: 'spend', icon: '💰', name: 'SPEND', explain: 'SPEND is for things you want at the Market.' },
        { id: 'save', icon: '🏦', name: 'SAVE', explain: 'SAVE grows toward your goal.' },
        { id: 'give', icon: '❤️', name: 'GIVE', explain: 'GIVE helps someone else, every couple of weeks.' },
      ],
    },
  },
  {
    id: 'onboarding-done', type: 'reveal', skills: [], xpTier: 'small',
    content: { cards: [
      { emoji: '🏠', text: 'This is your home. Money arrives here — it\'s up to you what happens next.' },
      { emoji: '📅', text: 'Every week, keep an eye on your calendar. Ready?' },
    ] },
  },
];

// ---------- Job Board ----------
// Three interaction mechanics across five jobs: clear-grid (new), sort
// (reused from the old Needs vs Wants board), chore (reused tap-counter).

const JOBS = [
  { id: 'wash-car', type: 'clear-grid', name: 'Wash a Car', icon: '🚗', pay: 3, content: { tileIcon: '💧', tileCount: 6 } },
  { id: 'rake-leaves', type: 'clear-grid', name: 'Rake Leaves', icon: '🍂', pay: 3, content: { tileIcon: '🍂', tileCount: 6 } },
  {
    id: 'tidy-room', type: 'sort', name: 'Tidy a Room', icon: '🧸', pay: 4,
    content: {
      zoneLabels: { yes: 'Toy Box', no: 'Bookshelf' },
      items: [
        { id: 'bear', icon: '🧸', name: 'Teddy bear', answer: 'yes' },
        { id: 'car', icon: '🚙', name: 'Toy car', answer: 'yes' },
        { id: 'book1', icon: '📗', name: 'Storybook', answer: 'no' },
        { id: 'book2', icon: '📘', name: 'Picture book', answer: 'no' },
        { id: 'blocks', icon: '🧱', name: 'Blocks', answer: 'yes' },
        { id: 'atlas', icon: '📙', name: 'Atlas', answer: 'no' },
      ],
    },
  },
  { id: 'walk-dog', type: 'chore', name: 'Walk a Dog', icon: '🐕', pay: 3, content: { taps: 4 } },
  { id: 'garden', type: 'chore', name: 'Help in the Garden', icon: '🌻', pay: 3, content: { taps: 4 } },
];

// ---------- Market scenes ----------
// One drawn at random per week. Contextual, not a raw price-per-unit quiz —
// every scene has a reason and a budget, and "skip it" is often a valid pick.

const MARKET_SCENES = [
  {
    id: 'fruit', icon: '🍎', reason: "You're shopping for fruit for the family.", budget: 6,
    options: [
      { id: 'apples', label: 'A big bag of apples — $6', cost: 6, best: true, feedback: 'Great pick — a full bag goes a long way for the whole family.' },
      { id: 'pears', label: 'A few fancy pears — $6', cost: 6, feedback: 'Lovely pears, but there are only a few — not much for everyone to share.' },
      { id: 'skip', label: "Skip it — you'll shop next week", cost: 0, feedback: "Fair enough — sometimes waiting is the right call, and your money stays in your Spend jar." },
    ],
  },
  {
    id: 'supplies', icon: '✏️', reason: 'You need something for school tomorrow.', budget: 5,
    options: [
      { id: 'pack', label: 'A pack of pencils — $5', cost: 5, best: true, feedback: "Smart — you'll have spares for weeks, not just tomorrow." },
      { id: 'fancy', label: 'One fancy glitter pen — $5', cost: 5, feedback: "It's fun, but if it runs out you're back to square one." },
      { id: 'skip', label: 'Borrow one from a friend instead', cost: 0, feedback: 'No cost at all — and you kept your money for something else.' },
    ],
  },
  {
    id: 'gift', icon: '🎁', reason: "It's your friend's birthday this week.", budget: 5,
    options: [
      { id: 'gift', label: 'A small gift — $4', cost: 4, best: true, feedback: "They'll love it, and you've still got $1 left over." },
      { id: 'card', label: 'A handmade card — $0', cost: 0, feedback: 'Free and thoughtful — sometimes a gift is a plan, not a price.' },
      { id: 'splurge', label: 'A big gift — $5 (everything)', cost: 5, feedback: 'Very generous! Just nothing left over this week.' },
    ],
  },
  {
    id: 'umbrella', icon: '☔', reason: "It's about to rain and you don't have an umbrella.", budget: 6,
    options: [
      { id: 'sturdy', label: 'A sturdy umbrella — $6', cost: 6, best: true, feedback: "This one will last through plenty of rainy days ahead." },
      { id: 'cheap', label: 'A cheap $2 umbrella', cost: 2, feedback: "It's cheaper, but it might not survive the first big gust." },
      { id: 'skip', label: 'Just wait it out under cover', cost: 0, feedback: 'No spend at all — sometimes that works out fine too.' },
    ],
  },
];

// ---------- Events ----------
// Small scripted life moments. Which day slots hold an event is fixed by
// CONFIG.weekPattern; which specific event fills that slot is random.

const EVENTS = [
  {
    id: 'birthday', icon: '🎂', prompt: "It's your friend's birthday! Do you want to get them something?",
    options: [
      { id: 'gift', label: 'Get a $2 gift', cost: 2, feedback: 'A little something goes a long way — happy birthday to them!' },
      { id: 'card', label: 'Make a card instead (free)', cost: 0, feedback: 'Handmade and free — just as thoughtful.' },
    ],
  },
  {
    id: 'found-coin', icon: '🪙', prompt: 'You found a coin on the footpath! What luck.',
    options: [
      { id: 'keep', label: 'Keep it', gain: 1, feedback: 'Lucky find — $1 straight into your wallet.' },
      { id: 'giveback', label: 'Look for the owner', gain: 0, feedback: "Kind thought — you didn't find them, but it felt right to try." },
    ],
  },
  {
    id: 'piggybank', icon: '🐷', prompt: 'Oops — your piggy bank tipped over and a coin rolled away!',
    options: [
      { id: 'shrug', label: 'Oh well, look for it later', cost: 0, feedback: 'These things happen — no harm done.' },
      { id: 'search', label: 'Stop and search for it now', cost: 0, feedback: 'You found it! Crisis averted.' },
    ],
  },
  {
    id: 'rain', icon: '🌧️', prompt: "It's raining and you don't have an umbrella!",
    options: [
      { id: 'buy', label: 'Buy one for $3', cost: 3, feedback: 'Dry and happy — worth every dollar today.' },
      { id: 'wait', label: 'Wait it out under a shop roof', cost: 0, feedback: 'A bit damp, but you saved your $3.' },
    ],
  },
];

// ---------- Giving Moments ----------

const GIVING_OPTIONS = [
  { id: 'neighbor', icon: '👵', label: 'Help a neighbor' },
  { id: 'shelter', icon: '🐾', label: 'Animal shelter drive' },
  { id: 'foodbank', icon: '🥫', label: 'Local food bank' },
];

// ---------- Boss Challenge — "The Big Day" ----------
// Unchanged from the Stage-based build. Beats 3 and 4 pick a random variant
// each attempt so a replay isn't memorisable.

const BOSS = {
  id: 'boss', name: 'The Big Day',
  brokenThingVariants: [
    { prompt: 'Oh no — your shoe fell apart!', fix: '👟 Get new shoes', alt: '🧸 Buy a toy instead', best: 'fix' },
    { prompt: 'Oh no — your school bag ripped!', fix: '🎒 Get a new bag', alt: '🎮 Buy a game instead', best: 'fix' },
  ],
  shoppingVariants: [
    {
      emoji: '🧃', prompt: 'Snack time! Which is better value?',
      options: [{ id: 'a', label: '1 big juice — $6' }, { id: 'b', label: '3 small juices — $2 each', best: true }],
      feedback: { a: 'One big juice for $6 — the 3 small ones would have gone further.', b: 'Three juices for the same $6 — nice spotting!' },
    },
    {
      emoji: '🍉', prompt: 'Fruit time! Which is better value?',
      options: [{ id: 'a', label: '1 large melon — $10' }, { id: 'b', label: '4 small fruits — $2 each', best: true }],
      feedback: { a: 'The melon was fun, but $10 for one thing is a lot.', b: '4 fruits for $8 total — good value!' },
    },
  ],
};
