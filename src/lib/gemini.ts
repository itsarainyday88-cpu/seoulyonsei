import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSystemInstruction } from './agents/prompts';
import { generateAndSaveImage } from './imagen';
import { thinkingToolDefinitions, searchToolDefinitions } from './tools/definitions';
import { thinkingTools } from './tools/thinkingHelpers';
import { searchTools } from './tools/searchHelpers';
import { retrieveStyleContext } from './rag';
import { ACADEMY_HISTORY, ENTRANCE_YEAR_FACTS } from './agents/prompts';

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
    Threads: 0.85,
    Reputation: 0.8,
    Shortform: 0.7,
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
        // 모든 에이전트: 커스텀 검색 + 사고(Thinking) 도구 활성화
        let tools: any[] = [
            {
                functionDeclarations: [
                    ...searchToolDefinitions[0].functionDeclarations,
                    ...thinkingToolDefinitions[0].functionDeclarations,
                ]
            }
        ];

        // [📌 Search Enable] Google Search Retrieval 활성화 (Grounding 기능)
        if (useSearch) {
            tools.push({
                googleSearchRetrieval: {
                    dynamicRetrievalConfig: {
                        mode: "MODE_DYNAMIC",
                        dynamicThreshold: 0.3,
                    },
                },
            });
        }

        console.log(`[Tool] Search + Thinking Tools Enabled on ${modelName}`);

        const todayContext = getTodayContext();
        let systemInstruction = getSystemInstruction(agentId, todayContext, message);

        // [📌 핵심] 사용자가 직접 이미지를 첨부했는지 확인 (분석 우선순위 보존 목적)
        const hasUserAttachedImage = message.includes('![') || message.includes('사용자 첨부') || message.includes('이미지 정보');
        // RAG 스타일 컨텍스트: Blog 및 Threads 에이전트에 적용
        if (agentId === 'Blog' || agentId === 'Threads') {
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

        // [🛠️ Vision Support] 메시지 내 이미지 URL 추출 및 Parts 변환
        const prepareMessageParts = async (msg: string) => {
            const parts: any[] = [];
            const imageRegex = /!\[.*?\]\((https?:\/\/.*?|data:image\/.*?)\)/g;
            let lastIndex = 0;
            let match;

            while ((match = imageRegex.exec(msg)) !== null) {
                const textBefore = msg.substring(lastIndex, match.index).trim();
                if (textBefore) parts.push({ text: textBefore });

                const url = match[1];
                try {
                    console.log(`[Vision] Fetching image for analysis: ${url}`);
                    const response = await fetch(url);
                    if (response.ok) {
                        const buffer = await response.arrayBuffer();
                        const base64 = Buffer.from(buffer).toString('base64');
                        const mimeType = response.headers.get('content-type') || 'image/jpeg';

                        parts.push({
                            inlineData: {
                                data: base64,
                                mimeType: mimeType
                            }
                        });
                    }
                } catch (err) {
                    console.error('[Vision] Failed to fetch image:', url, err);
                }
                lastIndex = imageRegex.lastIndex;
            }

            const remainingText = msg.substring(lastIndex).trim();
            if (remainingText) parts.push({ text: remainingText });

            return parts.length > 0 ? parts : [{ text: msg }];
        };

        // SDK 정석 포맷으로 변환 (History에도 시각 정보 반영)
        const chatHistory = await Promise.all(cleanHistory.map(async (msg) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: await prepareMessageParts(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)),
        })));

        const chat = model.startChat({
            history: chatHistory,
        });

        let currentInput: any = await prepareMessageParts(message);
        let functionCallCount = 0;
        const MAX_FUNCTION_CALLS = 10;

        // [📌 Truth-Guard] 신뢰할 수 있는 사실 정보 저장소 (숫자 기반 팩트 체크용)
        let verifiedFacts = `${message}\n${ACADEMY_HISTORY}\n${ENTRANCE_YEAR_FACTS}\n`;

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
            let threadsLineCount = 0; // [Threads] 포스트당 라인수 제한
            let currentPostNum = 0; // [Threads] 현재 포스트 번호
            let inThreadsCompliance = false; // [Threads] 컴플라이언스 구간 여부
            let skipThreadsPost = false; // [Threads] 2개 초과 포스트 스킵 플래그
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
                            // [🚨 Coding-Level Restriction] Shortform 에이전트는 이미지 생성을 원천 차단
                            if (agentId === 'Shortform') {
                                yield line.replace(match[0], '').trim() + '\n';
                                continue;
                            }

                            const fullMatch = match[0];
                            let promptText = match[1].trim().replace(/^[:\s]+/, '').trim();
                            if (promptText && promptText.length > 5) {
                                try {
                                    // [🚨 Lite Mode Optimization] 
                                    // On Vercel, skip slow AI generation and potential 'fs' crash.
                                    // Directly use Policy Engine's fallback images for instant response.
                                    if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') {
                                        const fallback = await getFallbackImageAsync(promptText, Array.from(usedImageUrls));
                                        usedImageUrls.add(fallback);
                                        yield line.replace(fullMatch, `\n\n![학원 이미지](${encodeURI(fallback)})\n\n`) + '\n';
                                        continue;
                                    }

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

                            // [🚨 Coding-Level Restriction] Shortform 에이전트는 모든 마크다운 이미지 출력을 차단
                            if (agentId === 'Shortform') {
                                processedLine = processedLine.replace(/!\[.*?\]\(.*?\)/g, '');
                                if (!processedLine.trim()) continue; // 이미지만 있는 라인은 건너뜀
                            }

                            // [🚨 Coding-Level Filters]
                            // 1. 유령 인용구 삭제
                            processedLine = filterPhantomReferences(processedLine) + '\n';

                            // 2. [📌 Truth-Guard] 출처 불분명한 수치 환각 차단 (블로그/마케터 등 전문가 모드에서 강력 작동)
                            if (agentId !== 'Insta') {
                                processedLine = verifyFactIntegrity(processedLine, verifiedFacts);
                            }

                            if (agentId === 'Threads') {
                                // [🚨 Coding-Level Restriction] 스레드 포스트 본문/개수 제한
                                const postMatch = processedLine.match(/^Post\s+(\d+):/i);
                                if (postMatch) {
                                    const pNum = parseInt(postMatch[1]);
                                    if (pNum > 2) {
                                        skipThreadsPost = true;
                                        continue; // Post 3 이상은 표시하지 않음
                                    }
                                    currentPostNum = pNum;
                                    threadsLineCount = 0;
                                    inThreadsCompliance = false;
                                    skipThreadsPost = false;
                                    yield processedLine;
                                } else if (processedLine.trim().includes('🚦')) {
                                    inThreadsCompliance = true;
                                    skipThreadsPost = false;
                                    yield processedLine;
                                } else if (inThreadsCompliance) {
                                    yield processedLine;
                                } else if (!skipThreadsPost && processedLine.trim().length > 0) {
                                    threadsLineCount++;
                                    if (threadsLineCount <= 2) yield processedLine;
                                } else if (!skipThreadsPost) {
                                    yield processedLine;
                                }
                            } else if (agentId === 'Insta') {
                                if (!isFirstTextPassed && processedLine.trim().length > 0) {
                                    // [🚨 Fix] 이미지 라인이면 후킹 로직을 건너뛰고 '첫 번째 텍스트'로 간주하지 않음
                                    if (processedLine.trim().startsWith('![')) {
                                        yield processedLine;
                                    } else {
                                        processedLine = enforceInstaHook(processedLine.trim()) + '\n';
                                        instaHookText = processedLine.trim();
                                        isFirstTextPassed = true;
                                        yield processedLine;
                                    }
                                } else if (isFirstTextPassed && processedLine.trim().startsWith('📌')) {
                                    // 본문의 핵심 팩트가 Hook과 너무 겹치는지 검사
                                    if (!isSimilarToHook(instaHookText, processedLine)) {
                                        yield processedLine;
                                    } else {
                                        console.log(`[Insta Filter] Skipping redundant line: ${processedLine.trim()}`);
                                    }
                                } else {
                                    yield processedLine;
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
                            // [🚨 Lite Mode Optimization] 
                            if (process.env.NEXT_PUBLIC_APP_MODE === 'lite') {
                                const fallback = await getFallbackImageAsync(promptText, Array.from(usedImageUrls));
                                usedImageUrls.add(fallback);
                                yield buffer.replace(fullMatch, `\n\n![학원 이미지](${encodeURI(fallback)})\n\n`);
                                return;
                            }

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

                    // [🚨 Coding-Level Restriction] Shortform 에이전트는 마지막 출력에서도 이미지 완전 배제
                    if (agentId === 'Shortform') {
                        textToYield = textToYield.replace(/!\[.*?\]\(.*?\)/g, '');
                        textToYield = textToYield.replace(/\[IMAGE_GENERATE:.*?\]/gi, '');
                    }

                    // [🚨 Coding-Level Restriction] Threads 에러 방지용 최종 필터
                    if (agentId === 'Threads') {
                        const lines = textToYield.split('\n');
                        let finalLines = [];
                        let f_threadsLineCount = 0;
                        let f_skipThreadsPost = false;
                        let f_inThreadsCompliance = false;

                        for (const l of lines) {
                            const pm = l.match(/^Post\s+(\d+):/i);
                            if (pm) {
                                const pNum = parseInt(pm[1]);
                                if (pNum > 2) {
                                    f_skipThreadsPost = true;
                                    continue;
                                }
                                f_threadsLineCount = 0;
                                f_skipThreadsPost = false;
                                f_inThreadsCompliance = false;
                                finalLines.push(l);
                            } else if (l.trim().includes('🚦')) {
                                f_inThreadsCompliance = true;
                                f_skipThreadsPost = false;
                                finalLines.push(l);
                            } else if (f_inThreadsCompliance) {
                                finalLines.push(l);
                            } else if (!f_skipThreadsPost && l.trim().length > 0) {
                                f_threadsLineCount++;
                                if (f_threadsLineCount <= 2) finalLines.push(l);
                            } else if (!f_skipThreadsPost) {
                                finalLines.push(l);
                            }
                        }
                        textToYield = finalLines.join('\n');
                    }

                    if (agentId !== 'Insta') {
                        textToYield = verifyFactIntegrity(textToYield, verifiedFacts);
                    }
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
                    if (fnName === 'init_thinking') toolResult = await thinkingTools.init_thinking(fnArgs);
                    else if (fnName === 'add_thought_step') toolResult = await thinkingTools.add_thought_step(fnArgs);
                    else if (fnName === 'reflect_thinking') toolResult = await thinkingTools.reflect_thinking();
                    else if (fnName === 'googleSearch') toolResult = { content: "Search grounding complete." };
                    else if (fnName === 'search_local_trends') toolResult = await searchTools.search_local_trends(fnArgs);
                    else if (fnName === 'scrape_website') toolResult = await searchTools.scrape_website(fnArgs);
                    else toolResult = { error: "Unknown tool" }; // memory tools removed
                } catch (err: any) {
                    toolResult = { error: err.message };
                }

                // [📌 Truth-Guard] 도구 실행 결과를 사실 정보 저장소에 추가하여 실시간 검증에 활용
                if (toolResult && typeof toolResult === 'object') {
                    verifiedFacts += JSON.stringify(toolResult) + "\n";
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

    // [Final Queue] 원장님 원래 설정 모델 리스트 (지능 중심)
    const modelQueue = [
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-3.1-pro-preview',
        'gemini-3-pro-preview',
        'gemini-2.5-pro'
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

    // [🚨 Fix] 이미지가 포함된 라인(![...])은 후킹 멘트 보정 대상에서 절대 제외 (데이터 훼손 방지)
    if (text.includes('![AI 생성 이미지]') || text.includes('![학원 이미지]') || text.includes('![')) return text;

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
 * [전용 필터] 존재하지 않는 이미지/카드뉴스/안내문 인용구를 코드 레벨에서 삭제합니다.
 * AI가 이미지 분석 내용을 바탕으로 "위 안내문에서 보듯" 같은 말을 지어내는 것을 방지합니다.
 */
function filterPhantomReferences(text: string): string {
    if (!text.trim()) return text;

    // 필터링할 유령 인용구 리스트 (정규식)
    const phantomPatterns = [
        /위\s+카드뉴스(에서)?\s+(확인하듯|보듯|보시는 것처럼|나와\s+있듯|제공하듯)/g,
        /위\s+안내문(에서)?\s+(확인하듯|보듯|보시는 것처럼|나와\s+있듯|제공하듯)/g,
        /이미지(에서)?\s+(확인하듯|보듯|보시는 것처럼|나와\s+있듯|적힌|나와있는)/g,
        /사진(에서)?\s+(확인하듯|보듯|보시는 것처럼|나와\s+있듯|적힌|나와있는)/g,
        /이미지\s+속\s+(정보|수치|내용|데이터|문구)/g,
        /사진\s+속\s+(정보|수치|내용|데이터|문구)/g,
        /카드뉴스\s+콘텐츠(에서)?\s+확인하듯/g,
        /카드뉴스\s+내용대로/g,
        /카드뉴스(가)?\s+말해주는/g,
        /안내문에\s+나와\s+있듯/g,
        /^위\s+내용처럼\s+/g,
        /^이미지(가)?\s+증명하듯\s+/g
    ];

    let cleanedText = text;
    for (const pattern of phantomPatterns) {
        cleanedText = cleanedText.replace(pattern, '').trim();
    }

    // 문장 시작이 어색하게 짤린 경우 보정 (예: " 확인하듯 ~" -> "~")
    cleanedText = cleanedText.replace(/^\s+/, '');

    return cleanedText;
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

/**
 * [📌 Truth-Guard 엔진] 
 * 수치 데이터(인원, 확률, 연도 등)가 신뢰할 수 있는 소스에 있는지 물리적으로 검증합니다.
 * 출처가 밝혀지지 않은 허구의 수치를 뱉는 즉시 차단하거나 표시합니다.
 */
function verifyFactIntegrity(text: string, knownFacts: string): string {
    if (!text.trim()) return text;

    // 입시에서 의미 있는 수치 패턴 (명, %, 점, 학년도, 백분위, 등급 등)
    // 숫자가 포함된 민감한 입시 팩트를 정밀 타겟팅
    const factPattern = /([1-9]\d*)\s*(명|%|점|학년도|등급|위|%p|원|건|개|배|학기|대|곳|가지)/g;

    return text.replace(factPattern, (match, value) => {
        // [검증 정책] 
        // 1. 숫자가 '10' 이하라면 일반적인 서술일 가능성이 높으므로 통과
        if (parseInt(value) <= 10) return match;

        // 2. 숫자가 신뢰할 수 있는 사실(knownFacts) 문자열에 포함되어 있는지 확인
        // (단순 포함 여부만으로도 1차적인 강력한 Hallucination 차단 효과가 있음)
        if (knownFacts.includes(value)) {
            return match; // 검증 성공
        }

        // 3. 검증 실패 시: 원장님께 공포의 팩트 체크 신호를 보냄
        console.warn(`[🚨 Truth-Guard Blocked] Unverified admission stat: ${match} (Source missing)`);
        return `[🚨 확인 필요: ${match}]`;
    });
}

