import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * 사용자 메시지와 가장 유사한 원장님의 과거 문체 데이터를 검색하여
 * 시스템 프롬프트에 주입할 컨텍스트 블록을 반환합니다.
 *
 * @param query - 사용자 입력 메시지
 * @param matchCount - 가져올 최대 참조 문서 수 (기본값: 3)
 * @returns 프롬프트에 주입할 컨텍스트 문자열 (없으면 빈 문자열)
 */
export async function retrieveStyleContext(query: string, matchCount = 3): Promise<string> {
    try {
        // 1. 쿼리를 벡터로 변환
        const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
        const result = await embeddingModel.embedContent(query);
        const queryEmbedding = result.embedding.values;

        // 2. Supabase에서 유사 문체 데이터 검색
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.4, // 낮게 설정해 더 넓은 범위 매칭
            match_count: matchCount,
        });

        if (error || !documents || documents.length === 0) {
            if (error) console.warn('[RAG] Supabase RPC error:', error.message);
            return '';
        }

        // 3. 검색된 문서를 컨텍스트 블록으로 조합
        let context = `\n\n--- [원장님 과거 작성 글 참조 데이터 (Tone of Voice)] ---\n`;
        context += `다음은 이 학원 원장님이 직접 작성하신 **실제 블로그 글의 일부 발췌본**입니다.\n`;
        context += `🚨 [매우 중요] 아래 데이터는 '전체 글'이 아니라 '일부 조각'일 뿐입니다. 절대 아래 데이터의 "짧은 분량"을 따라하지 마십시오.\n`;
        context += `글의 전체적인 구조, 분량, 깊이 있는 정보 전달은 [시스템 기본 지침]을 따르되, **오직 문체(어투, 단어 선택, 지적인 분위기, 전문적인 태도)**만 철저히 모방하십시오.\n\n`;

        documents.forEach((doc: { content: string }, idx: number) => {
            context += `[참조 ${idx + 1}]\n${doc.content}\n\n`;
        });

        context += `--- [참조 데이터 끝] ---\n`;
        return context;
    } catch (err) {
        // 오류 시 조용히 실패 — 기존 글 생성 로직은 정상 동작
        console.warn('[RAG] Context retrieval failed (silent fallback):', err);
        return '';
    }
}
