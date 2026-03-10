require('dotenv').config();

async function showModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('No API key in .env');
        return;
    }

    try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await resp.json();
        if (data.models) {
            console.log('--- MODELS ---');
            data.models.map(m => console.log(m.name));
        } else {
            console.log('API responded but no models found:', data);
        }
    } catch (error) {
        console.log('Fetch error:', error.message);
    }
}

showModels();
