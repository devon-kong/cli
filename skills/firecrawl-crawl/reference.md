# firecrawl crawl — reference

Advanced detail for `firecrawl-crawl`. Load this when you need the full option set, the async (submit-now / fetch-later) flow, self-hosted specifics, or tuning.

## Full options

| Option                  | Description                                                      |
| ----------------------- | --------------------------------------------------------------- |
| `--wait`                | Wait for the crawl to finish before returning (pair with `--progress`) |
| `--progress`            | Show progress and use the reliable poll loop (honors `--timeout`) |
| `--timeout <s>`         | Max seconds to wait — **only honored together with `--progress`** |
| `--limit <n>`           | Max pages to crawl                                              |
| `--max-depth <n>`       | Max link depth to follow                                        |
| `--include-paths <p>`   | Only crawl URLs matching these paths                            |
| `--exclude-paths <p>`   | Skip URLs matching these paths                                  |
| `--max-concurrency <n>` | Max parallel page workers                                       |
| `--delay <ms>`          | Delay between requests                                          |
| `--sitemap <mode>`      | Sitemap handling: `skip` \| `include`                           |
| `-o, --output <path>`   | Output file path                                                |
| `--pretty`              | Pretty-print JSON output                                        |

## Synchronous (simplest): submit and wait

```bash
firecrawl crawl "<url>" --limit 30 --wait --progress --timeout 240 -o .firecrawl/crawl.json
```

Returns the full page content once done. Use synchronous mode **only for small, scoped crawls (`--limit ≤ 30`)**; for larger or uncertain crawls, scope down / batch, or use the async flow below.

## Timeout sizing (self-hosted) — let the shell auto-compute

`--timeout` is a **failure budget (a ceiling), not an ETA**: the crawl returns as soon as it's `completed`, so a generous ceiling costs nothing on success — it only delays *giving up* if the crawl genuinely stalls. The real danger is the other side: a too-small `--timeout` `exit 1`s mid-crawl and **discards the pages already fetched**. So size it a bit above the expected wall clock — not 2–3× over.

Measured throughput on our self-hosted VPS: **~4–5 s/page + ~10–25 s fixed overhead** (limit5 ≈ 34 s, limit10 ≈ 62 s, limit20 ≈ 100 s; limit30 finishes ≈ 150–175 s — 3 low points, ≥40 is extrapolation, don't treat as exact).

**Budget formula (≈1.4–1.6× measured — margin for load variance):** `--timeout ≈ limit × 6 + 60` seconds.

Don't do the math by hand — let the shell compute it (this stays inside the `firecrawl` allowed-tool, no extra tool needed). Put the page count in both spots:

```bash
firecrawl crawl "<url>" --include-paths /docs --limit 30 --wait --progress --timeout $(( 30 * 6 + 60 )) -o .firecrawl/crawl.json
```

`$(( 30*6+60 ))` → 240 s — above the ~175 s a limit-30 crawl actually takes, with headroom for load (the agent that ran limit30 at a flat `--timeout 180` only *just* made it). If your runtime prompts on `$(( … ))`, substitute the number from the table.

| Limit | Auto-sized `--timeout` (`limit×6+60`) |
| --- | --- |
| 10 | 120 s |
| 20 | 180 s |
| 30 | 240 s |
| > 30 | scope down / batch into ≤30, or go async |

> If you're *forced* to run a single sync crawl above 30 pages (not recommended), use a bigger margin — `limit × 8 + 120` — since you're past the measured zone. Better: go async, so a client-side timeout can't discard an already-finished job.

## Asynchronous: submit now, fetch later

> ⚠️ **Not an agent-autonomous path.** Fetching content by job id needs `curl` + `python3`, which are deliberately **not** in this skill's `allowed-tools` — a crawl skill ingests untrusted web pages, so broad `curl`/`python3` would be a prompt-injection / data-exfiltration risk. Run this flow **as the operator**, or wrap it in a dedicated helper that accepts a job id only (so the skill itself never needs broad `curl`/`python3`). **Don't widen this skill's `allowed-tools` to make it run unattended.**

The CLI can submit and report status but **cannot return page content by job id** — fetch it from the raw API.

1. **Submit** (returns a job id immediately, does not wait); save the id:
   ```bash
   firecrawl crawl "<url>" --limit 50 | tee .firecrawl/crawl-job.json
   # -> {"data":{"jobId":"<id>","status":"processing"}}
   ```
2. **Poll status with a bounded cap** — repeat until `status == completed`, but with your own max-attempts limit; **don't loop forever and don't hammer-retry** (that piles work onto the VPS):
   ```bash
   firecrawl crawl <jobId> --status
   ```
3. **Fetch content** from the raw API once `status == completed`. Read url+key from **env first (`FIRECRAWL_API_URL` / `FIRECRAWL_API_KEY`), then the stored config** — env-first so the fetch targets whichever backend you submitted the job to — and **never print the key**:
   ```bash
   CONF="$HOME/Library/Application Support/firecrawl-cli/credentials.json"
   URL="${FIRECRAWL_API_URL:-$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('$CONF')))['apiUrl'])")}"
   KEY="${FIRECRAWL_API_KEY:-$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('$CONF')))['apiKey'])")}"
   curl -s --max-time 20 "$URL/v2/crawl/<jobId>" -H "Authorization: Bearer $KEY" -o .firecrawl/crawl.json
   ```
   Response: `{"status":...,"data":[{"markdown":...,"metadata":...}, ...]}`. **Trust `data` only when `status == completed`** — while running it's partial; if you must keep a partial, write it to `.firecrawl/crawl.partial.json`, not the final file.

## Self-hosted instance specifics

This CLI is pointed (via `credentials.json` → `apiUrl`) at a self-hosted Firecrawl. Root cause of the main gotcha: plain `--wait` calls the SDK's `app.crawl()` waiter, which never detects completion against self-hosted. Failure modes that differ from cloud:

| Symptom / trigger | First fix | If it still fails |
| --- | --- | --- |
| `crawl --wait` never returns (hangs); `--timeout` ignored | Add `--progress` — uses the CLI's own poll loop and honors `--timeout` | Submit without `--wait`, poll `firecrawl crawl <jobId> --status`, then fetch content via the raw API (above) |
| `--wait --progress --timeout N` exits 1 with an empty `-o` file on a big crawl | The `--timeout` fired mid-crawl: the CLI `process.exit(1)` before writing, discarding pages already fetched — **the server keeps running and will finish**. Don't trust the empty file. | Re-run with a budgeted `--timeout` (sizing above), or go async — the job may already be `completed`; fetch it by id via the raw API |
| `firecrawl crawl <jobId>` shows status but no page content | Expected: it returns only `id/status/total/completed/creditsUsed/expiresAt`; `data` is stripped | Fetch content via the raw-API curl (above), or re-run with `--wait --progress` |
| Crawl very slow or overloads the server | Lower `--max-concurrency`, add `--delay <ms>` | Scope harder with `--include-paths` / `--limit` — the backend is your own VPS |
| `creditsUsed: -1` in status | Expected on self-hosted (no credit accounting) — ignore it | — |

Always read `apiUrl`+`apiKey` from `credentials.json` (don't hardcode host/port; don't echo the key).

## Credits (cloud only)

On Firecrawl **cloud**, crawl consumes credits per page — check `firecrawl credit-usage` before large crawls. On self-hosted this does not apply (`creditsUsed: -1`).

## Tuning

- `--include-paths` / `--exclude-paths`: scope the crawl — don't crawl a whole site for one section.
- `--max-concurrency` / `--delay`: **on self-hosted, the backend is your own modest VPS.** Raising `--max-concurrency` ≈ **no speedup** (measured limit20: 99.7 → 93.6 s, ~6% — the bottleneck is server-side scheduling, not client concurrency). Use it only to *reduce* load (lower it, add `--delay`) when the server struggles — never to go faster.

## See also

- [firecrawl-scrape](../firecrawl-scrape/SKILL.md) — scrape a single page
- [firecrawl-map](../firecrawl-map/SKILL.md) — discover URLs before deciding to crawl

## Maintenance note (local divergence from upstream)

This skill came from `github.com/firecrawl/cli`. To survive a future `skillshare update firecrawl-crawl`, the changes to **`SKILL.md`** vs upstream are (all runtime-neutral, no env specifics): the recommended command is bounded (`--wait --progress --timeout`, `--limit 30`); a short **Mode selection** section (≤30 sync / >30 scope-and-batch); and three Don'ts (no `--wait --progress` without `--timeout`, no small `--timeout` on big crawls, no `--max-concurrency` for speed). All self-hosted/async specifics — per-page throughput, the timeout-sizing table, and the raw-API fetch flow — live here in **`reference.md`**, which upstream does not ship, so `update` won't overwrite it. After an update, re-apply the `SKILL.md` delta above; keep env-specific numbers out of `SKILL.md`.
