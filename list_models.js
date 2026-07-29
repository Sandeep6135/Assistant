import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.VITE_GEMINI_API_KEY;
const models = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];

async function testModel(model) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Say hi" }] }] }),
      }
    );
    const data = await response.json();
    if (data.error) {
      console.log(`❌ ${model}: ${data.error.message.substring(0, 80)}`);
    } else {
      console.log(`✅ ${model}: WORKS!`);
    }
  } catch (e) {
    console.log(`❌ ${model}: ${e.message}`);
  }
}

(async () => {
  for (const m of models) await testModel(m);
})();
