/* =========================================================================
 * 8d. Scouting: who the team faces next, live status, comparisons
 * ======================================================================= */

const otherSlot = slot => (slot === 'first' ? 'second' : slot === 'second' ? 'first' : null);

// Teams that could fill one slot of a match. A named team is returned as is; a placeholder
// is followed one step back: "1st in Pool 2" lists that pool's teams (just the finisher once
// the pool is complete), and "Winner of M1" lists that match's teams (or its winner).
function slotCandidates(matchNode, slot, depth = 0) {
    const participant = matchParticipant(matchNode.match, slot);
    if (!participant.placeholder) {
        const team = directoryTeamForParticipant(participant);
        return team ? [{ team, how: 'assigned' }] : [];
    }
    const out = [];
    for (const edge of state.incoming.get(matchNode.key) || []) {
        if (edge.kind !== 'advancement' || edge.slot !== slot) continue;
        const source = state.nodes.get(edge.from);
        if (source?.kind === 'standings') {
            const pool = state.performancePools.get(source.poolGroupKey);
            if (!pool) continue;
            const place = placementConditionOrder(edge.condition);
            const how = `${ordinal(place)} in ${pool.groupName} ${pool.poolLabel}`;
            const rows = pool.complete ? pool.standings.filter(row => row.rank === place) : pool.standings;
            for (const row of rows) {
                const team = row.id != null ? state.teamById.get(Number(row.id)) : null;
                if (team) out.push({ team, how });
            }
        } else if (source?.kind === 'match' && depth < 1) {
            const how = `${edge.condition === 'LOSS' ? 'loser' : 'winner'} of ${source.key}`;
            let sides = ['first', 'second'];
            if (matchHasResult(source.match)) {
                const winner = matchWinnerSide(source.match);
                sides = winner ? [edge.condition === 'LOSS' ? otherSlot(winner) : winner] : [];
            }
            for (const side of sides) out.push(...slotCandidates(source, side, depth + 1).map(candidate => ({ ...candidate, how })));
        }
    }
    return out;
}

// Opponents for the picker: the next scheduled opponent, the rest of the team's scheduled
// opponents, and teams it could meet next depending on its pool finish or bracket result.
function upcomingOpponents(team, now = Date.now()) {
    const exclude = new Set([team.id, ...state.myTeams.map(member => member.id)]);
    const entries = new Map();
    const add = (candidate, group, reason, when) => {
        if (!candidate || exclude.has(candidate.id)) return;
        const existing = entries.get(candidate.id);
        if (existing) {
            if (reason && !existing.reasons.includes(reason)) existing.reasons.push(reason);
            return;
        }
        entries.set(candidate.id, { team: candidate, group, reasons: reason ? [reason] : [], when });
    };
    const pendingMatches = pendingItems(teamDayItems(team), now).filter(item => item.kind === 'match');
    pendingMatches.forEach((item, index) => {
        const side = teamSideInMatch(item.node.match, team);
        const opponent = directoryTeamForParticipant(matchParticipant(item.node.match, otherSlot(side) || 'second'));
        add(opponent, index === 0 ? 'next' : 'scheduled', `${formatDay(item.date)} ${formatTime(item.start)}, ${item.court || 'court TBD'}`, item.start);
    });

    const nextPoolMatch = pendingMatches.find(item => item.node.poolGroupKey);
    const pool = nextPoolMatch ? state.performancePools.get(nextPoolMatch.node.poolGroupKey) : null;
    if (pool && !pool.complete) {
        for (const edge of state.outgoing.get(pool.key) || []) {
            const target = state.nodes.get(edge.to);
            if (edge.kind !== 'advancement' || target?.kind !== 'match' || !edge.slot) continue;
            const place = placementConditionOrder(edge.condition);
            for (const candidate of slotCandidates(target, otherSlot(edge.slot))) {
                add(candidate.team, 'possible', `if you finish ${ordinal(place)}: ${candidate.how}`, nodeStart(target));
            }
        }
    }
    const nextBracketMatch = pendingMatches.find(item => !item.node.poolGroupKey);
    if (nextBracketMatch) {
        for (const edge of state.outgoing.get(nextBracketMatch.node.key) || []) {
            const target = state.nodes.get(edge.to);
            if (edge.kind !== 'advancement' || target?.kind !== 'match' || !edge.slot || (edge.condition !== 'WIN' && edge.condition !== 'LOSS')) continue;
            for (const candidate of slotCandidates(target, otherSlot(edge.slot))) {
                add(candidate.team, 'possible', `if you ${edge.condition === 'WIN' ? 'win' : 'lose'} at ${formatTime(nextBracketMatch.start)}: ${candidate.how}`, nodeStart(target));
            }
        }
    }
    return [...entries.values()];
}

// Schedule-based: AES publishes no live "in progress" flag, so "on court now" means the
// team has a scheduled item under way that has not posted a result.
function teamLiveStatus(team, now = Date.now()) {
    const pending = pendingItems(teamDayItems(team), now);
    const played = selectedTeamMatches(team).filter(node => matchHasResult(node.match)).sort(compareNodeSchedule);
    return {
        current: pending.find(item => item.start <= now) || null,
        next: pending.find(item => item.start > now && item.kind === 'match') || null,
        last: played.at(-1) || null
    };
}

function playedRows(profile) {
    return profile.rows.filter(row => row.info.status === 'win' || row.info.status === 'loss');
}

function commonOpponents(usProfile, themProfile) {
    const byOpponent = profile => {
        const map = new Map();
        for (const row of playedRows(profile)) {
            if (!row.opponentTeam) continue;
            if (!map.has(row.opponentTeam.id)) map.set(row.opponentTeam.id, []);
            map.get(row.opponentTeam.id).push(row);
        }
        return map;
    };
    const ours = byOpponent(usProfile);
    const theirs = byOpponent(themProfile);
    const list = [...ours.keys()]
        .filter(id => theirs.has(id) && id !== usProfile.team.id && id !== themProfile.team.id)
        .map(id => ({ opponent: ours.get(id)[0].opponentTeam, ours: ours.get(id), theirs: theirs.get(id) }))
        .sort((a, b) => a.opponent.name.localeCompare(b.opponent.name));
    const tally = rows => rows.reduce((total, row) => {
        total[row.info.status === 'win' ? 'wins' : 'losses'] += 1;
        total.pointsFor += row.pointsFor;
        total.pointsAgainst += row.pointsAgainst;
        return total;
    }, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
    return { list, ours: tally(list.flatMap(entry => entry.ours)), theirs: tally(list.flatMap(entry => entry.theirs)) };
}

// Best win (against the strongest opponent) and worst loss (against the weakest), judged by
// each opponent's record excluding its games against this team.
function notableResults(profile) {
    const rated = playedRows(profile)
        .filter(row => row.opponentTeam)
        .map(row => {
            const record = recordExcluding(row.opponentTeam.id, profile.team.id);
            const games = record.wins + record.losses;
            return games ? { row, record, pct: record.wins / games } : null;
        })
        .filter(Boolean);
    const wins = rated.filter(item => item.row.info.status === 'win').sort((a, b) => b.pct - a.pct);
    const losses = rated.filter(item => item.row.info.status === 'loss').sort((a, b) => a.pct - b.pct);
    return { best: wins[0] || null, worst: losses[0] || null };
}

