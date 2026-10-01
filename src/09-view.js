/* =========================================================================
 * 9. List views: Match Day, Standings & Outlook, Stats
 * ======================================================================= */

// Headers are strings, or { label, num: true } for right-aligned numeric columns, so a
// header always lines up with its cells.
function tableHtml(headers, body) {
    const th = header => (typeof header === 'object'
        ? `<th${header.num ? ' class="num"' : ''}>${escapeHtml(header.label)}</th>`
        : `<th>${escapeHtml(header)}</th>`);
    return `<div class="abv-table-wrap"><table class="abv-table"><thead><tr>${headers.map(th).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const numCol = label => ({ label, num: true });

function statHtml(value, label, sub = '') {
    return `<div class="abv-stat"><b>${value}</b><span>${escapeHtml(label)}</span>${sub ? `<small class="abv-stat-sub">${escapeHtml(sub)}</small>` : ''}</div>`;
}

function resetListCanvas(canvas) {
    canvas.classList.remove('compact');
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.innerHTML = '';
}

function participantPerformanceHtml(participant, team) {
    const text = escapeHtml(participant.label);
    return isSameTeam(participant, team) ? `<strong>${text}</strong>` : text;
}

function matchStatusText(match) {
    if (matchHasResult(match)) return matchResultSummary(match);
    return eventTime(match?.ScheduledStartDateTime) >= Date.now() ? 'Upcoming' : 'Pending';
}

function matchRowsHtml(nodes, team, rowClass = () => '') {
    return nodes.map(node => {
        const match = node.match;
        const first = matchParticipant(match, 'first');
        const second = matchParticipant(match, 'second');
        return `<tr class="${rowClass(node)}">
                <td>${escapeHtml(formatDateTime(match?.ScheduledStartDateTime) || 'TBD')}</td>
                <td>${participantPerformanceHtml(first, team)} vs ${participantPerformanceHtml(second, team)}</td>
                <td>${escapeHtml(matchStatusText(match))}</td>
                <td>${escapeHtml(formatMatchSetScores(match) || '-')}</td>
                <td>${escapeHtml(courtName(node) || '-')}</td>
            </tr>`;
    }).join('');
}

function noTeamSelected(canvas, detail, heading, text) {
    canvas.innerHTML = emptyHtml(text);
    const hint = state.myTeamRefs?.length
        ? 'Choose a team in the Team filter, or tap one of your teams above.'
        : 'Choose a team in the Team filter, or star your teams on AES so the viewer selects them automatically.';
    if (detail) detail.innerHTML = `<h3>${escapeHtml(heading)}</h3><p class="abv-muted">${escapeHtml(hint)}</p>`;
}

/* ---------- Match Day (view key: journey) ---------- */

function renderMatchDay(canvas) {
    resetListCanvas(canvas);
    const detail = getViewDetail('journey');
    const team = selectedFocusTeam();
    if (!team) {
        noTeamSelected(canvas, detail, 'Match Day', 'Select a team to see its day: matches, work assignments, breaks, and court moves.');
        return;
    }
    const matches = selectedTeamMatches(team);
    const work = teamWorkAssignments(team);
    const ownItems = teamDayItems(team);
    const extraCount = ownItems.filter(item => item.kind === 'extra-work').length;
    // "All my teams": one timeline for every one of my teams in this division, so overlaps
    // between teams (one plays while another works) are visible.
    const members = state.myTeams.includes(team) ? state.myTeams : [team, ...state.myTeams];
    const multi = state.matchDayAllTeams && members.length > 1;
    const items = multi
        ? members.flatMap(member => teamDayItems(member).map(item => ({ ...item, team: member }))).sort((a, b) => a.start - b.start)
        : ownItems;
    const dates = [...new Set(items.map(item => item.date).filter(Boolean))].sort();
    if (state.matchDayDate && !dates.includes(state.matchDayDate)) state.matchDayDate = null;
    const date = state.matchDayDate || defaultMatchDay(dates);
    const dayItems = items.filter(item => item.date === date);
    const today = eventDateString();
    const dayControl = dates.length
        ? `<label class="abv-filter-control">Day
                <select data-action="match-day">${dates.map(value => `<option value="${escapeHtml(value)}" ${value === date ? 'selected' : ''}>${escapeHtml(formatDay(value))}${value === today ? ' (today)' : ''}</option>`).join('')}</select>
            </label>`
        : '';
    const venues = [...new Set(dayItems.map(item => splitCourtName(item.court).venue).filter(Boolean))];
    const allItems = [...matches.map(node => ({ kind: 'match', node })), ...work.map(node => ({ kind: 'work', node })), ...ownItems.filter(item => item.kind === 'extra-work')]
        .sort((a, b) => (a.node && b.node ? compareNodeSchedule(a.node, b.node) : (a.start ?? nodeStart(a.node)) - (b.start ?? nodeStart(b.node))));

    canvas.innerHTML = `<div class="abv-list-view">
            <div class="abv-journey-head">
                <div>
                    <h2>${escapeHtml(team.name)}</h2>
                    <p>${escapeHtml(team.clubName)}, ${matches.length} matches, ${work.length + extraCount} work assignments</p>
                </div>
                <div class="abv-head-actions">
                    ${dayControl}
                    ${members.length > 1 ? `<label class="abv-check"><input type="checkbox" data-action="match-day-all" ${multi ? 'checked' : ''}> All my teams (${members.length})</label>` : ''}
                    <button type="button" data-action="copy-parent-update" ${dayItems.length ? '' : 'disabled'}>Copy parent update</button>
                    <button type="button" data-action="print-day-sheet" ${dayItems.length ? '' : 'disabled'}>Print game-day sheet</button>
                    <button type="button" data-action="export-ics" ${items.length ? '' : 'disabled'}>Add to calendar (.ics)</button>
                </div>
            </div>
            <textarea class="abv-copy-fallback" data-role="parent-text" readonly hidden></textarea>
            ${nextUpHtml(team, ownItems)}
            ${outlookLineHtml(team)}
            <section class="abv-section">
                <h3>${escapeHtml(date ? formatDay(date) : 'No scheduled day')}${multi ? ', all my teams' : ''}${venues.length ? `, ${escapeHtml(venues.join(' and '))}` : ''}</h3>
                ${dayItems.length ? (multi ? multiTimelineHtml(dayItems) : timelineHtml(dayItems, team)) : emptyHtml('Nothing scheduled on this day yet.')}
                ${multi ? `<p class="abv-note">Parent update, print, and calendar export cover ${escapeHtml(team.name)} only.</p>` : ''}
            </section>
            ${routesSectionHtml(team, date)}
            <section class="abv-section">
                <details class="abv-all-items"><summary>All matches and work at this event (${allItems.length})</summary>
                    ${allItems.map(item => journeyItemHtml(item, team)).join('')}
                </details>
            </section>
        </div>`;
    if (detail) {
        detail.innerHTML = `<h3>${escapeHtml(team.name)}</h3>
                <p class="abv-muted">${escapeHtml(team.clubName)}</p>
                <h4>Arrival</h4><p>Arrive-by times use ${state.prefs.warmupMinutes} minutes before the first match of the day, or before any match that follows a venue change. Change it in Settings.</p>
                <h4>Court status</h4><p>Close to match time, the next match checks earlier matches on the same court. Matches past their scheduled end with no result posted suggest the court is running late.</p>
                <h4>After pool play</h4><p>Routes come from AES's own schedule for each finish place, including work duties that depend on a later result.</p>`;
    }
}

function nextUpHtml(team, items, now = Date.now()) {
    const pending = pendingItems(items, now);
    const play = pending.find(item => item.kind === 'match');
    const duty = pending.find(item => item.kind !== 'match');
    if (!play && !duty) return '';
    const cell = (title, item, headline, extras = [], extraClass = '') => `<div class="abv-next-cell ${extraClass}">
            <span class="abv-subtitle">${escapeHtml(title)}</span>
            <strong>${escapeHtml(headline)}</strong>
            <span class="abv-when">${escapeHtml(formatDateTime(item.start))} (<span data-countdown="${item.start}">${escapeHtml(formatRelative(item.start))}</span>)</span>
            <span class="abv-muted">${escapeHtml(item.court || 'Court not posted')}${item.node ? `, ${escapeHtml(stageText(item.node))}` : ''}</span>
            ${extras.join('')}
        </div>`;
    const cells = [];
    if (play) {
        const extras = [];
        const sameDay = items.filter(item => item.date === play.date);
        const previous = sameDay[sameDay.indexOf(play) - 1];
        const venueChanged = previous && normName(splitCourtName(previous.court).venue) !== normName(splitCourtName(play.court).venue);
        if (!previous || venueChanged) {
            const arrive = play.start - state.prefs.warmupMinutes * 60000;
            extras.push(`<span class="abv-arrive">Arrive by ${escapeHtml(formatTime(arrive))} (<span data-countdown="${arrive}">${escapeHtml(formatRelative(arrive))}</span>)</span>`);
        }
        const status = courtStatus(play.node, now);
        if (status) extras.push(`<span class="abv-court-status ${status.state}">${escapeHtml(status.text)}</span>`);
        const opponentSide = otherSlot(teamSideInMatch(play.node.match, team));
        const opponentTeam = opponentSide ? directoryTeamForParticipant(matchParticipant(play.node.match, opponentSide)) : null;
        if (opponentTeam) extras.push(scoutButtonHtml(opponentTeam));
        cells.push(cell('Next match', play, `vs ${teamResultForMatch(play.node, team).opponent}`, extras));
    }
    if (duty) {
        const headline = duty.node
            ? `${matchParticipant(duty.node.match, 'first').label} vs ${matchParticipant(duty.node.match, 'second').label}`
            : `Work, ${duty.entry.play.FullName || 'bracket'}`;
        cells.push(cell('Next work assignment', duty, headline, [], 'work'));
    }
    return `<div class="abv-next-card">${cells.join('')}</div>`;
}

function timelineHtml(dayItems, team) {
    const now = Date.now();
    return `<div class="abv-timeline">${annotateTimeline(dayItems).map(({ item, gap, move }, index) => {
        let between = '';
        if (gap != null) {
            const info = gapText(gap);
            const parts = [info.text, move ? move.text : ''].filter(Boolean).join(', then ');
            between = `<div class="abv-tl-gap ${info.warn || move?.venue ? 'warn' : ''} ${info.meal ? 'meal' : ''}">${escapeHtml(parts)}</div>`;
        }
        return between + timelineItemHtml(item, team, itemIsDone(item, now, dayItems[index + 1]));
    }).join('')}</div>`;
}

function overlapPairs(dayItems) {
    const pairs = [];
    dayItems.forEach((item, index) => {
        for (let next = index + 1; next < dayItems.length && dayItems[next].start < item.end; next += 1) {
            if (dayItems[next].team !== item.team) pairs.push([item, dayItems[next]]);
        }
    });
    return pairs;
}

function multiTimelineHtml(dayItems) {
    const now = Date.now();
    const pairs = overlapPairs(dayItems);
    const flagged = new Set(pairs.flat());
    const doing = item => (item.kind === 'match' ? 'plays' : 'works');
    const banner = pairs.length
        ? `<div class="abv-warning"><strong>${pairs.length} overlap${pairs.length === 1 ? '' : 's'}:</strong> ${pairs.slice(0, 6)
            .map(([a, b]) => escapeHtml(`${formatTime(b.start)}, ${a.team.name} ${doing(a)} on ${a.court || 'court TBD'} while ${b.team.name} ${doing(b)} on ${b.court || 'court TBD'}`))
            .join('; ')}${pairs.length > 6 ? '; and more' : ''}</div>`
        : '';
    const byTeam = new Map();
    for (const item of dayItems) {
        if (!byTeam.has(item.team)) byTeam.set(item.team, []);
        byTeam.get(item.team).push(item);
    }
    const rows = dayItems.map(item => {
        const own = byTeam.get(item.team);
        const done = itemIsDone(item, now, own[own.indexOf(item) + 1]);
        return timelineItemHtml(item, item.team, done, { showTeam: true, conflict: flagged.has(item) });
    }).join('');
    return `${banner}<div class="abv-timeline abv-timeline-multi">${rows}</div>`;
}

function timelineItemHtml(item, team, done, { showTeam = false, conflict = false } = {}) {
    const where = splitCourtName(item.court);
    let title;
    let sub = '';
    let badge;
    if (item.kind === 'match') {
        const info = teamResultForMatch(item.node, team);
        const side = teamSideInMatch(item.node.match, team);
        const sets = side ? formatTeamSetScores(teamSetScores(item.node.match, side)) : '';
        title = `vs ${info.opponent}`;
        sub = [stageText(item.node), sets].filter(Boolean).join(', ');
        badge = info.status === 'win' || info.status === 'loss'
            ? `<span class="abv-badge ${info.status}">${info.label}</span>`
            : `<span class="abv-badge ${done ? '' : 'upcoming'}">${done ? 'NO RESULT' : 'PLAY'}</span>`;
    } else if (item.kind === 'work') {
        title = `Work: ${matchParticipant(item.node.match, 'first').label} vs ${matchParticipant(item.node.match, 'second').label}`;
        sub = stageText(item.node);
        badge = '<span class="abv-badge work">WORK</span>';
    } else {
        title = `Work: ${item.entry.play.FullName || 'bracket match'}`;
        sub = item.entry.play.CompleteFullName || '';
        badge = '<span class="abv-badge work">WORK</span>';
    }
    return `<div class="abv-tl-item ${item.kind === 'match' ? 'play' : 'work'} ${done ? 'done' : ''} ${conflict ? 'conflict' : ''}">
            <div class="abv-tl-time">${escapeHtml(formatTime(item.start))}<small>to ${escapeHtml(formatTime(item.end))}</small></div>
            <div class="abv-tl-body">${showTeam ? `<span class="abv-tl-team">${escapeHtml(team.name)}</span>` : ''}<strong>${escapeHtml(title)}</strong>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</div>
            <div class="abv-tl-court">${escapeHtml(where.court || item.court || 'Court TBD')}${where.venue ? `<small>${escapeHtml(where.venue)}</small>` : ''}</div>
            ${badge}
        </div>`;
}

function routesSectionHtml(team, date) {
    const pools = teamPoolHistory(team).filter(pool => pool.play?.__date === date);
    const sections = pools.map(pool => {
        const routes = poolRoutes(pool, team);
        if (!routes.length) return '';
        const row = poolTeamRow(pool, team);
        const finish = pool.complete && row ? row.rank : null;
        const body = routes.map(route => `<tr class="${finish === route.place ? 'selected-team' : ''}">
                <td>${ordinal(route.place)}${route.holder ? `<br><span class="abv-muted">${escapeHtml(route.holder)}${pool.complete ? '' : ' (current)'}</span>` : ''}</td>
                <td>${escapeHtml(route.playName || 'No further play published')}${route.reseed ? '<br><span class="abv-muted">may be reseeded</span>' : ''}</td>
                <td>${route.match ? `${escapeHtml(formatTime(route.match.start))}<br><span class="abv-muted">${escapeHtml(route.match.court)}</span>` : '-'}</td>
                <td>${escapeHtml(routeWorkText(route))}</td>
            </tr>`).join('');
        const heading = finish ? `After ${pool.poolLabel}: finished ${ordinal(finish)}` : `After ${pool.poolLabel}`;
        return `<section class="abv-section"><h3>${escapeHtml(heading)}</h3>
                ${tableHtml(['Finish', 'Next', 'First match', 'Work'], body)}
                <p class="abv-note">From AES's schedule for ${escapeHtml(performanceGroupLabel(pool))}. "Not final" means AES has not settled that work assignment yet.</p>
            </section>`;
    }).join('');
    return sections;
}

function journeyItemHtml(item, team) {
    if (item.kind === 'extra-work') {
        return `<div class="abv-journey-item work">
                <div class="abv-journey-date">${escapeHtml(formatDateTime(item.start))}</div>
                <div class="abv-journey-match"><strong>Work: ${escapeHtml(item.entry.play.FullName || 'bracket match')}</strong><small>${escapeHtml(item.entry.play.CompleteFullName || '')}</small><small>${escapeHtml(item.court)}</small></div>
                <span class="abv-badge work">WORK</span>
            </div>`;
    }
    const { node } = item;
    const match = node.match;
    const date = formatDateTime(match?.ScheduledStartDateTime) || 'TBD';
    const court = courtName(node);
    if (item.kind === 'work') {
        const first = matchParticipant(match, 'first').label;
        const second = matchParticipant(match, 'second').label;
        return `<div class="abv-journey-item work">
                <div class="abv-journey-date">${escapeHtml(date)}</div>
                <div class="abv-journey-match">
                    <strong>Work: ${escapeHtml(first)} vs ${escapeHtml(second)}</strong>
                    <small>${escapeHtml(stageText(node))}</small>
                    ${court ? `<small>${escapeHtml(court)}</small>` : ''}
                </div>
                <span class="abv-badge work">WORK</span>
            </div>`;
    }
    const info = teamResultForMatch(node, team);
    const itemClass = info.status === 'upcoming' ? 'upcoming' : (info.status === 'current' ? 'current' : '');
    return `<div class="abv-journey-item ${itemClass}">
            <div class="abv-journey-date">${escapeHtml(date)}</div>
            <div class="abv-journey-match">
                <strong>vs ${escapeHtml(info.opponent)}</strong>
                <small>${escapeHtml(stageText(node))}</small>
                <small>${escapeHtml(matchCategoryLabel(node))}${court ? `, ${escapeHtml(court)}` : ''}</small>
                ${info.result ? `<small>${escapeHtml(info.result)}</small>` : ''}
            </div>
            <span class="abv-badge ${info.status}">${escapeHtml(info.label)}</span>
        </div>`;
}

/* ---------- Standings & Outlook (view key: performance) ---------- */

function renderGroupPerformance(canvas) {
    resetListCanvas(canvas);
    const detail = getViewDetail('performance');
    const team = selectedFocusTeam();
    if (!team) {
        noTeamSelected(canvas, detail, 'Standings & Outlook', 'Select a team to compare it with the other teams in its pool.');
        return;
    }
    const history = teamPoolHistory(team);
    const pool = resolvePerformancePool(team);
    if (!pool) {
        canvas.innerHTML = emptyHtml('AES has not published a pool for this team yet.');
        if (detail) detail.innerHTML = `<h3>${escapeHtml(team.name)}</h3><p class="abv-muted">No pools yet.</p>`;
        return;
    }
    state.performanceGroupKey = pool.groupKey;
    state.performancePoolKey = pool.key;
    const groups = performanceGroupsForTeam(team);
    const groupPools = history.filter(item => item.groupKey === pool.groupKey);
    const selectedRow = poolTeamRow(pool, team);
    const rankTag = pool.hasOfficialFinish ? 'AES' : 'calc.';

    const progress = history.map(item => {
        const row = poolTeamRow(item, team);
        const status = item.complete ? 'complete' : (item.hasAnyResult ? 'in progress' : 'not started');
        return `<div class="abv-progress-item ${item.key === pool.key ? 'current' : ''}" data-perf-pool="${escapeHtml(item.key)}" role="button" tabindex="0">
                <div><strong>${escapeHtml(item.poolLabel)}</strong><br><span class="abv-muted">${escapeHtml(performanceGroupLabel(item))}, ${status}</span></div>
                <span>${row ? `${ordinal(row.rank)} (${item.hasOfficialFinish ? 'AES' : 'calc.'})` : 'Not placed'}</span>
                <span>${row ? `${row.matchWins}-${row.matchLosses} matches` : '-'}</span>
                <span>${row ? `${row.setWins}-${row.setLosses} sets` : '-'}</span>
            </div>`;
    }).join('');

    const controls = `<div class="abv-perf-controls">
            <label class="abv-perf-control">Group
                <select data-action="performance-group">${groups.map(group => `<option value="${escapeHtml(group.key)}" ${group.key === pool.groupKey ? 'selected' : ''}>${escapeHtml(group.label)}</option>`).join('')}</select>
            </label>
            <label class="abv-perf-control">Pool
                <select data-action="performance-pool">${groupPools.map(item => `<option value="${escapeHtml(item.key)}" ${item.key === pool.key ? 'selected' : ''}>${escapeHtml(item.poolLabel)}</option>`).join('')}</select>
            </label>
        </div>`;

    const placeholderCount = pool.matches.filter(node => matchParticipant(node.match, 'first').placeholder || matchParticipant(node.match, 'second').placeholder).length;
    const warning = placeholderCount
        ? `<div class="abv-warning">${placeholderCount} match${placeholderCount === 1 ? '' : 'es'} in this pool still show placeholders. Standings cover only the teams AES has placed.</div>`
        : '';

    const showAes = pool.standings.some(row => row.officialRank > 0);
    const standingsBody = pool.standings.map(row => {
        const setPct = row.setWins + row.setLosses ? `${Math.round(pct(row.setWins, row.setLosses) * 100)}%` : '-';
        return `<tr class="${selectedRow?.key === row.key ? 'selected-team' : ''}">
                ${showAes ? `<td>${ordinal(row.officialRank)}</td>` : ''}
                <td>${ordinal(row.calcRank)}</td>
                <td>${escapeHtml(row.name)}</td>
                <td>${row.matchWins}-${row.matchLosses}</td>
                <td>${row.setWins}-${row.setLosses}</td>
                <td>${setPct}</td>
                <td>${escapeHtml(formatRatio(row))}</td>
                <td>${row.pointsFor}-${row.pointsAgainst}</td>
                <td>${row.remaining}</td>
            </tr>`;
    }).join('');
    const standingsHeaders = [...(showAes ? ['AES'] : []), 'Calc.', 'Team', 'Matches', 'Sets', 'Set %', 'Point ratio', 'Points', 'Left'];

    const poolStats = selectedRow
        ? `<div class="abv-stats-grid">
                ${statHtml(`${ordinal(selectedRow.rank)} <small>${rankTag}</small>`, 'Pool position')}
                ${statHtml(`${selectedRow.matchWins}-${selectedRow.matchLosses}`, 'Match record')}
                ${statHtml(`${selectedRow.setWins}-${selectedRow.setLosses}`, 'Set record')}
                ${statHtml(escapeHtml(formatRatio(selectedRow)), 'Point ratio')}
                ${statHtml(String(selectedRow.remaining), 'Matches left')}
            </div>`
        : '';

    const routeDetails = crossoverRouteDetailsForPool(pool);
    const xoMatches = crossoverMatchesForPool(pool, team);
    const xoMetrics = computeTeamMatchMetrics(xoMatches, team);
    const assignedKeys = new Set(xoMatches.map(node => node.key));
    const xoSection = routeDetails.length || xoMatches.length
        ? `<section class="abv-section">
                <h3>Crossover</h3>
                ${xoMatches.length ? `${tableHtml(['Time', 'Match', 'Result', 'Sets', 'Court'], matchRowsHtml(xoMatches, team))}
                    <div class="abv-stats-grid">
                        ${statHtml(`${xoMetrics.matchWins}-${xoMetrics.matchLosses}`, 'XO match record')}
                        ${statHtml(`${xoMetrics.setWins}-${xoMetrics.setLosses}`, 'XO set record')}
                    </div>` : '<p class="abv-muted">This team has no crossover match assigned yet.</p>'}
                ${routeDetails.length ? `<p class="abv-subtitle">Where each finish place goes</p>${tableHtml(['Finish', 'Crossover match', 'Status'], routeDetails.map(route => {
            const assigned = assignedKeys.has(route.node.key);
            return `<tr class="${assigned ? 'route-assigned' : 'route-possible'}">
                        <td>${escapeHtml(route.edge.condition)}</td>
                        <td>${escapeHtml(progressionDestinationLabel(route.node))}</td>
                        <td><span class="abv-route-status">${assigned ? 'Assigned' : 'Possible'}</span></td>
                    </tr>`;
        }).join(''))}` : ''}
            </section>`
        : '';

    canvas.innerHTML = `<div class="abv-list-view">
            <div class="abv-journey-head"><div><h2>${escapeHtml(team.name)}</h2><p>Standings and outlook, ${escapeHtml(team.clubName)}</p></div></div>
            ${outlookSectionHtml(team)}
            ${likelyOpponentsHtml(team)}
            ${pendingNoteHtml()}
            <div class="abv-breadcrumb abv-section">${escapeHtml(state.divisionName)} / ${escapeHtml(pool.stageLabel)} / ${escapeHtml(pool.groupName)} / ${escapeHtml(pool.poolLabel)}</div>
            ${controls}
            <section><p class="abv-subtitle">Tournament progress</p><div class="abv-progress-track">${progress}</div></section>
            ${warning}
            <section class="abv-section"><h3>Pool matches</h3>${tableHtml(['Time', 'Match', 'Result', 'Sets', 'Court'], matchRowsHtml(pool.matches, team, node => (matchContainsTeam(node.match, team) ? 'mine' : '')))}</section>
            <section class="abv-section"><h3>Pool stats</h3>${poolStats || '<p class="abv-muted">This team is not listed in the pool yet.</p>'}</section>
            <section class="abv-section"><h3>Pool standings</h3>${tableHtml(standingsHeaders, standingsBody)}
                <p class="abv-note">Calc. ranks by match win %, set win %, head-to-head for a two-way tie, then point ratio. Once the pool is complete and AES publishes finish places, those are used instead. Your event's tiebreak rules may differ.</p>
            </section>
            ${scenarioSectionHtml(pool, team)}
            ${xoSection}
        </div>`;
    if (detail) {
        detail.innerHTML = `<h3>${escapeHtml(pool.poolLabel)}</h3>
                <p class="abv-muted">${escapeHtml(performanceGroupLabel(pool))}</p>
                <p><span class="abv-pill">${pool.teams.size} teams</span><span class="abv-pill">${pool.matches.length} matches</span><span class="abv-pill">${pool.complete ? 'Complete' : 'In progress'}</span></p>
                <h4>How to read this</h4>
                <p class="abv-muted">Select a pool in Tournament progress to compare that stage. Scenarios list where the team can still finish and where each finish leads.</p>`;
    }
}

function scenarioSectionHtml(pool, team) {
    const result = computePoolScenarios(pool, team);
    const messages = {
        'no-team': 'This team is not listed in the pool yet.',
        unresolved: 'Some pool slots still show placeholders, so scenarios are not available yet.',
        complete: 'All pool matches have results.',
        'too-many': `${result.count} matches remain. Scenarios appear once ${DEFAULTS.scenarioMaxRemaining} or fewer remain.`
    };
    if (result.status !== 'ok') {
        return `<section class="abv-section"><h3>Scenarios</h3><p class="abv-muted">${escapeHtml(messages[result.status] || '')}</p></section>`;
    }
    const routes = placementRoutesForPool(pool);
    const summary = [`Possible finishes: ${result.possible.map(ordinal).join(', ')} of ${result.teamCount}.`];
    if (result.worstOverall < result.teamCount) summary.push(`Guaranteed ${ordinal(result.worstOverall)} or better.`);
    if (result.bestOverall > 1) summary.push(`Cannot finish above ${ordinal(result.bestOverall)}.`);
    const describe = signature => (signature
        ? [...signature].map((code, index) => `${code === 'W' ? 'Win' : 'Loss'} vs ${result.own[index].opponent.name}`).join(', ')
        : 'No matches left for this team');
    const rows = result.outcomes.map(entry => {
        const finish = entry.best === entry.worst ? ordinal(entry.best) : `${ordinal(entry.best)} to ${ordinal(entry.worst)}`;
        const notes = [];
        if (entry.ranges.size > 1) notes.push('depends on other results');
        if (entry.tieScenarios) notes.push('ties go to set % and tiebreaks');
        const note = notes.length ? notes.join('; ') : 'locked in';
        const next = [...entry.finishes].sort((a, b) => a - b)
            .map(place => `${ordinal(place)}: ${escapeHtml((routes.get(place) || ['no published route']).join(' or '))}`)
            .join('<br>');
        return `<tr><td>${escapeHtml(describe(entry.signature))}</td><td>${escapeHtml(finish)}</td><td>${escapeHtml(note)}</td><td>${next}</td></tr>`;
    }).join('');
    return `<section class="abv-section">
            <h3>Scenarios</h3>
            <div class="abv-scenario-summary">${escapeHtml(summary.join(' '))}</div>
            ${tableHtml(['If this team gets', 'Finish', 'Notes', 'Leads to'], rows)}
            <p class="abv-note">Based on match wins across all ${2 ** (result.own.length + result.otherCount)} outcome combinations of the remaining pool matches. Teams level on match record are shown as a range because set percentage depends on set scores not yet played.</p>
        </section>`;
}

/* ---------- Stats ---------- */

function ratioText(pointsFor, pointsAgainst) {
    return pointsAgainst > 0 ? (pointsFor / pointsAgainst).toFixed(3) : (pointsFor > 0 ? 'all won' : '-');
}

function winRate(record) {
    const total = record.wins + record.losses;
    return total ? `${Math.round((record.wins / total) * 100)}%` : '-';
}

function statsScopeOptions(team) {
    const weekends = weekendByDate();
    const keys = new Set(selectedTeamMatches(team).map(node => weekends.get(matchDate(node))?.key).filter(Boolean));
    return eventWeekends().filter(weekend => keys.has(weekend.key));
}

function pendingNoteHtml() {
    const count = state.pendingPoolSheets.size;
    return count
        ? `<div class="abv-warning">Earlier weekends are still loading (${count} pools). Records and stats here will update in a moment.</div>`
        : '';
}

function renderStats(canvas) {
    resetListCanvas(canvas);
    const detail = getViewDetail('stats');
    const team = selectedFocusTeam();
    if (!team) {
        noTeamSelected(canvas, detail, 'Stats', 'Select a team to see its results and patterns.');
        return;
    }
    const weekends = statsScopeOptions(team);
    if (state.statsWeekendKey && !weekends.some(weekend => weekend.key === state.statsWeekendKey)) state.statsWeekendKey = null;
    const scope = weekends.find(weekend => weekend.key === state.statsWeekendKey) || null;
    const multiWeekend = eventWeekends().length > 1;
    const profile = computeTeamProfile(team, { weekendKey: scope?.key || null });
    const played = profile.matchWins + profile.matchLosses;
    const heading = scope ? `${scope.label} stats` : (multiWeekend ? 'Season stats' : 'Event stats');
    const scopeControl = weekends.length > 1
        ? `<label class="abv-filter-control">Show
                <select data-action="stats-scope">
                    <option value="__all__" ${scope ? '' : 'selected'}>All weekends</option>
                    ${weekends.map(weekend => `<option value="${escapeHtml(weekend.key)}" ${scope?.key === weekend.key ? 'selected' : ''}>${escapeHtml(weekend.label)}</option>`).join('')}
                </select>
            </label>`
        : '';

    const diff = profile.pointsFor - profile.pointsAgainst;
    const summary = `<div class="abv-stats-grid">
            ${statHtml(recordText({ wins: profile.matchWins, losses: profile.matchLosses }), 'Match record', played ? `${winRate({ wins: profile.matchWins, losses: profile.matchLosses })} won` : '')}
            ${statHtml(recordText({ wins: profile.setWins, losses: profile.setLosses }), 'Set record')}
            ${statHtml(ratioText(profile.pointsFor, profile.pointsAgainst), 'Point ratio', `${profile.pointsFor} scored, ${profile.pointsAgainst} allowed (${diff > 0 ? '+' : ''}${diff})`)}
            ${statHtml(String(profile.remaining), 'Matches left')}
        </div>`;
    const missingNote = profile.missingSetScores
        ? `<p class="abv-note">${profile.missingSetScores} match${profile.missingSetScores === 1 ? ' has' : 'es have'} no per-set scores in AES. They count toward the match record but not toward points or set patterns.</p>`
        : '';

    const opponentsPlayed = profile.opponents.wins + profile.opponents.losses;
    const patterns = `<div class="abv-stats-grid">
            ${statHtml(recordText(profile.close), 'Close sets', 'decided by 3 or fewer (2 in a 15-point set)')}
            ${statHtml(recordText(profile.deciding), 'Deciding sets', 'third sets')}
            ${statHtml(recordText(profile.afterWinningSet1), 'After winning set 1', 'match record')}
            ${statHtml(recordText(profile.afterLosingSet1), 'After losing set 1', 'match record')}
            ${statHtml(opponentsPlayed ? recordText(profile.opponents) : '-', "Opponents' record", opponentsPlayed ? `${winRate(profile.opponents)}, excluding games vs this team` : '')}
            ${statHtml(profile.qualityMatches ? `${profile.qualityWins} of ${profile.qualityMatches}` : '-', 'Wins vs .500+ teams', 'matches won against teams at .500 or better')}
        </div>`;

    const setsTotal = profile.setWins + profile.setLosses;
    const marginRows = [['close', 'Close', '3 or fewer points (2 in a 15-point set)'], ['competitive', 'Competitive', '4 to 6 points (3 to 4)'], ['decisive', 'Decisive', '7 or more points (5 or more)']]
        .map(([key, label, range]) => {
            const record = profile.margins[key];
            const share = setsTotal ? `${Math.round(((record.wins + record.losses) / setsTotal) * 100)}%` : '-';
            return `<tr><td>${label}</td><td class="abv-muted">${range}</td><td class="num">${record.wins}</td><td class="num">${record.losses}</td><td class="num">${share}</td></tr>`;
        }).join('');

    const orderRows = [...profile.byOrder.entries()].sort((a, b) => a[0] - b[0]).map(([order, entry]) =>
        `<tr><td>${ordinal(order)} match of the day</td><td class="num">${recordText(entry.matches)}</td><td class="num">${entry.setWins}-${entry.setLosses}</td><td class="num">${ratioText(entry.pointsFor, entry.pointsAgainst)}</td></tr>`).join('');

    const seedRows = teamSeedFinishes(team, scope?.key || null).map(item => {
        let outcome = 'In progress';
        if (item.finish != null && item.seed != null) {
            const delta = item.seed - item.finish;
            outcome = delta > 0 ? `${delta} above seed` : delta < 0 ? `${-delta} below seed` : 'As seeded';
        } else if (item.finish != null) {
            outcome = 'Seed not listed';
        }
        return `<tr>
                <td>${escapeHtml(item.pool.poolLabel)}<br><span class="abv-muted">${escapeHtml(performanceGroupLabel(item.pool))}</span></td>
                <td class="num">${item.seed ? `${ordinal(item.seed)} of ${item.size}` : '-'}</td>
                <td class="num">${item.finish ? `${ordinal(item.finish)}${item.official ? '' : ' (calc.)'}` : '-'}</td>
                <td>${escapeHtml(outcome)}</td>
            </tr>`;
    }).join('');

    const weekendRows = !scope && weekends.length > 1
        ? weekends.map(weekend => {
            const part = computeTeamProfile(team, { weekendKey: weekend.key });
            const pools = teamSeedFinishes(team, weekend.key)
                .map(item => `${item.pool.groupName} ${item.pool.poolLabel}: ${item.finish ? ordinal(item.finish) : 'in progress'}`).join('; ');
            return `<tr>
                    <td>${escapeHtml(weekend.label)}</td>
                    <td class="num">${part.matchWins}-${part.matchLosses}</td>
                    <td class="num">${part.setWins}-${part.setLosses}</td>
                    <td class="num">${ratioText(part.pointsFor, part.pointsAgainst)}</td>
                    <td class="num">${recordText(part.close)}</td>
                    <td>${escapeHtml(pools || '-')}</td>
                </tr>`;
        }).join('')
        : '';

    const matchRows = profile.rows.map(row => `<tr class="mine">
            <td>${escapeHtml(formatDateTime(row.node.match?.ScheduledStartDateTime) || 'TBD')}</td>
            <td>${escapeHtml(row.info.opponent)}</td>
            <td>${escapeHtml(stageText(row.node))}</td>
            <td>${escapeHtml(row.info.label)}</td>
            <td>${escapeHtml(formatTeamSetScores(row.sets) || '-')}</td>
            <td class="num">${row.close.wins + row.close.losses ? recordText(row.close) : '-'}</td>
        </tr>`).join('');

    canvas.innerHTML = `<div class="abv-list-view">
            <div class="abv-journey-head">
                <div><h2>${escapeHtml(team.name)}</h2><p>${escapeHtml(heading)}, ${escapeHtml(state.divisionName)}</p></div>
                <div class="abv-head-actions">
                    ${scopeControl}
                    <button type="button" data-action="export-csv" ${profile.rows.length ? '' : 'disabled'}>Export CSV</button>
                </div>
            </div>
            ${summary}
            ${pendingNoteHtml()}
            ${missingNote}
            <section class="abv-section"><h3>Patterns</h3>${played ? patterns : '<p class="abv-muted">Patterns appear after the first result.</p>'}</section>
            ${setsTotal ? `<section class="abv-section"><h3>Set margins</h3>${tableHtml(['Margin', 'Points', numCol('Won'), numCol('Lost'), numCol('Share of sets')], marginRows)}</section>` : ''}
            ${orderRows ? `<section class="abv-section"><h3>By match of the day</h3>${tableHtml(['Match', numCol('Record'), numCol('Sets'), numCol('Point ratio')], orderRows)}
                <p class="abv-note">Counts each team match on a given day in schedule order, so a slow start or late fade shows up here.</p></section>` : ''}
            ${seedRows ? `<section class="abv-section"><h3>Seed vs. finish</h3>${tableHtml(['Pool', numCol('Seed'), numCol('Finish'), 'Result'], seedRows)}
                <p class="abv-note">Seed is the team's position in AES's pool listing. Finish uses AES's published place once a pool is complete.</p></section>` : ''}
            ${weekendRows ? `<section class="abv-section"><h3>By weekend</h3>${tableHtml(['Weekend', numCol('Matches'), numCol('Sets'), numCol('Point ratio'), numCol('Close sets'), 'Pools'], weekendRows)}</section>` : ''}
            <section class="abv-section"><h3>Matches</h3>${profile.rows.length ? tableHtml(['Time', 'Opponent', 'Stage', 'Result', 'Sets (this team first)', numCol('Close sets')], matchRows) : emptyHtml('No matches in this range.')}</section>
        </div>`;
    if (detail) {
        detail.innerHTML = `<h3>${escapeHtml(team.name)}</h3>
                <p class="abv-muted">${escapeHtml(heading)} from results AES has posted.</p>
                <h4>Point ratio</h4><p>Points scored divided by points allowed, across every set. Above 1.000 means the team outscores opponents. AES uses it as a pool tiebreaker.</p>
                <h4>Opponents' record</h4><p>Combined record of every opponent faced, counting each meeting, and leaving out their games against this team. Higher means a tougher schedule.</p>
                <h4>After set 1</h4><p>Match results split by whether the team won the first set.</p>
                <h4>Export</h4><p>The CSV has one row per match in the selected range, with set scores from this team's side.</p>`;
    }
}

/* ---------- Scouting ---------- */

function scoutButtonHtml(team) {
    return team && !state.myTeams.includes(team)
        ? `<button type="button" class="abv-link-button" data-action="scout" data-team-id="${team.id}">Scout ${escapeHtml(team.name)}</button>`
        : '';
}

function statusCellHtml(title, body, sub = '', extraClass = '') {
    return `<div class="abv-next-cell ${extraClass}"><span class="abv-subtitle">${escapeHtml(title)}</span><strong>${body}</strong>${sub ? `<span class="abv-muted">${sub}</span>` : ''}</div>`;
}

function liveStatusHtml(team) {
    const { current, next, last } = teamLiveStatus(team);
    const opponentOf = node => {
        const side = teamSideInMatch(node.match, team);
        return matchParticipant(node.match, otherSlot(side) || 'second').label;
    };
    const cells = [];
    if (current) {
        const what = current.kind === 'match' ? `Playing vs ${escapeHtml(opponentOf(current.node))}` : 'Working a match';
        cells.push(statusCellHtml('On court now (per schedule)', what, `${escapeHtml(current.court || 'court TBD')}, started ${escapeHtml(formatTime(current.start))}`));
    }
    if (next) {
        cells.push(statusCellHtml('Next match', `vs ${escapeHtml(opponentOf(next.node))}`,
            `${escapeHtml(formatDateTime(next.start))} (<span data-countdown="${next.start}">${escapeHtml(formatRelative(next.start))}</span>), ${escapeHtml(next.court || 'court TBD')}`));
    }
    if (last) {
        const info = teamResultForMatch(last, team);
        const side = teamSideInMatch(last.match, team);
        cells.push(statusCellHtml('Last result', `${escapeHtml(info.label)} vs ${escapeHtml(info.opponent)}`,
            `${escapeHtml(formatTeamSetScores(side ? teamSetScores(last.match, side) : []))}, ${escapeHtml(formatDateTime(last.match?.ScheduledStartDateTime))}`, 'work'));
    }
    return cells.length ? `<div class="abv-next-card">${cells.join('')}</div>` : '';
}

function renderScouting(canvas) {
    resetListCanvas(canvas);
    const detail = getViewDetail('scouting');
    const us = selectedFocusTeam();
    const options = us ? upcomingOpponents(us) : [];
    const exclude = new Set([...(us ? [us.id] : []), ...state.myTeams.map(team => team.id)]);
    let them = state.scoutTeamId != null ? state.teamById.get(Number(state.scoutTeamId)) || null : null;
    if (them && exclude.has(them.id)) them = null;
    if (!them) them = (options.find(option => option.group === 'next') || options.find(option => option.group === 'scheduled') || options[0])?.team || null;
    state.scoutTeamId = them?.id ?? null;

    const listed = new Set(options.map(option => option.team.id));
    const option = team => `<option value="${team.id}" ${team.id === them?.id ? 'selected' : ''}>${escapeHtml(team.name)}</option>`;
    const groups = [['next', 'Next opponent'], ['scheduled', 'Also scheduled'], ['possible', 'Possible next opponents']]
        .map(([group, label]) => {
            const teams = options.filter(entry => entry.group === group).map(entry => entry.team);
            return teams.length ? `<optgroup label="${label}">${teams.map(option).join('')}</optgroup>` : '';
        }).join('');
    const rest = state.teamDirectory.filter(team => !exclude.has(team.id) && !listed.has(team.id));
    const picker = `<label class="abv-filter-control">Scout
            <select data-action="scout-team"><option value="">Choose a team</option>${groups}<optgroup label="All teams">${rest.map(option).join('')}</optgroup></select>
        </label>`;

    if (!them) {
        canvas.innerHTML = `<div class="abv-list-view">
                <div class="abv-journey-head"><div><h2>Scouting</h2><p>${us ? `No upcoming opponents for ${escapeHtml(us.name)} yet.` : 'Select your team to see its next opponents.'}</p></div><div class="abv-head-actions">${picker}</div></div>
                ${emptyHtml('Choose a team to scout.')}
            </div>`;
        if (detail) detail.innerHTML = '<h3>Scouting</h3><p class="abv-muted">Pick a team to see its results, patterns, and how it compares with yours.</p>';
        return;
    }

    const themProfile = computeTeamProfile(them);
    const usProfile = us ? computeTeamProfile(us) : null;
    const reasons = options.find(entry => entry.team.id === them.id);
    const why = reasons
        ? `<p class="abv-note"><strong>${reasons.group === 'next' ? 'Your next opponent' : reasons.group === 'scheduled' ? 'Scheduled opponent' : 'Possible next opponent'}:</strong> ${escapeHtml(reasons.reasons.slice(0, 4).join('; '))}${reasons.reasons.length > 4 ? '; and more' : ''}</p>`
        : '';

    let comparison = '';
    if (usProfile) {
        const cells = profile => {
            const opponents = profile.opponents.wins + profile.opponents.losses;
            return [
                recordText({ wins: profile.matchWins, losses: profile.matchLosses }),
                recordText({ wins: profile.setWins, losses: profile.setLosses }),
                ratioText(profile.pointsFor, profile.pointsAgainst),
                recordText(profile.close),
                recordText(profile.deciding),
                recordText(profile.afterLosingSet1),
                opponents ? `${recordText(profile.opponents)} (${winRate(profile.opponents)})` : '-',
                profile.qualityMatches ? `${profile.qualityWins} of ${profile.qualityMatches}` : '-'
            ];
        };
        const labels = ['Match record', 'Set record', 'Point ratio', 'Close sets', 'Deciding sets', 'After losing set 1', "Opponents' record", 'Wins vs .500+ teams'];
        const ours = cells(usProfile);
        const theirs = cells(themProfile);
        comparison = `<section class="abv-section"><h3>${escapeHtml(us.name)} vs ${escapeHtml(them.name)}</h3>
                ${tableHtml(['', numCol(us.name), numCol(them.name)], labels.map((label, index) => `<tr><td>${label}</td><td class="num">${escapeHtml(ours[index])}</td><td class="num">${escapeHtml(theirs[index])}</td></tr>`).join(''))}
                <p class="abv-note">Both columns cover every result at this event, using the same definitions as Stats.</p>
            </section>`;
    }

    let headToHead = '';
    if (usProfile) {
        const meetings = usProfile.rows.filter(row => row.opponentTeam?.id === them.id);
        if (meetings.length) {
            headToHead = `<section class="abv-section"><h3>Head to head at this event</h3>${tableHtml(['Time', 'Stage', `${us.name} result`, 'Sets (your side first)'],
                meetings.map(row => `<tr><td>${escapeHtml(formatDateTime(row.node.match?.ScheduledStartDateTime))}</td><td>${escapeHtml(stageText(row.node))}</td><td>${escapeHtml(row.info.label)}</td><td>${escapeHtml(formatTeamSetScores(row.sets) || '-')}</td></tr>`).join(''))}</section>`;
        }
    }

    let common = '';
    if (usProfile) {
        const shared = commonOpponents(usProfile, themProfile);
        const resultText = rows => rows.map(row => `${row.info.status === 'win' ? 'W' : 'L'} ${formatTeamSetScores(row.sets)}`).join('; ');
        common = shared.list.length
            ? `<section class="abv-section"><h3>Common opponents (${shared.list.length})</h3>
                    <div class="abv-scenario-summary">Against these teams, ${escapeHtml(us.name)} went ${recordText(shared.ours)} (point ratio ${ratioText(shared.ours.pointsFor, shared.ours.pointsAgainst)}) and ${escapeHtml(them.name)} went ${recordText(shared.theirs)} (point ratio ${ratioText(shared.theirs.pointsFor, shared.theirs.pointsAgainst)}).</div>
                    ${tableHtml(['Opponent', `${us.name}`, `${them.name}`], shared.list.map(entry => `<tr><td>${escapeHtml(entry.opponent.name)}</td><td>${escapeHtml(resultText(entry.ours))}</td><td>${escapeHtml(resultText(entry.theirs))}</td></tr>`).join(''))}
                    <p class="abv-note">Set scores are from each team's own side.</p>
                </section>`
            : `<section class="abv-section"><h3>Common opponents</h3><p class="abv-muted">${escapeHtml(us.name)} and ${escapeHtml(them.name)} have not played any of the same teams yet.</p></section>`;
    }

    const { best, worst } = notableResults(themProfile);
    const notable = best || worst
        ? `<div class="abv-stats-grid">
                ${best ? statHtml(escapeHtml(`W vs ${best.row.opponentTeam.name}`), 'Best win', `${formatTeamSetScores(best.row.sets)}; opponent ${recordText(best.record)} otherwise`) : ''}
                ${worst ? statHtml(escapeHtml(`L vs ${worst.row.opponentTeam.name}`), 'Worst loss', `${formatTeamSetScores(worst.row.sets)}; opponent ${recordText(worst.record)} otherwise`) : ''}
            </div>`
        : '';

    const resultRows = themProfile.rows.map(row => `<tr>
            <td>${escapeHtml(formatDateTime(row.node.match?.ScheduledStartDateTime) || 'TBD')}</td>
            <td>${escapeHtml(row.info.opponent)}</td>
            <td>${escapeHtml(stageText(row.node))}</td>
            <td>${escapeHtml(row.info.label)}</td>
            <td>${escapeHtml(formatTeamSetScores(row.sets) || '-')}</td>
        </tr>`).join('');
    const pools = teamSeedFinishes(them).map(item => `<tr>
            <td>${escapeHtml(item.pool.poolLabel)}<br><span class="abv-muted">${escapeHtml(performanceGroupLabel(item.pool))}</span></td>
            <td class="num">${item.seed ? `${ordinal(item.seed)} of ${item.size}` : '-'}</td>
            <td class="num">${item.finish ? ordinal(item.finish) : 'in progress'}</td>
        </tr>`).join('');

    canvas.innerHTML = `<div class="abv-list-view">
            <div class="abv-journey-head">
                <div><h2>${escapeHtml(them.name)}</h2><p>${escapeHtml(them.clubName)}${us ? `, scouted for ${escapeHtml(us.name)}` : ''}</p></div>
                <div class="abv-head-actions">${picker}</div>
            </div>
            ${pendingNoteHtml()}
            ${why}
            ${liveStatusHtml(them)}
            ${comparison}
            ${headToHead}
            ${common}
            <section class="abv-section"><h3>Their results</h3>${notable}
                ${themProfile.rows.length ? tableHtml(['Time', 'Opponent', 'Stage', 'Result', 'Sets (their side first)'], resultRows) : emptyHtml('No matches yet.')}
            </section>
            ${pools ? `<section class="abv-section"><h3>Their pools</h3>${tableHtml(['Pool', numCol('Seed'), numCol('Finish')], pools)}</section>` : ''}
        </div>`;
    if (detail) {
        detail.innerHTML = `<h3>Scouting ${escapeHtml(them.name)}</h3>
                <p class="abv-muted">${escapeHtml(them.clubName)}</p>
                <h4>Picker</h4><p>Next and scheduled opponents come from ${us ? escapeHtml(us.name) : 'your team'}'s schedule. Possible opponents follow AES's routing: for each place you could finish, the team or pool that fills the other side of that match.</p>
                <h4>On court now</h4><p>AES does not publish live match status, so this is based on the schedule and on results not yet posted.</p>
                <h4>Best win, worst loss</h4><p>Judged by each opponent's record excluding its games against ${escapeHtml(them.name)}.</p>`;
    }
}

/* ---------- Outlook (Standings & Outlook, Match Day) ---------- */

function outlookSectionHtml(team) {
    const outlook = teamOutlook(team);
    if (!outlook) return '';
    if (!outlook.paths.length) {
        return '<section class="abv-section"><h3>Outlook</h3><p class="abv-muted">AES has not published where the current round leads yet.</p></section>';
    }
    const lines = outlookLines(outlook);
    const rounds = [...new Set(outlook.groups.map(group => group.dest.round).filter(Boolean))];
    const range = outlook.groups.length
        ? `${rounds.length === 1 ? `${rounds[0]}: ` : 'Possible destinations: '}${outlook.groups.map(group => destinationLabel(group.dest, { withRound: rounds.length !== 1 })).join(', ')} (best to worst)`
        : '';
    const twoWay = outlook.paths.every(path => path.outcomes.length === 2 && path.outcomes.some(outcome => outcome.branch === 'win'));
    const destText = outcome => (outcome ? `${destinationLabel(outcome.dest, { withRound: false })}${outcome.dest.poolName ? `, ${outcome.dest.poolName}` : ''}` : '-');
    const rows = outlook.paths.map(path => {
        const reachable = outlook.possiblePlaces.includes(path.place);
        const next = path.via.match && Number.isFinite(path.via.match.start)
            ? `${escapeHtml(path.via.playName)}<br><span class="abv-muted">${escapeHtml(formatTime(path.via.match.start))}, ${escapeHtml(path.via.match.court || 'court TBD')}</span>`
            : escapeHtml(path.via.playName);
        const finish = path.place == null
            ? 'This match'
            : `${ordinal(path.place)}${outlook.finish === path.place ? ' (final)' : ''}${reachable ? '' : '<br><span class="abv-muted">no longer possible</span>'}`;
        const rowClass = !reachable ? 'unreachable' : outlook.finish === path.place ? 'selected-team' : '';
        if (twoWay) {
            const win = path.outcomes.find(outcome => outcome.branch === 'win');
            const lose = path.outcomes.find(outcome => outcome.branch === 'lose');
            return `<tr class="${rowClass}"><td>${finish}</td><td>${next}</td><td>${escapeHtml(destText(win))}</td><td>${escapeHtml(destText(lose))}</td></tr>`;
        }
        const then = path.outcomes.map(outcome => `${outcome.branch ? `${escapeHtml(outcome.branch)}: ` : ''}${escapeHtml(destText(outcome))}`).join('<br>');
        return `<tr class="${rowClass}"><td>${finish}</td><td>${next}</td><td>${then}</td></tr>`;
    }).join('');
    const headers = twoWay ? ['Finish', 'Next', 'If you win', 'If you lose'] : ['Finish', 'Next', 'Then'];
    const stageName = outlook.stage.kind === 'pool' ? `${outlook.stage.pool.groupName} ${outlook.stage.pool.poolLabel}` : 'the current bracket';
    return `<section class="abv-section"><h3>Outlook from ${escapeHtml(stageName)}</h3>
            ${lines.length ? `<div class="abv-scenario-summary">${lines.map(escapeHtml).join('<br>')}</div>` : ''}
            ${range ? `<p class="abv-note">${escapeHtml(range)}</p>` : ''}
            ${tableHtml(headers, rows)}
            <p class="abv-note">Routes come from AES's published schedule. Destinations are ranked by the results that reach them, not by group names.${outlook.reseed ? ' AES marks some of these routes as pending a reseed, so they can still change.' : ''}</p>
        </section>`;
}

function likelyOpponentsHtml(team) {
    const options = upcomingOpponents(team);
    if (!options.length) return '';
    const labels = { next: 'Next', scheduled: 'Scheduled', possible: 'Possible' };
    const shown = options.slice(0, 16);
    const rows = shown.map(option => `<tr>
            <td>${escapeHtml(option.team.name)}<br><span class="abv-muted">${labels[option.group]}</span></td>
            <td>${escapeHtml(option.reasons.slice(0, 2).join('; '))}${option.reasons.length > 2 ? '; and more' : ''}</td>
            <td>${scoutButtonHtml(option.team)}</td>
        </tr>`).join('');
    return `<section class="abv-section"><h3>Likely next opponents</h3>${tableHtml(['Team', 'Why', ''], rows)}
            ${options.length > shown.length ? `<p class="abv-note">${options.length - shown.length} more in the Scouting picker.</p>` : ''}
        </section>`;
}

function outlookLineHtml(team) {
    const lines = outlookLines(teamOutlook(team));
    return lines.length
        ? `<p class="abv-outlook-line"><strong>Outlook:</strong> ${escapeHtml(lines[0])} <button type="button" class="abv-link-button" data-view="performance">See outlook</button></p>`
        : '';
}

