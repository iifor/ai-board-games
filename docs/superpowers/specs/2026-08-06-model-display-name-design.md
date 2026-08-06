# Model Display Name Design

**Date:** 2026-08-06
**Status:** Approved for implementation planning

## Goal

Add a human-readable display name to every model without changing the model identifier sent to providers.

The system must continue to use `models.name` as the provider-facing model ID. A new `display_name` column supplies the label shown to administrators when listing, editing, assigning, or testing models.

## Scope

### Included

- Add `models.display_name`.
- Expose it as `displayName` through the existing admin model API.
- Allow administrators to create and edit a display name.
- Search model lists by both display name and model ID.
- Show `Display Name (Model ID)` in:
  - the model manager;
  - player primary-model selection;
  - player fallback-model selection;
  - model debug selection.
- Backfill non-empty display names for all 136 Alibaba Bailian rows and all 27 Volcengine Ark rows.
- Preserve every existing provider, model ID, player assignment, enabled state, and thinking-mode setting.

### Excluded

- Renaming provider-facing model IDs.
- Changing LLM routing, fallback, quota-disable, or connection-test behavior.
- Adding aliases, localization tables, automatic provider synchronization, or a model catalog service.
- Removing the pre-existing duplicate Ark row.
- Backfilling official labels for other providers; they use the model ID as the display fallback until edited.

## Chosen Approach

Add one nullable-at-input, non-null-at-rest display field.

Alternatives were rejected:

- A frontend-only dictionary would duplicate persistent model metadata and drift when models are added.
- Reinterpreting the existing `name` field as a display label would require a risky provider-ID migration across runtime call sites.

## Data Model and Migration

Add the column through the existing idempotent migration helper:

```sql
display_name TEXT NOT NULL DEFAULT ''
```

Legacy databases therefore upgrade without a blocking data rewrite. An empty value is valid for backward compatibility and renders as `name`.

The backfill runs in one transaction and matches rows by exact `provider_id + name`. It updates only `display_name`. It must not change `name`, provider configuration, enabled state, timestamps other than the affected row's `updated_at`, or player bindings.

Expected post-backfill state:

- Alibaba Bailian: 136 rows with an effective non-empty label.
- Volcengine Ark: 27 rows with an effective non-empty label, preserving 26 distinct model IDs.
- Other providers: effective labels remain non-empty through the `displayName || name` fallback.

## Server Contract

Extend the existing types and mappers:

- `ModelRow.display_name: string`
- `Model.displayName: string`
- `ModelInput.displayName?: string`
- `ModelRowInput.display_name: string`

`rowToModel` returns the persisted display name. `modelToRow` trims the input and preserves the existing value on partial updates.

The model repository includes `display_name` in inserts and updates. Existing list, create, update, and provider-scoped routes continue to use the same endpoints and response envelope.

Validation rules:

- `name` remains required and is the provider-facing ID.
- `displayName` is optional at the API boundary for backward compatibility.
- When supplied, `displayName` must be a string, is trimmed, and may contain at most 120 characters.
- Invalid values produce the existing validation-error response with HTTP 400.

Runtime model resolution may carry `displayName` as metadata, but every provider request and connection test must continue to set the outbound model identifier from `model.name`.

## Admin Interface

### Model Manager

- Relabel the current `name` form field to `Model ID`.
- Add a `Display Name` field.
- Require both fields in the admin create/edit form.
- Render separate `Display Name` and `Model ID` table columns.
- Render `displayName || name` in confirmations.
- Search both `displayName` and `name`.

### Model Selectors

Use one admin-side formatting helper for every model selector:

```text
displayName exists and differs from name -> Display Name (name)
otherwise                              -> name
```

The helper is reused by player primary-model, fallback-model, and debug-model selectors. Values remain numeric model IDs, so assignments and API payloads do not change.

## Data Flow

1. The admin submits `displayName` and `name` through the existing model endpoint.
2. The service validates and maps them to `display_name` and `name`.
3. The repository persists both fields.
4. List endpoints map `display_name` back to `displayName`.
5. Admin components format visible labels from `displayName` and `name`.
6. Runtime resolution continues to use the persisted model row ID and sends only `name` as the provider model identifier.

## Error Handling and Compatibility

- Missing columns are created idempotently at startup.
- Missing or blank legacy display names fall back to the model ID.
- A failed backfill transaction rolls back all display-name changes.
- Unknown model IDs, missing providers, and connection failures retain their existing behavior.
- No display name is treated as a routing key or uniqueness key.

## Testing and Verification

### Automated

- Migration test:
  - upgrades an old `models` table;
  - creates `display_name` with the empty default;
  - remains safe when run repeatedly.
- Model mapping/repository tests:
  - create, read, and update `displayName`;
  - preserve display names on partial updates;
  - reject invalid type and length;
  - prove the provider-facing runtime identifier remains `name`.
- Admin checks:
  - TypeScript check covers the extended model entity and all selector consumers.

### Runtime

- Verify database counts remain Alibaba 136 and Ark 27/26 distinct.
- Verify every Alibaba and Ark row has a non-empty effective label.
- Verify the model manager shows both fields and searches either field.
- Verify all three selector contexts show formatted labels but submit the same numeric model IDs.
- Re-run representative connection tests:
  - `Alibaba Bailian / qwen3.7-plus`
  - `Volcengine Ark / doubao-seed-2-1-turbo-260628`
- Run relevant type checks, builds, unit tests, and migration tests.

## Documentation Impact

Update:

- `docs/project-server.md` for the new persistent field and API contract.
- `docs/project-admin.md` for the display/search/edit behavior.
- `docs/project-shared.md` only if a cross-package shared model type is changed; otherwise no shared documentation update is required.
