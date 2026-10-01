/* =========================================================================
 * 8e. Outlook: where the team's current stage leads, and what it needs
 * ======================================================================= */

const playLookupCache = { nodes: null, daily: null, meta: null };
function playLookups() {
    if (playLookupCache.nodes !== state.nodes) {
        const daily = new Map();
        for (const day of state.dailyPlays) {
            for (const play of day.plays || []) if (play.PlayId != null) daily.set(Number(play.PlayId), { ...play, __date: day.date });
        }
        const meta = new Map(state.masterPlays.map(play => [Number(play.PlayId), play]));
        Object.assign(playLookupCache, { nodes: state.nodes, daily, meta });
    }
    return playLookupCache;
}

// AES's FutureRoundMatches for a play: pools publish them on the pool sheet, brackets on
// the play itself. Rank 1..n is the finish place (for a one-match bracket: 1 won, 2 lost).
function playFutureRoutes(playId) {
    const play = playLookups().daily.get(Number(playId));
    if (!play) return [];
    const list = play.Type === 0 ? state.poolSheets.get(play.PlayId)?.FutureRoundMatches : play.FutureRoundMatches;
    return (Array.isArray(list) ? list : [])
        .map(entry => ({
            rank: Number(String(entry?.RankText || '').match(/^\s*(\d+)/)?.[1]) || 0,
            playId: entry?.Play?.PlayId ?? null,
            playName: entry?.Play?.CompleteFullName || entry?.Play?.FullName || '',
            match: entry?.Match ? { start: parseEventTime(entry.Match.ScheduledStartDateTime), court: entry.Match.Court?.Name || '' } : null,
            reseed: Boolean(entry?.NextPendingReseed)
        }))
        .filter(route => route.rank > 0 && route.playId != null)
        .sort((a, b) => a.rank - b.rank);
}

function destinationInfo(playId, fallbackName = '') {
    const { daily, meta } = playLookups();
    const play = daily.get(Number(playId));
    const info = meta.get(Number(playId));
    const round = info?.RoundName || '';
    const group = info?.GroupName || '';
    return {
        playId,
        playName: play?.CompleteFullName || fallbackName,
        poolName: play?.FullName || '',
        round,
        group,
        date: play?.__date || '',
        key: round || group ? `${round}|${group}` : `play:${playId}`
    };
}

function destinationLabel(dest, { withRound = true } = {}) {
    const name = dest.group || dest.playName || 'next play';
    return withRound && dest.round ? `${name} (${dest.round})` : name;
}

// Where the team is now: its next pool, else its next bracket match, else its latest pool
// that still routes somewhere.
function currentStage(team, now = Date.now()) {
    const pending = pendingItems(teamDayItems(team), now).filter(item => item.kind === 'match');
    const nextPool = pending.find(item => item.node.poolGroupKey);
    const nextBracket = pending.find(item => !item.node.poolGroupKey);
    if (nextPool && (!nextBracket || nextPool.start <= nextBracket.start)) {
        const pool = state.performancePools.get(nextPool.node.poolGroupKey);
        if (pool) return { kind: 'pool', pool };
    }
    if (nextBracket) return { kind: 'bracket', node: nextBracket.node, start: nextBracket.start };
    const pool = teamPoolHistory(team).filter(item => playFutureRoutes(item.playId).length).at(-1);
    return pool ? { kind: 'pool', pool } : null;
}

function branchLabel(rank, count, dest) {
    if (count === 2) return rank === 1 ? 'win' : 'lose';
    return `finish ${ordinal(rank)}${dest?.poolName ? ` in ${dest.poolName}` : ''}`;
}

// Follows AES's routes from the current stage until they reach a later weekend (or the end
// of published play): pool finish -> crossover -> next weekend's group, for example.
function stagePaths(stage) {
    const weekends = weekendByDate();
    const startDate = stage.kind === 'pool' ? stage.pool.play?.__date : matchDate(stage.node);
    const startWeekend = weekends.get(startDate)?.key;
    const follow = route => {
        const dest = destinationInfo(route.playId, route.playName);
        const next = playFutureRoutes(route.playId);
        if (!next.length || (dest.date && weekends.get(dest.date)?.key !== startWeekend)) return [{ branch: null, rank: 0, dest, reseed: route.reseed }];
        return next.map(entry => ({
            branch: branchLabel(entry.rank, next.length, dest),
            rank: entry.rank,
            dest: destinationInfo(entry.playId, entry.playName),
            reseed: entry.reseed
        }));
    };
    if (stage.kind === 'pool') {
        return playFutureRoutes(stage.pool.playId).map(route => ({ place: route.rank, via: route, outcomes: follow(route) }));
    }
    const play = stage.node.play;
    const routes = playFutureRoutes(play?.PlayId);
    return [{
        place: null,
        via: { playId: play?.PlayId, playName: play?.CompleteFullName || '', match: { start: nodeStart(stage.node), court: courtName(stage.node) } },
        outcomes: routes.map(entry => ({ branch: branchLabel(entry.rank, routes.length), rank: entry.rank, dest: destinationInfo(entry.playId, entry.playName), reseed: entry.reseed }))
    }];
}

function teamOutlook(team, now = Date.now()) {
    const stage = currentStage(team, now);
    if (!stage) return null;
    const paths = stagePaths(stage).filter(path => path.outcomes.length);
    if (!paths.length) return { stage, paths: [], groups: [], possiblePlaces: [] };
    let finish = null;
    let scenarios = null;
    if (stage.kind === 'pool') {
        const row = poolTeamRow(stage.pool, team);
        if (stage.pool.complete && row) finish = row.rank;
        else {
            const result = computePoolScenarios(stage.pool, team);
            if (result.status === 'ok') scenarios = result;
        }
    }
    const possiblePlaces = stage.kind !== 'pool' ? [null] : finish ? [finish] : scenarios ? scenarios.possible : paths.map(path => path.place);
    const groups = new Map();
    for (const path of paths) {
        if (!possiblePlaces.includes(path.place)) continue;
        for (const outcome of path.outcomes) {
            const entry = groups.get(outcome.dest.key) || { key: outcome.dest.key, dest: outcome.dest, score: Infinity };
            // Lower is better: a higher pool finish, then winning the next match.
            entry.score = Math.min(entry.score, (path.place || 0) * 10 + Math.max(0, outcome.rank - 1));
            groups.set(outcome.dest.key, entry);
        }
    }
    return {
        stage,
        paths,
        finish,
        scenarios,
        possiblePlaces,
        groups: [...groups.values()].sort((a, b) => a.score - b.score),
        reseed: paths.some(path => path.outcomes.some(outcome => outcome.reseed))
    };
}

const placeLocks = (outlook, place, key) => {
    const path = outlook.paths.find(item => item.place === place);
    return Boolean(path) && path.outcomes.every(outcome => outcome.dest.key === key);
};

const placeReachesOnWin = (outlook, place, key) => {
    const path = outlook.paths.find(item => item.place === place);
    return Boolean(path) && path.outcomes.some(outcome => outcome.branch === 'win' && outcome.dest.key === key);
};

function ordinalList(places) {
    const words = places.map(ordinal);
    return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`;
}

// Plain-language lines: what locks in the best reachable destination, how else it can be
// reached, and the worst case.
function outlookLines(outlook) {
    if (!outlook?.groups.length) return [];
    const best = outlook.groups[0];
    const worst = outlook.groups.at(-1);
    const lines = [];
    if (outlook.stage.kind === 'bracket') {
        const path = outlook.paths[0];
        const win = path.outcomes.find(outcome => outcome.branch === 'win');
        const lose = path.outcomes.find(outcome => outcome.branch === 'lose');
        const when = formatTime(path.via.match.start);
        if (win && lose) {
            lines.push(win.dest.key === lose.dest.key
                ? `${destinationLabel(win.dest)} is locked in, whatever happens at ${when}.`
                : `Win at ${when} for ${destinationLabel(win.dest)}; a loss means ${destinationLabel(lose.dest)}.`);
        } else {
            lines.push(`Next: ${path.outcomes.map(outcome => `${outcome.branch}: ${destinationLabel(outcome.dest)}`).join('; ')}.`);
        }
        return lines;
    }
    if (outlook.finish) {
        const path = outlook.paths.find(item => item.place === outlook.finish);
        const win = path?.outcomes.find(outcome => outcome.branch === 'win');
        const lose = path?.outcomes.find(outcome => outcome.branch === 'lose');
        if (path && path.outcomes.every(outcome => outcome.dest.key === path.outcomes[0].dest.key)) {
            lines.push(`Finished ${ordinal(outlook.finish)}: ${destinationLabel(path.outcomes[0].dest)} is locked in${path.outcomes.length > 1 ? ', whatever happens in the crossover' : ''}.`);
        } else if (win && lose) {
            lines.push(`Finished ${ordinal(outlook.finish)}: win the crossover for ${destinationLabel(win.dest)}; a loss means ${destinationLabel(lose.dest)}.`);
        }
        return lines;
    }
    if (outlook.scenarios) {
        const own = outlook.scenarios.own.length;
        const winsIn = signature => [...signature].filter(code => code === 'W').length;
        for (let needed = 0; needed <= own; needed += 1) {
            const covered = outlook.scenarios.outcomes.filter(entry => winsIn(entry.signature) >= needed);
            if (covered.length && covered.every(entry => [...entry.finishes].every(place => placeLocks(outlook, place, best.key)))) {
                const noun = own === 1 ? 'remaining pool match' : 'remaining pool matches';
                const target = destinationLabel(best.dest);
                if (needed === 0) lines.push(`${target} is locked in.`);
                else if (needed === own) lines.push(`Win ${own === 1 ? 'your' : `all ${own}`} ${noun} to clinch ${target}.`);
                else lines.push(`Win at least ${needed} of your ${own} ${noun} to clinch ${target}.`);
                break;
            }
        }
    }
    const locks = outlook.possiblePlaces.filter(place => placeLocks(outlook, place, best.key));
    const onWin = outlook.possiblePlaces.filter(place => !locks.includes(place) && placeReachesOnWin(outlook, place, best.key));
    const ways = [];
    if (locks.length) ways.push(`a ${ordinalList(locks)}-place finish`);
    if (onWin.length) ways.push(`a ${ordinalList(onWin)}-place finish and a crossover win`);
    if (ways.length) lines.push(`${destinationLabel(best.dest, { withRound: false })} comes from ${ways.join(', or ')}.`);
    if (worst.key !== best.key) lines.push(`Worst case: ${destinationLabel(worst.dest, { withRound: false })}.`);
    return lines;
}

