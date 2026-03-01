import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSystemInstruction } from './agents/prompts';
import { generateAndSaveImage } from './imagen';
import { toolDefinitions, thinkingToolDefinitions, memoryToolDefinitions, searchToolDefinitions } from './tools/definitions';
import { memoryTools } from './tools/memoryHelpers';
import { thinkingTools } from './tools/thinkingHelpers';
import { searchTools } from './tools/searchHelpers';
import { retrieveStyleContext } from './rag';

const apiKey = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * 이미지 생성 실패 시, 프롬프트 맥락에 맞는 실제 보유 이미지 경로 반환
 * public/images 폴더 내 실사 사진들을 상황별로 자동 선택
 */
// Keep track of recent fallback images to avoid consecutive duplicates
let lastFallbackImage = '';

/** 이미지 생성 실패 시 카테고리별 후보 풀에서 랜덤 선택하여 반환. 같은 글에서도 다양한 사진이 나옴. */
function getFallbackImage(promptText: string): string {
    const p = promptText.toLowerCase();

    // Helper function to pick a random item, avoiding the last used one if possible
    const pick = (arr: string[]) => {
        if (arr.length <= 1) return arr[0];

        let candidate = arr[Math.floor(Math.random() * arr.length)];
        let attempts = 0;
        // Try up to 3 times to get a different image than the last one
        while (candidate === lastFallbackImage && attempts < 3) {
            candidate = arr[Math.floor(Math.random() * arr.length)];
            attempts++;
        }
        lastFallbackImage = candidate;
        return candidate;
    };

    // 로고: 명시적으로 logo를 요청할 때만
    if (p.includes('logo')) return pick(['/images/logo.png']);

    // 지도/위치
    if (p.includes('map') || p.includes('location') || p.includes('direction') || p.includes('위치') || p.includes('지도') || p.includes('길찾기')) {
        return pick(['/images/map.png', '/images/exterior.jpg']);
    }

    // 원장/강사/전문성
    if (p.includes('director') || p.includes('teacher') || p.includes('instructor') || p.includes('원장') || p.includes('강사') || p.includes('expert') || p.includes('professional')) {
        return pick(['/images/directors.png', '/images/lecture_room.jpg']);
    }

    // 자습/스터디/교실
    if (p.includes('study') || p.includes('student') || p.includes('self') || p.includes('자습') || p.includes('스터디') || p.includes('premium') || p.includes('class')) {
        return pick(['/images/Premium.jpg', '/images/lecture_room.jpg']);
    }

    // 외관/건물
    if (p.includes('exterior') || p.includes('outside') || p.includes('building') || p.includes('외관') || p.includes('건물')) {
        return pick(['/images/exterior.jpg', '/images/directors.png']);
    }

    // 기본: 전체 풀에서 랜덤 순환 (map 제외)
    return pick([
        '/images/lecture_room.jpg',
        '/images/Premium.jpg',
        '/images/directors.png',
        '/images/exterior.jpg',
        '/images/logo.png'
    ]);
}

// Export as a streaming generator
export async function* generateAgentResponseStream(agentId: string, message: string, history: any[] = [], useSearch: boolean = false) {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    // Sanitize history
    const cleanHistory = history.length > 0 && history[0].role === 'model'
        ? history.slice(1)
        : history;

    // Helper to try streaming with a specific model
    const tryStream = async function* (modelName: string, retries = 1) {
        // Initialize model with tools
        // Logic: 
        // 1. Efficiency Mode: Memory Tools + Google Search (No Thinking)
        // 2. Deep Mode: Memory Tools + Google Search + Thinking Tools

        // Tool Selection Logic (Exclusive Switching)
        // Tool Selection Logic (Combined)
        // Start with basic tools (Memory)
        let tools: any[] = [...memoryToolDefinitions];

        // Add Thinking tools if in deep mode
        // if (mode === 'deep') {
        //     tools = [...tools, ...thinkingToolDefinitions];
        // }

        // Add Google Search if requested (Coexists with other tools)
        if (useSearch) {
            console.log(`[Tool] Adding Google Search capability for: "${message.substring(0, 20)}..."`);
            tools.push({ googleSearch: {} });
        } else {
            console.log(`[Tool] Using Internal Logic Mode for: "${message.substring(0, 20)}..."`);
        }

        // Add Deep Research tools for Marketer agent
        if (agentId === 'Marketer') {
            tools = [...tools, ...searchToolDefinitions];
            console.log('[Tool] Marketer: Deep Research tools (search_local_trends, scrape_website) enabled.');
        }

        // Fetch RAG context automatically (except for strict Marketer research maybe, but let's apply to all or specific writing agents)
        // For writing tasks ('Blog', 'Insta', 'Dang', 'Reputation', 'Supporter'), inject style context
        let systemInstruction = getSystemInstruction(agentId, message);
        if (['Blog', 'Insta', 'Dang', 'Reputation', 'Supporter'].includes(agentId)) {
            const styleContext = await retrieveStyleContext(message);
            if (styleContext) {
                systemInstruction += styleContext;
            }
        }

        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemInstruction,
            tools: tools as any,
            generationConfig: {
                temperature: 1.0,
                maxOutputTokens: 8192,
            },
        });

        // Loop for Function Calling (Max 5 turns to prevent infinite loops)
        let chatHistory = cleanHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
        }));

        const chat = model.startChat({
            history: chatHistory,
        });

        let currentMessage = message;
        let functionCallCount = 0;
        const MAX_FUNCTION_CALLS = 5;

        while (true) {
            let attempt = 0;
            let responseStream = null;

            while (attempt <= retries) {
                try {
                    const result = await chat.sendMessageStream(currentMessage);
                    responseStream = result.stream;
                    break;
                } catch (error: any) {
                    attempt++;
                    console.error(`Gemini Stream (${modelName}) Error (Attempt ${attempt}):`, error.message);
                    if (error.message?.includes('429')) throw error;
                    if (attempt > retries) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }

            if (!responseStream) throw new Error("Failed to get response stream");

            // Buffer for detecting Nano Banana Prompts
            let buffer = '';
            let functionCallDetected = false;
            let functionCallData: any = null;

            for await (const chunk of responseStream) {
                // Check for Function Call prediction
                // @ts-ignore
                const fc = typeof chunk.functionCalls === 'function' ? chunk.functionCalls()?.[0] : undefined;
                // @ts-ignore
                if (fc) {
                    functionCallDetected = true;
                    functionCallData = fc;
                    continue; // Do not yield text for function calls
                }

                // If not function call, yield text as usual
                const chunkText = chunk.text();
                // console.log('[GEMINI CHUNK]', JSON.stringify(chunkText)); // Too verbose

                if (!chunkText) continue;

                buffer += chunkText;

                // Process lines if newline exists or buffer gets too long
                // [Optimization] Increased buffer size to 2000 to handle long single-line prompts
                if (buffer.includes('\n') || buffer.length > 2000) {
                    const lines = buffer.split('\n');
                    // Always keep the last part in buffer unless it ends with newline explicitly
                    const remainder = buffer.endsWith('\n') ? '' : lines.pop() || '';


                    for (const line of lines) {
                        // [Fix] Standardized Image Trigger Logic
                        // Syntax: [IMAGE_GENERATE: description]
                        const markerRegex = /\[IMAGE_GENERATE:(.*?)\]/i;
                        const match = line.match(markerRegex);

                        if (match) {
                            // ... Image Gen Logic ...
                            const fullMatch = match[0];
                            let promptText = match[1].trim();

                            // Extra cleanup
                            promptText = promptText.replace(/^[:\s]+/, '').trim();

                            if (promptText && promptText.length > 5) {
                                try {
                                    const imageUrl = await generateAndSaveImage(promptText);
                                    if (imageUrl) {
                                        // Replace the trigger tag with the actual Markdown image tag
                                        const processedLine = line.replace(fullMatch, `\n\n![AI 생성 이미지](${imageUrl})\n\n`);
                                        yield processedLine + '\n';
                                    } else {
                                        // 생성 실패 시 실제 보유 이미지로 자동 대체
                                        const fallback = getFallbackImage(promptText);
                                        const fallbackLine = line.replace(fullMatch, `\n\n![학원 이미지](${fallback})\n\n`);
                                        yield fallbackLine + '\n';
                                    }
                                } catch (err) {
                                    // 오류 시도 폴백 이미지 사용
                                    const fallback = getFallbackImage(promptText);
                                    const fallbackLine = line.replace(fullMatch, `\n\n![학원 이미지](${fallback})\n\n`);
                                    yield fallbackLine + '\n';
                                }
                            } else {
                                // Empty prompt
                                console.warn('[Gemini] Empty prompt detected:', line);
                                yield line.replace(fullMatch, '') + '\n';
                            }
                        } else {
                            yield line + '\n';
                        }
                    }
                    buffer = remainder;
                }
            }

            // Process remaining buffer
            if (buffer.trim()) {
                const markerRegex = /\[IMAGE_GENERATE:(.*?)\]/i;
                const match = buffer.match(markerRegex);
                if (match) {
                    const fullMatch = match[0];
                    let promptText = match[1].trim();

                    if (promptText && promptText.length > 5) {
                        try {
                            const imageUrl = await generateAndSaveImage(promptText);
                            if (imageUrl) {
                                const processedLine = buffer.replace(fullMatch, `\n\n![AI 생성 이미지](${imageUrl})\n\n`);
                                yield processedLine;
                            } else {
                                const fallback = getFallbackImage(promptText);
                                const fallbackLine = buffer.replace(fullMatch, `\n\n![학원 이미지](${fallback})\n\n`);
                                yield fallbackLine;
                            }
                        } catch (e) {
                            const fallback = getFallbackImage(promptText);
                            yield buffer.replace(fullMatch, `\n\n![학원 이미지](${fallback})\n\n`);
                        }
                    } else {
                        yield buffer;
                    }
                } else {
                    yield buffer;
                }
            }

            // Handle Function Execution Loop
            if (functionCallDetected && functionCallData && functionCallCount < MAX_FUNCTION_CALLS) {
                functionCallCount++;
                const fnName = functionCallData.name;
                const fnArgs = functionCallData.args;

                console.log(`[Tool] Executing ${fnName}...`, fnArgs);
                // 도구 사용 로그는 주석 처리하여 UI에 노출 안 함 (개발용은 콘솔로만)
                // yield `\n\n*(🛠️ 도구 사용 중: ${fnName})*\n\n`;

                let toolResult: any = { error: "Unknown tool" };

                // Execute Helper
                if (fnName === 'read_memory') toolResult = memoryTools.read_memory();
                else if (fnName === 'set_memory') toolResult = memoryTools.set_memory(fnArgs);
                else if (fnName === 'add_fact') toolResult = memoryTools.add_fact(fnArgs);
                else if (fnName === 'init_thinking') toolResult = thinkingTools.init_thinking(fnArgs);
                else if (fnName === 'add_thought_step') toolResult = thinkingTools.add_thought_step(fnArgs);
                else if (fnName === 'reflect_thinking') toolResult = thinkingTools.reflect_thinking();
                else if (fnName === 'googleSearch') {
                    // [Fix] Handle googleSearch function call explicitly
                    toolResult = {
                        content: "System Note: Real-time search is handled by the system (Grounding). If you see this message, please proceed using your internal knowledge and the context provided."
                    };
                }
                else if (fnName === 'search_local_trends') {
                    toolResult = await searchTools.search_local_trends(fnArgs);
                }
                else if (fnName === 'scrape_website') {
                    toolResult = await searchTools.scrape_website(fnArgs);
                }

                // Generate result part for next turn
                // Gemini API expects a FunctionResponse
                const responsePart = {
                    functionResponse: {
                        name: fnName,
                        response: {
                            content: toolResult
                        }
                    }
                };

                currentMessage = [responsePart] as any;
                continue; // Loop back to send this info to model
            }

            // MAX 도달: 모델이 계속 도구만 호출하고 텍스트 응답을 안 한 경우
            // 강제로 최종 분석 요청을 한 번 더 보내서 텍스트 출력을 끌어냄
            if (functionCallDetected && functionCallCount >= MAX_FUNCTION_CALLS) {
                console.log('[Tool] MAX_FUNCTION_CALLS reached. Forcing final synthesis.');
                currentMessage = '지금까지 수집한 모든 정보를 바탕으로 최종 분석 결과와 블로그 글감 기획안을 한국어로 작성하여 출력하라. 더 이상 도구를 사용하지 말고 최종 결론만 제시하라.' as any;
                functionCallDetected = false; // 다음 루프에서는 도구 호출 안 하도록 리셋
                functionCallData = null;
                continue;
            }

            break; // Stop if no function call
        }
    };

    // Unified Model Selection Strategy (Hybrid Sequence)
    // Priority: 3.1 Pro -> 3 Pro -> 3 Flash -> 2.5 Pro -> 2.5 Flash
    const modelQueue = [
        'gemini-3.1-pro',
        'gemini-3-pro',
        'gemini-3-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash'
    ];

    let lastError: any = null;

    for (const modelName of modelQueue) {
        try {
            console.log(`Stream: Attempting [${agentId}] with ${modelName}...`);
            yield* tryStream(modelName, 1);
            return; // Success! Exit the function
        } catch (error: any) {
            lastError = error;
            console.warn(`Model ${modelName} failed:`, error.message);
            // Continue to next model in queue
        }
    }

    // If we reach here, all models failed
    console.error('All models in hybrid sequence failed:', lastError?.message);
    throw lastError || new Error('All models in hybrid sequence failed');
}
