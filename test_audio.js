import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.VITE_GEMINI_API_KEY;

async function testAudio() {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
  });

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: "Say hello in Hindi" }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede"
            }
          }
        }
      }
    });

    const response = result.response;
    const parts = response.candidates[0].content.parts;
    
    let hasAudio = false;
    for (const part of parts) {
      if (part.inlineData && part.inlineData.mimeType.startsWith("audio/")) {
        hasAudio = true;
        console.log("SUCCESS! Got audio bytes.");
      }
    }
    
    if (!hasAudio) {
      console.log("Failed. No audio returned.");
      console.log(JSON.stringify(parts, null, 2));
    }

  } catch (e) {
    console.error("Error:", e.message);
  }
}

testAudio();
