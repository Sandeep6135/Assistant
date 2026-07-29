import fs from 'fs';

async function testTTS(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(filename, Buffer.from(buffer));
    console.log(`✅ Success: ${filename} (${buffer.byteLength} bytes)`);
  } catch (e) {
    console.error(`❌ Failed: ${filename} - ${e.message}`);
  }
}

async function run() {
  // Test Google Translate TTS
  await testTTS(
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=hi&q=${encodeURIComponent('नमस्ते दुनिया')}`,
    'google_hi.mp3'
  );

  // Test StreamElements Aditi (Hindi)
  await testTTS(
    `https://api.streamelements.com/kappa/v2/speech?voice=Aditi&text=${encodeURIComponent('नमस्ते दुनिया')}`,
    'streamelements_aditi_hi.mp3'
  );

  // Test StreamElements Aditi (English)
  await testTTS(
    `https://api.streamelements.com/kappa/v2/speech?voice=Aditi&text=${encodeURIComponent('Hello world')}`,
    'streamelements_aditi_en.mp3'
  );
  
  // Test StreamElements Raveena (Indian English)
  await testTTS(
    `https://api.streamelements.com/kappa/v2/speech?voice=Raveena&text=${encodeURIComponent('नमस्ते दुनिया')}`,
    'streamelements_raveena_hi.mp3'
  );
}

run();
