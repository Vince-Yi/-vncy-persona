import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIM = 384;

let _extractor: FeatureExtractionPipeline | null = null;

/**
 * 모델을 사전 로딩합니다. 서버 시작 시 한 번 호출하여 콜드 스타트를 방지합니다.
 */
export async function preloadModel(): Promise<void> {
    if (_extractor) return;
    _extractor = await pipeline("feature-extraction", MODEL_NAME, {
        quantized: true,
    });
}

async function getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!_extractor) {
        await preloadModel();
    }
    return _extractor!;
}

/**
 * 텍스트를 384차원 Float32Array 벡터로 변환합니다.
 */
export async function embed(text: string): Promise<Float32Array> {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    const data = output.data as Float32Array;
    if (data.length !== EMBEDDING_DIM) {
        throw new Error(
            `임베딩 차원 불일치: 기대 ${EMBEDDING_DIM}, 실제 ${data.length}`
        );
    }
    return data;
}

/**
 * Float32Array를 JSON 직렬화 가능한 배열로 변환합니다.
 */
export function vectorToJson(vec: Float32Array): string {
    return JSON.stringify(Array.from(vec));
}

/**
 * JSON 문자열을 Float32Array로 복원합니다.
 */
export function jsonToVector(json: string): Float32Array {
    return new Float32Array(JSON.parse(json) as number[]);
}

/**
 * 두 벡터 간 코사인 유사도를 계산합니다. (0~1, 높을수록 유사)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
