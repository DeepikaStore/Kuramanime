# Kuramanime API v2 (unofficial)

Vercel/Node.js HTML parser. Source: `https://v20.kuramanime.ing`.

## Important verification status
`/health` only verifies that this API function responds. It does NOT verify that Kuramanime is reachable or that its HTML selectors/search route are compatible. Live source inspection has not been completed in this build environment.

## Endpoints
- `GET /health`
- `GET /api/diagnostics/source` — upstream status, title, HTML length, sample links/cards
- `GET /api/home`
- `GET /api/latest?page=1`
- `GET /api/catalog?page=1`
- `GET /api/search?q=naruto` — requires `SEARCH_PATH_TEMPLATE`
- `GET /api/genres`
- `GET /api/schedule`
- `GET /api/anime?url=https%3A%2F%2Fv20.kuramanime.ing%2F...`
- `GET /api/episode?url=...`

## Deploy/update
Upload the contents of this folder to the root of the existing GitHub repository, replacing old files, then commit. Vercel will redeploy automatically.
Vercel settings: Framework Other, Root `./`, Build command empty, Output directory empty. Node dependency installation is automatic.

## Search configuration
First call `/api/diagnostics/source`. Inspect its sample links and the site's search form/action. Then set `SEARCH_PATH_TEMPLATE` in Vercel Project > Settings > Environment Variables, using `{query}` as placeholder, for example only after confirming the actual form path. Do not guess the path.

## Limits
This is an unofficial parser, not an official API. It does not bypass login, anti-bot protections, DRM, paywalls, or access restrictions. It does not download/host video. If pages are JavaScript-rendered or block server requests, HTML parsing may return empty data; use an authorized upstream API or permitted browser-rendered integration instead.
