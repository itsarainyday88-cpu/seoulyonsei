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
export function getImagePolicy(prompt: string, excludedPaths: string[] = [], agentId?: string): {
    shouldGenerate: boolean;
    selectedImagePath?: string;
    reason?: string;
} {
    const p = prompt.toLowerCase();
    const isInsta = agentId === 'Insta';

    // 0. 강제 생성 백도어
    if (p.includes('[force_generate]')) {
        return { shouldGenerate: true, reason: 'Force generation requested.' };
    }

    // [Option 3] 맥락 인식: 인스타 에이전트 + 감성 키워드가 많거나 묘사가 구체적이면 AI 생성 우선
    const emotionalKeywords = ['감성', '분위기', 'mood', 'cinematic', '열정', '웃음', 'passion', 'smile', 'vibrant', 'lighting'];
    const hasEmotionalHint = emotionalKeywords.some(k => p.includes(k));
    const isRichPrompt = p.length > 35;

    if (isInsta && (hasEmotionalHint || isRichPrompt)) {
        return {
            shouldGenerate: true,
            reason: `[Insta Choice] Rich/Emotional context detected (${p.length} chars). Prioritizing AI for premium look.`
        };
    }

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

        if (selected) {
            // [Option 1] 인스타라면 원장님 키워드라도 20% 확률로 AI 생성을 섞어줌
            if (isInsta && Math.random() < 0.2) {
                return { shouldGenerate: true, reason: '[Insta Mix] 20% luck: Trying AI version of lecturer for variety.' };
            }
            return {
                shouldGenerate: false,
                selectedImagePath: selected.path,
                reason: `Real lecturer asset matched for tag: ${tag}`
            };
        }
    }

    // 2. 학원 시설/내부 관련 키워드 (FACILITY) - 태그별로 분리 매칭
    let facilityTag: string | null = null;

    if (p.includes('외관') || p.includes('외경') || p.includes('건물') || p.includes('exterior') || p.includes('building')) {
        facilityTag = 'exterior';
    } else if (p.includes('입구') || p.includes('현관') || p.includes('entrance') || p.includes('entry')) {
        facilityTag = 'entrance';
    } else if (p.includes('자습실') || p.includes('독서실') || p.includes('study room') || p.includes('self-study')) {
        facilityTag = 'study_room';
    } else if (p.includes('교실') || p.includes('강의실') || p.includes('수업') || p.includes('classroom') || p.includes('lecture room') || p.includes('학원') || p.includes('academy')) {
        facilityTag = 'classroom';
    }

    if (facilityTag) {
        const filtered = metadata.filter(img =>
            img.category === 'FACILITY' &&
            img.tag === facilityTag &&
            !excludedPaths.includes(img.path)
        );
        const selected = filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : null;
        if (selected) {
            // [Option 1] 인스타라면 시설 키워드 상충 시 6:4 비율로 AI 생성 허용 (기존보다 AI 비중 높힘)
            const aiWeight = isInsta ? 0.4 : 0.1;
            if (Math.random() < aiWeight) {
                return { shouldGenerate: true, reason: `[Insta Mix] AI Weight (${aiWeight}) applied for facility variety.` };
            }

            return {
                shouldGenerate: false, // Default to Real Asset for trust
                selectedImagePath: selected.path,
                reason: `Facility hint found for ${facilityTag}, using real asset for trust.`
            };
        }
    }

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

    if (policy.selectedImagePath && !excludedPaths.includes(policy.selectedImagePath)) {
        return policy.selectedImagePath;
    }

    // 만약 정책 엔진이 실패하거나 이미 사용된 이미지를 뱉었다면, 
    // 라이브러리 전체에서 아직 안 쓴 이미지를 랜덤하게 하나 고릅니다.
    const unused = metadata.filter(img => !excludedPaths.includes(img.path));
    if (unused.length > 0) {
        return unused[Math.floor(Math.random() * unused.length)].path;
    }

    // 진짜 다 썼다면 최후의 보루 (이건 어쩔 수 없이 중복 허용)
    return '/images/lecture_room.jpg';
}
