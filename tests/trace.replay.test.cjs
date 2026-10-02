// Trace clicks restyle only traced elements, and end in exactly the state a full re-render
// would produce. Run with TZ=America/Los_Angeles (scripts/test.mjs does this).
const boot = require('./replay.cjs');
(async () => {
  const results = [];
  const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== '' ? `  [${got}]` : ''}`); };
  const { w, doc, errors } = await boot({ now: new Date('2026-10-17T07:00:00-07:00').getTime() });
  const q = s => doc.querySelector('#aes-bracket-viewer ' + s);
  q('[data-action="reset-filters"]').click();   // whole division on the graph
  const canvas = q('[data-canvas="tournament"]');
  const snapshotClasses = () => new Map([...q('[data-canvas="tournament"]').querySelectorAll('[data-node-key], [data-edge-key]')].map((el, i) => [`${el.dataset.nodeKey || el.getAttribute('data-edge-key')}#${el.tagName}#${i}`, el.getAttribute('class')]));
  const elements = canvas.querySelectorAll('[data-node-key], [data-edge-key]').length;

  let changes = 0;
  const observer = new w.MutationObserver(list => { changes += list.length; });
  observer.observe(canvas, { subtree: true, attributes: true, attributeFilter: ['class'] });
  const target = canvas.querySelector('[data-node-key="Lg2Oct17-18Bronze BP2M1"]');
  target.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  const traced = canvas.querySelectorAll(':is(.trace-upstream, .trace-downstream, .trace-both)').length;
  check('trace click restyles only traced elements', changes > 0 && changes <= traced + 2, `${changes} class changes for ${traced} traced of ${elements} elements`);
  check('canvas carries the tracing class', canvas.classList.contains('tracing'));
  check('same DOM, no re-layout', canvas.querySelector('[data-node-key="Lg2Oct17-18Bronze BP2M1"]') === target);

  // The targeted update must match a full render exactly.
  const targeted = snapshotClasses();
  // Re-selecting the current node size forces a full Tournament render without clearing the trace.
  const density = q('[data-action="density"]');
  density.dispatchEvent(new w.Event('change', { bubbles: true }));
  const full = snapshotClasses();
  const differing = [...targeted].filter(([key, value]) => full.get(key) !== value).length;
  check('targeted update equals a full re-render', targeted.size === full.size && differing === 0, `${differing} of ${targeted.size} differ`);

  changes = 0;
  const again = q('[data-node-key="Lg2Oct17-18Bronze BP2M1"]');
  observer.observe(q('[data-canvas="tournament"]'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  again.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  check('second click clears the trace', !q('[data-canvas="tournament"]').classList.contains('tracing') && q('[data-canvas="tournament"]').querySelectorAll(':is(.trace-upstream, .trace-downstream, .trace-both)').length === 0);
  check('clearing also restyles only traced elements', changes <= traced + 2, `${changes} class changes`);
  check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
