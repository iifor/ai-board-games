# Free Quota Model Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add every currently callable free-quota model from Alibaba Bailian and Volcengine Ark to the existing model configuration without changing application code.

**Architecture:** Read the authoritative model identifiers from the two authenticated cloud consoles, compare them with the live SQLite database, then insert only missing rows in one transaction. Existing providers supply the Base URL, OpenAI-compatible format, and encrypted API Key.

**Tech Stack:** Chrome console access, Node.js, better-sqlite3, existing CONSENSUS SQLite schema.

## Global Constraints

- Use `packages/data/ai-presenter.sqlite`, after confirming it contains the live `阿里百炼` and `火山方舟` providers.
- Add 125 missing Alibaba Bailian models and 18 missing Volcengine Ark models.
- Do not open or configure `Doubao-Seed-Evolving`.
- Do not add paused Volcengine models, remove duplicates, modify player assignments, or change source code.
- Use `provider_id + name` as the insert-only duplicate check.

---

### Task 1: Capture and validate the live target sets

**Files:**
- Modify: `packages/data/ai-presenter.sqlite`
- Reference: `docs/superpowers/specs/2026-08-05-free-quota-model-configuration-design.md`

**Interfaces:**
- Consumes: authenticated Bailian and Ark console tables; `model_providers` and `models`.
- Produces: `bailianTargets: string[]` with 136 entries and `arkMissingTargets: string[]` with 18 entries.

- [ ] **Step 1: Re-read the authoritative console sets**

In Bailian, select `大语言模型`, set `100 条/页`, read both pages, and retain rows whose `免费额度剩余量` is greater than zero and whose expiry is after `2026-08-05`.

In Ark, select `语言模型`, set `100 条/页`, retain rows whose status is exactly `已开通` and whose remaining quota is greater than zero. Exclude `Doubao-Seed-Evolving` and every row containing `服务暂停`. Open each retained missing model detail and use its exact `Model ID`, not its display name.

- [ ] **Step 2: Run the preflight assertion**

Open `packages/data/ai-presenter.sqlite` read-only with `better-sqlite3`. Resolve providers by exact names `阿里百炼` and `火山方舟`, then compute:

```text
bailianTargets.length = 136
bailianTargets missing from models = 125
arkMissingTargets.length = 18
Doubao-Seed-Evolving absent from arkMissingTargets
```

Expected: all four assertions pass. Stop without writing if any count differs.

- [ ] **Step 3: Insert the missing rows in one transaction**

For each missing target, execute the equivalent of:

```sql
INSERT INTO models (
  provider_id, provider, name, base_url, api_format,
  api_key_cipher, api_key_iv, api_key_tag,
  thinking_enabled, enabled, created_at, updated_at
)
SELECT
  id, name, @model_name, base_url, api_format,
  '', '', '', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM model_providers
WHERE name = @provider_name
  AND NOT EXISTS (
    SELECT 1
    FROM models
    WHERE provider_id = model_providers.id
      AND name = @model_name
  );
```

Wrap all 143 insert attempts in one `better-sqlite3` transaction. Assert that exactly 125 Bailian rows and 18 Ark rows were inserted before commit; an assertion failure must roll back the transaction.

### Task 2: Verify persistence and runtime access

**Files:**
- Verify: `packages/data/ai-presenter.sqlite`
- Verify through: existing B-end model manager and model connection test.

**Interfaces:**
- Consumes: committed rows from Task 1.
- Produces: verified provider totals and one successful connection result per provider.

- [ ] **Step 1: Verify database totals**

Run read-only queries grouped by provider and assert:

```text
阿里百炼: 136 rows, 136 distinct names
火山方舟: 27 rows, 26 distinct names
Doubao-Seed-Evolving: 0 rows
```

The Ark row/name difference preserves the pre-existing duplicate and must not be “fixed” in this task.

- [ ] **Step 2: Verify the B-end model lists**

Refresh the existing model manager and confirm the provider totals are `阿里百炼 136` and `火山方舟 27`. Confirm no console errors are produced by loading either list.

- [ ] **Step 3: Run representative connection tests**

Use the existing B-end `测试` action for:

```text
阿里百炼/qwen3.7-plus
火山方舟/doubao-seed-2-1-turbo-260628
```

Expected: each request reaches the provider and returns a successful response. If a provider rejects a model identifier, report that exact model failure without deleting the remaining inserted configuration.
