# Auto1.by discovery

Checked at: 2026-07-30
Researcher: Codex, owner-supplied local captures first, followed by one
allowed live `/Search` smoke.

## Access

- Public without login: yes in the supplied vehicle-catalog HTML. Product
  cards, price, availability, seller and links are server-rendered before any
  page JavaScript executes.
- robots.txt: the supplied capture explicitly allows `/Search`,
  `/Search/Autocomplete`, `/*search` and the observed catalogue/query
  parameters. The preserved fixture SHA-256 is
  `75cb63a869c1a24b7955e6356071e81bdbe917428cd1ab947449076a9cbb021e`.
- Terms: not present in the supplied files, therefore not independently
  verified in this offline discovery.
- CAPTCHA: absent from the supplied catalogue page. The live `/Search` smoke
  for `OX339/2D` returned an HTTP 200 JavaScript `Verification` page with a
  short-lived `hg-security` cookie. The loader recognizes that signature and
  reports `HTTP_BLOCKED` instead of a false empty result. It does not execute
  or bypass the challenge.
- Rate-limit observations: the one live search was verification-gated. The
  adapter serializes requests with a 1-second default interval and handles
  both HTTP 429 and the observed HTTP 200 verification body.
- Proxy required: no evidence of a requirement; proxy use is not implemented.
- Proxy region: none.
- TLS/CA requirements: standard trusted HTTPS only. TLS verification is never
  disabled.

## Search modes

- OEM/article: supported by the public search input. Its observed placeholder
  is `05P634 / VIN / Тормозные колодки дисковые`; the adapter sends the exact
  user-provided part number and matches its normalized form in a card.
- VIN: the supplied inline script redirects a 17-character value to
  `/Oem/Find?vinFrame=...`, but no result capture or access/response contract
  was supplied. The adapter deliberately reports no VIN capability and never
  calls this route.
- Vehicle: a public path catalogue is proven by
  `/auto/88/9618/108259?groupId=100002...`, but resolving make/model/type IDs
  was not proven from the supplied files. For a text search, the adapter adds
  known vehicle make, model, year, generation and engine as ordinary search
  terms; it does not claim catalogue-confirmed compatibility.
- Text: supported through the observed GET form
  `<form action="/search"><input name="pattern">`.

## Network

- Public search URL:
  `GET https://auto1.by/Search?pattern=<url-encoded-query>`.
- Server-rendered HTML: yes. The supplied `108259` capture contains 14
  `.catalog-list-card` elements and schema.org `Offer` microdata.
- Form method/action: GET (default method), `/search`.
- Observed field: `pattern`; the inline click handler also constructs
  `/Search?pattern=` with `encodeURIComponent(inputValue.trim())`.
- Public XHR/fetch:
  - `/search/autocomplete`, minimum 3 characters, for UI suggestions;
  - `/productsajax/getvehicleproducts`, POST, for later vehicle-catalog pages;
  - neither endpoint is needed for the chosen first-page search adapter.
- Session/cookies: no search cookie or anti-forgery token is referenced by the
  GET search form. The adapter sends neither.
- Pagination: ordinary `page=` links are server-rendered. The first version
  intentionally reads only the first page (up to 30 offers) to limit source
  load. The later-page AJAX contract belongs to the vehicle catalogue and is
  not reused for general search without a captured search response.
- Required headers: `Accept: text/html,application/xhtml+xml` and an
  identifiable AutoRadar `User-Agent`.

## Chosen implementation

- Mode: direct HTTP GET + server-rendered HTML + Cheerio.
- Reason: steps 1 and 2 of the mandatory ladder are sufficient. Product
  fields are already present in HTML, so autocomplete JSON, pagination XHR
  and Playwright would add cost and uncertainty.
- Timeout: 10 seconds by default, configurable with
  `AUTO1_HTTP_TIMEOUT_MS`.
- Pacing: one request per second by default, configurable with
  `AUTO1_REQUEST_INTERVAL_MS`.
- Pagination: first page only.
- Result limit: 30 by default, configurable with `AUTO1_RESULT_LIMIT`.
- Feature flag: `SOURCE_AUTO1_ENABLED`.

## Query mapping

1. If the AI-validated request contains an article, use the original article
   verbatim.
2. Otherwise concatenate the canonical part name and known vehicle make,
   model, year, generation and engine.
3. Parse all valid first-page cards.
4. Keep only cards whose article is present or whose part-name tokens are
   present in the title, descriptions or path.
5. Mark every accepted result as `possible`. Vehicle compatibility is not
   promoted to `confirmed` from free text.
6. A used-only request returns no offers because the supplied cards explicitly
   declare `schema.org/NewCondition`.

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
  families, разрешённые robots корни `/Parts`, `/Tyres`, `/Battery`, `/Oil`,
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
```

Observed request:

```http
GET /Search?pattern=OX339%2F2D HTTP/1.1
Host: auto1.by
Accept: text/html,application/xhtml+xml
User-Agent: AutoRadar/0.1 (+https://autoradar.vercel.app; parts search)
```

No cookies, form token, referer or browser headers are required by the
captured GET form.

## Supplied-file review

All supplied files were classified before choosing the transport:

| File                                                                                         | Relevant finding                                                                                                 |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `108259`                                                                                     | SSR vehicle catalogue, GET search form, 14 product cards, BYN microdata, ordinary pagination and later-page AJAX |
| `robots.txt`                                                                                 | explicitly allows `/Search` and `/Search/Autocomplete`                                                           |
| `CustomJs`                                                                                   | initializes public autocomplete at `/search/autocomplete`; handles cart, favourites and unrelated UI             |
| `SharedJs`                                                                                   | shared filters, Ajax wrapper and catalogue UI                                                                    |
| `SortAndScrollViewModes.js`                                                                  | list/grid/table sorting and lazy-page UI                                                                         |
| `UpdatePagination.js`                                                                        | client-side pagination link/text updates                                                                         |
| `oemCart.js`                                                                                 | shopping-cart behavior for OEM pages; not used                                                                   |
| `manifest.json`                                                                              | PWA metadata only                                                                                                |
| `jquery.min.js`, `jquery.plugins.min.js`, `bootstrap.min.js`, `jstree.min.js`, `fotorama.js` | vendor UI libraries; no search contract chosen from them                                                         |
| `script.min.js`, `loader_4_psqk9q.js`                                                        | Bitrix/live-chat bundle and loader; unrelated to parts search                                                    |
| `2.1`, `full.js`                                                                             | Yandex Maps API bundles; unrelated to parts search                                                               |

Key supplied-capture hashes:

- `108259`:
  `924eda6c143194e6815af1e56077d6ce02b967421e95771a67c81828d06d2f8f`
- `CustomJs`:
  `a53a3872f7985675809fff22d7834dbf912edba84bb2eb550f65c21f57b055f9`
- `SharedJs`:
  `8f90836f352010a022353994a143bd54bc2ac9ade32c0e8daecd051e08fef4eb`
- `SortAndScrollViewModes.js`:
  `8c1b4c07f2d4d6a0a05ffc544429e3d240efc8b96756fdc785149dff18699920`
- `UpdatePagination.js`:
  `435b454d9477526257c2fb099b4e992bb698f36d51e403ebb22200d0e953288e`

## Fixtures

- success: `fixtures/search-success.html` — minimal evidence-preserving
  excerpt from the owner-supplied `108259` capture. It includes the verified
  MAHLE oil-filter card and an unrelated chain card for relevance regression.
  Embedded base64 images and store/cart scripts were intentionally omitted.
- empty: `fixtures/search-empty.html` — parser contract fixture using the
  no-results copy observed in supplied JavaScript. A real empty `/Search`
  response was not supplied and was not fetched.
- error: `fixtures/search-error.html` — typed HTTP 429 contract fixture.
- verification: `fixtures/search-verification.html` — minimized form of the
  live HTTP 200 `Verification` response, ensuring it cannot be interpreted as
  an empty catalogue.
- robots: `fixtures/robots.txt` — owner-supplied capture.

## Known limitations

- Direct server-side `/Search` is currently verification-gated, so Auto1
  remains disabled by default until a stable public HTTP contract or owner
  permission exists. The challenge is not bypassed.
- The success HTML is a vehicle-catalog page, not a captured `/Search`
  response. The shared card template and search form are verified, but a live
  or owner-supplied search-result capture is still required before claiming
  the adapter is production-verified.
- Search by VIN is deliberately disabled.
- Vehicle applicability, original/analog classification and OEM equivalence
  are not inferred from descriptions.
- Only the first SSR page is requested.
- Source-specific proxy configuration is not needed or implemented.

## Smoke test

The command is opt-in and performs no network request unless explicitly
enabled:

```bash
AUTO1_LIVE_SMOKE=true pnpm auto1:smoke -- "Масляный фильтр"
```

Until that smoke test or an owner-supplied `/Search` success capture is
available, the adapter is fixture-tested but not claimed as live-verified.
