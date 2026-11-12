// MyFinance Property module (beta). Split out of index.html so the main file
// stays manageable. Loaded as a plain classic script between the two halves of
// index.html's main script, so everything here shares the same global scope:
// it can use anything defined earlier in index.html, and code later in
// index.html (Persistence onwards) can use what's defined here. Nothing in this
// file should call code from the later half while it's loading.
// Also defines small shared helpers used across the app: escH, round2,
// isoToDate, dateToIso, daysBetween, fmtDay, addDaysIso, isoYearsAgo.

// ─── Property module (beta) ──────────────────────────────────────────────────
// Add-ons are separate from plan ('free'/'pro') so a module can be sold on its
// own. Loaded with a separate query, deliberately NOT added to the
// household_members select in sbLoadHousehold: until the addons column
// migration has run, that select would error, and an error there makes the
// app think there's no household and create a new one.
let sbAddons = [];
async function sbLoadAddons() {
  sbAddons = [];
  if (sbConn && sbHousehold) {
    try {
      const { data, error } = await sbConn.from('households').select('addons').eq('id', sbHousehold.id).maybeSingle();
      if (!error && Array.isArray(data?.addons)) sbAddons = data.addons;
    } catch(e) {}
  }
  renderPropertyEntry();
  if (currentPage === 'property') renderProperty();
}
// The localStorage override is a beta/testing convenience only (e.g. to try
// the module in local-only mode) -- remove it before the module is sold.
function hasAddon(name) {
  if (sbAddons.includes(name)) return true;
  try { return localStorage.getItem('myfinance_beta_' + name) === '1'; } catch(e) { return false; }
}
function renderPropertyEntry() {
  const nav = document.getElementById('nav-property');
  if (nav) nav.style.display = hasAddon('property') ? '' : 'none';
  renderSettingsTiles();
  propTryDeepLink();
}

const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round2 = n => Math.round(n * 100) / 100;
// 'YYYY-MM-DD' helpers -- string dates avoid timezone drift entirely.
const isoToDate = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const dateToIso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const daysBetween = (a, b) => Math.round((isoToDate(b) - isoToDate(a)) / 86400000);
const fmtDay = s => s ? isoToDate(s).toLocaleDateString('en-NZ', {day:'numeric', month:'short', year:'numeric'}) : '—';
function taxYearRange(y) { return { start: `${y-1}-04-01`, end: `${y}-04-01` }; } // end exclusive

let propStreamId = null;
let propTab = 'home';
let propTaxYear = currentTaxYear();

function propertyStreams() { return otherIncomeStreams.filter(s => s.type === 'Investment Property'); }
function currentPropStream() { return propertyStreams().find(s => s.id === propStreamId) || null; }
function defaultPropSettings() {
  return { owners: [{name:'Owner 1', share:50}, {name:'Owner 2', share:50}], purchaseDate: '', accountId: '', travelKm: null, deductionBasis: 'full' };
}
function propSettings(s) { return { ...defaultPropSettings(), ...(s.property || {}) }; }
// Each property has one linked personal category (named after it) for its costs
// paid from personal accounts; the review looks only there by default. Stored
// by name -- renaming the category in Settings updates it (updateCatName).
function propPersonalCat(s) {
  const n = propSettings(s).personalCat;
  return n && CATS.some(c => c.name === n) ? n : null;
}
function ensurePropPersonalCat(s) {
  const cur = propPersonalCat(s);
  if (cur) return cur;
  // Create one named after the property.
  const name = s.name;
  if (!CATS.some(c => c.name === name)) { CATS.push({ name, emoji: '🏠', fixed: false }); reviveTombstone('cats_personal', name); }
  s.property = { ...propSettings(s), personalCat: name };
  scheduleSave();
  return name;
}

function openPropertyModule() {
  if (!hasAddon('property')) return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-property').classList.add('active');
  setNavActive('property');
  propApplyLayout();
  currentPage = 'property';
  setTimeout(propSetHash, 0);
  if (!currentPropStream()) propStreamId = propertyStreams()[0]?.id ?? null;
  propertyStreams().forEach(ensurePropPersonalCat);
  renderProperty();
  document.getElementById('page-container').scrollTop = 0;
}
function closePropertyModule() { navTo('import'); }
function setPropTab(t, fromHash) {
  if (t === 'returns') { propTab = 'tax'; propTaxView = 'returns'; }
  else { if (t === 'tax') propTaxView = 'pnl'; propTab = t; }
  renderProperty();
  document.getElementById('page-container').scrollTop = 0;
  if (!fromHash) propSetHash();
}
// Each workspace section has its own address (#calendar, #tax, ...), so a
// section can be bookmarked and Back moves between sections.
const PROP_HASHES = ['home', 'bookings', 'calendar', 'payouts', 'cashflow', 'review', 'tax', 'returns', 'assets', 'setup', 'more'];
const MF_TITLE = document.title;
function propSetHash() {
  if (currentPage !== 'property') return;
  const h = '#' + propSection();
  if (location.hash !== h) history.pushState(history.state, '', location.pathname + location.search + h);
  document.title = 'MyFinance Accounting';
}
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (currentPage === 'property' && PROP_HASHES.includes(h) && h !== propSection()) setPropTab(h, true);
});
// getmyfinance.app/accounting lands here as ?open=accounting: open the
// workspace once the add-on is known (cloud add-ons load after sign-in).
let propDeepLink = /[?&]open=accounting\b/.test(location.search);
function propTryDeepLink() {
  if (!propDeepLink || !hasAddon('property') || document.getElementById('app').style.display === 'none') return;
  propDeepLink = false;
  const h = location.hash.slice(1);
  openPropertyModule();
  if (PROP_HASHES.includes(h)) setPropTab(h, true); else propSetHash();
}
function setPropStream(id) { propStreamId = Number(id); propReviewCat = null; propReviewOther = false; renderProperty(); }
function shiftPropTaxYear(d) { propTaxYear += d; renderProperty(); }

const PROP_TABS = [
  {id:'home', label:'Home'}, {id:'bookings', label:'Bookings'},
  {id:'calendar', label:'Calendar'}, {id:'cashflow', label:'Cash flow'},
  {id:'tax', label:'Tax'}, {id:'assets', label:'Assets'}, {id:'setup', label:'Setup'},
];
// Workspace sections. Wide screens list them all in a sidebar; phones get five
// tabs, with the rest under More.
const PROP_ICONS = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  bookings: '<path d="M3 7h18M3 12h18M3 17h12"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  payouts: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  cashflow: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  review: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  tax: '<path d="M9 14l6-6M9.5 8.5h.01M14.5 13.5h.01"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  returns: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  assets: '<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>',
  setup: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
};
const PROP_SECTIONS = [
  { id: 'home', label: 'Overview' }, { id: 'bookings', label: 'Bookings' }, { id: 'calendar', label: 'Calendar' },
  { id: 'payouts', label: 'Payouts' }, { id: 'cashflow', label: 'Cash flow' }, { id: 'review', label: 'Review' }, null,
  { id: 'tax', label: 'Tax & pack' }, { id: 'returns', label: "Owners' returns" }, { id: 'assets', label: 'Assets' }, { id: 'setup', label: 'Setup' },
];
const PROP_PHONE_TABS = [{ id: 'home', label: 'Home' }, { id: 'calendar', label: 'Calendar' }, { id: 'cashflow', label: 'Money' }, { id: 'tax', label: 'Tax' }, { id: 'more', label: 'More' }];
// Which section is showing: Owners' returns lives inside the Tax view.
const propSection = () => propTab === 'tax' && propTaxView === 'returns' ? 'returns' : propTab;
function propIsWide() { return currentPage === 'property' && window.innerWidth >= 1024; }
function propApplyLayout() { document.body.classList.toggle('prop-wide', propIsWide()); }
let propWideWas = null;
window.addEventListener('resize', () => {
  if (currentPage !== 'property') return;
  const w = propIsWide();
  if (w !== propWideWas) renderProperty();
});
function propReviewCount(s) {
  const linkedCat = propPersonalCat(s);
  return linkedCat ? transactions.filter(t => (t.stream || 'personal') === 'personal' && t.cat === linkedCat && t.propReviewed !== s.id).length : 0;
}
function propCheckCounts(s) {
  try {
    const rows = propChecklist(s, propTaxYear).flatMap(g => g.rows).filter(r => r.st && r.st !== 'na');
    return { bad: rows.filter(r => r.st === 'bad').length, warn: rows.filter(r => r.st === 'warn').length };
  } catch (e) { return { bad: 0, warn: 0 }; }
}
function propPickerHtml(props, s, cls) {
  return `${props.length > 1
      ? `<select class="${cls}" onchange="setPropStream(this.value)">${props.map(p => `<option value="${p.id}" ${p.id === s.id ? 'selected' : ''}>${escH(p.name)}</option>`).join('')}</select>`
      : `<div class="${cls}" style="cursor:default">${escH(s.name)}</div>`}
    <button class="ps-add" onclick="openAddProperty()">+ Add property</button>`;
}
function propSideHtml(props, s) {
  const sec = propSection(), cc = propCheckCounts(s), rv = propReviewCount(s);
  const miss = propPayoutsMissing(s);
  const badge = id => id === 'tax' && (cc.bad || cc.warn) ? `<span class="badge" style="background:${cc.bad ? 'var(--red)' : 'var(--amber)'}">${cc.bad + cc.warn}</span>`
    : id === 'payouts' && miss ? `<span class="badge" style="background:var(--red)">${miss}</span>`
    : id === 'review' && rv ? `<span class="badge" style="background:var(--teal)">${rv}</span>` : '';
  return `<div style="font-size:15px;font-weight:650;padding:0 6px">Property <span style="font-size:10px;font-weight:600;color:var(--teal)">BETA</span></div>
    <div style="display:flex;flex-direction:column;gap:6px">${propPickerHtml(props, s, 'ps-picker')}</div>
    <nav class="ps-nav">${PROP_SECTIONS.map(x => x ? `<button class="${sec === x.id ? 'on' : ''}" onclick="setPropTab('${x.id}')"><svg viewBox="0 0 24 24">${PROP_ICONS[x.id]}</svg>${escH(x.label)}${badge(x.id)}</button>` : '<div class="ps-sep"></div>').join('')}</nav>
    <button class="ps-back" onclick="navTo('overview')">← Back to MyFinance</button>`;
}
function propHeadHtml(s) {
  const sec = PROP_SECTIONS.find(x => x && x.id === propSection());
  const cc = propCheckCounts(s), yearly = ['home', 'tax', 'returns', 'calendar', 'assets', 'payouts'].includes(propSection());
  const chip = cc.bad ? `<button class="ph-chip" style="background:rgba(224,82,82,0.15);color:var(--red)" onclick="setPropTab('tax')"><i></i>${cc.bad} off track</button>`
    : cc.warn ? `<button class="ph-chip" style="background:rgba(224,160,48,0.15);color:var(--amber)" onclick="setPropTab('tax')"><i></i>${cc.warn} to check</button>`
    : `<button class="ph-chip" style="background:rgba(29,184,138,0.14);color:var(--teal)" onclick="setPropTab('tax')"><i></i>On track</button>`;
  return `<h2>${escH(sec ? sec.label : 'Property')}</h2>
    ${yearly ? `<div class="ph-year"><button onclick="shiftPropTaxYear(-1)" aria-label="Previous tax year">‹</button>Tax year ${taxYearLabel(propTaxYear)}<button onclick="shiftPropTaxYear(1)" aria-label="Next tax year">›</button></div>` : ''}
    ${chip}
    <button class="btn btn-primary" style="padding:8px 14px;font-size:13px" onclick="openPropAddMenu()">+ Add</button>`;
}
function openPropAddMenu() {
  const item = (icon, label, sub, fn) => `<button onclick="closeModal();${fn}" style="display:flex;gap:12px;align-items:center;width:100%;text-align:left;background:var(--bg3);border:0.5px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:8px;color:var(--text);font:inherit;cursor:pointer"><span style="font-size:20px">${icon}</span><span><strong style="font-size:14px">${label}</strong><span style="display:block;font-size:12px;color:var(--text3)">${sub}</span></span></button>`;
  document.getElementById('modal-title').textContent = 'Add';
  document.getElementById('modal-body').innerHTML = item('🧾', 'Expense or cost', 'Paid in cash or from an account the app doesn\'t have', 'openPropCost()')
    + item('📥', 'Bookings', 'Import an Airbnb or Bookabach CSV', "setPropTab('bookings')")
    + item('📅', 'Days on the calendar', 'Personal use, cleans, trips, blocked days', "setPropTab('calendar')")
    + item('🛋️', 'Asset', 'Something to depreciate', 'openPropAsset()')
    + item('🏡', 'Another property', 'Add a second property', 'openAddProperty()');
  const btn = document.getElementById('modal-confirm'); btn.textContent = 'Close'; btn.onclick = closeModal;
  document.getElementById('modal').classList.add('open');
}
function propMoreHtml(s) {
  const rv = propReviewCount(s);
  const item = (id, label, sub) => `<button onclick="setPropTab('${id}')" style="display:flex;gap:12px;align-items:center;width:100%;text-align:left;background:none;border:none;border-bottom:0.5px solid var(--border);padding:12px 2px;color:var(--text);font:inherit;cursor:pointer"><svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:var(--teal);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none">${PROP_ICONS[id]}</svg><span style="flex:1"><strong style="font-size:14px">${label}</strong><span style="display:block;font-size:12px;color:var(--text3)">${sub}</span></span><span style="color:var(--text3)">›</span></button>`;
  return `<div class="card" style="padding:4px 14px">
    ${item('bookings', 'Bookings', 'Import CSVs and stays')}
    ${item('payouts', 'Payouts', 'Payouts matched to bank deposits')}
    ${item('review', 'Review' + (rv ? ` (${rv})` : ''), 'Personal transactions that may belong to the property')}
    ${item('returns', "Owners' returns", 'Each owner\'s tax estimate')}
    ${item('assets', 'Assets', 'Depreciation register')}
    ${item('setup', 'Setup', 'Owners, accounts, categories, basis')}
  </div>`;
}
function renderProperty() {
  const picker = document.getElementById('prop-picker');
  const tabsEl = document.getElementById('prop-tabs');
  const body   = document.getElementById('prop-body');
  if (!picker) return;
  propApplyLayout(); propWideWas = propIsWide();
  propCache = new Map();
  try { renderPropertyInner(picker, tabsEl, body); } finally { propCache = null; }
  propDrawCharts();
}
function renderPropertyInner(picker, tabsEl, body) {
  const props = propertyStreams();
  const s = currentPropStream();
  const side = document.getElementById('prop-side'), headW = document.getElementById('prop-head-wide');
  if (!s) {
    picker.innerHTML = ''; tabsEl.innerHTML = ''; side.innerHTML = ''; headW.innerHTML = '';
    body.innerHTML = `<div class="card" style="text-align:center;padding:28px 20px">
      <div style="font-size:28px;margin-bottom:10px">🏖️</div>
      <div style="font-weight:700;font-size:15px;margin-bottom:6px">Add your first property</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:16px">A property is an Other Income stream of type "Investment Property". Already have one set up as a different type? Change its type in Settings → Other Income.</div>
      <button class="btn btn-primary" onclick="openAddProperty()">+ Add property</button>
    </div>`;
    return;
  }
  picker.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">${props.length > 1
      ? `<select onchange="setPropStream(this.value)" style="flex:1;min-width:0;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:14px;font-weight:600;padding:9px 12px">
          ${props.map(p => `<option value="${p.id}" ${p.id===s.id?'selected':''}>${escH(p.name)}</option>`).join('')}</select>`
      : `<div style="flex:1;font-size:16px;font-weight:650">${escH(s.name)}</div>`}
    <button class="ps-add" style="white-space:nowrap" onclick="openAddProperty()">+ Add property</button></div>`;
  const sec = propSection();
  const phoneActive = t => t === sec || (t === 'more' && ['bookings', 'payouts', 'review', 'returns', 'assets', 'setup', 'more'].includes(sec)) || (t === 'tax' && sec === 'tax');
  tabsEl.innerHTML = PROP_PHONE_TABS.map(t => `<button class="tab ${phoneActive(t.id) ? 'active' : ''}" onclick="setPropTab('${t.id}')">${t.label}</button>`).join('');
  side.innerHTML = propSideHtml(props, s);
  headW.innerHTML = propHeadHtml(s);
  propChartData = null;
  if (propTab === 'home')          body.innerHTML = propDashHtml(s);
  else if (propTab === 'more')     body.innerHTML = propMoreHtml(s);
  else if (propTab === 'payouts')  body.innerHTML = propPayoutsHtml(s);
  else if (propTab === 'bookings') body.innerHTML = propBookingsHtml(s);
  else if (propTab === 'setup')    body.innerHTML = propSetupHtml(s);
  else if (propTab === 'tax')      body.innerHTML = propTaxHtml(s);
  else if (propTab === 'calendar') body.innerHTML = propCalendarHtml(s);
  else if (propTab === 'review')   body.innerHTML = propReviewHtml(s);
  else if (propTab === 'assets')   body.innerHTML = propAssetsHtml(s);
  else if (propTab === 'cashflow') body.innerHTML = propCashflowHtml(s);
  else body.innerHTML = '';
}

function openAddProperty() {
  document.getElementById('modal-title').textContent = 'Add property';
  document.getElementById('modal-body').innerHTML = `<div class="input-group"><label>Name</label><input type="text" id="prop-new-name" placeholder="e.g. Beach house"></div>`;
  document.getElementById('modal-confirm').textContent = 'Add';
  document.getElementById('modal-confirm').onclick = () => {
    const name = document.getElementById('prop-new-name').value.trim();
    if (!name) return;
    const s = {id:Date.now(), name, type:'Investment Property', linkedDebtId:null, cats:PROPERTY_STREAM_CATS(), budgets:{}, property:defaultPropSettings()};
    otherIncomeStreams.push(s);
    propStreamId = s.id; propTab = 'setup';
    closeModal(); renderProperty(); renderIncomeStreams(); renderCatMgmtTabs(); scheduleSave();
  };
  document.getElementById('modal').classList.add('open');
}

// ── Tax year figures ──
// Nights of a booking falling in [start,end) -- a stay that crosses 31 March is
// split between tax years pro rata by night rather than all landing in one.
function bookingShareInRange(b, start, end) {
  // A zero-night record (e.g. an adjustment-only entry) belongs wholly to the
  // year its date falls in.
  if (!b.nights) return { share: (b.checkIn >= start && b.checkIn < end) ? 1 : 0, nights: 0 };
  const s = b.checkIn > start ? b.checkIn : start;
  const e = b.checkOut < end ? b.checkOut : end;
  const n = Math.max(0, daysBetween(s, e));
  return { share: n / b.nights, nights: n };
}
function propYearSummary(streamId, taxYear) {
  const {start, end} = taxYearRange(taxYear);
  const blank = () => ({count:0, nights:0, gross:0, fees:0, hostTax:0, adjustments:0, payout:0});
  const out = { completed: blank(), upcoming: blank() };
  bookings.filter(b => b.streamId === streamId && !b.cancelled).forEach(b => {
    const { share, nights } = bookingShareInRange(b, start, end);
    if (!share) return;
    const t = out[b.status === 'completed' ? 'completed' : 'upcoming'];
    t.count++;
    t.nights      += nights;
    t.gross       += b.gross * share;
    t.fees        += b.serviceFee * share;
    t.hostTax     += b.hostTax * share;
    t.adjustments += b.adjustments * share;
    t.payout      += b.payout * share;
  });
  out.daysInYear = daysBetween(start, end);
  return out;
}

function propYearNavHtml() {
  if (propIsWide()) return '';
  return `<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:4px 0 12px">
    <button onclick="shiftPropTaxYear(-1)" style="background:var(--bg3);border:0.5px solid var(--border2);color:var(--text);width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px">&#8249;</button>
    <span style="font-size:14px;font-weight:600;min-width:110px;text-align:center">Tax year ${taxYearLabel(propTaxYear)}</span>
    <button onclick="shiftPropTaxYear(1)" style="background:var(--bg3);border:0.5px solid var(--border2);color:var(--text);width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px">&#8250;</button>
  </div>`;
}

// ── Overview dashboard (layout approved 12 Nov 2026) ──
let propChartData = null;
const propCharts = {};
// Booking income (gross + flat-rate credit + adjustments) for nights in [from, to).
function propBookingIncomeBetween(s, from, to) {
  return bookings.filter(b => b.streamId === s.id && !b.cancelled && !b.belowMarket).reduce((a, b) => {
    const r = bookingShareInRange(b, from, to);
    return a + ((b.gross || 0) + (b.hostTax || 0) + (b.adjustments || 0)) * r.share;
  }, 0);
}
// ── Payouts: each platform payout beside the bank deposit it was matched to ──
function propPayoutsMissing(s) {
  try {
    const m = computePayoutMatches(s), cut = addDaysIso(todayLocal(), -7);
    return propPayouts.filter(p => p.streamId === s.id && p.amount > 0 && p.date <= cut && taxYearOf(isoToDate(p.date)) === propTaxYear && !m.payoutTxn.has(p.id)).length;
  } catch (e) { return 0; }
}
function propPayoutsHtml(s) {
  const { start, end } = taxYearRange(propTaxYear);
  const m = computePayoutMatches(s), today = todayLocal();
  const list = propPayouts.filter(p => p.streamId === s.id && p.amount > 0 && p.date >= start && p.date < end).sort((a, b) => a.date.localeCompare(b.date));
  const acct = id => accounts.find(a => a.id === id)?.name || id || '';
  const guestsFor = p => bookings.filter(b => b.streamId === s.id && b.platform === p.platform && (b.payments || []).some(pm => pm.date === p.date)).map(b => b.guest || fmtDay(b.checkIn));
  const found = list.filter(p => m.payoutTxn.has(p.id)).length;
  const waiting = list.filter(p => !m.payoutTxn.has(p.id) && p.date > addDaysIso(today, -7)).length;
  const missing = list.length - found - waiting;
  const orphan = propTxnsInYear(s, propTaxYear).filter(t => t.amount > 0 && propLineKind(propLineForTxn(s, t)) === 'income' && !m.matchedTxnIds.has(t.id));
  const chip = (txt, col) => `<span style="background:var(--bg3);border-radius:8px;padding:5px 9px;font-size:12px;color:var(--text2)">${txt.replace(/(\d+)/, `<b style="color:${col || 'var(--text)'}">$1</b>`)}</span>`;
  const status = p => {
    const t = m.payoutTxn.get(p.id);
    if (t) return { ok: true, dep: `${fmtDay(dateToIso(t.date))}<small>${escH(acct(t.account))} · ${escH((t.desc || '').slice(0, 40))}</small>`, amt: t.amount,
      act: m.manual.has(p.id) ? `<button class="btn btn-secondary" style="padding:4px 9px;font-size:12px" onclick="propPayoutUnlink('${escH(p.id)}')">Unmatch</button>`
        : `<button class="btn btn-secondary" style="padding:4px 9px;font-size:12px" onclick="propPayoutReject('${escH(p.id)}', ${escH(JSON.stringify(t.id))})">Not this one</button>`,
      tag: m.manual.has(p.id) ? 'matched by you' : 'matched' };
    if (p.date > addDaysIso(today, -7)) return { ok: null, dep: `<span style="color:var(--text3)">Waiting<small>due ${fmtDay(p.arriveBy || p.date)}</small></span>`, act: `<button class="btn btn-secondary" style="padding:4px 9px;font-size:12px" onclick="openPropPayoutMatch('${escH(p.id)}')">Match…</button>` };
    return { ok: false, dep: `<span style="color:var(--red)">Not found<small>${escH(propPayoutMissReason(s, p, m))}</small></span>`, act: `<button class="btn btn-primary" style="padding:4px 9px;font-size:12px" onclick="openPropPayoutMatch('${escH(p.id)}')">Match…</button>` };
  };
  const rows = list.map(p => {
    const st = status(p), g = guestsFor(p);
    const icon = st.ok ? '<span style="color:var(--teal);font-weight:700">✓</span>' : st.ok === false ? '<span style="color:var(--red);font-weight:700">!</span>' : '<span style="color:var(--text3)">…</span>';
    return `<div class="po-row"><span>${fmtDay(p.date)}</span><span style="color:${PLATFORM_BAR[p.platform] || 'var(--text2)'};font-weight:600">${escH(platformName(p.platform))}</span>
      <span><b style="font-variant-numeric:tabular-nums">${fmt(p.amount)}</b><small>${g.length ? escH(g.slice(0, 3).join(', ')) + (g.length > 3 ? '…' : '') : ''}</small></span>
      <span style="text-align:center">${icon}</span>
      <span>${st.dep}${st.tag ? `<small style="color:var(--teal)">${st.tag}</small>` : ''}</span>
      <span style="text-align:right">${st.act}</span></div>`;
  }).join('');
  return `${propYearNavHtml()}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${chip(`${list.length} payouts`)}${chip(`${found} in the bank`, 'var(--teal)')}${missing ? chip(`${missing} not found`, 'var(--red)') : ''}${waiting ? chip(`${waiting} waiting`) : ''}${orphan.length ? chip(`${orphan.length} deposits with no payout`, 'var(--amber)') : ''}</div>
    <div class="card">
      ${list.length ? (propIsWide() ? `<div style="overflow-x:auto"><div style="min-width:620px">
        <div class="po-row head"><span>Paid</span><span>Platform</span><span>Payout</span><span></span><span>Bank deposit</span><span></span></div>
        ${rows}</div></div>` : list.map(p => { const st = status(p), g = guestsFor(p);
          return `<div class="po-m" style="padding:10px 0;border-bottom:0.5px solid var(--border);font-size:13px">
            <div style="display:flex;justify-content:space-between;gap:10px"><span><b style="color:${PLATFORM_BAR[p.platform] || 'var(--text)'}">${escH(platformName(p.platform))}</b> · ${fmtDay(p.date)}${g.length ? `<small style="display:block;color:var(--text3);font-size:11.5px">${escH(g.slice(0, 3).join(', '))}</small>` : ''}</span><b style="font-variant-numeric:tabular-nums">${fmt(p.amount)}</b></div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:6px"><span style="font-size:12px;min-width:0">${st.ok ? '<span style="color:var(--teal)">✓ In the bank </span>' : ''}${st.dep}</span>${st.act}</div></div>`; }).join('')) : '<div style="font-size:13px;color:var(--text3)">No payouts in this tax year. Import the platform CSVs in Bookings.</div>'}
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Payouts are matched to deposits by amount and date, including money paid into another account and moved across later. Use Match… when a payout wasn't found, or Not this one if it picked the wrong deposit.</div>
    </div>
    ${orphan.length ? `<div class="card"><div class="pd-ct" style="margin-bottom:6px">Deposits with no payout <small>counted as other income</small></div>
      ${orphan.map(t => `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--border);font-size:13px"><span>${fmtDay(dateToIso(t.date))}<small style="display:block;color:var(--text3);font-size:11.5px">${escH(acct(t.account))} · ${escH((t.desc || '').slice(0, 50))}</small></span><b style="font-variant-numeric:tabular-nums">${fmt(t.amount)}</b></div>`).join('')}
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Direct bookings or other platforms usually show here. If one is really an Airbnb or Bookabach payout, use Match… on that payout above.</div></div>` : ''}`;
}
function openPropPayoutMatch(pid) {
  const s = currentPropStream(); if (!s) return;
  const p = propPayouts.find(x => x.id === pid); if (!p) return;
  const m = computePayoutMatches(s), taken = new Map([...m.payoutTxn.entries()].map(([k, t]) => [t.id, k]));
  const acct = id => accounts.find(a => a.id === id)?.name || id || '';
  const cands = transactions.filter(t => t.amount > 0 && Math.abs(daysBetween(p.date, dateToIso(t.date))) <= 60)
    .map(t => ({ t, diff: Math.abs(t.amount - p.amount), days: Math.abs(daysBetween(p.date, dateToIso(t.date))) }))
    .sort((a, b) => (a.diff < 0.005 ? 0 : 1) - (b.diff < 0.005 ? 0 : 1) || a.diff - b.diff || a.days - b.days).slice(0, 15);
  document.getElementById('modal-title').textContent = `Match ${fmt(p.amount)} paid ${fmtDay(p.date)}`;
  document.getElementById('modal-body').innerHTML = `<div style="font-size:12px;color:var(--text3);margin-bottom:8px">Deposits within 60 days, closest amount first. Pick the one this payout became.</div>
    ${cands.length ? cands.map(({ t, diff }) => { const other = taken.get(t.id); return `<button ${other && other !== pid ? 'disabled' : ''} onclick="propPayoutLink('${escH(pid)}', ${escH(JSON.stringify(t.id))})" style="display:flex;justify-content:space-between;gap:10px;width:100%;text-align:left;background:var(--bg3);border:0.5px solid ${diff < 0.005 ? 'var(--teal)' : 'var(--border)'};border-radius:var(--radius-sm);padding:9px 10px;margin-bottom:6px;color:var(--text);font:inherit;cursor:pointer;${other && other !== pid ? 'opacity:.45;cursor:default' : ''}">
      <span>${fmtDay(dateToIso(t.date))}<span style="display:block;font-size:11.5px;color:var(--text3)">${escH(acct(t.account))} · ${escH((t.desc || '').slice(0, 44))}${other && other !== pid ? ' · matched to another payout' : ''}</span></span>
      <b style="font-variant-numeric:tabular-nums;color:${diff < 0.005 ? 'var(--teal)' : 'var(--text)'}">${fmt(t.amount)}</b></button>`; }).join('') : '<div style="font-size:13px;color:var(--text3)">No deposits within 60 days. Import the bank account the platform pays into.</div>'}`;
  const btn = document.getElementById('modal-confirm'); btn.textContent = 'Cancel'; btn.onclick = closeModal;
  document.getElementById('modal').classList.add('open');
}
function propPayoutLink(pid, txnId) {
  const p = propPayouts.find(x => x.id === pid); if (!p) return;
  p.linkTxn = txnId; p.rejectTxn = (p.rejectTxn || []).filter(x => x !== txnId);
  closeModal(); scheduleSave(); renderProperty();
}
function propPayoutUnlink(pid) {
  const p = propPayouts.find(x => x.id === pid); if (!p) return;
  if (p.linkTxn != null) p.rejectTxn = [...new Set([...(p.rejectTxn || []), p.linkTxn])];
  delete p.linkTxn; scheduleSave(); renderProperty();
}
function propPayoutReject(pid, txnId) {
  const p = propPayouts.find(x => x.id === pid); if (!p) return;
  p.rejectTxn = [...new Set([...(p.rejectTxn || []), txnId])];
  scheduleSave(); renderProperty();
}
function propDashHtml(s) {
  const has = bookings.some(b => b.streamId === s.id);
  const rv = propReviewCount(s), linkedCat = propPersonalCat(s);
  const reviewCard = rv ? `<div class="card" style="display:flex;align-items:center;gap:10px;border-color:var(--teal)">
      <div style="flex:1;font-size:13px">${rv} personal "${escH(linkedCat)}" transaction${rv === 1 ? '' : 's'} may belong to this property.</div>
      <button class="btn btn-primary" style="padding:6px 12px;font-size:12px" onclick="setPropTab('review')">Review</button></div>` : '';
  if (!has) return `${propYearNavHtml()}${reviewCard}<div class="card" style="text-align:center;padding:24px 20px">
    <div style="font-size:13px;color:var(--text3);margin-bottom:14px">No bookings yet. Import your Airbnb or Bookabach CSVs to get started.</div>
    <button class="btn btn-primary" onclick="setPropTab('bookings')">Go to Bookings</button></div>`;
  const ty = propTaxYear, { start, end } = taxYearRange(ty), today = todayLocal();
  const isCur = today >= start && today < end, isPast = today >= end;
  const upTo = isCur ? addDaysIso(today, 1) : end; // exclusive
  const asOfTxt = isCur ? `to ${isoToDate(today).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}` : isPast ? 'full year' : 'booked so far';
  const matches = computePayoutMatches(s);
  const pnl = computePropPnL(s, ty, matches);
  const fc = isCur ? computePropPnL(s, ty, matches, { forecast: true }) : null;
  // Income against the same point last year.
  const lyStart = taxYearRange(ty - 1).start, shift = d => isoYearsAgo(d, 1);
  const thisToDate = propBookingIncomeBetween(s, start, upTo);
  const lastToDate = propBookingIncomeBetween(s, lyStart, shift(upTo));
  const lastFull = propBookingIncomeBetween(s, lyStart, start);
  const vsLast = lastToDate > 0 ? Math.round((thisToDate / lastToDate - 1) * 100) : null;
  // Biggest expense line.
  const lines = [{ label: 'Commissions', amount: pnl.commissions }, ...pnl.expenseLines.map(l => ({ label: l.label.replace(/ \(.*\)$/, ''), amount: l.amount }))].filter(l => l.amount > 0.5).sort((a, b) => b.amount - a.amount);
  // Next payout and unmatched payouts.
  const nextBk = bookings.filter(b => b.streamId === s.id && !b.cancelled && b.status !== 'completed' && b.checkIn && addDaysIso(b.checkIn, 1) >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
  const unmatched = propPayouts.filter(p => p.streamId === s.id && p.amount > 0 && p.date >= start && p.date < end && p.date <= addDaysIso(today, -7) && !matches.payoutTxn.has(p.id)).length;
  // Occupancy so far.
  const elapsedEnd = isCur ? addDaysIso(today, 1) : end;
  const elapsed = Math.max(1, daysBetween(start, elapsedEnd));
  const nightsSoFar = bookings.filter(b => b.streamId === s.id && !b.cancelled && !b.belowMarket && b.nights).reduce((a, b) => a + bookingShareInRange(b, start, elapsedEnd).nights, 0)
    + propDaysInYear(s, ty).filter(d => (d.type === 'booked' && !d.belowMarket) && d.date < elapsedEnd).length;
  const occ = Math.min(100, Math.round(nightsSoFar / elapsed * 100));
  const u = pnl.usage;
  // Equity.
  const val = propValueAt(s, 9999), debt = resolveLinkedDebt(s.linkedDebtId);
  // To do from the checklist.
  let todo = [];
  try { todo = propChecklist(s, ty).flatMap(g => g.rows.map(r => ({ ...r, group: g.group }))).filter(r => r.st && r.st !== 'na'); } catch (e) {}
  const order = { bad: 0, warn: 1, good: 2 };
  const todoRows = todo.slice().sort((a, b) => order[a.st] - order[b.st]).slice(0, 5);
  const pill = st => st === 'bad' ? `<span class="pd-pill" style="background:rgba(224,82,82,0.15);color:var(--red)">OFF TRACK</span>`
    : st === 'warn' ? `<span class="pd-pill" style="background:rgba(224,160,48,0.15);color:var(--amber)">CHECK</span>`
    : `<span class="pd-pill" style="background:rgba(29,184,138,0.14);color:var(--teal)">ON TRACK</span>`;
  const strip = h => String(h || '').replace(/<[^>]*>/g, '');
  // Cash in and out by month of the tax year, from the property's own transactions,
  // with months still to come taken from the cash flow forecast.
  const months = [];
  for (let i = 0; i < 12; i++) { const d = new Date(ty - 1, 3 + i, 1); months.push({ key: dateToIso(d).slice(0, 7), label: d.toLocaleDateString('en-NZ', { month: 'short' }), inn: 0, out: 0, fc: false }); }
  transactions.filter(t => t.stream === s.id).forEach(t => {
    const d = dateToIso(t.date); if (d < start || d >= end) return;
    if (propLineKind(propLineForTxn(s, t)) === 'none') return;
    const m = months.find(x => x.key === d.slice(0, 7)); if (!m) return;
    if (t.amount > 0) m.inn += t.amount; else m.out += -t.amount;
  });
  const cf = propCashflow(s), thisMonth = today.slice(0, 7);
  if (cf.months) months.forEach(m => {
    if (m.key < thisMonth) return;
    const f = cf.months.find(x => x.key === m.key); if (!f) return;
    if (m.key === thisMonth) { m.inn += f.inn; m.out += -f.out; m.fc = 'part'; }
    else { m.inn = f.inn; m.out = -f.out; m.fc = true; }
  });
  // Property account balance: month ends so far, then the forecast.
  let bal = null;
  if (cf.months) {
    const acc = propSettings(s).accountId;
    const accTx = transactions.filter(t => t.account === acc);
    const endBal = key => { const me = dateToIso(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1)); return cf.startBal - accTx.filter(t => { const d = dateToIso(t.date); return d >= me && d <= today; }).reduce((a, t) => a + t.amount, 0); };
    bal = months.map(m => m.key < thisMonth ? { label: m.label, v: round2(endBal(m.key)), fc: false } : ((f => f ? { label: m.label, v: f.end, fc: true } : null)(cf.months.find(x => x.key === m.key)))).filter(Boolean);
  }
  // Upcoming stays and the owners' own stays.
  const ups = bookings.filter(b => b.streamId === s.id && !b.cancelled && b.checkOut > today).map(b => ({ d: b.checkIn, b }));
  const priv = propDays.filter(d => d.streamId === s.id && (d.type === 'personal' || d.type === 'family') && d.date >= today).map(d => d.date).sort();
  const runs = []; priv.forEach(d => { const r = runs[runs.length - 1]; if (r && daysBetween(r.to, d) === 1) { r.to = d; r.n++; } else runs.push({ from: d, to: d, n: 1 }); });
  runs.forEach(r => ups.push({ d: r.from, run: r }));
  const upcoming = ups.sort((a, b) => a.d.localeCompare(b.d)).slice(0, 5);
  const shortDay = d => isoToDate(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
  const platCol = p => PLATFORM_BAR[p] || PROP_BOOKING_BAR;
  propChartData = { months, bal, occ, lines: lines.slice(0, 7) };
  const y = propYearSummary(s.id, ty), c = y.completed, uu = y.upcoming;
  return `${reviewCard}
  <div class="pd-grid">
    <div class="card pd-k"><div class="pd-ct">Income <small>${asOfTxt}</small></div><div class="pd-v">${fmt(pnl.rent)}</div>
      ${lastFull > 0 ? `<div class="pd-bar"><span style="width:${Math.min(100, thisToDate / lastFull * 100)}%"></span><em style="left:${Math.min(100, lastToDate / lastFull * 100)}%"></em></div>` : ''}
      <div class="pd-s">${vsLast != null ? `<b style="color:${vsLast >= 0 ? 'var(--teal)' : 'var(--red)'}">${vsLast >= 0 ? '+' : ''}${vsLast}%</b> on this date last year` : 'No bookings last year to compare'}</div></div>
    <div class="card pd-k"><div class="pd-ct">Expenses <small>${asOfTxt}</small></div><div class="pd-v">${fmt(pnl.totalExpenses)}</div>
      <div class="pd-s">${lines[0] ? `${escH(lines[0].label)} is the biggest: ${fmt(lines[0].amount)}` : 'None yet'}</div></div>
    <div class="card pd-k"><div class="pd-ct">Net profit <small>${asOfTxt}</small></div><div class="pd-v" style="color:${pnl.net >= 0 ? 'var(--text)' : 'var(--red)'}">${fmtSigned(pnl.net)}</div>
      <div class="pd-s">${fc ? `Forecast for the year: <b style="color:var(--teal)">${fmtSigned(fc.net)}</b>` : pnl.taxNet !== pnl.net ? `For tax: ${fmtSigned(pnl.taxNet)}` : ''}</div></div>
    <div class="card pd-k"><div class="pd-ct">Next payout</div><div class="pd-v">${nextBk ? fmt(nextBk.payout || 0) : '—'}</div>
      <div class="pd-s">${nextBk ? `${escH(platformName(nextBk.platform))} · due ${shortDay(addDaysIso(nextBk.checkIn, 1))}` : 'Nothing booked'}${unmatched ? ` · <b style="color:var(--red)">${unmatched} unmatched</b>` : ''}</div></div>
  </div>
  <div class="pd-grid">
    <div class="card pd-8"><div class="pd-ct">Cash in and out <span class="pd-legend"><span><i style="background:var(--teal)"></i>In</span><span><i style="background:var(--red)"></i>Out</span>${cf.months ? '<span><i style="background:var(--text3);opacity:.5"></i>Forecast</span>' : ''}</span></div>
      <div class="pd-chart"><canvas id="pd-flow" aria-label="Money in and out of the property each month of the tax year"></canvas></div>
      ${cf.months ? '' : `<div class="pd-s">Set the property account and its balance in <a href="#" onclick="setPropTab('cashflow');return false" style="color:var(--teal)">Cash flow</a> to see the months ahead.</div>`}</div>
    <div class="card pd-4"><div class="pd-ct">To do <small>from the year-end checklist</small></div>
      <div class="pd-list">${todoRows.length ? todoRows.map(r => `<div onclick="setPropTab('tax')" style="cursor:pointer"><p>${escH(strip(r.label))}<small>${r.group && r.group !== 'Confirm' ? escH(r.group) + ' · ' : ''}${escH(strip(r.detail))}</small></p>${pill(r.st)}</div>`).join('') : '<div><p>Nothing to show yet.</p></div>'}</div></div>
  </div>
  <div class="pd-grid">
    <div class="card pd-3"><div class="pd-ct">Occupancy <small>${asOfTxt}</small></div>
      <div style="display:flex;gap:14px;align-items:center"><div style="width:92px;height:92px;flex:none;position:relative"><canvas id="pd-occ" aria-label="Occupancy ${occ} percent"></canvas></div>
      <div style="font-size:12px;color:var(--text2);line-height:1.7"><b style="color:var(--text)">${occ}%</b> of nights rented<br><b style="color:var(--text)">${u.income}</b> rented · <b style="color:var(--text)">${u.personalDays}</b> private${u.share != null && u.personalDays ? `<br>Income share <b style="color:var(--text)">${Math.round(u.share * 100)}%</b>` : ''}<br><b style="color:var(--text)">${u.unused}</b> nights unused</div></div></div>
    <div class="card pd-4"><div class="pd-ct">Expenses by line <small>${asOfTxt}</small></div>
      ${lines.length ? `<div style="display:flex;gap:12px;align-items:center"><div style="width:106px;height:106px;flex:none"><canvas id="pd-exp" aria-label="Expenses by line"></canvas></div><div id="pd-exp-leg" style="font-size:11.5px;color:var(--text2);line-height:1.65;flex:1;min-width:0"></div></div>` : '<div class="pd-s">No expenses yet.</div>'}</div>
    <div class="card pd-5"><div class="pd-ct">Equity ${val ? `<small>${escH(val.source.toLowerCase())} ${shortDay(val.date)} ${isoToDate(val.date).getFullYear()}</small>` : ''}</div>
      ${val || debt ? `
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2)"><span>Property value</span><b style="color:var(--text)">${val ? fmt(val.amount) : '—'}</b></div>
      <div class="pd-hbar"><span style="width:${val ? 100 : 0}%;background:var(--blue)"></span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-top:8px"><span>${debt ? `Mortgage (${escH(debt.name)})` : 'Mortgage'}</span><b style="color:var(--text)">${debt ? fmt(debt.balance) : 'not linked'}</b></div>
      <div class="pd-hbar"><span style="width:${val && debt ? Math.min(100, debt.balance / val.amount * 100) : 0}%;background:var(--red)"></span></div>
      ${val && debt ? `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:12px;font-size:12px;color:var(--text2)"><span>Equity</span><b style="color:var(--teal);font-size:17px">${fmt(val.amount - debt.balance)}</b></div>` : ''}
      <div class="pd-s">${!val ? 'Add the rating valuation or purchase price in <a href="#" onclick="setPropTab(\'setup\');return false" style="color:var(--teal)">Setup</a>.' : !debt ? 'Link the property\'s mortgage in Settings → Other income.' : ''}</div>`
      : `<div class="pd-s">Add the rating valuation or purchase price in <a href="#" onclick="setPropTab('setup');return false" style="color:var(--teal)">Setup</a>, and link the property's mortgage in Settings → Other income.</div>`}</div>
  </div>
  <div class="pd-grid">
    <div class="card pd-6"><div class="pd-ct">Property account balance <small>${bal ? 'month ends, then forecast' : ''}</small></div>
      ${bal ? '<div class="pd-chart sm"><canvas id="pd-bal" aria-label="Property account balance by month, forecast dashed"></canvas></div>' : `<div class="pd-s">Set the property account and its current balance in <a href="#" onclick="setPropTab('cashflow');return false" style="color:var(--teal)">Cash flow</a>.</div>`}</div>
    <div class="card pd-6"><div class="pd-ct">Upcoming stays</div>
      <div class="pd-list">${upcoming.length ? upcoming.map(x => x.b
        ? `<div><span style="width:8px;height:8px;border-radius:50%;background:${platCol(x.b.platform)};flex:none"></span><p>${escH(x.b.guest || platformName(x.b.platform))} <small>${shortDay(x.b.checkIn)}–${shortDay(x.b.checkOut)} · ${x.b.nights} night${x.b.nights === 1 ? '' : 's'}${x.b.belowMarket ? ' · below market' : ''}</small></p>${x.b.checkIn <= today ? '<span class="pd-pill" style="background:rgba(74,143,232,0.15);color:var(--blue)">STAYING</span>' : '<span class="pd-pill" style="background:rgba(29,184,138,0.14);color:var(--teal)">BOOKED</span>'}<span style="font-variant-numeric:tabular-nums;min-width:64px;text-align:right">${fmt(x.b.payout || 0)}</span></div>`
        : `<div><span style="width:8px;height:8px;border-radius:50%;background:${PROP_DAY_TYPES.personal.bar};flex:none"></span><p>Owners <small>${shortDay(x.run.from)}–${shortDay(addDaysIso(x.run.to, 1))} · private use</small></p><span style="min-width:64px;text-align:right;color:var(--text3)">—</span></div>`).join('') : '<div><p>Nothing booked.</p></div>'}</div></div>
  </div>
  <div class="pd-grid">
    <div class="card pd-6"><div class="pd-ct">Bookings this tax year</div>
      ${propRow('Completed', `${c.count} · ${c.nights} nights`)}
      ${propRow('Upcoming', `${uu.count} · ${uu.nights} nights`)}
      ${propRow('Gross earnings', fmt(c.gross + uu.gross))}
      ${propRow('GST flat-rate credit', fmt(c.hostTax + uu.hostTax))}
      ${(c.adjustments + uu.adjustments) ? propRow('Adjustments', fmtSigned(c.adjustments + uu.adjustments)) : ''}
      ${propRow('Platform service fees', '−' + fmt(c.fees + uu.fees))}
      ${propRow('<strong>Paid / to be paid to you</strong>', `<strong>${fmt(c.payout + uu.payout)}</strong>`)}</div>
    ${rv ? '' : `<div class="card pd-6" style="display:flex;align-items:center;gap:10px">
      <div style="flex:1;font-size:13px;color:var(--text2)">Paid for something for the property from a personal account? Put it in your personal "${escH(linkedCat || s.name)}" category and it will show up in Review.</div>
      <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="setPropTab('review')">Review</button></div>`}
  </div>`;
}
function propDrawCharts() {
  Object.keys(propCharts).forEach(k => { try { propCharts[k].destroy(); } catch (e) {} delete propCharts[k]; });
  const d = propChartData; if (!d || !window.Chart) return;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
  const teal = css('--teal'), red = css('--red'), blue = css('--blue'), text3 = css('--text3'), grid = css('--chart-grid');
  const alpha = (hex, a) => { const n = parseInt(hex.replace('#', ''), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const k = v => (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1000 ? Math.round(Math.abs(v) / 100) / 10 + 'k' : Math.round(Math.abs(v)));
  const mk = (id, cfg) => { const el = document.getElementById(id); if (el) propCharts[id] = new Chart(el, cfg); };
  const fade = (c, m) => m.fc === true ? alpha(c, 0.35) : c;
  mk('pd-flow', { type: 'bar', data: { labels: d.months.map(m => m.label), datasets: [
      { label: 'In', data: d.months.map(m => round2(m.inn)), backgroundColor: d.months.map(m => fade(teal, m)), borderRadius: 4, stack: 's' },
      { label: 'Out', data: d.months.map(m => -round2(m.out)), backgroundColor: d.months.map(m => fade(red, m)), borderRadius: 4, stack: 's' }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(Math.abs(c.raw))}${d.months[c.dataIndex].fc === true ? ' (forecast)' : ''}` } } },
      scales: { x: { stacked: true, grid: { display: false }, ticks: { color: text3, maxRotation: 0, autoSkip: false, font: { size: 10 } } },
        y: { stacked: true, grid: { color: grid }, ticks: { color: text3, callback: k } } } } });
  mk('pd-occ', { type: 'doughnut', data: { datasets: [{ data: [d.occ, 100 - d.occ], backgroundColor: [teal, css('--bg3')], borderWidth: 0 }] },
    options: { cutout: '74%', animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
  const pal = [teal, blue, css('--amber'), '#9b59b6', '#e8484e', '#e0951b', '#5bc0be'];
  if (d.lines.length) {
    mk('pd-exp', { type: 'doughnut', data: { labels: d.lines.map(l => l.label), datasets: [{ data: d.lines.map(l => round2(l.amount)), backgroundColor: pal, borderWidth: 0 }] },
      options: { cutout: '62%', animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.label}: ${fmt(c.raw)}` } } } } });
    const leg = document.getElementById('pd-exp-leg');
    if (leg) leg.innerHTML = d.lines.slice(0, 6).map((l, i) => `<div style="display:flex;justify-content:space-between;gap:8px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${pal[i]};margin-right:6px"></i>${escH(l.label)}</span><b style="color:var(--text);font-variant-numeric:tabular-nums">${fmt(l.amount)}</b></div>`).join('');
  }
  if (d.bal) mk('pd-bal', { type: 'line', data: { labels: d.bal.map(b => b.label), datasets: [{ data: d.bal.map(b => b.v), borderColor: blue, backgroundColor: alpha(blue, 0.12), fill: true, tension: 0.3, pointRadius: 0,
      segment: { borderDash: c => d.bal[c.p1DataIndex]?.fc ? [5, 4] : undefined } }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) + (d.bal[c.dataIndex].fc ? ' (forecast)' : '') } } },
      scales: { x: { grid: { display: false }, ticks: { color: text3, font: { size: 10 } } }, y: { grid: { color: grid }, ticks: { color: text3, callback: k } } } } });
}
function propHomeHtml(s) {
  const y = propYearSummary(s.id, propTaxYear);
  const c = y.completed, u = y.upcoming;
  const bookedNights = c.nights + u.nights;
  const occ = y.daysInYear ? Math.round(bookedNights / y.daysInYear * 100) : 0;
  const today = todayLocal();
  const next = bookings.filter(b => b.streamId===s.id && !b.cancelled && b.checkIn >= today).sort((a,b)=>a.checkIn.localeCompare(b.checkIn))[0];
  const futurePayout = bookings.filter(b => b.streamId===s.id && !b.cancelled && b.status==='upcoming').reduce((a,b)=>a+b.payout, 0);
  const has = bookings.some(b => b.streamId===s.id);
  const linkedCat = propPersonalCat(s);
  const reviewCount = linkedCat ? transactions.filter(t => (t.stream||'personal')==='personal' && t.cat===linkedCat && t.propReviewed!==s.id).length : 0;
  const reviewCard = reviewCount ? `<div class="card" style="display:flex;align-items:center;gap:10px;border-color:var(--teal)">
      <div style="flex:1;font-size:13px">${reviewCount} personal "${escH(linkedCat)}" transaction${reviewCount===1?'':'s'} may belong to this property.</div>
      <button class="btn btn-primary" style="padding:6px 12px;font-size:12px" onclick="setPropTab('review')">Review</button></div>` : '';
  if (!has) return `${propYearNavHtml()}${reviewCard}<div class="card" style="text-align:center;padding:24px 20px">
    <div style="font-size:13px;color:var(--text3);margin-bottom:14px">No bookings yet. Import your Airbnb or Bookabach CSVs to get started.</div>
    <button class="btn btn-primary" onclick="setPropTab('bookings')">Go to Bookings</button></div>`;
  const pnl = computePropPnL(s, propTaxYear);
  return `${propYearNavHtml()}${reviewCard}
    <div class="metrics">
      <div class="metric"><div class="metric-label">Rent received</div><div class="metric-value pos" style="font-size:17px">${fmt(pnl.rent)}</div></div>
      <div class="metric"><div class="metric-label">Expenses</div><div class="metric-value neg" style="font-size:17px">${fmt(pnl.totalExpenses)}</div></div>
      <div class="metric"><div class="metric-label">Net profit${pnl.hasUpcoming?' (forecast)':''}</div><div class="metric-value ${pnl.net>=0?'pos':'neg'}" style="font-size:17px">${fmtSigned(pnl.net)}</div></div>
      <div class="metric"><div class="metric-label">Occupancy</div><div class="metric-value" style="font-size:17px">${occ}% · ${bookedNights} nts</div></div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">This tax year</div>
      ${propRow('Completed bookings', `${c.count} · ${c.nights} nights`)}
      ${propRow('Upcoming bookings', `${u.count} · ${u.nights} nights`)}
      ${propRow('Gross earnings', fmt(c.gross + u.gross))}
      ${propRow('GST flat-rate credit', fmt(c.hostTax + u.hostTax))}
      ${(c.adjustments + u.adjustments) ? propRow('Adjustments', fmtSigned(c.adjustments + u.adjustments)) : ''}
      ${propRow('Platform service fees', '−' + fmt(c.fees + u.fees))}
      ${propRow('<strong>Paid / to be paid to you</strong>', `<strong>${fmt(c.payout + u.payout)}</strong>`)}
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Stays that cross 31 March are split between tax years by night.</div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Coming up</div>
      ${propRow('Next check-in', next ? `${fmtDay(next.checkIn)} · ${next.nights} night${next.nights===1?'':'s'}` : 'None booked')}
      ${propRow('All upcoming payouts', fmt(futurePayout))}
    </div>
    ${reviewCount ? '' : `<div class="card" style="display:flex;align-items:center;gap:10px">
      <div style="flex:1;font-size:13px;color:var(--text2)">Paid for something for the property from a personal account? Put it in your personal "${escH(linkedCat || s.name)}" category and it will show up here to review.</div>
      <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="setPropTab('review')">Review</button></div>`}`;
}
function propRow(label, val) {
  return `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:13px"><span style="color:var(--text2);min-width:0">${label}</span><span style="text-align:right;white-space:nowrap">${val}</span></div>`;
}

function propBookingsHtml(s) {
  const {start, end} = taxYearRange(propTaxYear);
  const list = bookings.filter(b => b.streamId===s.id && b.checkIn < end && (b.checkOut || b.checkIn) > start)
    .sort((a,b) => a.checkIn.localeCompare(b.checkIn));
  const up = list.filter(b => b.status==='upcoming');
  const done = list.filter(b => b.status==='completed').reverse();
  const matches = computePayoutMatches(s);
  const {start: ys, end: ye} = taxYearRange(propTaxYear);
  const yrPayouts = propPayouts.filter(p => p.streamId===s.id && p.date >= ys && p.date < ye);
  const missingPayouts = yrPayouts.filter(p => !matches.payoutTxn.has(p.id));
  const bankCard = yrPayouts.length ? `<div class="card">
      <div class="card-title" style="margin-bottom:6px">Payouts in the bank</div>
      ${propRow('Platform payouts this tax year',`${yrPayouts.length} · ${fmt(yrPayouts.reduce((a,p)=>a+p.amount,0))}`)}
      ${propRow('Found in your bank transactions', `<span style="color:var(--teal)">${yrPayouts.length - missingPayouts.length}</span>`)}
      ${propRow('Not found', missingPayouts.length ? `<span style="color:var(--red,#e5484d)">${missingPayouts.length} · ${fmt(missingPayouts.reduce((a,p)=>a+p.amount,0))}</span>` : '0')}
      ${missingPayouts.length ? `<div style="font-size:11px;color:var(--text3);margin-top:8px">Not found: ${missingPayouts.slice(0,8).map(p=>`${fmtDay(p.arriveBy||p.date)} ${fmt(p.amount)}`).join(', ')}${missingPayouts.length>8?'…':''}. Import the bank statement for the account the platform pays into to match these.</div>` : ''}
    </div>` : '';
  const row = b => { const bank = bookingBankStatus(b, matches); return `<div onclick="openBookingDetail('${escH(b.id)}')" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid var(--border);cursor:pointer;${b.cancelled?'opacity:0.45':''}">
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:500">${fmtDay(b.checkIn)} · ${b.nights} night${b.nights===1?'':'s'}${b.cancelled?' · <span style="color:var(--red,#e5484d)">cancelled?</span>':''}${bank==='found'?' <span title="Payout found in bank" style="color:var(--teal);font-size:12px">✓ bank</span>':bank==='missing'?' <span title="Payout not found in bank" style="color:var(--red,#e5484d);font-size:12px">⚠ bank</span>':''}</div>
        <div style="font-size:12px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(platformName(b.platform))} · ${escH(b.guest || b.code)}</div>
      </div>
      <div style="text-align:right"><div style="font-size:14px;font-weight:600">${fmt(b.payout)}</div><div style="font-size:11px;color:var(--text3)">gross ${fmt(b.gross)}</div></div>
    </div>`; };
  return `<div class="card">
      <div class="card-title" style="margin-bottom:6px">Import bookings</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px"><strong>Airbnb:</strong> export the completed (paid) and upcoming (pending) earnings CSVs. <strong>Bookabach:</strong> export the payout summary report. The platform and type are detected automatically, and re-importing updates bookings rather than duplicating them.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="document.getElementById('prop-csv-input').click()">Import Airbnb CSV</button>
        <button class="btn btn-primary" onclick="document.getElementById('prop-csv-input').click()">Import Bookabach CSV</button>
      </div>
    </div>
    ${propYearNavHtml()}
    ${bankCard}
    <div class="card"><div class="card-title" style="margin-bottom:4px">Upcoming (${up.length})</div>${up.length ? up.map(row).join('') : '<div class="empty" style="padding:8px 0">None in this tax year</div>'}</div>
    <div class="card"><div class="card-title" style="margin-bottom:4px">Completed (${done.length})</div>${done.length ? done.map(row).join('') : '<div class="empty" style="padding:8px 0">None in this tax year</div>'}</div>`;
}

function openBookingDetail(id) {
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  document.getElementById('modal-title').textContent = `${platformName(b.platform)} · ${b.code}`;
  document.getElementById('modal-body').innerHTML = `
    ${propRow('Guest', escH(b.guest || '—'))}
    ${propRow('Status', b.cancelled ? 'Possibly cancelled' : (b.status==='completed' ? 'Completed (paid)' : 'Upcoming'))}
    ${propRow('Booked', fmtDay(b.bookedOn))}
    ${propRow('Stay', `${fmtDay(b.checkIn)} → ${fmtDay(b.checkOut)} (${b.nights} night${b.nights===1?'':'s'})`)}
    ${propRow('Gross earnings', fmt(b.gross))}
    ${b.cleaningFee ? propRow('&nbsp;&nbsp;incl. cleaning fee', fmt(b.cleaningFee)) : ''}
    ${propRow('Service fee', '−' + fmt(b.serviceFee))}
    ${propRow(b.platform === 'airbnb' ? 'Host Remitted Tax (GST flat-rate credit)' : 'GST flat-rate credit', fmt(b.hostTax))}
    ${b.adjustments ? propRow('Adjustments', fmtSigned(b.adjustments)) : ''}
    ${propRow('<strong>Payout</strong>', `<strong>${fmt(b.payout)}</strong>`)}
    ${b.platformTax ? propRow('GST remitted by platform (info)', fmt(b.platformTax)) : ''}
    ${(b.payments||[]).length > 1 ? `<div style="font-size:12px;color:var(--text3);margin-top:8px">Paid in ${b.payments.length} parts: ${b.payments.map(p=>`${fmtDay(p.date)} ${fmt(p.amount)}`).join(' · ')}</div>` : ''}`;
  const btn = document.getElementById('modal-confirm');
  btn.textContent = 'Delete booking';
  btn.onclick = () => {
    if (!confirm('Delete this booking? Re-importing the CSV will bring it back.')) return;
    bookings = bookings.filter(x => x.id !== id);
    tombstone('bookings', id);
    closeModal(); renderProperty(); scheduleSave();
  };
  document.getElementById('modal').classList.add('open');
}

// ── Money: report lines, payout matching, P&L ──
// Every category on the property's stream maps to one line of the
// accountant's Statement of Profit or Loss (or to income / transfer). Stored
// per property as catLines[categoryName]; unmapped categories get a guess
// from their name, which the user can override in Setup.
const PROP_LINES = [
  {id:'income',      label:'Rental income (bank deposits)', kind:'income'},
  {id:'transfer',    label:'Transfer (not income or expense)', kind:'none'},
  {id:'commissions', label:'Commissions',              kind:'expense'},
  {id:'insurance',   label:'Insurance',                kind:'expense'},
  {id:'interest',    label:'Interest on loans',        kind:'expense'},
  {id:'power',       label:'Light, power & heating',   kind:'expense'},
  {id:'management',  label:'Management fees',          kind:'expense'},
  {id:'purchases',   label:'Purchases & consumables',  kind:'expense'},
  {id:'rates',       label:'Rates',                    kind:'expense'},
  {id:'rm',          label:'Repairs & maintenance',    kind:'expense'},
  {id:'phone',       label:'Telephone & internet',     kind:'expense'},
  {id:'cleaning',    label:'Cleaning',                 kind:'expense'},
  {id:'travel',      label:'Travel',                   kind:'expense'},
  {id:'accountancy', label:'Accountancy',              kind:'expense'},
  {id:'homeoffice',  label:'Home office',              kind:'expense'},
  {id:'other',       label:'Other expenses',           kind:'expense'},
];
// Home office: a share (office area / house floor area) of the household's own
// running costs -- picked personal categories, such as power, internet, rates,
// house insurance and mortgage interest. Not cut by the mixed-use share.
function propHomeOfficeForYear(s, ty) {
  const ho = propSettings(s).homeOffice || {};
  const pct = Number(ho.pct) || 0;
  const cats = ho.cats || [];
  const { start, end } = taxYearRange(ty);
  // A category can be narrowed by words in the description (e.g. only the house
  // insurer within Insurance), and single transactions can be left out (a car policy
  // paid to the same insurer).
  const excluded = new Set(ho.excluded || []);
  const byCat = cats.map(name => {
    const words = String((ho.filters || {})[name] || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
    const all = transactions.filter(t => (t.stream || 'personal') === 'personal' && t.cat === name && (d => d >= start && d < end)(dateToIso(t.date)))
      .sort((a, b) => a.date - b.date);
    const matching = words.length ? all.filter(t => words.some(w => `${t.desc || ''} ${t.detail || ''}`.toLowerCase().includes(w))) : all;
    const txns = matching.filter(t => !excluded.has(t.id));
    return { name, words, all, matching, txns, total: round2(-txns.reduce((a, t) => a + t.amount, 0)) };
  });
  byCat.forEach(c => { if (c.name === ho.loanCat) { c.loan = propLoanInterest(ho, c.txns, start, end); if (c.loan) { c.paid = c.total; c.total = c.loan.total; } } });
  const extra = Number((ho.extra || {})[ty]) || 0;
  const total = round2(byCat.reduce((a, c) => a + c.total, 0) + extra);
  return { pct, cats, byCat, extra, total, value: round2(total * pct / 100) };
}
// Mortgage repayments in a personal category are principal plus interest, and
// only the interest is a household cost. Interest lines come from the loan
// accounts' own statements (loaded in the home office window, kept apart from
// the personal transactions so budgets still see the full repayment). Up to
// the last statement date the interest is taken as charged; repayments after
// it are cut by the interest share seen in the statements, so a statement
// loaded monthly or once at year end both work.
function propLoanInterest(ho, txns, start, end) {
  const loans = (ho.loans || []).filter(l => (l.recs || []).length);
  if (!loans.length) return null;
  const coveredTo = loans.map(l => l.recs.reduce((m, r) => r.date > m ? r.date : m, '')).sort()[0];
  // From the start of the month of the first statement line, so the
  // repayment that month is matched with the interest charged in it.
  const firstRec = loans.map(l => l.recs.reduce((m, r) => !m || r.date < m ? r.date : m, '')).sort().pop().slice(0, 8) + '01';
  const recs = loans.flatMap(l => l.recs.map(r => ({ ...r, loan: l.name }))).filter(r => r.date >= start && r.date < end && r.date <= coveredTo)
    .sort((a, b) => a.date.localeCompare(b.date));
  const interest = round2(recs.reduce((a, r) => a + r.interest, 0));
  const paidOf = list => -list.reduce((a, t) => a + t.amount, 0);
  const before = txns.filter(t => dateToIso(t.date) <= coveredTo), after = txns.filter(t => dateToIso(t.date) > coveredTo);
  const paidCovered = paidOf(before.filter(t => dateToIso(t.date) >= firstRec)), paidAfter = paidOf(after);
  // Interest share of repayments over the months both are known.
  const intCovered = recs.filter(r => r.date >= firstRec).reduce((a, r) => a + r.interest, 0);
  let ratio = paidCovered > 0 ? intCovered / paidCovered : null;
  if (ratio == null) {
    const all = loans.flatMap(l => l.recs), paid = paidOf(transactions.filter(t => t.cat === ho.loanCat && (t.stream || 'personal') === 'personal' && (d => d >= firstRec && d <= coveredTo)(dateToIso(t.date))));
    ratio = paid > 0 ? all.filter(r => r.date >= firstRec).reduce((a, r) => a + r.interest, 0) / paid : null;
  }
  if (ratio != null) ratio = Math.min(1, Math.max(0, ratio));
  const estimate = paidAfter > 0 && ratio != null ? round2(paidAfter * ratio) : 0;
  return { recs, interest, coveredTo: coveredTo < end ? coveredTo : addDaysIso(end, -1), paidAfter: round2(paidAfter), ratio, estimate, unknown: paidAfter > 0 && ratio == null ? round2(paidAfter) : 0,
    total: round2(interest + estimate + (paidAfter > 0 && ratio == null ? paidAfter : 0)) };
}
// Regular payments: costs that should turn up on a schedule (rates monthly,
// mortgage fortnightly). Each is a report line or a personal category, can be
// narrowed by words in the description (e.g. one insurer within Insurance), and is
// checked for gaps in the tax year -- usually a sign of a missing import or a
// transaction coded somewhere else. Stored as property.regular[].
const PROP_FREQS = [
  { id:'weekly',      label:'Weekly',      days:7 },
  { id:'fortnightly', label:'Fortnightly', days:14 },
  { id:'monthly',     label:'Monthly',     days:30.44,  months:1 },
  { id:'quarterly',   label:'Quarterly',   days:91.31,  months:3 },
  { id:'annual',      label:'Yearly',      days:365.25, months:12 },
];
const addDaysIso = (iso, n) => { const d = isoToDate(iso); d.setDate(d.getDate() + Math.round(n)); return dateToIso(d); };
// Moves i periods on from a date: whole calendar months for monthly and
// longer (day clamped to the month's end), days otherwise.
const addPeriodsIso = (iso, f, i) => {
  if (!f.months) return addDaysIso(iso, f.days * i);
  const d = isoToDate(iso), day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + f.months * i, 1);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return dateToIso(t);
};
function propRegularLabel(r) {
  const src = r.src || '';
  const name = src.startsWith('cat:') ? src.slice(4) : (PROP_LINES.find(l => l.id === src.slice(5))?.label || src);
  return name + (r.words ? ` · ${r.words}` : '');
}
function propRegularTxns(s, ty, r) {
  const { start, end } = taxYearRange(ty);
  const src = r.src || '';
  let list;
  if (src.startsWith('cat:')) {
    const name = src.slice(4);
    list = transactions.filter(t => (t.stream || 'personal') === 'personal' && t.cat === name && t.amount < 0 && (d => d >= start && d < end)(dateToIso(t.date)))
      .map(t => ({ date: dateToIso(t.date), amount: t.amount, text: `${t.desc || ''} ${t.detail || ''}` }));
  } else {
    const line = src.slice(5), income = propLineKind(line) === 'income';
    list = propTxnsInYear(s, ty).filter(t => propLineForTxn(s, t) === line && (income ? t.amount > 0 : t.amount < 0))
      .map(t => ({ date: dateToIso(t.date), amount: t.amount, text: `${t.desc || ''} ${t.detail || ''}` }))
      .concat(propCostsInYear(s, ty).filter(c => c.line === line).map(c => ({ date: c.date, amount: -(Number(c.amount) || 0), text: c.note || '' })));
  }
  const words = String(r.words || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
  if (words.length) list = list.filter(t => words.some(w => t.text.toLowerCase().includes(w)));
  return list.sort((a, b) => a.date.localeCompare(b.date));
}
// Finds the gaps: a payment is missing where the time between two found
// payments (or from the start of the year to the first, or from the last to
// today / year end) is more than the frequency allows.
function propRegularCheck(s, ty, r) {
  const f = PROP_FREQS.find(x => x.id === r.freq) || PROP_FREQS[2];
  const step = f.days, grace = Math.max(4, step * 0.25);
  const { start, end } = taxYearRange(ty);
  const today = todayLocal();
  const txns = propRegularTxns(s, ty, r);
  if (start > today) return { f, txns, missing: [], future: true, usual: 0 };
  const until = end <= today ? end : today;
  const dates = [...new Set(txns.map(t => t.date))];
  // A payment about twice the usual size covers one that was skipped (e.g.
  // August's rates paid with September's), so it fills the gap before it.
  const byDate = {}; txns.forEach(t => byDate[t.date] = (byDate[t.date] || 0) + Math.abs(t.amount));
  const amts = Object.values(byDate).sort((a, b) => a - b), usual = amts[Math.floor((amts.length - 1) / 2)] || 0;
  const covers = d => usual > 0 ? Math.max(1, Math.round(byDate[d] / usual)) - 1 : 0;
  const missing = [];
  if (!dates.length) {
    const n = Math.floor((daysBetween(start, until) - grace) / step + 0.5);
    for (let i = 0; i < n; i++) missing.push(addPeriodsIso(start, f, i));
    return { f, txns, missing, none: true, usual: 0 };
  }
  const lead = daysBetween(start, dates[0]);
  if (lead > step + grace) { const k = Math.floor((lead - grace) / step) - covers(dates[0]); for (let i = k; i >= 1; i--) missing.push(addPeriodsIso(dates[0], f, -i)); }
  for (let i = 1; i < dates.length; i++) {
    const gap = daysBetween(dates[i-1], dates[i]);
    if (gap > step * 1.5) { const k = Math.max(1, Math.round(gap / step) - 1) - covers(dates[i]); for (let j = 1; j <= k; j++) missing.push(addPeriodsIso(dates[i-1], f, j)); }
  }
  const last = dates[dates.length - 1], trail = daysBetween(last, until);
  if (trail > step + grace) { const k = Math.floor((trail - grace) / step); for (let i = 1; i <= k; i++) missing.push(addPeriodsIso(last, f, i)); }
  return { f, txns, missing, last, usual };
}
function propRegularCheckHtml(s) {
  const regs = propSettings(s).regular || [];
  const intro = `<div class="card-title" style="margin-bottom:4px">Regular payments check</div>`;
  if (!regs.length) return `<div class="card">${intro}<div style="font-size:12px;color:var(--text3)">Tell the app which costs come out on a schedule (rates monthly, mortgage fortnightly) and it will spot any that are missing this year. Set them up in <a href="#" onclick="setPropTab('setup');return false" style="color:var(--teal)">Setup → Regular payments</a>.</div></div>`;
  const fmtMiss = (d, f) => f.days >= 28 ? isoToDate(d).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' }) : '~' + fmtDay(d);
  let nMissing = 0;
  const rows = regs.map(r => {
    const c = propRegularCheck(s, propTaxYear, r);
    nMissing += c.missing.length;
    const found = `${c.txns.length} found${c.last ? ` · last ${fmtDay(c.last)}` : ''}`;
    const status = c.future ? '<span style="color:var(--text3)">year not started</span>'
      : c.missing.length ? `<span style="color:var(--red,#d64545)">⚠ ${c.missing.length} missing</span>`
      : c.txns.length ? '<span style="color:var(--green,#2ea043)">✓</span>' : '<span style="color:var(--text3)">none yet</span>';
    return `<div style="padding:7px 0;border-bottom:0.5px solid var(--border)">
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span style="min-width:0">${escH(propRegularLabel(r))} <span style="font-size:11px;color:var(--text3)">${c.f.label.toLowerCase()}</span></span><span style="white-space:nowrap">${status}</span></div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">${found}${c.missing.length ? ` · around ${c.missing.slice(0, 8).map(d => fmtMiss(d, c.f)).join(', ')}${c.missing.length > 8 ? '…' : ''}` : ''}</div>
    </div>`;
  }).join('');
  return `<div class="card">${intro}
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px">${nMissing ? 'Gaps usually mean an account isn\'t imported up to date, or the payment is coded to another category or left in Personal.' : 'Every regular payment is accounted for so far this year.'} <a href="#" onclick="setPropTab('setup');return false" style="color:var(--teal)">Change</a></div>
    ${rows}</div>`;
}
function propRegularSetupHtml(s) {
  const regs = propSettings(s).regular || [];
  const sel = 'background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;padding:6px 6px;min-width:0';
  const lineOpts = PROP_LINES.filter(l => !['travel', 'homeoffice'].includes(l.id));
  const srcSelect = (r, i) => `<select onchange="setPropRegular(${i},'src',this.value)" style="flex:1;${sel}">
      <optgroup label="${escH(s.name)} report lines">${lineOpts.map(l => `<option value="line:${l.id}" ${r.src === 'line:' + l.id ? 'selected' : ''}>${escH(l.label)}</option>`).join('')}</optgroup>
      <optgroup label="Personal categories">${CATS.map(c => `<option value="cat:${escH(c.name)}" ${r.src === 'cat:' + c.name ? 'selected' : ''}>${escH(c.name)}</option>`).join('')}</optgroup>
    </select>`;
  return `<div class="card">
    <div class="card-title" style="margin-bottom:4px">Regular payments</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Costs that come out on a schedule. The Tax tab checks each tax year for gaps. Add words to pick out one payee when a line has several, e.g. Insurance once with one insurer's name and again with another's.</div>
    ${regs.map((r, i) => `<div style="padding:8px 0;border-bottom:0.5px solid var(--border)">
      <div style="display:flex;gap:6px;margin-bottom:6px">${srcSelect(r, i)}
        <select onchange="setPropRegular(${i},'freq',this.value)" style="width:110px;${sel}">${PROP_FREQS.map(f => `<option value="${f.id}" ${r.freq === f.id ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
        <button class="btn btn-secondary" style="padding:4px 9px;font-size:12px" onclick="removePropRegular(${i})" aria-label="Remove">✕</button></div>
      <input type="text" value="${escH(r.words || '')}" placeholder="Only descriptions containing… (optional)" onchange="setPropRegular(${i},'words',this.value)" style="width:100%;box-sizing:border-box;${sel}">
    </div>`).join('')}
    <button class="btn btn-secondary btn-block" style="margin-top:10px" onclick="addPropRegular()">+ Add a regular payment</button>
  </div>`;
}
function updatePropRegular(fn) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  s.property = { ...p, regular: fn([...(p.regular || [])]) };
  scheduleSave(); renderProperty();
}
function addPropRegular() { updatePropRegular(list => [...list, { src: 'line:rates', freq: 'monthly', words: '' }]); }
function removePropRegular(i) { updatePropRegular(list => list.filter((_, j) => j !== i)); }
function setPropRegular(i, field, val) { updatePropRegular(list => { list[i] = { ...list[i], [field]: field === 'words' ? val.trim() : val }; return list; }); }

const PROP_LINE_GUESSES = [
  ['transfer',    /equity|transfer|top.?up|drawing|principal|saving/i],
  ['commissions', /commission|platform|service fee/i],
  ['income',      /income|rent|airbnb|booking|bach|guest/i],
  ['insurance',   /insur/i],
  ['interest',    /interest|mortgage/i],
  ['power',       /power|gas|electric|heat|lpg|firewood/i],
  ['rates',       /rates|water/i],
  ['phone',       /internet|phone|broadband|spark|wifi/i],
  ['cleaning',    /clean|laundry|linen/i],
  ['rm',          /repair|maint|r ?& ?m/i],
  ['purchases',   /purchase|homeware|consumable|furnish|supplies/i],
  ['management',  /manage/i],
  ['accountancy', /account/i],
  ['travel',      /travel|vehicle|fuel|mileage|petrol/i],
];
// A combined category such as "Rates & Insurance" (from the generic stream
// categories) can't go to one line, so it's split per transaction by its
// description: council or rates payments to Rates, everything else to Insurance.
const PROP_SPLIT_RATES_INS = 'ratesins';
function propLineForTxn(s, t) {
  const line = propLineFor(s, t.cat);
  if (line !== PROP_SPLIT_RATES_INS) return line;
  return /rate|council|regional|\bdc\b/i.test(`${t.desc || ''} ${t.detail || ''}`) ? 'rates' : 'insurance';
}
function guessPropLine(cat) {
  if (cat?.taxTreatment === 'income') return 'income';
  const name = cat?.name || '';
  if (/insur/i.test(name) && /rates/i.test(name)) return PROP_SPLIT_RATES_INS;
  for (const [line, re] of PROP_LINE_GUESSES) if (re.test(name)) return line;
  return 'other';
}
function propLineFor(s, catName) {
  const p = propSettings(s);
  if (p.catLines && p.catLines[catName]) return p.catLines[catName];
  return guessPropLine((s.cats || []).find(c => c.name === catName) || { name: catName });
}
const propLineKind = id => (PROP_LINES.find(l => l.id === id) || {kind:'expense'}).kind;

// Airbnb pays to whichever bank account the host chose -- often a personal
// one -- and the money may then be forwarded to the property account. Each
// payout is matched to the original deposit (any account, amount to the cent,
// around its arrival date), and then to a forwarded deposit of the same
// amount on the property's stream within the following month, so neither is
// mistaken for extra rent. Computed on the fly, never stored.
// Work-out-once cache for one draw of the Property screens: the same payout
// matches, P&L and checklist are asked for many times per screen (sidebar
// counts, header chip, dashboard, tax view). Only active inside renderProperty,
// so any change made afterwards is always worked out fresh.
let propCache = null;
function propCached(key, fn) {
  if (!propCache) return fn();
  if (!propCache.has(key)) propCache.set(key, fn());
  return propCache.get(key);
}
function computePayoutMatches(s) { return propCached('pm:' + s.id, () => computePayoutMatchesRaw(s)); }
function computePayoutMatchesRaw(s) {
  const payoutTxn = new Map();     // payout id -> original deposit txn
  const matchedTxnIds = new Set(); // every txn explained by a payout
  const cents = n => Math.round(n * 100);
  const pos = transactions.filter(t => t.amount > 0);
  const byCents = new Map();
  pos.forEach(t => { const k = cents(t.amount); if (!byCents.has(k)) byCents.set(k, []); byCents.get(k).push(t); });
  const payouts = propPayouts.filter(p => p.streamId === s.id && p.amount > 0).sort((a,b) => (a.date||'').localeCompare(b.date||''));
  const manual = new Set();
  // Deposits matched by hand (on the Payouts page) win over the automatic match.
  payouts.filter(p => p.linkTxn != null).forEach(p => {
    const t = transactions.find(x => x.id === p.linkTxn);
    if (!t || matchedTxnIds.has(t.id)) return;
    payoutTxn.set(p.id, t); matchedTxnIds.add(t.id); manual.add(p.id);
    if (t.stream !== s.id) {
      const od = dateToIso(t.date), fe = addDaysIso(od, 31);
      const fwd = (byCents.get(cents(t.amount)) || []).filter(x => x !== t && x.stream === s.id && !matchedTxnIds.has(x.id) && dateToIso(x.date) >= addDaysIso(od, -5) && dateToIso(x.date) <= fe).sort((a, b) => a.date - b.date)[0];
      if (fwd) matchedTxnIds.add(fwd.id);
    }
  });
  payouts.forEach(p => {
    if (manual.has(p.id) || p.linkTxn != null && payoutTxn.has(p.id)) return;
    const rejected = new Set(p.rejectTxn || []);
    const cands = (byCents.get(cents(p.amount)) || []).filter(t => !matchedTxnIds.has(t.id) && !rejected.has(t.id));
    const lo = addDaysIso(p.date, -3), hiD = isoToDate(p.arriveBy || p.date); hiD.setDate(hiD.getDate() + 7);
    const hi = dateToIso(hiD);
    const inWin = cands.filter(t => { const d = dateToIso(t.date); return d >= lo && d <= hi; }).sort((a, b) => a.date - b.date);
    let orig = inWin.find(t => /airbnb|payoneer|bookabach|vrbo|homeaway|expedia/i.test((t.desc||'') + ' ' + (t.detail||''))) || inWin.find(t => t.stream !== s.id) || inWin[0];
    // Paid into another account that isn't imported, then moved across to the
    // property account later: take a deposit there up to a month on.
    if (!orig) {
      const late = addDaysIso(p.arriveBy || p.date, 31);
      orig = cands.filter(t => t.stream === s.id && (d => d >= lo && d <= late)(dateToIso(t.date))).sort((a, b) => a.date - b.date)[0];
    }
    if (!orig) return;
    payoutTxn.set(p.id, orig);
    matchedTxnIds.add(orig.id);
    if (orig.stream !== s.id) {
      const od = dateToIso(orig.date), fwdEnd = new Date(orig.date); fwdEnd.setDate(fwdEnd.getDate() + 31);
      const fe = dateToIso(fwdEnd);
      // Earliest forward first, so two same-amount payouts a week apart each
      // pair with their own forward rather than the first taking the second's.
      // A transfer made a few days ahead of the payout (topping the property
      // account up before the platform pays) counts too.
      const fwd = cands.filter(t => t !== orig && t.stream === s.id && !matchedTxnIds.has(t.id) && dateToIso(t.date) >= addDaysIso(od, -5) && dateToIso(t.date) <= fe)
        .sort((a, b) => a.date - b.date)[0];
      if (fwd) matchedTxnIds.add(fwd.id);
    }
  });
  return { payoutTxn, matchedTxnIds, manual };
}
// Why a payout wasn't matched: a deposit of the same amount outside the date
// window, or one already matched to another payout (often a duplicate).
function propPayoutMissReason(s, p, matches) {
  const c = Math.round(p.amount * 100);
  const near = transactions.filter(t => t.amount > 0 && Math.round(t.amount * 100) === c && Math.abs(daysBetween(p.arriveBy || p.date, dateToIso(t.date))) <= 45)
    .sort((a, b) => Math.abs(daysBetween(p.date, dateToIso(a.date))) - Math.abs(daysBetween(p.date, dateToIso(b.date))));
  if (!near.length) return 'no deposit of that amount in the bank';
  const t = near[0], d = dateToIso(t.date);
  const other = [...matches.payoutTxn.entries()].find(([, x]) => x.id === t.id);
  if (other) {
    const op = propPayouts.find(x => x.id === other[0]);
    return `the ${fmtDay(d)} deposit is already matched to another ${fmt(p.amount)} payout${op ? ` dated ${fmtDay(op.date)}` : ''}${op && op.date === p.date ? ', so this looks like a duplicate' : ''}`;
  }
  if (matches.matchedTxnIds.has(t.id)) return `the ${fmtDay(d)} deposit is already counted as the transfer of another ${fmt(p.amount)} payout, so this looks like a duplicate`;
  return `a deposit on ${fmtDay(d)} is outside the dates allowed (paid ${fmtDay(p.date)}, due ${fmtDay(p.arriveBy || p.date)})`;
}
// A booking is "in the bank" when every payment date it was paid on has a
// payout that was matched to a deposit.
function bookingBankStatus(b, matches) {
  if (b.status !== 'completed' || b.cancelled) return null;
  const pays = propPayouts.filter(p => p.streamId === b.streamId);
  const ok = (b.payments || []).every(pm => pays.some(p => p.date === pm.date && matches.payoutTxn.has(p.id)));
  return ok ? 'found' : 'missing';
}

function propTxnsInYear(s, ty) {
  const { start, end } = taxYearRange(ty);
  return transactions.filter(t => t.stream === s.id && (d => d >= start && d < end)(dateToIso(t.date)));
}
// Forecast to 31 March (current tax year only): what's still to come is added
// to each line --
//  * regular payments: the remaining ones (and any missing) at their usual amount;
//  * other costs: up to last year's total for the line, if not reached yet;
//  * rent: booked stays only (already in the P&L);
//  * home office: the same per household category, and the typed-in extra
//    (year to date) scaled up to a full year.
let propForecast = true;
const isoYearsAgo = (iso, n) => `${Number(iso.slice(0, 4)) - n}${iso.slice(4)}`;
function propRegularProjection(s, ty, r) {
  const c = propRegularCheck(s, ty, r);
  const { end } = taxYearRange(ty), today = todayLocal();
  if (!c.usual) {
    const prev = round2(-propRegularTxns(s, ty - 1, r).reduce((a, t) => a + t.amount, 0));
    return { amount: Math.max(0, prev - round2(-c.txns.reduce((a, t) => a + t.amount, 0))), how: `last year's total of ${fmt(prev)}` };
  }
  let future = 0;
  for (let i = 1; i < 400; i++) { const d = addPeriodsIso(c.last, c.f, i); if (d >= end) break; if (d >= today) future++; }
  const n = future + c.missing.length;
  return { amount: round2(n * c.usual), how: `${n} more ${c.f.label.toLowerCase()} payment${n === 1 ? '' : 's'} of ${fmt(c.usual)}${c.missing.length ? ` (incl. ${c.missing.length} missing)` : ''}` };
}
function propForecastAdds(s, ty, matches, cur) {
  const { start, end } = taxYearRange(ty), today = todayLocal();
  if (!(today >= start && today < end)) return null;
  const last = computePropPnL(s, ty - 1, matches);
  const lastFull = {}; last.expenseLines.forEach(l => lastFull[l.id] = l.full);
  const regs = propSettings(s).regular || [];
  const lines = {}, items = [];
  const put = (line, label, amount, how) => { if (amount < 0.5) return; lines[line] = (lines[line] || 0) + amount; items.push({ line, label, amount: round2(amount), how }); };
  const lineLabel = id => PROP_LINES.find(l => l.id === id)?.label || id;
  // Report lines
  const covered = new Set(regs.filter(r => (r.src || '').startsWith('line:')).map(r => r.src.slice(5)));
  regs.filter(r => (r.src || '').startsWith('line:') && propLineKind(r.src.slice(5)) === 'expense').forEach(r => {
    const pr = propRegularProjection(s, ty, r);
    put(r.src.slice(5), propRegularLabel(r), pr.amount, pr.how);
  });
  // Other lines: the larger of what was spent over the same months last year
  // and what's needed to reach last year's total (catches one-off yearly bills).
  const lwStart = isoYearsAgo(today, 1), lwEnd = isoYearsAgo(end, 1), inLw = d => d >= lwStart && d < lwEnd;
  last.expenseLines.forEach(l => {
    const id = l.id;
    if (covered.has(id) || id === 'homeoffice' || id === 'depreciation') return;
    const win = -l.txns.filter(t => inLw(dateToIso(t.date))).reduce((a, t) => a + t.amount, 0) + l.costs.filter(c => inLw(c.date)).reduce((a, c) => a + (Number(c.amount) || 0), 0);
    const topUp = l.full - (cur.lines[id] || 0);
    if (win >= topUp) put(id, lineLabel(id), win, `same months last year`);
    else put(id, lineLabel(id), topUp, `to reach last year's ${fmt(l.full)}`);
  });
  // Home office
  const ho = cur.homeOffice;
  if (ho.pct) {
    let hoAdd = 0; const hoHow = [];
    ho.byCat.forEach(c => {
      const reg = regs.find(r => r.src === 'cat:' + c.name);
      let a = 0;
      if (reg) a = propRegularProjection(s, ty, reg).amount * (c.loan && c.loan.ratio != null ? c.loan.ratio : 1);
      else a = Math.max(0, (last.homeOffice.byCat.find(x => x.name === c.name)?.total || 0) - c.total);
      if (a >= 0.5) { hoAdd += a; hoHow.push(`${c.name} ${fmt(a)}`); }
    });
    if (ho.extra) {
      const elapsed = Math.max(1, daysBetween(start, today)), a = ho.extra * daysBetween(start, end) / elapsed - ho.extra;
      if (a >= 0.5) { hoAdd += a; hoHow.push(`other household costs scaled to a full year ${fmt(a)}`); }
    }
    put('homeoffice', 'Home office', hoAdd * ho.pct / 100, `${ho.pct}% of ${hoHow.join(', ') || 'nothing more'}`);
  }
  // Rent: only stays already booked (counted by the P&L itself) -- guessing
  // at future bookings would be wrong whenever the owners block dates out.
  const rent = { income: 0, fees: 0 };
  return { asAt: today, lines, items, rent, total: round2(items.reduce((a, i) => a + i.amount, 0)) };
}
function computePropPnL(s, ty, matches, opts = {}) {
  const pm = computePayoutMatches(s);
  if (matches && matches !== pm) return computePropPnLRaw(s, ty, matches, opts);
  return propCached(`pnl:${s.id}:${ty}:${opts.forecast ? 1 : 0}:${opts.noChain ? 1 : 0}`, () => computePropPnLRaw(s, ty, pm, opts));
}
function computePropPnLRaw(s, ty, matches = computePayoutMatches(s), opts = {}) {
  const y = propYearSummary(s.id, ty);
  const c = y.completed, u = y.upcoming;
  const lines = {}; PROP_LINES.forEach(l => lines[l.id] = 0);
  const lineTxns = {}; PROP_LINES.forEach(l => lineTxns[l.id] = []);
  let otherIncome = 0; const otherIncomeTxns = [];
  propTxnsInYear(s, ty).forEach(t => {
    const line = propLineForTxn(s, t);
    const kind = propLineKind(line);
    if (kind === 'none') return;
    if (kind === 'income') {
      if (matches.matchedTxnIds.has(t.id)) return; // already counted via the booking
      otherIncome += t.amount; otherIncomeTxns.push(t);
      return;
    }
    lines[line] += -t.amount; // expenses are negative amounts; refunds reduce the line
    lineTxns[line].push(t);
  });
  // Costs entered by hand (paid from an account the app doesn't have).
  const lineCosts = {}; PROP_LINES.forEach(l => lineCosts[l.id] = []);
  propCostsInYear(s, ty).forEach(c => {
    if (lines[c.line] == null) return;
    lines[c.line] += Number(c.amount) || 0;
    lineCosts[c.line].push(c);
  });
  // Calendar: logged trips (valued at the IRD km rate) and paid cleans.
  const trav = propTravelForYear(s, ty);
  lines.travel += trav.value;
  const cleanCost = propDaysInYear(s, ty, 'cleaning').reduce((a, d) => a + (Number(d.cost) || 0), 0);
  lines.cleaning += cleanCost;
  const homeOffice = propHomeOfficeForYear(s, ty);
  lines.homeoffice += homeOffice.value;
  const fc = opts.forecast ? propForecastAdds(s, ty, matches, { lines, homeOffice }) : null;
  if (fc) Object.entries(fc.lines).forEach(([k, v]) => lines[k] += v);
  // Mixed-use basis: shared holding costs are cut to the income-use share;
  // costs incurred only to earn income (fees, cleaning, travel to service
  // guests, management, accountancy) stay at 100%.
  const usage = propUsageForYear(s, ty);
  const basis = propBasisFor(s, ty);
  const share = basis === 'mixeduse' ? (usage.share ?? 1) : basis === 'actualcost' ? usage.availShare : 1;
  // Under the mixed-use rules, rent from private use (a stay below 80% of
  // market rent) is exempt, so it and its platform fee come out.
  let privateRent = 0, privateFees = 0;
  if (basis === 'mixeduse') {
    const { start, end } = taxYearRange(ty);
    bookings.filter(b => b.streamId === s.id && !b.cancelled && b.belowMarket).forEach(b => {
      const r = bookingShareInRange(b, start, end); if (!r.share) return;
      privateRent += ((b.gross || 0) + (b.hostTax || 0) + (b.adjustments || 0)) * r.share;
      privateFees += (b.serviceFee || 0) * r.share;
    });
  }
  const apportioned = new Set(PROP_APPORTIONABLE);
  // Lines the owners claim in full anyway (e.g. repairs from guest use).
  (propSettings(s).fullLines || []).forEach(id => apportioned.delete(id));
  // Depreciation from the asset register; a loss on selling or scrapping an
  // asset is deductible, a gain (depreciation recovered) is income.
  const dep = propDepreciationForYear(s, ty);
  lines.depreciation = dep.depreciation + dep.loss;
  const bookingIncome = c.gross + u.gross + c.hostTax + u.hostTax + c.adjustments + u.adjustments + (fc ? fc.rent.income : 0) - privateRent;
  const rent = bookingIncome + otherIncome;
  const commissions = c.fees + u.fees + lines.commissions + (fc ? fc.rent.fees : 0) - privateFees;
  const expenseLines = [...PROP_LINES.filter(l => l.kind === 'expense' && l.id !== 'commissions'), { id: 'depreciation', label: 'Depreciation' }]
    .map(l => {
      const full = lines[l.id] || 0, cut = apportioned.has(l.id) && share < 1;
      let label = l.label;
      if (l.id === 'travel' && trav.trips) label += ` (${trav.trips} trip${trav.trips===1?'':'s'}, ${trav.km.toLocaleString('en-NZ')} km${trav.rateMissing?', no km rate set':''})`;
      if (l.id === 'depreciation' && dep.loss) label += ' (incl. loss on disposal)';
      if (l.id === 'homeoffice' && homeOffice.value) label += ` (${homeOffice.pct}% of household costs)`;
      return { id: l.id, label, amount: cut ? full * share : full, full, apportioned: cut, txns: lineTxns[l.id] || [], costs: lineCosts[l.id] || [], forecast: fc ? fc.lines[l.id] || 0 : 0 };
    });
  const depRecovered = dep.recovered * share;
  const totalExpenses = commissions + expenseLines.reduce((a, l) => a + l.amount, 0);
  const net = rent + depRecovered - totalExpenses;
  const mua = basis === 'mixeduse' && !opts.noChain && !opts.forecast ? propMuaStep(s, ty, { rent, net }, propMuaOpening(s, ty, matches)) : null;
  return {
    taxNet: mua ? mua.taxNet : net, mua,
    y, otherIncome, otherIncomeTxns, bookingIncome, rent, commissions, expenseLines, totalExpenses,
    net: rent + depRecovered - totalExpenses, depRecovered, dep, hasUpcoming: u.count > 0, travel: trav, homeOffice, usage, share, basis, forecast: fc, privateRent,
  };
}

// ── Cash flow: the property account month by month, 12 months ahead ──
// Starts from a balance the user types in (as at a date), adds anything
// imported for the account since, then projects:
//  * booked stays: the payout, the day after check-in;
//  * regular payments paid from the account: on schedule at the usual amount;
//  * other costs from the account: what went out the same month last year.
// Top-ups and other transfers aren't forecast -- the point is to see when one
// is needed.
let propCashOpen = null;
function propCashflow(s) {
  const p = propSettings(s), acc = p.accountId;
  if (!acc) return { noAccount: true };
  const today = todayLocal();
  const cb = p.cashBalance || {};
  if (cb.amount == null || cb.amount === '') return { noBalance: true, acc };
  const asAt = cb.date || today;
  // Imported since the balance date (after that day).
  const since = transactions.filter(t => t.account === acc && dateToIso(t.date) > asAt && dateToIso(t.date) <= today);
  const start = today, startBal = round2(Number(cb.amount) + since.reduce((a, t) => a + t.amount, 0));
  const m0 = isoToDate(today);
  const horizon = dateToIso(new Date(m0.getFullYear(), m0.getMonth() + 12, 1));
  const events = []; // {date, amount, label, kind: booked|forecast|regular|pattern}
  const inRange = d => d > start && d < horizon;
  // Booked stays not yet paid.
  bookings.filter(b => b.streamId === s.id && !b.cancelled && b.status !== 'completed' && b.checkIn).forEach(b => {
    const d = addDaysIso(b.checkIn, 1);
    const amt = Number(b.payout) || (Number(b.gross) - Number(b.serviceFee)) || 0;
    if (inRange(d) && amt) events.push({ date: d, amount: round2(amt), label: `${b.platform === 'bookabach' ? 'Bookabach' : 'Airbnb'} payout${b.guest ? ' · ' + b.guest : ''}`, kind: 'booked' });
  });
  // Regular payments from this account (personal-category ones aren't).
  const regs = (p.regular || []).filter(r => (r.src || '').startsWith('line:'));
  const regTxnIds = new Set();
  const accTxns = transactions.filter(t => t.account === acc && t.stream === s.id);
  regs.forEach(r => {
    const line = r.src.slice(5), words = String(r.words || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
    const match = t => propLineForTxn(s, t) === line && (!words.length || words.some(w => `${t.desc || ''} ${t.detail || ''}`.toLowerCase().includes(w)));
    const hist = accTxns.filter(match);
    hist.forEach(t => regTxnIds.add(t.id));
    const recent = hist.filter(t => t.amount < 0).sort((a, b) => b.date - a.date);
    if (!recent.length) return; // paid from another account
    const f = PROP_FREQS.find(x => x.id === r.freq) || PROP_FREQS[2];
    const lastDate = dateToIso(recent[0].date);
    const byDay = {}; recent.forEach(t => { const d = dateToIso(t.date); byDay[d] = (byDay[d] || 0) - t.amount; });
    const amts = Object.keys(byDay).sort().reverse().slice(0, 6).map(d => byDay[d]).sort((a, b) => a - b), usual = amts[Math.floor((amts.length - 1) / 2)];
    for (let i = 1; i < 800; i++) {
      const d = addPeriodsIso(lastDate, f, i); if (d >= horizon) break;
      if (inRange(d)) events.push({ date: d, amount: -round2(usual), label: propRegularLabel(r), kind: 'regular' });
    }
  });
  // Last year's pattern for everything else, and income deposits.
  const lyStart = isoYearsAgo(start, 1), lyEnd = isoYearsAgo(horizon, 1);
  const monthKey = d => d.slice(0, 7);
  const patt = {};
  accTxns.forEach(t => {
    const d = dateToIso(t.date);
    if (!(d > lyStart && d < lyEnd) || regTxnIds.has(t.id)) return;
    const kind = propLineKind(propLineForTxn(s, t));
    if (kind === 'none') return;
    const nd = isoYearsAgo(d, -1);
    if (kind === 'income') return; // only booked stays count as money in
    const line = propLineForTxn(s, t), k = nd + '|' + line; // same day + line = one payment (e.g. loan parts)
    const g = patt[k] || (patt[k] = { date: nd, amount: 0, n: 0, label: PROP_LINES.find(l => l.id === line)?.label || 'Other', kind: 'pattern' });
    g.amount += t.amount; g.n++; if (nd > g.date) g.date = nd;
  });
  Object.values(patt).forEach(g => { if (Math.abs(g.amount) >= 0.5) events.push({ ...g, amount: round2(g.amount), label: g.label + (g.n > 1 ? ` (${g.n} parts)` : '') }); });
  events.sort((a, b) => a.date.localeCompare(b.date));
  // Roll up by month with a running balance.
  const months = [];
  let bal = startBal, low = { bal: startBal, date: start };
  for (let i = 0; i < 12; i++) {
    const md = new Date(m0.getFullYear(), m0.getMonth() + i, 1), key = dateToIso(md).slice(0, 7);
    const ev = events.filter(e => monthKey(e.date) === key);
    const inn = ev.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0);
    const out = ev.filter(e => e.amount < 0).reduce((a, e) => a + e.amount, 0);
    ev.forEach(e => { bal += e.amount; e.bal = round2(bal); if (bal < low.bal) low = { bal: round2(bal), date: e.date }; });
    months.push({ key, label: md.toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' }), inn: round2(inn), out: round2(out), end: round2(bal), events: ev });
  }
  return { acc, asAt, cb, since: since.length, startBal, months, low };
}
function propCashflowHtml(s) {
  const p = propSettings(s), c = propCashflow(s);
  const inp = 'background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px;outline:none';
  if (c.noAccount) return `<div class="card" style="font-size:13px;color:var(--text3)">Choose the property's bank account in <a href="#" onclick="setPropTab('setup');return false" style="color:var(--teal)">Setup</a> first. The cash flow follows that account.</div>`;
  const accName = accounts.find(a => a.id === p.accountId)?.name || 'the property account';
  const cb = p.cashBalance || {};
  const balCard = `<div class="card">
    <div class="card-title" style="margin-bottom:4px">Starting balance</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:8px">The balance of ${escH(accName)} from your banking app. Anything imported for the account after that date is added on.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input type="number" step="0.01" placeholder="Balance $" value="${cb.amount ?? ''}" onchange="setPropCash('amount', this.value)" style="${inp};width:140px">
      <input type="date" value="${escH(cb.date || todayLocal())}" onchange="setPropCash('date', this.value)" style="${inp}">
    </div>
    ${c.since ? `<div style="font-size:11px;color:var(--text3);margin-top:6px">${c.since} transaction${c.since === 1 ? '' : 's'} imported since then, so it's ${fmtSigned(c.startBal)} today.</div>` : ''}
  </div>`;
  if (c.noBalance) return balCard;
  const money = v => `${v < 0 ? '−' : ''}${fmt(v)}`;
  const tag = { booked: 'booked', forecast: 'forecast', regular: 'regular', pattern: 'like last year' };
  const cols = 'display:grid;grid-template-columns:minmax(0,1fr) 72px 72px 84px;gap:6px';
  return `${balCard}
    <div class="card">
      <div class="card-title" style="margin-bottom:4px">Next 12 months</div>
      <div style="font-size:13px;margin-bottom:8px">${c.low.bal < 0
        ? `<span class="neg" style="font-weight:600">Goes ${fmt(c.low.bal)} overdrawn around ${fmtDay(c.low.date)}.</span> Top up before then.`
        : `Lowest point: <strong>${money(c.low.bal)}</strong> around ${fmtDay(c.low.date)}.`}</div>
      <div style="${cols};font-size:11px;color:var(--text3);padding-bottom:4px;border-bottom:0.5px solid var(--border)"><span>Month</span><span style="text-align:right">In</span><span style="text-align:right">Out</span><span style="text-align:right">Month end</span></div>
      ${c.months.map(m => `<div onclick="propCashOpen=propCashOpen==='${m.key}'?null:'${m.key}';renderProperty()" style="cursor:pointer;${cols};font-size:13px;padding:8px 0;border-bottom:0.5px solid var(--border)">
          <span>${m.label} <span style="font-size:10px;color:var(--teal)">${propCashOpen === m.key ? '▾' : '›'}</span></span>
          <span style="text-align:right" class="pos">${m.inn ? fmtWhole(m.inn) : '—'}</span>
          <span style="text-align:right">${m.out ? fmtWhole(m.out) : '—'}</span>
          <span style="text-align:right;font-weight:600" class="${m.end < 0 ? 'neg' : ''}">${m.end < 0 ? '−' : ''}${fmtWhole(m.end)}</span></div>
        ${propCashOpen === m.key ? `<div style="padding:4px 0 8px 8px">${m.events.length ? m.events.map(e => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0">
            <span style="min-width:0;padding-top:1px">${fmtDay(e.date)} · ${escH(e.label)} <span style="font-size:10px;color:var(--text3)">${tag[e.kind]}</span></span>
            <span style="white-space:nowrap;text-align:right"><span class="${e.amount > 0 ? 'pos' : ''}">${e.amount > 0 ? '+' : '−'}${fmt(e.amount)}</span><br><span style="font-size:11px;color:var(--text3)" class="${e.bal < 0 ? 'neg' : ''}">bal ${e.bal < 0 ? '−' : ''}${fmt(e.bal)}</span></span></div>`).join('') : '<div style="font-size:12px;color:var(--text3)">Nothing expected.</div>'}</div>` : ''}`).join('')}
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Only booked stays count as money in, paid the day after check-in. Costs follow last year's activity in this account (same day last year); set up <a href="#" onclick="setPropTab('setup');return false" style="color:var(--teal)">regular payments</a> to schedule bills exactly. Top-ups from your own accounts aren't included.</div>
    </div>`;
}
function setPropCash(field, val) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  const cb = { date: todayLocal(), ...(p.cashBalance || {}) };
  cb[field] = field === 'amount' ? (val === '' || isNaN(Number(val)) ? null : Number(val)) : val;
  s.property = { ...p, cashBalance: cb };
  scheduleSave(); renderProperty();
}

const PROP_APPORTIONABLE = ['insurance','interest','power','rates','rm','phone','purchases','other','depreciation'];
function togglePropFullLine(id, on) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  const set = new Set(p.fullLines || []); if (on) set.add(id); else set.delete(id);
  s.property = { ...p, fullLines: [...set] };
  scheduleSave(); renderProperty();
}

// ── Year-end pack for the accountant ──
// A self-contained page (opens in a new tab to print or save as PDF; falls
// back to a download) with everything behind the property's P&L for one tax
// year, plus a CSV of every transaction by report line.
function propPackData(s, ty) {
  const p = propSettings(s);
  const pnl = computePropPnL(s, ty);
  const { start, end } = taxYearRange(ty);
  const bks = bookings.filter(b => b.streamId === s.id && !b.cancelled)
    .map(b => ({ b, r: bookingShareInRange(b, start, end) })).filter(x => x.r.share)
    .sort((a, b) => (a.b.checkIn || '').localeCompare(b.b.checkIn || ''));
  const trips = propDaysInYear(s, ty, 'travel').sort((a, b) => a.date.localeCompare(b.date));
  const cleans = propDaysInYear(s, ty, 'cleaning').sort((a, b) => a.date.localeCompare(b.date));
  const personal = propDays.filter(d => d.streamId === s.id && d.date >= start && d.date < end && ['personal', 'family'].includes(d.type)).sort((a, b) => a.date.localeCompare(b.date));
  return { p, pnl, bks, trips, cleans, personal, dep: propDepreciationForYear(s, ty), ho: pnl.homeOffice, usage: pnl.usage, trav: pnl.travel };
}
// Runs of consecutive dates as "3 Jan – 9 Jan 2026 (7)".
function propDateRuns(dates) {
  const runs = [];
  dates.forEach(d => { const r = runs[runs.length - 1]; if (r && daysBetween(r.to, d) === 1) { r.to = d; r.n++; } else runs.push({ from: d, to: d, n: 1 }); });
  return runs.map(r => r.n === 1 ? fmtDay(r.from) : `${fmtDay(r.from)} – ${fmtDay(r.to)} (${r.n})`);
}
function propPackHtml(s, ty) {
  const d = propPackData(s, ty), { p, pnl } = d;
  const e = v => escH(String(v ?? ''));
  const m = v => (v < 0 ? '−' : '') + fmt(v);
  const acct = id => accounts.find(a => a.id === id)?.name || id || '';
  const row = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="n">${v}</td></tr>`;
  const owners = p.owners.filter(o => o.name && o.share);
  const shareTxt = pnl.share < 1 ? `${Math.round(pnl.share * 1000) / 10}%` : '100%';
  const lineTable = l => {
    const items = [...l.txns.map(t => ({ date: dateToIso(t.date), desc: t.desc + (t.detail ? ' · ' + t.detail : ''), src: acct(t.account), amount: -t.amount })),
      ...l.costs.map(c => ({ date: c.date, desc: c.note || 'Cost entered by hand', src: 'Entered by hand', amount: Number(c.amount) || 0 }))]
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!items.length) return '';
    return `<h3>${e(l.label)} <span class="sub">${fmt(l.full)}${l.apportioned ? ` · ${fmt(l.amount)} claimed at ${shareTxt}` : ''}</span></h3>
      <table><thead><tr><th>Date</th><th>Description</th><th>Account</th><th class="n">Amount</th></tr></thead><tbody>
      ${items.map(i => `<tr><td class="nw">${fmtDay(i.date)}</td><td>${e(i.desc)}</td><td>${e(i.src)}</td><td class="n">${m(i.amount)}</td></tr>`).join('')}
      </tbody></table>`;
  };
  const sumB = k => d.bks.reduce((a, x) => a + (Number(x.b[k]) || 0) * x.r.share, 0);
  const tr = d.trav, rates = (p.kmRates || {})[ty] || {};
  return `<!doctype html><html lang="en-NZ"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(s.name)} ${taxYearLabel(ty)} year-end pack</title>
<style>
  body{font:13px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a;margin:24px auto;max-width:900px;padding:0 16px;background:#fff}
  h1{font-size:22px;margin:0 0 2px} h2{font-size:16px;margin:28px 0 8px;border-bottom:2px solid #1a1a1a;padding-bottom:3px} h3{font-size:14px;margin:18px 0 6px}
  .sub{font-weight:400;color:#666;font-size:12px} .muted{color:#666} table{width:100%;border-collapse:collapse;margin-bottom:6px}
  th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e3e3e3;vertical-align:top} th{font-size:11px;text-transform:uppercase;color:#666;font-weight:600}
  .n{text-align:right;white-space:nowrap} .nw{white-space:nowrap} tr.tot td{font-weight:700;border-top:1.5px solid #1a1a1a} .summary td:first-child{width:70%}
  .bar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px;border-bottom:1px solid #e3e3e3} button{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid #888;background:#f4f4f4;cursor:pointer}
  @media print{.bar{display:none} body{margin:0} h2{break-after:avoid} tr{break-inside:avoid}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Print / save as PDF</button></div>
<h1>${e(s.name)}: year-end pack</h1>
<div class="muted">Tax year ${taxYearLabel(ty)} (1 April ${ty - 1} – 31 March ${ty}) · prepared ${fmtDay(todayLocal())} with MyFinance</div>
<div class="muted">Owners: ${owners.map(o => `${e(o.name)} ${o.share}%`).join(', ') || '—'} · Deduction basis: ${pnl.basis === 'mixeduse' ? `mixed-use, income share ${shareTxt} (${pnl.usage.income} income days, ${pnl.usage.personalDays} private)` : pnl.basis === 'actualcost' ? `actual cost, ${pnl.usage.availDays} of ${pnl.usage.days} days rented or available (${shareTxt})` : '100% deductible'}${pnl.privateRent ? ` · ${fmt(pnl.privateRent)} rent from below-market stays left out (exempt under mixed-use)` : ''}</div>

<h2>Profit or loss</h2>
<table class="summary"><tbody>
${row('Rent received', fmt(pnl.rent), 'tot')}
${row('&nbsp;&nbsp;Bookings (gross + Host Remitted Tax + adjustments)', fmt(pnl.bookingIncome))}
${pnl.otherIncome ? row('&nbsp;&nbsp;Other bank deposits', fmt(pnl.otherIncome)) : ''}
${row('Commissions (platform fees)', fmt(pnl.commissions))}
${pnl.expenseLines.filter(l => Math.abs(l.amount) >= 0.005).map(l => row(e(l.label) + (l.apportioned ? ` <span class="muted">(${fmt(l.full)} × ${shareTxt})</span>` : ''), fmt(l.amount))).join('')}
${pnl.depRecovered ? row('Depreciation recovered (income)', fmt(pnl.depRecovered)) : ''}
${row('Total expenses', fmt(pnl.totalExpenses))}
${row('Net profit (loss)', m(pnl.net), 'tot')}
${pnl.mua ? `${row(`Mixed-use: income ${fmt(pnl.mua.income)}, property value ${pnl.mua.value ? `${fmt(pnl.mua.value.amount)} (${e(pnl.mua.value.source)}, ${fmtDay(pnl.mua.value.date)})` : 'not entered'}`, '')}
${pnl.mua.optedOut ? row('Opted out of the mixed-use rules for this year (income under $4,000 or under 2% of value)', '') : ''}
${row('Quarantined loss brought forward', fmt(pnl.mua.open))}
${pnl.mua.quarantined ? row('Loss quarantined this year (income under 2% of value)', fmt(pnl.mua.quarantined)) : ''}
${pnl.mua.used ? row('Brought-forward loss used this year', fmt(pnl.mua.used)) : ''}
${row('Quarantined loss carried forward', fmt(pnl.mua.close))}
${row('Profit (loss) for tax', m(pnl.taxNet), 'tot')}` : ''}
${owners.map(o => row(`&nbsp;&nbsp;${e(o.name)} (${o.share}%)`, m(pnl.net * o.share / 100))).join('')}
</tbody></table>

<h2>Use of the property</h2>
<table class="summary"><tbody>
${row('Days in the year', d.usage.days)}
${row('Income days (booked nights)', d.usage.income)}
${row('Personal and family days', d.usage.personalDays)}
${d.usage.blocked ? row('Blocked (not available)', d.usage.blocked) : ''}
${row('Income share', shareTxt, 'tot')}
</tbody></table>
${d.personal.length ? `<div class="muted">Personal days: ${propDateRuns([...new Set(d.personal.map(x => x.date))]).join('; ')}</div>` : ''}

<h2>Bookings (${d.bks.length})</h2>
<table><thead><tr><th>Check-in</th><th>Guest</th><th>Platform</th><th class="n">Nights</th><th class="n">Gross</th><th class="n">Fees</th><th class="n">Host tax</th><th class="n">Payout</th></tr></thead><tbody>
${d.bks.map(({ b, r }) => `<tr><td class="nw">${fmtDay(b.checkIn)}</td><td>${e(b.guest || b.code)}${r.share < 1 ? ' <span class="muted">(part in this year)</span>' : ''}${b.status !== 'completed' ? ' <span class="muted">(upcoming)</span>' : ''}</td><td>${e(platformName(b.platform))}</td><td class="n">${r.nights}</td>
  <td class="n">${fmt((b.gross || 0) * r.share)}</td><td class="n">${fmt((b.serviceFee || 0) * r.share)}</td><td class="n">${fmt((b.hostTax || 0) * r.share)}</td><td class="n">${fmt((b.payout || 0) * r.share)}</td></tr>`).join('')}
<tr class="tot"><td colspan="3">Total</td><td class="n">${d.bks.reduce((a, x) => a + x.r.nights, 0)}</td><td class="n">${fmt(sumB('gross'))}</td><td class="n">${fmt(sumB('serviceFee'))}</td><td class="n">${fmt(sumB('hostTax'))}</td><td class="n">${fmt(sumB('payout'))}</td></tr>
</tbody></table>
${pnl.otherIncomeTxns.length ? `<h3>Other bank deposits</h3><table><tbody>${pnl.otherIncomeTxns.map(t => `<tr><td class="nw">${fmtDay(dateToIso(t.date))}</td><td>${e(t.desc)}</td><td>${e(acct(t.account))}</td><td class="n">${fmt(t.amount)}</td></tr>`).join('')}</tbody></table>` : ''}

<h2>Expenses by line</h2>
${pnl.expenseLines.filter(l => l.id !== 'homeoffice' && l.id !== 'depreciation' && l.id !== 'travel').map(lineTable).join('')}

${tr.trips ? `<h2>Travel</h2>
<table class="summary"><tbody>
${row('Trips', tr.trips)}${row('Business km', tr.km.toLocaleString('en-NZ'))}
${tr.carKm ? row(`Car's total km${rates.odoStart && rates.odoEnd ? ` (odometer ${Number(rates.odoStart).toLocaleString('en-NZ')} → ${Number(rates.odoEnd).toLocaleString('en-NZ')})` : ''}`, tr.carKm.toLocaleString('en-NZ')) : ''}
${row(`IRD kilometre rate`, `$${rates.t1 ?? '—'} tier 1 · $${rates.t2 ?? rates.t1 ?? '—'} tier 2`)}
${row('Tier 1 km (business share of the first 14,000 km)', Math.round(Math.min(tr.km, tr.tier1Km)).toLocaleString('en-NZ'))}
${row('Travel claimed', fmt(tr.value), 'tot')}
</tbody></table>
<table><thead><tr><th>Date</th><th>Purpose</th><th class="n">Km</th></tr></thead><tbody>
${d.trips.map(t => `<tr><td class="nw">${fmtDay(t.date)}</td><td>${e(t.note || (d.cleans.some(c => c.date === t.date) ? 'Clean / changeover' : 'Property visit'))}</td><td class="n">${Number(t.km ?? p.travelKm) || 0}</td></tr>`).join('')}
</tbody></table>` : ''}

${d.cleans.some(c => c.cost) ? `<h2>Cleaning paid</h2><table><tbody>${d.cleans.filter(c => c.cost).map(c => `<tr><td class="nw">${fmtDay(c.date)}</td><td>${e(c.note || 'Clean')}</td><td class="n">${fmt(Number(c.cost))}</td></tr>`).join('')}</tbody></table>` : ''}

${d.ho.pct ? `<h2>Home office</h2>
<div class="muted">${d.ho.pct}% of household running costs${p.homeOffice?.officeM2 && p.homeOffice?.houseM2 ? ` (office ${p.homeOffice.officeM2} m² of ${p.homeOffice.houseM2} m²)` : ''}. Not apportioned for mixed use.</div>
<table class="summary"><tbody>
${d.ho.byCat.map(c => row(`${e(c.name)}${c.words.length ? ` <span class="muted">(${e(c.words.join(', '))})</span>` : ''} · ${c.loan ? `interest only, of ${fmt(c.paid)} repaid` : `${c.txns.length} payments`}`, fmt(c.total))).join('')}
${d.ho.extra ? row('Other household costs (entered)', fmt(d.ho.extra)) : ''}
${row('Household costs', fmt(d.ho.total))}
${row(`Home office claim (${d.ho.pct}%)`, fmt(d.ho.value), 'tot')}
</tbody></table>
${d.ho.byCat.map(c => c.loan ? `<h3>${e(c.name)}: interest from the loan statements</h3><table><tbody>${c.loan.recs.map(r => `<tr><td class="nw">${fmtDay(r.date)}</td><td>${e(r.desc)}</td><td>${e(r.loan)}</td><td class="n">${m(r.interest)}</td></tr>`).join('')}
<tr class="tot"><td colspan="3">Interest charged to ${fmtDay(c.loan.coveredTo)}</td><td class="n">${fmt(c.loan.interest)}</td></tr>
${c.loan.paidAfter ? `<tr><td colspan="3">Repayments after ${fmtDay(c.loan.coveredTo)}: ${fmt(c.loan.paidAfter)}${c.loan.ratio != null ? ` × ${Math.round(c.loan.ratio * 1000) / 10}% interest share (estimate)` : ' (no interest share known, full repayment counted)'}</td><td class="n">${fmt(c.loan.ratio != null ? c.loan.estimate : c.loan.paidAfter)}</td></tr>` : ''}
</tbody></table>` : c.txns.length ? `<h3>${e(c.name)}</h3><table><tbody>${c.txns.map(t => `<tr><td class="nw">${fmtDay(dateToIso(t.date))}</td><td>${e(t.desc)}</td><td>${e(acct(t.account))}</td><td class="n">${m(-t.amount)}</td></tr>`).join('')}</tbody></table>` : '').join('')}` : ''}

${d.dep.rows.length ? `<h2>Depreciation ${taxYearLabel(ty)}</h2>
<table><thead><tr><th>Asset</th><th>Method</th><th class="n">Opening</th><th class="n">Bought</th><th class="n">Depreciation</th><th class="n">Closing</th></tr></thead><tbody>
${d.dep.rows.map(({ a, r }) => `<tr><td>${e(a.name)}${a.purchased ? ` <span class="muted">bought ${fmtDay(a.purchased)} · year ${ty - taxYearOf(isoToDate(a.purchased)) + 1}</span>` : ''}${r.sale != null ? ` <span class="muted">sold ${fmtDay(a.disposed.date)} for ${fmt(r.sale)}</span>` : ''}</td>
  <td class="nw">${a.method === 'none' || !Number(a.rate) ? 'None' : `${Math.round(Number(a.rate) * 1000) / 10}% ${e(a.method)}`}</td><td class="n">${fmt(r.open)}</td><td class="n">${r.bought ? fmt(r.bought) : ''}</td><td class="n">${fmt(r.dep || 0)}</td><td class="n">${fmt(r.close)}</td></tr>`).join('')}
<tr class="tot"><td colspan="2">Total</td><td class="n">${fmt(d.dep.open)}</td><td class="n">${d.dep.bought ? fmt(d.dep.bought) : ''}</td><td class="n">${fmt(d.dep.depreciation)}</td><td class="n">${fmt(d.dep.close)}</td></tr>
</tbody></table>` : ''}

<p class="muted" style="margin-top:28px">Prepared from the owners' bank imports, booking platform reports and records kept in MyFinance. For the accountant's review; figures are not a tax return.</p>
</body></html>`;
}
function propPackFileName(s, ty, ext) { return `${s.name} ${taxYearLabel(ty)} year-end pack.${ext}`.replace(/[\\/:*?"<>|]/g, ''); }
function propDownload(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function openPropPack() {
  const s = currentPropStream(); if (!s) return;
  const html = propPackHtml(s, propTaxYear);
  const w = window.open('', '_blank');
  if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); }
  else propDownload(propPackFileName(s, propTaxYear, 'html'), html, 'text/html');
}
function downloadPropPackCsv() {
  const s = currentPropStream(); if (!s) return;
  const pnl = computePropPnL(s, propTaxYear);
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const acct = id => accounts.find(a => a.id === id)?.name || id || '';
  const rows = [['Date', 'Line', 'Description', 'Account', 'Category', 'Amount', 'Claimed share', 'Claimed']];
  const share = pnl.share;
  pnl.otherIncomeTxns.forEach(t => rows.push([dateToIso(t.date), 'Other bank deposits', t.desc, acct(t.account), t.cat, t.amount.toFixed(2), '', '']));
  pnl.expenseLines.forEach(l => {
    const sh = l.apportioned ? share : 1;
    l.txns.forEach(t => rows.push([dateToIso(t.date), l.label, `${t.desc}${t.detail ? ' · ' + t.detail : ''}`, acct(t.account), t.cat, (-t.amount).toFixed(2), sh.toFixed(4), (-t.amount * sh).toFixed(2)]));
    l.costs.forEach(c => rows.push([c.date, l.label, c.note || 'Cost entered by hand', 'Entered by hand', '', (Number(c.amount) || 0).toFixed(2), sh.toFixed(4), ((Number(c.amount) || 0) * sh).toFixed(2)]));
  });
  const csv = '﻿' + rows.map(r => r.map(q).join(',')).join('\n');
  propDownload(propPackFileName(s, propTaxYear, 'csv'), csv, 'text/csv;charset=utf-8');
}
function propPackCardHtml() {
  return `<div class="card">
    <div class="card-title" style="margin-bottom:4px">Year-end pack for your accountant</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px">Everything behind this year's P&amp;L: bookings, every transaction by line, use of the property, travel log, home office and depreciation. Open it to print or save as a PDF, and attach the spreadsheet for their working papers.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="openPropPack()">Open pack</button>
      <button class="btn btn-secondary" onclick="downloadPropPackCsv()">Download spreadsheet (CSV)</button>
    </div>
  </div>`;
}

// ── Year-end checklist (Tax tab) and setup check (Setup tab) ──
// Each row is green (on track), amber (needs a look), red (off track) or grey
// (doesn't apply). The checklist covers the data for one tax year: imports up
// to date, loan statements, regular payments, bookings, things to review, and
// a few things only the owner can confirm (ticked per year). The setup check
// covers settings that apply every year.
const PROP_STATUS = {
  good: { c: 'var(--green,#2ea043)', icon: '✓' },
  warn: { c: '#d97706', icon: '!' },
  bad:  { c: 'var(--red,#d64545)', icon: '✕' },
  na:   { c: 'var(--text3)', icon: '–' },
};
const propHoMortgageCats = ho => (ho.cats || []).filter(n => /mortgage|home ?loan/i.test(n));
// The date the year's data should reach: today in the current year, 31 March
// for a past year.
function propYearTarget(ty) {
  const { end } = taxYearRange(ty), today = todayLocal();
  return end <= today ? addDaysIso(end, -1) : today;
}
function propYearChecks(s, ty) { return ((propSettings(s).yearChecks || {})[ty]) || {}; }
function togglePropYearCheck(key, on) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s), yc = { ...(p.yearChecks || {}) };
  yc[propTaxYear] = { ...(yc[propTaxYear] || {}), [key]: !!on };
  s.property = { ...p, yearChecks: yc };
  scheduleSave(); renderProperty();
}
function togglePropSetupOk(key, on) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  s.property = { ...p, setupOk: { ...(p.setupOk || {}), [key]: !!on } };
  scheduleSave(); renderProperty();
}
// Days a date is behind the target, as a status: within a fortnight is on
// track, within ~6 weeks needs a look, more is off track.
function propBehind(last, target, okDays = 14, warnDays = 45) {
  if (!last) return 'bad';
  const d = daysBetween(last, target);
  return d <= okDays ? 'good' : d <= warnDays ? 'warn' : 'bad';
}
function propChecklist(s, ty) { return propCached(`cl:${s.id}:${ty}`, () => propChecklistRaw(s, ty)); }
function propChecklistRaw(s, ty) {
  const p = propSettings(s), ho = p.homeOffice || {};
  const { start, end } = taxYearRange(ty), today = todayLocal();
  const target = propYearTarget(ty), started = start <= today, past = end <= today;
  const yc = propYearChecks(s, ty);
  const items = [];
  const link = (label, js) => `<a href="#" onclick="${js};return false" style="color:var(--teal)">${label}</a>`;
  if (!started) return items;

  // 1. Bank accounts the figures come from: the property's own, plus any that
  // property, home office or regular-payment transactions this year came off.
  // This year and last, so an account not yet imported this year still shows.
  const prevStart = taxYearRange(ty - 1).start;
  const inYear = t => (d => d >= prevStart && d < end)(dateToIso(t.date));
  const accIds = new Set(propAccountIds(s));
  const hoCats = new Set(ho.cats || []);
  const regCats = new Set((p.regular || []).filter(r => r.src.startsWith('cat:')).map(r => r.src.slice(4)));
  transactions.forEach(t => {
    if (!t.account || !inYear(t)) return;
    const personal = (t.stream || 'personal') === 'personal';
    if (t.stream === s.id || (personal && (hoCats.has(t.cat) || regCats.has(t.cat) || t.cat === propPersonalCat(s)))) accIds.add(t.account);
  });
  const bank = [...accIds].map(id => {
    const a = accounts.find(x => x.id === id);
    const ds = transactions.filter(t => t.account === id).map(t => dateToIso(t.date)).sort();
    const last = ds[ds.length - 1] || null;
    const pending = pendingTxns.filter(t => t.account === id).length;
    let st = propBehind(last, target, past ? 7 : 14);
    if (pending && st === 'good') st = 'warn';
    return { id, name: a?.name || id, last, pending, st };
  });
  items.push({ group: 'Bank statements', rows: bank.map(b => ({
    st: b.st, label: b.name,
    detail: `${b.last ? `imported up to ${fmtDay(b.last)}` : 'nothing imported'}${b.pending ? ` · ${b.pending} waiting for review in Import` : ''}`,
    action: `<label class="btn-update" style="cursor:pointer;white-space:nowrap">Load CSV<input type="file" accept=".csv,text/csv" style="display:none" onchange="handleCSV(this, '${escH(b.id)}')"></label>`,
  })) });

  // 2. Loan statements, when home office counts a mortgage category.
  const mortCats = propHoMortgageCats(ho);
  if (ho.pct && (ho.loanCat || mortCats.length)) {
    const loans = (ho.loans || []).filter(l => (l.recs || []).length);
    const rows = [];
    if (!ho.loanCat) rows.push({ st: 'bad', label: 'Repayments category not set', detail: `Home office includes ${escH(mortCats.join(', '))}. Say which category holds the repayments in ${link('Setup', "setPropTab('setup')")} so only the interest is counted.` });
    else if (!loans.length) rows.push({ st: 'bad', label: 'No loan statements loaded', detail: `The full repayments in ${escH(ho.loanCat)} are being counted, principal included. Load each loan account's statement below.` });
    loans.forEach((l, i) => {
      const last = l.recs.reduce((m, r) => r.date > m ? r.date : m, '');
      rows.push({ st: propBehind(last, target, 35, 70), label: l.name, detail: `interest loaded up to ${fmtDay(last)} · ${l.recs.length} lines`,
        action: `<label class="btn-update" style="cursor:pointer;white-space:nowrap">Load CSV<input type="file" accept=".csv,text/csv" style="display:none" onchange="importPropLoanCsv(this, ${i})"></label>` });
    });
    rows.push({ st: null, label: '', body: `<div style="display:flex;align-items:center;gap:8px;padding:4px 0 2px">
        <input type="text" id="prop-loan-name" placeholder="New loan, e.g. Home loan 2" style="flex:1;min-width:0;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:13px;padding:6px;outline:none">
        <label class="btn-update" style="cursor:pointer;white-space:nowrap">Load CSV<input type="file" accept=".csv,text/csv" style="display:none" onchange="importPropLoanCsv(this)"></label></div>
      <div style="font-size:11px;color:var(--text3)">The loan account's own statement, not the account repayments come from. Only interest lines are kept, and they don't go into your transactions. One name per loan part; loading a statement twice is fine.</div>` });
    items.push({ group: 'Mortgage interest (home office)', rows });
  }

  // 3. Regular payments.
  const regs = p.regular || [];
  const fmtMiss = (d, f) => f.days >= 28 ? isoToDate(d).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' }) : '~' + fmtDay(d);
  items.push({ group: 'Regular payments', rows: regs.length ? regs.map(r => {
    const c = propRegularCheck(s, ty, r);
    return { st: c.missing.length ? 'bad' : c.txns.length ? 'good' : 'warn', label: `${propRegularLabel(r)} <span style="font-size:11px;color:var(--text3)">${c.f.label.toLowerCase()}</span>`,
      detail: `${c.last ? `last ${fmtDay(c.last)}` : 'none found'}${c.missing.length ? ` · ${c.missing.length} missing, around ${c.missing.slice(0, 6).map(d => fmtMiss(d, c.f)).join(', ')}${c.missing.length > 6 ? '…' : ''}` : ''}` };
  }) : [{ st: 'warn', label: 'None set up', detail: `Add the costs that come out on a schedule in ${link('Setup → Regular payments', "setPropTab('setup')")} to spot missing ones.` }] });

  // 4. Bookings and payouts.
  const bks = bookings.filter(b => b.streamId === s.id && !b.cancelled && b.checkIn < end && (b.checkOut || b.checkIn) > start);
  const stale = bks.filter(b => b.status === 'upcoming' && (b.checkOut || b.checkIn) < addDaysIso(today, -3));
  const matches = computePayoutMatches(s);
  const missPay = propPayouts.filter(x => x.streamId === s.id && x.date >= start && x.date < end && !matches.payoutTxn.has(x.id));
  const oldMiss = missPay.filter(x => (x.arriveBy || x.date) < addDaysIso(today, -7));
  const bkRows = [{ st: !bks.length ? 'bad' : stale.length ? 'warn' : 'good', label: 'Bookings imported',
    detail: !bks.length ? 'none this year' : `${bks.length} this year${stale.length ? ` · ${stale.length} finished stay${stale.length === 1 ? '' : 's'} still marked upcoming, so import the completed earnings CSV` : ''}`,
    action: `<button class="btn-update" onclick="document.getElementById('prop-csv-input').click()">Import</button>` }];
  if (propPayouts.some(x => x.streamId === s.id)) bkRows.push({ st: oldMiss.length ? 'bad' : missPay.length ? 'warn' : 'good', label: 'Payouts found in the bank',
    detail: missPay.length ? `${missPay.length} not found: ${missPay.slice(0, 4).map(x => `${fmt(x.amount)} due ${fmtDay(x.arriveBy || x.date)} (${propPayoutMissReason(s, x, matches)})`).join('; ')}${missPay.length > 4 ? '…' : ''}.` : 'all matched',
    action: missPay.length ? `<button class="btn-update" onclick="setPropTab('bookings')">Show</button>` : '' });
  items.push({ group: 'Bookings', rows: bkRows });

  // 5. To review: personal transactions in the property's category, and
  // property-account transactions still under Personal.
  const linked = propPersonalCat(s);
  const rev = linked ? transactions.filter(t => (t.stream || 'personal') === 'personal' && t.cat === linked && t.propReviewed !== s.id).length : 0;
  const strays = propAccountStrays(s).length;
  items.push({ group: 'To sort', rows: [
    { st: rev ? 'warn' : 'good', label: `Personal "${escH(linked || s.name)}" transactions`, detail: rev ? `${rev} to review` : 'all reviewed', action: rev ? `<button class="btn-update" onclick="setPropTab('review')">Review</button>` : '' },
    ...(strays ? [{ st: 'warn', label: 'Property account under Personal', detail: `${strays} transaction${strays === 1 ? '' : 's'} not on ${escH(s.name)} yet`, action: `<button class="btn-update" onclick="setPropTab('setup')">Fix</button>` }] : []),
  ] });

  // 6. Things only the owner knows, ticked per year.
  const tick = (key, label, detail, st) => ({ st: st || (yc[key] ? 'good' : 'warn'), label, detail,
    action: `<label style="display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap;cursor:pointer"><input type="checkbox" style="width:16px;height:16px;margin:0" ${yc[key] ? 'checked' : ''} onchange="togglePropYearCheck('${key}', this.checked)">Done</label>` });
  const manual = [];
  {
    const u = propUsageForYear(s, ty), basis = propBasisFor(s, ty);
    if (basis !== 'full' || u.personalDays) manual.push(tick('calendar', 'Personal and family days marked', `${u.personalDays} private day${u.personalDays === 1 ? '' : 's'} on the ${link('calendar', "setPropTab('calendar')")}`));
    if (u.suggested !== basis) manual.push({ st: 'warn', label: 'Deduction basis', detail: `${propBasisLabel(basis)} chosen, but the calendar suggests ${propBasisLabel(u.suggested)} for ${taxYearLabel(ty)}. Check with your accountant.`, action: `<button class="btn-update" onclick="setPropTab('setup')">Setup</button>` });
    if (basis === 'mixeduse') {
      const m = computePropPnL(s, ty).mua;
      if (m?.valueMissing) manual.push({ st: 'bad', label: 'Property value', detail: 'Needed for the mixed-use 2% loss test. Enter the rating valuation or purchase price.', action: `<button class="btn-update" onclick="setPropTab('setup')">Setup</button>` });
      else if (m?.optOutEligible && !m.optedOut) manual.push({ st: 'warn', label: 'Mixed-use opt-out', detail: `This year qualifies to be left out of the return (${m.lowIncome ? 'income under $4,000' : 'a loss with income under 2% of value'}). Decide with your accountant on the Tax tab.` });
    }
  }
  const trav = propTravelForYear(s, ty);
  manual.push(trav.rateMissing ? { st: 'bad', label: 'Trips logged', detail: `${trav.trips} trips, ${trav.km} km, but no IRD km rate for ${taxYearLabel(ty)}. Enter it from the Travel line on the P&L.` }
    : tick('travel', 'Trips logged', `${trav.trips} trip${trav.trips === 1 ? '' : 's'} · ${trav.km} km`));
  manual.push(tick('receipts', 'Receipts and cash costs added', `anything not paid from an imported account, with ${link('+ Add a cost', 'openPropCost()')}`));
  const dep = propDepreciationForYear(s, ty);
  manual.push(tick('assets', 'Assets bought or sold recorded', `${dep.rows.length} asset${dep.rows.length === 1 ? '' : 's'} in the ${link('register', "setPropTab('assets')")}`));
  if (ho.pct) {
    const extra = Number((ho.extra || {})[ty]) || 0;
    const dbl = extra && (ho.loanCat ? (ho.cats || []).includes(ho.loanCat) : mortCats.length);
    manual.push(dbl && !yc.homeoffice ? { ...tick('homeoffice', 'Home office', ''), st: 'warn', detail: `${fmt(extra)} typed in as other household costs as well as the mortgage category. Make sure that isn't the same interest twice.` }
      : tick('homeoffice', 'Home office costs checked', `${ho.pct}% of ${fmt(propHomeOfficeForYear(s, ty).total)} household costs`));
  }
  items.push({ group: 'Confirm', rows: manual });
  return items;
}
function propStatusDot(st) {
  const k = PROP_STATUS[st] || PROP_STATUS.na;
  return `<span style="flex:none;width:18px;height:18px;border-radius:50%;background:${k.c};color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-top:1px">${k.icon}</span>`;
}
function propStatusRowsHtml(groups) {
  return groups.filter(g => g.rows.length).map(g => `<div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em;margin:12px 0 2px">${g.group}</div>
    ${g.rows.map(r => r.st == null ? `<div style="padding:4px 0 8px 26px;border-bottom:0.5px solid var(--border)">${r.body}</div>` : `<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border)">
      ${propStatusDot(r.st)}
      <div style="flex:1;min-width:0"><div style="font-size:13px">${r.label}</div>${r.detail ? `<div style="font-size:11px;color:var(--text3);margin-top:1px">${r.detail}</div>` : ''}${r.body || ''}</div>
      ${r.action ? `<div style="flex:none">${r.action}</div>` : ''}</div>`).join('')}`).join('');
}
function propStatusSummaryHtml(groups, okText) {
  const all = groups.flatMap(g => g.rows).filter(r => r.st && r.st !== 'na');
  const n = k => all.filter(r => r.st === k).length;
  const overall = n('bad') ? 'bad' : n('warn') ? 'warn' : 'good';
  const k = PROP_STATUS[overall];
  const parts = [['good', 'on track'], ['warn', 'to check'], ['bad', 'off track']].filter(([x]) => n(x)).map(([x, t]) => `<span style="color:${PROP_STATUS[x].c};font-weight:600">${n(x)} ${t}</span>`);
  return `<div style="display:flex;gap:4px;height:6px;border-radius:3px;overflow:hidden;margin:6px 0 6px">${all.map(r => `<span style="flex:1;background:${PROP_STATUS[r.st].c}"></span>`).join('')}</div>
    <div style="font-size:12px;color:var(--text2)">${overall === 'good' ? `<span style="color:${k.c};font-weight:600">${okText}</span>` : parts.join(' · ')}</div>`;
}
let propChecklistOpen = null; // null = open unless everything is green
function propChecklistHtml(s) {
  const groups = propChecklist(s, propTaxYear);
  if (!groups.length) return '';
  const all = groups.flatMap(g => g.rows).filter(r => r.st);
  const allGood = all.every(r => r.st === 'good' || r.st === 'na');
  const open = propChecklistOpen ?? !allGood;
  const worst = all.some(r => r.st === 'bad') ? 'bad' : all.some(r => r.st === 'warn') ? 'warn' : 'good';
  return `<div class="card" style="border-left:4px solid ${PROP_STATUS[worst].c}">
    <div onclick="propChecklistOpen=${!open};renderProperty()" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer"><div class="card-title">Year-end checklist ${taxYearLabel(propTaxYear)}</div><span style="font-size:12px;color:var(--teal)">${open ? 'Hide' : 'Show'}</span></div>
    ${propStatusSummaryHtml(groups, `Everything is ready for ${taxYearLabel(propTaxYear)}${propTaxYear === taxYearOf(new Date()) ? ' so far' : ''}`)}
    ${open ? `<div style="font-size:11px;color:var(--text3);margin-top:6px">Up to date means up to ${fmtDay(propYearTarget(propTaxYear))}.</div>${propStatusRowsHtml(groups)}` : ''}
  </div>`;
}

// Setup check: settings that apply every year.
function propSetupCheck(s) {
  const p = propSettings(s), raw = s.property || {}, ok = p.setupOk || {}, ho = p.homeOffice || {};
  const confirmBox = (key, label) => `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text2);margin-top:4px;cursor:pointer"><input type="checkbox" style="width:14px;height:14px;margin:0" ${ok[key] ? 'checked' : ''} onchange="togglePropSetupOk('${key}', this.checked)">${label}</label>`;
  const sel = 'background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;padding:5px 6px;outline:none';
  const owners = p.owners.filter(o => o.share);
  const total = round2(owners.reduce((a, o) => a + (Number(o.share) || 0), 0));
  const defaultNames = owners.some(o => /^Owner \d+$/.test(o.name));
  const strays = propAccountStrays(s).length;
  const counts = {}; transactions.forEach(t => { if (t.stream === s.id) counts[t.cat] = 1; });
  const catNames = [...new Set([...(s.cats || []).map(c => c.name), ...Object.keys(counts)])];
  const guessed = catNames.filter(n => !(p.catLines || {})[n]);
  const mortCats = propHoMortgageCats(ho);
  const rows = [
    { st: owners.length && Math.abs(total - 100) < 0.01 && !defaultNames ? 'good' : 'bad', label: 'Owners and shares',
      detail: owners.length ? `${owners.map(o => `${escH(o.name)} ${o.share}%`).join(', ')}${Math.abs(total - 100) >= 0.01 ? ` · adds up to ${total}%` : ''}${defaultNames ? ' · give each owner their name' : ''}` : 'none set' },
    { st: p.purchaseDate ? 'good' : 'warn', label: 'Purchase date', detail: p.purchaseDate ? fmtDay(p.purchaseDate) : 'not set' },
    { st: !propAccountIds(s).size ? 'bad' : strays ? 'warn' : 'good', label: 'Property bank account',
      detail: propAccountIds(s).size ? `${escH([...propAccountIds(s)].map(id => accounts.find(a => a.id === id)?.name || id).join(', '))}${strays ? ` · ${strays} of its transactions still under Personal (see above)` : ''}` : 'not set, so rent and bills on it are not picked up' },
    { st: propPersonalCat(s) ? 'good' : 'bad', label: 'Personal category for property costs', detail: escH(propPersonalCat(s) || 'not set') },
    { st: !guessed.length || ok.catLines ? 'good' : 'warn', label: 'Categories → report lines',
      detail: guessed.length ? `${guessed.length} guessed from the name: ${escH(guessed.slice(0, 5).join(', '))}${guessed.length > 5 ? '…' : ''}. Check them below.` : 'all set',
      body: guessed.length ? confirmBox('catLines', 'The guesses are right') : '' },
    (() => { const ty = currentTaxYear(), sug = propUsageForYear(s, ty).suggested, basis = propBasisFor(s, ty);
      const chosen = raw.deductionBasis || (raw.basisByYear || {})[ty];
      return { st: !chosen ? 'warn' : sug === basis ? 'good' : 'warn', label: 'Deduction basis',
        detail: !chosen ? 'not chosen yet (100% assumed)' : sug === basis ? `${propBasisLabel(basis)} for ${taxYearLabel(ty)}` : `${propBasisLabel(basis)} chosen for ${taxYearLabel(ty)}; the calendar suggests ${propBasisLabel(sug)}` }; })(),
    { st: p.travelKm ? 'good' : 'warn', label: 'Return trip distance', detail: p.travelKm ? `${p.travelKm} km` : 'not set' },
    { st: ((p.kmRates || {})[propTaxYear] || {}).t1 ? 'good' : 'warn', label: `IRD km rate ${taxYearLabel(propTaxYear)}`, detail: ((p.kmRates || {})[propTaxYear] || {}).t1 ? `$${p.kmRates[propTaxYear].t1} / $${p.kmRates[propTaxYear].t2 ?? p.kmRates[propTaxYear].t1} per km` : 'not entered (from the Travel line on the P&L). IRD publishes it after the year ends' },
    { st: (p.regular || []).length ? 'good' : 'warn', label: 'Regular payments', detail: (p.regular || []).length ? `${p.regular.length} set up` : 'none set up (below)' },
    { st: ho.pct || ok.noHomeOffice ? 'good' : 'warn', label: 'Home office', detail: ho.pct ? `${ho.pct}% of ${(ho.cats || []).length} household categories` : ok.noHomeOffice ? 'not used' : `not set up (from the Home office line on the P&L)`,
      body: ho.pct ? '' : confirmBox('noHomeOffice', 'Not used') },
  ];
  if (ho.pct && (mortCats.length || ho.loanCat)) rows.push({ st: ho.loanCat ? 'good' : 'bad', label: 'Mortgage repayments category',
    detail: ho.loanCat ? `Home office counts only the interest in ${escH(ho.loanCat)}, from the loan statements loaded in the Tax tab's checklist.` : `Home office includes ${escH(mortCats.join(', '))}. Pick the category holding the repayments so only their interest counts.`,
    body: `<select style="${sel};margin-top:4px" onchange="setPropHomeOfficeLoanCat(this.value)">${['', ...(ho.cats || [])].map(n => `<option value="${escH(n)}" ${n === (ho.loanCat || '') ? 'selected' : ''}>${n ? escH(n) : 'None (no mortgage)'}</option>`).join('')}</select>` });
  rows.push({ st: (p.assets || []).length || ok.noAssets ? 'good' : 'warn', label: 'Assets for depreciation', detail: (p.assets || []).length ? `${p.assets.length} in the register` : ok.noAssets ? 'none to depreciate' : 'none added (Assets tab)',
    body: (p.assets || []).length ? '' : confirmBox('noAssets', 'Nothing to depreciate') });
  rows.push({ st: p.cashBalance ? 'good' : 'warn', label: 'Cash flow starting balance', detail: p.cashBalance ? `${fmt(Number(p.cashBalance.amount) || 0)} on ${fmtDay(p.cashBalance.date)}` : 'not set (Cash flow tab)' });
  return [{ group: 'Settings', rows }];
}
function propSetupCheckHtml(s) {
  const groups = propSetupCheck(s);
  const all = groups[0].rows;
  const worst = all.some(r => r.st === 'bad') ? 'bad' : all.some(r => r.st === 'warn') ? 'warn' : 'good';
  return `<div class="card" style="border-left:4px solid ${PROP_STATUS[worst].c}">
    <div class="card-title">Setup check</div>
    ${propStatusSummaryHtml(groups, 'Everything is set up')}
    ${propStatusRowsHtml(groups).replace(/<div style="font-size:11px;font-weight:600[^>]*>Settings<\/div>/, '')}
  </div>`;
}
// Summary of the loan statements, for the home office window.
function propLoanSummaryHtml(ho, r) {
  const c = r.byCat.find(x => x.name === ho.loanCat), L = c && c.loan;
  const toList = `<a href="#" onclick="closeModal();propTab='tax';propChecklistOpen=true;renderProperty();return false" style="color:var(--teal)">Tax → Year-end checklist</a>`;
  if (!propHoMortgageCats(ho).length && !ho.loanCat) return '';
  return `<div style="font-size:12px;font-weight:600;margin:14px 0 4px">Mortgage interest</div>
    ${!ho.loanCat ? `<div style="font-size:11px;color:var(--red,#d64545)">Set which category holds the mortgage repayments in Setup → Setup check, then load the loan statements in ${toList}.</div>`
    : L ? `${propRow(`Interest charged to ${fmtDay(L.coveredTo)}`, fmt(L.interest))}
      ${L.paidAfter ? propRow(`Repayments after that ${fmt(L.paidAfter)}${L.ratio != null ? ` × ${Math.round(L.ratio * 1000) / 10}% interest` : ''}`, L.ratio != null ? fmt(L.estimate) : '<span style="color:#d97706">full repayment counted</span>') : ''}
      ${propRow(`<strong>${escH(ho.loanCat)} counted</strong>`, `<strong>${fmt(L.total)}</strong>`)}
      <div style="font-size:11px;color:var(--text3);margin-top:4px">Load newer statements in ${toList}.</div>`
    : `<div style="font-size:11px;color:var(--red,#d64545)">No loan statements loaded, so the full repayments in ${escH(ho.loanCat)} are counted. Load them in ${toList}.</div>`}`;
}
// ── Calendar: day marks, travel, mixed-use usage ──
const PROP_DAY_TYPES = {
  cleaning: { label:'Clean',         icon:'🧹' },
  travel:   { label:'Travel',        icon:'🚗' },
  personal: { label:'Personal',      icon:'🏠', bg:'rgba(245,166,35,0.28)',  bar:'#e0951b', exclusive:true },
  family:   { label:'Family',        icon:'👪', bg:'rgba(155,89,182,0.25)',  bar:'#9b59b6', exclusive:true },
  booked:   { label:'Other booking', icon:'🛏', bg:'rgba(46,160,67,0.25)',   bar:'#2ea043', exclusive:true },
  // IRD: days the owner stays to repair damage caused by paying guests count as income-earning use.
  repair:   { label:'Repairs for guests', icon:'🔧', bg:'rgba(14,165,183,0.25)', bar:'#0ea5b7', exclusive:true },
  blocked:  { label:'Blocked',       icon:'⛔', bg:'rgba(128,128,128,0.25)', exclusive:true },
};
// Solid bar colours for stays drawn on the calendar.
const PROP_BOOKING_BAR = '#e8484e';
const PLATFORM_BAR = { airbnb: '#e8484e', bookabach: '#1a7ee6' };
// How shared costs are claimed. IRD (IR1021, holiday homes):
//  full       - no private use in the year: everything is deductible.
//  actualcost - some private use but unused for fewer than 62 days: claim for
//               the days rented or available (private and blocked days out).
//  mixeduse   - private and income use and unused 62+ days: the mixed-use asset
//               rules, income days / (income days + private days).
const PROP_BASES = {
  full:       { label: '100% deductible', long: 'No private use: all costs are deductible.' },
  actualcost: { label: 'Actual cost', long: 'Private use but unused for fewer than 62 days: shared costs are claimed for the days rented or available.' },
  mixeduse:   { label: 'Mixed-use', long: 'Private and income use and unused for 62 days or more: the mixed-use rules apply (income days ÷ income and private days).' },
};
const propBasisLabel = b => (PROP_BASES[b] || PROP_BASES.full).label;
// The basis is tested every tax year, so it's stored per year (basisByYear);
// deductionBasis is the default for years without their own.
function propBasisFor(s, ty) {
  const p = propSettings(s);
  return (p.basisByYear || {})[ty] || p.deductionBasis || 'full';
}
// Value for the mixed-use 2% test: the most recent of the council rating
// valuation and the purchase price, as at the end of the tax year.
function propValueAt(s, ty) {
  const p = propSettings(s), end = taxYearRange(ty).end;
  const opts = [];
  const rv = p.ratingValue || {};
  if (Number(rv.amount) > 0 && rv.date && rv.date < end) opts.push({ amount: Number(rv.amount), date: rv.date, source: 'Rating valuation' });
  if (Number(p.purchasePrice) > 0 && p.purchaseDate && p.purchaseDate < end) opts.push({ amount: Number(p.purchasePrice), date: p.purchaseDate, source: 'Purchase price' });
  return opts.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}
// First tax year the property has anything recorded in.
function propFirstYear(s) {
  let first = null;
  const see = iso => { if (iso && (!first || iso < first)) first = iso; };
  bookings.forEach(b => { if (b.streamId === s.id) see(b.checkIn); });
  transactions.forEach(t => { if (t.stream === s.id) see(dateToIso(t.date)); });
  propDays.forEach(d => { if (d.streamId === s.id) see(d.date); });
  return first ? taxYearOf(isoToDate(first)) : null;
}
// Mixed-use opt-out and loss quarantine for one year (IRD IR1021; subpart DG).
//  Opt-out: gross income from income-earning use under $4,000, or a loss with
//   that income under 2% of the property's value. Opting out leaves the year
//   out of the return entirely (no income, no expenses).
//  Quarantine: a loss with income under 2% of value can only be deducted up to
//   the income; the rest is carried forward and used in a later mixed-use year
//   with a profit, up to that profit.
// Kept separate from residential ring-fencing (per owner, non-mixed-use years).
const MUA_OPTOUT_INCOME = 4000, MUA_VALUE_PCT = 0.02;
function propMuaStep(s, ty, cur, open) {
  const val = propValueAt(s, ty);
  const income = cur.rent;
  const twoPct = val ? val.amount * MUA_VALUE_PCT : null;
  const lowIncome = income < MUA_OPTOUT_INCOME;
  const lossTest = cur.net < 0 && twoPct != null && income < twoPct;
  const optOutEligible = lowIncome || lossTest;
  const optedOut = optOutEligible && !!(propSettings(s).muaOptOut || {})[ty];
  let quarantined = 0, used = 0, taxNet = cur.net;
  if (optedOut) taxNet = 0;
  else if (lossTest) { quarantined = -cur.net; taxNet = 0; }
  else if (cur.net > 0 && open > 0) { used = Math.min(open, cur.net); taxNet = cur.net - used; }
  return { value: val, twoPct, income, lowIncome, lossTest, optOutEligible, optedOut, open, quarantined, used,
    close: round2(open - used + quarantined), taxNet: round2(taxNet), valueMissing: cur.net < 0 && !val };
}
// Quarantined balance brought forward into tax year ty.
function propMuaOpening(s, ty, matches) {
  const o = propSettings(s).muaOpening || {};
  const startTy = o.ty != null && o.ty !== '' ? Number(o.ty) : propFirstYear(s);
  if (startTy == null || ty < startTy) return 0;
  let bal = Number(o.amount) || 0;
  for (let y = startTy; y < ty; y++) {
    if (propBasisFor(s, y) !== 'mixeduse') continue; // carried unchanged through other years
    bal = propMuaStep(s, y, computePropPnL(s, y, matches, { noChain: true }), bal).close;
  }
  return bal;
}
function propDaysInYear(s, ty, type) {
  const { start, end } = taxYearRange(ty);
  return propDays.filter(d => d.streamId === s.id && d.date >= start && d.date < end && (!type || d.type === type));
}
// IRD kilometre rates are entered per tax year (they change most years):
// tier 1 covers the first 14,000 km of business travel, tier 2 the rest.
const KM_TIER1_LIMIT = 14000;
function propTravelForYear(s, ty) {
  const p = propSettings(s);
  const trips = propDaysInYear(s, ty, 'travel');
  const km = trips.reduce((a, d) => a + (Number(d.km ?? p.travelKm) || 0), 0);
  const r = (p.kmRates || {})[ty] || {};
  const t1 = Number(r.t1) || 0, t2 = Number(r.t2 ?? r.t1) || 0;
  // IRD: tier 1 applies to the business share of the first 14,000 km the
  // vehicle travels in the year. Without the car's total km, assume all of its
  // travel was for the property.
  const odoStart = Number(r.odoStart) || 0, odoEnd = Number(r.odoEnd) || 0;
  const carKm = odoEnd > odoStart && odoStart > 0 ? odoEnd - odoStart : (Number(r.carKm) || 0);
  const tier1Km = carKm > 0 ? KM_TIER1_LIMIT * Math.min(1, km / carKm) : KM_TIER1_LIMIT;
  const value = Math.min(km, tier1Km) * t1 + Math.max(0, km - tier1Km) * t2;
  return { trips: trips.length, km, value: round2(value), rateMissing: km > 0 && !t1, t1: r.t1, t2: r.t2, odoStart: r.odoStart, odoEnd: r.odoEnd, carKm: carKm || null, tier1Km: Math.round(tier1Km) };
}
// Days in the tax year by use. Income days are nights booked through an
// imported platform, "Other booking" marks and repair-for-guests days.
// Private use is personal and family stays (family count even if they pay),
// day visits, and any stay below 80% of market rent (flagged belowMarket on
// the booking or the mark).
function propUsageForYear(s, ty) { return propCached(`use:${s.id}:${ty}`, () => propUsageForYearRaw(s, ty)); }
function propUsageForYearRaw(s, ty) {
  const { start, end } = taxYearRange(ty);
  const days = daysBetween(start, end);
  const income = new Set(), personal = new Set(), family = new Set(), blocked = new Set(), dayVisits = new Set(), discounted = new Set(), repair = new Set();
  bookings.filter(b => b.streamId === s.id && !b.cancelled && b.nights).forEach(b => {
    const into = b.belowMarket ? discounted : income;
    for (let d = isoToDate(b.checkIn > start ? b.checkIn : start), e = isoToDate(b.checkOut < end ? b.checkOut : end); d < e; d.setDate(d.getDate() + 1)) into.add(dateToIso(d));
  });
  // A personal or family mark is a night stayed unless it is flagged dayOnly
  // (a visit with no overnight stay), which counts as a day of personal use.
  propDaysInYear(s, ty).forEach(d => {
    if (d.type === 'booked') (d.belowMarket ? discounted : income).add(d.date);
    else if (d.type === 'repair') repair.add(d.date);
    else if ((d.type === 'personal' || d.type === 'family') && d.dayOnly) dayVisits.add(d.date);
    else if (d.type === 'personal') personal.add(d.date);
    else if (d.type === 'family') family.add(d.date);
    else if (d.type === 'blocked') blocked.add(d.date);
  });
  const today = todayLocal();
  const privateSet = new Set([...personal, ...family, ...dayVisits, ...discounted]);
  const plannedPersonal = [...privateSet].filter(d => d > today).length;
  const personalDays = personal.size + family.size + dayVisits.size + discounted.size;
  const incomeDays = new Set([...income, ...repair]).size;
  const used = new Set([...income, ...repair, ...privateSet, ...blocked]);
  const unused = days - used.size;
  const share = (incomeDays + personalDays) ? incomeDays / (incomeDays + personalDays) : null;
  // Actual cost: the days rented or available, i.e. not private and not blocked.
  const availDays = days - new Set([...privateSet, ...blocked]).size;
  const availShare = days ? availDays / days : 1;
  const suggested = !personalDays ? 'full' : (unused >= 62 && incomeDays ? 'mixeduse' : 'actualcost');
  return { days, income: incomeDays, repair: repair.size, personal: personal.size, family: family.size, dayVisits: dayVisits.size, discounted: discounted.size,
    personalDays, plannedPersonal, blocked: blocked.size, unused, share, availDays, availShare, suggested };
}

let propCalMonth = null; // 'YYYY-MM'
let propCalMode = 'view';
function shiftPropCalMonth(n) {
  const [y, m] = propCalMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  propCalMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  propTaxYear = taxYearOf(d);
  renderProperty();
}
function setPropCalMode(m) { propCalMode = m; renderProperty(); }
// Calendar views: a timeline across all properties on wide screens, a list of
// what's coming on phones, and the month grid on both.
let propCalView = null, propTlStart = null, propTlSel = null;
const propCalViewNow = () => propCalView && (propCalView === 'month' || propCalView === (propIsWide() ? 'timeline' : 'agenda')) ? propCalView : (propIsWide() ? 'timeline' : 'agenda');
function setPropCalView(v) { propCalView = v; renderProperty(); }
function propCalSwitchHtml() {
  const v = propCalViewNow(), first = propIsWide() ? ['timeline', 'Timeline'] : ['agenda', 'List'];
  return `<div class="cv-switch">${[first, ['month', 'Month']].map(([k, l]) => `<button class="${v === k ? 'on' : ''}" onclick="setPropCalView('${k}')">${l}</button>`).join('')}</div>`;
}
function propCalModesHtml(s) {
  const modes = [['view','👁 View'], ...Object.entries(PROP_DAY_TYPES).map(([k, t]) => [k, `${t.icon} ${t.label}`])];
  const hint = propCalMode === 'view'
    ? 'Tap a day to see or edit it. Pick a mode to mark several days quickly.'
    : `Tap days to add or remove <strong>${PROP_DAY_TYPES[propCalMode].label}</strong>.${propCalMode==='cleaning' && propSettings(s).cleanAddsTravel!==false ? ' A trip is logged with each clean (change in Setup).' : ''}${['personal','family'].includes(propCalMode) ? ' Tap once for a <strong>night</strong>, twice for a day visit ☀, three times to clear. Mark each night stayed, not the day you leave.' : ''}${propCalMode==='booked' ? ' Tap each night booked, not the day the guests leave.' : ''}`;
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
      ${modes.map(([k, l]) => `<button onclick="setPropCalMode('${k}')" style="padding:5px 9px;font-size:12px;border-radius:16px;cursor:pointer;font-family:inherit;border:0.5px solid ${propCalMode===k?'var(--teal)':'var(--border2)'};background:${propCalMode===k?'var(--teal)':'var(--bg3)'};color:${propCalMode===k?'#fff':'var(--text)'}">${l}</button>`).join('')}
    </div><div style="font-size:11px;color:var(--text3);margin-bottom:8px">${hint}</div>`;
}
// Stays (runs of nights) for a property in [from, to): imported bookings and
// whole-night marks (personal, family, other booking, repairs).
function propStaysBetween(st, from, to) {
  const nightOf = {};
  propDays.filter(d => d.streamId === st.id && d.date >= from && d.date < to && ['personal', 'family', 'booked', 'repair'].includes(d.type) && !d.dayOnly)
    .forEach(d => nightOf[d.date] = { key: 'm:' + d.type, type: d.type, mark: d });
  bookings.filter(b => b.streamId === st.id && !b.cancelled && b.nights && b.checkIn < to && b.checkOut > from).forEach(b => {
    for (let d = isoToDate(b.checkIn), e = isoToDate(b.checkOut); d < e; d.setDate(d.getDate() + 1)) { const iso = dateToIso(d); if (iso >= from && iso < to) nightOf[iso] = { key: 'b:' + b.id, booking: b }; }
  });
  const stays = [];
  for (let iso = from; iso < to; iso = addDaysIso(iso, 1)) {
    const n = nightOf[iso]; if (!n) continue;
    const last = stays[stays.length - 1];
    if (last && last.key === n.key && last.end === iso) { last.end = addDaysIso(iso, 1); last.nights++; }
    else stays.push({ ...n, start: iso, end: addDaysIso(iso, 1), nights: 1 });
  }
  return stays;
}
function shiftPropTl(days) {
  if (days === 0) { const t = isoToDate(todayLocal()); t.setDate(t.getDate() - ((t.getDay() + 6) % 7) - 7); propTlStart = dateToIso(t); }
  else propTlStart = addDaysIso(propTlStart, days);
  renderProperty();
}
function propTlSelect(stId, bookingId) {
  if (propStreamId !== stId) propStreamId = stId;
  propTlSel = propTlSel === bookingId ? null : bookingId;
  renderProperty();
}
function propTlDay(stId, iso) {
  if (propStreamId !== stId) { propStreamId = stId; propTlSel = null; }
  propCalTap(iso);
}
// Side panel for the timeline and the desktop month view: the selected stay,
// or the year's use and how to work the calendar.
function propStayPanelHtml(s, where) {
  const extra = where === 'month' ? '' : '';
  const u = propUsageForYear(s, propTaxYear);
  const sel = propTlSel && bookings.find(b => b.id === propTlSel);
  let panel;
  if (sel) {
    const st = propertyStreams().find(x => x.id === sel.streamId) || s, matches = computePayoutMatches(st), bank = bookingBankStatus(sel, matches);
    const pays = propPayouts.filter(p => p.streamId === sel.streamId && (sel.payments || []).some(pm => pm.date === p.date));
    const deps = pays.map(p => matches.payoutTxn.get(p.id)).filter(Boolean);
    const acct = id => accounts.find(a => a.id === id)?.name || id;
    panel = `<div style="font-size:16px;font-weight:650">${escH(sel.guest || platformName(sel.platform))}</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px">${escH(platformName(sel.platform))} · ${fmtDay(sel.checkIn)} – ${fmtDay(sel.checkOut)} · ${sel.nights} night${sel.nights === 1 ? '' : 's'}${sel.belowMarket ? ' · below market (private)' : ''}</div>
      ${propRow('Guest paid', fmt(sel.gross || 0))}
      ${propRow(`${escH(platformName(sel.platform))} service fee`, '−' + fmt(sel.serviceFee || 0))}
      ${propRow('GST flat-rate credit', fmt(sel.hostTax || 0))}
      ${sel.adjustments ? propRow('Adjustments', fmtSigned(sel.adjustments)) : ''}
      ${propRow('<strong>Payout</strong>', `<strong>${fmt(sel.payout || 0)}</strong>`)}
      ${sel.nights ? propRow('Earned per night', fmt((sel.payout || 0) / sel.nights)) : ''}
      <div style="margin-top:10px;border-radius:8px;padding:9px 11px;font-size:12.5px;line-height:1.45;${bank === 'found' ? 'background:rgba(29,184,138,0.14);color:var(--teal)' : bank === 'missing' ? 'background:rgba(224,82,82,0.14);color:var(--red)' : 'background:var(--bg3);color:var(--text2)'}">
        ${bank === 'found' ? `✓ In the bank${deps.length ? ': ' + deps.map(t => `${fmt(t.amount)} into ${escH(acct(t.account))} on ${fmtDay(dateToIso(t.date))}`).join('; ') : ''}.`
          : bank === 'missing' ? 'Payout not found in the bank yet. Import the account it was paid into, or check Bookings.'
          : `Upcoming. Payout due about ${fmtDay(addDaysIso(sel.checkIn, 1))}.`}</div>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-secondary" style="flex:1;font-size:12.5px" onclick="openBookingDetail('${escH(sel.id)}')">Details</button><button class="btn btn-secondary" style="flex:1;font-size:12.5px" onclick="propTlSel=null;renderProperty()">Close</button></div>`;
  } else {
    panel = `<div style="font-size:14px;font-weight:650;margin-bottom:6px">${escH(s.name)}</div>
      <div style="font-size:12.5px;color:var(--text2);line-height:1.55;margin-bottom:10px">Click a stay to see its payout and whether it's reached the bank. Click a day to mark it, or pick a mode above to mark several.${extra}</div>
      ${propRow('Income nights', u.income)}${propRow('Private', u.personalDays)}${propRow('Unused', u.unused)}
      ${u.share != null && u.personalDays ? propRow('Income share', Math.round(u.share * 1000) / 10 + '%') : ''}
      <div style="font-size:11px;color:var(--text3);margin-top:6px">Tax year ${taxYearLabel(propTaxYear)} so far.</div>`;
  }
  return panel;
}
function propTimelineHtml(s) {
  const W = 26, DAYS = 42;
  if (!propTlStart) { const t = isoToDate(todayLocal()); t.setDate(t.getDate() - ((t.getDay() + 6) % 7) - 7); propTlStart = dateToIso(t); }
  const from = propTlStart, to = addDaysIso(from, DAYS), today = todayLocal();
  propTaxYear = taxYearOf(isoToDate(addDaysIso(from, 21)));
  const idx = iso => daysBetween(from, iso);
  const days = Array.from({ length: DAYS }, (_, i) => addDaysIso(from, i));
  const isWe = iso => [0, 6].includes(isoToDate(iso).getDay());
  const cols = `120px repeat(${DAYS}, ${W}px)`;
  const monthTxt = (() => { const a = isoToDate(from), b = isoToDate(addDaysIso(to, -1)); const f = d => d.toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' }); return a.getMonth() === b.getMonth() ? f(a) : `${a.toLocaleDateString('en-NZ', { month: 'short' })} – ${f(b)}`; })();
  let h = `<div class="tl-lab" style="font-size:11px;color:var(--text3)">${monthTxt}</div>`;
  days.forEach(iso => { const d = isoToDate(iso); h += `<div class="tl-day ${isWe(iso) ? 'we' : ''} ${iso === today ? 'today' : ''}">${'SMTWTFS'[d.getDay()]}<b>${d.getDate()}</b></div>`; });
  propertyStreams().forEach(st => {
    const matches = computePayoutMatches(st), stays = propStaysBetween(st, from, to);
    const cur = st.id === s.id;
    h += `<div class="tl-lab prop" onclick="setPropStream(${st.id})" style="${cur ? 'color:var(--teal)' : ''}">${escH(st.name)}</div><div class="tl-lane" style="grid-column:2 / -1">`;
    days.forEach((iso, i) => { h += `<button class="tl-cell ${isWe(iso) ? 'we' : ''}" style="left:${i * W}px;width:${W}px" onclick="propTlDay(${st.id}, '${iso}')" aria-label="${escH(st.name)} ${fmtDay(iso)}"></button>`; });
    stays.forEach(x => {
      const a = Math.max(0, idx(x.start)), b = Math.min(DAYS, idx(x.end));
      const left = a * W + 2, width = (b - a) * W - 4; if (width <= 0) return;
      if (x.booking) {
        const bk = x.booking, bank = bookingBankStatus(bk, matches);
        h += `<button class="tl-bar ${propTlSel === bk.id ? 'sel' : ''}" style="left:${left}px;width:${width}px;background:${PLATFORM_BAR[bk.platform] || PROP_BOOKING_BAR}${bk.belowMarket ? ';background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.18) 0 4px,transparent 4px 8px)' : ''}" onclick="propTlSelect(${st.id}, '${escH(bk.id)}')" title="${escH(bk.guest || platformName(bk.platform))} · ${fmtDay(bk.checkIn)} – ${fmtDay(bk.checkOut)} · ${fmt(bk.payout || 0)}"><b>${escH(bk.guest || platformName(bk.platform))}</b>${fmt(bk.payout || 0).replace(/\.00$/, '')}${bank === 'found' ? '<span class="tick">✓</span>' : ''}</button>`;
      } else {
        const t = PROP_DAY_TYPES[x.type];
        h += `<button class="tl-bar" style="left:${left}px;width:${width}px;background:${t.bar}" onclick="propTlDay(${st.id}, '${x.start}')"><b>${t.icon} ${escH(t.label)}</b>${x.nights} night${x.nights === 1 ? '' : 's'}${x.mark?.belowMarket ? ' · below market' : ''}</button>`;
      }
    });
    h += `</div><div class="tl-lab">Night use</div><div class="tl-lane small" style="grid-column:2 / -1">`;
    const blocked = new Set(propDays.filter(d => d.streamId === st.id && d.type === 'blocked').map(d => d.date));
    const use = {};
    stays.forEach(x => { for (let iso = x.start; iso < x.end; iso = addDaysIso(iso, 1)) use[iso] = x.booking ? (x.booking.belowMarket ? 'private' : 'income') : (x.type === 'personal' ? 'private' : x.type === 'family' ? 'family' : x.mark?.belowMarket ? 'private' : 'income'); });
    const useCol = { income: 'var(--teal)', private: PROP_DAY_TYPES.personal.bar, family: PROP_DAY_TYPES.family.bar, blocked: 'var(--text3)' };
    days.forEach((iso, i) => { const u = use[iso] || (blocked.has(iso) ? 'blocked' : null); h += `<span class="tl-use" style="left:${i * W + 5}px;width:${W - 10}px;background:${u ? useCol[u] : 'var(--bg3)'}"></span>`; });
    h += `</div><div class="tl-lab">Earned / night</div><div class="tl-lane small" style="grid-column:2 / -1">`;
    stays.filter(x => x.booking && x.booking.nights).forEach(x => {
      const a = Math.max(0, idx(x.start)), b = Math.min(DAYS, idx(x.end));
      if (b - a < 1) return;
      h += `<span class="tl-rate" style="left:${a * W}px;width:${(b - a) * W}px">${fmt((x.booking.payout || 0) / x.booking.nights).replace(/\.\d\d$/, '')}</span>`;
    });
    h += `</div><div class="tl-lab">Cleans &amp; trips</div><div class="tl-lane small" style="grid-column:2 / -1">`;
    const icons = {};
    propDays.filter(d => d.streamId === st.id && d.date >= from && d.date < to && (d.type === 'cleaning' || d.type === 'travel' || d.dayOnly)).forEach(d => { (icons[d.date] = icons[d.date] || []).push(d.dayOnly ? '☀' : PROP_DAY_TYPES[d.type].icon); });
    Object.entries(icons).forEach(([iso, ic]) => { h += `<span class="tl-ico" style="left:${idx(iso) * W + 2}px">${ic.join('')}</span>`; });
    h += `</div>`;
  });
  const u = propUsageForYear(s, propTaxYear);
  const panel = propStayPanelHtml(s, 'timeline');
  const legend = `<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text3);padding:10px 12px;border-top:0.5px solid var(--border)">
      ${Object.entries(PLATFORM_BAR).map(([pl, c]) => `<span><span style="display:inline-block;width:12px;height:8px;border-radius:2px;background:${c};margin-right:5px"></span>${platformName(pl)}</span>`).join('')}
      ${['personal', 'family', 'booked', 'repair'].map(k => `<span><span style="display:inline-block;width:12px;height:8px;border-radius:2px;background:${PROP_DAY_TYPES[k].bar};margin-right:5px"></span>${PROP_DAY_TYPES[k].label}</span>`).join('')}
      <span>✓ payout in the bank</span><span>🧹 clean · 🚗 trip · ☀ day visit</span></div>`;
  return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
      ${propCalSwitchHtml()}
      <div style="display:flex;gap:6px;align-items:center"><button class="btn btn-secondary" style="padding:5px 10px" onclick="shiftPropTl(-14)" aria-label="Earlier">‹</button><button class="btn btn-secondary" style="padding:5px 12px;font-size:12.5px" onclick="shiftPropTl(0)">Today</button><button class="btn btn-secondary" style="padding:5px 10px" onclick="shiftPropTl(14)" aria-label="Later">›</button></div>
      <div style="display:flex;gap:6px;font-size:12px;margin-left:auto">
        <span style="background:var(--bg3);border-radius:8px;padding:5px 9px;color:var(--text2)">Income nights <b style="color:var(--text)">${u.income}</b></span>
        <span style="background:var(--bg3);border-radius:8px;padding:5px 9px;color:var(--text2)">Private <b style="color:var(--text)">${u.personalDays}</b></span>
        <span style="background:var(--bg3);border-radius:8px;padding:5px 9px;color:var(--text2)">Unused <b style="color:var(--text)">${u.unused}</b></span>
        ${u.share != null && u.personalDays ? `<span style="background:var(--bg3);border-radius:8px;padding:5px 9px;color:var(--text2)">Income share <b style="color:var(--text)">${Math.round(u.share * 100)}%</b></span>` : ''}
      </div></div>
    ${propCalModesHtml(s)}
    <div class="tl-wrap">
      <div class="card tl-card" style="margin:0"><div class="tl-scroll"><div class="tl-grid" style="grid-template-columns:${cols}">${h}</div></div>${legend}</div>
      <div class="card" style="margin:0">${panel}</div>
    </div>
    <div style="height:12px"></div>
    ${propUsageCardHtml(s)}`;
}
// Phone: what's coming up, day by day.
function propAgendaHtml(s) {
  const today = todayLocal(), until = addDaysIso(today, 120);
  const items = [];
  bookings.filter(b => b.streamId === s.id && !b.cancelled && b.checkOut > today && b.checkIn < until).forEach(b => items.push({ d: b.checkIn < today ? today : b.checkIn, col: PLATFORM_BAR[b.platform] || PROP_BOOKING_BAR,
    title: b.checkIn < today ? `${escH(b.guest || platformName(b.platform))} staying` : `${escH(b.guest || platformName(b.platform))} arrives`,
    sub: `${escH(platformName(b.platform))} · ${b.nights} night${b.nights === 1 ? '' : 's'} · leaves ${fmtDay(b.checkOut)}${b.belowMarket ? ' · below market' : ''}`, amt: b.payout, on: `openBookingDetail('${escH(b.id)}')` }));
  const marks = propDays.filter(d => d.streamId === s.id && d.date >= today && d.date < until);
  ['personal', 'family', 'booked', 'repair', 'blocked'].forEach(type => {
    const ds = marks.filter(d => d.type === type && !d.dayOnly).map(d => d.date).sort();
    const runs = []; ds.forEach(d => { const r = runs[runs.length - 1]; if (r && daysBetween(r.to, d) === 1) { r.to = d; r.n++; } else runs.push({ from: d, to: d, n: 1 }); });
    const t = PROP_DAY_TYPES[type];
    runs.forEach(r => items.push({ d: r.from, col: t.bar || 'var(--text3)', title: `${t.icon} ${type === 'personal' ? 'Owners staying' : type === 'family' ? 'Family staying' : t.label}`,
      sub: type === 'blocked' ? `${r.n} day${r.n === 1 ? '' : 's'} not available` : `${r.n} night${r.n === 1 ? '' : 's'}${type === 'personal' || type === 'family' ? ' · private use' : ''}`, on: `openPropDay('${r.from}')` }));
  });
  const byDay = {};
  marks.filter(d => d.type === 'cleaning' || d.type === 'travel' || d.dayOnly).forEach(d => (byDay[d.date] = byDay[d.date] || []).push(d));
  Object.entries(byDay).forEach(([iso, ds]) => {
    const parts = ds.map(d => d.dayOnly ? '☀ Day visit' : `${PROP_DAY_TYPES[d.type].icon} ${d.type === 'cleaning' ? 'Clean' : 'Trip'}`);
    const sub = ds.map(d => d.type === 'cleaning' && d.cost ? `clean ${fmt(d.cost)}` : d.type === 'travel' && (d.km ?? propSettings(s).travelKm) != null ? `${d.km ?? propSettings(s).travelKm} km` : '').filter(Boolean).join(' · ');
    items.push({ d: iso, col: 'var(--teal)', title: parts.join(' + '), sub, on: `openPropDay('${iso}')` });
  });
  items.sort((a, b) => a.d.localeCompare(b.d));
  let last = '', out = '';
  items.forEach(x => {
    if (x.d !== last) { out += `<div class="ag-day">${x.d === today ? 'Today' : isoToDate(x.d).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}</div>`; last = x.d; }
    out += `<button class="ag-it" onclick="${x.on}"><i style="background:${x.col}"></i><p>${x.title}${x.sub ? `<small>${x.sub}</small>` : ''}</p>${x.amt ? `<span style="font-weight:600;font-variant-numeric:tabular-nums">${fmt(x.amt)}</span>` : ''}</button>`;
  });
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">${propCalSwitchHtml()}<span style="font-size:11px;color:var(--text3)">Next 4 months</span></div>
    ${out || '<div class="card" style="font-size:13px;color:var(--text3);text-align:center;padding:20px">Nothing coming up. Switch to Month to mark days.</div>'}
    <div style="font-size:11px;color:var(--text3);margin:8px 2px 12px">Tap an item to open it. To mark several days, switch to Month.</div>
    ${propUsageCardHtml(s)}`;
}
function propCalendarHtml(s) {
  const view = propCalViewNow();
  if (view === 'timeline') return propTimelineHtml(s);
  if (view === 'agenda') return propAgendaHtml(s);
  if (!propCalMonth) propCalMonth = todayLocal().slice(0, 7);
  const [y, m] = propCalMonth.split('-').map(Number);
  propTaxYear = taxYearOf(new Date(y, m - 1, 1)); // the use summary follows the month shown
  const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first grid
  const monthStart = `${propCalMonth}-01`, monthEnd = dateToIso(new Date(y, m, 1));
  // Who stays each night, from a month before (for stays that run into this
  // month) to the end of the month. Imported bookings win over marks.
  const winStart = (() => { const d = isoToDate(monthStart); d.setDate(d.getDate() - 40); return dateToIso(d); })();
  const winEnd = (() => { const d = isoToDate(monthEnd); d.setDate(d.getDate() + 40); return dateToIso(d); })();
  const nightOf = {}; // iso -> { key, booking?, type? }
  propDays.filter(d => d.streamId === s.id && d.date >= winStart && d.date < winEnd && ['personal','family','booked'].includes(d.type) && !d.dayOnly)
    .forEach(d => nightOf[d.date] = { key: 'm:' + d.type, type: d.type });
  bookings.filter(b => b.streamId === s.id && !b.cancelled && b.nights && b.checkIn < winEnd && b.checkOut > winStart).forEach(b => {
    for (let d = isoToDate(b.checkIn), e = isoToDate(b.checkOut); d < e; d.setDate(d.getDate() + 1)) nightOf[dateToIso(d)] = { key: 'b:' + b.id, booking: b };
  });
  const marks = {};
  propDays.filter(d => d.streamId === s.id && d.date >= monthStart && d.date < monthEnd).forEach(d => (marks[d.date] = marks[d.date] || []).push(d));
  // Group consecutive nights with the same key into stays.
  const stays = [];
  for (let d = isoToDate(winStart), e = isoToDate(winEnd); d < e; d.setDate(d.getDate() + 1)) {
    const iso = dateToIso(d), n = nightOf[iso];
    const last = stays[stays.length - 1];
    const nextIso = (() => { const x = new Date(d); x.setDate(x.getDate() + 1); return dateToIso(x); })();
    if (!n) continue;
    if (last && last.key === n.key && last.end === iso) { last.end = nextIso; last.nights++; }
    else stays.push({ ...n, start: iso, end: nextIso, nights: 1 });
  }
  // A booking's full stay may run past the month, so use its real dates for the label.
  stays.forEach(st => { if (st.booking) { st.end = st.booking.checkOut; st.nights = st.booking.nights; } });
  // Grid position: slot = lead + day - 1. A bar runs from the middle of the
  // first night's day to the middle of the check-out day.
  const total = lead + daysIn, rows = Math.ceil(total / 7);
  const slot = iso => lead + Number(iso.slice(8)) - 1;
  const colW = '((100% - 24px) / 7)';
  const xPos = x => { const c = Math.min(Math.floor(x), 6), f = x - c; return `(${c} * (${colW} + 4px) + ${f} * ${colW})`; };
  const bars = Array.from({ length: rows }, () => []);
  const wide = propIsWide(), monthMatches = computePayoutMatches(s);
  stays.filter(st => st.end > monthStart && st.start < monthEnd).forEach(st => {
    const clipL = st.start < monthStart, clipR = st.end >= monthEnd;
    const a0 = clipL ? lead : slot(st.start) + 0.5, b0 = clipR ? total : slot(st.end) + 0.5;
    const colour = st.booking ? (PLATFORM_BAR[st.booking.platform] || PROP_BOOKING_BAR) : PROP_DAY_TYPES[st.type].bar;
    const nightsTxt = `${st.nights} night${st.nights === 1 ? '' : 's'}`;
    for (let r = Math.floor(a0 / 7); r < rows && r * 7 < b0; r++) {
      const a = Math.max(a0, r * 7), b = Math.min(b0, r * 7 + 7);
      if (b <= a) continue;
      const roundL = a === a0 && !clipL, roundR = b === b0 && !clipR;
      const w = b - a;
      const bk = st.booking;
      const who = bk ? (bk.guest || platformName(bk.platform)) + (bk.belowMarket ? ' (below market)' : '') : PROP_DAY_TYPES[st.type].label;
      const showFull = wide ? w >= 0.9 : w >= 2.5;
      const label = !(roundL || clipL && a === a0) ? '' // label only on the first piece of a stay
        : showFull ? `${bk ? '' : PROP_DAY_TYPES[st.type].icon + ' '}${escH(who)}${bk ? ' · ' + fmt(bk.payout || 0).replace(/\.00$/, '') : ' · ' + nightsTxt}`
        : w >= 1 ? `${bk ? escH(who[0]) : PROP_DAY_TYPES[st.type].icon} ${st.nights}n` : '';
      const rad = wide ? 11 : 9;
      bars[r].push(`<${bk ? 'button' : 'div'} class="pcal-bar${bk ? ' click' : ''}${bk && propTlSel === bk.id ? ' sel' : ''}" ${bk ? `onclick="event.stopPropagation();propTlSelect(${s.id}, '${escH(bk.id)}')" title="${escH(who)} · ${fmtDay(bk.checkIn)} – ${fmtDay(bk.checkOut)} · ${fmt(bk.payout || 0)}"` : ''} style="left:calc(${xPos(a - r * 7)} + ${roundL ? 2 : 0}px);right:calc(100% - ${xPos(b - r * 7)} + ${roundR ? 2 : 0}px);background:${colour}${bk && bk.belowMarket ? ';background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.18) 0 4px,transparent 4px 8px)' : ''};border-radius:${roundL ? rad : 0}px ${roundR ? rad : 0}px ${roundR ? rad : 0}px ${roundL ? rad : 0}px">${label}${bk && roundR && bookingBankStatus(bk, monthMatches) === 'found' && w >= 0.9 ? ' ✓' : ''}</${bk ? 'button' : 'div'}>`);
    }
  });
  const today = todayLocal();
  const cellHtml = [];
  for (let i = 0; i < lead; i++) cellHtml.push('<div></div>');
  for (let day = 1; day <= daysIn; day++) {
    const iso = `${propCalMonth}-${String(day).padStart(2, '0')}`;
    const ms = marks[iso] || [];
    const excl = ms.find(d => PROP_DAY_TYPES[d.type]?.exclusive);
    // Day visits and blocked days have no night, so they tint the day itself.
    const bg = excl && (excl.dayOnly || excl.type === 'blocked') ? PROP_DAY_TYPES[excl.type].bg : 'var(--bg3)';
    const icons = ms.filter(d => !(PROP_DAY_TYPES[d.type]?.exclusive && !d.dayOnly && d.type !== 'blocked'))
      .map(d => d.dayOnly ? '☀' : (PROP_DAY_TYPES[d.type]?.icon || '')).join('');
    const we = [0, 6].includes(new Date(y, m - 1, day).getDay());
    cellHtml.push(`<button class="pcal-cell${we ? ' we' : ''}" onclick="propCalTap('${iso}')" style="border:${iso===today?'1.5px solid var(--teal)':'0.5px solid var(--border)'};background:${bg}">
      <span class="dn" style="font-weight:500${iso === today ? ';color:var(--teal)' : ''}">${day}</span>
      <span style="font-size:10px;line-height:1;white-space:nowrap;overflow:hidden;max-width:100%">${icons}</span>
    </button>`);
  }
  while (cellHtml.length < rows * 7) cellHtml.push('<div></div>');
  let cells = '';
  for (let r = 0; r < rows; r++) cells += `<div style="position:relative;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">${cellHtml.slice(r * 7, r * 7 + 7).join('')}${bars[r].join('')}</div>`;
  const modes = [['view','👁 View'], ...Object.entries(PROP_DAY_TYPES).map(([k, t]) => [k, `${t.icon} ${t.label}`])];
  const modeHint = propCalMode === 'view'
    ? 'Tap a day to see or edit it. Pick a mode to mark several days quickly.'
    : `Tap days to add or remove <strong>${PROP_DAY_TYPES[propCalMode].label}</strong>.${propCalMode==='cleaning' && propSettings(s).cleanAddsTravel!==false ? ' A trip is logged with each clean (change in Setup).' : ''}${['personal','family'].includes(propCalMode) ? ' Tap once for a <strong>night</strong> (the bar runs to the next morning), twice for a day visit ☀, three times to clear. Mark each night stayed, not the day you leave.' : ''}${propCalMode==='booked' ? ' Tap each night booked, not the day the guests leave.' : ''}`;
  const monthLabelTxt = first.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' });
  // The month at a glance.
  let mNights = 0, mEarned = 0;
  bookings.filter(b => b.streamId === s.id && !b.cancelled && !b.belowMarket && b.nights).forEach(b => { const r = bookingShareInRange(b, monthStart, monthEnd); mNights += r.nights; mEarned += (b.payout || 0) * r.share; });
  const mPrivate = propDays.filter(d => d.streamId === s.id && d.date >= monthStart && d.date < monthEnd && (d.type === 'personal' || d.type === 'family') && !d.dayOnly).length;
  const mOther = propDays.filter(d => d.streamId === s.id && d.date >= monthStart && d.date < monthEnd && d.type === 'booked' && !d.belowMarket).length;
  const stats = `<div class="pcal-stats"><span>Booked <b>${mNights + mOther}</b> night${mNights + mOther === 1 ? '' : 's'}</span><span>Earned <b>${fmt(mEarned).replace(/\.\d\d$/, '')}</b></span><span>Private <b>${mPrivate}</b></span><span>Occupancy <b>${Math.round((mNights + mOther) / daysIn * 100)}%</b></span></div>`;
  return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">${propCalSwitchHtml()}${wide ? stats : ''}</div>
    ${wide ? '<div class="tl-wrap"><div>' : ''}<div class="card" style="padding:12px${wide ? ';margin:0' : ''}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <button onclick="shiftPropCalMonth(-1)" style="background:var(--bg3);border:0.5px solid var(--border2);color:var(--text);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">&#8249;</button>
        <span style="font-size:15px;font-weight:600">${monthLabelTxt}</span>
        <button onclick="shiftPropCalMonth(1)" style="background:var(--bg3);border:0.5px solid var(--border2);color:var(--text);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">&#8250;</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        ${modes.map(([k, l]) => `<button onclick="setPropCalMode('${k}')" style="padding:5px 9px;font-size:12px;border-radius:16px;cursor:pointer;font-family:inherit;border:0.5px solid ${propCalMode===k?'var(--teal)':'var(--border2)'};background:${propCalMode===k?'var(--teal)':'var(--bg3)'};color:${propCalMode===k?'#fff':'var(--text)'}">${l}</button>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px">${modeHint}</div>
      <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;font-size:10px;color:var(--text3);text-align:center;margin-bottom:4px">${['M','T','W','T','F','S','S'].map(d => `<span>${d}</span>`).join('')}</div>
      <div style="display:flex;flex-direction:column;gap:4px">${cells}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--text3);margin-top:10px">
        ${Object.entries(PLATFORM_BAR).map(([p, c]) => `<span><span style="display:inline-block;width:14px;height:8px;border-radius:4px;background:${c};vertical-align:middle"></span> ${platformName(p)}</span>`).join('')}
        ${['booked','personal','family','repair'].map(k => `<span><span style="display:inline-block;width:14px;height:8px;border-radius:4px;background:${PROP_DAY_TYPES[k].bar};vertical-align:middle"></span> ${PROP_DAY_TYPES[k].label}</span>`).join('')}
        <span>☀ Day visit</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${PROP_DAY_TYPES.blocked.bg};vertical-align:middle"></span> Blocked</span>
      </div>
      ${wide ? '' : `<div style="margin-top:10px">${stats}</div>`}
    </div>
    ${wide ? `</div><div class="card" style="margin:0">${propStayPanelHtml(s, 'month')}</div></div><div style="height:12px"></div>` : ''}
    ${propUsageCardHtml(s)}`;
}
function propUsageCardHtml(s) {
  const u = propUsageForYear(s, propTaxYear);
  const t = propTravelForYear(s, propTaxYear);
  const cleans = propDaysInYear(s, propTaxYear, 'cleaning');
  const inp = 'width:70px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:13px;padding:5px 6px;text-align:right';
  const chosen = propBasisFor(s, propTaxYear);
  const mixedNote = `Suggested basis: <strong style="color:var(--text2)">${propBasisLabel(u.suggested)}</strong>. ${PROP_BASES[u.suggested].long}${chosen !== u.suggested ? ` Setup has ${propBasisLabel(chosen)}: check with your accountant.` : ''}`;
  return `<div class="card">
      <div class="card-title" style="margin-bottom:8px">Tax year ${taxYearLabel(propTaxYear)} use</div>
      ${propRow('Income nights', `${u.income}${u.repair ? ` <span style="color:var(--text3)">(incl. ${u.repair} repair day${u.repair === 1 ? '' : 's'})</span>` : ''}`)}
      ${propRow('Personal nights', `${u.personal}${u.family ? ` + ${u.family} family` : ''}${u.plannedPersonal ? ` <span style="color:var(--text3)">(${u.plannedPersonal} planned)</span>` : ''}`)}
      ${u.dayVisits ? propRow('Personal day visits', u.dayVisits) : ''}
      ${u.discounted ? propRow('Below-market stays (private)', u.discounted) : ''}
      ${propRow('Blocked', u.blocked)}
      ${propRow('Unused', u.unused)}
      ${u.personalDays ? propRow('Rented or available', `${u.availDays} of ${u.days} days`) : ''}
      ${u.share != null && u.personalDays ? propRow('Income share of use', `${Math.round(u.share * 1000) / 10}%`) : ''}
      <div style="font-size:11px;color:var(--text3);margin-top:8px">${mixedNote} Family stays count as private use even if they pay. A stay by anyone else below 80% of market rent counts as private too: tick it on the day. Days spent fixing damage caused by guests count as income days.</div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Trips and cleans</div>
      ${propRow('Cleans logged', `${cleans.length}${cleans.some(d => d.cost) ? ` · ${fmt(cleans.reduce((a, d) => a + (Number(d.cost) || 0), 0))} paid` : ''}`)}
      ${propRow('Trips logged', `${t.trips} · ${t.km.toLocaleString('en-NZ')} km`)}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:13px">
        <span style="color:var(--text2)">IRD km rate ${taxYearLabel(propTaxYear)}</span>
        <span style="display:flex;gap:6px;align-items:center"><input type="number" step="0.01" min="0" placeholder="tier 1" value="${t.t1 ?? ''}" style="${inp}" onchange="setPropKmRate('t1', this.value)"><input type="number" step="0.01" min="0" placeholder="tier 2" value="${t.t2 ?? ''}" style="${inp}" onchange="setPropKmRate('t2', this.value)"></span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:13px">
        <span style="color:var(--text2)">Odometer on 1 April</span>
        <input type="number" step="1" min="0" placeholder="km" value="${t.odoStart ?? ''}" style="${inp};width:100px" onchange="setPropKmRate('odoStart', this.value)">
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:13px">
        <span style="color:var(--text2)">Odometer on 31 March</span>
        <input type="number" step="1" min="0" placeholder="km" value="${t.odoEnd ?? ''}" style="${inp};width:100px" onchange="setPropKmRate('odoEnd', this.value)">
      </div>
      ${t.carKm ? propRow("Car's total km this year", t.carKm.toLocaleString('en-NZ')) : ''}
      ${propRow('<strong>Travel claim</strong>', t.rateMissing ? '<span style="color:var(--red,#e5484d)">enter the km rate</span>' : `<strong>${fmt(t.value)}</strong>`)}
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Tier 1 applies to the property's share of the first 14,000 km the car travels in the year${t.carKm ? ` (${t.tier1Km.toLocaleString('en-NZ')} km here)` : ''}, tier 2 to the rest. ${t.carKm ? '' : 'Without both odometer readings, all trips up to 14,000 km get tier 1. '}IRD publishes new rates each year.${propSettings(s).travelKm ? '' : ' Set the default trip distance in Setup.'}</div>
    </div>`;
}
function setPropKmRate(tier, val) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  const rates = { ...(p.kmRates || {}) };
  const yr = { ...(rates[propTaxYear] || {}) };
  if (val === '' || isNaN(Number(val))) delete yr[tier]; else yr[tier] = Number(val);
  rates[propTaxYear] = yr;
  s.property = { ...p, kmRates: rates };
  scheduleSave(); renderProperty();
}
function propDayId(s, date, type) { return `${s.id}:${date}:${type}`; }
function addPropDay(s, date, type, extra = {}) {
  const id = propDayId(s, date, type);
  if (propDays.some(d => d.id === id)) return;
  propDays.push({ id, streamId: s.id, date, type, ...extra });
  reviveTombstone('propDays', id);
}
function removePropDay(id) {
  if (!propDays.some(d => d.id === id)) return;
  propDays = propDays.filter(d => d.id !== id);
  tombstone('propDays', id);
}
function propCalTap(iso) {
  const s = currentPropStream(); if (!s) return;
  if (propCalMode === 'view') { openPropDay(iso); return; }
  const type = propCalMode, id = propDayId(s, iso, type);
  const existing = propDays.find(d => d.id === id);
  if (existing && (type === 'personal' || type === 'family') && !existing.dayOnly) {
    existing.dayOnly = true; // second tap: day visit, no overnight stay
  } else if (existing) {
    removePropDay(id);
  } else {
    // Personal / family / other booking / blocked are mutually exclusive for a day.
    if (PROP_DAY_TYPES[type].exclusive) Object.keys(PROP_DAY_TYPES).filter(k => PROP_DAY_TYPES[k].exclusive).forEach(k => removePropDay(propDayId(s, iso, k)));
    addPropDay(s, iso, type);
    if (type === 'cleaning' && propSettings(s).cleanAddsTravel !== false) addPropDay(s, iso, 'travel');
  }
  scheduleSave(); renderProperty();
}
function openPropDay(iso) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  const b = bookings.find(x => x.streamId === s.id && !x.cancelled && x.nights && x.checkIn <= iso && x.checkOut > iso);
  const ms = propDays.filter(d => d.streamId === s.id && d.date === iso);
  const has = t => ms.find(d => d.type === t);
  const excl = ms.find(d => PROP_DAY_TYPES[d.type]?.exclusive)?.type || '';
  document.getElementById('modal-title').textContent = fmtDay(iso);
  document.getElementById('modal-body').innerHTML = `
    ${b ? `<div style="font-size:13px;margin-bottom:10px;padding:8px 10px;background:var(--bg3);border-radius:var(--radius-sm)">${escH(platformName(b.platform))} booking ·${fmtDay(b.checkIn)} → ${fmtDay(b.checkOut)} · ${fmt(b.payout)}</div>` : ''}
    <div class="input-group"><label>Day use</label><select id="pd-use">
      <option value="" ${!excl?'selected':''}>${b ? `Booked (${escH(platformName(b.platform))})` : 'Not set'}</option>
      ${['personal','family','booked','repair','blocked'].map(k => `<option value="${k}" ${excl===k?'selected':''}>${PROP_DAY_TYPES[k].icon} ${PROP_DAY_TYPES[k].label}</option>`).join('')}
    </select></div>
    <label style="display:flex;align-items:flex-start;gap:8px;font-size:14px;margin-bottom:10px"><input type="checkbox" id="pd-below" style="margin-top:3px" ${(b && !excl ? b.belowMarket : ms.find(d => d.type === 'booked')?.belowMarket) ? 'checked' : ''}> <span>Rent below 80% of market rate <span style="display:block;font-size:12px;color:var(--text3)">For ${b ? 'this booking or ' : ''}an "Other booking". IRD counts it as private use.${b ? ' Applies to the whole booking.' : ''}</span></span></label>
    <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:10px"><input type="checkbox" id="pd-dayonly" ${ms.find(d => PROP_DAY_TYPES[d.type]?.exclusive)?.dayOnly ? 'checked' : ''}> ☀ Day visit only (no overnight stay, personal or family)</label>
    <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:6px"><input type="checkbox" id="pd-clean" ${has('cleaning')?'checked':''}> 🧹 Clean</label>
    <div class="input-group"><label>Amount paid for this clean ($, leave blank if you did it yourself)</label><input type="number" id="pd-cost" min="0" step="0.01" value="${has('cleaning')?.cost ?? ''}"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:6px"><input type="checkbox" id="pd-travel" ${has('travel')?'checked':''}> 🚗 Trip to the property</label>
    <div class="input-group"><label>Return trip distance (km)</label><input type="number" id="pd-km" min="0" step="1" value="${has('travel')?.km ?? ''}" placeholder="${p.travelKm ?? ''}"></div>`;
  const btn = document.getElementById('modal-confirm');
  btn.textContent = 'Save';
  btn.onclick = () => {
    const use = document.getElementById('pd-use').value;
    ['personal','family','booked','repair','blocked'].forEach(k => { if (k !== use) removePropDay(propDayId(s, iso, k)); });
    const below = document.getElementById('pd-below').checked;
    if (use) {
      addPropDay(s, iso, use);
      const u = propDays.find(x => x.id === propDayId(s, iso, use));
      if (document.getElementById('pd-dayonly').checked && (use === 'personal' || use === 'family')) u.dayOnly = true; else delete u.dayOnly;
      if (use === 'booked' && below) u.belowMarket = true; else delete u.belowMarket;
    } else if (b) {
      if (below) b.belowMarket = true; else delete b.belowMarket;
    }
    const cost = parseFloat(document.getElementById('pd-cost').value);
    const km = parseFloat(document.getElementById('pd-km').value);
    const cid = propDayId(s, iso, 'cleaning'), tid = propDayId(s, iso, 'travel');
    if (document.getElementById('pd-clean').checked) { addPropDay(s, iso, 'cleaning'); const d = propDays.find(x => x.id === cid); if (isNaN(cost)) delete d.cost; else d.cost = cost; }
    else removePropDay(cid);
    if (document.getElementById('pd-travel').checked) { addPropDay(s, iso, 'travel'); const d = propDays.find(x => x.id === tid); if (isNaN(km)) delete d.km; else d.km = km; }
    else removePropDay(tid);
    closeModal(); scheduleSave(); renderProperty();
  };
  document.getElementById('modal').classList.add('open');
}

// ── Tax tab: P&L, owner split, check against the accountant ──
// The accountant's figures are typed in per tax year and kept in the user's
// own data (s.property.checks[taxYear]), never in source.
const PROP_CHECK_LINES = [
  {id:'rent', label:'Rent received'}, {id:'commissions', label:'Commissions'},
  ...PROP_LINES.filter(l => l.kind === 'expense' && l.id !== 'commissions').map(l => ({id:l.id, label:l.label})),
  {id:'depreciation', label:'Depreciation'},
  {id:'net', label:'Net profit (loss)'},
];
let propTaxView = 'pnl'; // 'pnl' | 'returns'
function propTaxToggleHtml() {
  const b = (id, l) => `<button class="tab ${propTaxView===id?'active':''}" onclick="propTaxView='${id}';renderProperty()">${l}</button>`;
  return `<div class="tabs" style="margin-bottom:12px">${b('pnl','Property P&amp;L')}${b('returns',"Owners' tax returns")}</div>`;
}
// The forecast switch shows only for the tax year that's under way.
const propForecastOn = () => propForecast && propTaxYear === currentTaxYear();
function propForecastToggleHtml() {
  if (propTaxYear !== currentTaxYear()) return '';
  const b = (on, l) => `<button class="tab ${propForecast === on ? 'active' : ''}" onclick="propForecast=${on};renderProperty()">${l}</button>`;
  return `<div class="tabs" style="margin:-4px 0 12px">${b(false, 'So far')}${b(true, 'Forecast to 31 March')}</div>`;
}
function propForecastCardHtml(pnl) {
  const fc = pnl.forecast; if (!fc) return '';
  return `<div class="card">
    <div class="card-title" style="margin-bottom:4px">What the forecast adds</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px">Costs estimated from today (${fmtDay(fc.asAt)}) to 31 March. Rent counts booked stays only. Set up <a href="#" onclick="setPropTab('setup');return false" style="color:var(--teal)">regular payments</a> for the most accurate costs; anything else is assumed to end the year at last year's total.</div>
    ${fc.items.map(i => `${propRow(escH(i.label), fmt(i.amount))}<div style="font-size:11px;color:var(--text3);margin:-2px 0 6px">${escH(i.how)}</div>`).join('')}
    ${propRow('<strong>Costs still to come</strong>', `<strong>${fmt(fc.total)}</strong>`)}
    <div style="font-size:11px;color:var(--text3);margin-top:6px">Mixed-use share uses the nights marked so far; mark planned personal stays on the calendar to include them.</div>
  </div>`;
}
function propMuaCardHtml(s, pnl) {
  const m = pnl.mua, y = taxYearLabel(propTaxYear);
  const valTxt = m.value ? `${fmt(m.value.amount)} <span style="color:var(--text3)">(${m.value.source}, ${fmtDay(m.value.date)})</span>` : `<a href="#" onclick="setPropTab('setup');return false" style="color:var(--red,#e5484d)">not entered: add it in Setup</a>`;
  const reason = m.lowIncome ? 'income from income-earning use is under $4,000' : 'there is a loss and income is under 2% of the property\'s value';
  return `<div class="card">
    <div class="card-title" style="margin-bottom:8px">Mixed-use: opt-out and loss quarantine</div>
    ${propRow('Income from income-earning use', fmt(m.income))}
    ${propRow('Property value', valTxt)}
    ${m.twoPct != null ? propRow('2% of value', fmt(m.twoPct)) : ''}
    ${propRow('Profit or loss before quarantine', fmtSigned(pnl.net))}
    ${m.optOutEligible ? `<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;padding:10px 0;border-bottom:0.5px solid var(--border);cursor:pointer">
      <input type="checkbox" style="width:16px;height:16px;margin:2px 0 0;flex:none" ${m.optedOut ? 'checked' : ''} onchange="setPropMuaOptOut(this.checked)">
      <span>Opt out for ${y}: leave this property out of the tax return (no income, no expenses)<span style="display:block;font-size:11px;color:var(--text3)">Available because ${reason}. Decide with your accountant.</span></span></label>` : ''}
    ${propRow('Quarantined loss brought forward', fmt(m.open))}
    ${m.quarantined ? propRow('Loss quarantined this year', fmt(m.quarantined)) : ''}
    ${m.used ? propRow('Brought-forward loss used this year', fmt(m.used)) : ''}
    ${propRow('<strong>Carried forward to next year</strong>', `<strong>${fmt(m.close)}</strong>`)}
    ${propRow('<strong>Profit or loss for tax</strong>', `<strong class="${m.taxNet >= 0 ? 'pos' : 'neg'}">${fmtSigned(m.taxNet)}</strong>`)}
    <div style="font-size:11px;color:var(--text3);margin-top:8px">${m.valueMissing ? 'Without a property value the 2% loss test can\'t be done, so the loss is shown in full. ' : ''}A quarantined loss can't be claimed this year. It's carried forward and used in a later mixed-use year with a profit. You keep this record yourself, as it isn't entered in the return. These figures are an estimate until your accountant confirms them.</div>
  </div>`;
}
function setPropMuaOptOut(on) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  const o = { ...(p.muaOptOut || {}) }; if (on) o[propTaxYear] = true; else delete o[propTaxYear];
  s.property = { ...p, muaOptOut: o };
  scheduleSave(); renderProperty();
}
function propTaxHtml(s) {
  if (propTaxView === 'returns') return propYearNavHtml() + propTaxToggleHtml() + propForecastToggleHtml() + propReturnsHtml(s);
  const pnl = computePropPnL(s, propTaxYear, undefined, { forecast: propForecastOn() });
  const p = propSettings(s);
  const checks = (p.checks || {})[propTaxYear] || {};
  const appVal = { rent: pnl.rent, commissions: pnl.commissions, net: pnl.net };
  pnl.expenseLines.forEach(l => appVal[l.id] = l.amount);
  const shown = pnl.expenseLines.filter(l => Math.abs(l.amount) >= 0.005 || l.id === 'homeoffice');
  const owners = p.owners.filter(o => o.share);
  const inp = 'width:100px;box-sizing:border-box;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:13px;padding:6px 6px;text-align:right;outline:none';
  return `${propYearNavHtml()}${propTaxToggleHtml()}${propForecastToggleHtml()}
    ${propChecklistHtml(s)}
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Profit or loss${pnl.forecast ? ' (forecast)' : ''}</div>
      ${pnl.hasUpcoming ? '<div style="font-size:11px;color:var(--amber,#b7791f);margin-bottom:6px">Includes upcoming bookings, so this is a forecast until they complete.</div>' : ''}
      ${propRow('<strong>Rent received</strong>', `<strong>${fmt(pnl.rent)}</strong>`)}
      ${propRow('&nbsp;&nbsp;Bookings (gross + Host Remitted Tax + adjustments)', fmt(pnl.bookingIncome))}
      ${pnl.forecast?.rent.income ? propRow('&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:var(--text3)">incl. not yet booked (forecast)</span>', `<span style="color:var(--text3)">${fmt(pnl.forecast.rent.income)}</span>`) : ''}
      ${pnl.otherIncome ? `<div onclick="openPropLineTxns('income')" style="cursor:pointer">${propRow(`&nbsp;&nbsp;Other bank deposits (${pnl.otherIncomeTxns.length}) <span style="font-size:10px;color:var(--teal)">›</span>`, fmt(pnl.otherIncome))}</div>` : ''}
      ${propRow('Commissions (Airbnb fees)', fmt(pnl.commissions))}
      ${pnl.share < 1 ? `<div style="font-size:11px;color:var(--text3);padding:6px 0">${pnl.basis === 'actualcost'
        ? `Actual cost basis: lines marked * are shared costs, claimed for the ${pnl.usage.availDays} of ${pnl.usage.days} days the property was rented or available (${Math.round(pnl.share*1000)/10}%).`
        : `Mixed-use basis: lines marked * are shared costs, cut to the income-use share of ${Math.round(pnl.share*1000)/10}% (${pnl.usage.income} income days, ${pnl.usage.personalDays} private).`}</div>` : ''}
      ${shown.map(l => {
        if (l.id === 'homeoffice') {
          const label = escH(l.label) + ' <span style="font-size:10px;color:var(--teal)">›</span>';
          const fcTag = l.forecast ? ` <span style="font-size:11px;color:var(--text3)">incl. ${fmt(l.forecast)} forecast</span>` : '';
          return `<div onclick="openPropHomeOffice()" style="cursor:pointer">${propRow(label + fcTag, pnl.homeOffice.pct ? fmt(l.amount) : '<span style="font-size:12px;color:var(--teal)">Set up</span>')}</div>`;
        }
        const n = l.txns.length + l.costs.length;
        const fcTag = l.forecast ? ` <span style="font-size:11px;color:var(--text3)">incl. ${fmt(l.forecast)} forecast</span>` : '';
        const row = propRow(escH(l.label) + (l.apportioned ? ' *' : '') + (n ? ' <span style="font-size:10px;color:var(--teal)">›</span>' : '') + fcTag, l.apportioned ? `${fmt(l.amount)} <span style="font-size:11px;color:var(--text3)">of ${fmt(l.full)}</span>` : fmt(l.amount));
        return n ? `<div onclick="openPropLineTxns('${l.id}')" style="cursor:pointer">${row}</div>` : row;
      }).join('')}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:6px"><span style="font-size:11px;color:var(--text3)">Tap a line with › to see its transactions.</span>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;white-space:nowrap" onclick="openPropCost()">+ Add a cost</button></div>
      ${!(p.assets || []).length ? propRow('Depreciation', `<span style="color:var(--text3)">add assets in the <a href="#" onclick="setPropTab('assets');return false" style="color:var(--teal)">Assets</a> tab</span>`) : ''}
      ${pnl.depRecovered ? propRow('Depreciation recovered (income)', fmt(pnl.depRecovered)) : ''}
      ${propRow('Total expenses', fmt(pnl.totalExpenses))}
      ${propRow('<strong>Net profit (loss)</strong>', `<strong class="${pnl.net>=0?'pos':'neg'}">${fmtSigned(pnl.net)}</strong>`)}
      ${pnl.mua && Math.abs(pnl.taxNet - pnl.net) >= 0.005 ? propRow(`<strong>For tax, after ${pnl.mua.optedOut ? 'opting out' : pnl.mua.quarantined ? 'quarantine' : 'quarantined loss used'}</strong>`, `<strong>${fmtSigned(pnl.taxNet)}</strong>`) : ''}
      ${owners.length ? `<div style="font-size:12px;font-weight:600;color:var(--text2);margin:12px 0 2px">Split between owners${pnl.taxNet !== pnl.net ? ' (for tax)' : ''}</div>${owners.map(o => propRow(`${escH(o.name)} (${o.share}%)`, fmtSigned(pnl.taxNet * o.share / 100))).join('')}
        ${pnl.taxNet < 0 && pnl.basis !== 'mixeduse' ? `<div style="font-size:11px;color:var(--text3);padding-top:4px">A loss here is ring-fenced: each owner can only use it against residential rental profit, now or in later years, not against salary. See <a href="#" onclick="propTaxView='returns';renderProperty();return false" style="color:var(--teal)">Owners' returns</a>.</div>` : ''}` : ''}
      ${pnl.otherIncomeTxns.length ? `<div style="font-size:11px;color:var(--text3);margin-top:8px">"Other bank deposits" are property income deposits that don't match an imported payout, e.g. other platforms or direct bookings: ${pnl.otherIncomeTxns.slice(0,6).map(t => `${fmtDay(dateToIso(t.date))} ${fmt(t.amount)}`).join(', ')}${pnl.otherIncomeTxns.length>6?'…':''}</div>` : ''}
    </div>
    ${pnl.mua ? propMuaCardHtml(s, pnl) : ''}
    ${propForecastCardHtml(pnl)}
    ${pnl.forecast ? '' : propPackCardHtml()}
    <div class="card">
      <div class="card-title" style="margin-bottom:4px">Check against your accountant</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Type in the figures from the accountant's statement for this tax year to see where the app differs. Accountants don't all show rent and platform fees the same way (gross or net of fees), so if those two differ, compare <strong>net profit</strong>.</div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 92px 100px;gap:8px;font-size:11px;color:var(--text3);padding-bottom:4px;border-bottom:0.5px solid var(--border)"><span>Line</span><span style="text-align:right">App</span><span style="text-align:right">Accountant</span></div>
      ${PROP_CHECK_LINES.map(l => {
        const a = appVal[l.id] || 0, has = checks[l.id] != null && checks[l.id] !== '';
        const d = has ? a - Number(checks[l.id]) : null;
        const diff = d == null ? '' : Math.abs(d) < 1
          ? '<div style="font-size:11px;color:var(--teal)">✓ Matches</div>'
          : `<div style="font-size:11px;color:var(--red,#e5484d)">App is ${fmt(d)} ${d > 0 ? 'higher' : 'lower'}</div>`;
        return `<div style="display:grid;grid-template-columns:minmax(0,1fr) 92px 100px;gap:8px;align-items:center;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:12px">
          <div style="color:var(--text2);min-width:0">${l.id==='net'?'<strong>'+l.label+'</strong>':escH(l.label)}${diff}</div>
          <span style="text-align:right">${a < 0 ? '−' : ''}${fmt(a)}</span>
          <input type="number" step="0.01" style="${inp}" value="${has ? checks[l.id] : ''}" onchange="setPropCheck('${l.id}', this.value)">
        </div>`;
      }).join('')}
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Use the figures from the signed financial statements (Statement of Profit or Loss), not working papers.</div>
    </div>`;
}

// ── Owners' tax returns: an IR3-style estimate per owner per tax year ──
// Income with tax deducted comes from the owner's IRD income summary once it's
// typed in; until then it's estimated from take-home pay in the personal "Pay"
// category (matched to the owner by employer name) and grossed up. Each owner's
// share of every property's profit or loss is added automatically.
// Rates: income tax bands (2024-25 used composite rates for the mid-year
// change) and the ACC earner levy. Check new years against IRD.
const NZ_TAX_BANDS_OLD  = [[14000,.105],[48000,.175],[70000,.30],[180000,.33],[Infinity,.39]];
const NZ_TAX_BANDS_2025 = [[14000,.105],[15600,.1282],[48000,.175],[53500,.2164],[70000,.30],[78100,.3071],[180000,.33],[Infinity,.39]];
const NZ_TAX_BANDS_NEW  = [[15600,.105],[53500,.175],[78100,.30],[180000,.33],[Infinity,.39]];
function nzIncomeTax(income, ty) {
  const bands = ty >= 2026 ? NZ_TAX_BANDS_NEW : ty === 2025 ? NZ_TAX_BANDS_2025 : NZ_TAX_BANDS_OLD;
  const inc = Math.max(0, Math.floor(income)); // IRD taxes whole dollars
  let tax = 0, prev = 0;
  for (const [top, r] of bands) { if (inc <= prev) break; tax += (Math.min(inc, top) - prev) * r; prev = top; }
  return round2(tax);
}
const ACC_EARNER_LEVY = { 2023:[0.0146,136544], 2024:[0.0153,139384], 2025:[0.016,142283], 2026:[0.0167,152790], 2027:[0.0175,156641] };
function accEarnerLevy(gross, ty) {
  const latest = Math.max(...Object.keys(ACC_EARNER_LEVY).map(Number));
  const [r, max] = ACC_EARNER_LEVY[ty] || ACC_EARNER_LEVY[ty < 2023 ? 2023 : latest];
  return Math.floor(Math.min(Math.max(0, gross), max) * r * 100) / 100;
}
const TAX_ROW_KINDS = {
  pay:   { label: 'Salary or wages', tax: 'PAYE deducted (as on the IRD summary, incl. ACC levy)' },
  div:   { label: 'Dividends', credit: 'Imputation credits', tax: 'RWT deducted' },
  int:   { label: 'Interest', tax: 'RWT deducted' },
  other: { label: 'Other income (no tax deducted)' },
};
const taxReturnId = (ty, person) => `${ty}|${String(person).trim().toLowerCase()}`;
function taxReturnFor(ty, person) { return taxReturns.find(r => r.id === taxReturnId(ty, person)); }
function ownerShareOfProperties(person, ty, forecast = false) {
  const key = String(person).trim().toLowerCase();
  const parts = [];
  propertyStreams().forEach(st => {
    const o = propSettings(st).owners.find(x => String(x.name).trim().toLowerCase() === key && x.share);
    // Mixed-use years have their own quarantine (already in taxNet); every other
    // year of a short-stay property that isn't the owner's main home is
    // residential land, so it falls under ring-fencing.
    if (o) parts.push({ name: st.name, amount: Math.round(computePropPnL(st, ty, undefined, { forecast }).taxNet * o.share / 100), ringfenced: propBasisFor(st, ty) !== 'mixeduse' });
  });
  return parts;
}
// Residential ring-fencing (IRD: residential rental property deductions).
// Worked out per owner across all their ring-fenced properties for the year
// (portfolio basis): a net loss can't be set against other income such as
// salary. It's carried forward and used against later years' residential
// profit. Kept separate from mixed-use quarantine, which is per property.
function ownerRingfenceStep(parts, open) {
  const resNet = parts.filter(x => x.ringfenced).reduce((a, x) => a + x.amount, 0);
  const other = parts.filter(x => !x.ringfenced).reduce((a, x) => a + x.amount, 0);
  const loss = resNet < 0 ? -resNet : 0;
  const used = resNet > 0 ? Math.min(open, resNet) : 0;
  const counted = resNet < 0 ? 0 : resNet - used;
  return { resNet, loss, used, open, close: round2(open + loss - used), rental: round2(other + counted) };
}
// The owner's ring-fenced balance brought into tax year ty. Starts from the
// latest year with a balance typed in (from the accountant) or the first year
// any of their properties has records.
function ownerRingfenceOpening(person, ty) {
  const key = String(person).trim().toLowerCase();
  let start = null, bal = 0;
  taxReturns.forEach(r => {
    if (String(r.person).trim().toLowerCase() === key && r.ringfenceOpening != null && r.ringfenceOpening !== '' && r.ty <= ty && (start == null || r.ty > start)) { start = r.ty; bal = Number(r.ringfenceOpening) || 0; }
  });
  if (start == null) {
    propertyStreams().forEach(st => {
      if (!propSettings(st).owners.some(x => String(x.name).trim().toLowerCase() === key && x.share)) return;
      const f = propFirstYear(st); if (f != null && (start == null || f < start)) start = f;
    });
    if (start == null || ty <= start) return 0;
  }
  for (let y = start; y < ty; y++) bal = ownerRingfenceStep(ownerShareOfProperties(person, y), bal).close;
  return bal;
}
// Take-home pay in the tax year from the personal "Pay" category, for
// transactions mentioning the owner's employer (comma-separated words).
function bankPayForOwner(o, ty) {
  const words = String(o.payMatch || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
  if (!words.length) return null;
  const { start, end } = taxYearRange(ty);
  const txns = transactions.filter(t => (t.stream || 'personal') === 'personal' && t.cat === 'Pay' && t.amount > 0
    && (d => d >= start && d < end)(dateToIso(t.date)) && words.some(w => txnSearchText(t).includes(w)));
  const net = txns.reduce((a, t) => a + t.amount, 0);
  const today = todayLocal();
  const elapsed = Math.max(1, daysBetween(start, today < end ? today : end));
  let factor = today < end ? daysBetween(start, end) / elapsed : 1, freq = null;
  // Part year: project by pay periods (7 monthly pays → 12), not days, so a
  // pay that's due but not yet in doesn't drag the estimate down.
  if (factor > 1 && txns.length >= 2) {
    const ds = [...new Set(txns.map(t => dateToIso(t.date)))].sort();
    const gaps = ds.slice(1).map((d, i) => daysBetween(ds[i], d)).sort((a, b) => a - b);
    const g = gaps[Math.floor(gaps.length / 2)] || 0;
    const per = g && g < 10 ? 52 : g < 20 ? 26 : g < 45 ? 12 : null;
    if (per) { freq = per === 52 ? 'weekly' : per === 26 ? 'fortnightly' : 'monthly'; factor = Math.max(1, per / ds.length); }
  }
  return { net, count: txns.length, annualNet: net * factor, partYear: factor > 1, freq };
}
// Gross pay that leaves this take-home after PAYE, ACC levy and KiwiSaver.
function grossFromNetPay(net, ty, ksRate) {
  let lo = 0, hi = Math.max(1000, net * 3);
  for (let i = 0; i < 60; i++) {
    const g = (lo + hi) / 2;
    const take = g - nzIncomeTax(g, ty) - accEarnerLevy(g, ty) - g * ksRate;
    if (take > net) hi = g; else lo = g;
  }
  return round2((lo + hi) / 2);
}
function computeTaxReturn(o, ty, forecast = false) {
  const rec = taxReturnFor(ty, o.name);
  const rows = rec?.rows || [];
  const sum = (kind, f) => rows.filter(r => r.kind === kind).reduce((a, r) => a + (Number(r[f]) || 0), 0);
  let gross = sum('pay', 'gross'), payeIncl = sum('pay', 'tax'), source = 'ird', bank = null;
  const expected = Number((o.expectedGross || {})[ty]) || 0;
  if (!rows.some(r => r.kind === 'pay') && expected > 0) {
    gross = expected;
    payeIncl = nzIncomeTax(gross, ty) + accEarnerLevy(gross, ty);
    source = 'expected';
    bank = bankPayForOwner(o, ty);
  } else if (!rows.some(r => r.kind === 'pay')) {
    bank = bankPayForOwner(o, ty);
    if (bank && bank.net > 0) {
      const ks = (Number(o.ksRate ?? 3) || 0) / 100;
      gross = grossFromNetPay(bank.annualNet, ty, ks);
      payeIncl = nzIncomeTax(gross, ty) + accEarnerLevy(gross, ty);
      source = 'bank';
    } else { gross = 0; payeIncl = 0; source = 'none'; }
  }
  const levy = accEarnerLevy(gross, ty);
  const paye = round2(payeIncl - levy);
  const div = sum('div', 'gross'), imputation = sum('div', 'credit'), divRwt = sum('div', 'tax');
  const interest = sum('int', 'gross'), intRwt = sum('int', 'tax');
  const other = sum('other', 'gross');
  const rentalParts = ownerShareOfProperties(o.name, ty, forecast);
  const ringfence = ownerRingfenceStep(rentalParts, ownerRingfenceOpening(o.name, ty));
  const rental = ringfence.rental;
  const taxable = round2(gross + div + interest + other + rental);
  const tax = nzIncomeTax(taxable, ty);
  const credit = Math.min(imputation, tax);
  const payable = round2(tax - credit);
  const refundable = round2(paye + divRwt + intRwt);
  const result = round2(payable - refundable); // negative = refund
  return { rec, rows, source, bank, gross, payeIncl, levy, paye, div, imputation, divRwt, interest, intRwt, other, rental, rentalParts, ringfence,
    taxable, tax, credit, payable, refundable, result, rit: result };
}
let propReturnOwner = 0;
function setRingfenceOpening(i, val) {
  const s = currentPropStream(); if (!s) return;
  const o = propSettings(s).owners.filter(x => x.name && x.share)[i]; if (!o) return;
  const id = taxReturnId(propTaxYear, o.name);
  let r = taxReturns.find(x => x.id === id);
  if (!r) { r = { id, ty: propTaxYear, person: o.name, rows: [] }; taxReturns.push(r); reviveTombstone('taxReturns', id); }
  const n = parseFloat(val);
  if (isNaN(n)) delete r.ringfenceOpening; else r.ringfenceOpening = n;
  scheduleSave(); renderProperty();
}
function propReturnsHtml(s) {
  const owners = propSettings(s).owners.filter(o => o.name && o.share);
  if (!owners.length) return `<div class="card" style="font-size:13px;color:var(--text3)">Add the owners and their shares in Setup first.</div>`;
  if (propReturnOwner >= owners.length) propReturnOwner = 0;
  const o = owners[propReturnOwner];
  const isFc = propForecastOn();
  const r = computeTaxReturn(o, propTaxYear, isFc);
  const soFar = isFc ? computeTaxReturn(o, propTaxYear, false) : null;
  const money = v => (v < 0 ? '−' : '') + fmt(v);
  const srcTxt = r.source === 'ird' ? 'From the IRD income summary you entered.'
    : r.source === 'expected' ? `Using the expected gross pay you entered, with PAYE worked out on it. Add the IRD summary figures below when you have them.`
    : r.source === 'bank' ? `Estimated from ${r.bank.count} ${r.bank.freq ? r.bank.freq + ' ' : ''}pay deposit${r.bank.count === 1 ? '' : 's'} (${fmt(r.bank.net)} take-home${r.bank.partYear ? ', projected to a full year' : ''}), grossed up for PAYE, ACC levy and ${Number(o.ksRate ?? 3)}% KiwiSaver. If you know what the year's pay will be, enter it under Estimate from bank pay.`
    : 'No pay yet. Enter the IRD summary figures below, or set the employer name so pay in your "Pay" category can be found.';
  const rowList = r.rows.map((x, i) => `<div onclick="openTaxRow(${propReturnOwner}, ${i})" style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:13px;cursor:pointer">
      <div style="min-width:0"><div>${escH(x.name || TAX_ROW_KINDS[x.kind].label)}</div><div style="font-size:11px;color:var(--text3)">${TAX_ROW_KINDS[x.kind].label}${x.credit ? ' · imputation ' + fmt(x.credit) : ''}${x.tax ? ` · ${x.kind === 'pay' ? 'PAYE' : 'RWT'} ${fmt(x.tax)}` : ''}</div></div>
      <span>${fmt(Number(x.gross) || 0)}</span></div>`).join('');
  const inp = 'background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:13px;padding:7px 8px;outline:none';
  return `<div class="tabs" style="margin-bottom:12px">${owners.map((x, i) => `<button class="tab ${i === propReturnOwner ? 'active' : ''}" onclick="propReturnOwner=${i};renderProperty()">${escH(x.name)}</button>`).join('')}</div>
    <div class="card">
      <div class="card-title" style="margin-bottom:4px">${escH(o.name)} · ${taxYearLabel(propTaxYear)} (${isFc ? 'forecast to 31 March' : 'IR3 estimate'})</div>
      ${isFc ? `<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Property figures include the rest of the year's costs and the stays already booked (see the P&amp;L's forecast). On costs so far it would be ${soFar.result <= 0 ? 'a refund of ' : 'tax to pay of '}${fmt(Math.abs(soFar.result))}.</div>` : ''}
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px">${srcTxt}</div>
      ${propRow('Gross pay (salary or wages)' + (r.source === 'bank' || r.source === 'expected' ? ' (estimate)' : ''), fmt(r.gross))}
      ${r.div ? propRow('Dividends', fmt(r.div)) : ''}
      ${r.interest ? propRow('Interest', fmt(r.interest)) : ''}
      ${r.other ? propRow('Other income', fmt(r.other)) : ''}
      ${r.rentalParts.map(p => propRow(`Rental income: ${escH(p.name)} (${escH(o.name)}'s share)`, money(p.amount))).join('')}
      ${(() => { const f = r.ringfence; if (!f.open && !f.loss && !f.used) return '';
        return `<div style="margin:4px 0;padding:8px 10px;background:var(--bg3);border-radius:var(--radius-sm)">
          <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:2px">Ring-fenced residential loss</div>
          ${propRow('Brought forward', fmt(f.open))}
          ${f.loss ? propRow("This year's residential loss (can't reduce other income)", fmt(f.loss)) : ''}
          ${f.used ? propRow('Used against this year\'s residential profit', fmt(f.used)) : ''}
          ${propRow('Carried forward', fmt(f.close))}
          ${propRow('<strong>Rental income counted</strong>', `<strong>${money(f.rental)}</strong>`)}
        </div>`; })()}
      ${propRow('<strong>Taxable income</strong>', `<strong>${money(r.taxable)}</strong>`)}
      ${propRow('Tax on taxable income', fmt(r.tax))}
      ${r.credit ? propRow('Less imputation credits', '−' + fmt(r.credit)) : ''}
      ${propRow('Tax payable', fmt(r.payable))}
      ${propRow(`Less PAYE <span style="font-size:11px;color:var(--text3)">(${fmt(r.payeIncl)} less ${fmt(r.levy)} ACC levy)</span>`, '−' + fmt(r.paye))}
      ${r.divRwt + r.intRwt ? propRow('Less RWT', '−' + fmt(r.divRwt + r.intRwt)) : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 2px;font-size:15px;font-weight:700">
        <span>${r.result <= 0 ? 'Refund due' : 'Tax to pay'}${isFc ? ' (forecast)' : ''}</span><span class="${r.result <= 0 ? 'pos' : 'neg'}">${fmt(Math.abs(r.result))}</span></div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0 2px;font-size:12px;color:var(--text2)">
        <span>Ring-fenced loss brought forward into ${taxYearLabel(propTaxYear)}<span style="display:block;font-size:11px;color:var(--text3)">Only if your accountant carried one forward from before the app. Later years follow on.</span></span>
        <input type="number" min="0" step="0.01" placeholder="$" value="${r.rec?.ringfenceOpening ?? ''}" style="${inp};width:110px;text-align:right" onchange="setRingfenceOpening(${propReturnOwner}, this.value)"></div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">${r.ringfence.loss ? 'A loss on residential property (other than mixed-use years) is ring-fenced: it can\'t reduce salary or other income, and carries forward against future rental profit. ' : ''}${r.taxable < 0 ? 'Taxable income is a loss. It carries forward to next year. ' : ''}${r.rit > 5000 ? 'Tax to pay is over $5,000, so provisional tax may apply next year. ' : ''}KiwiSaver and other PIE income are taxed at your PIR and aren't included. Student loan and Working for Families aren't included. An estimate only; your accountant's return is final.</div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:4px">IRD income summary</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:6px">From myIR → Income summary for ${taxYearLabel(propTaxYear)}: each employer's gross pay and PAYE, and dividends and interest with their RWT and imputation credits (also on the Sharesies or bank tax statement).</div>
      ${rowList || '<div style="font-size:13px;color:var(--text3);padding:6px 0">Nothing entered for this year yet.</div>'}
      <button class="btn btn-primary" style="margin-top:10px" onclick="openTaxRow(${propReturnOwner})">+ Add income</button>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:4px">Estimate from bank pay</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Used until salary is entered above. Pay deposits in your personal "Pay" category that mention the employer are counted.</div>
      <div class="input-group"><label>Employer name as it appears on pay deposits (comma-separate several)</label><input type="text" value="${escH(o.payMatch || '')}" placeholder="e.g. Acme Ltd" style="${inp};width:100%;box-sizing:border-box" onchange="setOwnerTaxField('payMatch', this.value)"></div>
      <div class="input-group"><label>Expected gross pay for ${taxYearLabel(propTaxYear)} ($, optional)</label><input type="number" min="0" step="100" value="${(o.expectedGross || {})[propTaxYear] ?? ''}" placeholder="${r.source === 'bank' ? 'Estimate ' + fmtWhole(r.gross) : 'e.g. 85000'}" style="${inp};width:160px" onchange="setOwnerExpectedGross(this.value)">
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Before tax, for the whole year. Overrides the bank estimate${r.bank?.net ? ` (${fmtWhole(grossFromNetPay(r.bank.annualNet, propTaxYear, (Number(o.ksRate ?? 3) || 0) / 100))} from pay deposits)` : ''}.</div></div>
      <div class="input-group"><label>KiwiSaver employee contribution (%)</label><input type="number" min="0" max="10" step="1" value="${o.ksRate ?? 3}" style="${inp};width:90px" onchange="setOwnerTaxField('ksRate', this.value === '' ? null : Number(this.value))"></div>
    </div>`;
}
function setOwnerExpectedGross(val) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  const name = p.owners.filter(o => o.name && o.share)[propReturnOwner]?.name;
  const n = val === '' || isNaN(Number(val)) ? null : Number(val);
  s.property = { ...p, owners: p.owners.map(o => o.name === name ? { ...o, expectedGross: { ...(o.expectedGross || {}), [propTaxYear]: n } } : o) };
  scheduleSave(); renderProperty();
}
function setOwnerTaxField(field, val) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  const owners = p.owners.filter(o => o.name && o.share);
  const name = owners[propReturnOwner]?.name;
  s.property = { ...p, owners: p.owners.map(o => o.name === name ? { ...o, [field]: val } : o) };
  scheduleSave(); renderProperty();
}
function openTaxRow(ownerIdx, rowIdx) {
  const s = currentPropStream(); if (!s) return;
  const o = propSettings(s).owners.filter(x => x.name && x.share)[ownerIdx]; if (!o) return;
  const rec = taxReturnFor(propTaxYear, o.name);
  const x = rowIdx != null ? rec?.rows?.[rowIdx] : null;
  const kind0 = x?.kind || 'pay';
  document.getElementById('modal-title').textContent = `${x ? 'Edit' : 'Add'} income · ${o.name} ${taxYearLabel(propTaxYear)}`;
  const field = (id, label, v) => `<div class="input-group" id="${id}-g"><label id="${id}-l">${label}</label><input type="number" id="${id}" step="0.01" value="${v ?? ''}"></div>`;
  document.getElementById('modal-body').innerHTML = `
    <div class="input-group"><label>Type</label><select id="tr-kind" onchange="taxRowKindChanged()">${Object.entries(TAX_ROW_KINDS).map(([k, d]) => `<option value="${k}" ${kind0 === k ? 'selected' : ''}>${d.label}</option>`).join('')}</select></div>
    <div class="input-group"><label>Payer</label><input type="text" id="tr-name" value="${escH(x?.name || '')}" placeholder="Employer, company or bank"></div>
    ${field('tr-gross', 'Gross amount ($)', x?.gross)}
    ${field('tr-credit', 'Imputation credits ($)', x?.credit)}
    ${field('tr-tax', 'Tax deducted ($)', x?.tax)}
    ${x ? `<button class="btn" style="color:var(--red,#e5484d)" onclick="deleteTaxRow(${ownerIdx}, ${rowIdx})">Delete</button>` : ''}`;
  taxRowKindChanged();
  const btn = document.getElementById('modal-confirm');
  btn.textContent = 'Save';
  btn.onclick = () => {
    const kind = document.getElementById('tr-kind').value;
    const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? 0 : v; };
    const row = { kind, name: document.getElementById('tr-name').value.trim(), gross: num('tr-gross') };
    if (TAX_ROW_KINDS[kind].credit) row.credit = num('tr-credit');
    if (TAX_ROW_KINDS[kind].tax) row.tax = num('tr-tax');
    const id = taxReturnId(propTaxYear, o.name);
    let r = taxReturns.find(z => z.id === id);
    if (!r) { r = { id, ty: propTaxYear, person: o.name, rows: [] }; taxReturns.push(r); reviveTombstone('taxReturns', id); }
    r.rows = [...(r.rows || [])];
    if (x) r.rows[rowIdx] = row; else r.rows.push(row);
    closeModal(); scheduleSave(); renderProperty();
  };
  document.getElementById('modal').classList.add('open');
}
function taxRowKindChanged() {
  const k = TAX_ROW_KINDS[document.getElementById('tr-kind').value];
  document.getElementById('tr-credit-g').style.display = k.credit ? '' : 'none';
  document.getElementById('tr-tax-g').style.display = k.tax ? '' : 'none';
  if (k.tax) document.getElementById('tr-tax-l').textContent = k.tax + ' ($)';
}
function deleteTaxRow(ownerIdx, rowIdx) {
  const s = currentPropStream(); if (!s) return;
  const o = propSettings(s).owners.filter(x => x.name && x.share)[ownerIdx];
  const r = o && taxReturnFor(propTaxYear, o.name);
  if (!r || !confirm('Delete this income line?')) return;
  r.rows = r.rows.filter((_, i) => i !== rowIdx);
  closeModal(); scheduleSave(); renderProperty();
}

// ── Assets: depreciation register ──
// Assets live on the property's settings (s.property.assets). Each has a cost
// and purchase date, an IRD rate and method (DV = diminishing value, SL =
// straight line, none = not depreciated, e.g. land, buildings, artwork), and
// optionally an opening book value at the start of a tax year (taken from the
// accountant's schedule) so history before the app doesn't have to be rebuilt.
// Depreciation is rounded to whole dollars per asset, like the schedule.
const PROP_DEP_METHODS = { DV: 'Diminishing value', SL: 'Straight line', none: 'Not depreciated' };
function propAssetYear(a, ty) {
  const buyTy = a.purchased ? taxYearOf(isoToDate(a.purchased)) : null;
  const openTy = a.opening && a.opening.ty != null ? Number(a.opening.ty) : null;
  const startTy = openTy ?? buyTy;
  if (startTy == null || ty < startTy) return null;
  const saleTy = a.disposed?.date ? taxYearOf(isoToDate(a.disposed.date)) : null;
  if (saleTy != null && ty > saleTy) return null;
  const rate = Number(a.rate) || 0, cost = Number(a.cost) || 0;
  let value = openTy != null ? Number(a.opening.value) || 0 : 0, row = null;
  for (let y = startTy; y <= ty; y++) {
    const open = value;
    const bought = openTy == null && y === buyTy ? cost : 0;
    let dep = 0, gain = 0, sale = null;
    if (saleTy === y) {
      // No depreciation in the year of disposal; the difference between the
      // sale price and book value is a gain (recovered) or a loss.
      sale = Number(a.disposed.price) || 0;
      gain = sale - (open + bought);
      value = 0;
    } else {
      const months = bought ? 12 - ((isoToDate(a.purchased).getMonth() + 9) % 12) : 12; // months owned, counting the purchase month
      if (a.method === 'DV') dep = Math.round((open + bought) * rate * months / 12);
      else if (a.method === 'SL') dep = Math.min(open + bought, Math.round(cost * rate * months / 12));
      value = open + bought - dep;
    }
    row = { open, bought, dep, close: value, sale, gain };
  }
  return row;
}
function propDepreciationForYear(s, ty) {
  const rows = (propSettings(s).assets || []).map(a => ({ a, r: propAssetYear(a, ty) })).filter(x => x.r);
  const sum = k => rows.reduce((t, x) => t + (x.r[k] || 0), 0);
  // A gain is recovered income only up to the depreciation claimed; anything
  // above cost is capital, so cap it at cost minus opening/purchase value.
  const recovered = rows.reduce((t, x) => t + (x.r.gain > 0 ? Math.min(x.r.gain, Math.max(0, (Number(x.a.cost) || 0) - (x.r.open + x.r.bought))) : 0), 0);
  // Buildings can't claim a loss on disposal.
  const loss = rows.reduce((t, x) => t + (x.r.gain < 0 && x.a.group !== 'Buildings' ? -x.r.gain : 0), 0);
  return { rows, depreciation: sum('dep'), open: sum('open'), bought: sum('bought'), close: sum('close'), recovered, loss };
}
function propAssetsHtml(s) {
  const p = propSettings(s);
  const d = propDepreciationForYear(s, propTaxYear);
  const pnl = computePropPnL(s, propTaxYear);
  const groups = {};
  d.rows.forEach(x => (groups[x.a.group || 'Other assets'] = groups[x.a.group || 'Other assets'] || []).push(x));
  const rateTxt = a => a.method === 'none' || !Number(a.rate) ? 'Not depreciated' : `${Math.round(Number(a.rate) * 1000) / 10}% ${a.method}`;
  const rowHtml = ({ a, r }) => `<div onclick="openPropAsset('${a.id}')" style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--border);font-size:13px;cursor:pointer">
      <div style="min-width:0"><div>${escH(a.name)}</div><div style="font-size:11px;color:var(--text3)">${rateTxt(a)}${a.purchased ? ' · bought ' + fmtDay(a.purchased) : ''}${r.bought ? ' · new this year' : ''}${r.sale != null ? ` · sold ${fmtDay(a.disposed.date)} for ${fmt(r.sale)}` : ''}</div></div>
      <div style="text-align:right;white-space:nowrap"><div>${r.sale != null ? (r.gain >= 0 ? '+' : '−') + fmt(r.gain) : a.method === 'none' ? '<span style="color:var(--text3)">—</span>' : fmt(r.dep)}</div><div style="font-size:11px;color:var(--text3)">${fmt(r.open + r.bought)} → ${fmt(r.close)}</div></div>
    </div>`;
  const deductible = pnl.expenseLines.find(l => l.id === 'depreciation');
  return `${propYearNavHtml()}
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Depreciation ${taxYearLabel(propTaxYear)}</div>
      ${propRow('Opening book value', fmt(d.open))}
      ${d.bought ? propRow('Bought this year', fmt(d.bought)) : ''}
      ${propRow('<strong>Depreciation</strong>', `<strong>${fmt(d.depreciation)}</strong>`)}
      ${d.loss ? propRow('Loss on disposal', fmt(d.loss)) : ''}
      ${d.recovered ? propRow('Depreciation recovered', fmt(d.recovered)) : ''}
      ${deductible && deductible.apportioned ? propRow(`Personal share (${Math.round((1 - pnl.share) * 1000) / 10}%)`, '−' + fmt(deductible.full - deductible.amount)) + propRow('<strong>Claimed in the P&amp;L</strong>', `<strong>${fmt(deductible.amount)}</strong>`) : ''}
      ${propRow('Closing book value', fmt(d.close))}
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Tap an asset to edit it. Values on the right are the opening value (plus purchases) → closing value. ${propBasisFor(s, propTaxYear) !== 'full' ? `On the ${propBasisLabel(propBasisFor(s, propTaxYear)).toLowerCase()} basis, depreciation is cut to the same share as other holding costs.` : ''}</div>
    </div>
    ${Object.entries(groups).map(([g, list]) => `<div class="card">
      <div class="card-title" style="margin-bottom:4px">${escH(g)}</div>
      ${list.map(rowHtml).join('')}
    </div>`).join('')}
    ${!d.rows.length ? `<div class="card" style="text-align:center;color:var(--text3);font-size:13px;padding:20px">${(p.assets || []).length ? 'No assets were owned in this tax year.' : 'No assets yet. Add them one by one, or import the list from a CSV.'}</div>` : ''}
    <div class="card">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="openPropAsset()">+ Add asset</button>
        <button class="btn" onclick="document.getElementById('prop-csv-input').click()">Import asset list (CSV)</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">CSV columns: name, group, purchased, cost, rate, method (DV, SL or none), and optionally opening_value and opening_date (book value at the start of a tax year, from your accountant's depreciation schedule). Assets costing $1,000 or less can usually be expensed instead. Rates are IRD's. Check them with your accountant.</div>
    </div>`;
}
function propAssetById(s, id) { return (propSettings(s).assets || []).find(a => String(a.id) === String(id)); }
function openPropAsset(id) {
  const s = currentPropStream(); if (!s) return;
  const a = id != null ? propAssetById(s, id) : null;
  const v = (x) => x == null ? '' : escH(String(x));
  document.getElementById('modal-title').textContent = a ? 'Edit asset' : 'Add asset';
  document.getElementById('modal-body').innerHTML = `
    <div class="input-group"><label>Name</label><input type="text" id="pa-name" value="${v(a?.name)}" placeholder="e.g. Heat pump"></div>
    <div class="input-group"><label>Group</label><select id="pa-group">${['Furniture & Fittings','Plant & Equipment','Buildings','Land','Other assets'].map(g => `<option ${ (a?.group || 'Furniture & Fittings') === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
    <div class="input-group"><label>Purchase date</label><input type="date" id="pa-date" value="${v(a?.purchased)}"></div>
    <div class="input-group"><label>Cost ($)</label><input type="number" id="pa-cost" min="0" step="0.01" value="${v(a?.cost)}"></div>
    <div class="input-group"><label>Method</label><select id="pa-method">${Object.entries(PROP_DEP_METHODS).map(([k, l]) => `<option value="${k}" ${(a?.method || 'DV') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="input-group"><label>IRD rate (%)</label><input type="number" id="pa-rate" min="0" step="0.5" value="${a && a.rate != null ? Math.round(a.rate * 1000) / 10 : ''}"></div>
    <div class="input-group"><label>Opening book value ($, optional: from your accountant's schedule)</label><input type="number" id="pa-open" min="0" step="0.01" value="${v(a?.opening?.value)}"></div>
    <div class="input-group"><label>…at the start of tax year</label><select id="pa-openty"><option value="">Use cost from the purchase date</option>${Array.from({ length: 12 }, (_, i) => taxYearOf(new Date()) + 1 - i).map(ty => `<option value="${ty}" ${a?.opening?.ty == ty ? 'selected' : ''}>${taxYearLabel(ty)}</option>`).join('')}</select></div>
    <div class="input-group"><label>Sold or scrapped on (optional)</label><input type="date" id="pa-sold" value="${v(a?.disposed?.date)}"></div>
    <div class="input-group"><label>Sale price ($, 0 if scrapped)</label><input type="number" id="pa-price" min="0" step="0.01" value="${v(a?.disposed?.price)}"></div>
    ${a ? `<button class="btn" style="color:var(--red,#e5484d);margin-top:4px" onclick="deletePropAsset('${a.id}')">Delete asset</button>` : ''}`;
  const btn = document.getElementById('modal-confirm');
  btn.textContent = 'Save';
  btn.onclick = () => {
    const g = id => document.getElementById(id).value.trim();
    const name = g('pa-name'); if (!name) { alert('Give the asset a name.'); return; }
    const num = id => g(id) === '' ? null : Number(g(id));
    const rec = { id: a?.id ?? ('as' + Date.now()), name, group: g('pa-group'), purchased: g('pa-date') || null, cost: num('pa-cost') ?? 0,
      method: g('pa-method'), rate: g('pa-method') === 'none' ? 0 : (num('pa-rate') ?? 0) / 100 };
    if (g('pa-openty') && num('pa-open') != null) rec.opening = { ty: Number(g('pa-openty')), value: num('pa-open') };
    if (g('pa-sold')) rec.disposed = { date: g('pa-sold'), price: num('pa-price') ?? 0 };
    if (!rec.purchased && !rec.opening) { alert('Enter a purchase date, or an opening value and tax year.'); return; }
    const p = propSettings(s), list = [...(p.assets || [])];
    const i = list.findIndex(x => x.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    s.property = { ...p, assets: list };
    closeModal(); scheduleSave(); renderProperty();
  };
  document.getElementById('modal').classList.add('open');
}
function deletePropAsset(id) {
  const s = currentPropStream(); if (!s) return;
  const a = propAssetById(s, id); if (!a || !confirm(`Delete "${a.name}"? If it was sold or thrown out, enter the date instead so the loss is claimed.`)) return;
  const p = propSettings(s);
  s.property = { ...p, assets: (p.assets || []).filter(x => x.id !== a.id) };
  closeModal(); scheduleSave(); renderProperty();
}
// Asset list CSV: name, group, purchased, cost, rate, method, opening_value, opening_date
function parseAssetCSV(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const h = parseCSVLine(lines[0]).map(x => x.replace(/^"|"$/g, '').toLowerCase().trim());
  const col = n => h.indexOf(n);
  if (col('name') < 0 || col('rate') < 0 || col('method') < 0) return null;
  const date = v => { v = (v || '').replace(/^"|"$/g, '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : parseLongDate(v.replace(/^(\d+\s+[A-Za-z]{3})[a-z]*/, '$1')); };
  const num = v => { const n = parseFloat(String(v ?? '').replace(/[$,%\s"]/g, '')); return isNaN(n) ? null : n; };
  return lines.slice(1).map(l => {
    const c = parseCSVLine(l), get = n => col(n) >= 0 ? (c[col(n)] || '').replace(/^"|"$/g, '').trim() : '';
    const m = get('method').toUpperCase();
    const method = m === 'DV' || m === 'SL' ? m : 'none';
    let rate = num(get('rate')) || 0; if (rate > 1) rate /= 100;
    const rec = { name: get('name'), group: get('group') || 'Furniture & Fittings', purchased: date(get('purchased')), cost: num(get('cost')) || 0, method, rate: method === 'none' ? 0 : rate };
    const ov = num(get('opening_value')), od = date(get('opening_date'));
    if (ov != null && od) rec.opening = { ty: taxYearOf(isoToDate(od)), value: ov };
    return rec;
  }).filter(r => r.name && (r.purchased || r.opening));
}
function importPropAssets(list, s) {
  const p = propSettings(s), cur = [...(p.assets || [])];
  let added = 0, updated = 0;
  list.forEach((r, i) => {
    const ex = cur.find(a => a.name.toLowerCase() === r.name.toLowerCase() && (a.purchased || '') === (r.purchased || ''));
    if (ex) { Object.assign(ex, r); updated++; }
    else { cur.push({ id: 'as' + Date.now() + '_' + i, ...r }); added++; }
  });
  s.property = { ...p, assets: cur };
  scheduleSave(); propTab = 'assets'; renderProperty();
  alert(`Assets imported: ${added} added${updated ? `, ${updated} updated` : ''}.`);
}
function setPropCheck(lineId, val) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  const checks = { ...(p.checks || {}) };
  const yr = { ...(checks[propTaxYear] || {}) };
  if (val === '' || isNaN(Number(val))) delete yr[lineId]; else yr[lineId] = Number(val);
  checks[propTaxYear] = yr;
  s.property = { ...p, checks };
  scheduleSave(); renderProperty();
}

// ── Review personal transactions that belong to the property ──
// Each personal transaction in the property's category is
// either moved onto the property with a proper category, or left in Personal
// (typical for Airbnb payouts landing in a personal account, and transfers
// from personal into the property account -- moving those would double count).
let propReviewCat = null;
function propReviewSourceCats() {
  const used = new Set(transactions.filter(t => (t.stream || 'personal') === 'personal').map(t => t.cat));
  return [...used].sort();
}
function propReviewCandidates(s) {
  return transactions.filter(t => (t.stream || 'personal') === 'personal' && t.cat === propReviewCat && t.propReviewed !== s.id)
    .sort((a,b) => a.date - b.date);
}
function propReviewSuggestion(s, t, matches) {
  const text = (t.desc || '') + ' ' + (t.detail || '');
  if (matches.matchedTxnIds.has(t.id) || (t.amount > 0 && /airbnb|payoneer|booking\.com|bookabach/i.test(text))) return { keep: true, why: 'Platform payout' };
  // Transfers between the owners' own accounts usually carry an owner's name
  // or the property's name -- built from the user's Setup, never hardcoded.
  // Owner names match on any word (a surname is enough); the property name
  // only as a whole phrase, so "Bay Expense" isn't taken for a transfer
  // just because the property is called "Sunny Bay".
  const esc = w => w.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
  const words = [
    ...propSettings(s).owners.flatMap(o => String(o.name || '').split(/\s+/)).filter(w => w.length >= 4 && !/^owner$/i.test(w)).map(esc),
    ...(String(s.name || '').trim().length >= 4 ? [esc(String(s.name).trim()).replace(/\s+/g, '\\s+')] : []),
  ];
  const ownRe = words.length ? new RegExp(words.join('|'), 'i') : null;
  if ((ownRe && ownRe.test(text)) || /transfer|top.?up/i.test(text) || t.amount > 0) return { keep: true, why: 'Looks like a transfer' };
  const line = PROP_LINE_GUESSES.find(([, re]) => re.test(text))?.[0];
  const cats = s.cats || [];
  const cat = line && cats.find(c => propLineFor(s, c.name) === line);
  if (cat) return { keep: false, cat: cat.name };
  // No existing category covers this line -- offer a new one named after it.
  if (line && propLineKind(line) === 'expense') return { keep: false, newLine: line };
  return { keep: false, cat: (cats.find(c => c.name === 'Other') || cats[0])?.name };
}
const PROP_NEW_CAT_NAMES = { insurance:'Insurance', interest:'Mortgage Interest', power:'Power', rates:'Rates', phone:'Internet', cleaning:'Cleaning', rm:'Repairs & Maintenance', purchases:'Purchases', management:'Property Management', accountancy:'Accountancy Fees', travel:'Travel', commissions:'Platform Commissions', other:'Other' };
function propReviewHtml(s) {
  const linked = ensurePropPersonalCat(s);
  const srcCats = [...new Set([linked, ...propReviewSourceCats()])];
  if (!propReviewOther || !srcCats.includes(propReviewCat)) propReviewCat = linked;
  const isLinked = propReviewCat === linked;
  const list = propReviewCandidates(s);
  const matches = computePayoutMatches(s);
  const have = new Set((s.cats || []).map(c => c.name));
  const newOpts = Object.entries(PROP_NEW_CAT_NAMES).filter(([, n]) => !have.has(n));
  const catOpts = (sel, selNew) => (s.cats || []).map(c => `<option value="move:${escH(c.name)}" ${sel===c.name?'selected':''}>Move → ${escH(c.name)}</option>`).join('')
    + newOpts.map(([line, n]) => `<option value="new:${line}" ${selNew===line?'selected':''}>Move → ${escH(n)} (new)</option>`).join('');
  const kept = propReviewKept(s), moved = propReviewMoved(s);
  const view = propReviewView;
  const amt = t => `<span class="${t.amount<0?'neg':'pos'}" style="white-space:nowrap">${t.amount>=0?'+':''}${fmt(t.amount)}</span>`;
  const head = t => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span onclick="editTxnDesc(${t.id})" title="Tap to edit" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer"><span id="txn-desc-${t.id}">${escH(t.desc)}</span> <span style="font-size:10px;color:var(--text3)">✏</span></span>${amt(t)}</div>`;
  const small = 'padding:4px 10px;font-size:12px;white-space:nowrap';
  let content;
  if (view === 'kept') {
    content = kept.length ? kept.map(t => `<div style="padding:8px 0;border-bottom:0.5px solid var(--border)">${head(t)}
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px"><span style="font-size:11px;color:var(--text3);flex:1">${fmtDay(dateToIso(t.date))} · left in Personal</span>
        <button class="btn btn-secondary" style="${small}" onclick="propReviewReopen(${t.id})">Review again</button></div></div>`).join('')
      : '<div class="empty" style="padding:8px 0">Nothing left in Personal yet.</div>';
  } else if (view === 'moved') {
    content = moved.length ? moved.map(t => `<div style="padding:8px 0;border-bottom:0.5px solid var(--border)">${head(t)}
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px"><span style="font-size:11px;color:var(--text3);flex:1">${fmtDay(dateToIso(t.date))} · in ${escH(t.cat)}</span>
        <button class="btn btn-secondary" style="${small}" onclick="propReviewMoveBack(${t.id})">Move back</button></div></div>`).join('')
      : '<div class="empty" style="padding:8px 0">Nothing moved to the property yet.</div>';
  } else if (view === 'find') {
    content = propFindHtml(s, catOpts, head, small);
  } else {
    content = list.length ? `<div id="prop-review-list">${list.map(t => {
      // Outside the linked category almost everything is genuinely personal,
      // so default to leaving it there and let the user pick the odd one out.
      const sug = isLinked ? propReviewSuggestion(s, t, matches) : { keep: true, why: '' };
      return `<div style="padding:8px 0;border-bottom:0.5px solid var(--border)">${head(t)}
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${fmtDay(dateToIso(t.date))}${t.detail ? ' · ' + escH(t.detail) : ''}${sug.keep ? ' · ' + sug.why : ''}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <select data-txn="${t.id}" onchange="propReviewDirty=true" style="flex:1;min-width:0;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;padding:5px 6px">
            <option value="keep" ${sug.keep?'selected':''}>Leave in Personal</option>${catOpts(sug.keep ? null : sug.cat, sug.keep ? null : sug.newLine)}
          </select>
          <button class="btn btn-primary" style="${small}" onclick="applyPropReview([${t.id}])">✓ Save</button>
        </div></div>`;
    }).join('')}</div>
    <button class="btn btn-secondary btn-block" style="margin-top:12px" onclick="applyPropReview()">Save all ${list.length} as shown</button>`
      : '<div class="empty" style="padding:8px 0">Nothing left to review in this category.</div>';
  }
  const vtab = (id, label, n) => `<button class="tab ${view===id?'active':''}" onclick="setPropReviewView('${id}')">${label} (${n})</button>`;
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
      <div class="card-title">Review personal transactions</div>
      <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="propReviewDone()">Done</button>
    </div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px">Move real property costs paid from personal accounts onto ${escH(s.name)}. Leave platform payouts and transfers to the property account in Personal, otherwise they'd be counted twice. Each row is saved on its own, so you can stop at any time.</div>
    ${propReviewOther
      ? `<div class="input-group"><label>Personal category to look through</label>
          <select onchange="if(propReviewConfirmLeave()){propReviewCat=this.value;renderProperty()}else{this.value=propReviewCat}">${srcCats.map(c => `<option value="${escH(c)}" ${c===propReviewCat?'selected':''}>${escH(c)}${c===linked?' (linked to this property)':''}</option>`).join('')}</select>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Rows here default to Leave in Personal. Change only the ones that were for the property. <a href="#" onclick="if(propReviewConfirmLeave()){propReviewOther=false;propReviewCat=null;renderProperty()}return false" style="color:var(--teal)">Back to ${escH(linked)}</a></div></div>`
      : `<div style="font-size:13px;margin-bottom:10px">Reviewing your <strong>${escH(linked)}</strong> category, linked to ${escH(s.name)} in Setup. <a href="#" onclick="if(propReviewConfirmLeave()){propReviewOther=true;renderProperty()}return false" style="color:var(--teal);white-space:nowrap">Look in another category</a></div>`}
    <div class="tabs" style="flex-wrap:wrap">${vtab('todo','To review',list.length)}${vtab('kept','Left in Personal',kept.length)}${vtab('moved','Moved to property',moved.length)}<button class="tab ${view==='find'?'active':''}" onclick="setPropReviewView('find')">🔍 Search all</button></div>
    ${content}
  </div>`;
}
let propReviewView = 'todo';
// ── Search all transactions (personal and property) ──
// For costs that are hard to find by category: an accountant's fee filed
// somewhere odd, rates, or a personal insurance policy that ended up on the
// property. Personal rows can be moved onto the property; rows moved onto the
// property from a personal account can be moved back.
let propFindText = '', propFindYearOnly = true;
function propFindRun() {
  propFindText = (document.getElementById('prop-find')?.value || '').trim();
  propFindYearOnly = !!document.getElementById('prop-find-year')?.checked;
  renderProperty();
  document.getElementById('prop-find')?.focus();
}
function propFindHtml(s, catOpts, head, small) {
  const q = propFindText.toLowerCase();
  const { start, end } = taxYearRange(propTaxYear);
  const propAcc = propAccountIds(s);
  const lineLabel = id => (PROP_LINES.find(l => l.id === id) || {}).label || id;
  const found = q.length < 2 ? [] : transactions.filter(t => {
    if (propFindYearOnly) { const d = dateToIso(t.date); if (d < start || d >= end) return false; }
    const accName = accounts.find(a => a.id === t.account)?.name || '';
    const amt = Math.abs(Number(t.amount) || 0).toFixed(2);
    return `${t.desc || ''} ${t.detail || ''} ${t.cat || ''} ${accName} ${amt}`.toLowerCase().includes(q.replace(/[$,]/g, ''));
  }).sort((a, b) => a.date - b.date);
  const shown = found.slice(0, 150);
  const persOpts = sel => CATS.map(c => `<option value="${escH(c.name)}" ${c.name === sel ? 'selected' : ''}>${escH(c.name)}</option>`).join('');
  const rows = shown.map(t => {
    const where = (t.stream || 'personal') === 'personal' ? 'personal'
      : t.stream === s.id ? 'property' : 'other';
    const accName = accounts.find(a => a.id === t.account)?.name || t.account || '';
    const meta = `${fmtDay(dateToIso(t.date))} · ${escH(accName)} · ${where === 'personal' ? 'Personal' : where === 'property' ? escH(s.name) : escH(otherIncomeStreams.find(x => x.id === t.stream)?.name || 'other stream')} · ${escH(t.cat || '')}`;
    let action = '';
    if (where === 'personal') {
      action = `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <select data-txn="${t.id}" style="flex:1;min-width:0;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;padding:5px 6px">
            <option value="keep">Leave in Personal</option>${catOpts(null, null)}</select>
          <button class="btn btn-primary" style="${small}" onclick="applyPropReview([${t.id}])">✓ Save</button></div>`;
    } else if (where === 'property') {
      const onOwnAcc = propAcc.has(t.account);
      action = `<div style="font-size:11px;color:var(--text3);margin-top:2px">Report line: ${escH(lineLabel(propLineForTxn(s, t)))}${onOwnAcc ? ` (on the property's own account)` : ''}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <select id="pf-cat-${t.id}" style="flex:1;min-width:0;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;padding:5px 6px">${catOpts(t.cat, null).replace(/>Move → /g, '>Category: ')}</select>
          <button class="btn btn-secondary" style="${small}" onclick="propFindRecat(${t.id})">Change</button></div>
        ${onOwnAcc ? '' : `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <select id="pf-back-${t.id}" style="flex:1;min-width:0;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;padding:5px 6px">${persOpts(CATS.some(c => c.name === t.propMovedFrom) ? t.propMovedFrom : (CATS.some(c => c.name === t.cat) ? t.cat : 'Other'))}</select>
          <button class="btn btn-secondary" style="${small}" onclick="propFindMoveBack(${t.id})">Move back to Personal</button></div>`}`;
    }
    return `<div style="padding:8px 0;border-bottom:0.5px solid var(--border)">${head(t)}<div style="font-size:11px;color:var(--text3);margin-top:2px">${meta}</div>${action}</div>`;
  }).join('');
  const total = found.reduce((a, t) => a + t.amount, 0);
  return `<div style="display:flex;gap:8px;margin-bottom:6px">
      <input type="text" id="prop-find" value="${escH(propFindText)}" placeholder="Words, an amount (127.96) or an account name" onkeydown="if(event.key==='Enter')propFindRun()" style="flex:1;min-width:0;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px;outline:none">
      <button class="btn btn-primary" style="padding:6px 12px" onclick="propFindRun()">Search</button></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);margin-bottom:8px"><input type="checkbox" id="prop-find-year" ${propFindYearOnly ? 'checked' : ''} onchange="propFindRun()"> Only tax year ${taxYearLabel(propTaxYear)}</label>
    ${q.length < 2 ? '<div style="font-size:12px;color:var(--text3)">Searches descriptions, details and categories of every transaction, personal and property.</div>'
      : found.length ? `<div style="font-size:12px;color:var(--text3);margin-bottom:4px">${found.length} found · total ${total < 0 ? '−' : ''}${fmt(total)}${found.length > shown.length ? ` · showing the first ${shown.length}` : ''}</div><div id="prop-review-list">${rows}</div>`
      : '<div style="font-size:13px;color:var(--text3)">Nothing found.</div>'}`;
}
// Change a property transaction's category (e.g. split a combined "Rates &
// Insurance" category into Rates and Insurance so each reaches its own line).
function propFindRecat(id) {
  const s = currentPropStream(); const t = transactions.find(x => x.id === id);
  const v = document.getElementById('pf-cat-' + id)?.value;
  if (!s || !t || !v) return;
  let cat;
  if (v.startsWith('new:')) {
    const line = v.slice(4);
    cat = PROP_NEW_CAT_NAMES[line] || 'Other';
    if (!(s.cats || []).some(c => c.name === cat)) {
      s.cats = [...(s.cats || []), { name: cat, emoji: COMMON_CAT_ICONS[cat] || PROPERTY_STREAM_CATS().find(c => c.name === cat)?.emoji || '📌', fixed: false }];
      reviveTombstone(`cats_stream_${s.id}`, cat);
    }
    s.property = { ...propSettings(s), catLines: { ...(propSettings(s).catLines || {}), [cat]: line } };
  } else cat = v.slice(5);
  if (cat === t.cat) return;
  t.cat = cat;
  scheduleSave(); renderProperty(); renderCatMgmtTabs();
}
// Transactions behind one P&L line, with a category changer.
function openPropLineTxns(lineId) {
  const s = currentPropStream(); if (!s) return;
  const pnl = computePropPnL(s, propTaxYear);
  // 'income' lists the deposits counted as rent on top of the bookings.
  const l = lineId === 'income'
    ? { label: 'Other bank deposits', txns: pnl.otherIncomeTxns.map(t => ({ ...t, amount: -t.amount })), costs: [], full: pnl.otherIncome }
    : pnl.expenseLines.find(x => x.id === lineId);
  if (!l) return;
  const txns = [...l.txns].sort((a, b) => a.date - b.date);
  const costs = [...(l.costs || [])].sort((a, b) => a.date.localeCompare(b.date));
  const opts = sel => (s.cats || []).map(c => `<option value="${escH(c.name)}" ${c.name === sel ? 'selected' : ''}>${escH(c.name)} → ${escH((PROP_LINES.find(x => x.id === propLineFor(s, c.name)) || {}).label || 'split by description')}</option>`).join('');
  document.getElementById('modal-title').textContent = `${l.label} · ${taxYearLabel(propTaxYear)}`;
  document.getElementById('modal-body').innerHTML = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:8px">${txns.length} transaction${txns.length === 1 ? '' : 's'}${costs.length ? ` and ${costs.length} cost${costs.length === 1 ? '' : 's'} added by hand` : ''} · ${fmt(l.full)}${lineId === 'income' ? ' counted as rent on top of the bookings, because they don\'t match an imported payout. Change a category if one isn\'t rent.' : ' before any mixed-use cut. Change a category to send a transaction to another line.'}</div>
    ${costs.map(c => `<div onclick="openPropCost('${c.id}')" style="padding:7px 0;border-bottom:0.5px solid var(--border);cursor:pointer">
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span>✍ ${escH(c.note || 'Added by hand')}</span><span style="white-space:nowrap">${fmt(Number(c.amount) || 0)}</span></div>
      <div style="font-size:11px;color:var(--text3)">${fmtDay(c.date)} · added by hand · tap to edit</div></div>`).join('')}
    <div style="max-height:60vh;overflow-y:auto">${txns.map(t => `<div style="padding:7px 0;border-bottom:0.5px solid var(--border)">
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(t.desc)}</span><span style="white-space:nowrap">${fmt(-t.amount)}</span></div>
      <div style="font-size:11px;color:var(--text3)">${fmtDay(dateToIso(t.date))} · ${escH(accounts.find(a => a.id === t.account)?.name || t.account || '')}${t.detail ? ' · ' + escH(t.detail) : ''}</div>
      <select style="width:100%;margin-top:4px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;padding:5px 6px" onchange="propLineRecat(${t.id}, this.value, '${lineId}')">${opts(t.cat)}</select>
    </div>`).join('')}</div>`;
  const btn = document.getElementById('modal-confirm');
  btn.textContent = 'Close'; btn.onclick = () => closeModal();
  document.getElementById('modal').classList.add('open');
}
// Home office setup and breakdown, opened from the P&L line.
const HOME_OFFICE_CAT_GUESS = /power|electric|gas|internet|phone|broadband|rates|water|insur|mortgage|interest/i;
function openPropHomeOffice() {
  const s = currentPropStream(); if (!s) return;
  const ho = propSettings(s).homeOffice || {};
  const r = propHomeOfficeForYear(s, propTaxYear);
  const extra = Number((ho.extra || {})[propTaxYear]) || 0;
  const { start, end } = taxYearRange(propTaxYear);
  const totals = {};
  transactions.forEach(t => {
    if ((t.stream || 'personal') !== 'personal') return;
    const d = dateToIso(t.date); if (d < start || d >= end) return;
    totals[t.cat] = (totals[t.cat] || 0) - t.amount;
  });
  const cats = CATS.map(c => c.name).filter(n => r.cats.includes(n) || (totals[n] || 0) > 0.005)
    .sort((a, b) => (r.cats.includes(b) - r.cats.includes(a)) || (HOME_OFFICE_CAT_GUESS.test(b) - HOME_OFFICE_CAT_GUESS.test(a)) || a.localeCompare(b));
  const inp = 'width:80px;box-sizing:border-box;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:13px;padding:6px;text-align:right;outline:none';
  const costs = propCostsInYear(s, propTaxYear).filter(c => c.line === 'homeoffice');
  const base = r.total; // already includes the extra costs typed in
  const claim = round2(base * r.pct / 100) + costs.reduce((a, c) => a + (Number(c.amount) || 0), 0);
  document.getElementById('modal-title').textContent = `Home office · ${taxYearLabel(propTaxYear)}`;
  document.getElementById('modal-body').innerHTML = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px">If you run the property from an office or workshop at home, you can claim a share of the household's running costs. The share is usually the office's floor area divided by the house's. It isn't cut by the mixed-use share.</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;font-size:13px"><span>Office area (m²)</span><input type="number" min="0" step="0.1" value="${ho.officeM2 ?? ''}" style="${inp}" onchange="setPropHomeOffice('officeM2', this.value)"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;font-size:13px"><span>House floor area (m²)</span><input type="number" min="0" step="0.1" value="${ho.houseM2 ?? ''}" style="${inp}" onchange="setPropHomeOffice('houseM2', this.value)"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;font-size:13px;border-bottom:0.5px solid var(--border)"><span><strong>Share claimed (%)</strong></span><input type="number" min="0" max="100" step="0.01" value="${ho.pct ?? ''}" style="${inp}" onchange="setPropHomeOffice('pct', this.value)"></div>
    <div style="font-size:12px;font-weight:600;margin:12px 0 4px">Household costs to include (personal categories)</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Only the interest on a mortgage counts, not repayments of the loan. If your mortgage category includes repayments, set it as the mortgage repayments category in Setup and load the loan statements in the Tax tab's year-end checklist. Only their interest is counted.</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Tap a ticked category to see its transactions. Untick any that aren't for the house, or type words to keep only matching ones (e.g. your house insurer's name in Insurance).</div>
    <div>${cats.length ? cats.map(n => {
      const on = r.cats.includes(n);
      const c = r.byCat.find(x => x.name === n);
      const open = on && propHoOpenCat === n;
      const head = `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:13px">
        <input type="checkbox" data-cat="${escH(n)}" ${on ? 'checked' : ''} onchange="togglePropHomeOfficeCat(this.dataset.cat, this.checked)">
        <span data-cat="${escH(n)}" style="flex:1;min-width:0;${on ? 'cursor:pointer' : ''}" ${on ? 'onclick="togglePropHoOpen(this.dataset.cat)"' : ''}>${escH(n)}${on ? ` <span style="font-size:11px;color:var(--teal)">${c.txns.length} of ${c.all.length} ${open ? '▾' : '›'}</span>` : ''}</span>
        <span style="white-space:nowrap;color:var(--text2)">${on ? `<strong>${fmt(c.total)}</strong>${c.loan ? ` <span style="font-size:11px;color:var(--text3)">interest of ${fmt(c.paid)}</span>` : Math.abs(c.total - (totals[n] || 0)) > 0.005 ? ` <span style="font-size:11px;color:var(--text3)">of ${fmt(totals[n] || 0)}</span>` : ''}` : fmt(totals[n] || 0)}</span></div>`;
      if (!open) return head;
      const ex = new Set(ho.excluded || []);
      return head + `<div style="padding:6px 0 8px 24px;border-bottom:0.5px solid var(--border)">
        <input type="text" data-cat="${escH(n)}" value="${escH((ho.filters || {})[n] || '')}" placeholder="Only descriptions containing… (comma between words)" onchange="setPropHoFilter(this.dataset.cat, this.value)" style="width:100%;box-sizing:border-box;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;padding:6px;margin-bottom:6px;outline:none">
        ${c.words.length && c.all.length > c.matching.length ? `<div style="font-size:11px;color:var(--text3);margin-bottom:4px">${c.all.length - c.matching.length} transaction${c.all.length - c.matching.length === 1 ? '' : 's'} hidden by the words</div>` : ''}
        ${c.matching.map(t => `<label style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px">
          <input type="checkbox" ${ex.has(t.id) ? '' : 'checked'} onchange="togglePropHoTxn(${t.id}, this.checked)">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${fmtDay(dateToIso(t.date))} · ${escH(t.desc)}</span>
          <span style="white-space:nowrap">${fmt(-t.amount)}</span></label>`).join('') || '<div style="font-size:12px;color:var(--text3)">No transactions match.</div>'}
      </div>`;
    }).join('') : '<div style="font-size:12px;color:var(--text3)">No personal spending in this tax year.</div>'}</div>
    ${propLoanSummaryHtml(ho, r)}
    ${extra ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;font-size:13px;border-bottom:0.5px solid var(--border)"><span>Other household costs this year<br><span style="font-size:11px;color:var(--text3)">entered by hand; clear it if the categories above already cover it</span></span><input type="number" min="0" step="0.01" value="${extra || ''}" style="width:100px;${inp.replace('width:80px;', '')}" onchange="setPropHomeOffice('extra', this.value)"></div>` : ''}
    ${propRow('Household costs', fmt(base))}
    ${costs.length ? propRow('Added with + Add a cost', fmt(costs.reduce((a, c) => a + (Number(c.amount) || 0), 0))) : ''}
    ${propRow('<strong>Home office claim</strong>', `<strong>${fmt(claim)}</strong>`)}`;
  const btn = document.getElementById('modal-confirm');
  btn.textContent = 'Done'; btn.style.display = ''; btn.disabled = false; btn.onclick = () => closeModal();
  document.getElementById('modal').classList.add('open');
}

function setPropHomeOfficeLoanCat(name) { updatePropHo(ho => ({ ...ho, loanCat: name || null })); }
function removePropLoan(i) {
  const s = currentPropStream(); if (!s) return;
  const l = (propSettings(s).homeOffice?.loans || [])[i]; if (!l || !confirm(`Remove the ${l.recs.length} interest lines loaded for ${l.name}?`)) return;
  updatePropHo(ho => ({ ...ho, loans: (ho.loans || []).filter((_, j) => j !== i) }));
}
// Keeps the interest lines of a loan statement. Banks show interest charged
// as a debit or as a credit, so the usual sign of the interest lines decides
// which way round; an adjustment the other way reduces the total.
function importPropLoanCsv(input, idx) {
  const file = input.files[0]; if (!file) return;
  const cur = currentPropStream(), existing = idx != null ? (propSettings(cur).homeOffice?.loans || [])[idx] : null;
  const name = existing ? existing.name : (document.getElementById('prop-loan-name')?.value || '').trim() || 'Home loan';
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result, '__loan__').filter(t => /interest/i.test(`${t.desc} ${t.detail || ''}`));
    input.value = '';
    if (!rows.length) { alert('No interest lines found in that file. Is it the loan account\'s statement?'); return; }
    const neg = rows.filter(t => t.amount < 0).length >= rows.length / 2;
    const recs = rows.map(t => ({ date: dateToIso(t.date), amount: t.amount, desc: [t.desc, t.detail].filter(Boolean).join(' · '), interest: round2(neg ? -t.amount : t.amount) }));
    let added = 0;
    updatePropHo(ho => {
      const loans = [...(ho.loans || [])];
      let i = loans.findIndex(l => l.name.toLowerCase() === name.toLowerCase());
      if (i < 0) { loans.push({ name, recs: [] }); i = loans.length - 1; }
      const key = r => `${r.date}|${(+r.amount).toFixed(2)}|${r.desc}`;
      const have = new Map(); loans[i].recs.forEach(r => have.set(key(r), (have.get(key(r)) || 0) + 1));
      const seen = new Map(), fresh = [];
      recs.forEach(r => { const k = key(r), n = (seen.get(k) || 0) + 1; seen.set(k, n); if (n > (have.get(k) || 0)) fresh.push(r); });
      added = fresh.length;
      loans[i] = { ...loans[i], recs: [...loans[i].recs, ...fresh].sort((a, b) => a.date.localeCompare(b.date)) };
      const loanCat = ho.loanCat || (ho.cats || []).find(n => /mortgage/i.test(n)) || null;
      return { ...ho, loans, loanCat };
    });
    setTimeout(() => alert(`${name}: ${added} interest line${added === 1 ? '' : 's'} added${rows.length - added ? `, ${rows.length - added} already loaded` : ''}.`), 50);
  };
  reader.readAsText(file);
}
let propHoOpenCat = null;
// Re-render the home office window without losing the scroll position.
function refreshPropHomeOffice() {
  const body = document.getElementById('modal-body');
  const top = body ? body.scrollTop : 0;
  const open = document.getElementById('modal').classList.contains('open') && document.getElementById('modal-title').textContent.startsWith('Home office');
  scheduleSave(); renderProperty(); if (!open) return; openPropHomeOffice();
  if (body) body.scrollTop = top;
}
function updatePropHo(fn) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  s.property = { ...p, homeOffice: fn({ ...(p.homeOffice || {}) }) };
  refreshPropHomeOffice();
}
function togglePropHoOpen(name) {
  propHoOpenCat = propHoOpenCat === name ? null : name;
  refreshPropHomeOffice();
}
function setPropHoFilter(name, val) {
  updatePropHo(ho => ({ ...ho, filters: { ...(ho.filters || {}), [name]: val.trim() } }));
}
function togglePropHoTxn(id, on) {
  updatePropHo(ho => {
    const ex = new Set(ho.excluded || []);
    on ? ex.delete(id) : ex.add(id);
    return { ...ho, excluded: [...ex] };
  });
}
function setPropHomeOffice(field, val) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  const ho = { ...(p.homeOffice || {}) };
  const n = val === '' || isNaN(Number(val)) ? null : Number(val);
  if (field === 'extra') ho.extra = { ...(ho.extra || {}), [propTaxYear]: n };
  else ho[field] = n;
  // Typing both areas works out the share; it can still be overwritten.
  if ((field === 'officeM2' || field === 'houseM2') && ho.officeM2 && ho.houseM2) ho.pct = round2(ho.officeM2 / ho.houseM2 * 100);
  s.property = { ...p, homeOffice: ho };
  refreshPropHomeOffice();
}
function togglePropHomeOfficeCat(name, on) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  const ho = { ...(p.homeOffice || {}) };
  const cats = new Set(ho.cats || []);
  on ? cats.add(name) : cats.delete(name);
  if (on) propHoOpenCat = name;
  s.property = { ...p, homeOffice: { ...ho, cats: [...cats] } };
  refreshPropHomeOffice();
}
function propLineRecat(id, cat, lineId) {
  const t = transactions.find(x => x.id === id); if (!t || !cat) return;
  t.cat = cat;
  scheduleSave(); renderProperty(); openPropLineTxns(lineId);
}
// ── Costs paid outside the app ──
// For property costs paid from an account the app doesn't import (e.g. the
// accountant's fee). They count on their P&L line like any other cost.
function propCostsInYear(s, ty) {
  const { start, end } = taxYearRange(ty);
  return propCosts.filter(c => c.streamId === s.id && c.date >= start && c.date < end);
}
function openPropCost(id) {
  const s = currentPropStream(); if (!s) return;
  const c = id ? propCosts.find(x => x.id === id) : null;
  const { start, end } = taxYearRange(propTaxYear);
  const defDate = (() => { const t = todayLocal(); return t >= start && t < end ? t : dateToIso(new Date(isoToDate(end).getTime() - 86400000)); })();
  const lines = PROP_LINES.filter(l => l.kind === 'expense');
  document.getElementById('modal-title').textContent = c ? 'Edit cost' : 'Add a cost paid outside the app';
  document.getElementById('modal-body').innerHTML = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px">For a property cost paid from an account that isn't in the app, such as the accountant's fee. If it is in your transactions, move that instead so it isn't counted twice.</div>
    <div class="input-group"><label>What it was for</label><input type="text" id="pc-note" value="${escH(c?.note || '')}" placeholder="e.g. Accountant's fee 2025–26"></div>
    <div class="input-group"><label>Date paid</label><input type="date" id="pc-date" value="${escH(c?.date || defDate)}"></div>
    <div class="input-group"><label>Amount ($)</label><input type="number" id="pc-amount" min="0" step="0.01" value="${c?.amount ?? ''}"></div>
    <div class="input-group"><label>Report line</label><select id="pc-line">${lines.map(l => `<option value="${l.id}" ${(c?.line || 'accountancy') === l.id ? 'selected' : ''}>${escH(l.label)}</option>`).join('')}</select></div>
    ${c ? `<button class="btn" style="color:var(--red,#e5484d)" onclick="deletePropCost('${c.id}')">Delete</button>` : ''}`;
  const btn = document.getElementById('modal-confirm');
  btn.textContent = 'Save';
  btn.onclick = () => {
    const amount = parseFloat(document.getElementById('pc-amount').value);
    const date = document.getElementById('pc-date').value;
    if (isNaN(amount) || !date) { alert('Enter a date and an amount.'); return; }
    const rec = { id: c?.id || ('pc' + Date.now()), streamId: s.id, date, amount: round2(amount),
      line: document.getElementById('pc-line').value, note: document.getElementById('pc-note').value.trim() };
    if (c) Object.assign(c, rec); else { propCosts.push(rec); reviveTombstone('propCosts', rec.id); }
    propTaxYear = taxYearOf(isoToDate(date));
    closeModal(); scheduleSave(); renderProperty();
  };
  document.getElementById('modal').classList.add('open');
}
function deletePropCost(id) {
  if (!confirm('Delete this cost?')) return;
  propCosts = propCosts.filter(c => c.id !== id);
  tombstone('propCosts', id);
  closeModal(); scheduleSave(); renderProperty();
}
function propFindMoveBack(id) {
  const t = transactions.find(x => x.id === id); if (!t) return;
  const cat = document.getElementById('pf-back-' + id)?.value || t.propMovedFrom || 'Other';
  t.stream = 'personal'; t.cat = cat; delete t.propMovedFrom;
  t.propReviewed = currentPropStream()?.id; // don't offer it in the review again
  scheduleSave(); renderProperty(); renderIncomeStreams();
}
let propReviewOther = false; // looking outside the property's linked category
let propReviewDirty = false; // a To-review dropdown was changed but not saved
function propReviewConfirmLeave() {
  if (!propReviewDirty) return true;
  if (!confirm("You've changed some choices without pressing ✓ Save. Leave without saving them?")) return false;
  propReviewDirty = false; return true;
}
function setPropReviewView(v) { if (propReviewConfirmLeave()) { propReviewView = v; renderProperty(); } }
function propReviewDone() { if (propReviewConfirmLeave()) { propReviewView = 'todo'; setPropTab('home'); } }
// Left in Personal from this category's review.
function propReviewKept(s) {
  return transactions.filter(t => (t.stream || 'personal') === 'personal' && t.cat === propReviewCat && t.propReviewed === s.id).sort((a,b) => a.date - b.date);
}
// Moved onto the property from Personal. propMovedFrom is recorded on every
// move; the account check also catches moves made before it existed (a
// transaction on the property whose bank account isn't the property's).
function propReviewMoved(s) {
  // Only infer older moves from the account when the property's own account
  // is actually known -- otherwise every property transaction would look moved.
  const propAcc = new Set(accounts.filter(a => a.stream === s.id).map(a => a.id));
  const setupAcc = propSettings(s).accountId; if (setupAcc) propAcc.add(setupAcc);
  return transactions.filter(t => t.stream === s.id && (t.propMovedFrom != null || (propAcc.size && !propAcc.has(t.account)))).sort((a,b) => a.date - b.date);
}
function propReviewReopen(id) {
  const t = transactions.find(x => x.id === id); if (!t) return;
  delete t.propReviewed;
  scheduleSave(); renderProperty();
}
function propReviewMoveBack(id) {
  const t = transactions.find(x => x.id === id); if (!t) return;
  const back = t.propMovedFrom || propReviewCat || 'Other';
  t.stream = 'personal'; t.cat = back; delete t.propMovedFrom; delete t.propReviewed;
  scheduleSave(); renderProperty(); renderIncomeStreams();
}
// Applies the given rows (by txn id), or every row shown when called with none.
function applyPropReview(ids) {
  const s = currentPropStream(); if (!s) return;
  let sels = [...document.querySelectorAll('#prop-review-list select[data-txn]')];
  if (ids) sels = sels.filter(el => ids.includes(Number(el.dataset.txn)));
  else {
    const moves = sels.filter(el => el.value !== 'keep').length;
    if (!confirm(`Save all ${sels.length} rows as shown? ${moves} will move to ${s.name} and ${sels.length - moves} will stay in Personal. You can undo any of them under "Left in Personal" or "Moved to property".`)) return;
  }
  let catLines = { ...(propSettings(s).catLines || {}) };
  sels.forEach(el => {
    const t = transactions.find(x => String(x.id) === el.dataset.txn);
    if (!t) return;
    if (el.value === 'keep') { t.propReviewed = s.id; return; } // hide from future reviews
    let cat;
    if (el.value.startsWith('new:')) {
      const line = el.value.slice(4);
      cat = PROP_NEW_CAT_NAMES[line] || 'Other';
      if (!(s.cats || []).some(c => c.name === cat)) {
        s.cats = [...(s.cats || []), { name: cat, emoji: COMMON_CAT_ICONS[cat] || PROPERTY_STREAM_CATS().find(c => c.name === cat)?.emoji || '📌', fixed: false }];
        reviveTombstone(`cats_stream_${s.id}`, cat);
      }
      catLines[cat] = line;
    } else cat = el.value.slice(5);
    t.propMovedFrom = t.cat;
    t.stream = s.id; t.cat = cat; delete t.propReviewed;
  });
  s.property = { ...propSettings(s), catLines };
  // Unsaved changes on rows that weren't part of this save are kept on screen
  // only until the re-render below, so carry them across.
  const pending = [...document.querySelectorAll('#prop-review-list select[data-txn]')]
    .filter(el => !sels.includes(el)).map(el => [el.dataset.txn, el.value]);
  scheduleSave(); renderProperty(); renderIncomeStreams(); renderCatMgmtTabs();
  pending.forEach(([id, v]) => { const el = document.querySelector(`#prop-review-list select[data-txn="${id}"]`); if (el) el.value = v; });
  if (!ids) propReviewDirty = false;
}
function openPropReview(streamId) {
  if (streamId) propStreamId = streamId;
  propTab = 'review'; propReviewView = 'todo'; propReviewCat = null; propReviewOther = false;
  openPropertyModule();
}

// ── Setup ──
// ── Account check: everything on the property's bank account belongs to it ──
// Linking an account to the property (Settings → Accounts, or Setup's
// property account) only routes future imports. Transactions imported before
// that are still tagged Personal; this finds them and moves them across.
function propAccountIds(s) {
  const ids = new Set(accounts.filter(a => a.stream === s.id).map(a => a.id));
  const setupAcc = propSettings(s).accountId; if (setupAcc) ids.add(setupAcc);
  return ids;
}
function propAccountStrays(s) {
  const ids = propAccountIds(s);
  return transactions.filter(t => ids.has(t.account) && t.stream !== s.id).sort((a, b) => a.date - b.date);
}
// Pick the property category for a transaction coming off its own account:
// same-named category first, then one on the report line its category or
// description suggests, then Other.
function propCatForAccountTxn(s, t) {
  const cats = s.cats || [];
  if (cats.some(c => c.name === t.cat)) return t.cat;
  const text = `${t.cat || ''} ${t.desc || ''} ${t.detail || ''}`;
  let line = t.amount > 0 && /airbnb|payoneer|bookabach|booking\.com|vrbo|stripe/i.test(text) ? 'income'
    : PROP_LINE_GUESSES.find(([, re]) => re.test(text))?.[0];
  if (t.amount > 0 && line !== 'income') line = 'transfer'; // top-ups from your own accounts
  const hit = line && cats.find(c => propLineFor(s, c.name) === line);
  return (hit || cats.find(c => c.name === 'Other') || cats[0])?.name || 'Other';
}
let propAccountCheckOpen = false;
function propAccountCheckHtml(s) {
  const ids = propAccountIds(s);
  if (!ids.size) return `<div class="card" style="font-size:13px;color:var(--text2)">Set the <strong>property bank account</strong> below so everything on it counts towards ${escH(s.name)}.</div>`;
  const list = propAccountStrays(s);
  const accNames = [...ids].map(id => accounts.find(a => a.id === id)?.name || id).join(', ');
  // How far the imported statements reach, to spot a missing import.
  const coverage = [...ids].map(id => {
    const ts = transactions.filter(t => t.account === id);
    if (!ts.length) return `${escH(accounts.find(a => a.id === id)?.name || id)}: no transactions imported`;
    const ds = ts.map(t => dateToIso(t.date)).sort();
    return `${escH(accounts.find(a => a.id === id)?.name || id)}: ${ts.length} transactions, ${fmtDay(ds[0])} to ${fmtDay(ds[ds.length - 1])}`;
  }).join('<br>');
  const covHtml = `<div style="font-size:11px;color:var(--text3);margin-top:6px">${coverage}</div>`;
  if (!list.length) return `<div class="card" style="font-size:13px;color:var(--text2)">✓ Every transaction on ${escH(accNames)} is on ${escH(s.name)}.${covHtml}</div>`;
  const rows = list.map(t => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:12px">
      <div style="min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(t.desc)}</div>
        <div style="font-size:11px;color:var(--text3)">${fmtDay(dateToIso(t.date))} · ${escH(t.cat || '')} → ${escH(propCatForAccountTxn(s, t))}</div></div>
      <span class="${t.amount < 0 ? 'neg' : 'pos'}" style="white-space:nowrap">${t.amount >= 0 ? '+' : ''}${fmt(t.amount)}</span></div>`).join('');
  return `<div class="card" style="border-color:var(--teal)">
    <div class="card-title" style="margin-bottom:6px">${list.length} transaction${list.length === 1 ? '' : 's'} on ${escH(accNames)} still under Personal</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:8px">These were probably imported before the account was linked to ${escH(s.name)}. Moving them puts them in the property's figures with the category shown; deposits that aren't platform payouts go in as transfers. You can change any of them afterwards, or move them back from Review → Moved to property.</div>
    ${propAccountCheckOpen ? `<div style="max-height:320px;overflow-y:auto;margin-bottom:10px">${rows}</div>` : `<button class="btn btn-secondary" style="padding:5px 10px;font-size:12px;margin-bottom:10px" onclick="propAccountCheckOpen=true;renderProperty()">Show them</button>`}
    ${covHtml}<button class="btn btn-primary btn-block" style="margin-top:8px" onclick="movePropAccountStrays()">Move ${list.length} to ${escH(s.name)}</button>
  </div>`;
}
function movePropAccountStrays() {
  const s = currentPropStream(); if (!s) return;
  const list = propAccountStrays(s);
  if (!list.length || !confirm(`Move ${list.length} transaction${list.length === 1 ? '' : 's'} to ${s.name}? They'll leave your personal figures.`)) return;
  list.forEach(t => {
    const cat = propCatForAccountTxn(s, t);
    t.propMovedFrom = t.cat;
    t.stream = s.id; t.cat = cat; delete t.propReviewed;
  });
  propAccountCheckOpen = false;
  scheduleSave(); renderProperty(); renderIncomeStreams();
}
function propSetupHtml(s) {
  const p = propSettings(s);
  const yrBasis = propBasisFor(s, propTaxYear);
  const rv = p.ratingValue || {}, mo = p.muaOpening || {};
  const owners = [...p.owners, {name:'',share:''}, {name:'',share:''}].slice(0, Math.max(4, p.owners.length));
  const accOpts = accounts.map(a => `<option value="${escH(a.id)}" ${p.accountId===a.id?'selected':''}>${escH(a.name)}</option>`).join('');
  const inp = 'background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:9px 10px;outline:none';
  return `${propSetupCheckHtml(s)}${propAccountCheckHtml(s)}<div class="card">
    <div class="card-title" style="margin-bottom:10px">Property settings</div>
    <div class="input-group"><label>Owners and ownership share (%)</label>
      ${owners.map((o,i) => `<div style="display:flex;gap:8px;margin-bottom:6px">
        <input type="text" id="ps-owner-${i}" value="${escH(o.name)}" placeholder="Owner name" style="flex:1;${inp}">
        <input type="number" id="ps-share-${i}" value="${o.share===''?'':o.share}" min="0" max="100" step="0.01" placeholder="%" style="width:80px;${inp}">
      </div>`).join('')}
      <div style="font-size:11px;color:var(--text3)">Used to split the property's profit or loss between owners. Leave unused rows blank.</div>
    </div>
    <div class="input-group"><label>Purchase date</label><input type="date" id="ps-purchase" value="${escH(p.purchaseDate)}"></div>
    <div class="input-group"><label>Purchase price ($)</label><input type="number" id="ps-price" min="0" step="1" value="${p.purchasePrice ?? ''}" placeholder="e.g. 650000"></div>
    <div class="input-group"><label>Latest council rating valuation (capital value)</label>
      <div style="display:flex;gap:8px"><input type="number" id="ps-rv" min="0" step="1000" value="${rv.amount ?? ''}" placeholder="$" style="flex:1"><input type="date" id="ps-rv-date" value="${escH(rv.date || '')}" style="flex:1"></div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">Used for the mixed-use 2% test (the more recent of this and the purchase price) and the equity figure. The date is when the valuation took effect.</div></div>
    <div class="input-group"><label>Property bank account</label><select id="ps-account"><option value="">— Not set —</option>${accOpts}</select>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">The account rent is paid into and bills come out of. Used for the cash flow forecast.</div></div>
    <div class="input-group"><label>Personal category for this property</label><select id="ps-personalcat">${CATS.map(c => `<option value="${escH(c.name)}" ${propPersonalCat(s)===c.name?'selected':''}>${escH(c.name)}</option>`).join('')}</select>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">When you pay for something for the property from a personal account, put it in this category. It then shows up in Review to move across. Rename it any time in Settings → Categories.</div></div>
    <div class="input-group"><label>Return trip distance, home → property (km)</label><input type="number" id="ps-km" value="${p.travelKm ?? ''}" min="0" step="1" placeholder="e.g. 200"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:-4px 0 14px"><input type="checkbox" id="ps-cleantravel" ${p.cleanAddsTravel!==false?'checked':''}> Marking a clean on the calendar also logs a trip</label>
    <div class="input-group"><label>Expense deduction basis for ${taxYearLabel(propTaxYear)}</label>
      <select id="ps-basis">
        <option value="full" ${yrBasis==='full'?'selected':''}>100% deductible (no private use)</option>
        <option value="actualcost" ${yrBasis==='actualcost'?'selected':''}>Actual cost (days rented or available)</option>
        <option value="mixeduse" ${yrBasis==='mixeduse'?'selected':''}>Mixed-use (income vs private days)</option>
      </select>
      ${(() => { const u = propUsageForYear(s, propTaxYear); const same = u.suggested === yrBasis;
        return `<div style="font-size:12px;margin-top:6px;padding:8px 10px;border-radius:var(--radius-sm);background:${same ? 'rgba(29,184,138,0.10)' : 'rgba(224,160,48,0.14)'};color:var(--text2)">
          The calendar for ${taxYearLabel(propTaxYear)} suggests <strong style="color:var(--text)">${propBasisLabel(u.suggested)}</strong>: ${PROP_BASES[u.suggested].long}
          <span style="color:var(--text3)">(${u.personalDays} private day${u.personalDays === 1 ? '' : 's'}, ${u.unused} unused)</span>${same ? '' : ` <a href="#" onclick="document.getElementById('ps-basis').value='${u.suggested}';return false" style="color:var(--teal)">Use this</a>`}</div>`; })()}
      <div style="font-size:11px;color:var(--text3);margin-top:4px">The test is done each tax year, so the basis is saved for ${taxYearLabel(propTaxYear)} only (change the year at the top of the Tax tab). Years without their own use ${propBasisLabel(p.deductionBasis || 'full')}. Confirm with your accountant. This only affects the tax report, not your recorded transactions.</div></div>
    ${yrBasis !== 'full' ? `<div style="margin:-4px 0 16px">
      <div style="font-size:12px;color:var(--text2);margin-bottom:6px">Claim these in full (not cut to the income share)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px">${PROP_APPORTIONABLE.map(id => `<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" style="width:16px;height:16px;margin:0;flex:none" ${(p.fullLines || []).includes(id) ? 'checked' : ''} onchange="togglePropFullLine('${id}', this.checked)"> <span>${escH(id === 'depreciation' ? 'Depreciation' : PROP_LINES.find(l => l.id === id).label)}</span></label>`).join('')}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">Only for costs that relate solely to earning income, such as repairing damage caused by guests. Check with your accountant.</div></div>` : ''}
    ${yrBasis === 'mixeduse' || mo.amount ? `<div class="input-group"><label>Quarantined mixed-use loss brought forward</label>
      <div style="display:flex;gap:8px"><input type="number" id="ps-mua-amt" min="0" step="0.01" value="${mo.amount ?? ''}" placeholder="$ from your accountant" style="flex:1">
        <select id="ps-mua-ty" style="flex:1">${[0, 1, 2, 3, 4, 5].map(k => currentTaxYear() - k).map(y => `<option value="${y}" ${Number(mo.ty) === y ? 'selected' : ''}>into ${taxYearLabel(y)}</option>`).join('')}</select></div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">Only if the accountant has carried a quarantined loss forward from before you used the app. Later years are worked out from here.</div></div>` : ''}
    <button class="btn btn-primary btn-block" onclick="savePropSetup()">Save</button>
  </div>
  ${propRegularSetupHtml(s)}
  ${propCatLinesHtml(s)}`;
}
function propCatLinesHtml(s) {
  const p = propSettings(s);
  const counts = {};
  transactions.forEach(t => { if (t.stream === s.id) counts[t.cat] = (counts[t.cat] || 0) + 1; });
  const names = [...new Set([...(s.cats || []).map(c => c.name), ...Object.keys(counts)])];
  return `<div class="card">
    <div class="card-title" style="margin-bottom:4px">Categories → report lines</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Where each of ${escH(s.name)}'s categories goes in the profit or loss. Guesses are based on the name. Use <strong>Transfer</strong> for money moving between your own accounts, such as top-ups and loan principal.</div>
    ${names.map(n => {
      const cur = propLineFor(s, n), set = !!(p.catLines || {})[n];
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border)">
        <span style="flex:1;min-width:0;font-size:13px">${escH(n)} <span style="font-size:11px;color:var(--text3)">${counts[n]||0} txn${counts[n]===1?'':'s'}${set?'':' · guessed'}</span></span>
        <select data-cat="${escH(n)}" onchange="setPropCatLine(this.dataset.cat, this.value)" style="max-width:180px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);font-size:12px;padding:5px 6px">
          ${PROP_LINES.map(l => `<option value="${l.id}" ${l.id===cur?'selected':''}>${escH(l.label)}</option>`).join('')}
          <option value="${PROP_SPLIT_RATES_INS}" ${cur===PROP_SPLIT_RATES_INS?'selected':''}>Rates or Insurance (by description)</option>
        </select></div>`;
    }).join('')}
  </div>`;
}
function setPropCatLine(catName, line) {
  const s = currentPropStream(); if (!s) return;
  const p = propSettings(s);
  s.property = { ...p, catLines: { ...(p.catLines || {}), [catName]: line } };
  scheduleSave(); renderProperty();
}
function savePropSetup() {
  const s = currentPropStream();
  if (!s) return;
  const owners = [];
  for (let i = 0; document.getElementById('ps-owner-'+i); i++) {
    const name = document.getElementById('ps-owner-'+i).value.trim();
    const share = parseFloat(document.getElementById('ps-share-'+i).value);
    // Keep each owner's tax-return settings (employer match, KiwiSaver rate).
    const prev = propSettings(s).owners[i] || {};
    if (name || !isNaN(share)) owners.push({ ...prev, name: name || `Owner ${owners.length+1}`, share: isNaN(share) ? 0 : share });
  }
  const total = owners.reduce((a,o) => a+o.share, 0);
  if (owners.length && Math.abs(total - 100) > 0.01 && !confirm(`Ownership shares add up to ${round2(total)}%, not 100%. Save anyway?`)) return;
  const km = parseFloat(document.getElementById('ps-km').value);
  s.property = {
    ...propSettings(s),
    owners,
    purchaseDate: document.getElementById('ps-purchase').value,
    accountId: document.getElementById('ps-account').value,
    personalCat: document.getElementById('ps-personalcat').value || propSettings(s).personalCat,
    travelKm: isNaN(km) ? null : km,
    cleanAddsTravel: document.getElementById('ps-cleantravel').checked,
  };
  // Basis is saved for the year shown; the first choice also becomes the default.
  const basis = document.getElementById('ps-basis').value;
  s.property.basisByYear = { ...(s.property.basisByYear || {}), [propTaxYear]: basis };
  if (!s.property.deductionBasis) s.property.deductionBasis = basis;
  const price = parseFloat(document.getElementById('ps-price').value);
  s.property.purchasePrice = isNaN(price) ? null : price;
  const rvAmt = parseFloat(document.getElementById('ps-rv').value), rvDate = document.getElementById('ps-rv-date').value;
  s.property.ratingValue = isNaN(rvAmt) ? null : { amount: rvAmt, date: rvDate || null };
  if (document.getElementById('ps-mua-amt')) {
    const amt = parseFloat(document.getElementById('ps-mua-amt').value);
    s.property.muaOpening = isNaN(amt) || !amt ? null : { amount: amt, ty: Number(document.getElementById('ps-mua-ty').value) };
  }
  scheduleSave();
  propTab = 'home'; renderProperty();
}

// ── Airbnb CSV import ──
// Two Airbnb exports share most columns: the completed/paid earnings report
// has 'Paid out' + 'Arriving by date' (and Payout rows); the pending/upcoming
// one doesn't. Rows are per money movement, not per booking -- a booking has a
// Reservation row plus a Host Remitted Tax row (the GST flat-rate credit), and
// long stays are paid monthly, giving several Reservation rows with the same
// confirmation code and dates. So everything is grouped by confirmation code.
function parseUSDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || '').trim());
  return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : null;
}
function parseAirbnbCSV(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  if (!headers.includes('confirmation code') || !headers.includes('gross earnings') || !headers.includes('type')) return null;
  const kind = headers.includes('paid out') ? 'completed' : 'upcoming';
  const num = v => parseFloat(String(v ?? '').replace(/[$,\s]/g, '')) || 0;
  const byCode = new Map(), payouts = [];
  lines.slice(1).forEach(line => {
    const c = parseCSVLine(line), r = {};
    headers.forEach((h, i) => r[h] = c[i] ?? '');
    const type = r['type'];
    if (type === 'Payout') {
      if (r['reference code']) payouts.push({ ref: r['reference code'], date: parseUSDate(r['date']), arriveBy: parseUSDate(r['arriving by date']), amount: num(r['paid out']) });
      return;
    }
    const code = r['confirmation code'];
    if (!code) return;
    let b = byCode.get(code);
    if (!b) { b = { code, guest:'', listing:'', bookedOn:null, checkIn:null, checkOut:null, gross:0, serviceFee:0, cleaningFee:0, hostTax:0, adjustments:0, platformTax:0, payout:0, payments:{} }; byCode.set(code, b); }
    b.guest    = b.guest    || r['guest'];
    b.listing  = b.listing  || r['listing'];
    b.bookedOn = b.bookedOn || parseUSDate(r['booking date']);
    b.checkIn  = b.checkIn  || parseUSDate(r['start date']);
    b.checkOut = b.checkOut || parseUSDate(r['end date']);
    const amt = num(r['amount']);
    if (type === 'Reservation') {
      b.gross       += num(r['gross earnings']);
      b.serviceFee  += num(r['service fee']) + num(r['fast pay fee']);
      b.cleaningFee += num(r['cleaning fee']);
      b.platformTax += num(r['airbnb remitted tax']);
    } else if (type === 'Host Remitted Tax') {
      b.hostTax += amt;
    } else {
      b.adjustments += amt; // Resolution Adjustment and any other money row
    }
    b.payout += amt;
    const d = parseUSDate(r['date']);
    if (d) b.payments[d] = (b.payments[d] || 0) + amt;
  });
  const list = [...byCode.values()].filter(b => b.checkIn).map(b => ({
    ...b,
    nights: b.checkOut ? Math.max(0, daysBetween(b.checkIn, b.checkOut)) : 0,
    gross: round2(b.gross), serviceFee: round2(b.serviceFee), cleaningFee: round2(b.cleaningFee),
    hostTax: round2(b.hostTax), adjustments: round2(b.adjustments), platformTax: round2(b.platformTax), payout: round2(b.payout),
    payments: Object.entries(b.payments).sort().map(([date, amount]) => ({ date, amount: round2(amount) })),
  }));
  return { platform: 'airbnb', kind, bookings: list, payouts };
}
async function handlePropCSV(input) {
  const file = input.files[0];
  input.value = '';
  const s = currentPropStream();
  if (!file || !s) return;
  const text = await file.text();
  const assets = parseAssetCSV(text);
  if (assets) { if (!assets.length) alert('No assets found in this file.'); else importPropAssets(assets, s); return; }
  const parsed = parseAirbnbCSV(text) || parseBookabachCSV(text);
  if (!parsed) { alert("This doesn't look like an Airbnb, Bookabach or asset list CSV.\n\nAirbnb: Earnings → Transaction history (completed or upcoming) → Export CSV.\nBookabach: Payout summary report → Export CSV."); return; }
  importPlatformBookings(parsed, s);
}
const PLATFORM_NAMES = { airbnb: 'Airbnb', bookabach: 'Bookabach' };
const platformName = p => PLATFORM_NAMES[p] || p;

// ── Bookabach (Vrbo) payout summary report ──
// One row per booking, paid out in one go around check-in. "Gross booking
// amount" already includes the GST flat-rate credit ("Lodging Tax Owner
// Remits"), so it's split out to match Airbnb's gross + Host Remitted Tax.
const MONTHS_LONG = ['january','february','march','april','may','june','july','august','september','october','november','december'];
function parseLongDate(s) {
  const m = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec((s || '').trim());
  if (!m) return null;
  const mi = MONTHS_LONG.findIndex(n => n.startsWith(m[2].toLowerCase().slice(0, 3)));
  return mi < 0 ? null : `${m[3]}-${String(mi + 1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}
function parseBookabachCSV(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').toLowerCase());
  if (!headers.includes('reservation id') || !headers.includes('gross booking amount') || !headers.includes('payout')) return null;
  const num = v => parseFloat(String(v ?? '').replace(/[$,\s"]/g, '')) || 0;
  const today = todayLocal();
  const list = [], payouts = [];
  lines.slice(1).forEach(line => {
    const c = parseCSVLine(line), r = {};
    headers.forEach((h, i) => r[h] = (c[i] ?? '').replace(/^"|"$/g, ''));
    const code = r['reservation id'];
    const checkIn = parseLongDate(r['check-in']), checkOut = parseLongDate(r['check-out']);
    if (!code || !checkIn) return;
    const payDate = parseLongDate(r['payout date']);
    const gross = num(r['gross booking amount']), fees = num(r['deductions']), payout = num(r['payout']);
    const lodgingTax = num(r['lodging tax owner remits']);
    const status = /cancel/i.test(r['booking status']) ? 'cancelled' : (payDate && payDate <= today ? 'completed' : 'upcoming');
    list.push({
      code, guest: [r['traveler first name'], r['traveler last name']].filter(Boolean).join(' '), listing: r['address'],
      bookedOn: null, checkIn, checkOut, nights: checkOut ? Math.max(0, daysBetween(checkIn, checkOut)) : (parseInt(r['nights']) || 0),
      gross: round2(gross - lodgingTax), serviceFee: round2(fees), cleaningFee: 0, hostTax: round2(lodgingTax),
      adjustments: 0, platformTax: round2(num(r['tax withheld'])), payout: round2(payout),
      payments: payDate ? [{ date: payDate, amount: round2(payout) }] : [], status,
    });
    if (payDate && payout > 0) {
      const arrive = isoToDate(payDate); arrive.setDate(arrive.getDate() + 3);
      payouts.push({ ref: code, date: payDate, arriveBy: dateToIso(arrive), amount: payout });
    }
  });
  return list.length ? { platform: 'bookabach', kind: 'mixed', bookings: list, payouts } : null;
}

// Shared by every platform: upsert bookings by '<platform>:<code>' and payouts
// by '<platform>:<ref>'. Bookings carry their own status (Bookabach) or take
// the export's (Airbnb completed / upcoming files).
function importPlatformBookings(parsed, s) {
  const platform = parsed.platform || 'airbnb';
  let added = 0, updated = 0, kept = 0, otherProp = 0;
  const seen = new Set();
  parsed.bookings.forEach(p => {
    const id = platform + ':' + p.code;
    seen.add(id);
    const ex = bookings.find(b => b.id === id);
    if (ex && ex.streamId !== s.id) { otherProp++; return; }
    const status = p.status || parsed.kind;
    // Never let an older upcoming export downgrade a booking already paid out.
    if (ex && ex.status === 'completed' && status === 'upcoming') { kept++; return; }
    const rec = { ...(ex || {}), id, streamId: s.id, platform, ...p,
      status: status === 'cancelled' ? (ex?.status || 'upcoming') : status, cancelled: status === 'cancelled', importedAt: todayLocal() };
    if (ex) { Object.assign(ex, rec); updated++; } else { bookings.push(rec); added++; }
    reviveTombstone('bookings', id);
  });
  parsed.payouts.forEach(p => {
    const id = platform + ':' + p.ref;
    const rec = { id, streamId: s.id, platform, date: p.date, arriveBy: p.arriveBy, amount: round2(p.amount) };
    const ex = propPayouts.find(x => x.id === id);
    if (ex) Object.assign(ex, rec); else propPayouts.push(rec);
    reviveTombstone('propPayouts', id);
  });
  // A future booking that was in an earlier upcoming export but has vanished
  // from this one was most likely cancelled. Ask rather than delete, since a
  // partial export would otherwise wipe real bookings.
  let flagged = 0;
  if (parsed.kind === 'upcoming' || parsed.kind === 'mixed') {
    const today = todayLocal();
    const missing = bookings.filter(b => b.streamId===s.id && b.platform===platform && b.status==='upcoming' && !b.cancelled && b.checkIn >= today && !seen.has(b.id));
    if (missing.length && confirm(`${missing.length} upcoming booking${missing.length===1?' is':'s are'} no longer in this export:\n\n${missing.map(b=>`${fmtDay(b.checkIn)} · ${b.nights} nights · ${fmt(b.payout)}`).join('\n')}\n\nMark ${missing.length===1?'it':'them'} as cancelled? (They'll be left out of totals and forecasts.)`)) {
      missing.forEach(b => b.cancelled = true); flagged = missing.length;
    }
  }
  // "Other booking" calendar marks were a stand-in for stays that weren't
  // imported yet -- drop the ones the imported bookings now cover.
  const covered = new Set();
  bookings.filter(b => b.streamId === s.id && seen.has(b.id) && !b.cancelled && b.nights).forEach(b => {
    for (let d = isoToDate(b.checkIn), e = isoToDate(b.checkOut); d < e; d.setDate(d.getDate() + 1)) covered.add(dateToIso(d));
  });
  const stale = propDays.filter(d => d.streamId === s.id && d.type === 'booked' && covered.has(d.date));
  stale.forEach(d => removePropDay(d.id));
  scheduleSave();
  propTab = 'bookings';
  renderProperty();
  alert((stale.length ? `Removed ${stale.length} "Other booking" calendar mark${stale.length===1?'':'s'} now covered by imported bookings.\n\n` : '') + `${platformName(platform)}${parsed.kind === 'mixed' ? '' : ' ' + parsed.kind} export imported:\n\n${added} new booking${added===1?'':'s'}, ${updated} updated` +
    (kept ? `\n${kept} already completed (left as-is)` : '') +
    (otherProp ? `\n${otherProp} skipped (already belong to another property)` : '') +
    (flagged ? `\n${flagged} marked as cancelled` : '') +
    (parsed.payouts.length ? `\n${parsed.payouts.length} payout transfer${parsed.payouts.length===1?'':'s'} recorded` : ''));
}
