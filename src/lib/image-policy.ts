import metadata from '../../public/images/assets-metadata.json';

export type ImageCategory = 'PEOPLE' | 'FACILITY' | 'BRANDING';
export type ImageTag = 'math' | 'korean' | 'directors' | 'group' | 'exterior' | 'entrance' | 'study_room' | 'classroom' | 'general';

interface ImageAsset {
    id: string;
    category: string;
    tag: string;
    path: string;
    original_name: string;
}

/**
 * 프롬프트를 분석하여 AI 생성을 허용할지, 아니면 실물 사진을 반환할지 결정합니다.
 */
export function getImagePolicy(prompt: string, excludedPaths: string[] = []): {
    shouldGenerate: boolean;
    selectedImagePath?: string;
    reason?: string;
} {
    const p = prompt.toLowerCase();

    // 1. 강사/원장님 관련 키워드 (PEOPLE)
    if (p.includes('원장') || p.includes('선생님') || p.includes('강사') || p.includes('lecturer') || p.includes('teacher') || p.includes('director')) {
        let tag: ImageTag = 'group';
        if (p.includes('수학') || p.includes('math')) tag = 'math';
        else if (p.includes('국어') || p.includes('korean')) tag = 'korean';
        else if (p.includes('부부') || p.includes('두 분') || p.includes('원장님들')) tag = 'directors';

        const filtered = metadata.filter(img =>
            img.category === 'PEOPLE' &&
            img.tag === tag &&
            !excludedPaths.includes(img.path)
        );
        const selected = filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : null;

        return {
            shouldGenerate: false,
            selectedImagePath: selected?.path || '/images/directors.webp',
            reason: `Real lecturer asset matched for tag: ${tag}`
        };
    }

    // 2. 학원 시설/내부 관련 키워드 (FACILITY)
    // [UPDATE] 이제 시설 관련은 AI 생성(Imagen)을 우선합니다. (다양성 확보)
    // 실물 사진이 정말로 필요한 경우(예: 특정 명칭의 입구 등)는 나중에 추가 정의 가능.
    /*
    if (p.includes('학원') || p.includes('교실') || p.includes('자습실') || p.includes('복도') || p.includes('외관') || p.includes('classroom') || p.includes('academy') || p.includes('study room')) {
        ...
    }
    */

    // 3. 로고 관련 (BRANDING)
    if (p.includes('로고') || p.includes('logo')) {
        return {
            shouldGenerate: false,
            selectedImagePath: '/images/logo.png',
            reason: 'Branding asset requested'
        };
    }

    // 4. 그 외 추상적 키워드는 AI 생성 허용
    return {
        shouldGenerate: true,
        reason: 'Attempting latest AI generation (Imagen 4/Nano) for max variety.'
    };
}

/**
 * AI 생성 실패 시 사용할 폴백 이미지를 선택합니다.
 */
export function getFallbackImage(prompt: string, excludedPaths: string[] = []): string {
    const policy = getImagePolicy(prompt, excludedPaths);
    return policy.selectedImagePath || '/images/lecture_room.jpg';
}
