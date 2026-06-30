# Changelog

## 1.1.0 (2026-06-30)

### Fixed

- **Store endpoint migrated to V3** — changed from `GET /store/v2/storefront` to `POST /store/v3/storefront` to match the live game client's behavior, resolving the persistent 404 error. Store now works correctly when VALORANT is open.

### Added

**20+ new endpoints** across 5 new modules:

- **Current Game** — `getCurrentGamePlayer()`, `getCurrentGameMatch(matchId)`, `getCurrentGameLoadouts(matchId)` — live match data, teams, agents, scores
- **Pre-Game** — `getPregamePlayer()`, `getPregameMatch(matchId)`, `getPregameLoadouts(matchId)`, `selectAgent(matchId, agentId)`, `lockAgent(matchId, agentId)` — agent select phase interaction
- **Match History** — `getMatchHistory({startIndex, endIndex})`, `getMatchDetails(matchId)` — past match data with pagination
- **Player Info** — `getPlayerMMR()`, `getCompetitiveUpdates({startIndex, endIndex})`, `getAccountXP()`, `getContent()` — rank, RR, competitive history, account level, game seasons
- **Contracts** — `getContracts()`, `activateContract(contractId)` — battle pass and agent contract progress

### Changed

- Client version detection now correctly reads `productId` instead of the session key name
- Content-Type header no longer sent as `undefined` on GET requests
- Buffer concatenation uses `Buffer.concat` for reliability across all Node.js versions
