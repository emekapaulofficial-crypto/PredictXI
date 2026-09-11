const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

let lastFixtures = null;
let refreshTimer = null;

async function loadFixtures() {
  const date = new Date().toISOString().slice(0, 10);
  const response = await fetch(`/api/fixtures?date=${date}&days=3`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Fixture feed returned ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error('Fixture feed returned an invalid response');
  return data.fixtures || [];
}

function renderFixtures(fixtures) {
  const host = document.querySelector('.live-grid');
  if (!host) return false;
  host.dataset.fixturesLoaded = '1';
  const visible = fixtures.filter(f => f.status === 'pre' || f.status === 'in').slice(0, 12);
  if (!visible.length) {
    host.innerHTML = `<div class="card" style="padding:20px"><p class="muted">No upcoming fixtures are available right now.</p><button class="btn primary" type="button" id="fixtureRefresh">Refresh matches</button></div>`;
    host.querySelector('#fixtureRefresh')?.addEventListener('click', () => runFixtures(true));
    return true;
  }
  host.innerHTML = visible.map(f => {
    const when = new Date(f.kickoff_at);
    const live = f.status === 'in';
    return `<article class="live-card fixture-card">
      <div class="live-top"><span class="live-badge">${live ? 'LIVE' : 'UPCOMING'}</span><span class="muted">${esc(f.competition)}</span></div>
      <div class="fixture-teams">
        <div class="fixture-team">${f.home_logo ? `<img src="${esc(f.home_logo)}" alt="">` : ''}<b>${esc(f.home_team)}</b></div>
        <div class="vs">${live ? `${esc(f.home_score ?? 0)} - ${esc(f.away_score ?? 0)}` : 'VS'}</div>
        <div class="fixture-team">${f.away_logo ? `<img src="${esc(f.away_logo)}" alt="">` : ''}<b>${esc(f.away_team)}</b></div>
      </div>
      <small class="muted">${when.toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})}</small>
    </article>`;
  }).join('');
  return true;
}

async function runFixtures(force = false) {
  try {
    const fixtures = await loadFixtures();
    lastFixtures = fixtures;
    renderFixtures(fixtures);
    document.documentElement.dataset.fixtures = 'connected';
  } catch (error) {
    console.error('StatKick fixtures:', error);
    const host = document.querySelector('.live-grid');
    if (host) {
      host.dataset.fixturesLoaded = '1';
      host.innerHTML = `<div class="card" style="padding:20px"><p class="muted">Fixtures are temporarily unavailable. Please refresh shortly.</p><button class="btn primary" type="button" id="fixtureRetry">Try again</button></div>`;
      host.querySelector('#fixtureRetry')?.addEventListener('click', () => runFixtures(true));
    }
    document.documentElement.dataset.fixtures = 'error';
  }
}

function hydrateNewLiveGrid() {
  const host = document.querySelector('.live-grid');
  if (!host || host.dataset.fixturesLoaded === '1') return;
  if (lastFixtures) renderFixtures(lastFixtures);
  else runFixtures();
}

function injectStyles() {
  if (document.querySelector('#statkick-fixtures-css')) return;
  const style = document.createElement('style');
  style.id = 'statkick-fixtures-css';
  style.textContent = `.fixture-card{min-height:150px}.fixture-teams{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin:14px 0}.fixture-team{display:flex;align-items:center;gap:8px;min-width:0}.fixture-team:last-child{justify-content:flex-end;text-align:right}.fixture-team img{width:28px;height:28px;object-fit:contain}.fixture-team b{font-size:13px}.live-grid{min-height:150px}`;
  document.head.appendChild(style);
}

function boot() {
  injectStyles();
  hydrateNewLiveGrid();
  if (!refreshTimer) refreshTimer = setInterval(() => runFixtures(), 5 * 60 * 1000);
  const app = document.querySelector('#app');
  if (app && !app.dataset.fixturesObserver) {
    app.dataset.fixturesObserver = '1';
    const observer = new MutationObserver(() => queueMicrotask(hydrateNewLiveGrid));
    observer.observe(app, { childList: true, subtree: true });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
