# Zap.by discovery

Checked at: 2026-07-29 (Europe/Minsk)  
Researcher: Codex

## Access

- Public without login: yes. The vehicle catalogue and product cards are
  visible to a guest.
- Public URL: `https://zap.by/carparts`.
- Verified result URL:
  `https://zap.by/carparts/audi/a4-8k2-b8/2-7-tdi/maslyanyi-filtr`.
- robots.txt: `https://zap.by/robots.txt`.
  - `User-agent: *` disallows `/*?*`, `/*&*`, `/*search`,
    `/*route=product/search`, `/catalog` and account/checkout paths.
  - The adapter therefore never calls `/carparts/search/...`, query-string
    catalogue views or `index.php?route=catalog/parts/choice3d`.
  - The allowed, path-based `/carparts/...` SSR catalogue is used.
- Terms checked: `https://zap.by/publichnaja-oferta`. This is a retail public
  offer rather than an API/scraping licence. It does not grant a bulk catalogue
  feed. AutoRadar only performs a live user-requested lookup and links back to
  Zap.by.
- CAPTCHA: not observed during direct HTTP checks.
- Rate-limit observations: no 429 during the small discovery set. The adapter
  serializes requests and defaults to a 500 ms interval.
- Login: not required for catalogue, prices or availability.
- Proxy required: no. Direct HTTPS returned the same SSR card structure.
- Proxy region: none.
- TLS/CA requirements: normal HTTPS verification with the runtime trust store;
  verification is never disabled.
- The supplied capture metadata says `proxyUsed: stealth`; it is used only as
  a fixture source. Production transport does not use that proxy or browser
  impersonation.

## Search modes

- OEM: public `/carparts/search/{search}` was verified manually, but
  `robots.txt` disallows `/*search`; unsupported by the adapter.
- VIN: the guest UI links to `/laximo?type=searchvin&vin=...`. Query-string
  routes are disallowed by `robots.txt`, and VIN is sensitive; unsupported.
- Vehicle: supported at the public make + model family level through allowed
  `/carparts/...` links found in SSR HTML.
- Text: the public search route works, but is disallowed by `robots.txt`;
  unsupported.
- Exact generation/engine: present in the UI and in the supplied result page,
  but the picker resolves it through
  `index.php?route=catalog/parts/choice3d`. That query route is disallowed.
  The production adapter does not call it and does not claim engine-level
  compatibility.

## Mandatory ladder

1. **HTTP + URL parameters**
   - Direct HTTPS works.
   - The URL search route is not used because robots disallows `/*search`.
2. **Server-rendered HTML + Cheerio**
   - Chosen. Allowed `/carparts/...` pages contain navigation, product cards,
     prices, availability and delivery without JavaScript.
3. **Public JSON/XHR**
   - The site JavaScript exposes
     `index.php?route=catalog/parts/choice3d`, with observed fields
     `manufacturer`, `manufacturer_name`, `model`, `type`, `category` and
     `category_id`.
   - It is not called because the wildcard query-string rule in `robots.txt`
     disallows it.
4. **Playwright**
   - Not required. SSR HTML is complete for the chosen mode.

## Network

- Server-rendered HTML: yes.
- Form method/action: the visible `#searchByCar` form is `POST`, but selection
  is handled by JavaScript and the disallowed `choice3d` query route.
- Allowed navigation:
  1. `GET /carparts`;
  2. follow the exact make link
     `.dropdown.mrgb10 > a.btn-lg[href]`;
  3. follow the exact model-family link `a.ajax[href]`;
  4. follow the exact category link
     `.carparts-category-cards__item[href]` or
     `.cct-node__content[href]`;
  5. parse `.product-block`.
- XHR/fetch: no endpoint is used by production.
- Required headers: descriptive `User-Agent` and
  `Accept: text/html,application/xhtml+xml`.
- Cookies: the server may set `language`, `currency` and `PHPSESSID`, but the
  allowed SSR flow did not require replaying cookies.
- Redirects: disabled. Navigation targets must remain HTTPS, on `zap.by`, under
  `/carparts`, without query parameters.

## Chosen implementation

- Mode: ordinary HTTP + server-rendered HTML + Cheerio.
- Reason: complete allowed SSR result cards are available without login,
  JavaScript, proxy or browser automation.
- Timeout: 10 seconds per HTTP request by default.
- Request interval: 500 ms by default.
- Pagination: intentionally not followed because pagination uses query
  parameters disallowed by `robots.txt`.
- Result limit: first 50 SSR cards, configurable from 1 to 100.
- Empty result: a page with no `.product-block` produces typed
  `EMPTY_RESPONSE`; a known card container with missing required data produces
  `DOM_CHANGED`.
- Feature flag: `SOURCE_ZAP_ENABLED`.

## Data mapping

- card selector: `.product-block`;
- external id: card `data-key`;
- title: `a.td-info-name`;
- brand: `.td-info-name_inner:not(.altname)`;
- part number: `.to-wishlist[data-article]`, with
  `.price-ws-all[data-artnum]` fallback;
- condition: `unknown` (not guessed);
- original/analog: `unknown` (the CSS class `analogs` is not treated as proof);
- price: card `data-price`, BYN, `priceSource = data_attribute`;
- availability: `.avail`, with the `Наличие:` label removed;
- delivery: `.td-delivery`, with the `Срок поставки:` label removed;
- seller: `Zap.by`;
- location: omitted because it is not stated per offer;
- image: first non-placeholder Zap.by HTTPS image;
- URL: `a.td-info-name[href]`, normalized to absolute HTTPS on `zap.by`;
- compatibility: breadcrumb context is retained as informational text, never as
  a compatibility guarantee.

## Verified examples

Allowed catalogue request:

```http
GET /carparts/audi/a4-8k2-b8/2-7-tdi/maslyanyi-filtr HTTP/2
Host: zap.by
Accept: text/html,application/xhtml+xml
User-Agent: AutoRadar/0.1 (+https://autoradar.vercel.app; parts search)
```

Observed first card in the supplied 2026-07-29 fixture:

- title: `Масляный фильтр NAKAYAMA FO169NY`;
- URL: `https://zap.by/nakayama/fo169ny`;
- article: `FO169NY`;
- price: `5.30 BYN`;
- availability: `>10 шт.`;
- delivery: `0-1 дн.`.

Direct live HTTP on 2026-07-29 returned:

- 200 for the verified engine/category page;
- 47–50 `.product-block` cards depending on request time;
- 200 for the broader
  `/carparts/audi/a4/maslyanyi-filtr` model-family page;
- 21 first-page `.product-block` cards and a total heading of 1,639 offers.

## Known limitations

- OEM, free-text and VIN lookup are intentionally blocked in the adapter by the
  current robots rules.
- Generation, body and engine from `VehicleContext` cannot be applied through
  the allowed picker transport. Results are model-family candidates and must be
  checked with the seller.
- Only the first SSR page is read; query-string pagination is not used.
- A category name must exactly match a public SSR category label after
  case/punctuation normalization.
- Price and delivery are volatile and should be treated as fetched-at values.
- No source-specific proxy is supported or required.

## Fixtures

- success:
  `actors/search/src/adapters/zap/fixtures/catalog-success.html`
  (curated verbatim card fields from the user-supplied SSR capture);
- empty:
  `actors/search/src/adapters/zap/fixtures/catalog-empty.html`
  (curated from the verified public vehicle page before a category is chosen);
- error behavior: covered with mocked HTTP 403/429/timeout and strict URL
  validation in unit tests; raw block pages are not stored.

## Manual smoke

No network is used unless explicitly enabled:

```bash
ZAP_LIVE_SMOKE=true pnpm zap:smoke -- AUDI A4 2010 "Масляный фильтр"
```
