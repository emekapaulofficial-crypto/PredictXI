const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

async function loadRobotFixtures() {
  const date = new Date().toISOString().slice(0, 10);
  const response = await fetch(`/api/fixtures?date=${date}&days=7`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Football agent returned ${response.status}`);
  const data = await response.json();
  return data.fixtures || [];
}

function renderFixtures(fixtures) {
  const host = document.querySelector('.live-grid');
  if (!host) return;
  const visible = fixtures.filter(f => f.status === 'pre' || f.status === 'in').slice(0, 12);
  if (!visible.length) {
    host.innerHTML = `<div class="card" style="padding:20px"><p class="muted">The football robot is connected, but no upcoming fixtures were returned yet.</p><button class="btn primary" type="button" onclick="window.location.reload()">Refresh matches</button></div>`;
    return;
  }
  host.innerHTML = visible.map(f => {
    const when = new Date(f.kickoff_at);
    const live = f.status === 'in';
    return `<article class="live-card robot-fixture">
      <div class="live-top"><span class="live-badge">${live ? 'LIVE' : 'UPCOMING'}</span><span class="muted">${esc(f.competition)}</span></div>
      <div class="robot-teams">
        <div class="robot-team">${f.home_logo ? `<img src="${esc(f.home_logo)}" alt="">` : ''}<b>${esc(f.home_team)}</b></div>
        <div class="vs">${live ? `${esc(f.home_score ?? 0)} - ${esc(f.away_score ?? 0)}` : 'VS'}</div>
        <div class="robot-team">${f.away_logo ? `<img src="${esc(f.away_logo)}" alt="">` : ''}<b>${esc(f.away_team)}</b></div>
      </div>
      <small class="muted">${when.toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})}</small>
    </article>`;
  }).join('');
}

async function runFootballRobot() {
  try {
    const fixtures = await loadRobotFixtures();
    renderFixtures(fixtures);
    document.documentElement.dataset.footballRobot = 'connected';
  } catch (error) {
    console.error('StatKick football robot:', error);
    const host = document.querySelector('.live-grid');
    if (host) host.innerHTML = `<div class="card" style="padding:20px"><p class="muted">Football robot connection is temporarily unavailable. Please refresh shortly.</p></div>`;
    document.documentElement.dataset.footballRobot = 'error';
  }
}

function injectStyles() {
  if (document.querySelector('#statkick-robot-css')) return;
  const style = document.createElement('style');
  style.id = 'statkick-robot-css';
  style.textContent = `.robot-fixture{min-height:150px}.robot-teams{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin:14px 0}.robot-team{display:flex;align-items:center;gap:8px;min-width:0}.robot-team:last-child{justify-content:flex-end;text-align:right}.robot-team img{width:28px;height:28px;object-fit:contain}.robot-team b{font-size:13px}.live-grid{min-height:150px}`;
  document.head.appendChild(style);
}

function boot() {
  injectStyles();
  runFootballRobot();
  setInterval(runFootballRobot, 5 * 60 * 1000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
