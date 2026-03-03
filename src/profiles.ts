import fs from "fs";
import path from "path";
import { getPersonaRoot } from "./db.js";

const DEFAULT_TEMPLATE = (name: string) => `# ${name}

## Identity
- (핵심 정체성, 역할, 배경을 여기에 기록)

## Global Guidelines
- (에이전트가 준수할 전역 지침을 여기에 기록)

## Insights
- (compact_memories로 압축된 통찰이 자동으로 반영됩니다)

## Relationships
- (compact_memories로 관계가 자동으로 반영됩니다)
`;

function resolveProfilePath(name: string): string {
    const resolvedName = name === "@me" ? "me" : name;
    const root = getPersonaRoot();
    return path.join(root, "profiles", `${resolvedName}.md`);
}

/**
 * 인물 프로필 MD 파일을 읽어 반환합니다.
 * 파일이 없으면 빈 문자열을 반환합니다 (예외 미발생).
 */
export function readProfile(name: string): string {
    const filePath = resolveProfilePath(name);
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf-8");
}

/**
 * 인물 프로필 MD 파일의 ## Insights 섹션 내용을 문자열 배열로 반환합니다.
 * 파일이 없거나 섹션이 없으면 빈 배열을 반환합니다.
 */
export function readInsights(name: string): string[] {
    const content = readProfile(name);
    if (!content) return [];
    const match = content.match(/## Insights\n([\s\S]*?)(?:\n##|$)/);
    if (!match) return [];
    return match[1]
        .split("\n")
        .filter((l) => l.startsWith("- "))
        .map((l) => l.slice(2).trim())
        .filter((l) => l.length > 0);
}

/**
 * 인물 프로필 MD 파일의 ## Insights 섹션을 새 내용으로 교체합니다.
 * 파일이 없으면 기본 템플릿으로 신규 생성합니다.
 */
export function updateInsights(name: string, insightLines: string[]): void {
    const filePath = resolveProfilePath(name);

    let content: string;
    if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, "utf-8");
    } else {
        const resolvedName = name === "@me" ? "me" : name;
        content = DEFAULT_TEMPLATE(resolvedName);
    }

    const insightsBlock = insightLines.map((l) => `- ${l}`).join("\n");
    const insightsSectionRegex = /(## Insights\n)([\s\S]*?)(\n##|$)/;

    if (insightsSectionRegex.test(content)) {
        content = content.replace(
            insightsSectionRegex,
            (_match, header, _old, tail) =>
                `${header}${insightsBlock}${tail}`
        );
    } else {
        content += `\n## Insights\n${insightsBlock}\n`;
    }

    fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * 인물 프로필 MD 파일의 ## Relationships 섹션을 새 내용으로 교체합니다.
 * 파일이 없으면 기본 템플릿으로 신규 생성합니다.
 * DB 기준으로 항상 덮어씁니다.
 */
export function updateRelationships(name: string, relationshipLines: string[]): void {
    const filePath = resolveProfilePath(name);

    let content: string;
    if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, "utf-8");
    } else {
        const resolvedName = name === "@me" ? "me" : name;
        content = DEFAULT_TEMPLATE(resolvedName);
    }

    const relBlock = relationshipLines.map((l) => `- ${l}`).join("\n");
    const relSectionRegex = /(## Relationships\n)([\s\S]*?)(\n##|$)/;

    if (relSectionRegex.test(content)) {
        content = content.replace(
            relSectionRegex,
            (_match, header, _old, tail) =>
                `${header}${relBlock}${tail}`
        );
    } else {
        content += `\n## Relationships\n${relBlock}\n`;
    }

    fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * profiles/ 디렉터리에서 모든 인물명 목록을 반환합니다.
 */
export function listPersonaNames(): string[] {
    const profilesDir = path.join(getPersonaRoot(), "profiles");
    if (!fs.existsSync(profilesDir)) return [];
    return fs
        .readdirSync(profilesDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""));
}
