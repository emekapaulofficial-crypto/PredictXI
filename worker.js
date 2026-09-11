const LEAGUES = [
  ['eng.1', 'Premier League'],
  ['esp.1', 'La Liga'],
  ['ita.1', 'Serie A'],
  ['ger.1', 'Bundesliga'],
  ['fra.1', 'Ligue 1'],
  ['uefa.champions', 'Champions League'],
  ['uefa.europa', 'Europa League']
];

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
});

function normalizeEvent(event, leagueName) {
  const c = event.competitions?.[0];
  const home = c?.competitors?.find(x => x.homeAway === 'home');
  const away = c?.competitors?.find(x => x.homeAway === 'away');
  if (!home || !away) return null;
  return {
    external_id: String(event.id),
    competition: leagueName,
    competition_id: event.league?.id || null,
    home_team: home.team?.displayName || home.team?.name || 'Home',
    away_team: away.team?.displayName || away.team?.name || 'Away',
    home_logo: home.team?.logo || null,
    away_logo: away.team?.logo || null,
    kickoff_at: event.date || c?.startDate || null,
    status: c?.status?.type?.state || event.status?.type?.state || 'pre',
    status_detail: c?.status?.type?.shortDetail || c?.status?.type?.description || 'Scheduled',
    home_score: home.score != null ? Number(home.score) : null,
    away_score: away.score != null ? Number(away.score) : null
  };
}

async function fetchLeague(code, name, date, signal) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${encodeURIComponent(date)}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${name}: upstream ${response.status}`);
  const data = await response.json();
  return (data.events || []).map(e => normalizeEvent(e, name)).filter(Boolean);
}

function addDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fixtures(request) {
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get('date');
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '')
    ? requestedDate
    : new Date().toISOString().slice(0, 10);

  // Keep the public fixture feed fast and reliable. The frontend only needs the next few days.
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 3), 1), 3);
  const requested = url.searchParams.get('leagues');
  const selected = requested
    ? LEAGUES.filter(([code]) => requested.split(',').includes(code))
    : LEAGUES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const dates = Array.from({ length: days }, (_, i) => addDays(startDate, i));
    const jobs = [];
    for (const date of dates) {
      for (const [code, name] of selected) jobs.push(fetchLeague(code, name, date, controller.signal));
    }
    const results = await Promise.allSettled(jobs);
    const matches = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const unique = [...new Map(matches.map(m => [m.external_id, m])).values()];
    unique.sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
    return json({ ok: true, source: 'football fixtures feed', start_date: startDate, days, count: unique.length, fixtures: unique });
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/fixtures') return fixtures(request);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'statkick-football-feed', time: new Date().toISOString() });
    return env.ASSETS.fetch(request);
  }
};
