const LEAGUES = [
  ['eng.1', 'Premier League'],
  ['esp.1', 'La Liga'],
  ['ita.1', 'Serie A'],
  ['ger.1', 'Bundesliga'],
  ['fra.1', 'Ligue 1'],
  ['uefa.champions', 'Champions League'],
  ['uefa.europa', 'Europa League']
];

const SUPABASE_URL = 'https://iixnmsdysfjtzdfcqczx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BzaxZdqd0DHhXe4wRPs3nQ_yZvuqgz4';
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
  const response = await fetch(url, { signal, cf: { cacheTtl: 0, cacheEverything: false } });
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
    const failures = results.filter(r => r.status === 'rejected').map(r => String(r.reason?.message || r.reason));
    const matches = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (!matches.length && failures.length === LEAGUES.length) {
      throw new Error(failures.join(' | '));
    }
    const unique = [...new Map(matches.map(m => [m.external_id, m])).values()];
    unique.sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
    return { unique, endDate, failures };
  } finally {
    clearTimeout(timer);
  }
}

async function syncFixturesToSupabase(fixtures) {
  if (!fixtures.length) return { ok: true, fixtures_synced: 0, pools_created: 0 };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_fixture_feed`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'content-type': 'application/json',
      'cache-control': 'no-cache'
    },
    body: JSON.stringify({ p_fixtures: fixtures })
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!response.ok) throw new Error(`Supabase sync ${response.status}: ${data?.message || data?.error || text}`);
  return data;
}

async function fixtures(request) {
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get('date');
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '')
    ? requestedDate
    : new Date().toISOString().slice(0, 10);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 3), 1), 7);
  const force = url.searchParams.has('refresh');
  const endDate = addDays(startDate, days - 1);

  if (!force && startDate === new Date().toISOString().slice(0, 10)) {
    const cached = await caches.default.match(cacheKey(startDate));
    if (cached) {
      const data = await cached.json();
      const filtered = (data.fixtures || []).filter(m => {
        const d = String(m.kickoff_at || '').slice(0, 10);
        return d >= startDate && d <= endDate;
      });
      return json({ ...data, start_date: startDate, end_date: endDate, days, count: filtered.length, fixtures: filtered, cached: true }, 200, { 'cache-control': 'no-store' });
    }
  }

  try {
    const { unique, failures } = await fetchFresh(startDate, days);
    let sync = null;
    let sync_error = null;
    try {
      sync = await syncFixturesToSupabase(unique);
    } catch (error) {
      sync_error = String(error?.message || error);
      console.error('Supabase fixture sync failed', sync_error);
    }
    return json({
      ok: true,
      source: 'football fixtures feed',
      start_date: startDate,
      end_date: endDate,
      days,
      count: unique.length,
      fixtures: unique,
      cached: false,
      partial: failures.length > 0,
      synced: !!sync && !sync_error,
      sync,
      sync_error
    }, 200, { 'cache-control': 'no-store' });
  } catch (error) {
    return json({ ok: false, error: 'Fixtures temporarily unavailable', detail: String(error?.message || error) }, 503, { 'cache-control': 'no-store' });
  }
}

async function warmDailyFixtures() {
  const today = new Date().toISOString().slice(0, 10);
  const { unique, endDate, failures } = await fetchFresh(today, 7);
  const sync = await syncFixturesToSupabase(unique);
  const response = json({
    ok: true,
    source: 'football fixtures feed',
    start_date: today,
    end_date: endDate,
    days: 7,
    count: unique.length,
    fixtures: unique,
    cached: true,
    partial: failures.length > 0,
    synced: true,
    sync,
    updated_at: new Date().toISOString()
  }, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` });
  await caches.default.put(cacheKey(today), response.clone());
  return unique.length;
}

export default {
  async scheduled(controller, env, ctx) {
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
    if (url.pathname === '/api/health') return json({ ok: true, service: 'statkick-football-feed', time: new Date().toISOString() }, 200, { 'cache-control': 'no-store' });
    return env.ASSETS.fetch(request);
  }
};
