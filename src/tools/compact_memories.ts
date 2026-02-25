import { getDb } from "../db.js";
import { updateInsights } from "../profiles.js";

interface EventRow {
    id: number;
    content: string;
}

function summarizeEvents(events: EventRow[]): string[] {
    const seen = new Set<string>();
    const insights: string[] = [];
    for (const ev of events) {
        const trimmed = ev.content.trim();
        if (!seen.has(trimmed)) {
            seen.add(trimmed);
            insights.push(trimmed);
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

    // 2. 요약 통찰 생성
    const insights = summarizeEvents(events);

    // 3. profiles/{name}.md의 ## Insights 섹션 갱신
    updateInsights(resolvedName, insights);

    // 4. 원본 이벤트 삭제
    const ids = events.map((e) => e.id);
    const placeholders = ids.map(() => "?").join(",");
    db.run(`DELETE FROM events WHERE id IN (${placeholders})`, ids);

    // 5. WAL 체크포인트 플러시 (node-sqlite3-wasm 지원 범위 내)
    try {
        db.exec("PRAGMA wal_checkpoint(FULL)");
    } catch {
        // WAL 체크포인트 미지원 시 무시
    }

    return `압축 완료: '${resolvedName}' 사건 ${events.length}건 → Insights ${insights.length}개로 압축, DB 정리 완료.`;
}
