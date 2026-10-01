// Phase 1 regression test against the real AES capture. Ground truth comes from truth_phase1.py.
const boot = require('./replay.cjs');
(async () => {
    const results = [];
    const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got ? `  [${got}]` : ''}`); };
    const { w, doc, errors } = await boot();
    const q = s => doc.querySelector('#aes-bracket-viewer ' + s);
    const tabs = [...doc.querySelectorAll('#aes-bracket-viewer [data-view]')].map(b => b.textContent);
    check('tabs renamed', tabs.join('|') === 'Tournament|Match Day|Standings & Outlook|Stats|Scouting', tabs.join('|'));
    q('[data-view="stats"]').click();
    const text = () => q('[data-canvas="stats"]').textContent.replace(/\s+/g, ' ');
    const stat = label => { const card = [...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="stats"] .abv-stat')].find(c => c.querySelector('span')?.textContent === label); return card ? card.querySelector('b').textContent.trim() + ' | ' + (card.querySelector('.abv-stat-sub')?.textContent || '') : null; };
    check('heading says Season stats (4-weekend league)', /Season stats, 18 Boys/.test(text()));
    check('match record 2-8', stat('Match record')?.startsWith('2-8 |'), stat('Match record'));
    check('set record 5-18', stat('Set record')?.startsWith('5-18'), stat('Set record'));
    check('point ratio 0.789 with 414/525 and -111', stat('Point ratio') === '0.789 | 414 scored, 525 allowed (-111)', stat('Point ratio'));
    check('matches left 3', stat('Matches left')?.startsWith('3'), stat('Matches left'));
    check('close sets 3-2', stat('Close sets')?.startsWith('3-2'), stat('Close sets'));
    check('deciding sets 2-1', stat('Deciding sets')?.startsWith('2-1'), stat('Deciding sets'));
    check('after winning set 1: 1-0', stat('After winning set 1')?.startsWith('1-0'), stat('After winning set 1'));
    check('after losing set 1: 1-8', stat('After losing set 1')?.startsWith('1-8'), stat('After losing set 1'));
    check("opponents' record 38-52", stat("Opponents' record")?.startsWith('38-52'), stat("Opponents' record"));
    check('wins vs .500+ teams 0 of 4', stat('Wins vs .500+ teams')?.startsWith('0 of 4'), stat('Wins vs .500+ teams'));
    const t = text();
    const cells = () => [...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="stats"] tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim()).join('|')).join('\n');
    const rows = cells();
    check('margins: close 3/2, competitive 1/6, decisive 1/10', rows.includes('Close|3 or fewer points (2 in a 15-point set)|3|2|22%') && rows.includes('Competitive|4 to 6 points (3 to 4)|1|6|30%') && rows.includes('Decisive|7 or more points (5 or more)|1|10|48%'));
    check('by match of day: 1-2, 0-3, 0-3, 1-0', ['1st match of the day|1-2', '2nd match of the day|0-3', '3rd match of the day|0-3', '4th match of the day|1-0'].every(r => rows.includes(r)));
    check('seed vs finish table present', /Seed vs\. finish/.test(t) && /of 3/.test(t), (t.match(/Seed vs\. finish.{0,200}/) || [''])[0]);
    check('by-weekend table lists 3 weekends', /By weekend/.test(t) && /Sep 12-13/.test(t) && /Sep 26-27/.test(t) && /Oct 17-18/.test(t));
    check('team-side sets: XO loss shows 15-25, 14-25', /Academy Boys West 16-1 .{0,80}LOSS 15-25, 14-25/.test(t));
    // Weekend scope
    const scope = q('[data-action="stats-scope"]'); scope.value = '2026-09-26'; scope.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('Sep 26-27 scope: 1-3, heading', /Sep 26-27 stats/.test(text()) && stat('Match record')?.startsWith('1-3'), stat('Match record'));
    // CSV
    q('[data-action="export-csv"]').click();
    const csv = await new Promise(r => { const f = new w.FileReader(); f.onload = () => r(f.result); f.readAsText(w.__blob); });
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    check('CSV: header + 4 rows for weekend', lines.length === 5 && lines[0].startsWith('Date,Time,Weekend'), `${lines.length} lines`);
    check('CSV: deciding-set win row', lines.some(l => /Fusion 18 Green,W,25-23 23-25 16-14,2,1,/.test(l)), lines.find(l => /Fusion/.test(l)));
    check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
    process.exit(results.every(Boolean) ? 0 : 1);
})();
