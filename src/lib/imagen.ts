// [🚨 File System Access] No top-level 'fs' or 'path' to avoid Vercel crash
import crypto from 'crypto';

// @ts-ignore
declare const process: any;
// @ts-ignore
declare const Buffer: any;

/**
 * Generates an image using Gemini Imagen 3 (Nano Banana Pro) via REST API.
 * Saves the image to public/generated-images and returns the public URL.
 */
export async function generateAndSaveImage(prompt: string, excludedPaths: string[] = []): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.IMAGEN_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY is missing');
        return null;
    }

    // Clean up prompt
    let cleanPrompt = prompt.replace(/> \*\*Nano Banana Prompt:\*\*/g, '').trim();

    const { getImagePolicy } = await import('@/lib/image-policy');
    const policy = getImagePolicy(cleanPrompt, excludedPaths);

    const imageGenerateMatch = cleanPrompt.match(/\[IMAGE_GENERATE:\s*([^\]]+)\]/i);
    if (imageGenerateMatch && imageGenerateMatch[1]) {
        cleanPrompt = imageGenerateMatch[1].trim();
    }

    cleanPrompt = cleanPrompt.replace(/(display(s)?\s+)?(the\s+)?(korean\s+)?text\s+(['"]?.*['"]?)/gi, '');
    cleanPrompt = cleanPrompt.replace(/with\s+(a\s+)?(neon\s+)?sign\s+that\s+displays.*/gi, '');
    cleanPrompt = cleanPrompt.replace(/text|letter|signage|word/gi, '');
    cleanPrompt = cleanPrompt.replace(/\[FORCE_GENERATE\]/gi, '').trim();

    if (!policy.shouldGenerate) {
        console.log(`[Policy] Skipping AI generation. Reason: ${policy.reason}`);
        return policy.selectedImagePath || null;
    }

    const visuals = "Photographic style. High quality. NO TEXT. Korean ethnicity people only. Modern Seoul Korean Academy (Hagwon) interior. Asian students with black hair. High-end Korean education environment. ";
    const finalPrompt = visuals + cleanPrompt + " :: Do not include any text, signs, or watermarks. NO Western features, NO Caucasian, NO non-Asian, NO European style library.";

    console.log(`[Imagen] Generating image for: "${finalPrompt.substring(0, 50)}..."`);

    async function callImagenApi(promptToUse: string, modelName: string): Promise<string | null> {
        let url = '';
        let requestBody: any = {};

        if (modelName.startsWith('imagen')) {
            url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`;
            requestBody = {
                instances: [{ prompt: promptToUse }],
                parameters: { sampleCount: 1, outputOptions: { mimeType: "image/png" } }
            };
        } else {
            url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            requestBody = {
                contents: [{ parts: [{ text: promptToUse }] }],
            };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Imagen] API Error (${modelName}):`, response.status, errorText);
                return null;
            }

            const data = await response.json();
            if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
                return data.predictions[0].bytesBase64Encoded;
            }
            const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            if (part && part.inlineData && part.inlineData.data) {
                return part.inlineData.data;
            }
            return null;
        } catch (e: any) {
            console.error(`[Imagen] Call Failed (${modelName}):`, e.message);
            return null;
        }
    }

    try {
        const modelOrder = [
            'imagen-4.0-fast-generate-001',
            'gemini-3.1-flash-image-preview',
            'gemini-2.5-flash-image',
            'imagen-4.0-ultra-generate-001',
            'imagen-4.0-generate-001',
            'gemini-3-pro-image-preview'
        ];

        let base64Data = null;
        for (const modelId of modelOrder) {
            console.log(`[Imagen] Trying engine: ${modelId}...`);
            base64Data = await callImagenApi(finalPrompt, modelId);
            if (base64Data) break;
        }

        if (base64Data) {
            // [🚀 Vercel Optimization] Directly return Base64 to avoid FS issues
            return `data:image/png;base64,${base64Data}`;
        } else {
            const { getFallbackImage } = await import('@/lib/image-policy');
            return getFallbackImage(cleanPrompt, excludedPaths);
        }
    } catch (error: any) {
        const { getFallbackImage } = await import('@/lib/image-policy');
        return getFallbackImage(cleanPrompt, excludedPaths);
    }
}
