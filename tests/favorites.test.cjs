// "My teams" behavior: AES favorites, saved teams, division lookup, switcher, starter link.
const fs = require('fs'); const { JSDOM } = require('jsdom');
const src = fs.readFileSync(__dirname + '/smoke.test.cjs', 'utf8');
eval(src.slice(src.indexOf('const club ='), src.indexOf('let data = fixtures();')) + '; global.fixtures = fixtures;');
const script = fs.readFileSync(require('path').join(__dirname, '..', 'dist', 'aes-bracket-viewer.user.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PREFS = 'aes-bracket-viewer:prefs:v2';
const FAV = 'aes/favorite/teams/TESTKEY';
// Division 2 ("17 Boys") with team 9 in pool D2P1.
function twoDivisions() {
    const data = fixtures();
    const t9 = { TeamId: 9, TeamName: 'North 17 Blue', TeamCode: 'b17north1nc', Club: { ClubId: 900, Name: 'North' } };
    const t10 = { TeamId: 10, TeamName: 'South 17 Red', TeamCode: 'b17south1nc', Club: { ClubId: 901, Name: 'South' } };
    Object.assign(data, {
        '/division/2/playdays': [{ DateTime: '2030-10-05T00:00:00' }],
        '/division/2/plays': { Plays: [{ PlayId: 501, RoundId: 7, RoundName: 'Round 1', GroupId: 70, GroupName: 'Gold' }] },
        '/division/2/plays/2030-10-05': [{ PlayId: 501, Type: 0, CompleteShortName: 'D2P1', FullName: 'Pool 1', Teams: [t9, t10] }],
        '/poolsheet/501': { Pool: { Teams: [t9, t10] }, Matches: [{ MatchId: 5001, FirstTeamId: 9, SecondTeamId: 10, FirstTeamName: 'North 17 Blue', SecondTeamName: 'South 17 Red', ScheduledStartDateTime: '2030-10-05T08:00:00', Court: { Name: 'Court 9' }, HasScores: false }] }
    });
    return data;
}
async function boot({ favorites = null, prefs = null, hash = '', data = twoDivisions() } = {}) {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: `https://results.advancedeventsystems.com/event/TESTKEY/home${hash}`, pretendToBeVisual: true, runScripts: 'outside-only' });
    const w = dom.window; const errors = []; const calls = [];
    w.console.error = (...a) => errors.push(a.join(' ')); w.console.warn = () => {};
    w.matchMedia = () => ({ matches: false }); w.Element.prototype.scrollTo = () => {};
    if (favorites) w.localStorage.setItem(FAV, JSON.stringify({ TeamIds: favorites }));
    if (prefs) w.localStorage.setItem(PREFS, JSON.stringify(prefs));
    w.fetch = async u => { const p = String(u).replace('/api/event/TESTKEY', ''); calls.push(p); return p in data ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(data[p])) } : { ok: false, status: 404, json: async () => null }; };
    w.eval(script);
    const d = w.document;
    if (!hash) d.getElementById('aes-bracket-viewer-button').click();
    await sleep(350);
    const q = s => d.querySelector('#aes-bracket-viewer ' + s);
    return { w, d, q, errors, calls, prefs: () => JSON.parse(w.localStorage.getItem(PREFS) || '{}') };
}
(async () => {
    const out = [];
    const check = (n, ok, x = '') => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? `  [${x}]` : ''}`); };
    const bar = q => q('[data-role="my-teams"]').textContent.replace(/\s+/g, ' ').trim();
    const teamSel = q => q('[data-action="team"]').value;

    // 1. Fresh install, nothing starred: no club default at all.
    let t = await boot();
    check('fresh install: no team selected', teamSel(t.q) === '__all__');
    check('fresh install: prompt to star teams on AES', /Star your teams on AES/.test(bar(t.q)), bar(t.q));
    check('fresh install: loads first division, no SF Elite default', /18 Boys/.test(t.q('[data-role="status-text"]').textContent));
    t.w.close();

    // 2. Starred team in the first division is selected.
    t = await boot({ favorites: [4] });
    check('favorite in loaded division is selected', teamSel(t.q) === '4');
    check('bar shows the favorite', /My teams Delta 18/.test(bar(t.q)), bar(t.q));
    check('team select groups "My teams" first', t.q('[data-action="team"] optgroup')?.label === 'My teams');
    check('favorite remembered by code for later events', (t.prefs().savedTeams || []).some(s => s.code === 'x4'));
    t.w.close();

    // 3. First favorite plays in another division: that division opens automatically.
    t = await boot({ favorites: [9, 1] });
    check('opens the division of the first favorite (17 Boys)', /17 Boys/.test(t.q('[data-role="status-text"]').textContent), t.q('[data-role="status-text"]').textContent.slice(0, 40));
    check('selects that favorite', teamSel(t.q) === '9');
    check('division lookup read 17 Boys rosters only', t.calls.filter(c => /division\/2\/plays\/2030/.test(c)).length >= 1);
    await sleep(300);
    check('other-division favorite shown with its division', /SF Elite B 18 Gold 18B/.test(bar(t.q)), bar(t.q));
    const chip = t.q('[data-action="pick-team"][data-team-id="1"]');
    chip.dispatchEvent(new t.w.MouseEvent('click', { bubbles: true }));
    await sleep(400);
    check('chip switches division and selects the team', /18 Boys/.test(t.q('[data-role="status-text"]').textContent) && teamSel(t.q) === '1', `${teamSel(t.q)}`);
    const lookups = t.calls.filter(c => /playdays/.test(c)).length;
    const cachedPrefs = JSON.parse(JSON.stringify(t.prefs()));
    t.w.close();
    // Second visit: lookup cached in prefs, no roster probing.
    t = await boot({ favorites: [9, 1], prefs: cachedPrefs });
    const probes = t.calls.filter(c => /^\/division\/2\//.test(c)).length;
    check('second visit: no roster lookups (cached)', probes === 0, `division 2 calls ${probes}, first visit playdays calls ${lookups}`);
    check('second visit: reopens the division last chosen at this event', /18 Boys/.test(t.q('[data-role="status-text"]').textContent) && teamSel(t.q) === '1');
    t.w.close();

    // 4. Upgrading from v2.2: the old single team becomes a saved team.
    t = await boot({ prefs: { teamCode: 'b18ltseu1nc', teamName: 'SF Elite B 18 Gold', divisionName: '18 Boys', notify: false } });
    check('legacy team migrates to saved teams and is selected', teamSel(t.q) === '1' && /My teams \(saved\)/.test(bar(t.q)), bar(t.q));
    check('legacy keys removed', !('teamCode' in t.prefs()) && t.prefs().savedTeams?.[0]?.code === 'b18ltseu1nc');

    // 5. Starring a team while the viewer is open updates within a second.
    t.w.localStorage.setItem(FAV, JSON.stringify({ TeamIds: [3] }));
    await sleep(1300);
    check('starring on AES updates the bar live', /My teams Coast 18 Gold/.test(bar(t.q)) && !/\(saved\)/.test(bar(t.q)), bar(t.q));
    check('selected team is not yanked away', teamSel(t.q) === '1');
    t.w.close();

    // 6. Starter link adds saved teams and opens the viewer.
    t = await boot({ hash: '#abv=' + encodeURIComponent('my=x3,x5') });
    check('starter link saves both codes', ['x3', 'x5'].every(code => (t.prefs().savedTeams || []).some(s => s.code === code)));
    check('starter link selects the first team', teamSel(t.q) === '3');
    check('starter link notice shown', /Added 2 teams from a shared link/.test(t.q('[data-role="status-text"]').textContent), t.q('[data-role="status-text"]').textContent);
    t.q('[data-action="clear-saved-teams"]').click();
    check('clear saved teams empties the list', (t.prefs().savedTeams || []).length === 0 && /Star your teams on AES/.test(bar(t.q)));
    t.w.close();

    // 7. All my teams on Match Day: overlaps between teams are flagged.
    t = await boot({ favorites: [1, 7] });
    t.q('[data-view="journey"]').click();
    const all = t.q('[data-action="match-day-all"]');
    check('"All my teams (2)" toggle offered', /All my teams \(2\)/.test(all?.parentElement.textContent || ''));
    all.checked = true; all.dispatchEvent(new t.w.Event('change', { bubbles: true }));
    const warn = t.q('[data-canvas="journey"] .abv-warning')?.textContent.replace(/\s+/g, ' ') || '';
    check('overlap flagged: one team works while the other plays', /overlap/.test(warn) && /SF Elite B 18 Gold works .* while SF Elite B 18 Gold 2 plays|SF Elite B 18 Gold 2 plays .* while SF Elite B 18 Gold works/.test(warn), warn.slice(0, 160));
    check('rows carry team labels', t.d.querySelectorAll('#aes-bracket-viewer .abv-tl-team').length > 0);
    check('no runtime errors', [t].every(x => x.errors.length === 0), t.errors.slice(0, 2).join(' | '));
    t.w.close();
    console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
    process.exit(out.every(Boolean) ? 0 : 1);
})();
