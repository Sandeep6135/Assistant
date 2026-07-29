import fs from 'fs';

async function testEdgeTTS() {
  try {
    // Attempt 1: api.tts.quest
    const res = await fetch('https://api.tts.quest/v3/voice/edge?text=Hello&voice=en-US-ChristopherNeural');
    const data = await res.json();
    console.log("tts.quest response:", data);
  } catch (e) {
    console.error("tts.quest failed:", e.message);
  }
}

testEdgeTTS();
