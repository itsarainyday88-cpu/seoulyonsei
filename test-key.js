const { GoogleGenerativeAI } = require('@google/generative-ai');

async function check() {
    const genAI = new GoogleGenerativeAI('AIzaSyAalr8K5vo9ABfGCxmoTZTT69plKLLQWXk');

    console.log('Testing gemini-2.5-flash (NEW TARGET)...');
    try {
        // Temperature 1.0 explicit logic included
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
