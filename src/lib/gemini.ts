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

        let systemInstruction = getSystemInstruction(agentId, message);
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
                temperature: 1.0,
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
                            let textToYield = line + '\n';
                            if (agentId === 'Insta' && !isFirstTextPassed && line.trim().length > 0) {
                                textToYield = enforceInstaHook(line) + '\n';
                                isFirstTextPassed = true;
                            }
                            yield textToYield;
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
 * 1. 첫 줄을 후킹 멘트로 간주 (25자 제한)
 * 2. 이모지가 없으면 강제 삽입 (앞/뒤/양측 유연)
 */
function enforceInstaHook(text: string): string {
    if (!text.trim()) return text;

    // 이미지가 포함된 라인은 건드리지 않음
    if (text.includes('![AI 생성 이미지]') || text.includes('![학원 이미지]')) return text;

    const lines = text.split('\n');
    let firstLineIdx = -1;

    // 실제 텍스트가 있는 첫 줄 찾기
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().length > 0) {
            firstLineIdx = i;
            break;
        }
    }

    if (firstLineIdx === -1) return text;

    let firstLine = lines[firstLineIdx].trim();

    // 1. 길이 제한 (25자)
    if (firstLine.length > 25) {
        firstLine = firstLine.substring(0, 22) + '...';
    }

    // 2. 이모지 체크 (RegExp for common emojis)
    const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/;
    if (!emojiRegex.test(firstLine)) {
        // 이모지가 없으면 맥락에 따라 앞 또는 뒤에 추가 (여기선 앞뒤 양쪽 시각적 포인트)
        firstLine = `📌 ${firstLine} 💡`;
    }

    lines[firstLineIdx] = firstLine;
    return lines.join('\n');
}

