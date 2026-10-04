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

## Where standings come from

The `PAYROLL - PASAHOD` tab of the alliance loot sheet. Its header is two rows: row 1 names each fortnight (`Cave 04/20-05/03`), row 2 marks which of its columns is the attendance count (`Att`). The page carries the period name across merged cells, takes the **rightmost** `Att` column of each kind, and multiplies by that event's `base_ap`.

A new fortnight needs no code change — a new column shows up on its own.

Three constants at the top of the `<script>` control it:

- `PERIOD_GID` — the tab. Addressed by gid, not by name: the `gviz` endpoint can address tabs by name but silently truncates this one at ~90 columns, and the attendance is past that.
- `COLUMNS` — which column prefix pays at which rules event. Only `Cave` and `WD` exist on the sheet today; Crusade, GvG, Guild Dungeon and Epic Dungeon pay AP in the rules but are not in standings until they get a column.
- `GUILD_TAG` — `null` shows Jollibee (members with no `[TAG]` prefix). Use `'Horde'`, `'DM'`, or `'ALL'` for the whole alliance.

### Known gap

The sheet stores a fortnight total per member, not a row per kill, so the caves turnout tiers in `ap_rules.json` cannot be applied — every kill pays the flat 12 AP. Fixing that means recording the headcount on each Chielo check-in, not just the total.

Spending is also not tracked yet. Standings show AP earned this period; claims and bids are settled by officers in Discord.

## Running it locally

`index.html` fetches `ap_rules.json`, which browsers block over `file://`. Serve the folder instead:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.
