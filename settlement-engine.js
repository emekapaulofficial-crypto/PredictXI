/**
 * StatKick settlement engine.
 * Pure, deterministic and intentionally refuses to settle on incomplete/conflicting data.
 * Production adapters should supply verified contracted statistics and approved market lines.
 */

export class SettlementBlockedError extends Error {
  constructor(message, details = {}) { super(message); this.name = 'SettlementBlockedError'; this.details = details; }
}

export const DEFAULT_MARKETS = [
  'total_goals','total_corners','total_cards','total_fouls','shots_on_target','total_offsides',
  'total_passes','home_possession','away_possession','home_shots','away_shots','home_corners',
  'away_corners','home_cards','away_cards','home_shots_on_target','away_shots_on_target',
  'both_teams_to_score','red_card','first_half_goals'
];

function assertBinaryLine(line) {
  if (!line || !['over_under','yes_no'].includes(line.type)) throw new SettlementBlockedError('Market line is not configured.', { line });
  if (line.type === 'over_under' && !Number.isFinite(Number(line.threshold))) throw new SettlementBlockedError('Market threshold is invalid.', { line });
}

function resultFor(line, value) {
  assertBinaryLine(line);
  if (line.type === 'yes_no') return value === true ? 'YES' : 'NO';
  const n = Number(value), t = Number(line.threshold);
  if (!Number.isFinite(n)) throw new SettlementBlockedError('Required statistic is missing or invalid.', { value, line });
  return n >= t ? 'OVER' : 'UNDER';
}

export function evaluateMarkets(finalStats, marketLines) {
  if (!finalStats || finalStats.status !== 'official') throw new SettlementBlockedError('Final statistics are not official/confirmed.');
  const missing = DEFAULT_MARKETS.filter(k => !(k in finalStats.values));
  if (missing.length) throw new SettlementBlockedError('Settlement paused: required statistics are missing.', { missing });
  const results = {};
  for (const key of DEFAULT_MARKETS) {
    const line = marketLines[key];
    assertBinaryLine(line);
    results[key] = { result: resultFor(line, finalStats.values[key]), value: finalStats.values[key], line };
  }
  return results;
}

export function scoreEntry(selectionKeys, marketResults) {
  if (!Array.isArray(selectionKeys) || selectionKeys.length !== 10) throw new SettlementBlockedError('Entry must contain exactly 10 selections.');
  const unique = new Set(selectionKeys);
  if (unique.size !== 10) throw new SettlementBlockedError('Entry contains duplicate selections.');
  let score = 0;
  const outcomes = selectionKeys.map(key => {
    const market = marketResults[key];
    if (!market) throw new SettlementBlockedError('Selected market has no settled result.', { key });
    const win = Boolean(market.playerSide === market.result);
    if (win) score += 1;
    return { market: key, predicted: market.playerSide, result: market.result, outcome: win ? 'WIN' : 'LOSS' };
  });
  return { score, outOf: 10, outcomes };
}

export function settlePool({ pool, entries, finalStats, marketLines, payoutConfig, cashWinnerCount, tieBreaker }) {
  if (pool.status === 'SETTLED') return { alreadySettled: true, settlementId: pool.settlementId };
  if (!pool.lockedAt) throw new SettlementBlockedError('Pool is not locked.');
  if (!Array.isArray(entries) || entries.length === 0) throw new SettlementBlockedError('Pool has no entries.');
  const markets = evaluateMarkets(finalStats, marketLines);
  for (const entry of entries) {
    if (entry.status !== 'PAID') throw new SettlementBlockedError('Every entry must be paid before settlement.', { entryId: entry.id });
    if (entry.selections.length !== 10) throw new SettlementBlockedError('Invalid entry selection count.', { entryId: entry.id });
  }
  for (const key of DEFAULT_MARKETS) markets[key].playerSide = undefined;
  const scored = entries.map(entry => {
    const playerResults = {};
    for (const selection of entry.selections) {
      const m = markets[selection.market];
      if (!m) throw new SettlementBlockedError('Unknown selected market.', { market: selection.market });
      playerResults[selection.market] = { ...m, playerSide: selection.side };
    }
    const score = scoreEntry(entry.selections.map(s => s.market), playerResults);
    return { entryId: entry.id, playerId: entry.playerId, ...score };
  });
  const count = cashWinnerCount ?? payoutConfig?.winnerCount;
  if (!Number.isInteger(count) || count < 1 || count > scored.length) throw new SettlementBlockedError('Winner count is not configured for this pool.');
  if (typeof tieBreaker !== 'function') throw new SettlementBlockedError('Deterministic tie-breaker is not configured.');
  const ranked = [...scored].sort((a,b) => b.score-a.score || tieBreaker(a,b));
  const payoutPercentages = payoutConfig?.percentages;
  if (!Array.isArray(payoutPercentages) || payoutPercentages.length !== count) throw new SettlementBlockedError('Prize percentages are not configured for this winner count.');
  const totalPrize = Number(pool.prizePool);
  if (!Number.isFinite(totalPrize) || totalPrize < 0) throw new SettlementBlockedError('Prize pool amount is invalid.');
  const percentageTotal = payoutPercentages.reduce((a,b)=>a+Number(b),0);
  if (percentageTotal !== 100) throw new SettlementBlockedError('Prize percentages must total 100.');
  const awards = ranked.map((r,i) => ({ ...r, rank:i+1, prize: i < count ? Math.round(totalPrize * Number(payoutPercentages[i]) / 100) : 0, diamond: i === count }));
  return { status:'SETTLED', marketResults:markets, rankings:awards, winnerCount:count, totalPrize, commission:Number(pool.paidEntryVolume)*0.10 };
}

export function applyDiamondReward(diamonds) {
  if (!Number.isInteger(diamonds) || diamonds < 0) throw new Error('Invalid Diamond balance');
  if (diamonds < 3) return { diamonds, freeEntry:false };
  return { diamonds: diamonds - 3, freeEntry:true, value:2000 };
}
