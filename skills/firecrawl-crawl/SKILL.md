---
name: firecrawl-crawl
description: |
  Bulk extract content from an entire website or site section. Use this skill when the user wants to crawl a site, extract all pages from a docs section, bulk-scrape multiple pages following links, says "crawl", "get all the pages", "extract everything under /docs", "bulk extract", needs content from many pages on the same site, or wants to check the status of / retrieve results from a previously submitted crawl job. Handles depth limits, path filtering, and concurrent extraction.
allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
---

# firecrawl crawl

Bulk-extract content from a website, following links up to a depth/page limit. Returns clean markdown per page.

## When to use

- You need content from many pages on one site (e.g. all of `/docs/`).
- Step 4 in the [workflow](firecrawl-cli): search → scrape → map → **crawl** → interact.

**When NOT:** one known page → use `scrape`; just listing URLs → use `map`.

## Recommended command

```bash
firecrawl crawl "<url>" --include-paths /docs --limit 30 --wait --progress --timeout 240 -o .firecrawl/crawl.json
```

Always pair `--wait` with `--progress`, **and always set a `--timeout`**. `--progress` polls reliably, honors `--timeout`, and returns the page content. Two ways this hangs an agent otherwise: plain `--wait` *without* `--progress` waits forever on self-hosted; `--wait --progress` *without* `--timeout` polls forever if the crawl never reaches `completed`. Size `--timeout` to the crawl — per-page budget and an auto-sizing command are in **[reference.md](reference.md)**.

## Mode selection (agents)

- **Small, scoped crawl (`--limit ≤ 30`)** → bounded synchronous: the command above.
- **`--limit > 30`, a slow/unknown site, or `--max-depth ≥ 3` with many pages** → **don't just raise `--timeout`** (when it fires it throws away the pages already fetched). **Scope down** with `--include-paths` and split into ≤30-page batches. True fire-and-forget against self-hosted is a separate, non-autonomous flow → **[reference.md](reference.md)**.

## Common options

| Option                 | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `--limit <n>`          | Max pages to crawl                             |
| `--max-depth <n>`      | Max link depth to follow                       |
| `--include-paths <p>`  | Only crawl URLs matching these paths (scope it)|
| `--exclude-paths <p>`  | Skip URLs matching these paths                 |
| `--progress`           | Reliable completion + progress (use with `--wait`) |
| `-o <path>`            | Write results to a file (recommended for crawl)|

## Getting the results

- `--wait --progress` returns the crawled pages directly (stdout or `-o`).
- `firecrawl crawl <jobId>` returns **only status** (done / page counts) — **not** content. There is no CLI command to fetch content from an already-submitted job; for the async "submit now, fetch later" flow, see **[reference.md](reference.md)**.

Crawl output can be large — write with `-o` and inspect with `grep`/`head`; don't read the whole file into context.

## Don'ts

- ❌ **Don't run bare `firecrawl crawl <url> --wait`** (without `--progress`) — on self-hosted it hangs forever and ignores `--timeout`. Always add `--progress`.
- ❌ **Don't run `--wait --progress` without `--timeout`** — it polls forever if the crawl never reaches `completed`, hanging the agent session. Always bound it.
- ❌ **Don't set a small `--timeout` for a large crawl** — when it fires, the CLI exits before writing results and the already-fetched pages are lost (empty `-o` file). Scope down / batch instead.
- ❌ **Don't use `--max-concurrency` to speed up a self-hosted crawl** — measured ≈ no gain (the bottleneck is server-side scheduling); use it only to *reduce* load.
- ❌ **Don't re-crawl a site to get an already-submitted job's content** — `firecrawl crawl <jobId>` returns status only; fetch the content via the raw API (**[reference.md](reference.md)**).
- ❌ **Don't hardcode the API host/port or echo the API key** — read both from `credentials.json` (see reference.md).

## More

Full option set, async + raw-API content retrieval, self-hosted specifics, and tuning → **[reference.md](reference.md)**.
