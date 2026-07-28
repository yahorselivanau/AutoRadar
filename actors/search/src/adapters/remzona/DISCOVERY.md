# Remzona discovery

Checked at: 2026-07-28 (Europe/Minsk)  
Researcher: Codex for AutoRadar

## Access

- Public URL: `https://remzona.by/`.
- Public without login: yes; search suggestions and product links are returned
  to a guest.
- `robots.txt`: `User-agent: *` disallows `/search` and generic query-string
  URLs. The selected implementation does not request `/search`; it reproduces
  the site's public same-origin XHR as `POST /`.
- Terms: public offer at `https://remzona.by/info/rules`. No separate public
  API or automated-access agreement was found. The adapter remains a narrow
  live-search integration and does not crawl the catalog.
- CAPTCHA: absent on the successful search XHR. A Cloudflare Turnstile page was
  observed only together with HTTP 429 after several rapid discovery requests.
- Login: not required.
- Rate-limit observation: a product-page request made after several discovery
  requests returned HTTP 429 without `Retry-After`.
- Proxy required: no.
- Proxy region: none.
- TLS/CA requirements: ordinary verified HTTPS; no custom CA and no TLS bypass.

## Search modes

- OEM/article: supported as a literal query; the adapter preserves the user's
  original value.
- Text: supported for strings of at least three characters.
- VIN: not verified and not supported.
- Vehicle: not verified and not supported.

## Mandatory ladder evidence

1. HTTP + URL parameters: the homepage is server-rendered, but the search input
   does not submit a conventional form.
2. HTML + Cheerio: the homepage contains the search trigger, not results.
3. Public XHR: selected. The public JavaScript calls `POST /` with
   `typerequest=search` and `q=<query>` and receives an HTML fragment.
4. Playwright: unnecessary; the XHR is reproducible with ordinary HTTP.

## Network

- Endpoint: `POST https://remzona.by/`.
- Content type:
  `application/x-www-form-urlencoded; charset=UTF-8`.
- Fields:
  - `typerequest=search`
  - `q=<article or text>`
- Header used by the site: `X-Requested-With: XMLHttpRequest`.
- Response: server-rendered HTML fragment.
- Cookies: not required by successful and empty live smokes; the adapter
  neither stores nor replays browser cookies.
- Redirects: rejected by the adapter.

Example:

```http
POST / HTTP/2
Host: remzona.by
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
User-Agent: AutoRadar/0.1 (+https://autoradar.vercel.app; parts search)

typerequest=search&q=7700274177
```

Verified successful response:

- query: `7700274177`;
- HTTP 200;
- the production adapter smoke returned 8 product cards without a browser
  session;
- category: `Масляный фильтр`;
- links included:
  - `/renault/7700274177`;
  - `/avtodetal/7700274177`;
  - `/amd/7700274177`;
  - `/lada/7700274177`.

Verified empty response:

- query: `ZZZNORESULTAUTORADAR20260728`;
- HTTP 200;
- explicit text: no results found.

## Chosen implementation

- Mode: one public HTTP XHR returning HTML, parsed with Cheerio.
- Reason: it is the first reproducible method that returns product records and
  requires neither browser execution nor a third-party scraping service.
- Timeout: 10 seconds by default.
- Retry: none. A 429 produces a typed `rate-limited` error.
- Pacing: requests are serialized per process with a five-second minimum
  interval; a 429 creates a minimum 60-second local cooldown when the server
  omits `Retry-After`.
- Pagination: not present in this suggestion response.
- Result limit: the source controls the number of returned cards.

## Selectors and mapping

- card: `.part-item a.part-content[href]`;
- article: first descendant `[data-searchname]`;
- display line: second descendant `[data-searchname]`;
- brand: text before the first `/` in the display line;
- title: text after `/`;
- external id: normalized product path, for example
  `renault/7700274177`;
- URL: card `href`, restricted to verified HTTPS on `remzona.by`;
- condition: `unknown` because the XHR fragment does not state it;
- original/analog: `unknown` because the XHR fragment does not state it;
- OEM: not populated; the shown value is treated as the source article, not
  assumed to be an OEM number;
- price: absent from this response and therefore omitted;
- availability/delivery/location: absent and therefore omitted;
- seller: `Remzona.by`.

## Fixtures

- success: `fixtures/search-success.html`, trimmed from the verified live
  `7700274177` response while preserving real markup and values;
- empty: `fixtures/search-empty.html`, the verified empty fragment;
- error: `fixtures/search-error.html`, the observed HTTP 429 markers.

## Known limitations

- Search results are product entries, not stock-level offers: price and
  availability remain available only on the linked Remzona card.
- Fetching every product card would multiply traffic and triggered rate
  limiting during discovery, so the MVP intentionally performs one request per
  source search.
- The adapter must be disabled immediately with
  `SOURCE_REMZONA_ENABLED=false` if access rules change or repeated 429 errors
  appear.
