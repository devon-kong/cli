---
name: firecrawl-backends
description: >-
  Required context before ANY Firecrawl work. Read and apply whenever using the
  firecrawl CLI or any firecrawl skill (firecrawl-cli, firecrawl-scrape,
  firecrawl-map, firecrawl-crawl) — i.e. whenever the task is to scrape a URL,
  crawl a site, map URLs, or extract web content via Firecrawl. This machine has
  TWO Firecrawl backends: a private self-hosted instance (the default) and the
  official Firecrawl cloud (on-demand). It tells which command targets which
  backend and when to use each. Triggers: firecrawl, scrape, crawl, map, search,
  抓取, 爬取, 自托管, 云端, firecrawl-cloud.
---

# Firecrawl backends (read before any firecrawl command)

This machine has **two** Firecrawl backends. Same flags on both — just pick the command prefix.

| Backend | Command | Default? |
|---|---|---|
| **Self-hosted** (private) | `firecrawl <cmd>` | ✅ default |
| **Official cloud** | `firecrawl-cloud <cmd>` | on-demand only |

## Which backend — decide by situation

| Situation | Do this |
|---|---|
| No backend mentioned | `firecrawl …` (self-hosted default) |
| User explicitly asks for the cloud / official Firecrawl | `firecrawl-cloud …` |
| Self-hosted unreachable and cloud is acceptable | `firecrawl-cloud …` |
| `firecrawl-cloud` errors "cloud not configured" | cloud key missing → fix `~/.config/firecrawl/cloud.json`; **do NOT retry on self-hosted** |
| Unsure which backend is active | run `firecrawl --status` (self-hosted → "stored credentials"; cloud → shows credits) |

## Don'ts

- ❌ Use `firecrawl-cloud` without being asked — it spends limited cloud credits.
- ❌ Make a skill or agent depend on `fcs` / `fcc` — those are human-only; agents call `firecrawl` / `firecrawl-cloud` directly.
- ❌ Silently switch backends to "make it work" — if the requested backend fails (e.g. cloud not configured), surface the error; don't fall back to the other.
- ❌ Assume which backend is active — when unsure, check `firecrawl --status` first.

Then proceed with the relevant skill: firecrawl-cli, firecrawl-scrape, firecrawl-map, firecrawl-crawl.
