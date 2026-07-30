# Motorland.by discovery

Checked at: 2026-07-29 (Europe/Minsk)  
Researcher: Codex for AutoRadar

## Access

- Public without login: yes. Search results and product URLs return HTTP 200
  without authentication.
- robots.txt: `User-agent: *` contains no `Disallow`; it explicitly allows
  `*?Filter.TextSearch=*`, `*?q=*`, `*?page=*`, `/api/` and
  `/catalogue*html*`. Live `https://motorland.by/robots.txt` returned HTTP 200
  on 2026-07-29. The owner also supplied the checked copy used by this report.
- Terms: the linked public offer
  `/pokupatelyam/publichnaya-oferta/` governs retail purchase. No automated
  access prohibition was found in the checked offer text. This is not a grant
  to copy the catalogue; the adapter performs one live user search and keeps
  only normalized offer fields.
- CAPTCHA: absent in the verified guest requests.
- Rate-limit observations: no limit was reached during the small discovery
  sample. HTTP 429 and recognizable blocking pages are mapped to
  `rate-limited`.
- Login: not required for search results or product cards. Login is required
  for favorites, which the adapter does not call.
- Proxy required: no.
- Proxy region: none.
- TLS/CA requirements: normal HTTPS verification with the runtime trusted CA.
  TLS verification must not be disabled.
- Source-specific cookies: none required. The server sets
  `ASP.NET_SessionId`, but a fresh direct GET returned complete results and the
  adapter neither sends nor persists this cookie.

## Search modes

- OEM: not confirmed. The input says `артикул`, but the observed product
  numbers are Motorland internal article IDs, not proven OEM numbers.
- Internal article: yes, through the same text input.
- VIN: not confirmed and not used.
- Vehicle: yes as part of the public text query and through a separate form.
  The adapter intentionally uses only the text query because it is one
  stateless request.
- Text: yes.
- Condition: the search page title/description says `Запчасти б/у`, and the
  public offer defines the listed auto parts as used. The adapter assigns
  `condition=used` only when this page-level marker is present; otherwise it
  uses `unknown`.

## Network

- Public search URL:
  `https://motorland.by/auto-parts/?Filter.TextSearch=<query>`.
- Verified example:
  `GET /auto-parts/?Filter.TextSearch=%D0%BA%D0%B0%D0%BF%D0%BE%D1%82+BMW+F30`
  returned HTTP 200 and 22 SSR cards on 2026-07-29.
- Verified direct catalogue example:
  `GET /auto-parts/bmw/3/f30-2012-2019/kapot/` returned HTTP 200 and 10 SSR
  cards.
- Verified empty example:
  `GET /auto-parts/?Filter.TextSearch=AutoRadarNoResultZ9Q7X3` returned HTTP
  200 and `.alert-error` with no product cards.
- Server-rendered HTML: yes; all fields required by the adapter are in the
  initial response.
- Form method/action: the observed header form is
  `POST /autoparts/submit/`, field name `filter.TextSearch`. A verified POST
  returned HTTP 302 to the GET URL above. The adapter skips this redundant
  request and calls the resulting GET directly.
- Observed vehicle form fields:
  `TypeCar`, `Filter.TypeGroup`, `Filter.TypeGroups`,
  `Filter.VikiAutoId`, `Filter.Model.VikiAutoModelId`,
  `Filter.VikiPartId`.
- Observed public form endpoints:
  `/autoparts/getautolist/`, `/autoparts/setformmodel/`,
  `/autoparts/setformadditional/`, `/autoparts/updatenum/`.
  They are not needed or called by this implementation.
- Public XHR/fetch: the supplied scripts contain the site's general Viki AJAX
  machinery and cart/favorites calls. No JSON endpoint is needed for search.
- JSON: page JSON-LD contains only aggregate price/count, not individual
  offers. Individual cards are parsed from SSR HTML.
- Required headers: ordinary `Accept: text/html,application/xhtml+xml` and an
  honest AutoRadar `User-Agent`.
- Required cookies: none.

## Chosen implementation

- Mode: direct HTTP GET + server-rendered HTML + Cheerio.
- Retrieval method reported by the adapter: `html`.
- Reason: this is steps 1–2 of the required ladder and already contains
  complete product cards. JSON/XHR or Playwright would add no data.
- Timeout: `MOTORLAND_HTTP_TIMEOUT_MS`, default 10 seconds.
- Request pacing: serialized by `MOTORLAND_REQUEST_INTERVAL_MS`, default 1
  second.
- Pagination: only the first public result page is read. No catalogue crawl is
  performed.
- Result limit: `MOTORLAND_RESULT_LIMIT`, default 30, maximum 50.
- Feature flag: `SOURCE_MOTORLAND_ENABLED`.
- Used-only behavior: a request explicitly restricted to `condition=new`
  returns an empty result without making a network call.

## Data mapping and verified selectors

| Field              | Source                                                   |
| ------------------ | -------------------------------------------------------- |
| card               | `.grid-new > .new-grid__item`                            |
| external id        | `data-gtm-ecomerce-item-id`                              |
| title and URL      | `.item-title a[href]`                                    |
| brand              | `data-gtm-ecomerce-item-brand`                           |
| Motorland article  | `.item-article`, prefix `Артикул товара:`                |
| category           | `data-gtm-ecomerce-item-category2`                       |
| price              | `data-gtm-ecomerce-item-price`; DOM price is fallback    |
| condition          | page title/description marker `б/у`; otherwise `unknown` |
| original/analog    | `unknown` (not stated)                                   |
| image              | first `.present_car_img img[src]`                        |
| characteristics    | `.item-characteristics tr > th + td`                     |
| catalogue identity | structured product URL: make/model/generation/category   |
| description        | characteristic row `Описание`                            |
| delivery           | verified `.item-garant` text `Доставка по РБ`            |
| availability       | not exposed reliably; omitted                            |
| seller             | constant `Motorland.by`                                  |
| location           | not exposed per card; omitted                            |

Product URLs are accepted only when they are HTTPS links on `motorland.by`
matching `/auto-parts/.../sku-<digits>/`. Image URLs are accepted only from
`motorland.by` or `media.motorland.by`.

## Query and matching

- Article request: send the supplied raw/normalized article alone.
- Text request: join part name, vehicle make, model, year and generation.
- The public text search can return related categories, for example `Замок
капота` for `Капот`. The adapter keeps only cards whose verified Motorland
  category equals the requested part after deterministic normalization.
- Vehicle identity is read from the verified product URL segments
  `/auto-parts/{make}/{model}/{generation}/{part}/sku-{id}/`, not from loose
  title substrings. Make, model and category must match their corresponding
  normalized URL segments exactly. This prevents a request for BMW `3` from
  accepting BMW `X3`, BMW `X5` or a digit that occurs only in a year.
- Those four source IDs are also preserved in `sourceAttributes` as
  `catalogMake`, `catalogModel`, `catalogGeneration` and `catalogCategory`, so
  the UI/evidence layer can explain the accepted catalogue branch.
- When a year is supplied and the generation URL contains a year range, that
  year must be inside the range. The donor vehicle year shown on a card is
  retained as informational text and is not treated as the model's
  compatibility range.
- A supplied generation/body must match a reproducible token from the
  generation URL. If several year-compatible generation branches remain and
  the request omitted generation, the adapter returns a structured
  clarification instead of mixing them.
- Compatibility remains `possible`: a matching search card is not proof of
  applicability to a specific VIN or modification.

## Fixtures

- success: `fixtures/search-success.html`, a minimized verified excerpt of the
  supplied/live BMW hood result with two correct F30 cards and deliberately
  mixed X5/E90 cards used to verify rejection.
- empty: `fixtures/search-empty.html`, the verified no-results state.
- error: `fixtures/search-error.html`, the blocking signature used by the
  typed 429 test.

## Known limitations

- No VIN support.
- No OEM claim: Motorland article IDs are preserved as source part numbers.
- No pagination or full-catalogue collection.
- No hidden inference of original/analog or compatibility.
- Search relevance is intentionally conservative and can omit a synonym whose
  Motorland category differs from the user's normalized part name.
- A URL without a parseable generation year range cannot prove year
  compatibility; the result remains conservative and may require
  clarification.
- Price and availability must be reconfirmed on the seller site, as also
  required by Motorland's public offer.
