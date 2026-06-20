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
firecrawl crawl "<url>" --limit 50 --wait --progress -o .firecrawl/crawl.json
```

Returns the full page content once done. Prefer this unless you specifically want to fire-and-forget.

## Asynchronous: submit now, fetch later

The CLI can submit and report status, but **cannot return page content by job id** — fetch the content from the raw API.

1. **Submit** (returns a job id immediately, does not wait):
   ```bash
   firecrawl crawl "<url>" --limit 50
   # -> {"data":{"jobId":"<id>","status":"processing"}}
   ```
2. **Check progress** (status only):
   ```bash
   firecrawl crawl <jobId> --status
   ```
3. **Fetch the content** from the raw API. Read the key AND url from the CLI's stored config — **do NOT print the key**, pipe it straight into the header:
   ```bash
   CONF="$HOME/Library/Application Support/firecrawl-cli/credentials.json"
   URL=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('$CONF')))['apiUrl'])")
   KEY=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('$CONF')))['apiKey'])")
   curl -s "$URL/v2/crawl/<jobId>" -H "Authorization: Bearer $KEY" -o .firecrawl/crawl.json
   ```
   The response is `{"status":...,"data":[{"markdown":...,"metadata":...}, ...]}`. While running, `data` may be partial; when `status` is `completed`, it's the full set.

## Self-hosted instance specifics

This CLI is pointed (via `credentials.json` → `apiUrl`) at a self-hosted Firecrawl. Root cause of the main gotcha: plain `--wait` calls the SDK's `app.crawl()` waiter, which never detects completion against self-hosted. Failure modes that differ from cloud:

| Symptom / trigger | First fix | If it still fails |
| --- | --- | --- |
| `crawl --wait` never returns (hangs); `--timeout` ignored | Add `--progress` — uses the CLI's own poll loop and honors `--timeout` | Submit without `--wait`, poll `firecrawl crawl <jobId> --status`, then fetch content via the raw API (above) |
| `firecrawl crawl <jobId>` shows status but no page content | Expected: it returns only `id/status/total/completed/creditsUsed/expiresAt`; `data` is stripped | Fetch content via the raw-API curl (above), or re-run with `--wait --progress` |
| Crawl very slow or overloads the server | Lower `--max-concurrency`, add `--delay <ms>` | Scope harder with `--include-paths` / `--limit` — the backend is your own VPS |
| `creditsUsed: -1` in status | Expected on self-hosted (no credit accounting) — ignore it | — |

Always read `apiUrl`+`apiKey` from `credentials.json` (don't hardcode host/port; don't echo the key).

## Credits (cloud only)

On Firecrawl **cloud**, crawl consumes credits per page — check `firecrawl credit-usage` before large crawls. On self-hosted this does not apply (`creditsUsed: -1`).

## Tuning

- `--include-paths` / `--exclude-paths`: scope the crawl — don't crawl a whole site for one section.
- `--max-concurrency` / `--delay`: **on self-hosted, the backend is your own modest VPS** — high concurrency can overload it and slow everything down. Raise concurrency cautiously; add `--delay` if the server struggles.

## See also

- [firecrawl-scrape](../firecrawl-scrape/SKILL.md) — scrape a single page
- [firecrawl-map](../firecrawl-map/SKILL.md) — discover URLs before deciding to crawl

## Maintenance note (local divergence from upstream)

This skill came from `github.com/firecrawl/cli`. To survive a future `skillshare update firecrawl-crawl`, the only change to **`SKILL.md`** vs upstream is: the recommended command pairs `--wait` with `--progress`, a one-clause note that plain `--wait` can hang on self-hosted, and pointers to this file. All self-hosted/async specifics live here in **`reference.md`**, which upstream does not ship, so `update` won't overwrite it. After an update, re-apply the small `SKILL.md` delta.
