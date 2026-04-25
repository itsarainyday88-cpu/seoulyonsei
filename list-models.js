const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    console.log('Fetching available models...');
    try {
        // Use the native listModels method if available (requires hacking internals or specific version)
        // Or simpler: just hit the REST endpoint directly to be sure.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.models) {
            console.log('\n--- Available Models ---');
            data.models.forEach(m => {
                if (m.supportedGenerationMethods.includes('generateContent')) {
                    console.log(`- ${m.name.replace('models/', '')} (${m.displayName})`);
                }
            });
        } else {
            console.log('No models found or error:', data);
        }
    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();
