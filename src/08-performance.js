/* =========================================================================
 * 8. Pool performance, standings, progression routes, scenarios
 * ======================================================================= */

function performanceTeamKey(id, name) {
    return id != null && Number.isFinite(Number(id)) ? `id:${Number(id)}` : `name:${normName(name)}`;
}

function directoryTeamForParticipant(participant) {
    if (!participant) return null;
    if (participant.id != null) {
        const byId = state.teamById.get(Number(participant.id));
        if (byId) return byId;
    }
    const label = normName(participant.label || participant.name);
    return label ? state.teamDirectory.find(team => normName(team.name) === label) || null : null;
}

function ensurePerformanceTeam(pool, participant, sourceTeam = null) {
    const rawId = participant?.id ?? sourceTeam?.TeamId ?? sourceTeam?.teamId ?? null;
    const id = Number(rawId) > 0 ? Number(rawId) : null;
    const rawName = participant?.label || sourceTeam?.TeamName || sourceTeam?.Name || sourceTeam?.TeamText || '';
    if (!rawName || looksLikeDependency(rawName) || /^TBD$/i.test(rawName)) return null;
    const directoryTeam = directoryTeamForParticipant({ id, label: rawName });
    const name = directoryTeam?.name || rawName;
    const key = performanceTeamKey(id ?? directoryTeam?.id, name);
    if (!pool.teams.has(key)) {
        pool.teams.set(key, {
            key,
            id: id ?? directoryTeam?.id ?? null,
            name,
            clubId: directoryTeam?.clubId ?? sourceTeam?.Club?.ClubId ?? null,
            clubName: directoryTeam?.clubName || sourceTeam?.Club?.Name || '',
            matchWins: 0,
            matchLosses: 0,
            setWins: 0,
            setLosses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            remaining: 0,
            sourceMetrics: sourceTeamMetrics(sourceTeam),
            rank: null,
            calcRank: null,
            officialRank: null,
            recordSource: 'calc'
        });
    }
    const row = pool.teams.get(key);
    if (sourceTeam) row.sourceMetrics = { ...row.sourceMetrics, ...sourceTeamMetrics(sourceTeam) };
    return row;
}

// AES-published standing fields, when present. Field names are checked defensively
// because they are not documented; "Rank" is deliberately excluded since it can be a seed.
function sourceTeamMetrics(team) {
    if (!team || typeof team !== 'object') return {};
    return {
        matchWins: firstNumericField(team, ['MatchesWon', 'MatchWins', 'MatchWon', 'Wins', 'Won']),
        matchLosses: firstNumericField(team, ['MatchesLost', 'MatchLosses', 'MatchLost', 'Losses', 'Lost']),
        setWins: firstNumericField(team, ['SetsWon', 'SetWins', 'GamesWon', 'GameWins']),
        setLosses: firstNumericField(team, ['SetsLost', 'SetLosses', 'GamesLost', 'GameLosses']),
        pointsFor: firstNumericField(team, ['PointsFor', 'PointsWon', 'PointFor', 'ScoreFor']),
        pointsAgainst: firstNumericField(team, ['PointsAgainst', 'PointsLost', 'PointAgainst', 'ScoreAgainst']),
        pointRatio: firstNumericField(team, ['PointRatio', 'PointsRatio', 'PointPercentage']),
        remaining: firstNumericField(team, ['MatchesRemaining', 'RemainingMatches', 'GamesRemaining']),
        officialRank: firstNumericField(team, ['FinishRank', 'FinishPlace', 'FinishPosition', 'Place', 'Standing'])
    };
}

// Prefer AES's published record when it covers at least as many matches as the calculated one.
function applySourceMetrics(row) {
    const aes = row.sourceMetrics || {};
    row.recordSource = 'calc';
    if (aes.matchWins != null && aes.matchLosses != null && aes.matchWins + aes.matchLosses >= row.matchWins + row.matchLosses) {
        row.matchWins = aes.matchWins;
        row.matchLosses = aes.matchLosses;
        row.recordSource = 'aes';
    }
    if (aes.setWins != null && aes.setLosses != null && aes.setWins + aes.setLosses >= row.setWins + row.setLosses) {
        row.setWins = aes.setWins;
        row.setLosses = aes.setLosses;
    }
    if (row.pointsFor === 0 && row.pointsAgainst === 0 && (aes.pointsFor != null || aes.pointsAgainst != null)) {
        row.pointsFor = aes.pointsFor || 0;
        row.pointsAgainst = aes.pointsAgainst || 0;
    }
    if (row.remaining === 0 && aes.remaining != null) row.remaining = aes.remaining;
    row.aesPointRatio = aes.pointRatio != null && aes.pointRatio >= 0 ? aes.pointRatio : null;
    row.officialRank = aes.officialRank > 0 ? aes.officialRank : null;
}

const pct = (wins, losses) => (wins + losses ? wins / (wins + losses) : 0);

function pointRatioOf(row) {
    if (row.aesPointRatio != null) return row.aesPointRatio;
    if (row.pointsAgainst > 0) return row.pointsFor / row.pointsAgainst;
    return row.pointsFor > 0 ? Infinity : 0;
}

function formatRatio(row) {
    const ratio = pointRatioOf(row);
    if (ratio === Infinity) return 'all won';
    return row.pointsFor || row.pointsAgainst || row.aesPointRatio != null ? ratio.toFixed(3) : '-';
}

// Calculated order: match win %, set win %, head-to-head for a two-way tie, point ratio.
// When the pool is complete and AES publishes finish places, those take over.
function rankPoolRows(pool) {
    const sameRecord = (a, b) => a.matchWins === b.matchWins && a.matchLosses === b.matchLosses
        && Math.abs(pct(a.setWins, a.setLosses) - pct(b.setWins, b.setLosses)) < 1e-9;
    const rows = [...pool.teams.values()].sort((a, b) =>
        pct(b.matchWins, b.matchLosses) - pct(a.matchWins, a.matchLosses)
        || b.matchWins - a.matchWins
        || pct(b.setWins, b.setLosses) - pct(a.setWins, a.setLosses)
        || pointRatioOf(b) - pointRatioOf(a)
        || a.name.localeCompare(b.name));
    for (let i = 0; i < rows.length - 1; i += 1) {
        const a = rows[i];
        const b = rows[i + 1];
        if (!sameRecord(a, b)) continue;
        const threeWay = (i > 0 && sameRecord(rows[i - 1], a)) || (i + 2 < rows.length && sameRecord(b, rows[i + 2]));
        if (threeWay) continue;
        if (pool.h2h.get(`${a.key}|${b.key}`) === b.key) {
            rows[i] = b;
            rows[i + 1] = a;
        }
        i += 1;
    }
    rows.forEach((row, index) => { row.calcRank = index + 1; });
    pool.hasOfficialFinish = pool.complete && rows.length > 0 && rows.every(row => row.officialRank > 0);
    if (pool.hasOfficialFinish) rows.sort((a, b) => a.officialRank - b.officialRank || a.calcRank - b.calcRank);
    rows.forEach(row => { row.rank = pool.hasOfficialFinish ? row.officialRank : row.calcRank; });
    pool.standings = rows;
}

function buildPoolPerformanceModel() {
    const pools = new Map();
    for (const standings of state.nodes.values()) {
        if (standings.kind !== 'standings') continue;
        const matches = (state.poolMembers.get(standings.poolGroupKey) || [])
            .map(key => state.nodes.get(key))
            .filter(node => node?.kind === 'match')
            .sort(compareNodeSchedule);
        const times = matches.map(node => parseEventTime(node.match?.ScheduledStartDateTime)).filter(Number.isFinite);
        const pool = {
            key: standings.poolGroupKey,
            playId: standings.poolPlayId,
            stageId: standings.stageId,
            stageLabel: standings.stageLabel,
            groupName: standings.groupName,
            groupKey: standings.groupKey,
            poolLabel: standings.play?.FullName || standings.play?.CompleteShortName || standings.poolGroupKey,
            play: standings.play,
            poolSheet: standings.poolSheet,
            matches,
            teams: new Map(),
            standings: [],
            h2h: new Map(),
            firstTime: times.length ? Math.min(...times) : 0,
            lastTime: times.length ? Math.max(...times) : 0,
            hasAnyResult: false,
            complete: false,
            hasOfficialFinish: false
        };
        for (const sourceTeam of pool.poolSheet?.Pool?.Teams || []) ensurePerformanceTeam(pool, null, sourceTeam);
        for (const node of matches) {
            const match = node.match;
            const first = ensurePerformanceTeam(pool, matchParticipant(match, 'first'), match?.FirstTeam);
            const second = ensurePerformanceTeam(pool, matchParticipant(match, 'second'), match?.SecondTeam);
            if (!first || !second) continue;
            if (!matchHasResult(match)) {
                first.remaining += 1;
                second.remaining += 1;
                continue;
            }
            pool.hasAnyResult = true;
            const winner = matchWinnerSide(match);
            if (winner) {
                const [won, lost] = winner === 'first' ? [first, second] : [second, first];
                won.matchWins += 1;
                lost.matchLosses += 1;
                pool.h2h.set(`${first.key}|${second.key}`, won.key);
                pool.h2h.set(`${second.key}|${first.key}`, won.key);
            }
            const scores = extractSetScores(match);
            if (scores.length) {
                for (const score of scores) {
                    first.pointsFor += score.first;
                    first.pointsAgainst += score.second;
                    second.pointsFor += score.second;
                    second.pointsAgainst += score.first;
                    if (score.first > score.second) {
                        first.setWins += 1;
                        second.setLosses += 1;
                    } else if (score.second > score.first) {
                        second.setWins += 1;
                        first.setLosses += 1;
                    }
                }
            } else {
                const totals = aggregateSetWinTotals(match);
                if (totals) {
                    first.setWins += totals.first;
                    first.setLosses += totals.second;
                    second.setWins += totals.second;
                    second.setLosses += totals.first;
                }
            }
        }
        pool.complete = matches.length > 0 && matches.every(node => matchHasResult(node.match));
        for (const row of pool.teams.values()) applySourceMetrics(row);
        rankPoolRows(pool);
        pools.set(pool.key, pool);
    }
    state.performancePools = pools;
}

function poolTeamRow(pool, team) {
    if (!pool || !team) return null;
    return pool.teams.get(performanceTeamKey(team.id, team.name))
        || [...pool.teams.values()].find(row => isSameTeam({ id: row.id, label: row.name }, team))
        || null;
}

function resolvePoolRow(pool, participant) {
    if (!pool || !participant || participant.placeholder) return null;
    const directoryTeam = directoryTeamForParticipant(participant);
    return pool.teams.get(performanceTeamKey(participant.id ?? directoryTeam?.id, directoryTeam?.name || participant.label))
        || [...pool.teams.values()].find(row => normName(row.name) === normName(participant.label))
        || null;
}

function teamPoolHistory(team) {
    if (!team) return [];
    return [...state.performancePools.values()]
        .filter(pool => poolTeamRow(pool, team))
        .sort((a, b) => (a.firstTime || Number.MAX_SAFE_INTEGER) - (b.firstTime || Number.MAX_SAFE_INTEGER)
            || String(a.stageLabel).localeCompare(String(b.stageLabel))
            || String(a.poolLabel).localeCompare(String(b.poolLabel), undefined, { numeric: true }));
}

function performanceGroupLabel(pool) {
    return `${pool.stageLabel} / ${pool.groupName}`;
}

function performanceGroupsForTeam(team) {
    const groups = new Map();
    for (const pool of teamPoolHistory(team)) {
        if (!groups.has(pool.groupKey)) groups.set(pool.groupKey, { key: pool.groupKey, label: performanceGroupLabel(pool), pools: [] });
        groups.get(pool.groupKey).pools.push(pool);
    }
    return [...groups.values()];
}

function defaultPerformancePool(team) {
    const history = teamPoolHistory(team);
    if (!history.length) return null;
    const now = Date.now();
    const active = history.find(pool => pool.matches.some(node => {
        const time = parseEventTime(node.match?.ScheduledStartDateTime);
        return Number.isFinite(time) && time <= now && !matchHasResult(node.match);
    }));
    if (active) return active;
    const upcoming = history.find(pool => pool.firstTime >= now);
    if (upcoming) return upcoming;
    return history.filter(pool => pool.hasAnyResult).at(-1) || history.at(-1);
}

function resolvePerformancePool(team) {
    const history = teamPoolHistory(team);
    const pinned = history.find(pool => pool.key === state.performancePoolKey);
    if (pinned) return pinned;
    const groupPools = state.performanceGroupKey ? history.filter(pool => pool.groupKey === state.performanceGroupKey) : [];
    return groupPools[0] || defaultPerformancePool(team);
}

function selectPerformancePool(pool) {
    if (!pool) return;
    state.performanceGroupKey = pool.groupKey;
    state.performancePoolKey = pool.key;
    renderGraph();
}

function placementConditionOrder(condition) {
    const match = String(condition || '').match(/^(\d+)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function progressionDestinationLabel(node) {
    if (!node) return 'Unknown destination';
    if (node.kind === 'entry') {
        const pool = state.nodes.get(node.poolGroupKey);
        return `${pool?.play?.FullName || node.play?.FullName || node.poolGroupKey} (${node.groupName || node.stageLabel || 'next round'})`;
    }
    const court = courtName(node);
    return [node.play?.FullName || node.play?.CompleteShortName || node.key, node.stageLabel, node.groupName, court].filter(Boolean).join(' / ');
}

function crossoverRouteDetailsForPool(pool) {
    if (!pool) return [];
    return (state.outgoing.get(pool.key) || [])
        .map(edge => ({ edge, node: state.nodes.get(edge.to) }))
        .filter(item => item.edge.kind === 'advancement' && isCrossoverMatchNode(item.node))
        .sort((a, b) => placementConditionOrder(a.edge.condition) - placementConditionOrder(b.edge.condition)
            || compareNodeSchedule(a.node, b.node));
}

function crossoverMatchesForPool(pool, team) {
    const routeNodes = crossoverRouteDetailsForPool(pool).map(route => route.node);
    const teamXo = selectedTeamMatches(team).filter(isCrossoverMatchNode);
    const assigned = teamXo.filter(node => routeNodes.some(route => route.key === node.key));
    if (assigned.length) return assigned;
    const afterPool = teamXo.filter(node => eventTime(node.match?.ScheduledStartDateTime) >= (pool?.lastTime || 0));
    return afterPool.length ? afterPool : teamXo;
}

// Finish place -> destination labels for every published route out of the pool.
function placementRoutesForPool(pool) {
    const byPlace = new Map();
    for (const edge of state.outgoing.get(pool?.key) || []) {
        if (edge.kind !== 'advancement') continue;
        const place = placementConditionOrder(edge.condition);
        if (place === Number.MAX_SAFE_INTEGER) continue;
        if (!byPlace.has(place)) byPlace.set(place, []);
        byPlace.get(place).push(progressionDestinationLabel(state.nodes.get(edge.to)));
    }
    return byPlace;
}

// Enumerates every win/loss combination of the pool's remaining matches (up to
// 2^scenarioMaxRemaining) and reports the selected team's finish range for each of its own
// result combinations. Teams level on match record are shown as a range, because set
// percentage and later tiebreaks depend on set scores that have not been played.
function computePoolScenarios(pool, team) {
    const selected = poolTeamRow(pool, team);
    if (!selected) return { status: 'no-team' };
    const remaining = [];
    for (const node of pool.matches) {
        if (matchHasResult(node.match)) continue;
        const a = resolvePoolRow(pool, matchParticipant(node.match, 'first'));
        const b = resolvePoolRow(pool, matchParticipant(node.match, 'second'));
        if (!a || !b) return { status: 'unresolved' };
        const own = a.key === selected.key || b.key === selected.key;
        remaining.push({ node, a: a.key, b: b.key, own, opponent: own ? (a.key === selected.key ? b : a) : null });
    }
    if (!remaining.length) return { status: 'complete' };
    if (remaining.length > DEFAULTS.scenarioMaxRemaining) return { status: 'too-many', count: remaining.length };

    const rows = [...pool.teams.values()];
    const own = remaining.filter(item => item.own);
    const outcomes = new Map();
    let bestOverall = Infinity;
    let worstOverall = 0;
    for (let mask = 0; mask < (1 << remaining.length); mask += 1) {
        const wins = new Map(rows.map(row => [row.key, row.matchWins]));
        let signature = '';
        remaining.forEach((item, index) => {
            const winner = (mask >> index) & 1 ? item.a : item.b;
            wins.set(winner, wins.get(winner) + 1);
            if (item.own) signature += winner === selected.key ? 'W' : 'L';
        });
        const mine = wins.get(selected.key);
        let better = 0;
        let tied = 0;
        for (const [key, value] of wins) {
            if (key === selected.key) continue;
            if (value > mine) better += 1;
            else if (value === mine) tied += 1;
        }
        const best = better + 1;
        const worst = better + tied + 1;
        bestOverall = Math.min(bestOverall, best);
        worstOverall = Math.max(worstOverall, worst);
        const entry = outcomes.get(signature) || { signature, best: Infinity, worst: 0, finishes: new Set(), ranges: new Set(), tieScenarios: 0 };
        entry.best = Math.min(entry.best, best);
        entry.worst = Math.max(entry.worst, worst);
        entry.ranges.add(`${best}-${worst}`);
        if (tied) entry.tieScenarios += 1;
        for (let place = best; place <= worst; place += 1) entry.finishes.add(place);
        outcomes.set(signature, entry);
    }
    const possible = new Set();
    for (const entry of outcomes.values()) entry.finishes.forEach(place => possible.add(place));
    return {
        status: 'ok',
        selected,
        own,
        otherCount: remaining.length - own.length,
        outcomes: [...outcomes.values()].sort((a, b) => (a.signature < b.signature ? 1 : -1)),
        possible: [...possible].sort((a, b) => a - b),
        bestOverall,
        worstOverall,
        teamCount: rows.length
    };
}

