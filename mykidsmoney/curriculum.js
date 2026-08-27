// MyKidsMoney — World 1 (Coinbrook) curriculum. Pure data: stages, activities,
// and the Boss Challenge. The engine/renderers read this; nothing here knows
// how to draw a screen.
//
// Activity shape: { id, type, title, skills:[{skill, tier}], xpTier, content }
// `tier` maps to CONFIG.mastery.evidence. `xpTier` maps to CONFIG.xp.

const WORLD1 = {
  id: 'w1',
  name: 'Coinbrook',
  stages: [
    {
      id: 's1', name: 'What Is Money?', icon: '🪙',
      activities: [
        {
          id: 'money-or-not', type: 'sort', title: 'Money or Not?',
          skills: [{ skill: 'MONEY_SENSE', tier: 'foundation' }], xpTier: 'small',
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
          id: 'three-things', type: 'reveal', title: 'Three Things Money Can Do',
          skills: [], xpTier: 'small',
          content: {
            cards: [
              { emoji: '🪙💵', text: 'Money is coins, notes — even numbers on a screen.' },
              { emoji: '🎉', text: 'You can SPEND it on something fun right now.' },
              { emoji: '🌱', text: 'You can SAVE it for something later.' },
              { emoji: '❤️', text: 'You can GIVE it to help someone else.' },
            ],
          },
        },
      ],
    },
    {
      id: 's2', name: 'Spend, Save & Give', icon: '🏺',
      activities: [
        {
          id: 'meet-jars', type: 'jar-explore', title: 'Meet the Jars',
          skills: [{ skill: 'JAR_LITERACY', tier: 'low' }], xpTier: 'small',
          content: {
            jars: [
              { id: 'spend', icon: '💰', name: 'SPEND', explain: 'SPEND is for things you want right now — like a comic today!' },
              { id: 'save', icon: '🏦', name: 'SAVE', explain: 'SAVE is for things you want later — it grows while you wait.' },
              { id: 'give', icon: '❤️', name: 'GIVE', explain: 'GIVE is money that helps someone else.' },
            ],
          },
        },
        {
          id: 'first-ten', type: 'allocate', title: 'Your First $10',
          skills: [{ skill: 'JAR_LITERACY', tier: 'medium' }, { skill: 'PATIENCE', tier: 'low' }], xpTier: 'moderate',
          content: { amount: 10, prompt: "You've got $10! Tap a jar to add a dollar." },
        },
        {
          id: 'what-happened', type: 'consequence', title: 'Nice choices!',
          skills: [], xpTier: null, content: {},
        },
        {
          id: 'jar-checkpoint', type: 'choose', title: 'Quick Question',
          skills: [{ skill: 'JAR_LITERACY', tier: 'checkpoint' }], xpTier: 'checkpoint',
          content: {
            emoji: '🚲', prompt: 'You want a bike next year. Which jar helps most?',
            options: [
              { id: 'spend', label: '💰 Spend' },
              { id: 'save', label: '🏦 Save', best: true },
              { id: 'give', label: '❤️ Give' },
            ],
          },
        },
      ],
    },
    {
      id: 's3', name: 'Needs vs Wants', icon: '🧭',
      activities: [
        {
          id: 'sort-it-out', type: 'sort', title: 'Sort It Out',
          skills: [{ skill: 'NEEDS_WANTS', tier: 'medium' }], xpTier: 'small',
          content: {
            zoneLabels: { yes: 'Need', no: 'Want' },
            items: [
              { id: 'coat', icon: '🧥', name: 'A warm coat', answer: 'yes' },
              { id: 'vgame', icon: '🎮', name: 'A new video game', answer: 'no' },
              { id: 'lunch', icon: '🍱', name: 'Lunch', answer: 'yes' },
              { id: 'candy', icon: '🍬', name: 'Candy', answer: 'no' },
              { id: 'shoes', icon: '👟', name: 'Shoes that fit', answer: 'yes' },
              { id: 'toycar', icon: '🚗', name: 'A toy car', answer: 'no' },
              { id: 'bag', icon: '🎒', name: 'A school bag', answer: 'yes' },
            ],
          },
        },
        {
          id: 'it-depends', type: 'choose', title: 'It Depends...',
          skills: [{ skill: 'NEEDS_WANTS', tier: 'high' }, { skill: 'TRADE_OFFS', tier: 'low' }], xpTier: 'small',
          content: {
            intro: 'Sometimes it depends! If your old shoes don’t fit anymore...',
            emoji: '👟', prompt: 'New shoes — need or want?',
            options: [
              { id: 'need', label: 'Need — mine don’t fit', best: true },
              { id: 'want', label: 'Want — I just like them' },
            ],
            followup: {
              prompt: 'Why?',
              options: [
                { id: 'grew', label: 'I grew and need new ones', correct: true },
                { id: 'color', label: 'I like the color better', correct: false },
              ],
            },
          },
        },
      ],
    },
    {
      id: 's4', name: 'Earning a Little', icon: '⚒️',
      activities: [
        {
          id: 'chore-board', type: 'chore', title: 'Chore Board',
          skills: [{ skill: 'EARNING', tier: 'medium' }], xpTier: 'small',
          content: {
            chores: [
              { id: 'water', icon: '💧', name: 'Water the plant', taps: 3, pay: 2 },
              { id: 'tidy', icon: '🧸', name: 'Tidy the toys', taps: 3, pay: 2 },
              { id: 'feed', icon: '🐾', name: 'Feed the pet', taps: 3, pay: 2 },
            ],
          },
        },
        {
          id: 'spend-or-save', type: 'choose', title: 'Spend It or Save It?',
          skills: [{ skill: 'TRADE_OFFS', tier: 'high' }, { skill: 'PATIENCE', tier: 'medium' }, { skill: 'EARNING', tier: 'low' }], xpTier: 'moderate',
          content: {
            emoji: '🧸', prompt: 'You earned $6! There’s a toy for $6 right now… or you could add it to your goal.',
            options: [
              { id: 'spend', label: '🧸 Toy — $6 now' },
              { id: 'save', label: '🏦 Add $6 to my goal' },
            ],
          },
        },
      ],
    },
    {
      id: 's5', name: 'Save for a Goal', icon: '🎯',
      activities: [
        {
          id: 'pick-goal', type: 'goal-pick', title: 'Pick Your Goal',
          skills: [{ skill: 'GOALS', tier: 'low' }], xpTier: 'small', content: {},
        },
      ],
    },
    {
      id: 's6', name: 'Smart Shopping', icon: '🛍️',
      activities: [
        {
          id: 'snack-stand', type: 'compare', title: 'Snack Stand',
          skills: [{ skill: 'VALUE', tier: 'medium' }], xpTier: 'small',
          content: {
            emoji: '🍿', prompt: 'You have $20 for snacks. Which is better value?',
            options: [
              { id: 'big', label: '1 big bag — $20' },
              { id: 'small', label: '4 small bags — $5 each', best: true },
            ],
            feedback: {
              big: 'You got 1 big bag. 4 small bags would have given you more to share for the same $20!',
              small: '4 bags for the same $20 — more to share. Great value spotting!',
            },
          },
        },
        {
          id: 'sticker-stand', type: 'compare', title: 'Sticker Stand',
          skills: [{ skill: 'VALUE', tier: 'medium' }], xpTier: 'small',
          content: {
            emoji: '⭐', prompt: 'Stickers! Which is better value?',
            options: [
              { id: 'one-sheet', label: '1 sheet of 10 — $4', best: true },
              { id: 'three-sheets', label: '3 sheets of 3 — $6 total' },
            ],
            feedback: {
              'one-sheet': '10 stickers for $4 — more stickers AND cheaper!',
              'three-sheets': 'Those 3 sheets cost more for fewer stickers than the one big sheet.',
            },
          },
        },
        {
          id: 'apple-trap', type: 'compare', title: 'Fruit Stand',
          skills: [{ skill: 'VALUE', tier: 'checkpoint' }], xpTier: 'checkpoint',
          content: {
            emoji: '🍎', prompt: 'Apples for the picnic! Which is better value?',
            options: [
              { id: 'giant-box', label: '1 giant box of 12 — $15' },
              { id: 'small-bags', label: '3 small bags of 3 — $6 total', best: true },
            ],
            feedback: {
              'giant-box': 'The giant box looks like more, but it costs a lot per apple — the small bags were cheaper for what you get.',
              'small-bags': "Nice! Even though it's fewer apples, the small bags cost much less for each one — that's the better deal.",
            },
          },
        },
      ],
    },
  ],
};

// Boss Challenge — "The Big Day". Beats 3 and 4 pick a random variant each
// attempt so a replay isn't memorisable.
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
