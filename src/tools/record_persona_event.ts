import { getDb } from "../db.js";
import { embed, vectorToJson } from "../embedder.js";

export async function recordPersonaEvent(
    name: string,
    content: string
): Promise<string> {
    const db = getDb();

    // 1. 벡터화 후 JSON 직렬화
    const vec = await embed(content);
    const embeddingJson = vectorToJson(vec);

    // 2. events 테이블 삽입
    db.run(
        `INSERT INTO events (persona_name, content, embedding, source_agent)
         VALUES (?, ?, ?, ?)`,
        [name, content, embeddingJson, "persona-mcp"]
    );

    // 3. 삽입된 ID 조회
    const row = db.get(
        `SELECT id FROM events WHERE persona_name = ? AND content = ? ORDER BY id DESC LIMIT 1`,
        [name, content]
    ) as { id: number } | undefined;

    const newId = row?.id ?? "?";
    return `저장 완료: '${name}' 사건 ID=${newId}`;
}
