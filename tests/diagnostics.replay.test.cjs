// Details panel reports load, build, render, and trace timings, and can copy them.
// Run with TZ=America/Los_Angeles (scripts/test.mjs does this).
const boot = require('./replay.cjs');
(async () => {
  const results = [];
  const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== '' ? `  [${got}]` : ''}`); };
  let copied = '';
  const setup = w => {
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } }, configurable: true });
    w.GM_info = { script: { version: '3.0.0-test' } };
  };
  const { w, doc, errors } = await boot({ now: new Date('2026-10-17T07:00:00-07:00').getTime(), setup });
  const q = s => doc.querySelector('#aes-bracket-viewer ' + s);
  for (const view of ['journey', 'stats', 'tournament']) q(`[data-view="${view}"]`).click();
  q('[data-node-key="Lg2Oct17-18Bronze BP2M1"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  q('[data-action="toggle-diagnostics"]').click();
  const rows = Object.fromEntries([...q('[data-role="diagnostics"]').querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]));
  check('script version shown', rows['Script version'] === '3.0.0-test', rows['Script version']);
  // 177 data requests plus the one-time lookup of which division each starred team plays in.
  const load = (rows['Last load'] || '').match(/^\d+\.\d s total, first view after \d+\.\d s, (\d+) requests \(165 pool sheets downloaded, 0 from saved copies, 103 in the background\)$/);
  check('last load: requests, downloads, and background count', Boolean(load) && Number(load[1]) >= 177, rows['Last load']);
  check('model build time shown', /^\d+ ms$/.test(rows['Model build'] || ''), rows['Model build']);
  check('render times per view, with Tournament element count', /Match Day \d+ ms/.test(rows['Render times'] || '') && /Stats \d+ ms/.test(rows['Render times']) && /Tournament \d+ ms \(\d+ elements\)/.test(rows['Render times']), rows['Render times']);
  check('last trace click time shown', /^\d+ ms$/.test(rows['Last trace click'] || ''), rows['Last trace click']);
  q('[data-action="copy-diagnostics"]').click();
  await new Promise(r => setTimeout(r, 20));
  check('Copy details puts every row on the clipboard', /^Event key: /.test(copied) && /\nLast load: .*\d+ requests/.test(copied) && /\nScript version: 3\.0\.0-test/.test(copied), copied.split('\n').length + ' lines');
  check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
