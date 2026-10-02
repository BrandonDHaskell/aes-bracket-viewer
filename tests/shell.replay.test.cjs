// Cached viewer element lookups stay correct across re-renders.
// Run with TZ=America/Los_Angeles (scripts/test.mjs does this).
const boot = require('./replay.cjs');
(async () => {
  const results = [];
  const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== '' ? `  [${got}]` : ''}`); };
  // No clipboard: Copy parent update falls back to a text area that Match Day re-creates on render.
  const { w, doc, errors } = await boot({ now: new Date('2026-10-17T07:00:00-07:00').getTime(), setup: win => Object.defineProperty(win.navigator, 'clipboard', { value: undefined, configurable: true }) });
  const q = s => doc.querySelector('#aes-bracket-viewer ' + s);
  for (let round = 1; round <= 2; round += 1) {
    q('[data-view="journey"]').click();
    q('[data-action="copy-parent-update"]').click();
    const area = q('[data-role="parent-text"]');
    check(`fallback text area filled after render ${round}`, area && !area.hidden && /^SF Elite B 18 Gold, Sat, Oct 17/.test(area.value), area?.value.slice(0, 40));
    q('[data-view="stats"]').click();
  }
  q('[data-view="journey"]').click();
  const seeOutlook = q('.abv-outlook-line [data-view="performance"]');
  q('[data-view="performance"]').click();
  check('only tab buttons get the active state', !seeOutlook.classList.contains('active') && q('.abv-view-tabs [data-view="performance"]').classList.contains('active'));
  const status = () => q('[data-role="status-text"]').textContent;
  q('[data-action="reset-filters"]').click();
  check('status line keeps updating through cached lookups', /All teams/.test(status()), status().slice(0, 60));
  check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
