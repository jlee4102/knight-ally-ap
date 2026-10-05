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
// These match what Chielo actually credits, read off its own Event Logs.
const full = Object.values(RULES.events).reduce((s, e) => s + e.base_ap * e.per_week, 0);
const sched = ['crusade_dominion', 'gvg', 'guild_dungeon', 'epic_dungeon', 'world_boss']
  .reduce((s, k) => s + RULES.events[k].base_ap * RULES.events[k].per_week, 0);
check('a full week of activity at the floor rates is 1,028 AP', full, 1028);
// Chielo pays caves, region and battlefield on a turnout ladder: fewer people
// present, more AP each. Every level must have all three bands, in descending
// order, ending at the base rate.
const laddered = Object.entries(RULES.events).filter(([, e]) => Array.isArray(e.low_turnout_bonus));
check('every laddered event has three turnout bands',
  laddered.filter(([, e]) => e.low_turnout_bonus.length !== 3).map(([k]) => k), []);
check('a smaller turnout never pays less',
  laddered.filter(([, e]) => e.low_turnout_bonus.some((t, i, a) => i && t.ap > a[i-1].ap)).map(([k]) => k), []);
check('the largest turnout pays exactly the base rate',
  laddered.filter(([, e]) => e.low_turnout_bonus[2].ap !== e.base_ap).map(([k]) => k), []);
check('the bands run 1-3, 4-7 and 8 or more',
  laddered.filter(([, e]) => e.low_turnout_bonus.map(t => [t.min_members, t.max_members].join('-')).join(',')
    !== '1-3,4-7,8-').map(([k]) => k), []);
check('Cave 3 pays 20, 17 then 12',
  RULES.events.caves_3.low_turnout_bonus.map(t => t.ap), [20, 17, 12]);
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
// Real storage rows. The rarity column is the trap: this line contains every word
// of "Superior Arcane Scroll", but the name that is actually written is Higher.
check('the rarity column does not steal the match',
  hit('Higher Arcane Scroll of Discipline   Superior   2026 14:09 (UTC-4)   14 d left'),
  'Higher Arcane Scroll');
check('a Superb row reads the same way',
  hit('Higher Arcane Scroll of Escalation (Bound)   Superb   21 d left'),
  'Higher Arcane Scroll');
check('a bound suffix is ignored', hit('Essence of the Sky (Bound)   Superior   14 d left'),
  'Essence of the Sky');
check('a longer in-game name still finds the item it belongs to',
  hit("Forgotten Transcendent's Remnant (Bound)   Superior   14 d left"), 'Forgotten Remnant');
check('an item with no rules entry is refused rather than priced as something else',
  hit('[E] Gear Crafting Material Selection Chest (Bound)   Week 1 - Main Round'), null);
// The aliases mechanism stays and is exercised here, so the next in-game name that
// does not match a short name is one line of config rather than a code change.
check('an alias reaches the item it belongs to', (() => {
  const gear = RULES.items.find(i => i.channel === 'gear-mats-apply');
  gear.aliases = ['Gear Crafting Material Selection Chest'];
  const got = hit('[E] Gear Crafting Material Selection Chest (Bound)   Week 1');
  delete gear.aliases;
  return got;
})(), 'Gear material');

console.log('\nBalances');
// One eval: a const declared in its own eval call does not leak to the next one.
eval(grab('const EARN_COLUMNS', '\nconst tabUrl') + grab('const headerIndex', '\n// Every row Chielo closes'));
const RECORDS = [
  ['Discord ID', 'Player Name', 'Crusade AP', 'World Dungeon AP', 'Battle Field AP', 'Total AP'],
  ['1', 'NC | Chielo', '390', '50', '0', '440'],
  ['2', 'NC | J0bee', '130', '0', '0', '130'],
  ['3', 'NC | Capped', '9000', '0', '0', '9000'],
  // Two accounts, one display name. Both appear on the live sheet.
  ['4', 'NC | Twin', '10', '0', '0', '10'],
  ['5', 'NC | Twin', '20', '0', '0', '20'],
  // Chielo's per-event columns do not always come to its own total.
  ['6', 'NC | Mismatch', '100', '0', '20', '202'],
];
const LEDGER = [
  ['date', 'member', 'item', 'qty', 'ap', 'note'],
  ['2026-10-12', 'NC | Chielo', 'aura-stones', '1', '-300', 'won auction'],
  ['2026-10-13', 'NC | Chielo', '', '', '25', 'logger missed Crusade'],
];
const bal = n => readMembers(RECORDS, LEDGER).find(m => m.name === n);
check('earning with no ledger rows leaves the balance untouched', bal('NC | J0bee').balance, 130);
check('a purchase comes off the balance', bal('NC | Chielo').balance, 440 - 300 + 25);
check('spent is reported as a positive number', bal('NC | Chielo').spent, 300);
check('a positive ledger row is a credit, not a spend', bal('NC | Chielo').adjusted, 25);
check('the balance cap still applies', bal('NC | Capped').balance, RULES.balance_cap);
check('earned is never silently capped', bal('NC | Capped').earned, 9000);
check('two accounts sharing a display name both survive',
  readMembers(RECORDS, LEDGER).filter(m => m.name === 'NC | Twin').length, 2);
check('the bot's own total wins over adding the columns up',
  bal('NC | Mismatch').earned, 202);
check('a column the bot added is still shown in the breakdown',
  bal('NC | Mismatch').att.battlefield_elite, 20);

console.log('\nBidding Item tab');
// Same eval as its helpers: readBidding closes over toNum, rowObjects and itemCost.
eval(grab('function itemCost', '\nfunction buildPicks')
   + grab('const headerIndex', '\nlet EVENTS'));
const BID_HEAD = ['posted', 'Item', 'qty', 'method', 'price_or_min', 'AP Price', 'Status', 'Winner', 'Winning Bid'];
// Named fields rather than a positional row, so reordering the tab does not
// silently turn every one of these into a test of something else.
const bid = f => readBidding([BID_HEAD, BID_HEAD.map(h => f[h] ?? '')])[0];
check('an available row is open',
  bid({Item: 'Legacy', 'AP Price': '69', Status: 'Available'}).open, true);
check('an unavailable row is not open',
  bid({Item: 'Test', 'AP Price': '50', Status: 'Unavailable',
       Winner: 'NC | Chielo', 'Winning Bid': '100'}).open, false);
// Names on this tab are the officers' own, so an unknown one is normal.
check('a name the rules do not know is kept and not flagged',
  bid({Item: 'Sex Doll', 'AP Price': '30', Status: 'Available'}).flags.length, 0);
check('a winning bid under the asking price is flagged',
  bid({Item: 'Legacy', 'AP Price': '69', Status: 'Unavailable',
       Winner: 'NC | Chielo', 'Winning Bid': '50'}).flags.length, 1);
check('a winner with no bid recorded is flagged',
  bid({Item: 'Legacy', 'AP Price': '69', Status: 'Unavailable',
       Winner: 'NC | Chielo'}).flags.length, 1);
check('a known item priced under its rules minimum is flagged',
  bid({Item: 'Skill book', 'AP Price': '50', Status: 'Available'}).flags.length, 1);
check('a known item priced at its minimum is fine',
  bid({Item: 'Skill book', 'AP Price': '150', Status: 'Available'}).flags.length, 0);
// The name is what Discord shows, so a stack carries its count there too.
check('a stack written into the name comes back as a quantity',
  bid({Item: 'Skill book ×3', 'AP Price': '450', Status: 'Available'}).qty, 3);
check('the name still reaches its rules entry once the count is stripped',
  bid({Item: 'Skill book ×3', 'AP Price': '450', Status: 'Available'}).name, 'Skill book');
check('a stack priced below its multiplied minimum is flagged',
  bid({Item: 'Skill book ×3', 'AP Price': '300', Status: 'Available'}).flags.length, 1);
check('a plain name with no count is a quantity of one',
  bid({Item: 'Skill book', 'AP Price': '150', Status: 'Available'}).qty, 1);
check('an explicit qty column wins over the count in the name',
  bid({Item: 'Skill book ×9', qty: '1', 'AP Price': '150', Status: 'Available'}).qty, 1);

console.log('\nRows the builder writes');
// The newline matters: the grabbed block ends on a comment line, so a return
// appended directly to it would be commented out and the function returns nothing.
const { LISTING_HEAD } = new Function(
  grab('const LISTING_HEAD', '\nfunction writeRows') + '\nreturn {LISTING_HEAD};')();
// A pasted row lands by position, so this has to stay in the tab's own order.
check('the header is the Bidding Item tab, column for column',
  LISTING_HEAD.join('\t'),
  'posted\tItem\tqty\tmethod\tprice_or_min\tAP Price\tStatus\tWinner\tWinning Bid');
check('no item name contains a tab or newline that would break the paste',
  RULES.items.filter(i => /[\t\n]/.test(i.name)).length, 0);

console.log('\nQuantities');
eval(grab('function readQty', '\nasync function readScreenshot'));
check('x before the number', readQty('Blessing Stone x15'), 15);
check('number before the x', readQty('15x Blessing Stone'), 15);
check('no quantity defaults to one', readQty('Source of Wisdom'), 1);
// Rows as the storage screen actually reads: no "x3" anywhere, and the same item
// repeated once per stack. The numbers on the line are a timestamp and an expiry.
const STORAGE = [
  'Higher Arcane Scroll of Discipline    Superior   2026 14:09 (UTC-4)   14 d left',
  'Higher Arcane Scroll of Escalation    Superior   2026 14:09 (UTC-4)   14 d left',
  'Higher Arcane Scroll of Discipline    Superior   2026 14:16 (UTC-4)   14 d left',
  'Essence of the Sky (Bound)            Superior   2026 14:27 (UTC-4)   14 d left',
];
const tally = new Map();
for (const line of STORAGE) {
  const m = matchItem(line);
  if (m) tally.set(m.index, (tally.get(m.index) || 0) + readQty(line));
}
const qtyOf = name => tally.get(RULES.items.findIndex(i => i.name === name));
check('repeated rows of one item add up instead of collapsing to one',
  qtyOf('Higher Arcane Scroll'), 3);
check('a different item is counted separately', qtyOf('Essence of the Sky'), 1);
check('each storage row stays its own stack rather than being merged',
  STORAGE.filter(l => matchItem(l)).length, 4);
check('an expiry or timestamp on the line is not mistaken for a quantity',
  readQty('Higher Arcane Scroll of Discipline  Superior  2026 14:09 (UTC-4)  14 d left'), 1);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
