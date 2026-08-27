// MyKidsMoney — generic interaction renderers. Each function takes an
// activity's `content` data plus transient runtime state (`rt`, never
// persisted) and returns an HTML string. No renderer knows which Stage or
// World it's in — that's app.js's job. Reused as-is by the Boss Challenge.

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ---- reveal: sequential mentor cards ----
function renderReveal(content, rt) {
  const i = rt.index || 0;
  const card = content.cards[i];
  const isLast = i >= content.cards.length - 1;
  return `
    <div class="card" style="text-align:center;">
      <div class="emoji-hero">${card.emoji}</div>
      <p class="subtitle">${escapeHtml(card.text)}</p>
    </div>
    <button class="btn" data-action="reveal-next">${isLast ? "Got it!" : 'Next'}</button>
  `;
}

// ---- sort: board of item tiles, each with two answer buttons ----
function renderSort(content, rt) {
  rt.answers = rt.answers || {};
  const allDone = content.items.every(it => rt.answers[it.id]);
  const zoneKeys = Object.keys(content.zoneLabels);
  const tiles = content.items.map(it => {
    const chosen = rt.answers[it.id];
    if (chosen) {
      const correct = chosen === it.answer;
      return `<div class="sort-tile answered">
        <div class="sort-icon">${it.icon}</div>
        <div class="sort-name">${escapeHtml(it.name)}</div>
        <div class="sort-result">${correct ? '✅' : '💡'} ${escapeHtml(content.zoneLabels[it.answer])}</div>
      </div>`;
    }
    return `<div class="sort-tile">
      <div class="sort-icon">${it.icon}</div>
      <div class="sort-name">${escapeHtml(it.name)}</div>
      <div class="sort-btns">
        ${zoneKeys.map(z => `<button class="mini-btn" data-action="sort-pick" data-value="${it.id}:${z}">${escapeHtml(content.zoneLabels[z])}</button>`).join('')}
      </div>
    </div>`;
  }).join('');
  return `
    <div class="sort-board">${tiles}</div>
    <button class="btn" data-action="activity-continue" ${allDone ? '' : 'disabled'}>Continue</button>
  `;
}

// ---- jar-explore: tap each jar to learn ----
function renderJarExplore(content, rt) {
  rt.seen = rt.seen || [];
  const allSeen = rt.seen.length >= content.jars.length;
  const lastJar = content.jars.find(j => j.id === rt.lastSeen);
  return `
    <div class="jars-row">
      ${content.jars.map(j => `<div class="jar ${j.id}" data-action="jar-explore-tap" data-value="${j.id}">
        <div class="jar-icon">${j.icon}</div><div class="jar-name">${j.name}</div>
      </div>`).join('')}
    </div>
    <div class="card"><p class="subtitle">${lastJar ? escapeHtml(lastJar.explain) : 'Tap a jar above to find out what it does!'}</p></div>
    <button class="btn" data-action="activity-continue" ${allSeen ? '' : 'disabled'}>Continue</button>
  `;
}

// ---- allocate: tap a jar to drop a coin ----
function renderAllocate(content, rt) {
  rt.coinsLeft = rt.coinsLeft === undefined ? content.amount : rt.coinsLeft;
  rt.allocated = rt.allocated || { spend: 0, save: 0, give: 0 };
  const coins = Array.from({ length: rt.coinsLeft });
  return `
    <p class="subtitle" style="text-align:center;">${escapeHtml(content.prompt)}</p>
    <div class="card"><div class="coin-pile">${coins.map(() => `<div class="coin">$1</div>`).join('')}</div></div>
    <div class="jars-row">
      <div class="jar spend" data-action="allocate-drop" data-value="spend"><div class="jar-icon">💰</div><div class="jar-name">SPEND</div><div class="jar-amount spend">$${rt.allocated.spend}</div></div>
      <div class="jar save" data-action="allocate-drop" data-value="save"><div class="jar-icon">🏦</div><div class="jar-name">SAVE</div><div class="jar-amount save">$${rt.allocated.save}</div></div>
      <div class="jar give" data-action="allocate-drop" data-value="give"><div class="jar-icon">❤️</div><div class="jar-name">GIVE</div><div class="jar-amount give">$${rt.allocated.give}</div></div>
    </div>
    <button class="btn" data-action="activity-continue" ${rt.coinsLeft === 0 ? '' : 'disabled'}>See What Happens</button>
  `;
}

// ---- choose: scenario + options, optional short "why" followup ----
function renderChoose(content, rt) {
  if (rt.answered && content.followup && !rt.followupAnswered) {
    return `
      <div class="card" style="text-align:center;">
        <div class="celebrate" style="font-size:44px;">🤔</div>
        <p class="subtitle">${escapeHtml(content.followup.prompt)}</p>
      </div>
      ${content.followup.options.map(o => `<button class="btn secondary" data-action="choose-followup-pick" data-value="${o.id}">${escapeHtml(o.label)}</button>`).join('')}
    `;
  }
  if (rt.answered) {
    const picked = content.options.find(o => o.id === rt.answered);
    return `
      <div class="card" style="text-align:center;">
        <div class="celebrate" style="font-size:48px;">✨</div>
        <p class="subtitle">You chose: ${escapeHtml(picked.label)}</p>
      </div>
      <button class="btn" data-action="activity-continue">Continue</button>
    `;
  }
  return `
    ${content.intro ? `<div class="card" style="text-align:center;"><p class="subtitle">${escapeHtml(content.intro)}</p></div>` : ''}
    <div class="card" style="text-align:center;">
      <div class="emoji-hero">${content.emoji || '🤔'}</div>
      <p class="subtitle">${escapeHtml(content.prompt)}</p>
    </div>
    ${content.options.map(o => `<button class="btn secondary" data-action="choose-pick" data-value="${o.id}">${escapeHtml(o.label)}</button>`).join('')}
  `;
}

// ---- compare: value comparison with per-option feedback ----
function renderCompare(content, rt) {
  if (rt.answered) {
    const picked = content.options.find(o => o.id === rt.answered);
    return `
      <div class="celebrate">${picked.best ? '🎉' : '💡'}</div>
      <div class="title">${picked.best ? 'Great value!' : 'Good try!'}</div>
      <div class="card"><p class="subtitle">${escapeHtml(content.feedback[rt.answered])}</p></div>
      <button class="btn" data-action="activity-continue">Continue</button>
    `;
  }
  return `
    <div class="card" style="text-align:center;">
      <div class="emoji-hero">${content.emoji || '🛍️'}</div>
      <p class="subtitle">${escapeHtml(content.prompt)}</p>
    </div>
    ${content.options.map(o => `<button class="btn secondary" data-action="compare-pick" data-value="${o.id}">${escapeHtml(o.label)}</button>`).join('')}
  `;
}

// ---- chore: tap-sequence mini-game ----
function renderChore(content, rt) {
  rt.taps = rt.taps || {};
  const allDone = content.chores.every(c => (rt.taps[c.id] || 0) >= c.taps);
  return `
    <div class="chore-board">
      ${content.chores.map(c => {
        const t = rt.taps[c.id] || 0;
        const done = t >= c.taps;
        return `<div class="chore-tile ${done ? 'done' : ''}" data-action="${done ? '' : 'chore-tap'}" data-value="${c.id}">
          <div class="chore-icon">${c.icon}</div>
          <div class="chore-name">${escapeHtml(c.name)}</div>
          <div class="chore-progress">${done ? `Done! +$${c.pay}` : '•'.repeat(t) + '○'.repeat(c.taps - t)}</div>
        </div>`;
      }).join('')}
    </div>
    <button class="btn" data-action="activity-continue" ${allDone ? '' : 'disabled'}>Continue</button>
  `;
}

// ---- goal-pick: choose from CONFIG.goals ----
function renderGoalPick() {
  return `
    <p class="subtitle">What do you want to save for?</p>
    <div class="grid">
      ${CONFIG.goals.map(g => `<div class="choice-tile" data-action="goal-pick" data-value="${g.id}">${g.icon}<div class="label">${g.name}<br><span class="mono" style="font-size:.75em;">$${g.target}</span></div></div>`).join('')}
    </div>
  `;
}
