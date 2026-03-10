const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('No API key found');
        return;
    }
    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        // List models to see exact names
        const result = await genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }).generateContent('hi');
        console.log('Gemini 1.5 Flash works');

        // Test the specific models requested by user
        const modelsToTest = ['gemini-3.1-pro', 'gemini-3-pro', 'gemini-2.5-pro'];
        for (const m of modelsToTest) {
            try {
                const model = genAI.getGenerativeModel({ model: m });
                await model.generateContent('hi');
                console.log(`Model ${m} is valid`);
            } catch (e) {
                console.error(`Model ${m} failed:`, e.message);
            }
        }
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

test();
