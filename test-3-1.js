const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });

    try {
        const result = await model.generateContent('안녕? 너 모델 이름이 뭐야?');
        console.log('SUCCESS:', result.response.text());
    } catch (e) {
        console.error('FAILED:', e.message);
    }
}

test();
