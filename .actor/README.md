# AutoRadar Federated Parts Search

Private MVP Actor for live, request-scoped auto-parts searches.

The first real adapter targets public Bamper result pages. It uses exact
verified taxonomy values, parses server-rendered HTML with Cheerio and never
imports the full catalog. Standard Playwright is attempted only when a direct
HTTP request receives the currently observed Cloudflare 403.

The Actor does not use authenticated source accounts, CAPTCHA bypass, stealth
plugins, proxy rotation or user cookies.

Results are written to both the default dataset and the `OUTPUT` record.
