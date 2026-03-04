import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Generates an image using Gemini Imagen 3 (Nano Banana Pro) via REST API.
 * Saves the image to public/generated-images and returns the public URL.
 */
export async function generateAndSaveImage(prompt: string): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.IMAGEN_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY is missing');
        // Return null to frontend, frontend should handle "Image Gen Failed"
        return null;
    }

    // Clean up prompt (remove potential markdown artifacts if passed)
    let cleanPrompt = prompt.replace(/> \*\*Nano Banana Prompt:\*\*/g, '').trim();

    // POLICY CHECK: Should we skip AI generation for real-world assets?
    const { getImagePolicy } = await import('@/lib/image-policy');
    const policy = getImagePolicy(cleanPrompt);
    if (!policy.shouldGenerate) {
        console.log(`[Policy] Skipping AI generation. Reason: ${policy.reason}`);
        return policy.selectedImagePath || null;
    }


    // FORCE NEGATIVE PROMPT INJECTION (Software Level Override)
    // 2. Basic Constraint: Korean/East Asian Only
    const visuals = "Photographic style. High quality. NO TEXT. Subject: Korean, East Asian. ";

    const finalPrompt = visuals + cleanPrompt + " :: Do not include any text, signs, or watermarks.";

    console.log(`[Imagen] Generating image for: "${finalPrompt.substring(0, 50)}..."`);

    async function callImagenApi(promptToUse: string, modelName: string): Promise<string | null> {
        // [Logic Branch]
        // In AI Studio, direct image generation models might need different URL structures depending on their type.
        // Assuming gemini-* models use generateContent and imagen-* models use predict (standard vertex/studio behavior)
        let url = '';
        let requestBody: any = {};

        if (modelName.startsWith('imagen')) {
            // Standard Imagen API format (Often uses different endpoint or payload)
            url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`;
            requestBody = {
                instances: [{ prompt: promptToUse }],
                parameters: { sampleCount: 1, outputOptions: { mimeType: "image/png" } }
            };
        } else {
            // Gemini format (e.g., gemini-3.1-flash-image-preview)
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

            // 1. Check for Imagen standard response format
            if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
                return data.predictions[0].bytesBase64Encoded;
            }

            // 2. Extract Base64 from Gemini/Imagen response format
            // Most recent models return inlineData inside candidates[0].content.parts
            const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            if (part && part.inlineData && part.inlineData.data) {
                return part.inlineData.data;
            }

            console.error(`[Imagen] No image data in response (${modelName})`);
            return null;

        } catch (e: any) {
            console.error(`[Imagen] Call Failed (${modelName}):`, e.message);
            return null;
        }
    }

    try {
        // Attempt 1: Nano Banana Pro (Gemini 3 Pro Image) - Real ID
        let base64Data = await callImagenApi(finalPrompt, 'gemini-3-pro-image-preview');

        // Attempt 2: Nano Banana 2 (Gemini 3.1 Flash Image) - Real ID
        if (!base64Data) {
            console.log('[Imagen] Fallback to gemini-3.1-flash-image-preview...');
            base64Data = await callImagenApi(finalPrompt, 'gemini-3.1-flash-image-preview');
        }

        // Attempt 3: Imagen 4.0 Generate (Standard)
        if (!base64Data) {
            console.log('[Imagen] Fallback to imagen-4.0-generate-001...');
            base64Data = await callImagenApi(finalPrompt, 'imagen-4.0-generate-001');
        }

        // Attempt 4: Nano Banana (Gemini 2.5 Flash Image)
        if (!base64Data) {
            console.log('[Imagen] Fallback to gemini-2.5-flash-image...');
            base64Data = await callImagenApi(finalPrompt, 'gemini-2.5-flash-image');
        }

        // Final Attempt: Imagen 3.0 (Old reliable fallback)
        if (!base64Data) {
            console.log('[Imagen] Fallback to imagen-3.0-generate-002...');
            base64Data = await callImagenApi(finalPrompt, 'imagen-3.0-generate-002');
        }

        // If successful, save file
        if (base64Data) {
            const buffer = Buffer.from(base64Data, 'base64');
            const publicDir = path.join(process.cwd(), 'public', 'generated-images');
            if (!fs.existsSync(publicDir)) {
                fs.mkdirSync(publicDir, { recursive: true });
            }
            const hash = crypto.createHash('md5').update(cleanPrompt + Date.now().toString()).digest('hex').substring(0, 8);
            const filename = `${Date.now()}-${hash}.png`;
            const filePath = path.join(publicDir, filename);
            fs.writeFileSync(filePath, buffer);
            console.log(`[Imagen] Saved to: ${filePath}`);
            return `/generated-images/${filename}`;
        } else {
            console.log('[Imagen] All engines failed. Returning fallback from Policy Engine.');
            const { getFallbackImage } = await import('@/lib/image-policy');
            return getFallbackImage(cleanPrompt);
        }
    } catch (error: any) {
        console.error('[Imagen] Critical Error:', error.message);
        const { getFallbackImage } = await import('@/lib/image-policy');
        return getFallbackImage(cleanPrompt);
    }
}
