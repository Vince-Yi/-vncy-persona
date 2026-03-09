import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { preloadModel } from "./embedder.js";
import { getDb } from "./db.js";
import { getPersonaContext } from "./tools/get_persona_context.js";
import { recordPersonaEvent } from "./tools/record_persona_event.js";
import { linkPersonas } from "./tools/link_personas.js";
import { compactMemories } from "./tools/compact_memories.js";
import { summonAntiPersona } from "./tools/summon_anti_persona.js";

async function main() {
    // 초기화: DB 연결 및 임베딩 모델 사전 로딩
    getDb();
    await preloadModel();

    const server = new McpServer({
        name: "persona-mcp",
        version: "1.0.0",
    });

    // ── get_persona_context ──────────────────────────────────────────────────
    server.tool(
        "get_persona_context",
        `특정 인물의 전체 맥락(Context)을 하나의 통합 텍스트로 반환합니다.

동작:
1. profiles/{name}.md 의 정적 프로필을 읽어 핵심 정체성 및 지침 제공.
2. memory.db의 events 테이블에서 코사인 유사도 검색으로 해당 인물의 최근 관련 사건 최대 5건 추출.
3. relationships 테이블에서 해당 인물이 주체 또는 대상인 모든 관계를 조회.

호출 시점:
- 사용자가 특정 인물을 언급하거나 "@me"로 본인을 참조할 때 반드시 호출.
- 이미지 게임(Profiling Game)의 질문 설계 전 맥락 인출 단계에서 호출.

주의:
- '@me'는 사용자 본인(profiles/me.md)을 의미하며 Instruction Sovereignty가 적용됨.
- 프로필 파일이 없는 인물이라도 메모리와 관계망은 정상 반환.`,
        { name: z.string().describe("대상 인물명. '@me'는 사용자 본인.") },
        async ({ name }) => {
            const text = await getPersonaContext(name);
            return { content: [{ type: "text", text }] };
        }
    );

    // ── record_persona_event ─────────────────────────────────────────────────
    server.tool(
        "record_persona_event",
        `인물에 대한 새로운 사실, 사건, 특징을 영구 저장합니다.

동작:
1. content를 all-MiniLM-L6-v2 모델로 벡터화(384차원).
2. events 테이블에 사건 레코드(embedding 포함) 삽입.

호출 시점:
- 대화 중 특정 인물에 관한 새로운 정보를 알게 된 즉시 호출.
- 이미지 게임(Profiling Game)에서 사용자가 인물에 대해 답변할 때마다 즉시 호출.
- 에이전트가 어떤 정보를 "새로 파악했다"고 판단하는 모든 순간에 호출.

주의:
- 중복 저장을 우려해 호출을 지연하지 말 것. compact_memories가 중복을 정리함.
- '@me' 표기를 사용하지 말고 실제 인물명 또는 'me'를 name으로 전달.`,
        {
            name: z.string().describe("대상 인물명."),
            content: z
                .string()
                .describe("기록할 사건, 특징, 새로 알게 된 사실의 내용."),
        },
        async ({ name, content }) => {
            const result = await recordPersonaEvent(name, content);
            return { content: [{ type: "text", text: result }] };
        }
    );

    // ── link_personas ────────────────────────────────────────────────────────
    server.tool(
        "link_personas",
        `두 인물 간의 관계를 정의하거나 갱신합니다.

동작:
1. (source, target) 쌍이 이미 존재하면 relation_type과 description을 업데이트.
2. 존재하지 않으면 새 관계 레코드를 삽입.
3. 갱신 결과는 get_persona_context의 [관계망] 섹션에 즉시 반영됨.

호출 시점:
- 사용자가 두 인물 간의 관계(조직, 프로젝트, 인간관계)를 언급할 때 호출.
- 이미지 게임(Profiling Game) 중 관계 정보가 드러날 때 즉시 호출.
- 관계의 방향이 양방향이라면 (A→B), (B→A) 두 번 각각 호출.

주의:
- relation_type은 짧고 명확한 단어 사용 권장 (예: '상사'이지 '홍길동의 직속 상관'이 아님).
- description에 관계의 구체적 맥락(프로젝트명, 계기 등)을 기록할 것.`,
        {
            source: z.string().describe("관계의 주체 인물명."),
            target: z.string().describe("관계의 대상 인물명."),
            relation_type: z
                .string()
                .describe(
                    "관계 종류. 예: '협력자', '상사', '부하', '친구', '멘토', '경쟁자'."
                ),
            description: z
                .string()
                .optional()
                .describe("관계에 대한 상세 맥락 설명. 선택 입력."),
        },
        async ({ source, target, relation_type, description }) => {
            const result = linkPersonas(source, target, relation_type, description);
            return { content: [{ type: "text", text: result }] };
        }
    );

    // ── summon_anti_persona ──────────────────────────────────────────────────
    server.tool(
        "summon_anti_persona",
        `특정 인물과 동일한 나이·사회적 위치·환경을 가지지만, 성격·가치관이 정반대인 가상의 새 인물을 즉석 소환합니다.

동작:
1. profiles/{name}.md 를 읽어 원본 프로필을 로드.
2. 소환 지침과 함께 원본 프로필을 반환. LLM이 이를 바탕으로 반대 성격의 독립된 가상 인물을 구성함.
3. 프로필이 없으면 등록 안내 메시지 반환.

호출 시점:
- 사용자의 발화 맥락상 안티 페르소나 소환이 적절하다고 판단될 때.

주의:
- 소환된 인물은 {name} 본인이 아니라 독립된 가상 인물임. 기존 페르소나는 일시 중단됨.
- '@me'는 사용자 본인(profiles/me.md)을 의미함.
- 별도 저장 데이터 없이 원본 프로필만으로 동작함.`,
        { name: z.string().describe("안티 페르소나를 소환할 원본 인물명. '@me'는 본인.") },
        async ({ name }) => {
            const text = summonAntiPersona(name);
            return { content: [{ type: "text", text }] };
        }
    );

    // ── compact_memories ─────────────────────────────────────────────────────
    server.tool(
        "compact_memories",
        `특정 인물의 파편화된 벡터 기억을 요약·압축하여 정적 프로필에 반영하고 DB를 최적화합니다.

동작:
1. events 테이블에서 해당 인물의 모든 사건 기록을 조회.
2. 핵심 통찰 불릿 목록 생성 (중복 제거 후 최대 20개).
3. profiles/{name}.md의 ## Insights 섹션을 새 요약으로 갱신.
4. 압축된 원본 이벤트를 events 테이블에서 삭제.
5. VACUUM으로 DB 파일 크기 실제 축소.
6. WAL 체크포인트를 실행하여 동기화용 DB 파일 정리.

호출 시점:
- get_persona_context 반환 결과가 과도하게 길거나 중복 내용이 많을 때.
- 구글 드라이브 동기화 효율을 위해 DB를 경량화해야 할 때.
- 에이전트가 자율적으로 DB 비대화를 감지했을 때 선제적으로 호출.

주의:
- 압축 후에는 원본 벡터 이벤트가 삭제되므로 요약 품질이 중요함.
- profiles/{name}.md 파일이 없을 경우 기본 템플릿으로 자동 생성할 것.`,
        { name: z.string().describe("압축 대상 인물명.") },
        async ({ name }) => {
            const result = compactMemories(name);
            return { content: [{ type: "text", text: result }] };
        }
    );

    // 서버 시작
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("persona-mcp 서버 시작됨 (stdio 모드)");
}

main().catch((err) => {
    console.error("서버 시작 실패:", err);
    process.exit(1);
});
