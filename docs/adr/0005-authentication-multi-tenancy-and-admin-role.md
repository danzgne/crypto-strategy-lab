# Authentication, multi-tenancy, and a two-role model

**Status:** accepted

The instructor's sample UI (`imgs/`, all five screens) shows a signed-in account, and the team decided the
system should simulate a production deployment rather than a single-operator demo. Nothing in the plan carried
any notion of a user before this: no User entity, no ownership column anywhere, and an anonymous Socket.IO
contract (`market:subscribe { chartId, pair, timeframe }`). This ADR adds authentication and makes the system
genuinely multi-tenant.

**Every user's strategy work is private.** `ownerId` sits on StrategyDefinition, StrategyVersion, Experiment,
Trade, SearchRun, BacktestJob, and Leaderboard entries, and every read and write path on those entities carries
`ownerId = currentUser`. **Market and news data are shared**: Candle, NewsItem, Sentiment, Extraction Template,
and the configured News Sources are global, as are the built-in strategy registry entries (MA, RSI, Bollinger
Bands, Support/Resistance, SMC, Wyckoff, NewsSentimentStrategy, RuleStrategy), which are boot-time code and
therefore shared by construction. Only a user's `params` values are personal. **The Leaderboard is per-user**,
not global.

Authentication is **self-managed**: email plus password, hashed with argon2, an httpOnly session cookie backed
by a Postgres session store, sitting behind an `AuthProvider` seam so a hosted provider becomes an adapter swap
rather than a rewrite. The Socket.IO handshake authenticates from the same cookie instead of inventing a second
scheme. The entire application sits behind the login gate, including the realtime chart, even though the market
data behind it is public.

Authorization is **two roles on a single user field**, `ADMIN` and `USER`, not a permissions system. Admin gates
exactly the writes that mutate shared infrastructure, which is the five write controls img3 actually draws plus
the HTML ingest path: configuring News Sources, starting a crawl, setting the crawl refresh interval, toggling
extraction-template drift detection, applying a proposed template version, and pasting raw HTML for ingest.
Everything else is open to any authenticated user, including the Pair filter, which is a view preference.
Creating strategies, running backtests, starting Discovery, and the Strategy Library are explicitly **not**
admin-gated, since they operate on per-user private data and gating them would make a normal account useless.
The first admin is seeded at boot from an `ADMIN_EMAIL` environment variable; every other registration is a
`USER`. There is no admin-management UI and no self-service promotion.

Admin confers **no cross-user visibility**. It governs shared infrastructure, not other people's strategy work.

## Considered Options

- **A login gate over one shared workspace** (auth proves identity, nothing is scoped per user): rejected. It is
  roughly a day cheaper and the mockup's account card only demonstrates identity, but it fails the stated
  "production system, not just for demo" bar, and retrofitting ownership onto seven tables after they carry data
  is materially worse than starting with it.
- **A hosted auth provider** (Clerk's free tier covers 50,000 monthly retained users, Auth0's 25,000 MAU):
  rejected for the build, kept reachable via the `AuthProvider` seam. Ownership and isolation are our code
  either way, since a provider supplies identity and not tenancy, so the saving is smaller than it looks. Against
  that, it puts a third external service (alongside Binance and the LLM vendors) on the critical path of a live
  defense demo. Self-managing it also makes auth the fourth swappable seam in a codebase whose grade rests on
  exactly that pattern.
- **A JWT held in localStorage**: rejected. It is readable by any XSS, where an httpOnly cookie is not, and it
  would need separate handling in the Socket.IO handshake.
- **A global Leaderboard where all users' experiments compete**: rejected. img1's Strategy column renders member
  compositions such as `MA + RSI + S/R`, so a shared board would publish every user's private strategy design to
  everyone. More demo-fun, but a real disclosure bug under the production framing.
- **A full RBAC system** (permissions, groups, policies): rejected. Six admin-gated actions exist in total; a
  role field covers them and anything more is machinery the mockups never show.
- **Admin as a superuser who can see all users' experiments and search runs**: rejected. Keeping role and
  ownership orthogonal means the ownership predicate stays a plain `ownerId = currentUser` with no role branch,
  which is less code and a much stronger answer when asked at defense how isolation is enforced.

## Consequences

- The Backtest Worker claims jobs across all users, so tenancy lives on the Experiment the job points at, not on
  the claim query. `SELECT ... FOR UPDATE SKIP LOCKED` is unchanged. See ADR-0007 for how fairness between users
  is handled instead.
- Market-data subscription reference counting (#29) is shared across users, unchanged: two users watching
  BTCUSDT 5m still share one upstream Binance connection and one Socket.IO room.
- A global Leaderboard, publishable strategies, or team workspaces are all feature requests against this
  decision rather than implications of it. Each would need the ownership predicate to grow a second branch.
- Revisit if: cross-user sharing becomes a requirement, or the operational cost of self-managed credential
  handling (reset flows, lockout, rotation) outgrows what the `AuthProvider` seam was meant to defer.
