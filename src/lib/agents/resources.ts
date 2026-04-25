export const FIXED_RESOURCES = {
    LOGO: "",
    INTERIOR: "",
    DIRECTORS: "",
};

export const RESOURCE_INSTRUCTIONS = `
[고정 리소스 가이드]
다음 항목에 대해서는 AI 이미지를 생성하지 말고, 아래 지정된 URL을 마크다운 이미지 형식으로 직접 사용하십시오.
- **병원 로고**: ![병원 로고](${FIXED_RESOURCES.LOGO})
- **내부/인테리어**: ![병원 내부](${FIXED_RESOURCES.INTERIOR})
- **원장님/의료진**: ![의료진](${FIXED_RESOURCES.DIRECTORS})

**주의:** 특히 병원 전경(Exterior)이나 건물 외관 이미지는 절대로 생성하거나 노출하지 마십시오.
`;
