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
  - The default safe transport uses the path-based `/carparts/...` SSR
    catalogue and never calls query-string catalogue views or
    `index.php?route=catalog/parts/choice3d`.
  - On 2026-07-29 the project owner explicitly authorized
    `/carparts/search/{query}` for a closed, non-public MVP. This temporary
    behavior is isolated behind `ZAP_EXPERIMENTAL_SEARCH_ENABLED` and must be
    disabled before public production.
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

- OEM: public `/carparts/search/{search}` was verified manually and is
  temporarily supported in the owner-authorized private-MVP mode.
- VIN: the guest UI links to `/laximo?type=searchvin&vin=...`. Query-string
  routes are disallowed by `robots.txt`, and VIN is sensitive; unsupported.
- Vehicle: supported through public make/model SSR links. Generation and engine
  are resolved from observed picker responses in the owner-authorized private
  MVP mode.
- Text: temporarily supported through the same private-MVP search route.
- Exact generation/engine: the picker resolves it through the observed
  `index.php?route=catalog/parts/choice3d` route. It is used only in the same
  owner-authorized private-MVP mode as experimental text search.

## Mandatory ladder

1. **HTTP + URL parameters**
   - Direct HTTPS works.
   - The path-parameter search route works with ordinary HTTP and is used only
     when the private-MVP feature flag is enabled.
2. **Server-rendered HTML + Cheerio**
   - Chosen. Allowed `/carparts/...` pages contain navigation, product cards,
     prices, availability and delivery without JavaScript.
3. **Public JSON/XHR**
   - The site JavaScript exposes
     `index.php?route=catalog/parts/choice3d`, with observed fields
     `manufacturer`, `manufacturer_name`, `model`, `type`, `category` and
     `category_id`.
   - It is called only behind the private-MVP experimental flag.
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
- Experimental navigation:
  1. `GET /carparts/search/{encodeURIComponent(query)}`;
  2. parse `.product-block`, or follow the first verified brand/article
     candidate link and parse its product/analog cards.
- Picker XHR:
  - `GET index.php?route=catalog/parts/choice3d&model={modelId}`;
  - `GET index.php?route=catalog/parts/choice3d&type={typeId}&category={slug}&category_id={id}`;
  - JSON field `html` contains engine options; JSON field `uri` contains the
    resolved catalogue path.
- Product applicability:
  product HTML already contains model buttons with `data-mod-id`. The
  `/info/apps` route was also observed during discovery, but is not required by
  the chosen parser.
- Required headers: descriptive `User-Agent` and
  `Accept: text/html,application/xhtml+xml`.
- Cookies: `language`, `currency` and `PHPSESSID` are retained in one adapter
  session for picker/product requests.
- Redirects: disabled. Navigation targets must remain HTTPS, on `zap.by`,
  without query parameters. Standard mode is limited to `/carparts`;
  experimental mode additionally permits the exact search path and verified
  two-segment brand/article product paths.

## Chosen implementation

- Mode: ordinary HTTP + server-rendered HTML/JSON + Cheerio.
- Reason: complete allowed SSR result cards are available without login,
  JavaScript, proxy or browser automation.
- Timeout: 10 seconds per HTTP request by default.
- Request interval: 500 ms by default.
- Pagination: intentionally not followed because pagination uses query
  parameters disallowed by `robots.txt`.
- Result limit: first 50 SSR cards, configurable from 1 to 100.
- Product enrichment limit: first 12 viable candidates by default, configurable
  with `ZAP_ENRICH_LIMIT`.
- Empty result: a page with no `.product-block` produces typed
  `EMPTY_RESPONSE`; a known card container with missing required data produces
  `DOM_CHANGED`.
- Feature flag: `SOURCE_ZAP_ENABLED`.
- Private-MVP search flag: `ZAP_EXPERIMENTAL_SEARCH_ENABLED`; currently true by
  default for the closed test deployment, must be false before public release.

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
- product characteristics:
  `.td-feature-item-name` + `.td-feature-item-value`; known labels are mapped
  to reproducible canonical constraints while original values are retained.
- applicability: product model buttons (`data-mod-id`) and labels are retained
  as source attributes.
- matching: explicit conflicts are rejected. Full evidence produces
  `confirmed`; missing evidence produces `possible`. Supported placement
  examples include `левый`/`правый`, `front`/`rear`, `LEWY`/`PRAWY`,
  `PRZÓD` (including observed mixed `PRZаD`) and `TY`/`TYŁ`.
- model aliases: a numeric family such as user input `BMW 3` resolves to the
  unique decorated catalogue label `3 Series`; exact matching still takes
  precedence, so it cannot resolve to `X3`.
- part identity: non-OEM catalogue results must start with the requested part
  words after reproducibly removing a leading brand/article. Related
  sub-parts such as `Тросик замка капота` are rejected for a `Капот` request.
- clarification: if viable offers differ by a missing critical value such as
  `generation`, `body` or `doorCount`, the adapter returns options instead of
  silently choosing a base model or mixing variants.

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
- six cards for Peugeot 308 / `Стеклоподъемник`; explicit front-left filtering
  retained `NTYEPSPE014` and `NTYEPSPE018`, while rear, right and unknown
  placement cards were excluded.

## Known limitations

- OEM and free-text lookup are temporary private-MVP capabilities and must be
  disabled before public production; VIN remains unsupported.
- Applicability evidence is limited to what Zap.by exposes; an offer is never
  promoted from `possible` to `confirmed` by AI inference.
- Only the first SSR page is read; query-string pagination is not used.
- Category matching first uses an exact normalized label, then a conservative
  token similarity threshold.
- Numeric model-family aliases are accepted only when the normalized alias is
  unique within the chosen make.
- Part-title identity is intentionally conservative: a seller synonym that
  does not begin with the requested part words can be omitted rather than
  admitting related but different parts.
- Price and delivery are volatile and should be treated as fetched-at values.
- No source-specific proxy is supported or required.

## Fixtures

- success:
  `actors/search/src/adapters/zap/fixtures/catalog-success.html`
  (curated verbatim card fields from the user-supplied SSR capture);
- empty:
  `actors/search/src/adapters/zap/fixtures/catalog-empty.html`
  (curated from the verified public vehicle page before a category is chosen);
- placement:
  `actors/search/src/adapters/zap/fixtures/catalog-placement.html`
  (six verified Peugeot 308 window-regulator cards covering front/rear,
  left/right and unknown placement);
- product details:
  `product-front-left-5d.html` and `product-front-left-3d.html` (curated
  structured characteristics, applicability and OEM fields);
- error behavior: covered with mocked HTTP 403/429/timeout and strict URL
  validation in unit tests; raw block pages are not stored.

## Manual smoke

No network is used unless explicitly enabled:

```bash
ZAP_LIVE_SMOKE=true pnpm zap:smoke -- AUDI A4 2010 "Масляный фильтр"
ZAP_LIVE_SMOKE=true pnpm zap:smoke -- PEUGEOT 308 2008 "Стеклоподъемник" left front 5
```
