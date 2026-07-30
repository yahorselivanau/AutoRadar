# Armtek.by discovery

Checked at: 2026-07-30  
Researcher: Codex, using owner-supplied captures and `robots.txt` first.

## Access rules

- The owner-supplied `robots.txt` is the authority used for this adapter. Its
  SHA-256 is
  `9e1dd4358c381f035db637d5b597e23a4f9da01e4228381c4c472696f8bf3ccc`.
- For `User-agent: *` it explicitly allows `/search?*` and `/rest/`.
- It declares `https://armtek.by/sitemap.xml`.
- The sitemap index was reachable on 2026-07-30. It contained 1,832 child
  sitemap URLs: 1,569 product shards, 252 vehicle-catalog shards, 8 SEO
  category shards, and one shard each for content, brand, and category.
- No account, private cabinet, CAPTCHA bypass, proxy, or authenticated
  customer API was used.

## Supplied evidence

- `card` and `stupicy` are byte-identical (SHA-256
  `6f590a4dc7068e6cbf88e24b3c373586f39ec1b44bcbc41a6684b331275b4715`).
- Both contain only the Angular application shell and current static asset
  names. There are no server-rendered products to parse.
- The normalized shell is stored as `fixtures/page-shell.html`; the exact
  owner-supplied access rules are stored as `fixtures/robots.txt`.

## Observed public flow

The allowed page `GET /search?text=7700274177` was inspected in a clean
Playwright guest session only after SSR HTML proved empty. The page made:

1. `POST /rest/ru/auth-microservice/v1/guest` with `{}` and the public SPA
   client headers;
2. `GET /rest/ru/search-microservice/v1/search/type?query=<query>`;
3. for article search, `POST /rest/ru/search-microservice/v1/search`;
4. for category text search, `POST
/rest/ru/search-microservice/v1/search/by-category`.

The article request body observed for `7700274177` was:

```json
{
  "query": "7700274177",
  "queryType": 1,
  "page": 1,
  "filters": { "text": "7700274177" },
  "userInfo": { "VKORG": "2000", "VSTELS_LIST": ["MI51"] },
  "ZZSIGN": "S"
}
```

The type endpoint can instead return a `categoryAlias` and filters. For
`масляный фильтр` it returned `filtry-maslyanye-8963`; the observed category
body uses that alias, preserves the returned filters, adds the original text
and `from_global: "true"`, and sets `linkingTargetType: "P"`.
For an unclassified text query such as `масляный фильтр BMW 3 серия`, the
same endpoint returned `searchType: 1` with `filters: []`. The loader treats
this observed empty array as no filters instead of reporting a changed
contract.

Both branches were reproduced with ordinary Node `fetch`, no cookies and no
browser state. The article query returned 43 products (36 on page 1); the
category query returned real offers. Playwright is not used by the adapter.

## Credential handling

The guest bootstrap requires an `x-auth-token` value embedded in the public
Armtek SPA JavaScript. Although browser visitors receive it, it is still an
access credential and is not committed to this repository or copied into a
fixture. Configure it server-side as `ARMTEK_GUEST_AUTH_TOKEN`. The adapter is
opt-in through `SOURCE_ARMTEK_ENABLED=true` and fails closed before any
request when the credential is absent.

The guest bootstrap returns a bearer token. It is held only in the loader
closure, never logged or persisted, and refreshed once after an HTTP 401.

## Chosen implementation

- Mode: public JSON/XHR over direct HTTP.
- Search modes: exact article/OEM and public structured text/category search.
- Used-only searches return empty without a network request because Armtek is
  a new-parts source.
- Timeout: 12 seconds for the whole guest/type/search sequence.
- Pacing: one adapter search per 1.5 seconds.
- Pagination: first public page only.
- Result limit: 30 purchasable suggestions.
- No filter endpoint is called because filters are not needed to normalize
  the first page.

## Data mapping

- product id: `articlesData[].ARTID`
- product URL: `/product/<ARTICLE_ALIAS>` on `armtek.by`
- article: `PIN`
- brand: `BRAND`
- title: suggestion `NAME`, falling back to article `NAME`
- image: first HTTPS `PHOTO` on `img.armtek.ru`
- offer identity: `ARTID-PARNR-KEYZAK`
- source evidence: `ARTID`, supplier reference `PARNR` and warehouse
  reference `KEYZAK` are preserved separately in `sourceAttributes`
- price: `SUGGESTIONS[].PRICES1` when `WAERS = BYN`;
  `priceSource = api`
- quantity: `RVALUE`
- delivery: `DLVDT`
- seller reliability percentage: `VENSL`
- condition: `new`
- original/analog: `unknown`; the response does not provide authoritative
  classification

Every response and normalized offer is validated with Zod. Product and image
hosts are allowlisted. Exact requested articles are `confirmed`; text results
remain `possible` and require both the requested part words and available
vehicle identity evidence.

## Fixtures and smoke

- `search-success.json`: evidence-preserving extraction from the observed
  `7700274177` response.
- `search-empty.json`: observed response shape with no articles.
- `page-shell.html`: normalized owner-supplied Angular shell.
- `robots.txt`: exact owner-supplied rules.

Manual live smoke:

```bash
ARMTEK_LIVE_SMOKE=true \
ARMTEK_GUEST_AUTH_TOKEN="<server-only value>" \
pnpm armtek:smoke -- "7700274177"
```
