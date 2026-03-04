const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function check() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'YOUR_NEW_API_KEY_HERE') {
        console.error('[ERROR] GEMINI_API_KEY is not set in .env file');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    console.log('Testing gemini-2.5-flash (NEW TARGET)...');
    try {
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { temperature: 1.0 }
        });
        const result = await model.generateContent('Hi');
        console.log('[SUCCESS] gemini-2.5-flash:', result.response.text());
    } catch (e) {
        console.error('[FAILED] gemini-2.5-flash:', e.message);
    }
}
check();
