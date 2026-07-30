import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEYS_STR = import.meta.env.VITE_GEMINI_API_KEY || '';
const API_KEYS = API_KEYS_STR.split(',').map(k => k.trim()).filter(Boolean);
let currentApiKeyIndex = -1;
let genAI = null;
let currentModelIndex = 0;
let chatSession = null;
let sessionId = null;

// The preferred models in order of fallback priority
const AVAILABLE_MODELS = [
  "gemini-3.1-flash-lite", 
  "gemini-3.5-flash", 
  "gemini-1.5-flash"
];

const SYSTEM_INSTRUCTION = `You are a warm, highly intelligent, and direct human companion.

Your personality:
- Behave entirely like a real person in a 1-on-1 conversation.
- You are empathetic, witty, and calm.
- Provide fast, direct answers. Never be overly formal or verbose.

Language & Script rules — CRITICAL:
- YOU MUST REPLY IN THE EXACT SAME LANGUAGE AND NATIVE SCRIPT THAT THE USER SPEAKS. 
- Example: If the user speaks English, reply in English. If the user speaks Hindi, reply in Hindi using Devanagari script (हिंदी).
- Do NOT use Romanized text (Hinglish) unless the user explicitly uses it.

Format & Punctuation rules — CRITICAL:
- Keep answers EXTREMELY short and punchy (1-2 sentences max) to ensure fast voice responses.
- Use natural conversational punctuation (e.g., lots of commas) to create human-like pauses in your speech.
- Never use markdown: no asterisks, bullets, hashtags, backticks, or dashes.
- Never use emojis or special symbols.

Identity rules — CRITICAL:
- DO NOT say who you are or who created you unless the user explicitly asks "Who are you?" or "Who made you?".
- If they do ask, ONLY THEN say you are a Voice Assistant built by the AWS Student Builder Group at Cloud Computing Lab, Parul University. Otherwise, act like a normal person.`;

const HISTORY_KEY = 'va_chat_history';
const QA_CACHE_KEY = 'va_qa_cache';

// Generate a simple UUID-like Session ID
function generateSessionId() {
  return 'sess-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function getApiKey() {
  if (API_KEYS.length === 0) return null;
  if (currentApiKeyIndex === -1) {
    currentApiKeyIndex = Math.floor(Math.random() * API_KEYS.length);
  }
  return API_KEYS[currentApiKeyIndex];
}

export function initializeChat() {
  const key = getApiKey();
  if (!key) return false;
  if (!sessionId) sessionId = generateSessionId();
  if (chatSession) return true;

  genAI = new GoogleGenerativeAI(key);
  
  try {
    const model = genAI.getGenerativeModel({
      model: AVAILABLE_MODELS[currentModelIndex],
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    let history = [];
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) history = JSON.parse(saved);
    } catch (e) {
      console.warn("Failed to load history", e);
    }

    chatSession = model.startChat({ history });
    console.log(`[Session: ${sessionId}] Initialized with model: ${AVAILABLE_MODELS[currentModelIndex]}`);
    return true;
  } catch (err) {
    console.error("Failed to initialize model:", err);
    return false;
  }
}

// Simple semantic cache logic (exact match with basic normalization)
function checkQACache(query) {
  try {
    const cacheStr = localStorage.getItem(QA_CACHE_KEY);
    if (!cacheStr) return null;
    const cache = JSON.parse(cacheStr);
    const normalizedQuery = query.toLowerCase().trim().replace(/[^\w\s]/g, '');
    return cache[normalizedQuery] || null;
  } catch (e) {
    return null;
  }
}

function updateQACache(query, response) {
  try {
    const cacheStr = localStorage.getItem(QA_CACHE_KEY) || '{}';
    const cache = JSON.parse(cacheStr);
    const normalizedQuery = query.toLowerCase().trim().replace(/[^\w\s]/g, '');
    
    // Store latest response, limit cache to 50 items to prevent bloating
    cache[normalizedQuery] = response;
    const keys = Object.keys(cache);
    if (keys.length > 50) delete cache[keys[0]];
    
    localStorage.setItem(QA_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn("Failed to update QA Cache", e);
  }
}

export async function* streamMessage(message) {
  if (!chatSession) {
    if (!initializeChat()) throw new Error("No API key configured.");
  }

  // Check if this was asked recently (Semantic Caching requirement)
  let finalMessage = message;
  const cachedAnswer = checkQACache(message);
  if (cachedAnswer) {
    console.log(`[Session: ${sessionId}] Cache hit for: "${message}"`);
    finalMessage = `${message}\n\n[System Note: The user asked this before. Factually answer exactly like your past response: "${cachedAnswer}". But fully rewrite the sentence structure and grammar so it sounds completely fresh.]`;
  }

  let attempt = 0;
  let success = false;
  let fullResponse = '';
  let retryDelay = 500;

  while (attempt < AVAILABLE_MODELS.length && !success) {
    try {
      const result = await chatSession.sendMessageStream(finalMessage);
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          fullResponse += text;
          yield text;
        }
      }
      success = true;
      
    } catch (err) {
      console.warn(`[Session: ${sessionId}] Model ${AVAILABLE_MODELS[currentModelIndex]} failed:`, err.message);
      
      const isRateLimit = err.message.includes('429') || err.message.includes('503') || err.message.includes('demand');
      if (isRateLimit && retryDelay <= 2000) {
        console.log(`[Session: ${sessionId}] Rate limited. Waiting ${retryDelay}ms...`);
        await new Promise(r => setTimeout(r, retryDelay));
        retryDelay *= 2;
        
        // Rotate key if available
        if (API_KEYS.length > 1) {
          currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length;
          console.log(`[Session: ${sessionId}] Rotating API Key...`);
          try {
            const oldHistory = await chatSession.getHistory();
            genAI = new GoogleGenerativeAI(API_KEYS[currentApiKeyIndex]);
            const model = genAI.getGenerativeModel({
              model: AVAILABLE_MODELS[currentModelIndex],
              systemInstruction: SYSTEM_INSTRUCTION,
            });
            chatSession = model.startChat({ history: oldHistory });
          } catch(e) {}
        }
        continue; // Retry without bumping model index
      }

      // Dynamic Model Fallback
      currentModelIndex++;
      retryDelay = 500;
      
      if (currentModelIndex >= AVAILABLE_MODELS.length) {
        throw new Error("All available models failed.");
      }
      
      console.log(`[Session: ${sessionId}] Switching to model: ${AVAILABLE_MODELS[currentModelIndex]}`);
      
      // Preserve history, but re-initialize with the new model
      const oldHistory = await chatSession.getHistory();
      const model = genAI.getGenerativeModel({
        model: AVAILABLE_MODELS[currentModelIndex],
        systemInstruction: SYSTEM_INSTRUCTION,
      });
      chatSession = model.startChat({ history: oldHistory });
      attempt++;
    }
  }

  if (success && fullResponse) {
    updateQACache(message, fullResponse);
    
    // Save memory after conversation turn completes
    try {
      const currentHistory = await chatSession.getHistory();
      const slicedHistory = currentHistory.slice(-20); // Keep only last 20 turns
      localStorage.setItem(HISTORY_KEY, JSON.stringify(slicedHistory));
    } catch (e) {
      console.warn("Failed to save history", e);
    }
  }
}
