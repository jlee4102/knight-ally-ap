# Jollibee Activity Points

The Activity Point (AP) site for the Night Crows guild **Jollibee**, alliance 102 Knight Ally, union UDI.

Live: https://jlee4102.github.io/knight-ally-ap/

## How it works

Two files. No build step, no server, no dependencies.

- `index.html` — the whole site.
- `ap_rules.json` — every AP rate, item price and rule. **All numbers live here.** The page reads it at load time; nothing is hard-coded in the HTML.

Balances and the roster come from a public Google Sheet, fetched as CSV straight from the browser. Google's `export?format=csv` endpoint sends CORS headers, which is why this needs no backend.

## Changing a price or an AP rate

Edit `ap_rules.json` and commit. That's the whole job.

The page self-checks on load: a full week of activity must come to **1,086 AP** and scheduled-only to **575 AP**. If an edit moves either figure, a red banner appears at the top of the site telling you prices were set against the old number. That is intentional — don't suppress it, fix the prices.

## Where the numbers come from

Google Sheet `10o-BS30FIw-XVm84GAPlpmDBgadIphIwg2-lYuH3tu0`, three tabs, all read as CSV straight from the browser. Tabs are addressed **by name**, so reordering the sheet is safe.

| Tab | Written by | Used for |
| --- | --- | --- |
| `AP Records` | Chielo | Running AP per member, one column per event type |
| `Event Logs` | Chielo | One row per closed check-in: time, result, base AP, win bonus, **participant count**, participants |
| `AP Transactions` | the bidding bot | Every purchase: who, what, AP charged, balance either side |
| `Bidding Item` | pasted from the loot post builder; the Discord bidding system fills in results | `Item`, `AP Price`, `Status`, `Winner`, `Winning Bid` |

The bot keeps its own books on `AP Records`: `Lifetime AP Earned`, `AP Spent`, and a `Total AP` that already nets the two. So:

```
earned  = Lifetime AP Earned
spent   = AP Spent
balance = Total AP                 (capped at balance_cap)
```

Reading `Total AP` as earnings made every purchase invisible: the balance was right but the Spent column read zero.

Nothing is recorded by hand. A correction is an edit to `AP Records` itself.

Debits and credits are summed **separately**. Netting them first makes a correction look like a discount on whatever someone bought, and the Spent column stops matching the ledger. `check.js` covers this.

### Bidding Item

The only source for the vault board. `Available` means open; anything else is closed. Item names here are the officers own free text, so a name the rules do not know is shown as written and **not** flagged — only a name that does match is checked against its minimum. A winning bid under the asking price, or a winner with no bid, is flagged either way.

Nine columns, in this order:

```
posted  Item  qty  method  price_or_min  AP Price  Status  Winner  Winning Bid
```

`LISTING_HEAD` in `index.html` must match it **column for column** — a pasted row lands by position. The reader matches on header names, so it survives a reshuffle; the builder does not. A check pins the order.

A stack also goes into the name as `Skill book x3`, because the name is what Discord shows; `AP Price` is what the whole stack costs. Reading back, an explicit `qty` wins and the count in the name is the fallback, so the name still matches its rules entry and the minimum is checked against the multiplied price.

### Reading a screenshot

The image is scaled to about 2600px wide with the contrast stretched before the text pass. At its own size the reader returns things like `rian Bresing sene` and matches almost nothing; scaled up it reads every row.

Every row is accounted for: priced, recognised as the guild leader's (from `not_for_sale_guild_leader_only`), or listed back as unrecognised. A row with no price in the rules used to vanish without trace, which is how a screenshot of 29 things quietly became 8.

The game prints longer names than the guild prices under - `Orb of Winds` for glider material, `Golden Cuirass Insignia Fragment` for the chest fragments. Those go in an item's `aliases`, which are matched **intact only**: scored loosely, an alias whose distinctive words are all stop-words collapses to something like "arcane scroll" and swallows every other scroll.

It does **not** read stack sizes. The quantity is painted on the item icon as a handful of pixels, and reading it was wrong more often than right - a 2 came back as 51, a stray mark in the artwork as 7. It also rested on crop fractions and a contrast threshold measured from two screenshots, which another officer's screen would not match. Every row starts at one and the officer types the counts.

### Known gaps

- Nothing writes to the sheet from the page. The loot post builder produces rows to paste into `Bidding Item`; everything else the bot writes itself.
- Caves turnout tiers are not applied yet even though `Event Logs` now carries the headcount — `AP Records` arrives pre-totalled by Chielo, so applying our own tiers would disagree with what the bot tells people in Discord.

## Running it locally

`index.html` fetches `ap_rules.json`, which browsers block over `file://`. Serve the folder instead:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.
