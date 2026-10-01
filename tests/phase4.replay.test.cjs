// Phase 4 (Outlook) regression test against the real AES capture, including scenarios created
// by posting results into a private copy of it. Run with TZ=America/Los_Angeles.
const boot = require('./replay.cjs');
const at = (h, m) => new Date(`2026-10-17T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-07:00`).getTime();
const US = 150886;
// Post results into Bronze B Pool 2. `winnerOf(firstId, secondId)` returns the winning team id.
const postPool = winnerOf => routes => {
    const key = Object.keys(routes).find(k => k.startsWith('/poolsheet/') && routes[k]?.Pool?.CompleteShortName === 'Lg2Oct17-18Bronze BP2');
    for (const m of routes[key].Matches) {
        const firstWon = winnerOf(m.FirstTeamId, m.SecondTeamId) === m.FirstTeamId;
        Object.assign(m, { HasScores: true, TypeOfOutcome: firstWon ? 1 : 2, FirstTeamWon: firstWon, SecondTeamWon: !firstWon });
        m.Sets = [0, 1].map(() => ({ FirstTeamScore: firstWon ? 25 : 20, SecondTeamScore: firstWon ? 20 : 25, ScoreText: '', IsDecidingSet: false }))
            .concat([{ FirstTeamScore: null, SecondTeamScore: null, ScoreText: '', IsDecidingSet: true }]);
    }
    return routes;
};
const BAVC = 142419;
const usFirst = (a, b) => (a === US || b === US ? US : Math.max(a, b));
const bavcFirstUsSecond = (a, b) => (a === BAVC || b === BAVC ? BAVC : (a === US || b === US ? US : Math.max(a, b)));
(async () => {
    const results = [];
    const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== '' ? `  [${got}]` : ''}`); };
    const outlook = doc => {
        const section = [...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="performance"] section')].find(s => /^Outlook/.test(s.querySelector('h3')?.textContent || ''));
        return {
            title: section?.querySelector('h3').textContent || '',
            lines: (section?.querySelector('.abv-scenario-summary')?.innerHTML || '').split('<br>'),
            rows: [...(section?.querySelectorAll('tbody tr') || [])].map(tr => ({ cls: tr.className, text: [...tr.cells].map(c => c.innerHTML.replace(/<br>/g, ' / ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).join(' | ') }))
        };
    };

    // A. Before pool play.
    let { w, doc, errors } = await boot({ now: at(7, 0) });
    let q = s => doc.querySelector('#aes-bracket-viewer ' + s);
    q('[data-view="performance"]').click();
    let o = outlook(doc);
    check('A: outlook titled from Bronze B Pool 2', o.title === 'Outlook from Bronze B Pool 2', o.title);
    check('A: clinch line', o.lines[0] === 'Win all 3 remaining pool matches to clinch Bronze A (Lg 3 Nov 14-15).', o.lines[0]);
    check('A: how else to reach it', o.lines[1] === 'Bronze A comes from a 1st-place finish, or a 2nd-place finish and a crossover win.', o.lines[1]);
    check('A: worst case', o.lines[2] === 'Worst case: Bronze C.', o.lines[2]);
    check('A: route table matches AES (4 rows)', o.rows.length === 4
        && o.rows[0].text === '1st | Lg 2 Oct 17-18 XO Bronze B 1 v 1 / 2:00 PM, Oakland CC Ct.7 | Bronze A, Pool 2 | Bronze A, Pool 1'
        && o.rows[1].text.endsWith('| Bronze A, Pool 2 | Bronze B, Pool 2')
        && o.rows[2].text.endsWith('| Bronze B, Pool 1 | Bronze C, Pool 1')
        && o.rows[3].text.endsWith('| Bronze C, Pool 2 | Bronze C, Pool 1'), o.rows.map(r => r.text).join(' || '));
    const likely = [...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="performance"] section')].find(s => /Likely next opponents/.test(s.textContent));
    check('A: likely opponents list with Scout buttons (7)', likely?.querySelectorAll('[data-action="scout"]').length === 7);
    q('[data-view="journey"]').click();
    check('A: Match Day outlook line', /^Outlook: Win all 3 remaining pool matches to clinch Bronze A \(Lg 3 Nov 14-15\)\. See outlook$/.test(q('.abv-outlook-line')?.textContent.replace(/\s+/g, ' ').trim() || ''));
    q('.abv-outlook-line [data-view="performance"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('A: "See outlook" opens Standings & Outlook', q('[data-view="performance"]').classList.contains('active'));
    q('[data-view="tournament"]').click();
    const likelyNames = [...new Set([...doc.querySelectorAll('#aes-bracket-viewer .n-team.likely')].map(el => el.textContent))];
    check('A: graph marks likely opponents', likelyNames.includes('Bay to Bay 16-Premier') && likelyNames.includes('BAVC 18-2 Boys') && !likelyNames.includes('SF Elite B 18 Gold'), likelyNames.join(', '));
    check('A: no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    w.close();

    // B. Pool finished, SF Elite 1st.
    ({ w, doc, errors } = await boot({ now: at(13, 30), mutate: postPool(usFirst) }));
    q = s => doc.querySelector('#aes-bracket-viewer ' + s);
    q('[data-view="performance"]').click();
    o = outlook(doc);
    check('B: 1st locks Bronze A', o.lines[0] === 'Finished 1st: Bronze A (Lg 3 Nov 14-15) is locked in, whatever happens in the crossover.', o.lines[0]);
    check('B: 1st row marked final, others no longer possible', /\(final\)/.test(o.rows[0]?.text) && o.rows.slice(1).every(r => r.cls === 'unreachable'));
    w.close();

    // C. Pool finished, SF Elite 2nd (BAVC 18-2 wins the pool).
    ({ w, doc, errors } = await boot({ now: at(13, 30), mutate: postPool(bavcFirstUsSecond) }));
    q = s => doc.querySelector('#aes-bracket-viewer ' + s);
    q('[data-view="performance"]').click();
    o = outlook(doc);
    check('C: 2nd depends on the crossover', o.lines[0] === 'Finished 2nd: win the crossover for Bronze A (Lg 3 Nov 14-15); a loss means Bronze B (Lg 3 Nov 14-15).', o.lines[0]);
    w.close();

    // D. AES has placed SF Elite in the 2 v 2 crossover: the outlook follows that match.
    const placeInCrossover = routes => {
        postPool(bavcFirstUsSecond)(routes);
        const plays = routes['/division/221872/plays/2026-10-17'];
        const match = plays.find(p => p.CompleteShortName === 'Lg2Oct17-18XOBronze B2v2').Roots[0].Match;
        const side = /Bronze BP2/.test(match.FirstTeamText) ? 'First' : 'Second';
        match[`${side}Team`] = { TeamId: US, TeamName: 'SF Elite B 18 Gold' };
        match[`${side}TeamText`] = 'SF Elite B 18 Gold (NC)';
        return routes;
    };
    ({ w, doc, errors } = await boot({ now: at(13, 30), mutate: placeInCrossover }));
    q = s => doc.querySelector('#aes-bracket-viewer ' + s);
    q('[data-view="performance"]').click();
    o = outlook(doc);
    check('D: bracket stage outlook', o.title === 'Outlook from the current bracket' && o.lines[0] === 'Win at 2:00 PM for Bronze A (Lg 3 Nov 14-15); a loss means Bronze B (Lg 3 Nov 14-15).', `${o.title} / ${o.lines[0]}`);
    check('D: no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    w.close();

    // E. Late court marker on the graph at 10:10 (8:00 and 9:00 on Ct.8 unposted).
    ({ w, doc, errors } = await boot({ now: at(10, 10) }));
    const late = [...doc.querySelectorAll('#aes-bracket-viewer .abv-node.court-late')].map(el => el.title);
    check('E: SF Elite 10:00 match marked "court may be late"', late.some(title => /Absolute 18 Silver/.test(title) && /SF Elite B 18 Gold/.test(title)), late.slice(0, 3).join(' | '));
    check('E: legend explains both new markers', /Likely opponent/.test(doc.querySelector('#aes-bracket-viewer [data-detail="tournament"]').textContent) && /Court may be late/.test(doc.querySelector('#aes-bracket-viewer [data-detail="tournament"]').textContent));
    w.close();
    console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
    process.exit(results.every(Boolean) ? 0 : 1);
})();
