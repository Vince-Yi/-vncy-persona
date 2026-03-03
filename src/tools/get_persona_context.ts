import { getDb } from "../db.js";
import { embed, jsonToVector, cosineSimilarity } from "../embedder.js";
import { readProfile } from "../profiles.js";

interface EventRow {
    created_at: string;
    content: string;
    embedding: string | null;
}

interface RelationshipRow {
    source_name: string;
    target_name: string;
    relation_type: string;
    description: string | null;
}

export async function getPersonaContext(name: string): Promise<string> {
    const db = getDb();
    const resolvedName = name === "@me" ? "me" : name;

    // 1. 정적 프로필 읽기
    const profileContent = readProfile(name);

    // 2. 벡터 유사도 검색 (상위 5건) - JS 코사인 유사도
    const queryVec = await embed(resolvedName);

    const allEvents = db.all(
        `SELECT created_at, content, embedding FROM events
         WHERE persona_name = ? AND embedding IS NOT NULL`,
        [resolvedName]
    ) as unknown as EventRow[];

    const scored = allEvents
        .map((ev) => ({
            ev,
            score: cosineSimilarity(queryVec, jsonToVector(ev.embedding!)),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    // 3. 통합 텍스트 조합
    const sections: string[] = [];

    sections.push("[프로필]");
    sections.push(profileContent || "(프로필 파일 없음)");

    sections.push("\n[최근 사건 (상위 5건)]");
    if (scored.length === 0) {
        sections.push("- (기록된 사건 없음)");
    } else {
        for (const { ev } of scored) {
            sections.push(`- ${ev.created_at}: ${ev.content}`);
        }
    }

    // 4. 관계망: md에 ## Relationships 있으면 md 우선, 없으면 DB 조회
    sections.push("\n[관계망]");
    if (profileContent.includes("## Relationships")) {
        const relMatch = profileContent.match(/## Relationships\n([\s\S]*?)(?:\n##|$)/);
        const relContent = relMatch ? relMatch[1].trim() : "";
        sections.push(relContent || "- (등록된 관계 없음)");
    } else {
        const relationships = db.all(
            `SELECT source_name, target_name, relation_type, description
             FROM relationships WHERE source_name = ? OR target_name = ?`,
            [resolvedName, resolvedName]
        ) as unknown as RelationshipRow[];

        if (relationships.length === 0) {
            sections.push("- (등록된 관계 없음)");
        } else {
            for (const rel of relationships) {
                const desc = rel.description ? ` (${rel.description})` : "";
                sections.push(
                    `- ${rel.source_name} → ${rel.target_name}: ${rel.relation_type}${desc}`
                );
            }
        }
    }

    return sections.join("\n");
}
