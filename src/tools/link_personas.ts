import { getDb } from "../db.js";

export function linkPersonas(
    source: string,
    target: string,
    relationType: string,
    description?: string
): string {
    const db = getDb();

    db.run(
        `INSERT INTO relationships (source_name, target_name, relation_type, description, updated_at)
         VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
         ON CONFLICT(source_name, target_name) DO UPDATE SET
             relation_type = excluded.relation_type,
             description   = excluded.description,
             updated_at    = excluded.updated_at`,
        [source, target, relationType, description ?? null]
    );

    const descNote = description ? ` — ${description}` : "";
    return `관계 등록/갱신 완료: ${source} → ${target} [${relationType}]${descNote}`;
}
