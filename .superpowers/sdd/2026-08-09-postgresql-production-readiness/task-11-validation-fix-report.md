# Task 11 validation false-negative fix

## First-principles result

The immutable import evidence was correct; the failure was in the validator's representation assumptions. The standalone migrator now compares the native values returned by `pg` without inheriting the server package's global parser overrides.

## Root causes and fixes

- `skins.terms_json` and `games.event_json` are application-level records, so their JSON semantic checks now require objects rather than arrays.
- SQLite serialized JSON and PostgreSQL parsed JSON use explicit source/target representations. Parsed PostgreSQL scalar strings remain strings, including numeric-looking business values.
- Only declared PostgreSQL `bigint` sample columns are normalized to canonical decimal strings. Arbitrary numeric strings and JSON strings are not converted.
- PostgreSQL `Date` values are converted directly with `toISOString()`, preserving milliseconds; offset timestamp strings are normalized to the same UTC instant and invalid timestamps remain detectable.
- JSON objects are recursively key-sorted, arrays preserve order, and null handling remains explicit.
- The validation pool owns local type parsers for int8, json/jsonb, and timestamptz, isolating the CLI from server-level `pg` parser mutations.

## Test evidence

- Migration validation unit suite: 109 passed, 0 failed.
- PostgreSQL integration suite: 109 passed, 0 failed.
- Repository unit suite: 348 passed, 0 failed.
- Workspace type checks passed for db-migrator, shared, server, client, and admin.
- Production builds passed for server, shared, client, admin, and db-migrator.
- Focused regression coverage includes object/scalar/nested JSON, safe and unsafe bigint values, business numeric strings, millisecond and offset timestamps, invalid dates, JSON `null`, and wrong object/array shapes.

## Rehearsal evidence boundary

Before the Docker environment restarted, a compiled standalone validation run against the preserved Task 11 target proved that the JSON object and bigint false negatives were removed; that run then exposed the PostgreSQL JSON scalar issue fixed here. The Docker restart subsequently removed the preserved schema, so this report does not claim a final revalidation of that exact target. Fresh isolated-schema PostgreSQL integration coverage is the current executable evidence. The Task 11 source, artifacts, and failed-schema contents were not modified by this change.
