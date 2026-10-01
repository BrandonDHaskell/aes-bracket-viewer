// Phase 2 (Match Day) regression test against the real AES capture, at fixed clock times.
// Run with TZ=America/Los_Angeles so AES's venue-local times match the simulated clock.
const boot = require('./replay.cjs');
const at = (h, m) => new Date(`2026-10-17T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-07:00`).getTime();
(async () => {
    const results = [];
    const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got ? `  [${got}]` : ''}`); };
    let clip = null, printed = null;
    const setup = w => {
        Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async t => { clip = t; } }, configurable: true });
        w.open = () => ({ document: { open() {}, write(h) { printed = h; }, close() {} }, focus() {}, print() {} });
    };
    // 10:10 AM on pool day.
    let { w, doc, errors } = await boot({ now: at(10, 10), setup });
    const q = s => doc.querySelector('#aes-bracket-viewer ' + s);
    q('[data-view="journey"]').click();
    const text = () => q('[data-canvas="journey"]').textContent.replace(/\s+/g, ' ');
    check('defaults to today, Oct 17', q('[data-action="match-day"]').selectedOptions[0].textContent === 'Sat, Oct 17 (today)', q('[data-action="match-day"]').selectedOptions[0].textContent);
    const items = [...doc.querySelectorAll('#aes-bracket-viewer .abv-tl-item')].map(el => el.querySelector('.abv-tl-time').firstChild.textContent + ' ' + (el.classList.contains('work') ? 'work' : 'play'));
    check('timeline: 8 play, 9 work, 10 play, 11 work, 1 play', items.join(', ') === '8:00 AM play, 9:00 AM work, 10:00 AM play, 11:00 AM work, 1:00 PM play', items.join(', '));
    const gaps = [...doc.querySelectorAll('#aes-bracket-viewer .abv-tl-gap')].map(el => el.textContent);
    check('gaps: 3x no break, then 1 hr meal break', gaps.join(' | ') === 'No break | No break | No break | 1 hr break, time to eat', gaps.join(' | '));
    check('venue shown once in heading', /Sat, Oct 17, Oakland CC/.test(text()));
    const next = q('.abv-next-cell:not(.work)')?.textContent.replace(/\s+/g, ' ') || '';
    check('next match skips the 8:00 (no result, over an hour past)', /Next match vs Absolute 18 Silver/.test(next), next.slice(0, 80));
    check('court late: 2 earlier matches unposted', /Ct\.8 may be running late: 2 earlier matches have passed the scheduled end/.test(next), (next.match(/Ct\.8[^.]*\./) || [''])[0]);
    check('no arrive line mid-day on the same court', !/Arrive by/.test(next));
    const duty = q('.abv-next-cell.work')?.textContent.replace(/\s+/g, ' ') || '';
    check('next work: 11:00 BAVC vs Bay to Bay', /BAVC 18-2 Boys vs Bay to Bay 16-Premier/.test(duty) && /11:00 AM/.test(duty));
    const routes = [...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="journey"] .abv-table tbody tr')].map(tr => [...tr.cells].map(c => c.innerHTML.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).join(' | '));
    check('routes: 4 finish places', routes.length === 4, routes.length);
    check('1st: XO 1 v 1, 2:00 PM Ct.7, work only if you lose', /^1st \| Lg 2 Oct 17-18 XO Bronze B 1 v 1 \| 2:00 PM Oakland CC Ct\.7 \| 3:00 PM, Oakland CC Ct\.7, only if you lose that match$/.test(routes[0]), routes[0]);
    check('3rd: work 2:00 PM Ct.7 (decided)', /^3rd .*\| 3:00 PM Oakland CC Ct\.7 \| 2:00 PM, Oakland CC Ct\.7$/.test(routes[2]), routes[2]);
    check('4th: no work', /\| None$/.test(routes[3]), routes[3]);
    q('[data-action="copy-parent-update"]').click(); await new Promise(r => setTimeout(r, 30));
    console.log('---- parent update ----\n' + clip + '\n-----------------------');
    check('parent update: header, arrive, 5 items, routes', /^SF Elite B 18 Gold, Sat, Oct 17 at Oakland CC\nArrive by 7:15 AM\n8:00 AM vs Bay to Bay 16-Premier, Ct\.8\n9:00 AM work, Ct\.8\n/.test(clip || '') && /After Pool 2: 1st plays 2:00 PM Ct\.7, 2nd plays 2:00 PM Ct\.8, 3rd plays 3:00 PM Ct\.7, 4th plays 3:00 PM Ct\.8$/.test(clip || ''));
    q('[data-action="print-day-sheet"]').click(); await new Promise(r => setTimeout(r, 30));
    check('print sheet: schedule, routes, 3 opponents with records', /<h2>Schedule<\/h2>/.test(printed || '') && /After Pool 2/.test(printed || '') && ((printed || '').match(/<td class="notes"><\/td>/g) || []).length === 3);
    check('print sheet has no leftover template text', !/undefined|NaN|\[object/.test(printed || ''));
    // Stats header alignment fix.
    q('[data-view="stats"]').click();
    const misaligned = [...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="stats"] table')].filter(table => {
        const heads = [...table.tHead.rows[0].cells].map(c => c.classList.contains('num'));
        return [...table.tBodies[0].rows].some(tr => [...tr.cells].some((c, i) => c.classList.contains('num') !== heads[i]));
    }).length;
    check('Stats: every header aligns with its column', misaligned === 0, `${misaligned} misaligned tables`);
    check('no runtime errors (10:10)', errors.length === 0, errors.slice(0, 2).join(' | '));
    w.close();
    // 7:00 AM, before the first match.
    ({ w, doc, errors } = await boot({ now: at(7, 0), setup }));
    doc.querySelector('#aes-bracket-viewer [data-view="journey"]').click();
    const early = doc.querySelector('#aes-bracket-viewer .abv-next-cell:not(.work)').textContent.replace(/\s+/g, ' ');
    check('7:00: next is 8:00 vs Bay to Bay', /Next match vs Bay to Bay 16-Premier/.test(early));
    check('7:00: arrive by 7:15 AM with countdown', /Arrive by 7:15 AM \(in 15m\)/.test(early), (early.match(/Arrive by[^)]*\)/) || [''])[0]);
    check('7:00: first match on court', /First match on Ct\.8 today/.test(early));
    w.close();
    // 9:30 AM: team is working the 9:00 match; the unposted 8:00 must not show as next.
    ({ w, doc, errors } = await boot({ now: at(9, 30), setup }));
    doc.querySelector('#aes-bracket-viewer [data-view="journey"]').click();
    const mid = doc.querySelector('#aes-bracket-viewer .abv-next-cell:not(.work)').textContent.replace(/\s+/g, ' ');
    const midDuty = doc.querySelector('#aes-bracket-viewer .abv-next-cell.work').textContent.replace(/\s+/g, ' ');
    check('9:30: next match is 10:00, not the unposted 8:00', /Next match vs Absolute 18 Silver/.test(mid));
    check('9:30: current duty is the 9:00 work', /9:00 AM/.test(midDuty) && /BAVC 18-2 Boys vs Absolute 18 Silver/.test(midDuty));
    check('9:30: one earlier match overdue on Ct.8', /1 earlier match has passed the scheduled end/.test(mid));
    // A past day with a venue change: Sep 26.
    const day = doc.querySelector('#aes-bracket-viewer [data-action="match-day"]'); day.value = '2026-09-26'; day.dispatchEvent(new w.Event('change', { bubbles: true }));
    const sepGaps = [...doc.querySelectorAll('#aes-bracket-viewer .abv-tl-gap')].map(el => el.textContent);
    console.log('Sep 26 gaps:', sepGaps.join(' | '));
    check('past day renders without next-up card changes', doc.querySelectorAll('#aes-bracket-viewer .abv-tl-item').length >= 4);
    check('no runtime errors (7:00)', errors.length === 0, errors.slice(0, 2).join(' | '));
    console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
    process.exit(results.every(Boolean) ? 0 : 1);
})();
