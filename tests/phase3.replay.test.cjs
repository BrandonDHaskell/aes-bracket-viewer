// Phase 3 (Scouting) regression test against the real AES capture. Ground truth: truth_scout.py.
// Run with TZ=America/Los_Angeles.
const boot = require('./replay.cjs');
const at = (h, m) => new Date(`2026-10-17T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-07:00`).getTime();
(async () => {
    const results = [];
    const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== '' ? `  [${got}]` : ''}`); };
    const { w, doc, errors } = await boot({ now: at(7, 0) });
    const q = s => doc.querySelector('#aes-bracket-viewer ' + s);
    const text = () => q('[data-canvas="scouting"]').textContent.replace(/\s+/g, ' ');
    const compareRows = () => Object.fromEntries([...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="scouting"] table')].find(t => /Match record/.test(t.textContent))?.tBodies[0].rows ? [...[...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="scouting"] table')].find(t => /Match record/.test(t.textContent)).tBodies[0].rows].map(r => [r.cells[0].textContent, [r.cells[1].textContent, r.cells[2].textContent]]) : []);
    check('Scouting tab added', q('[data-view="scouting"]')?.textContent === 'Scouting');

    // Scout button on Match Day's next-match card.
    q('[data-view="journey"]').click();
    const scoutBtn = q('.abv-next-cell [data-action="scout"]');
    check('Match Day offers "Scout Bay to Bay 16-Premier"', scoutBtn?.textContent === 'Scout Bay to Bay 16-Premier', scoutBtn?.textContent);
    scoutBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('button opens Scouting on that team', q('[data-view="scouting"]').classList.contains('active') && /^ ?Bay to Bay 16-Premier/.test(q('[data-canvas="scouting"] h2').textContent));
    check('listed as your next opponent with time and court', /Your next opponent: Sat, Oct 17 8:00 AM, Oakland CC Ct\.8/.test(text()), (text().match(/Your next opponent:[^.]*\./) || [''])[0]);

    // Picker groups.
    const groups = [...doc.querySelectorAll('#aes-bracket-viewer [data-action="scout-team"] optgroup')].map(g => `${g.label} (${g.children.length})`);
    console.log('picker groups:', groups.join(', '));
    check('picker: next, scheduled (2), possible, all', groups[0] === 'Next opponent (1)' && groups[1] === 'Also scheduled (2)' && /^Possible next opponents \(\d+\)$/.test(groups[2] || '') && /^All teams/.test(groups[3] || ''));
    const allOptions = [...doc.querySelectorAll('#aes-bracket-viewer [data-action="scout-team"] option')].map(o => o.textContent);
    check('picker excludes your starred teams', !allOptions.some(name => ['SF Elite B 18 Gold', 'Academy Boys West 16-1', 'Club Solano 18B Black', 'Slainte 18-Platinum'].includes(name)));

    // Profile numbers vs ground truth (truth_scout.py).
    let rows = compareRows();
    check('Bay to Bay: 7-3, 15-7, ratio 1.157', rows['Match record']?.[1] === '7-3' && rows['Set record']?.[1] === '15-7' && rows['Point ratio']?.[1] === '1.157', JSON.stringify(rows['Point ratio']));
    check('our column matches Stats (2-8, 5-18, 0.789)', rows['Match record']?.[0] === '2-8' && rows['Set record']?.[0] === '5-18' && rows['Point ratio']?.[0] === '0.789');
    check('no common opponents message', /have not played any of the same teams yet/.test(text()));
    const live = [...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="scouting"] .abv-next-cell')].map(c => [...c.children].map(x => x.textContent.trim()).join(' | '));
    check('live status: next vs SF Elite at 8:00 on Ct.8', live.includes('Next match | vs SF Elite B 18 Gold | Sat, Oct 17, 8:00 AM (in 1h 00m), Oakland CC Ct.8'), live.join(' || '));

    // Switch to BAVC 18-2 Boys (a scheduled opponent with common opponents).
    const picker = q('[data-action="scout-team"]');
    picker.value = String([...picker.options].find(o => o.textContent === 'BAVC 18-2 Boys').value);
    picker.dispatchEvent(new w.Event('change', { bubbles: true }));
    rows = compareRows();
    check('BAVC 18-2: 5-5, 10-11, ratio 0.974', rows['Match record']?.[1] === '5-5' && rows['Set record']?.[1] === '10-11' && rows['Point ratio']?.[1] === '0.974', JSON.stringify([rows['Match record'], rows['Point ratio']]));
    check('common opponents: OMNI 16-1 National and BAVC 17-2 Boys', /Common opponents \(2\)/.test(text()) && /BAVC 17-2 Boys/.test(text()) && /OMNI 16-1 National/.test(text()));
    check('common summary: both 1-1', /SF Elite B 18 Gold went 1-1 .* and BAVC 18-2 Boys went 1-1/.test(text()), (text().match(/Against these teams[^.]*\.[^.]*\.[^.]*\./) || [''])[0]);
    check('listed as scheduled opponent', /Scheduled opponent: Sat, Oct 17 1:00 PM/.test(text()));
    check('best win / worst loss shown', /Best win/.test(text()) || /Worst loss/.test(text()));
    check('hash carries the scouted team', decodeURIComponent(w.location.hash).includes('v=scouting') && decodeURIComponent(w.location.hash).includes('o=142419'), decodeURIComponent(w.location.hash));

    // A possible opponent explains why it is listed.
    const possible = [...doc.querySelectorAll('#aes-bracket-viewer [data-action="scout-team"] optgroup')].find(g => /Possible/.test(g.label));
    const livePicker = q('[data-action="scout-team"]');
    livePicker.value = possible.children[0].value; livePicker.dispatchEvent(new w.Event('change', { bubbles: true }));
    const why = q('[data-canvas="scouting"] .abv-note')?.textContent.replace(/\s+/g, ' ') || '';
    console.log('possible example:', why);
    check('possible opponent explains the route', /^Possible next opponent: if you finish 1st: 1st in Bronze B Pool 1; if you finish 2nd: 2nd in Bronze B Pool 1/.test(why), why.slice(0, 90));

    // Tournament detail offers scout buttons for both teams of a match.
    q('[data-view="tournament"]').click();
    const node = doc.querySelector('#aes-bracket-viewer [data-node-key="Lg2Oct17-18Bronze BP2M1"]');
    node?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const detailButtons = [...doc.querySelectorAll('#aes-bracket-viewer [data-detail="tournament"] [data-action="scout"]')].map(b => b.textContent);
    check('match detail offers Scout for the non-starred team', detailButtons.length === 1 && detailButtons[0] === 'Scout Bay to Bay 16-Premier', detailButtons.join(' | '));
    check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
    process.exit(results.every(Boolean) ? 0 : 1);
})();
