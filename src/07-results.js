/* =========================================================================
 * 7. Scores and results
 * ======================================================================= */

// Side-specific numeric fields only. AES's ScoreText (and similar display strings) lists the
// MATCH winner's score first on every set, so parsing it as first-second flips sides.
function parseSetScore(value) {
    if (value == null || typeof value !== 'object') return null;
    const pairs = [
        ['FirstTeamScore', 'SecondTeamScore'],
        ['FirstTeamPoints', 'SecondTeamPoints'],
        ['FirstScore', 'SecondScore'],
        ['TopScore', 'BottomScore'],
        ['HomeScore', 'AwayScore'],
        ['Team1Score', 'Team2Score'],
        ['Score1', 'Score2']
    ];
    for (const [firstName, secondName] of pairs) {
        const first = firstNumericField(value, [firstName]);
        const second = firstNumericField(value, [secondName]);
        if (first != null && second != null) return { first, second };
    }
    const nested = [value.FirstTeam, value.SecondTeam];
    if (nested[0] && nested[1]) {
        const first = firstNumericField(nested[0], ['Score', 'Points', 'SetScore']);
        const second = firstNumericField(nested[1], ['Score', 'Points', 'SetScore']);
        if (first != null && second != null) return { first, second };
    }
    return null;
}

function matchSetEntries(match) {
    const entries = [];
    for (const key of ['Sets', 'SetScores', 'Scores', 'Games', 'Results']) {
        if (Array.isArray(match?.[key])) entries.push(...match[key]);
    }
    for (let i = 1; i <= 5; i += 1) {
        const first = firstNumericField(match, [`FirstTeamSet${i}Score`, `Set${i}FirstTeamScore`, `Team1Set${i}`, `Set${i}Team1`]);
        const second = firstNumericField(match, [`SecondTeamSet${i}Score`, `Set${i}SecondTeamScore`, `Team2Set${i}`, `Set${i}Team2`]);
        if (first != null && second != null) entries.push({ FirstTeamScore: first, SecondTeamScore: second });
    }
    return entries;
}

// AES publishes unplayed sets as 0-0 placeholders; those are not results.
function extractSetScores(match) {
    return matchSetEntries(match)
        .map(parseSetScore)
        .filter(score => score && score.first >= 0 && score.second >= 0 && (score.first > 0 || score.second > 0));
}

function formatMatchSetScores(match) {
    const scores = extractSetScores(match);
    return scores.map(score => `${score.first}-${score.second}`).join(', ');
}

// Set scores from one team's side, with AES's deciding-set flag. Unplayed 0-0 slots are skipped.
function teamSetScores(match, side) {
    const entries = matchSetEntries(match);
    const scores = [];
    entries.forEach((entry, index) => {
        const score = parseSetScore(entry);
        if (!score || score.first < 0 || score.second < 0 || (score.first === 0 && score.second === 0)) return;
        const flag = entry && typeof entry === 'object' && 'IsDecidingSet' in entry ? normalizeBoolean(entry.IsDecidingSet) : null;
        scores.push({
            index,
            mine: side === 'second' ? score.second : score.first,
            theirs: side === 'second' ? score.first : score.second,
            deciding: flag ?? (entries.length >= 3 && index === entries.length - 1)
        });
    });
    return scores;
}

function formatTeamSetScores(sets) {
    return sets.map(set => `${set.mine}-${set.theirs}`).join(', ');
}

// Close / competitive / decisive, scaled for 25-point and 15-point sets.
function setMarginClass(mine, theirs) {
    const short = Math.max(mine, theirs) < 25;
    const margin = Math.abs(mine - theirs);
    if (margin <= (short ? 2 : 3)) return 'close';
    if (margin <= (short ? 4 : 6)) return 'competitive';
    return 'decisive';
}

function aggregateSetWinTotals(match) {
    const first = firstNumericField(match, ['FirstTeamSetsWon', 'FirstTeamWins', 'FirstTeamSetWins', 'TopTeamSetsWon', 'HomeSetsWon']);
    const second = firstNumericField(match, ['SecondTeamSetsWon', 'SecondTeamWins', 'SecondTeamSetWins', 'BottomTeamSetsWon', 'AwaySetsWon']);
    return first == null || second == null ? null : { first, second };
}

function explicitWinnerSide(match) {
    if (!match) return null;
    if (normalizeBoolean(match.FirstTeamWon) || normalizeBoolean(match.FirstTeam?.IsWinner) || normalizeBoolean(match.FirstTeam?.Won)) return 'first';
    if (normalizeBoolean(match.SecondTeamWon) || normalizeBoolean(match.SecondTeam?.IsWinner) || normalizeBoolean(match.SecondTeam?.Won)) return 'second';
    // AES TypeOfOutcome: 0 unplayed, 1 first team won, 2 second team won.
    if (match.HasScores !== false && Number(match.TypeOfOutcome) === 1) return 'first';
    if (match.HasScores !== false && Number(match.TypeOfOutcome) === 2) return 'second';
    const first = matchParticipant(match, 'first');
    const second = matchParticipant(match, 'second');
    const winnerIds = [
        firstNumericField(match, ['WinnerTeamId', 'WinningTeamId', 'WinnerId', 'TeamWonId']),
        firstNumericField(match.Winner || match.WinningTeam || match.WinnerTeam, ['TeamId', 'Id'])
    ];
    for (const winnerId of winnerIds) {
        if (winnerId == null) continue;
        if (first.id != null && first.id === winnerId) return 'first';
        if (second.id != null && second.id === winnerId) return 'second';
    }
    return null;
}

function matchWinnerSide(match) {
    const explicit = explicitWinnerSide(match);
    if (explicit) return explicit;
    let firstSets = 0;
    let secondSets = 0;
    for (const score of extractSetScores(match)) {
        if (score.first > score.second) firstSets += 1;
        else if (score.second > score.first) secondSets += 1;
    }
    if (firstSets !== secondSets) return firstSets > secondSets ? 'first' : 'second';
    const totals = aggregateSetWinTotals(match);
    if (totals && totals.first !== totals.second) return totals.first > totals.second ? 'first' : 'second';
    return null;
}

// AES's own HasScores flag is authoritative when present; heuristics apply only without it.
function matchHasResult(match) {
    if (!match) return false;
    if (typeof match.HasScores === 'boolean') return match.HasScores;
    if ([match.IsComplete, match.Complete, match.Completed].some(normalizeBoolean)) return true;
    if (explicitWinnerSide(match)) return true;
    if (extractSetScores(match).length) return true;
    const totals = aggregateSetWinTotals(match);
    if (totals && (totals.first > 0 || totals.second > 0)) return true;
    return /final|complete|completed|forfeit/i.test(String(match.Status || match.MatchStatus || match.Result || ''));
}

function matchResultSummary(match) {
    if (!match) return 'No match data';
    const winner = matchWinnerSide(match);
    const scores = formatMatchSetScores(match);
    if (!winner) return scores ? `Result posted: ${scores}` : 'Result posted';
    const team = matchParticipant(match, winner);
    return scores ? `${team.label} won (${scores})` : `${team.label} won`;
}

function teamResultForMatch(node, team) {
    const match = node?.match;
    if (!match || !team) return { status: 'unknown', label: 'TBD', opponent: 'TBD', result: '' };
    const side = teamSideInMatch(match, team);
    const opponent = matchParticipant(match, side === 'second' ? 'first' : 'second');
    if (matchHasResult(match)) {
        const winner = matchWinnerSide(match);
        if (winner && side) {
            const won = winner === side;
            return { status: won ? 'win' : 'loss', label: won ? 'WIN' : 'LOSS', opponent: opponent.label, result: matchResultSummary(match) };
        }
        return { status: 'unknown', label: 'RESULT', opponent: opponent.label, result: matchResultSummary(match) };
    }
    const when = parseEventTime(match.ScheduledStartDateTime);
    if (Number.isFinite(when) && when >= Date.now()) return { status: 'upcoming', label: 'UPCOMING', opponent: opponent.label, result: '' };
    return { status: 'current', label: 'PENDING', opponent: opponent.label, result: '' };
}

function computeTeamSetRecord(matchNodes, team) {
    let wins = 0;
    let losses = 0;
    for (const node of matchNodes || []) {
        const match = node?.match;
        if (!match || !matchHasResult(match)) continue;
        const side = teamSideInMatch(match, team);
        if (!side) continue;
        const scores = extractSetScores(match);
        if (scores.length) {
            for (const score of scores) {
                if (score.first === score.second) continue;
                const mine = side === 'first' ? score.first : score.second;
                const theirs = side === 'first' ? score.second : score.first;
                if (mine > theirs) wins += 1;
                else losses += 1;
            }
            continue;
        }
        const totals = aggregateSetWinTotals(match);
        if (totals) {
            wins += side === 'first' ? totals.first : totals.second;
            losses += side === 'first' ? totals.second : totals.first;
        }
    }
    return { wins, losses };
}

function computeTeamMatchMetrics(matchNodes, team) {
    const metrics = { matchWins: 0, matchLosses: 0, setWins: 0, setLosses: 0, pointsFor: 0, pointsAgainst: 0 };
    for (const node of matchNodes || []) {
        const match = node?.match;
        const side = match ? teamSideInMatch(match, team) : null;
        if (!side) continue;
        const result = teamResultForMatch(node, team);
        if (result.status === 'win') metrics.matchWins += 1;
        if (result.status === 'loss') metrics.matchLosses += 1;
        for (const score of extractSetScores(match)) {
            metrics.pointsFor += side === 'first' ? score.first : score.second;
            metrics.pointsAgainst += side === 'first' ? score.second : score.first;
        }
    }
    const sets = computeTeamSetRecord(matchNodes, team);
    metrics.setWins = sets.wins;
    metrics.setLosses = sets.losses;
    return metrics;
}

function isCrossoverMatchNode(node) {
    if (node?.kind !== 'match') return false;
    const text = `${node.stageLabel || ''} ${node.groupName || ''} ${node.play?.FullName || ''} ${node.play?.CompleteShortName || ''}`;
    return /\b(?:xo|crossover|cross[-\s]?over)\b/i.test(text) || /XO/i.test(String(node.play?.CompleteShortName || ''));
}

function matchCategoryLabel(node) {
    if (isCrossoverMatchNode(node)) return 'Crossover';
    return node?.matchType === 'pool' ? 'Pool match' : 'Bracket match';
}

function courtName(node) {
    return node?.match?.Court?.Name || node?.court || node?.play?.Courts?.[0]?.Name || '';
}

function stageText(node) {
    return [node?.stageLabel, node?.groupName, node?.play?.FullName].filter(Boolean).join(' / ');
}

