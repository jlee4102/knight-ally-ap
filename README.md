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

A new fortnight needs no code change — a new column shows up on its own, and the standings get a **Period** dropdown listing every range that has attendance in it, newest first.

Cave and WD are paired by **date range**, never picked independently — `WD 8/24` has no Cave twin, and taking the newest of each would quietly mix two different fortnights. A range needs at least five members with check-ins before it is offered, so a half-entered column never shows up looking like nobody turned up.

Three constants at the top of the `<script>` control it:

- `PERIOD_GID` — the tab. Addressed by gid, not by name: the `gviz` endpoint can address tabs by name but silently truncates this one at ~90 columns, and the attendance is past that.
- `COLUMNS` — which column prefix pays at which rules event. Only `Cave` and `WD` exist on the sheet today; Crusade, GvG, Guild Dungeon and Epic Dungeon pay AP in the rules but are not in standings until they get a column.
- `GUILD_TAG` — `null` shows Jollibee (members with no `[TAG]` prefix). Use `'Horde'`, `'DM'`, or `'ALL'` for the whole alliance.

### Known gap

The sheet stores a fortnight total per member, not a row per kill, so the caves turnout tiers in `ap_rules.json` cannot be applied — every kill pays the flat 12 AP. Fixing that means recording the headcount on each Chielo check-in, not just the total.

Spending is also not tracked yet. Standings show AP earned this period; claims and bids are settled by officers in Discord.

## Maintaining this

### Layout

`index.html` is the whole site — one file, no build step, no dependencies. Top to bottom:

1. `<style>` — design tokens on `:root`, then components. Colours are tokens (`--gold`, `--crimson`, `--sage`, …); never hard-code a hex in a component.
2. Markup — each `<section>` is one block of the page. Tables are empty shells; script fills them.
3. `<script>` — constants, then AP maths, then render functions, then an IIFE at the bottom that wires it together.

The script has no framework and touches the DOM directly. Keep it that way unless something genuinely needs more.

### The parts you'll actually change

| Want to | Do this |
| --- | --- |
| Change an AP rate or item price | Edit `ap_rules.json`. Nothing in the HTML. |
| Add an event to standings | Add `{prefix:'Crusade', event:'crusade_dominion', short:'Crusade'}` to `COLUMNS`, and make sure the sheet has a `Crusade …` period column with `Att` under it. |
| Show a different guild | `GUILD_TAG` — `null` for Jollibee, `'Horde'`, `'DM'`, or `'ALL'`. |
| Point at a different sheet | `SHEET_ID` and `PERIOD_GID`. |
| Change the look | The `:root` token block. Both the palette and the three font roles live there. |

### Gotchas worth knowing before you touch it

- **`ap_rules.json` is the single source of numbers.** The page reads it at runtime. If you find yourself typing a number into the HTML, it belongs in the JSON instead.
- **There is a built-in check.** On load the page asserts a full week of activity comes to 1,086 AP and scheduled-only to 575. Break either and a red banner appears at the top of the live site. Don't delete the check — fix the numbers.
- **Address the sheet tab by gid, not by name.** The `gviz` endpoint takes a tab name but silently truncates this sheet at ~90 columns, and the attendance columns are past that. `export?format=csv&gid=` returns all 143.
- **The sheet's header is two rows.** Row 1 names the period, row 2 marks `Att` / `Pay`, and merged cells leave the period name on its first column only — hence the forward-fill in `readPeriod`. Don't "simplify" that away.
- **`localStorage` only remembers which member you picked.** Every read and write is in a try/catch and the page works without it. Don't put anything that matters in there.
- **GitHub Pages caches for about ten minutes.** After a push, add `?v=2` to the URL to see your change immediately.

### Deploying

Push to `main`. Pages rebuilds on its own; there's no action to run and nothing to configure. Check the Actions tab if a deploy looks stuck.

## Running it locally

`index.html` fetches `ap_rules.json`, which browsers block over `file://`. Serve the folder instead:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.
