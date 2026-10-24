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

console.log('\nSplitting a pile into listings');
// max_qty is the most that may go in one listing. addLot splits a reading into
// whole lots plus a real remainder; this mirrors that loop.
const split = (name, n) => {
  const cap = RULES.items.find(i => i.name === name).max_qty;
  const full = Math.floor(n / cap);
  return {lots: Array(full).fill(cap), leftover: n - full * cap};
};
check('a pile of orbs becomes whole lots',
  split('Glider material (Orbs of Winds)', 100).lots, [25, 25, 25, 25]);
check('a pile that divides evenly leaves nothing over',
  split('Glider material (Orbs of Winds)', 100).leftover, 0);
// A part lot is not worth running a claim for; the odd ones go to the leader.
check('a part lot is not listed', split('Glider material (Orbs of Winds)', 30).lots, [25]);
check('what is left over is reported, not posted',
  split('Glider material (Orbs of Winds)', 30).leftover, 5);
check('a pile never grows in the splitting', (() => {
  const r = split('Crystal of Liberation (Potential)', 45);
  return r.lots.reduce((a, b) => a + b, 0) + r.leftover;
})(), 45);
check('too few for even one lot means nothing is listed',
  split('Glider material (Orbs of Winds)', 10).lots, []);
check('loot that never stacks becomes one listing each', split('Skill book', 3).lots, [1, 1, 1]);
check('loot that never stacks can never leave a remainder',
  split('Skill book', 3).leftover, 0);
check('every cap is a whole number of at least one',
  RULES.items.filter(i => 'max_qty' in i && !(Number.isInteger(i.max_qty) && i.max_qty >= 1))
    .map(i => i.name), []);
check('scheduled events alone are 575 AP', sched, 575);
// The rule is stated in prose in the config; this is what enforces it.
check('no price exceeds one week of full activity',
  RULES.items.filter(i => (i.price ?? i.min_bid ?? i.min_per_unit) > full).map(i => i.name), []);
check('the written rule does not restate a figure that can drift',
  /[0-9],?[0-9]{3}\s*AP/.test(RULES.constraints.one_week_rule), false);

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
// Both chest aliases open "…Enhancement Scroll Selection Chest". The three
// enhancement scrolls have no price yet and must not be dragged in with them.
// Red, green and the chest that gives them are the guild's to sell; blue is the
// leader's. Pricing the blue one would be auctioning something that is not ours.
check('red, green and the chest all reach the aura stone',
  ['Aura of Intense Manifestation', 'Aura of Circulating Manifestation',
   'Aura of Manifestation Selection Chest'].filter(n => hit(n) !== 'Aura stone (red or green only)'), []);
check('the blue aura is held back, not priced', hit('Aura of Silent Manifestation'), null);
check('and it is recognised as the leader’s rather than left unexplained',
  !!notForSale('Aura of Silent Manifestation (Bound)'), true);
// The individual scrolls and the chests that give them share most of their
// wording and both cost 75, so a mix-up would not show as a wrong number — only
// as the wrong name in the Discord post.
check('each enhancement scroll reaches its own entry, not the chest',
  ['Brilliant Accessory Enhancement Scroll', 'Brilliant Armor Enhancement Scroll',
   'Brilliant Weapon Enhancement Scroll', 'Pitch-black Accessory Enhancement Scroll',
   'Pitch-black Armor Enhancement Scroll'].filter(n => hit(n) !== n), []);
check('the Selection Chests still reach the chest',
  ['Brilliant Enhancement Scroll Selection Chest II (Bound)',
   'Pitch-black Enhancement Scroll Selection Chest II (Bound)']
    .filter(n => hit(n) !== 'Brilliant Pitchblack chest'), []);
check('a scroll and the chest that gives it cost the same',
  RULES.items.find(i => i.name === 'Brilliant Armor Enhancement Scroll').price,
  RULES.items.find(i => i.name === 'Brilliant Pitchblack chest').price);
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
  hit('Starlight Inscribed Pauldron (Bound)   Superior   14 d left'), null);
// Everything seen in storage so far is accounted for: priced, or named as the
// leader's. A drop that is neither should be the exception, not the rule.
check('the loot known to be the leader’s is recognised by its in-game name',
  ['Belt of Exaltation (Bound)', 'Necklace of Honor (Bound)', 'Aura of Silent Manifestation (Bound)',
   'Morion (Bound)   750', 'Guild Coin   50K', 'Essence of Curses (Bound)', 'Gold   10M']
    .filter(n => !notForSale(n)), []);
// Gear material and T3 crafting material share most of their wording, and this
// chest is the T3 one — the costlier of the two, so a slip here is expensive.
check('the gear chest reaches T3, not the cheap gear material',
  hit('[E] Gear Crafting Material Selection Chest (Bound)   Week 1 - Main Round'),
  'T3 crafting material');
// The aliases mechanism stays and is exercised here, so the next in-game name that
// does not match a short name is one line of config rather than a code change.
// Aliases are exact in-game names, matched intact. Scored loosely, one whose
// distinctive words are all stop-words would swallow every similar item.
check('an alias does not drag in a shorter name that merely overlaps it',
  [hit('Arcane Scroll'), hit('[L] Arcane Scroll Selection Chest (Bound)')],
  [null, 'Legendary scroll (Arcane Scroll Selection Chest)']);
check('the in-game names on the sheet all reach their item', (() => {
  const want = {
    'Orb of Winds (Bound)': 'Glider material (Orbs of Winds)',
    'Golden Cuirass Insignia Fragment (Bound)': 'Golden Insignia fragments (chest)',
    'Golden Cape Insignia Fragment': 'Golden Insignia fragments (cape)',
    'Golden Gloves Insignia Fragment (Bound)': 'Golden Insignia fragments (gloves)',
    '[L] Arcane Scroll Selection Chest (Bound)': 'Legendary scroll (Arcane Scroll Selection Chest)',
    'Higher Arcane Scroll of Wisdom (Bound)': 'Higher Arcane Scroll',
    'Superior Arcane Scroll of Discipline': 'Superior Arcane Scroll',
    'Skill Book - Piercing Arrow I': 'Skill book',
    'Crystal of Liberation (Bound)': 'Crystal of Liberation (Potential)',
    'Aura of Manifestation Selection Chest (Bound)': 'Aura stone (red or green only)',
    'Aura of Intense Manifestation (Bound)': 'Aura stone (red or green only)',
    'Pitch-black Enhancement Scroll Selection Chest II (Bound)': 'Brilliant Pitchblack chest',
    'Brilliant Enhancement Scroll Selection Chest II (Bound)': 'Brilliant Pitchblack chest',
  };
  return Object.entries(want).filter(([line, item]) => hit(line) !== item).map(([line]) => line);
})(), []);
// Loot the rules reserve for the guild leader is recognised, not left unexplained.
// notForSale came in with the matcher's eval above, so it is already defined.
check('the leader’s loot is spotted', notForSale('Morion (Bound)   750'), 'Morion');
check('guild coin too', notForSale('Guild Coin   30K'), 'Guild coin');
check('a golden fragment is not mistaken for gold',
  notForSale('Golden Cape Insignia Fragment') || 'not held', 'not held');

check('an alias reaches the item it belongs to', (() => {
  // Set and put back exactly as it was: deleting the key would wipe a real alias.
  const gear = RULES.items.find(i => i.channel === 'gear-mats-apply');
  const had = gear.aliases;
  gear.aliases = ['Reinforced Gear Material Pouch'];
  const got = hit('Reinforced Gear Material Pouch (Bound)');
  if(had) gear.aliases = had; else delete gear.aliases;
  return got;
})(), 'Gear material');

console.log('\nBalances');
// One eval: a const declared in its own eval call does not leak to the next one.
eval(grab('const EARN_COLUMNS', '\nconst tabUrl') + grab('const headerIndex', '\n// Every row Chielo closes'));
// Column order as the bot writes it. Total AP already nets AP Spent off Lifetime.
const RECORDS = [
  ['Discord ID', 'Player Name', 'Crusade AP', 'World Dungeon AP', 'Battle Field AP',
   'Total AP', 'AP Spent', 'Lifetime AP Earned'],
  ['1', 'NC | Chielo', '390', '50', '0', '340', '100', '440'],
  ['2', 'NC | J0bee', '130', '0', '0', '130', '0', '130'],
  ['3', 'NC | Capped', '9000', '0', '0', '9000', '0', '9000'],
  // Two accounts, one display name. Both appear on the live sheet.
  ['4', 'NC | Twin', '10', '0', '0', '10', '0', '10'],
  ['5', 'NC | Twin', '20', '0', '0', '20', '0', '20'],
  // Chielo's per-event columns do not always come to its own total.
  ['6', 'NC | Mismatch', '100', '0', '20', '202', '0', '202'],
  // Lifetime 50 short of Total plus Spent, as seven real members were.
  ['7', 'NC | Adrift', '0', '0', '0', '150', '100', '200'],
];
const bal = n => readMembers(RECORDS).find(m => m.name === n);
check('a member who has bought nothing keeps all of it', bal('NC | J0bee').balance, 130);
check('what the bot charged comes off the balance', bal('NC | Chielo').balance, 340);
check('spent is what the bot charged', bal('NC | Chielo').spent, 100);
// Total AP already nets the two, so reading it as earnings hides every purchase.
// Earned is derived from the two figures the bot keeps straight, not read from
// Lifetime, which it has let drift. These three can then never disagree on screen.
check('earned is the balance plus what was spent', bal('NC | Chielo').earned, 340 + 100);
check('earned minus spent is the balance',
  bal('NC | Chielo').earned - bal('NC | Chielo').spent, bal('NC | Chielo').balance);
check('the balance cap still applies', bal('NC | Capped').balance, RULES.balance_cap);
check('earned is never silently capped', bal('NC | Capped').earned, 9000);
check('two accounts sharing a display name both survive',
  readMembers(RECORDS).filter(m => m.name === 'NC | Twin').length, 2);
check('the running total the bot keeps wins over adding the columns up',
  bal('NC | Mismatch').earned, 202);
// Lifetime AP Earned is not read at all: the bot has let it fall behind its own
// Total, and a derived figure cannot disagree with the balance on screen.
check('a lagging Lifetime is ignored, not adopted', bal('NC | Adrift').earned, 250);
check('the balance is unaffected by it', bal('NC | Adrift').balance, 150);
check('a column the bot added is still shown in the breakdown',
  bal('NC | Mismatch').att.battlefield_elite, 20);

console.log('\nHidden purchases');
// readSpend closes over toNum and rowObjects, so bring the whole reader block.
eval(grab('const HIDE_PURCHASES', '\nconst tabUrl') + grab('const headerIndex', '\nlet EVENTS'));
const SP_HEAD = ['Transaction ID', 'Date UTC', 'Discord ID', 'Player Name', 'Method', 'Item',
                 'Qty', 'AP Charged', 'Balance Before', 'Balance After', 'Status'];
const spend = rows => readSpend([SP_HEAD, ...rows.map(r => SP_HEAD.map(h => r[h] ?? ''))]);
const LEG = '1280483477816475691';
const twoRows = [
  {'Discord ID': LEG, 'Player Name': 'NC | Legacy', Item: 'Source of Wisdom', 'AP Charged': '110', Status: 'COMPLETE'},
  {'Discord ID': '9', 'Player Name': 'NC | Chielo', Item: 'Blessing stone', 'AP Charged': '6', Status: 'COMPLETE'},
];
check('a hidden member is left out of the feed', spend(twoRows).map(t => t.name), ['NC | Chielo']);
check('a member not on the list is untouched', spend(twoRows).map(t => t.ap), [6]);
// The filter keys on Discord ID, so a rename or a change of case cannot quietly
// switch it off - which is how a hide fails: silently, showing what it should not.
check('a renamed member is still hidden',
  spend([{'Discord ID': LEG, 'Player Name': 'NC | Something Else', Item: 'x', 'AP Charged': '1', Status: 'COMPLETE'}]).length, 0);
check('a recased name is still hidden',
  spend([{'Discord ID': '', 'Player Name': 'nc | LEGACY', Item: 'x', 'AP Charged': '1', Status: 'COMPLETE'}]).length, 0);
check('surrounding whitespace does not defeat it',
  spend([{'Discord ID': ' ' + LEG + ' ', 'Player Name': 'x', Item: 'x', 'AP Charged': '1', Status: 'COMPLETE'}]).length, 0);
check('a different member who merely looks similar is not hidden',
  spend([{'Discord ID': '12804834778164756', 'Player Name': 'NC | Legacyy', Item: 'x', 'AP Charged': '1', Status: 'COMPLETE'}]).length, 1);

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
// Derived from the rules, so repricing the catalogue cannot turn this into a test
// of nothing: at exactly three times the minimum it would pass either way.
const bookMin = RULES.items.find(i => i.name === 'Skill book').min_bid;
check('a stack priced below its multiplied minimum is flagged',
  bid({Item: 'Skill book ×3', 'AP Price': String(bookMin * 3 - 25), Status: 'Available'}).flags.length, 1);
check('a stack priced at exactly its multiplied minimum is fine',
  bid({Item: 'Skill book ×3', 'AP Price': String(bookMin * 3), Status: 'Available'}).flags.length, 0);
check('a plain name with no count is a quantity of one',
  bid({Item: 'Skill book', 'AP Price': '150', Status: 'Available'}).qty, 1);
// Every row the builder writes carries its count, x1 included, because the name
// is the only thing telling two listings apart in Discord.
check('a count of one is read back and stripped',
  [bid({Item: 'Skill book ×1', 'AP Price': '100', Status: 'Available'}).qty,
   bid({Item: 'Skill book ×1', 'AP Price': '100', Status: 'Available'}).name],
  [1, 'Skill book']);
check('an explicit qty column wins over the count in the name',
  bid({Item: 'Skill book ×9', qty: '1', 'AP Price': '150', Status: 'Available'}).qty, 1);

console.log('\nMarking rows handed out');
eval(grab('function parseRows', '\nfunction markRows'));
const R = t => [...parseRows(t)].sort((a, b) => a - b);
check('a plain range', R('40-44'), [40, 41, 42, 43, 44]);
check('a single row', R('61'), [61]);
check('a mix of ranges and singles', R('40-42, 61, 63'), [40, 41, 42, 61, 63]);
check('spaces and the word to', R('40 to 42'), [40, 41, 42]);
check('a backwards range still reads forwards', R('44-40'), [40, 41, 42, 43, 44]);
check('an en dash works like a hyphen', R('40–42'), [40, 41, 42]);
check('stray words and punctuation are ignored', R('rows 40-41,, and 55'), [40, 41, 55]);
check('nothing numeric gives nothing', R('hello'), []);
check('a row listed twice is still one row', R('40-42, 41'), [40, 41, 42]);
// The sheet's header is row 1, so the first listing is row 2. Off by one here
// would mark the wrong item as handed out.
check('the first data row is row 2',
  readBidding([BID_HEAD, BID_HEAD.map(h => h === 'Item' ? 'Skill book' : '')])[0].row, 2);

console.log('\nPutting like items together');
eval(grab('function condense', '\nfunction buildHandout'));
check('a run of rows collapses', condense([15, 16, 17]), '15-17');
check('gaps are kept apart', condense([8, 10, 15, 16, 17]), '8, 10, 15-17');
check('one row stays one row', condense([61]), '61');
check('duplicates and disorder are tidied', condense([17, 15, 16, 15]), '15-17');
// What condense prints must be something the row box accepts, or the two halves
// of the page disagree about the same list.
check('the row box reads back what condense wrote',
  [...parseRows(condense([8, 10, 15, 16, 17]))].sort((a, b) => a - b), [8, 10, 15, 16, 17]);

console.log('\nMethods the bidding bot understands');
// It only ever writes fixed or auction into AP Transactions, and silently drops a
// row with anything else: 13 auction_batch fragment rows were listed and not one
// sold, while fixed and auction rows pasted in the same batch all did.
check('no item uses a method the bot cannot read',
  RULES.items.filter(i => !['fixed', 'auction'].includes(i.method)).map(i => i.name), []);
check('fragments kept their cheap bid step',
  RULES.items.filter(i => i.name.startsWith('Golden Insignia')).map(i => i.bid_step), [5, 5, 5]);

console.log('\nRows the builder writes');
// The newline matters: the grabbed block ends on a comment line, so a return
// appended directly to it would be commented out and the function returns nothing.
const LOTS_METHODS = [...new Set(RULES.items.map(i => i.method))];
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

console.log('');
console.log('Handout day filter');
{
  const src = grab('function readBidding', '\n}');
  check('a listing carries the day it was posted',
    /day: \(r\.ID \|\| ''\)\.slice\(0, 10\)/.test(src), true);

  const hb = grab('function buildHandout', '\n}\n');
  check('the newest day is the default', /days\[0\] \|\| ''/.test(hb), true);
  check('picking a day narrows the list, every day does not',
    /day \? all\.filter\(l => l\.day === day\) : all/.test(hb), true);
  check('changing the day redraws', /pick\.onchange = buildHandout/.test(hb), true);

  // The filter itself, run for real.
  const all = [
    {winner: 'A', day: '2026-10-24'}, {winner: 'A', day: '2026-10-24'},
    {winner: 'B', day: '2026-10-17'}, {winner: 'C', day: ''},
  ];
  const days = [...new Set(all.map(l => l.day).filter(Boolean))].sort().reverse();
  check('the newest day sorts first', days[0], '2026-10-24');
  check('only that day is listed', all.filter(l => l.day === days[0]).length, 2);
  check('every day still shows the undated row too', all.length, 4);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
