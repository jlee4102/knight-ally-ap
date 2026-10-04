// Self-check for the two bits of logic that can silently go wrong:
// the AP totals the prices were set against, and the screenshot matcher.
// Run:  node check.js
const fs = require('fs');

const RULES = JSON.parse(fs.readFileSync(__dirname + '/ap_rules.json', 'utf8'));
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

// Pull the matcher out of the page rather than keeping a second copy here.
// eval is deliberate and safe: the input is this repo's own index.html, read from
// disk, never user input or anything fetched. It keeps the test honest by exercising
// the shipped source instead of a copy that can drift.
const grab = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
eval(grab('const norm =', 'function readQty'));

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
};

console.log('AP totals');
const full = Object.values(RULES.events).reduce((s, e) => s + e.base_ap * e.per_week, 0);
const sched = ['crusade_dominion', 'gvg', 'guild_dungeon', 'epic_dungeon', 'world_boss']
  .reduce((s, k) => s + RULES.events[k].base_ap * RULES.events[k].per_week, 0);
check('a full week of activity is 1,086 AP', full, 1086);
check('scheduled events alone are 575 AP', sched, 575);
check('no price exceeds one week of full activity',
  RULES.items.filter(i => (i.price ?? i.min_bid ?? i.min_per_unit) > full).map(i => i.name), []);

console.log('\nScreenshot matcher');
const byName = n => RULES.items.findIndex(i => i.name === n);
const hit = line => { const m = matchItem(line); return m ? RULES.items[m.index].name : null; };

// Lines as OCR actually returns them: stray punctuation, dropped letters, quantities.
check('clean line', hit('Source of Wisdom x2'), 'Source of Wisdom');
check('leading icon noise', hit('| @ Blessing Stone  x15'), 'Blessing stone');
check('lowercased and punctuated', hit('forgotten remnant, x 40'), 'Forgotten Remnant');
check('partial word dropped', hit('Brilliant Pitchblack  x1'), 'Brilliant Pitchblack chest');
check('unrelated UI text is ignored', hit('Guild Storage  12/100'), null);
check('empty line is ignored', hit(''), null);
check('a near-miss between two similar items is refused rather than guessed',
  hit('Arcane Scroll'), null);

console.log('\nYear inference');
eval(grab('function yearsFor', '\nfunction readSheet'));
// The real column order on PAYROLL - PASAHOD: July through to the following May,
// crossing New Year once in the middle. The sheet never writes the year down.
const SEQ = ['7/7-7/20', '9/29-10/19', '10/20-11/3', '12/29-01/11', '01/12 - 01/25', '04/20-05/03'];
const ys = yearsFor(SEQ);
check('the newest period is never dated into the future', new Date(ys[ys.length - 1], 3, 20) <= new Date(), true);
check('December falls a year before the January after it', ys[3] < ys[4], true);
check('periods inside one calendar run share a year', ys[1] === ys[2], true);
check('this run spans exactly two years', new Set(ys).size, 2);
check('a lone date with no range still gets a year', yearsFor(['8/24']).length, 1);

console.log('\nQuantities');
eval(grab('function readQty', '\nasync function readScreenshot'));
check('x before the number', readQty('Blessing Stone x15'), 15);
check('number before the x', readQty('15x Blessing Stone'), 15);
check('no quantity defaults to one', readQty('Source of Wisdom'), 1);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
