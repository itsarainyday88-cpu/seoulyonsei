import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSystemInstruction } from './agents/prompts';
import { generateAndSaveImage } from './imagen';
import { thinkingToolDefinitions, searchToolDefinitions } from './tools/definitions';
import { thinkingTools } from './tools/thinkingHelpers';
import { searchTools } from './tools/searchHelpers';
import { retrieveStyleContext } from './rag';

const apiKey = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

/** 
 * 이미지 생성 실패 시 정책 엔진을 통해 최적의 실사 자산을 반환합니다.
 */
async function getFallbackImageAsync(promptText: string, usedUrls: string[] = []): Promise<string> {
    const { getFallbackImage } = await import('./image-policy');
    return getFallbackImage(promptText, usedUrls);
}

const agentTemperatures: Record<string, number> = {
    Insta: 0.95,
    Blog: 0.9,
    Supporter: 0.8,
    Reputation: 0.8,
    Community: 0.7,
    Strategy: 0.7,
    Marketer: 0.7,
};

function getTodayContext() {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const month = now.getMonth() + 1;
    const day = now.getDate();

    let academicSeason = "";
    if (month === 3) academicSeason = "새 학기 개강 및 적응기 (첫 단추의 중요성 강조)";
    else if (month === 4) academicSeason = "1학기 중간고사 대비 모드 (몰입도 극대화)";
    else if (month === 5) academicSeason = "학습 흐름 유지 및 취약점 보완기";
    else if (month === 6) academicSeason = "6월 모평 분석 및 기말고사 대비";
    else if (month === 7) academicSeason = "여름방학 특강 및 성적 반전 골든타임";
    else if (month === 8) academicSeason = "수시 원서 접수 준비 및 고3 파이널 돌입";
    else if (month === 9) academicSeason = "9월 모평 및 대입 실전 감각 강화";
    else if (month === 10) academicSeason = "2학기 중간고사 및 상위권 굳히기";
    else if (month === 11) academicSeason = "수능 마무리 및 기말고사 시즌";
    else if (month === 12) academicSeason = "학년 전환기 핵심 관리 및 겨울방학 준비";
    else if (month === 1) academicSeason = "겨울방학 초몰입 특강 시즌";
    else if (month === 2) academicSeason = "종업식 및 새 학기 선행 완성";

    return `- 오늘: ${dateStr}\n- 학사 일정 시즌: ${academicSeason}\n- 분위기: 현재 학원가는 새 학기의 설렘 속에서도 상위권 도약을 위한 긴장감이 흐르고 있습니다.`;
}

// Export as a streaming generator
export async function* generateAgentResponseStream(agentId: string, message: string, history: any[] = [], useSearch: boolean = false) {
    const usedImageUrls = new Set<string>(); // Track images in this post!
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    const cleanHistory = history.length > 0 && history[0].role === 'model'
        ? history.slice(1)
        : history;

    const tryStream = async function* (modelName: string, retries = 1) {
        // 모든 에이전트: 커스텀 검색(search) 항상 활성화
        // ⚠️ googleSearch 그라운딩은 functionDeclarations와 동시 사용 불가 (Gemini API 제한)
        // 모든 에이전트: 커스텀 검색 + 사고(Thinking) 도구 항상 활성화
        let tools: any[] = [
            {
                functionDeclarations: [
                    ...searchToolDefinitions[0].functionDeclarations,
                    ...thinkingToolDefinitions[0].functionDeclarations,
                ]
            }
        ];

        console.log(`[Tool] Search + Thinking Tools Enabled for all agents on ${modelName}`);

        const todayContext = getTodayContext();
        let systemInstruction = getSystemInstruction(agentId, todayContext, message);
        // RAG 스타일 컨텍스트: Blog 에이전트에만 적용
        if (agentId === 'Blog') {
            const styleContext = await retrieveStyleContext(message);
            if (styleContext) {
                // RAG에 실제 원장님 글투 예시가 있으면 하드코딩 지침보다 최우선 적용
                systemInstruction += `\n\n[✍️ RAG Style Context - 최우선 글투 기준]\n` +
                    `⚠️ 아래에 실제 원장님이 직접 작성한 과거 포스팅 예시가 있습니다.\n` +
                    `이 예시의 어투, 문장 길이, 호흡, 단어 선택을 [실제 원장님 글투] 가이드라인보다 최우선으로 따르십시오.\n` +
                    `아래 예시가 비어있거나 없을 경우에만 [실제 원장님 글투] 섹션의 기본 가이드라인을 따르십시오.\n\n` +
                    styleContext;
            }
        }

        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemInstruction,
            tools: tools as any,
            generationConfig: {
                temperature: agentTemperatures[agentId] || 0.7,
                maxOutputTokens: 65536,
            },
        });

        // SDK 정석 포맷으로 변환
        const chatHistory = cleanHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
        }));

        const chat = model.startChat({
            history: chatHistory,
        });

        let currentInput: any = message;
        let functionCallCount = 0;
        const MAX_FUNCTION_CALLS = 10;

        while (true) {
            let attempt = 0;
            let responseStream = null;

            while (attempt <= retries) {
                try {
                    const result = await chat.sendMessageStream(currentInput);
                    responseStream = result.stream;
                    break;
                } catch (error: any) {
                    attempt++;
                    console.error(`Gemini Stream Error (${modelName}) Attempt ${attempt}:`, error.message);
                    if (attempt > retries) throw error;
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                }
            }

            if (!responseStream) throw new Error("Failed to get response stream");

            let buffer = '';
            let isFirstTextPassed = false; // [Insta] 첫 줄 보정을 위한 플래그
            let instaHookText = ''; // [Insta] 본문 중복 검사를 위한 Hook 저장 변수
            let functionCallDetected = false;
            let functionCallData: any = null;

            for await (const chunk of responseStream) {
                const funcCalls = chunk.functionCalls();
                if (funcCalls && funcCalls.length > 0) {
                    functionCallDetected = true;
                    functionCallData = funcCalls[0];
                    continue;
                }

                let chunkText = '';
                try {
                    chunkText = chunk.text();
                } catch (e) {
                    continue;
                }

                if (!chunkText) continue;
                buffer += chunkText;

                if (buffer.includes('\n') || buffer.length > 2000) {
                    const lines = buffer.split('\n');
                    const remainder = buffer.endsWith('\n') ? '' : lines.pop() || '';

                    for (const line of lines) {
                        const markerRegex = /\[IMAGE_GENERATE:(.*?)\]/i;
                        const match = line.match(markerRegex);

                        if (match) {
                            const fullMatch = match[0];
                            let promptText = match[1].trim().replace(/^[:\s]+/, '').trim();
                            if (promptText && promptText.length > 5) {
                                try {
                                    // Track used images to prevent duplicates in the same post
                                    const imageUrl = await generateAndSaveImage(promptText, Array.from(usedImageUrls));
                                    if (imageUrl) {
                                        usedImageUrls.add(imageUrl);
                                        yield line.replace(fullMatch, `\n\n![AI 생성 이미지](${encodeURI(imageUrl)})\n\n`) + '\n';
                                    } else {
                                        const fallback = await getFallbackImageAsync(promptText, Array.from(usedImageUrls));
                                        usedImageUrls.add(fallback);
                                        yield line.replace(fullMatch, `\n\n![학원 이미지](${encodeURI(fallback)})\n\n`) + '\n';
                                    }
                                } catch (err) {
                                    const fallback = await getFallbackImageAsync(promptText, Array.from(usedImageUrls));
                                    usedImageUrls.add(fallback);
                                    yield line.replace(fullMatch, `\n\n![학원 이미지](${encodeURI(fallback)})\n\n`) + '\n';
                                }
                            } else {
                                yield line + '\n';
                            }
                        } else {
                            let processedLine = line + '\n';
                            if (agentId === 'Insta' && !isFirstTextPassed && line.trim().length > 0) {
                                processedLine = enforceInstaHook(line) + '\n';
                                instaHookText = processedLine.trim();
                                isFirstTextPassed = true;
                                yield processedLine;
                            } else if (agentId === 'Insta' && isFirstTextPassed && line.trim().startsWith('📌')) {
                                // 본문의 핵심 팩트가 Hook과 너무 겹치는지 검사
                                if (!isSimilarToHook(instaHookText, line)) {
                                    yield processedLine;
                                } else {
                                    console.log(`[Insta Filter] Skipping redundant line: ${line}`);
                                }
                            } else {
                                yield processedLine;
                            }
                        }
                    }
                    buffer = remainder;
                }
            }

            if (buffer.trim()) {
                const markerRegex = /\[IMAGE_GENERATE:(.*?)\]/i;
                const match = buffer.match(markerRegex);
                if (match) {
                    const fullMatch = match[0];
                    let promptText = match[1].trim();
                    if (promptText && promptText.length > 5) {
                        try {
                            const imageUrl = await generateAndSaveImage(promptText, Array.from(usedImageUrls));
                            if (imageUrl) {
                                usedImageUrls.add(imageUrl);
                                yield buffer.replace(fullMatch, `\n\n![AI 생성 이미지](${encodeURI(imageUrl)})\n\n`);
                            } else {
                                const fallback = await getFallbackImageAsync(promptText, Array.from(usedImageUrls));
                                usedImageUrls.add(fallback);
                                yield buffer.replace(fullMatch, `\n\n![학원 이미지](${encodeURI(fallback)})\n\n`);
                            }
                        } catch (e) {
                            const fallback = await getFallbackImageAsync(promptText, Array.from(usedImageUrls));
                            usedImageUrls.add(fallback);
                            yield buffer.replace(fullMatch, `\n\n![학원 이미지](${encodeURI(fallback)})\n\n`);
                        }
                    } else {
                        let textToYield = buffer;
                        if (agentId === 'Insta' && !isFirstTextPassed && buffer.trim().length > 0) {
                            textToYield = enforceInstaHook(buffer);
                            isFirstTextPassed = true;
                        }
                        yield textToYield;
                    }
                } else {
                    let textToYield = buffer;
                    if (agentId === 'Insta' && !isFirstTextPassed && buffer.trim().length > 0) {
                        textToYield = enforceInstaHook(buffer);
                        isFirstTextPassed = true;
                    }
                    yield textToYield;
                }
            }

            // --- Multi-turn Function Chaining (연쇄 호출) ---
            if (functionCallDetected && functionCallData && functionCallCount < MAX_FUNCTION_CALLS) {
                functionCallCount++;
                const fnName = functionCallData.name;
                const fnArgs = functionCallData.args;

                console.log(`[Tool] Executing ${fnName}...`, fnArgs);

                // toolLabels에 따른 메시지 출력을 없애서 최종 결과물(마크다운 본문)이 오염되지 않도록 합니다.

                let toolResult: any;
                try {
                    if (fnName === 'init_thinking') toolResult = thinkingTools.init_thinking(fnArgs);
                    else if (fnName === 'add_thought_step') toolResult = thinkingTools.add_thought_step(fnArgs);
                    else if (fnName === 'reflect_thinking') toolResult = thinkingTools.reflect_thinking();
                    else if (fnName === 'googleSearch') toolResult = { content: "Search grounding complete." };
                    else if (fnName === 'search_local_trends') toolResult = await searchTools.search_local_trends(fnArgs);
                    else if (fnName === 'scrape_website') toolResult = await searchTools.scrape_website(fnArgs);
                    else toolResult = { error: "Unknown tool" }; // memory tools removed
                } catch (err: any) {
                    toolResult = { error: err.message };
                }

                // [Fix] SDK 요구 규격에 맞춰 content.parts 구조로 응답 전달
                const responsePart = {
                    functionResponse: {
                        name: fnName,
                        response: { content: toolResult }
                    }
                };

                currentInput = [responsePart];
                continue;
            }

            if (functionCallDetected && functionCallCount >= MAX_FUNCTION_CALLS) {
                currentInput = '지금까지 수집한 모든 정보와 도구 실행 결과를 바탕으로 최종 분석 및 기획안을 한국어로 작성하라. 더 이상 도구를 호출하지 말고 결론을 내라.';
                functionCallDetected = false;
                continue;
            }

            break;
        }
    };

    // [Final Queue] 1.5 완전 배제 & 스크린샷 텍스트용 모델만 엄선
    const modelQueue = [
        'gemini-3.1-pro-preview',
        'gemini-3-pro-preview',
        'gemini-3-flash-preview',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.0-flash'
    ];

    let lastError: any = null;
    for (const modelName of modelQueue) {
        try {
            console.log(`[Stream] Attempting with: ${modelName}`);
            yield* tryStream(modelName, 1);
            return;
        } catch (error: any) {
            lastError = error;
            console.warn(`[Stream] Model ${modelName} failed. Reason:`, error.message);
        }
    }

    throw lastError || new Error('All latest Gemini models failed. Please check network or API quota.');
}

/**
 * [Insta 전용] 전문가 조언에 따른 물리적 출력 보정
 * 1. 첫 줄을 후킹 멘트로 간주 (지능형 길이 제한)
 * 2. 이모지가 없으면 강제 삽입 (앞/뒤/양측 유연)
 */
function enforceInstaHook(text: string): string {
    if (!text.trim()) return text;

    // 이미지가 포함된 라인은 건드리지 않음
    if (text.includes('![AI 생성 이미지]') || text.includes('![학원 이미지]')) return text;

    const lines = text.split('\n');
    let firstLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().length > 0) {
            firstLineIdx = i;
            break;
        }
    }

    if (firstLineIdx === -1) return text;

    let firstLine = lines[firstLineIdx].trim();

    // 1. 지능형 길이 보정 (25~30자 유연)
    // 무조건 자르는게 아니라, 문장 부호(. ! ?)가 20~35자 사이에 있다면 거기서 끊음
    if (firstLine.length > 25) {
        const punctuationMatch = firstLine.substring(15, 35).match(/[.!?]/);
        if (punctuationMatch && punctuationMatch.index !== undefined) {
            firstLine = firstLine.substring(0, 15 + punctuationMatch.index + 1);
        } else {
            // 문장 부호가 없으면 마지막 공백 위치를 찾아 어절 단위로 자름
            const lastSpace = firstLine.lastIndexOf(' ', 28);
            if (lastSpace > 15) {
                firstLine = firstLine.substring(0, lastSpace) + '...';
            } else {
                firstLine = firstLine.substring(0, 22) + '...';
            }
        }
    }

    // 2. 이모지 체크 및 자동 보강
    const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/;
    if (!emojiRegex.test(firstLine)) {
        firstLine = `📌 ${firstLine} 💡`;
    }

    lines[firstLineIdx] = firstLine;
    return lines.join('\n');
}

/**
 * [Insta 전용] Hook과 본문의 중복도를 체크합니다.
 * 명사/핵심 키워드가 60% 이상 겹치면 중복으로 판단합니다.
 */
function isSimilarToHook(hook: string, line: string): boolean {
    const clean = (t: string) => t.replace(/[^\w\s가-힣]/g, '').split(/\s+/).filter(w => w.length > 1);
    const hookWords = clean(hook);
    const lineWords = clean(line);

    if (lineWords.length === 0) return false;

    let matches = 0;
    for (const word of lineWords) {
        if (hookWords.some(hw => hw.includes(word) || word.includes(hw))) {
            matches++;
        }
    }

    // 중복 비중이 60%를 넘으면 필터링 대상
    return (matches / lineWords.length) > 0.6;
}

