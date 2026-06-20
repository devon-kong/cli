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
firecrawl crawl "<url>" --include-paths /docs --limit 50 --wait --progress -o .firecrawl/crawl.json
```

Always pair `--wait` with `--progress`. `--progress` polls reliably, honors `--timeout`, and returns the page content. (Plain `--wait` *without* `--progress` can hang indefinitely against a self-hosted server — always include `--progress`.)

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
- ❌ **Don't re-crawl a site to get an already-submitted job's content** — `firecrawl crawl <jobId>` returns status only; fetch the content via the raw API (**[reference.md](reference.md)**).
- ❌ **Don't hardcode the API host/port or echo the API key** — read both from `credentials.json` (see reference.md).

## More

Full option set, async + raw-API content retrieval, self-hosted specifics, and tuning → **[reference.md](reference.md)**.
