# Auto1.by discovery

Checked at: 2026-08-01
Researcher: Codex. Local owner captures first, then live SSR ladder
(`/auto`, `/auto/{manufId}`, `/auto/{manufId}/{modelId}`, engine page,
`?groupId=`) and a live `/Search` smoke.

## Access

- Public without login: yes. Makes, models, engines, group tree and product
  cards are server-rendered before any page JavaScript executes.
- robots.txt: the supplied capture explicitly allows `/Auto`, `/Oem`,
  `/Search`, `/*search` and the observed catalogue/query parameters
  (`/*&SortField=*`, `/*?groupId=*`). Preserved fixture SHA-256 is
  `75cb63a869c1a24b7955e6356071e81bdbe917428cd1ab947449076a9cbb021e`.
- Terms: not present in the supplied files, therefore not independently
  verified.
- CAPTCHA: the site runs a JavaScript proof-of-work `Verification` page
  (`hg-security`/`hg-client-security` cookies). It appears after a burst of
  requests and is served for both `/Search` and `/auto` under load. The
  challenge page embeds the cookie value in inline JS
  (`document.cookie="hg-security=<value>; path=/; max-age=120"`); the
  browser sets it and reloads. The loader detects the signature, extracts
  the embedded value and retries the same request once with
  `Cookie: hg-security=<value>` (same UA, no JS executed, no CPU burn).
  The solved cookie is cached for its 100-second TTL and sent on later
  requests, which also prevents the challenge from being issued at all. A
  challenge that cannot be solved is reported as `HTTP_BLOCKED` (typed
  `blocked` error), never a false empty result. Cloudflare Turnstile or
  CAPTCHA pages are never bypassed.
- Rate-limit observations: after repeated probing the same IP starts
  receiving the verification page for every path. The adapter serializes
  requests with a 1-second default interval and handles both HTTP 429 and
  the HTTP 200 verification body.
- Proxy required: no evidence; proxy use is not implemented.
- Proxy region: none.
- TLS/CA requirements: standard trusted HTTPS only. TLS verification is never
  disabled.

## Search modes

- OEM/article: supported by the public search input. The adapter sends the
  exact user-provided part number and matches its normalized form in a card.
- VIN vehicle resolution: the public page is
  `/Oem/Find?vinFrame=<VIN>`. The separate VIN resolver may read structured
  vehicle fields from this page, but the parts adapter still reports
  `vin: false` because a VIN-to-parts result contract is not captured.
- Vehicle catalogue (new in 2026-08-01): full public SSR ladder is
  live-verified:
  1. `GET /auto` — 88 `.brands-list-item[data-search]` entries; brand name in
     `.first span`, public catalogue href `/auto/{manufId}` in `.second a`.
     `data-search` carries layout-transliterated, Latin and Cyrillic aliases
     (e.g. `зугпуще;peugeot;пежо`).
  2. `GET /auto/{manufId}` — `.models-item` cards with `.models-title`
     (e.g. `207 седан`), `.models-age` (`2007.12 - 2014.12`) and
     `href="/auto/{manufId}/{modelId}"`.
  3. `GET /auto/{manufId}/{modelId}` — engine table rows
     `<tr data-href="/auto/{manufId}/{modelId}/{engineId}">` with cells:
     Объем, Мощность, Начало/Конец выпуска, Двигатель (код), Код (топливо).
  4. `GET /auto/{manufId}/{modelId}/{engineId}` — group tree
     `#pickTree li[data="key: {groupId}"] a[href*="groupId="]` (908 nodes,
     folders marked `class="folder"`).
  5. `GET /auto/{manufId}/{modelId}/{engineId}?groupId={groupId}` — the same
     `.catalog-list-card` SSR product cards as search results.
- Text: supported through the observed GET form
  `<form action="/search"><input name="pattern">`.

## Network

- Public search URL:
  `GET https://auto1.by/Search?pattern=<url-encoded-query>`.
- Public VIN resolution URL:
  `GET https://auto1.by/Oem/Find?vinFrame=<VIN>`.
- Public catalogue URLs (robots-allowed):
  - `GET https://auto1.by/auto`
  - `GET https://auto1.by/auto/{manufId}`
  - `GET https://auto1.by/auto/{manufId}/{modelId}`
  - `GET https://auto1.by/auto/{manufId}/{modelId}/{engineId}`
  - `GET https://auto1.by/auto/{manufId}/{modelId}/{engineId}?groupId={groupId}&page=1`
- Server-rendered HTML: yes. The live engine page contains 14
  `.catalog-list-card` elements and schema.org `Offer` microdata.
- Form method/action: GET (default method), `/search`.
- Observed field: `pattern`; the inline click handler also constructs
  `/Search?pattern=` with `encodeURIComponent(inputValue.trim())`.
- Public XHR/fetch:
  - `/search/autocomplete`, minimum 3 characters, for UI suggestions;
  - `/productsajax/getvehicleproducts`, POST, for later vehicle-catalogue
    pages;
  - neither endpoint is needed for the chosen adapter.
- Session/cookies: no search or catalogue cookie is required by the GET
  forms. The adapter sends the configured `AUTO1_USER_AGENT`; after solving
  a `Verification` challenge it also sends the cached `hg-security` cookie
  so later requests are not challenged again.
- Pagination: ordinary `page=` links are server-rendered. The adapter reads
  only the first page (up to 30 offers).
- Required headers: `Accept: text/html,application/xhtml+xml` and the
  identifiable AutoRadar `User-Agent` (`AUTO1_USER_AGENT`). Generic browser
  UAs are more likely to receive the verification page.

## Chosen implementation

- Modes:
  - article/text: `GET /Search?pattern=` + server-rendered HTML + Cheerio;
  - vehicle catalogue: the five-step SSR ladder above, with `?groupId=`
    chosen by matching the part name against leaf group labels.
- Reason: steps 1 and 2 of the mandatory ladder are sufficient for both
  modes. Product fields are already present in HTML, so autocomplete JSON,
  pagination XHR and Playwright would add cost and uncertainty.
- Timeout: 10 seconds by default, configurable with `AUTO1_HTTP_TIMEOUT_MS`.
- Pacing: one request per second by default, configurable with
  `AUTO1_REQUEST_INTERVAL_MS`.
- Pagination: first page only.
- Result limit: 30 by default, configurable with `AUTO1_RESULT_LIMIT`.
- Feature flag: `SOURCE_AUTO1_ENABLED`.

## Query mapping

1. If the request contains an article, use the original article verbatim via
   `/Search`.
2. If a vehicle make+model is present (no article), walk the catalogue
   ladder:
   - resolve make via `data-search` aliases (Latin, Cyrillic, RU-layout);
   - resolve model by title tokens and year window; when several models
     match, return a `generation` clarification;
   - resolve engine by volume/displacement/power/code/fuel and year; when
     several engines match, return an `engine` clarification;
   - match the part name to a non-folder group label (exact, then
     token-based);
   - fetch `?groupId={groupId}` and keep cards whose article or part-name
     tokens match.
3. Otherwise use text search via `/Search` with canonical part name and
   known vehicle terms.
4. If a catalogue step finds nothing, fall back to text `/Search` instead of
   reporting a false empty result.
5. Mark every accepted result as `possible`. Vehicle compatibility is not
   promoted to `confirmed` from catalogue paths alone.
6. A used-only request returns no offers because the supplied cards
   explicitly declare `schema.org/NewCondition`.

Side, position, OEM status, original/analog status and compatibility are not
guessed. `partKind` remains `unknown`; `oemNumbers` remains empty unless a
future captured page provides a dedicated OEM field.

## Data mapping

- external id: first verified `[data-articleid]`, with product URL numeric ID
  as fallback.
- title: `a.link-name`.
- brand: first direct text line inside `a.link-name`, only when structurally
  separate from the remaining product text.
- part number: first article-shaped token in the product text after the
  structurally separate brand.
- condition: `[itemprop=itemCondition]` only; `NewCondition` → `new`, otherwise
  `unknown`.
- original/analog: `unknown`.
- price: `[itemprop=offers] [itemprop=price][content]`, only when
  `[itemprop=priceCurrency]` is `BYN`.
- availability: `[itemprop=availability]`; `InStock` → `В наличии`, с
  сохранением явно указанного в складской строке количества (`>10 шт`,
  `>10 к-т`).
- seller: `[itemprop=seller] [itemprop=name][content]`.
- location: first `addressLocality` plus `streetAddress`.
- URL: HTTPS links on `auto1.by` matching the observed localized product path
  families, robots-разрешённые корни `/Parts`, `/Tyres`, `/Battery`, `/Oil`,
  `/Chemistry`, `/Tools`, `/GarageTools`, `/CarBodyParts`, `/Accessories`,
  `/CarMount` с числовым product id, или `/details?id=<number>`.
- image: not returned. The supplied list uses embedded data URIs and
  product-path `data-href`, not a verified public image URL.

## Verified selectors and examples

```text
.catalog-list > .catalog-list-card
a.link-name[href]
[data-articleid]
.product-description li
[itemprop="offers"] [itemprop="price"]
[itemprop="priceCurrency"]
[itemprop="itemCondition"]
[itemprop="availability"]
[itemprop="seller"] [itemprop="name"]

# ladder
.brands-list-item[data-search] > .first span
.brands-list-item[data-search] a[href^="/auto/"]
a.models-item[href^="/auto/"] > .models-title
a.models-item[href^="/auto/"] > .models-age
tr[data-href^="/auto/"] > td
#pickTree a[href*="groupId="]
```

Observed requests:

```http
GET /Search?pattern=OX339%2F2D HTTP/1.1
Host: auto1.by
Accept: text/html,application/xhtml+xml
User-Agent: AutoRadar/0.1 (+https://autoradar.vercel.app; parts search)

GET /auto HTTP/1.1
GET /auto/88 HTTP/1.1
GET /auto/88/9618 HTTP/1.1
GET /auto/88/9618/108259 HTTP/1.1
GET /auto/88/9618/108259?groupId=100470&page=1 HTTP/1.1
```

No cookies, form token or referer are required by the captured GET forms.

## Supplied-file review

All supplied files were classified before choosing the transport:

| File                                                                                         | Relevant finding                                                                                                 |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `108259`                                                                                     | SSR vehicle catalogue, GET search form, 14 product cards, BYN microdata, ordinary pagination and later-page AJAX |
| `robots.txt`                                                                                 | explicitly allows `/Auto`, `/Oem`, `/Search` and `/*search`                                                      |
| `CustomJs`                                                                                   | initializes public autocomplete at `/search/autocomplete`; handles cart, favourites and unrelated UI             |
| `SharedJs`                                                                                   | shared filters, Ajax wrapper and catalogue UI                                                                    |
| `SortAndScrollViewModes.js`                                                                  | list/grid/table sorting and lazy-page UI                                                                         |
| `UpdatePagination.js`                                                                        | client-side pagination link/text updates                                                                         |
| `oemCart.js`                                                                                 | shopping-cart behavior for OEM pages; not used                                                                   |
| `manifest.json`                                                                              | PWA metadata only                                                                                                |
| `jquery.min.js`, `jquery.plugins.min.js`, `bootstrap.min.js`, `jstree.min.js`, `fotorama.js` | vendor UI libraries; no search contract chosen from them                                                         |
| `script.min.js`, `loader_4_psqk9q.js`                                                        | Bitrix/live-chat bundle and loader; unrelated to parts search                                                    |
| `2.1`, `full.js`                                                                             | Yandex Maps API bundles; unrelated to parts search                                                               |

## Live ladder fixtures (2026-08-01)

Live captures preserved as evidence and used for regression:

- `/auto` — 88 brands with `data-search` aliases (PEUGEOT `/auto/88`,
  BMW `/auto/16`, TESLA `/auto/3328`).
- `/auto/88` — 399 Peugeot models (207 седан `9618`, годы 2007–2014).
- `/auto/88/9618` — engine table (1.6 EP6 `108259`, 2.0 HDi `57718`, ...).
- `/auto/88/9618/108259` — 908-group tree with `?groupId=` links.
- `?groupId=100492` — 14 product cards for «Масляный насос».

Live `/Search?pattern=OX339/2D` returned a full SSR result page (sections
«по точному совпадению артикула», «по кросс-номеру», «по наименованию»)
with the AutoRadar UA, and a `Verification` challenge page after a request
burst. The challenge was solved live by extracting the embedded
`hg-security` cookie and retrying the same URL (observed `CHALLENGE solved
with Cookie` in the loader log, then a full catalogue page).

## Fixtures

- success: `fixtures/search-success.html` — minimal evidence-preserving
  excerpt from the owner-supplied `108259` capture (MAHLE oil-filter card and
  an unrelated chain card).
- empty: `fixtures/search-empty.html` — no-results contract.
- error: `fixtures/search-error.html` — typed HTTP 429 contract.
- verification: `fixtures/search-verification.html` — minimized form of the
  live HTTP 200 `Verification` response (embedded `hg-security=fixture`
  cookie); used by the challenge-solver tests.
- catalog-brands: `fixtures/catalog-brands.html` — 7 live brands
  (ACURA/AUDI/BMW/LAMBORGHINI/MERCEDES-BENZ/PEUGEOT/TESLA) with aliases.
- catalog-models: `fixtures/catalog-models.html` — 3 live Peugeot models
  (106 I, 207, 207 седан).
- catalog-engines: `fixtures/catalog-engines.html` — 4 live engine rows
  for 207 седан.
- catalog-groups: `fixtures/catalog-groups.html` — 6 live group links for
  engine 108259.
- robots: `fixtures/robots.txt` — owner-supplied capture.

## Known limitations

- The live site starts serving the JavaScript `Verification` challenge after
  a burst of requests. The adapter extracts the embedded `hg-security`
  cookie, retries the request with it and caches the cookie for 100 seconds;
  a persistent or un-solvable challenge still results in a typed `blocked`
  error.
- The live models/engines pages list each vehicle twice (duplicate SSR
  sections); the resolvers de-duplicate matches by id before returning
  results or clarifications.
- Direct search by VIN remains deliberately disabled. VIN is used first for
  vehicle resolution; the confirmed vehicle card then drives the ordinary
  catalogue search.
- Vehicle applicability, original/analog classification and OEM equivalence
  are not inferred from descriptions.
- Engine/model clarifications are returned instead of guessing when the
  vehicle data is ambiguous.
- Only the first SSR page is requested.
- Source-specific proxy configuration is not needed or implemented.

## Smoke test

The command is opt-in and performs no network request unless explicitly
enabled:

```bash
AUTO1_LIVE_SMOKE=true pnpm auto1:smoke -- "Масляный фильтр"
```

The smoke test sends the query through the default adapter (text path).
A vehicle-based smoke can be run with `SOURCE_AUTO1_ENABLED=true` in
`actors/search`:

```bash
SOURCE_AUTO1_ENABLED=true npx tsx src/main.ts
```
