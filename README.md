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
| `AP_LEDGER` | officers, by hand | Deductions, voids and corrections |
| `Bidding Item` | pasted from the loot post builder; the Discord bidding system fills in results | `Item`, `AP Price`, `Status`, `Winner`, `Winning Bid` |

`balance = AP Records total + ledger credits − ledger debits`, capped at `balance_cap`.

Debits and credits are summed **separately**. Netting them first makes a correction look like a discount on whatever someone bought, and the Spent column stops matching the ledger. `check.js` covers this.

### AP_LEDGER

`date | member | item | qty | ap | note` — `ap` is signed, negative for a purchase or a void. `member` must match `Player Name` on `AP Records` exactly. `item` is an item's `channel` key from `ap_rules.json`, blank for a void.

Auction winners pay their own bid, which no rules file can know, so `ap` is authoritative and `item` is only the link back to the loot board.

### Bidding Item

The only source for the vault board. `Available` means open; anything else is closed. Item names here are the officers own free text, so a name the rules do not know is shown as written and **not** flagged — only a name that does match is checked against its minimum. A winning bid under the asking price, or a winner with no bid, is flagged either way.

Nine columns, in this order:

```
posted  Item  qty  method  price_or_min  AP Price  Status  Winner  Winning Bid
```

`LISTING_HEAD` in `index.html` must match it **column for column** — a pasted row lands by position. The reader matches on header names, so it survives a reshuffle; the builder does not. A check pins the order.

A stack also goes into the name as `Skill book x3`, because the name is what Discord shows; `AP Price` is what the whole stack costs. Reading back, an explicit `qty` wins and the count in the name is the fallback, so the name still matches its rules entry and the minimum is checked against the multiplied price.

### Known gaps

- Nothing writes to the sheet from the page; officers edit `AP_LEDGER` directly.
- Caves turnout tiers are not applied yet even though `Event Logs` now carries the headcount — `AP Records` arrives pre-totalled by Chielo, so applying our own tiers would disagree with what the bot tells people in Discord.

## Running it locally

`index.html` fetches `ap_rules.json`, which browsers block over `file://`. Serve the folder instead:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.
