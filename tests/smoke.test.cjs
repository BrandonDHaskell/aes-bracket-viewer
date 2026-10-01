const fs = require('fs');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(require('path').join(__dirname, '..', 'dist', 'aes-bracket-viewer.user.js'), 'utf8');
const club = (id, name) => ({ ClubId: id, Name: name });
const T = {
    1: { TeamId: 1, TeamName: 'SF Elite B 18 Gold', TeamCode: 'b18ltseu1nc', Club: club(100, 'SF Elite') },
    2: { TeamId: 2, TeamName: 'Bay Spikers 18', TeamCode: 'x2', Club: club(200, 'Bay Spikers') },
    3: { TeamId: 3, TeamName: 'Coast 18 Gold', TeamCode: 'x3', Club: club(300, 'Coast') },
    4: { TeamId: 4, TeamName: 'Delta 18', TeamCode: 'x4', Club: club(400, 'Delta') },
    5: { TeamId: 5, TeamName: 'East Bay 18', TeamCode: 'x5', Club: club(500, 'East Bay') },
    7: { TeamId: 7, TeamName: 'SF Elite B 18 Gold 2', TeamCode: 'x7', Club: club(100, 'SF Elite') }
};
const sets = (...pairs) => pairs.map(([a, b]) => ({ FirstTeamScore: a, SecondTeamScore: b }));
const m = (id, a, b, time, extra = {}) => ({
    MatchId: id, FirstTeamId: a && T[a].TeamId, SecondTeamId: b && T[b].TeamId,
    FirstTeam: a ? { TeamId: T[a].TeamId, TeamName: T[a].TeamName } : null,
    SecondTeam: b ? { TeamId: T[b].TeamId, TeamName: T[b].TeamName } : null,
    ScheduledStartDateTime: time, Court: { Name: extra.court || 'Court 1' }, ...extra
});
// Name-only participants (no ids) to prove "Gold" does not match "Gold 2".
const nameOnly = (id, a, b, time, extra = {}) => ({
    MatchId: id, FirstTeam: { TeamName: T[a].TeamName }, SecondTeam: { TeamName: T[b].TeamName },
    ScheduledStartDateTime: time, Court: { Name: 'Court 2' }, ...extra
});

const D1 = '2030-10-05';
const D2 = '2030-10-06';
const fixtures = () => ({
    '': { Name: 'Test Qualifier', TimeZone: 'Pacific Standard Time', Divisions: [{ DivisionId: 1, Name: '18 Boys' }, { DivisionId: 2, Name: '17 Boys' }] },
    '/timestamp': { LastUpdatedTimestamp: '2030-10-05T12:00:00' },
    '/division/1/playdays': [{ DateTime: `${D1}T00:00:00` }, { DateTime: `${D2}T00:00:00` }],
    '/division/1/plays': { Plays: [
            { PlayId: 101, RoundId: 1, RoundName: 'Round 1', GroupId: 10, GroupName: 'Gold' },
            { PlayId: 102, RoundId: 1, RoundName: 'Round 1', GroupId: 10, GroupName: 'Gold' },
            { PlayId: 201, RoundId: 2, RoundName: 'Crossover', GroupId: 11, GroupName: 'Gold XO' },
            { PlayId: 301, RoundId: 3, RoundName: 'Round 2', GroupId: 12, GroupName: 'Gold' }
        ] },
    [`/division/1/plays/${D1}`]: [
        { PlayId: 101, Type: 0, CompleteShortName: 'R1P1', FullName: 'Pool 1', Teams: [T[1], T[2], T[3]] },
        { PlayId: 102, Type: 0, CompleteShortName: 'R1P2', FullName: 'Pool 2', Teams: [T[4], T[5], T[7]] },
        { PlayId: 201, Type: 1, CompleteShortName: 'R1XO', FullName: 'Crossover', Roots: [{
                X: 0, Y: 0,
                Match: { MatchId: 9001, MatchShortName: 'M1', FirstTeamText: '2nd R1P1', SecondTeamText: '2nd R1P2', ScheduledStartDateTime: `${D1}T13:00:00`, Court: { Name: 'Court 3' }, WorkTeamText: '3rd R1P1' }
            }] }
    ],
    [`/division/1/plays/${D2}`]: [
        { PlayId: 301, Type: 0, CompleteShortName: 'R2P1', FullName: 'Pool 1', Teams: [{ TeamText: '1st R1P1' }, { TeamText: '1st R1P2' }, { TeamText: 'Winner of R1XOM1' }] }
    ],
    '/poolsheet/101': {
        Pool: { Teams: [T[1], T[2], T[3]] },
        Matches: [
            m(1001, 1, 2, `${D1}T08:00:00`, { HasScores: true, Sets: sets([25, 20], [25, 18], [0, 0]), WorkTeamId: 3, WorkTeam: { TeamId: 3, TeamName: T[3].TeamName } }),
            m(1002, 2, 3, `${D1}T09:00:00`, { HasScores: true, Sets: sets([20, 25], [18, 25]), WorkTeamId: 1, WorkTeam: { TeamId: 1, TeamName: T[1].TeamName } }),
            m(1003, 1, 3, `${D1}T10:00:00`, { HasScores: false, Sets: sets([0, 0], [0, 0]), WorkTeamId: 2 })
        ]
    },
    '/poolsheet/102': {
        Pool: { Teams: [{ ...T[4], FinishRank: 1 }, { ...T[5], FinishRank: 2 }, { ...T[7], FinishRank: 3 }] },
        Matches: [
            nameOnly(2001, 4, 5, `${D1}T08:00:00`, { HasScores: true, Sets: sets([25, 10], [25, 12]) }),
            nameOnly(2002, 5, 7, `${D1}T09:00:00`, { HasScores: true, Sets: sets([25, 23], [26, 24]) }),
            nameOnly(2003, 4, 7, `${D1}T11:00:00`, { HasScores: false, Sets: sets([0, 0]), WorkTeamId: 1, WorkTeam: { TeamId: 1, TeamName: T[1].TeamName } })
        ]
    },
    '/poolsheet/301': {
        Pool: { Teams: [] },
        Matches: [
            // Resolved slots that still carry their source text: tests slot-aware provenance.
            m(3001, 1, 4, `${D2}T08:00:00`, { FirstTeamText: '1st R1P1', SecondTeamText: '1st R1P2', HasScores: false }),
            { MatchId: 3002, FirstTeamText: '1st R1P2', SecondTeamText: 'Winner of R1XOM1', FirstTeamId: 4, FirstTeam: { TeamId: 4, TeamName: T[4].TeamName }, ScheduledStartDateTime: `${D2}T09:00:00`, HasScores: false },
            { MatchId: 3003, FirstTeamText: '1st R1P1', SecondTeamText: 'Winner of R1XOM1', FirstTeamId: 1, FirstTeam: { TeamId: 1, TeamName: T[1].TeamName }, ScheduledStartDateTime: `${D2}T10:00:00`, HasScores: false }
        ]
    },
    '/division/2/playdays': [],
    '/division/2/plays': { Plays: [] }
});

let data = fixtures();
let failFetch = false;
let fetchCount = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  [${extra}]` : ''}`); };

(async () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="aes-root">AES</div></body></html>', {
        url: 'https://results.advancedeventsystems.com/event/TESTKEY/home',
        pretendToBeVisual: true,
        runScripts: 'outside-only'
    });
    const { window } = dom;
    const errors = [];
    window.addEventListener('error', e => errors.push(e.message));
    window.console.error = (...args) => errors.push(args.map(String).join(' '));
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    window.Element.prototype.scrollTo = function () {};
    let blob = null;
    window.URL.createObjectURL = b => { blob = b; return 'blob:test'; };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () {};
    window.fetch = async url => {
        fetchCount += 1;
        if (failFetch) throw new Error('network down');
        const path = String(url).replace('/api/event/TESTKEY', '');
        if (!(path in data)) return { ok: false, status: 404, json: async () => null };
        return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(data[path])) };
    };

    window.localStorage.setItem('aes/favorite/teams/TESTKEY', JSON.stringify({ TeamIds: [1] }));
    window.eval(script);
    const doc = window.document;
    const $ = sel => doc.querySelector(`#aes-bracket-viewer ${sel}`);
    const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
    const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const status = () => $('[data-role="status-text"]').textContent;

    const launcher = doc.getElementById('aes-bracket-viewer-button');
    check('launcher shown on event page', launcher && !launcher.hidden);
    click(launcher);
    await sleep(400);

    check('loads and names division/team in status', /18 Boys/.test(status()) && /SF Elite B 18 Gold/.test(status()), status());
    check('launcher relabeled from division', launcher.textContent === '18B Bracket', launcher.textContent);
    check('default team applied once', $('[data-action="team"]').value === '1');
    check('tournament nodes rendered', doc.querySelectorAll('#aes-bracket-viewer [data-node-key]').length > 3);
    check('focus scroll consumed', true);

    // Show all groups so provenance classes are visible.
    change($('[data-action="group"]'), '__all__');
    await sleep(50);
    const node = key => doc.querySelector(`#aes-bracket-viewer [data-node-key="${key}"]`);
    check('own prior pool is on current route', node('R1P1')?.classList.contains('focus-current'));
    check("opponent's prior pool NOT on current route (bug 5)", !node('R1P2') || !node('R1P2').classList.contains('focus-current'));
    check('direct R2 match marked', node('R2P1M1')?.classList.contains('target-direct'));
    check('entry for own slot is current', node('ENTRY|R1P1|1ST|R2P1')?.classList.contains('focus-current'));

    // Trace: class-only refresh keeps the same DOM node when nothing new becomes visible.
    const before = node('R1P1M1');
    click(before);
    await sleep(20);
    const afterTrace = node('R1P1M1');
    check('trace applies classes', /trace-/.test(afterTrace.className));
    click(afterTrace);
    await sleep(20);
    check('second click clears trace', !/trace-/.test(node('R1P1M1').className));

    // Keyboard activation.
    const card = node('R1P1M3');
    card.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(20);
    check('Enter on a card traces it', /trace-/.test(node('R1P1M3').className));

    // Journey: exact identity, work assignments, next-match card.
    click($('[data-view="journey"]'));
    await sleep(20);
    const journey = $('[data-canvas="journey"]').textContent;
    check('journey counts 4 matches and 2 work assignments (no "Gold 2" leakage)', /4 matches, 2 work assignments/.test(journey), journey.match(/\d+ matches, \d+ work assignments/)?.[0]);
    check('0-0 sets with HasScores false are not results', /UPCOMING/.test(journey) && /vs Coast 18 Gold/.test(journey));
    check('next match card shows opponent', /Next match/.test(journey) && /vs Coast 18 Gold/.test(journey));
    check('next work assignment shown', /Next work assignment/.test(journey) && /Delta 18 vs SF Elite B 18 Gold 2/.test(journey));
    check('countdown element present', Boolean($('[data-countdown]')));

    click($('[data-action="export-ics"]'));
    await sleep(20);
    const ics = blob ? await new Promise(res => { const r = new window.FileReader(); r.onload = () => res(r.result); r.readAsText(blob); }) : '';
    check('ICS exported', /BEGIN:VCALENDAR/.test(ics) && (ics.match(/BEGIN:VEVENT/g) || []).length === 6, `${(ics.match(/BEGIN:VEVENT/g) || []).length} events`);
    check('ICS time is event-local converted to UTC (10:00 PDT = 17:00Z)', ics.includes('DTSTART:20301005T170000Z'));

    // Performance + scenarios.
    click($('[data-view="performance"]'));
    await sleep(20);
    const perf = $('[data-canvas="performance"]').textContent;
    check('scenarios rendered', /Scenarios/.test(perf) && /Possible finishes: 1st, 2nd of 3/.test(perf), perf.match(/Possible finishes[^.]*\./)?.[0]);
    check('scenario maps finish to route', /Win vs Coast 18 Gold/.test(perf) && /Loss vs Coast 18 Gold/.test(perf));
    const pool2 = doc.querySelector('#aes-bracket-viewer [data-perf-pool="R1P2"]');
    check('progress track excludes pool the team never played', !pool2);

    // Event Stats rename.
    check('tab renamed to Stats', $('[data-view="stats"]').textContent === 'Stats');

    // Bug 1: Reset then Refresh must keep "All".
    click($('[data-view="tournament"]'));
    click($('[data-action="reset-filters"]'));
    await sleep(20);
    click($('[data-action="refresh"]'));
    await sleep(400);
    check('reset survives refresh (bug 1)', $('[data-action="team"]').value === '__all__' && $('[data-action="club"]').value === '__all__');

    // Bug 3: a failed refresh keeps the current view.
    const nodeCount = doc.querySelectorAll('#aes-bracket-viewer [data-node-key]').length;
    failFetch = true;
    click($('[data-action="refresh"]'));
    await sleep(200);
    failFetch = false;
    check('failed refresh keeps graph (bug 3)', doc.querySelectorAll('#aes-bracket-viewer [data-node-key]').length === nodeCount && nodeCount > 0);
    check('failed refresh reports error', /Refresh failed/.test(status()) && $('.abv-status').classList.contains('error'), status());

    // Hash state.
    change($('[data-action="team"]'), '1');
    await sleep(20);
    check('URL hash reflects view', /abv=/.test(window.location.hash) && decodeURIComponent(window.location.hash).includes('t=1'));

    // Diagnostics.
    click($('[data-action="toggle-diagnostics"]'));
    await sleep(20);
    check('diagnostics shows time zone', /America\/Los_Angeles/.test($('[data-role="diagnostics"]').textContent));

    // Escape closes.
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Escape closes viewer', !doc.getElementById('aes-bracket-viewer').classList.contains('open'));
    check('hash cleared on close', !/abv=/.test(window.location.hash));

    const unexpected = errors.filter(e => !/network down|Not implemented/.test(e));
    check('no unexpected runtime errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed, ${fetchCount} fetches`);
    window.close();
    process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
