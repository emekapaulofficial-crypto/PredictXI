const LEAGUES = [
  ['eng.1', 'Premier League'],
  ['esp.1', 'La Liga'],
  ['ita.1', 'Serie A'],
  ['ger.1', 'Bundesliga'],
  ['fra.1', 'Ligue 1'],
  ['uefa.champions', 'Champions League'],
  ['uefa.europa', 'Europa League']
];

const CACHE_TTL_SECONDS = 60 * 60 * 6;
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, ...extra }
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

async function fetchLeague(code, name, startDate, endDate, signal) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${encodeURIComponent(`${startDate}-${endDate}`)}&limit=100`;
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

function cacheKey(startDate) {
  return new Request(`https://statkick.internal/api/fixtures?date=${startDate}&days=7`);
}

async function fetchFresh(startDate, days) {
  const endDate = addDays(startDate, days - 1);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const results = await Promise.allSettled(
      LEAGUES.map(([code, name]) => fetchLeague(code, name, startDate, endDate, controller.signal))
    );
    const matches = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const unique = [...new Map(matches.map(m => [m.external_id, m])).values()];
    unique.sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
    return { unique, endDate };
  } finally {
    clearTimeout(timer);
  }
}

async function fixtures(request) {
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get('date');
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '')
    ? requestedDate
    : new Date().toISOString().slice(0, 10);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 3), 1), 7);
  const endDate = addDays(startDate, days - 1);

  // The daily cache is warmed automatically by Cloudflare Cron. A live request
  // falls back to a fresh feed whenever the cache is cold.
  if (startDate === new Date().toISOString().slice(0, 10)) {
    const cached = await caches.default.match(cacheKey(startDate));
    if (cached) {
      const data = await cached.json();
      const filtered = (data.fixtures || []).filter(m => {
        const d = String(m.kickoff_at || '').slice(0, 10);
        return d >= startDate && d <= endDate;
      });
      return json({ ...data, start_date: startDate, end_date: endDate, days, count: filtered.length, fixtures: filtered, cached: true });
    }
  }

  try {
    const { unique } = await fetchFresh(startDate, days);
    return json({
      ok: true,
      source: 'football fixtures feed',
      start_date: startDate,
      end_date: endDate,
      days,
      count: unique.length,
      fixtures: unique,
      cached: false
    });
  } catch (error) {
    return json({ ok: false, error: 'Fixtures temporarily unavailable', detail: String(error?.message || error) }, 503);
  }
}

async function warmDailyFixtures() {
  const today = new Date().toISOString().slice(0, 10);
  const { unique, endDate } = await fetchFresh(today, 7);
  const response = json({
    ok: true,
    source: 'football fixtures feed',
    start_date: today,
    end_date: endDate,
    days: 7,
    count: unique.length,
    fixtures: unique,
    cached: true,
    updated_at: new Date().toISOString()
  });
  await caches.default.put(cacheKey(today), response.clone());
  return unique.length;
}

export default {
  async scheduled(controller, env, ctx) {
    // Refresh the upcoming seven-day fixture list twice daily.
    try {
      const count = await warmDailyFixtures();
      console.log(`daily fixture update complete: ${count} matches`);
    } catch (error) {
      console.error('daily fixture update failed', error);
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/fixtures') return fixtures(request);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'statkick-football-feed', time: new Date().toISOString() });
    return env.ASSETS.fetch(request);
  }
};
