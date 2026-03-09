# @vncy/persona-mcp

**Global Persona & Relationship Vault** — 여러 AI 에이전트와 기기 간 일관된 인물·관계 세계관을 유지하는 MCP 서버.

## 주요 기능

- **하이브리드 저장**: 정적 Markdown 프로필 + SQLite 벡터 메모리
- **관계 그래프**: 인물 간 연결 관리 (협력자, 멘토, 친구 등)
- **클라우드 동기화**: 구글 드라이브 등으로 기기 간 "공통 뇌" 공유
- **이미지 게임**: 시나리오 기반 인터뷰로 페르소나 깊이 확장

## 설치

```bash
npm install -g @vncy/persona-mcp
# 또는
npx @vncy/persona-mcp
```

## 요구 사항

- Node.js **18.x 이상** (18 LTS, 20 LTS, 22, 25 등 모두 지원)

## 빠른 시작

1. Cursor/Claude Desktop 설정에 MCP 서버 추가:

```json
{
  "mcpServers": {
    "persona-mcp": {
      "command": "npx",
      "args": ["@vncy/persona-mcp"]
    }
  }
}
```

2. `PERSONA_PATH` 환경 변수로 저장 경로 지정 (선택). 기본값: `~/.vy/persona`

## 저장 구조

```
~/.vy/persona/
├── profiles/           # 정적 지식
│   ├── me.md          # 본인 프로필 (전역 운영 규칙)
│   └── {이름}.md      # 인물 프로필
├── memory.db          # 동적 지식 (SQLite)
├── memory.db-wal
└── memory.db-shm
```

| 구분 | 저장소 | 용도 |
|------|--------|------|
| 정적 | `profiles/*.md` | 핵심 정체성, 지침, 요약된 통찰 |
| 동적 | `memory.db` | 벡터 사건 기록 + 관계 그래프 |

## MCP 도구

### get_persona_context(name)

인물의 전체 맥락 반환: 프로필, 최근 사건(벡터 검색), 관계망.

- 인물 또는 `@me` 언급 시 호출
- `@me`는 `profiles/me.md`를 가리킴 (Instruction Sovereignty)

### record_persona_event(name, content)

인물에 대한 새 사실·사건·특징을 저장. 내용은 벡터화되어 유사도 검색 대상이 됨.

- 인물에 관한 새 정보를 알게 될 때마다 호출

### link_personas(source, target, relation_type, description?)

두 인물 간 관계를 정의하거나 갱신.

- 예: `link_personas("홍길동", "이순신", "협력자", "프로젝트 X 공동 담당")`
- 양방향 관계는 (A→B), (B→A) 각각 호출

### compact_memories(name)

파편화된 벡터 기억을 요약하여 `profiles/{name}.md`에 반영하고, 원본 이벤트를 DB에서 삭제.

- 맥락이 과도하게 길거나 중복이 많을 때 호출
- 클라우드 동기화 전 DB 경량화 권장

### summon_anti_persona(name)

원본 인물과 동일한 나이·사회적 위치·환경을 가지지만, 성격과 가치관이 정반대인 **가상의 새 인물**을 즉석 소환한다.

- 별도 저장 데이터 없음 — LLM이 원본 프로필을 바탕으로 반대 인물을 즉석 구성
- `profiles/{name}.md` 를 읽어 소환 지침과 함께 반환하면, LLM이 그로부터 반대 성격의 인물을 도출
- 안티 페르소나는 원본 인물이 역할을 맡는 것이 아니라 독립된 별개의 가상 존재
- 맥락상 데빌스 어드보킷, 스트레스 테스트, 롤플레이가 적절할 때 호출
- `@me` → `profiles/me.md`

## 이미지 게임 (Profiling Game)

사용자가 "이미지 게임하자" 등으로 요청할 때:

1. **대상 선정**: 특정 인물 지정 또는 프로필이 부족한 3인 제안
2. **맥락 인출**: `get_persona_context`로 최근 사건·관계 조회
3. **인터뷰**: 시나리오 기반 질문 (예: "A를 프로그래밍 언어에 비유하면 C++인가요, JS인가요?")
4. **반영**: 모든 답변을 `record_persona_event`로 저장; 관계가 드러나면 `link_personas` 호출

## 에이전트 전역 지침 (페르소나 취합을 위해 필수)

MCP만 설치해서는 **부족하다**. 에이전트가 도구를 자동으로 호출하지 않으며, 지침 없이는 페르소나가 일관되게 수집·갱신되지 않는다. 시스템 프롬프트, Cursor 규칙(예: `.cursor/rules` 또는 프로젝트 규칙) 등에 아래 내용을 넣어, 에이전트가 **반드시** 해당 도구를 사용하도록 하라.

**시스템 프롬프트 또는 `.cursorrules` / Cursor 규칙에 추가:**

```markdown
# MISSION: @vncy/persona-mcp Manager
전역적·일관된 세계관은 반드시 persona-mcp 도구(get_persona_context, record_persona_event, link_personas, compact_memories, summon_anti_persona)만 사용하여 유지하라. 저장 경로를 직접 건드리지 말 것.

# PROTOCOLS (미준수 시 페르소나 취합이 잘 되지 않음)
1. **Retrieval**: 인물(또는 "@me") 언급 시 항상 get_persona_context 호출.
2. **Learning**: 새 사실은 record_persona_event, 관계는 link_personas로 기록.
3. **Compaction**: 구글 드라이브 동기화를 위해 compact_memories를 선제적으로 호출.
4. **Anti-persona**: 맥락상 데빌스 어드보킷·스트레스 테스트·롤플레이 등이 적절하다고 판단될 때 summon_anti_persona(name) 호출. LLM이 원본 프로필을 바탕으로 반대 인물을 즉석 구성함.
5. **Image Game**: 시나리오 기반 인터뷰로 페르소나 깊이와 관계를 다듬기.
6. **Instruction Sovereignty**: profiles/me.md의 "Global Operational Rules"를 기본 동작보다 우선.
```

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `PERSONA_PATH` | 페르소나 저장 루트 경로 | `~/.vy/persona` |

## 프로필 템플릿

```markdown
# {인물명}

## Identity
- 핵심 정체성, 역할, 배경

## Global Guidelines
- 에이전트가 준수할 전역 지침

## Insights
- compact_memories로 압축된 통찰 (자동 갱신)

## Relationships
- compact_memories로 관계 스냅샷 (자동 갱신)
```

## 트러블슈팅

### `Error: The specified module could not be found` / `onnxruntime_binding.node` / `ERR_DLOPEN_FAILED`

npx 캐시에 **구 버전**(v0.0.3 이전)이 남아 있을 때 발생합니다. 구 버전은 `@xenova/transformers`를 사용했으며, 이 패키지의 `onnxruntime-node` 네이티브 바이너리가 Node.js 22+ 에서 호환되지 않습니다.

**해결: npx 캐시를 초기화하고 재실행**

```bash
npx clear-npx-cache
npx @vncy/persona-mcp
```

> v0.0.3+부터 `@huggingface/transformers`(WASM 기반)를 사용합니다. 네이티브 바이너리가 없어 Node.js 버전 제한이 없습니다.

## 라이선스

MIT
