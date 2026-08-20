# Instructor-provided sample UI

Five reference screens handed to the team by the course instructor as a sample of what Crypto Strategy Lab's
frontend could look like. They are a **reference, not a contract**: the labels are Vietnamese, some panels show
features that were out of scope when they arrived, and a few contradict decisions recorded in `docs/adr/`.

They resolve [#24](https://github.com/danzgne/crypto-strategy-lab/issues/24) ("Prototype the Frontend
dashboard/UX layout & interaction design"), whose own wording accepts "a concrete wireframe/spec that finalizes
the UX" as its answer.

| File | Screen | Sidebar item |
| --- | --- | --- |
| `img1.jpg` | Strategy Engine & Loop Discovery: single-strategy list, composite builder with weighted voting, Discovery pipeline diagram, Leaderboard, search progress | Discovery |
| `img2.jpg` | Backtest & trade results: run parameters, backtest chart with entry/exit and SL/TP markers, trade table, metric cards | Backtest |
| `img3.jpg` | News Crawler & market analysis: source selection, news list, LLM-assisted extraction with template versioning, self-healing extraction, sentiment and event-type output | News Crawler |
| `img4.jpg` | Create Strategy from Prompt / URL: natural-language and URL inputs, parsed rules, generated JSON, validation, save to Strategy Library | Strategy Engine |
| `img5.jpg` | Realtime multi-timeframe chart: four independent chart panels, candle update/append explainer, connection status with latency, recent ticks | Realtime |

Sidebar navigation across all five: Realtime, Strategy Engine, Discovery, Backtest, News Crawler, Settings.

## Known divergences from these mockups

The mockups include an account card ("Pro Student" plan with an expiry date) and a notification bell. Only
authentication is in scope; subscription plans and notifications are not.

Every other divergence, in either direction, is reconciled in the decision documents. See `CONTEXT.md` and
`docs/adr/` for what was accepted, what was adapted, and what was left out.
