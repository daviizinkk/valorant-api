# Changelog

## 1.1.0 (2026-06-30)

### Added

**20+ new endpoints** across 5 new modules:

- **Current Game** — `getCurrentGamePlayer()`, `getCurrentGameMatch(matchId)`, `getCurrentGameLoadouts(matchId)` — live match data, teams, agents, scores
- **Pre-Game** — `getPregamePlayer()`, `getPregameMatch(matchId)`, `getPregameLoadouts(matchId)`, `selectAgent(matchId, agentId)`, `lockAgent(matchId, agentId)` — agent select phase interaction
- **Match History** — `getMatchHistory({startIndex, endIndex})`, `getMatchDetails(matchId)` — past match data with pagination
- **Player Info** — `getPlayerMMR()`, `getCompetitiveUpdates({startIndex, endIndex})`, `getAccountXP()`, `getContent()` — rank, RR, competitive history, account level, game seasons
- **Contracts** — `getContracts()`, `activateContract(contractId)` — battle pass and agent contract progress

### Changed

- **Store endpoint** now returns a friendly `_unavailable` message when the VALORANT game client isn't running, instead of a raw HTTP 404 error
- Internal: all new endpoints follow the same shared request layer (auto-auth, retry, error handling)

### Fixed

- Client version detection now correctly reads `productId` instead of the session key name
- Header handling no longer sends `Content-Type: undefined` on GET requests
- Buffer concatenation uses `Buffer.concat` for reliability across all Node.js versions
