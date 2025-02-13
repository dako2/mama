// ==========================
// Text-to-Speech (TTS) Function
// ==========================
function detectLanguage(text) {
    if (/[\u4E00-\u9FFF]/.test(text)) {
        return "zh-CN"; // Chinese Simplified
    } else if (/[\u3040-\u30FF]/.test(text)) {
        return "ja-JP"; // Japanese
    } else if (/[\uAC00-\uD7AF]/.test(text)) {
        return "ko-KR"; // Korean
    } else if (/[а-яА-ЯЁё]/.test(text)) {
        return "ru-RU"; // Russian
    } else {
        return "en-US"; // Default to English
    }
}

function speakText(text) {
if (!window.speechSynthesis) {
    console.warn("Web Speech API not supported.");
    return;
}

const lang = detectLanguage(text);
console.log(`Detected language: ${lang}`);

const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = lang;
utterance.rate = 1.0;
utterance.pitch = 1.0;

speechSynthesis.speak(utterance);
}
