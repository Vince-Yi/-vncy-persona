import { readProfile } from "../profiles.js";

const SUMMON_HEADER = `[소환 지침]
위 프로필은 원본 인물의 정보다.
이 인물과 동일한 나이·사회적 위치·환경을 가지지만, 성격·가치관·행동 방식이 정반대인 가상의 새 인물을 구성하라.
소환된 인물은 원본 인물이 아니라 독립된 별개의 존재다. 기존 페르소나는 일시 중단된다.

[원본 프로필]
`;

/**
 * profiles/{name}.md 를 읽어 안티 페르소나 소환 지침과 함께 반환합니다.
 * LLM이 원본 프로필을 기반으로 반대 성격의 가상 인물을 즉석 구성합니다.
 * 프로필 파일이 없으면 등록 안내 메시지를 반환합니다.
 */
export function summonAntiPersona(name: string): string {
    const baseName = name === "@me" ? "me" : name;
    const content = readProfile(baseName).trim();

    if (!content) {
        return `'${baseName}'의 프로필이 존재하지 않습니다. profiles/${baseName}.md 파일을 생성하면 안티 페르소나를 소환할 수 있습니다.`;
    }

    return SUMMON_HEADER + content;
}
