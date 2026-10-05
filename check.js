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
check('a genuinely ambiguous row is still refused',
  hit('[E] Gear Crafting Material Selection Chest (Bound)   Week 1 - Main Round'), null);

console.log('\nBalances');
// One eval: a const declared in its own eval call does not leak to the next one.
eval(grab('const EARN_COLUMNS', '\nconst tabUrl') + grab('const headerIndex', '\n// Every row Chielo closes'));
const RECORDS = [
  ['Discord ID', 'Player Name', 'Crusade AP', 'World Dungeon AP', 'Total AP'],
  ['1', 'NC | Chielo', '390', '50', '440'],
  ['2', 'NC | J0bee', '130', '0', '130'],
  ['3', 'NC | Capped', '9000', '0', '9000'],
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

console.log('\nAP_LISTINGS rows');
// `const` declared inside eval does not escape it, so hand these back explicitly.
const { LISTING_HEAD, stamp } = new Function(
  grab('const LISTING_HEAD', '\nfunction writeRows') + '; return {LISTING_HEAD, stamp};')();
const fixedItem = RULES.items.find(i => i.method === 'fixed');
const auctionItem = RULES.items.find(i => i.method !== 'fixed');
const row = it => [
  'posted', it.channel || it.name, 1, it.method, (it.price ?? i.min_bid ?? it.min_per_unit),
  'closes', 'open', '', ''
];
check('a row has one cell per header column', row(fixedItem).length, LISTING_HEAD.length);
check('the header is the one the sheet expects',
  LISTING_HEAD.join('\t'), 'posted\titem\tqty\tmethod\tprice_or_min\tcloses\tstatus\twinner\tfinal_ap');
check('a timestamp is a format Sheets reads as a datetime',
  /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(stamp(new Date(2026, 9, 4, 9, 5))), true);
check('midnight does not lose its padding', stamp(new Date(2026, 0, 1, 0, 0)), '2026-01-01 00:00');
check('every sellable item has something to put in the item column',
  RULES.items.filter(i => !(i.channel || i.name)).length, 0);
check('an auction closes on the clock, a fixed price waits longer',
  RULES.auction_rules.duration_hours < RULES.fixed_price_rules.unclaimed_after_hours, true);
check('no item key contains a tab or newline that would break the paste',
  RULES.items.filter(i => /[\t\n]/.test(i.channel || i.name)).length, 0);

console.log('\nReading AP_LISTINGS back');
// One eval again: readListings closes over itemCost, toNum and rowObjects, and a
// const from a previous eval call is not visible to this one.
eval(grab('function itemCost', '\nfunction buildPicks')
   + grab('const headerIndex', '\nlet EVENTS'));
const soon = new Date(Date.now() + 3600e3), past = new Date(Date.now() - 3600e3);
const at = d => stamp(d);
const listing = extra => readListings([
  LISTING_HEAD,
  ['2026-10-04 10:00', 'skillbooks', '1', 'auction', '150', at(soon), 'open', '', '', ...[]]
    .map((v, i) => (extra && i in extra) ? extra[i] : v),
])[0];

check('a known item key resolves to its real name', listing().name, 'Skill book');
check('an open auction in the future is not flagged as due', listing().due, false);
check('an open auction past its close needs settling', listing({5: at(past)}).due, true);
check('a settled row is no longer open', listing({6: 'sold'}).open, false);
check('an unknown item key is flagged, not silently shown',
  listing({1: 'not-a-real-item'}).flags.length, 1);
check('a winning bid under the minimum is flagged',
  listing({6: 'sold', 7: 'NC | Chielo', 8: '100'}).flags.length, 1);
check('a winning bid over the minimum is fine',
  listing({6: 'sold', 7: 'NC | Chielo', 8: '300'}).flags.length, 0);
check('a winner with no price recorded is flagged',
  listing({6: 'sold', 7: 'NC | Chielo'}).flags.length, 1);
check('a fixed item charged the wrong price is flagged',
  listing({1: 'blessing', 3: 'fixed', 6: 'sold', 7: 'NC | Chielo', 8: '99'}).flags.length, 1);
check('a timestamp survives the round trip to the sheet and back',
  parseStamp(stamp(new Date(2026, 9, 4, 15, 49))).getHours(), 15);
check('a blank closes cell does not crash the board', listing({5: ''}).closes, null);
// qty and price_or_min are separate columns, so every comparison has to multiply.
// Aura stones stack, so a lot of three is a real listing; skill books do not.
check('a lot of three under the per-item minimum is flagged',
  listing({1: 'aura-stones', 2: '3', 6: 'sold', 7: 'NC | Chielo', 8: '300'}).flags.length, 1);
check('a lot of three at three times the minimum is fine',
  listing({1: 'aura-stones', 2: '3', 6: 'sold', 7: 'NC | Chielo', 8: '750'}).flags.length, 0);
check('a fixed lot must be charged per item, times the quantity',
  listing({1: 'blessing', 2: '3', 3: 'fixed', 6: 'sold', 7: 'NC | Chielo', 8: '8'}).flags.length, 1);
check('an item that never stacks is flagged if the sheet says it did',
  listing({1: 'skillbooks', 2: '2'}).flags.length, 1);
check('one of a non-stacking item is fine', listing({1: 'skillbooks', 2: '1'}).flags.length, 0);
check('the rules still record which loot never stacks',
  RULES.items.filter(i => i.max_qty === 1).map(i => i.name), ['Skill book']);
check('a fixed lot charged correctly is fine',
  listing({1: 'blessing', 2: '3', 3: 'fixed', 6: 'sold', 7: 'NC | Chielo', 8: '24'}).flags.length, 0);

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
