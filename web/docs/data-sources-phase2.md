# Phase 2 Data Sources (Spain)

This document prepares the next integration phase for complementary property data
after the Nota Simple partner flow is stable in production.

## Priority 1: Official cadastral sources

- Source family: `Sede Electrónica del Catastro` and INSPIRE-compatible services.
- Planned usage:
  - Parcel geometry validation.
  - Address-to-parcel consistency checks.
  - Cadastral context enrichment for report quality controls.
- Integration direction:
  - Read-only service adapters under `web/server/`.
  - No direct writes to user-visible financial fields until data quality checks pass.

## Priority 2: Official statistical market data

- Source family: national/official registries and statistics.
- Planned usage:
  - Macro trend baselines.
  - Province/municipality trend deltas.
  - Confidence scoring for forecast outputs.
- Integration direction:
  - Pull snapshots on schedule and cache results.
  - Keep attribution metadata in every stored payload.

## Provider policy

- Rule 1: `OfficialOpenDataFirst`.
- Rule 2: Add commercial providers only when official coverage is missing.
- Rule 3: Every provider integration must include:
  - Licensing review.
  - Data retention rule.
  - Endpoint timeout + retry strategy.
  - Fallback behavior when provider is unavailable.

## Technical placeholders

The following environment variables are reserved for phase 2:

- `VESTA_CATASTRO_BASE_URL`
- `VESTA_CATASTRO_API_KEY`
- `VESTA_MARKET_STATS_BASE_URL`
- `VESTA_MARKET_STATS_API_KEY`
- `VESTA_DATA_CACHE_TTL_SECONDS`
