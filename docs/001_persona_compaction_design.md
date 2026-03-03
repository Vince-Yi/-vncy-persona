# Event & Relationship Compaction and MD Management Design

- Purpose: Continuously manage events and relationships in compacted form, and consolidate them into md files during compact to improve persona comprehension quality.
- Premise: Manage via md files during compact (events are already reflected via ## Insights; relationships are not yet reflected).

---

## 1. Current Behavior Summary

| Target | Storage | On compact | Reflected in get_persona_context |
|--------|---------|------------|----------------------------------|
| Events | `memory.db` (events) | Full query → summarize → update `## Insights`, delete DB events, VACUUM + WAL checkpoint | Profile (md) + top 5 DB remaining events by **persona name embedding** similarity |
| Relationships | `memory.db` (relationships) | None | Full DB query → [Relationships] section |

- Events: "compact → md" flow already exists. However, `summarizeEvents` is only deduplication + top-20 selection, not true sentence summarization.
- Relationships: DB-only; not reflected in md. Not migrated to md at compact time.

---

## 2. Design Goals

- Events: Keep current behavior — compact **condenses** into `profiles/{name}.md` **## Insights**. (Summary quality improvement is a separate future task.)
- Relationships: On compact, **condense DB relationships** into a **## Relationships** section in `profiles/{name}.md`, and use **md-first** on persona lookup to make the profile a single source of truth.

---

## 3. Data Flow

### 3.1 Events (unchanged)

- `record_persona_event` → write to DB `events`.
- `compact_memories(name)` → query persona events → summarize → update `## Insights` → delete DB events → run VACUUM → WAL checkpoint (ignore if unsupported).
- `get_persona_context` → [Profile] includes full md (including Insights) + [Events] are top 5 DB remaining events by **persona name embedding similarity** (not chronological).

### 3.2 Relationships (new)

- `link_personas` → write to DB `relationships` (unchanged).
- **On compact**: query relationships where persona is source or target → build one-line strings (e.g., `A → B: relation_type (description)`) → update **## Relationships** section in `profiles/{name}.md`.
- **DB policy**: relationships are **not deleted from DB** unlike events. The md is a "condensed snapshot"; additions/updates via `link_personas` are reflected on the next compact.
- On `get_persona_context`:
    - If profile md has `## Relationships` → use **md section content** for [Relationships].
    - If not (pre-compact or no relationships) → **query DB** for [Relationships] (same as current).

---

## 4. MD Profile Structure (Proposal)

- Existing sections: `## Identity`, `## Global Guidelines`, `## Insights`.
- New section: **## Relationships** (updated only on compact).

Example (`john-doe.md`):

```markdown
## Relationships
- john-doe → jane-smith: collaborator (joint lead on Project X)
- john-doe → bob-kim: mentor (tech review)
- jane-smith → john-doe: collaborator (joint lead on Project X)
```

> When compacted with the `@me` alias, written to `me.md` in the same format as `me → X`.

- `DEFAULT_TEMPLATE`: New profiles **include** an empty `## Relationships` section (section exists before compact; can be manually edited).

---

## 5. Responsibility Split

| Component | Role |
|-----------|------|
| `profiles.ts` | Add **`updateRelationships(name, lines[])`** alongside `updateInsights`. Overwrite `## Relationships` section regardless of whether it exists (regex pattern, same as `updateInsights`). |
| `compact_memories.ts` | After processing persona events, query DB `relationships` for the same persona → build line list → call `updateRelationships`. |
| `get_persona_context.ts` | [Relationships]: if md has `## Relationships`, use that block; otherwise use DB query result. (Unified as "relationships from md OR DB, never both" to avoid duplication.) |

---

## 6. Edge Cases & Policies

- **Large number of relationships**: On compact, reflect **all records** (no upper limit). Policy may be revisited later if needed.
- **Single relationship type constraint**: DB schema enforces `UNIQUE(source_name, target_name)` — **only one relationship type per pair of personas**. Re-calling `link_personas` overwrites the existing `relation_type` and `description`. Multiple types (e.g., both manager and mentor) are not supported. Cannot be resolved without a DB schema change.
- **Bidirectional relationships**: If both A→B and B→A rows exist, both lines appear in md naturally. Current `link_personas` usage convention is unchanged.
- **Relationship exists in md only (not in DB)**: If md was manually edited, `get_persona_context` uses md-first, so manual content is used for [Relationships]. **DB always overwrites on compact** — manual edits are lost on next compact.
- **Event summary quality**: Current `summarizeEvents` is "deduplication + top 20" only. "Sentence condensation/summarization" is a future extension when an LLM or similar tool is introduced.

---

## 7. Suggested Implementation Order

1. `profiles.ts`: Add `updateRelationships(name, relationshipLines: string[])` with `## Relationships` section update logic (regex pattern, same as `updateInsights`).
2. `compact_memories.ts`: After events processing (early return on `events.length === 0` **kept as-is**), only when events exist: query relationships → call `updateRelationships`.
3. `get_persona_context.ts`: Branch [Relationships] by md `## Relationships` presence — md-first, fallback to DB.
4. (Optional) Add `## Relationships` to the default template and document.

> **Note**: Personas with relationships but no events will **not** have ## Relationships updated on compact (current behavior retained). To update ## Relationships for such a persona, record a dummy event (`record_persona_event`) then run compact.

---

## 8. Migration Notes

- **Existing profiles have no ## Relationships**
    - `get_persona_context`: no section → fallback to DB query → same as current. No issue.
    - `updateRelationships`: when section is absent, append at end of file as `\n## Relationships\n...` (same pattern as `updateInsights`).

- **Persona with relationships only (no events)**
    - Current `compact_memories` returns early on `events.length === 0` with "no events to compact".
    - **Policy decision**: keep early return as-is. Personas without events will **not** have ## Relationships updated on compact.
    - To update ## Relationships for such a persona during migration, record a dummy event (`record_persona_event`) then run compact.

- **Manually edited ## Relationships being overwritten**
    - compact always writes from DB. After upgrade, the first compact will **overwrite** any manually added relationships in md. Relationships not in DB will be lost.
    - **Policy confirmed**: always overwrite from DB. Release notes should advise: "sync manual md relationships to DB via `link_personas` before running compact".

- **Section name collision in profile md**
    - If a user already uses `## Relationships` (or a similar heading) for another purpose, `updateRelationships` regex will overwrite it. Rare, but worth documenting.

- **DB schema**
    - No changes. `memory.db` / `relationships` table used as-is. No DB migration required.

- **Older clients / other devices**
    - Old version: [Relationships] always reads from DB only. Even if compact writes to md on new version, old clients ignore md and **always read DB**. Behavior consistent.
    - New version + uncompacted data: no ## Relationships in md → falls back to DB. Same as current.

- **File encoding**
    - `readProfile` / `updateInsights` assume `utf-8`. Profiles saved in a different encoding may be corrupted on read/write. Handle via BOM/encoding detection or document the limitation as needed.

- **Summary**
    - Highest-impact migration items: **(1) personas with relationships only require a dummy event before compact (policy confirmed)**, **(2) manual relationship edits in md will be overwritten by compact — policy confirmed, release note required**.

---

## 9. Completion Criteria

- On compact, the persona's relationships are condensed and reflected in `profiles/{name}.md` ## Relationships (only for personas with events).
- On `get_persona_context`, relationship info comes from md if available, otherwise from DB — exactly one source, no duplication.
- Existing event compact (## Insights) behavior is preserved.
- Calling compact for a persona with no events behaves identically to current behavior (returns "no events to compact").
