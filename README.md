# Knight Ally Activity Points

The Activity Point (AP) site for the Night Crows guild **102 Knight Ally**, union UDI.

Live: https://jlee4102.github.io/knight-ally-ap/

## How it works

Two files. No build step, no server, no dependencies.

- `index.html` — the whole site.
- `ap_rules.json` — every AP rate, item price and rule. **All numbers live here.** The page reads it at load time; nothing is hard-coded in the HTML.

Balances and the roster come from a public Google Sheet, fetched as CSV straight from the browser. Google's `export?format=csv` endpoint sends CORS headers, which is why this needs no backend.

## Changing a price or an AP rate

Edit `ap_rules.json` and commit. That's the whole job.

The page self-checks on load: a full week of activity must come to **1,086 AP** and scheduled-only to **575 AP**. If an edit moves either figure, a red banner appears at the top of the site telling you prices were set against the old number. That is intentional — don't suppress it, fix the prices.

## Turning on balances

Standings currently show the roster at zero. To make them live:

1. Add a tab to a Google Sheet you own with the columns
   `date | member | code | qty | turnout`
   - `member` — the IGN, matching the roster
   - `code` — an event key from `ap_rules.json` (`crusade_dominion`, `gvg`, `caves_boss`, …) for a credit, or an item's Discord channel for a purchase
   - `qty` — how many
   - `turnout` — headcount at the kill, for caves and region bonuses; blank otherwise
2. Share the sheet as "anyone with the link can view".
3. In `index.html`, set `SHEET_ID` and `LEDGER_GID` near the top of the `<script>`.

One row per credit, void or purchase. The page does the AP arithmetic from the rules file, so the sheet never holds a number that can go stale — it stays an audit trail.

## Running it locally

`index.html` fetches `ap_rules.json`, which browsers block over `file://`. Serve the folder instead:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.
