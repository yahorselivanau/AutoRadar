# Remzona discovery

Checked at: 2026-07-29 (Europe/Minsk)
Researcher: Codex for AutoRadar

## Access and policy

- Public URL: `https://remzona.by/`.
- Public category example: `https://remzona.by/steklopodiemnik`.
- Public vehicle category example:
  `https://remzona.by/catalog/peugeot/308/steklopodiemnik`.
- Login: not required.
- Terms checked: `https://remzona.by/info/rules`.
- `robots.txt` disallows `/search` and generic `*?` URLs. The adapter does not
  request `/search` or query-string filter pages. It uses clean catalog paths
  and the same-origin public search XHR.
- CAPTCHA was observed only with HTTP 429 after rapid discovery traffic.
- Source-specific proxy: not required.
- TLS: ordinary verified HTTPS; no custom CA or TLS bypass.
- Cookies: not required for the verified HTTP search and catalog pages.

## Supported search modes

- Text/category: supported.
- OEM/article: product suggestions are supported; the linked product page is
  then loaded to look for a price.
- Vehicle make/model: supported when Remzona exposes exact clean catalog links.
- Year: accepted by AutoRadar but not claimed as a Remzona filter. Remzona
  requires a further body, engine and exact modification selection before it
  applies a year-specific vehicle.
- VIN: not verified and not supported.

## Mandatory ladder

1. HTTP + URL parameters: clean category and make/model catalog paths return
   server-rendered products.
2. Server-rendered HTML + Cheerio: selected as the primary offer and price
   source.
3. Public XHR: `POST /` is used only to resolve the user text to a verified
   category or product path.
4. Playwright: implemented as an opt-in fallback and manual discovery tool.
   It is not used when HTTP HTML contains priced offers.

## Verified HTTP/XHR contract

```http
POST / HTTP/2
Host: remzona.by
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest

typerequest=search&q=стеклоподъемник
```

The response contains:

```html
<div class="part-result" data-part="group">
  <a
    class="part-content"
    href="/steklopodiemnik"
    data-search-enter="Стеклоподъемник"
  ></a>
</div>
```

Verified clean catalog paths:

- `/steklopodiemnik`;
- `/catalog/peugeot/steklopodiemnik`;
- `/catalog/peugeot/308/steklopodiemnik`.

Required request headers:

- a descriptive `User-Agent`;
- `Accept: text/html,application/xhtml+xml` for catalog GET;
- `X-Requested-With: XMLHttpRequest` and form content type for search POST.

Timeout is configurable and defaults to 10 seconds. Requests are serialized
with a five-second default interval. Redirects are rejected.

## Verified selectors

- search candidate:
  `.part-result[data-part] a.part-content[href]`;
- candidate type: parent `data-part="group"` or `data-part="article"`;
- catalog card: `.box-articleitems > .item-list`;
- product link/title: `a.name-art[href]`;
- price: `.value_price [data-cur="BYN"]`;
- availability/delivery: `.part-available .part-param`, matched by the visible
  labels `Доступно` and `Доставка`;
- image: `img[data-src]`, then `img[src]`;
- internal product id: first `[data-art_id]`;
- make/model: exact visible anchor text and verified `/catalog/...` path.

Price extraction order:

1. JSON-LD `Product`/`Offer`;
2. `[itemprop="price"][content]`;
3. `meta[property="product:price:amount"]`;
4. `data-price` or `data-cost`;
5. verified DOM price text.

Prices are normalized as decimal strings, for example
`1 234,56 руб.` → `1234.56`. The source is recorded as `json_ld`,
`microdata`, `data_attribute` or `dom`. No public JSON price API was found, so
`api` is reserved but not emitted by the current live path.

The supplied full page `steklopodiemnik.html` produced 24 normalized cards;
all 24 contained prices. The first verified values were `2.00`, `2.70` and
`2.80` BYN.

## Playwright discovery and fallback

Manual discovery:

```bash
pnpm remzona:discover
```

Automated diagnostic pass:

```bash
REMZONA_DISCOVERY_HEADLESS=true \
REMZONA_DISCOVERY_AUTO_QUERY=стеклоподъемник \
REMZONA_DISCOVERY_AUTO_EXIT=true \
pnpm remzona:discover
```

`src/discovery/remzona.ts` launches headed Chromium, records a trace with DOM
snapshots/screenshots/network, captures XHR/fetch metadata and the first 100 KB
of JSON response bodies, and waits for Enter. It then writes:

- `network.json`;
- `storage-state.json` including IndexedDB;
- `final.html`;
- `final.png`;
- `trace.zip`.

Artifacts are written under gitignored
`output/playwright/remzona/<timestamp>/`.

The pass at `2026-07-29T09-11-01-604Z` produced `trace.zip`,
`network.json`, `storage-state.json` and `final.png`. Chromium timed out before
the initial document response, so no XHR/fetch was emitted and the screenshot
is blank. Independent IPv4 and IPv6 connection checks also timed out. This is
classified as `TIMEOUT`, not a DOM/parser failure.

A read-only request through the existing Vercel production route at
`2026-07-29T09:13Z` reached the same public Remzona XHR and returned HTTP 200
in about two seconds. Therefore the observed timeout is specific to the local
network/IP; the production Vercel egress currently reaches Remzona without a
proxy. That deployed route still contains the previous suggestion-only adapter
until these local changes are deployed.

Production Playwright fallback is opt-in:

```bash
REMZONA_PLAYWRIGHT_FALLBACK_ENABLED=true
```

It waits for a concrete product-card selector (or `h1` for a product page),
never for `networkidle`.

## Fixtures and diagnostics

- `search-category.html`: verified public category suggestion.
- `search-success.html`: verified product suggestions.
- `search-empty.html`: verified empty search response.
- `catalog-success.html`: trimmed from the supplied real category HTML,
  preserving title, URL, image, availability, delivery and BYN price markup.
- `catalog-empty.html`: explicit empty catalog.
- `search-error.html`: observed HTTP 429 markers.

Typed failures include the diagnostic reason in the message:

- `HTTP_BLOCKED`;
- `EMPTY_RESPONSE`;
- `PRICE_NOT_FOUND`;
- `DOM_CHANGED`;
- `TIMEOUT`.

If product containers exist but required card fields no longer parse, the
adapter returns `DOM_CHANGED`, never a successful empty result.

## Known limitations

- Compatibility, original/analog and new/used are not inferred.
- Exact year filtering is not claimed without completing Remzona's
  source-specific body/engine/modification selector.
- Playwright requires a Chromium-capable Actor/runtime and remains disabled in
  the default Next.js HTTP path.
- The source currently timed out during the 2026-07-29 live smoke. The parser
  and HTTP/fallback modes passed fixture tests, and the full supplied HTML
  passed a local real-page parse, but this timeout is not reported as a
  successful live verification.
- The verified `Стеклоподъемник` category bypasses the suggestion XHR and opens
  `/steklopodiemnik` directly. Other text/OEM queries still use the discovered
  XHR contract.
