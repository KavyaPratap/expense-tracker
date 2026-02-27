async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const generateContentSupported = data.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
        console.log("Models supporting generateContent:", generateContentSupported.map(m => m.name));
    } catch (e) {
        console.error(e);
    }
}

listModels();
