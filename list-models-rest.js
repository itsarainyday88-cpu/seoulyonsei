const { GoogleGenerativeAI } = require('@google/generative-ai');

async function list() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('[ERROR] GEMINI_API_KEY is not set.');
        process.exit(1);
    }

    const genAI = new GoogleGenerativeAI(key);
    // Access the model manager via getGenerativeModel is not direct, usually verification is done by try/catch or specific admin SDK.
    // However, GoogleGenerativeAI SDK doesn't expose listModels directly on the main instance easily in older versions,
    // but let's try to check via a raw REST call to be sure.

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log('[SUCCESS] Available Models:');
            data.models.forEach(m => console.log(` - ${m.name} (${m.supportedGenerationMethods})`));
        } else {
            console.error('[FAILED] No models found or Error:', JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error('[ERROR] Fetch failed:', e.message);
    }
}
list();
