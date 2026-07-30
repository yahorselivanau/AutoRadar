# Davinagaz.by discovery

Checked at: 2026-07-30  
Researcher: Codex, using owner-supplied captures first and two direct HTTP
checks after reviewing the supplied `robots.txt`.

## Access

- Public search declared by the supplied page:
  `GET https://davinagaz.by/search/number/?article=<article>`.
- The supplied `robots.txt` explicitly allows `/search/*`. Its SHA-256 is
  `a382525d0fc62291097d53533c1de56d2f624858635e84157a7a505c5452a445`.
- It declares `https://davinagaz.by/sitemap.xml`.
- Direct checks of the declared sitemap and the allowed article-search URL
  both returned HTTP 403 with `cf-mitigated: challenge` on 2026-07-30.
- The site owner supplied written permission to automate the public search.
- The adapter remains opt-in through `SOURCE_DAVINAGAZ_ENABLED=true`.

## Supplied evidence

- `10-kgb10-50kw-68hp` is a server-rendered vehicle/category page with 18
  `.ftr.element-for-filter` product rows. Product URL, title, brand, article,
  visible BYN price, package quantity, availability and delivery are present
  without executing JavaScript.
- `details` is the initial article-detail search page for
  `FAG713618870`. It contains no offers yet and visibly says
  `Поиск предложений...`.
- The `details` inline script documents a session-dependent sequence:
  four `POST /search/wws/` requests followed by
  `GET ?ajax=reload&resort=all`.
- That warehouse sequence is not implemented because the supplied capture
  contains only its initial page, not reproducible response fixtures, and
  current direct access is blocked by Cloudflare.
- `ab85e1a882.js` confirms autocomplete endpoints
  `/sphinx/live/` and `/cat/fsearch/`, but autocomplete is unnecessary for
  exact article search and is not called.
- The remaining supplied files are vendor UI, CAPTCHA, email-decoding or
  carousel libraries and do not provide a cheaper search contract.

## Chosen implementation

- Mode: direct HTTP GET plus SSR HTML parsing, with an authorized Playwright
  fallback only when the response is positively identified as a Cloudflare
  challenge.
- The fallback runs real Chromium through `playwright-extra` and
  `puppeteer-extra-plugin-stealth`, so the TLS handshake comes from the browser
  and common automation fingerprints are patched before page scripts run.
- Playwright is restricted to the same HTTPS host and `/search/` path as the
  HTTP loader. It does not solve CAPTCHA, access an account, call a private
  endpoint, or follow an off-site redirect.
- Search mode: article/OEM only. Free-text, VIN and vehicle-ID resolution are
  not claimed.
- Query mapping: use `rawPartNumber` verbatim, falling back to the normalized
  part number.
- Result policy: retain only a card whose normalized article exactly matches
  the requested article. Crosses and analogues are not inferred from the
  category capture.
- Dynamic placeholder pages raise `DYNAMIC_RESULTS` instead of being reported
  as a successful empty search.
- Cloudflare challenge pages switch to Playwright by default. If the browser
  still sees the challenge until its timeout, the adapter raises a typed
  `blocked` or `timeout` error instead of returning an empty result.
- HTTP timeout: 10 seconds; Playwright timeout: 25 seconds; pacing: one request
  per 1.5 seconds; maximum 30 parsed rows.

## Data mapping

- card: `.ftr.element-for-filter`
- external id: numeric `.btn-cart[id^=pre-]`
- URL/title: `.g-name a.g-descr-s`
- brand: `.g-descr-sup-brand a[data-brand][title]`
- article: `.g-article a.g-article`
- visible total price: `.g-price-bigprice`; `priceSource = dom`
- package note: `.g-price-complect`
- availability: `.g-box`
- delivery: `.g-delivery .d-center`
- location: `.g-delivery .hot-offer-title`
- condition and original/analog: `unknown`; the capture has no dedicated
  machine-readable condition or OEM classification.

Only HTTPS product URLs on `davinagaz.by` matching
`/detail/<article>/<brand>/` are accepted. Offers are validated by the shared
Zod schema.

## Fixtures

- `search-success.html`: minimal evidence-preserving extraction of the ZENNEK
  and PATRON rows from the supplied vehicle/category capture.
- `search-pending.html`: the observed initial warehouse-loading state from
  `details`.
- `search-empty.html`: structural empty parser fixture; it is not claimed as a
  captured production empty response.
- `search-error.html`: minimal form of the live-observed Cloudflare challenge.
- `robots.txt`: normalized line endings from the owner-supplied file.

## Live status

The HTTP-to-Playwright transition is fixture-tested. Live checks on 2026-07-30
reached the fallback, but Cloudflare still returned its localized HTTP 403
challenge in both headless and headed Chromium from the current development
IP. The adapter now reports that state as typed `blocked`. The site owner must
allowlist the production egress IP, hostname or service token before this
runtime can be considered reliable.

A deployment running this adapter must include the Playwright Chromium binary.
The fallback can be disabled with
`DAVINAGAZ_PLAYWRIGHT_FALLBACK_ENABLED=false`; its timeout is configured by
`DAVINAGAZ_PLAYWRIGHT_TIMEOUT_MS`.

The opt-in smoke command is:

```bash
DAVINAGAZ_LIVE_SMOKE=true pnpm davinagaz:smoke -- "FAG713618870"
```
