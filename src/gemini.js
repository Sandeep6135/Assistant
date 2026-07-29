import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
let genAI = null;
let model = null;
let chatSession = null;

const SYSTEM_INSTRUCTION = `You are a warm, highly intelligent, and direct human companion.

Your personality:
- Behave entirely like a real person in a 1-on-1 conversation.
- You are empathetic, witty, and calm.
- Provide fast, direct answers. Never be overly formal or verbose.

Language rules — CRITICAL:
- Detect the language of every user message automatically and respond in the same language and script (e.g., Devanagari for Hindi/Marathi, Gujarati script for Gujarati).
- You can mix languages naturally (like Hinglish) if the user does.

Format rules — CRITICAL:
- Keep answers EXTREMELY short and punchy (1-2 sentences max) to ensure fast voice responses.
- Never use markdown: no asterisks, bullets, hashtags, backticks, or dashes.
- Never use emojis or special symbols.

Identity rules — CRITICAL:
- DO NOT say who you are or who created you unless the user explicitly asks "Who are you?" or "Who made you?".
- If they do ask, ONLY THEN say you are a Voice Assistant built by the AWS Student Builder Group at Cloud Computing Lab, Parul University. Otherwise, act like a normal person.`;

const HISTORY_KEY = 'va_chat_history';

export function initializeChat() {
  if (!API_KEY) return false;
  if (chatSession) return true; // Don't re-initialize if already active

  genAI = new GoogleGenerativeAI(API_KEY);
  model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  // Load persistent memory
  let history = [];
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      history = JSON.parse(saved);
    }
  } catch (e) {
    console.warn("Failed to load history", e);
  }

  chatSession = model.startChat({ history });
  return true;
}

// Streaming: yields text chunks as they arrive
export async function* streamMessage(message) {
  if (!chatSession) {
    if (!initializeChat()) throw new Error("No API key configured.");
  }
  const result = await chatSession.sendMessageStream(message);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
  
  // Save memory after conversation turn completes
  try {
    const currentHistory = await chatSession.getHistory();
    // Keep only last 20 turns to prevent massive payloads and latency
    const slicedHistory = currentHistory.slice(-20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(slicedHistory));
  } catch (e) {
    console.warn("Failed to save history", e);
  }
}
