# Mock adapter discovery

Checked at: 2026-07-28  
Researcher: Codex

This adapter is intentionally local and deterministic. It does not represent a
real source and is used only to validate the shared contract, search lifecycle
UI and fixture-first tests.

## Access

- Public without login: not applicable
- robots.txt: not applicable
- Terms: not applicable
- CAPTCHA: not applicable
- Rate-limit observations: not applicable

## Search modes

- OEM: simulated
- VIN: not supported
- Vehicle: simulated
- Text: simulated

## Chosen implementation

- Mode: mock
- Reason: foundation phase before verified source discovery
- Timeout: none
- Pagination: none
- Result limit: one fixture offer

## Risks

- Mock results must never be described as live or real.
