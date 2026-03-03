import { getDb } from "../db.js";
import { updateInsights, updateRelationships, readInsights } from "../profiles.js";

interface RelationshipRow {
    source_name: string;
    target_name: string;
    relation_type: string;
    description: string | null;
}

interface EventRow {
    id: number;
    content: string;
}

// 신규 이벤트 우선, 기존 Insights는 빈 자리 채움. dedup + 상위 20건.
function summarizeEvents(events: EventRow[], existing: string[]): string[] {
    const seen = new Set<string>();
    const insights: string[] = [];
    for (const item of [...events.map((e) => e.content.trim()), ...existing]) {
        if (item.length > 0 && !seen.has(item)) {
            seen.add(item);
            insights.push(item);
        }
        if (insights.length >= 20) break;
    }
    return insights;
}

export function compactMemories(name: string): string {
    const db = getDb();
    const resolvedName = name === "@me" ? "me" : name;

    // 1. 해당 인물의 모든 사건 조회
    const events = db.all(
        `SELECT id, content FROM events WHERE persona_name = ? ORDER BY created_at ASC`,
        [resolvedName]
    ) as unknown as EventRow[];

    if (events.length === 0) {
        return `'${resolvedName}'의 압축할 사건 기록이 없습니다.`;
    }

    // 2. 기존 md Insights + 신규 이벤트 합산 → 요약 통찰 생성
    const existingInsights = readInsights(resolvedName);
    const insights = summarizeEvents(events, existingInsights);

    // 3. profiles/{name}.md의 ## Insights 섹션 갱신
    updateInsights(resolvedName, insights);

    // 3-1. 해당 인물 관계 조회 → ## Relationships 섹션 갱신
    const relationships = db.all(
        `SELECT source_name, target_name, relation_type, description
         FROM relationships
         WHERE source_name = ? OR target_name = ?
         ORDER BY updated_at ASC`,
        [resolvedName, resolvedName]
    ) as unknown as RelationshipRow[];

    if (relationships.length > 0) {
        const relLines = relationships.map((r) => {
            const desc = r.description ? ` (${r.description})` : "";
            return `${r.source_name} → ${r.target_name}: ${r.relation_type}${desc}`;
        });
        updateRelationships(resolvedName, relLines);
    }

    // 4. 원본 이벤트 삭제
    const ids = events.map((e) => e.id);
    const placeholders = ids.map(() => "?").join(",");
    db.run(`DELETE FROM events WHERE id IN (${placeholders})`, ids);

    // 5. VACUUM으로 삭제된 페이지 공간 회수 (파일 크기 실제 축소)
    db.exec("VACUUM");

    // 6. WAL 체크포인트 플러시 (node-sqlite3-wasm 지원 범위 내)
    try {
        db.exec("PRAGMA wal_checkpoint(FULL)");
    } catch {
        // WAL 체크포인트 미지원 시 무시
    }

    const relMsg = relationships.length > 0 ? `, 관계 ${relationships.length}건 → Relationships 반영` : "";
    return `압축 완료: '${resolvedName}' 사건 ${events.length}건 → Insights ${insights.length}개로 압축${relMsg}, DB 정리 완료.`;
}
