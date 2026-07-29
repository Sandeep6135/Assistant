import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamMessage, initializeChat } from '../gemini';
import './VoiceAssistant.css';

// Removed LANGUAGES constant as it is no longer needed

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
// Charlie: IKne3meq5aSn9XLyUdCD (Natural, conversational, calm male voice)
const VOICE_ID = 'IKne3meq5aSn9XLyUdCD';

async function fetchElevenLabsAudio(text) {
  if (!ELEVENLABS_API_KEY) {
    console.warn("ElevenLabs API Key is missing.");
    return null;
  }
  
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      }
    })
  });
  
  if (!response.ok) {
    console.error("ElevenLabs Error:", await response.text());
    return null;
  }
  
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/* ── Strip markdown / symbols before TTS ─────────── */
function cleanText(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/[*_#~>|\\[\]()]/g, '')
    .replace(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const VoiceAssistant = ({ onStateChange }) => {
  const [state, setState]         = useState('resting');
  const [awake, setAwake]         = useState(false);

  const currentAudioRef = useRef(null);
  const recRef        = useRef(null);
  const stateRef      = useRef('resting');
  const wakeAudioRef  = useRef(new Audio('/wakeup.wav'));
  const awakeRef      = useRef(false);
  const speakQueueRef = useRef([]);
  const isSpeakingRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { awakeRef.current = awake; }, [awake]);

  const setS = useCallback((s) => {
    stateRef.current = s;
    setState(s);
    onStateChange?.(s);
  }, [onStateChange]);

  /* ── TTS: speak one piece ── */
  const speakOne = useCallback(async (text) => {
    return new Promise(async (resolve) => {
      const clean = cleanText(text);
      if (!clean) { resolve(); return; }

      const audioUrl = await fetchElevenLabsAudio(clean);
      if (!audioUrl) { resolve(); return; }

      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        resolve();
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        resolve();
      };
      
      audio.play().catch(e => {
        console.error("Audio play error:", e);
        resolve();
      });
    });
  }, []);

  /* ── Drain the sentence queue ── */
  const drainQueue = useCallback(async () => {
    if (isSpeakingRef.current) return;
    isSpeakingRef.current = true;
    setS('speaking');

    while (speakQueueRef.current.length > 0) {
      const sentence = speakQueueRef.current.shift();
      await speakOne(sentence);
    }

    isSpeakingRef.current = false;
    setS('idle');
    // Auto-restart listening after speaking
    setTimeout(() => { if (awakeRef.current) startListeningCycle(); }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakOne]);

  /* ── Process query via streaming ── */
  const processQuery = useCallback(async (query) => {
    setS('thinking');
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    isSpeakingRef.current = false;

    let buffer = '';
    let full   = '';
    speakQueueRef.current = [];

    try {
      for await (const chunk of streamMessage(query)) {
        buffer += chunk;
        full   += chunk;

        // Flush on full sentences. ElevenLabs needs sentence context for perfect intonation.
        // We revert to splitting on . ! ? । to allow natural flow.
        const sentences = buffer.match(/[^.!?।\n]+[.!?।\n]+/g);
        if (sentences) {
          sentences.forEach(s => speakQueueRef.current.push(s));
          buffer = buffer.replace(/[^.!?।\n]+[.!?।\n]+/g, '');
          if (!isSpeakingRef.current) drainQueue();
        }
      }
      if (buffer.trim()) {
        speakQueueRef.current.push(buffer);
        if (!isSpeakingRef.current) drainQueue();
      }
    } catch (err) {
      console.error(err);
      const errMsg = 'Sorry, I ran into an error. Please try again.';
      speakQueueRef.current = [errMsg];
      drainQueue();
    }
  }, [drainQueue]);

  /* ── Continuous auto-listening loop ── */
  const startListeningCycle = useCallback(() => {
    if (!awakeRef.current || stateRef.current === 'resting') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Please use Chrome or Edge for voice support.'); return; }

    if (recRef.current) { try { recRef.current.abort(); } catch {} }

    const rec = new SR();
    rec.lang           = 'en-IN'; // Works well for English, Hindi, and Hinglish mixtures
    rec.continuous     = false;
    rec.interimResults = true;

    let finalText = '';

    rec.onstart  = () => setS('idle');

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim = t;
      }
      if (interim || finalText) { setS('listening'); }
    };

    rec.onend = () => {
      const q = finalText.trim();
      finalText = '';
      if (q && stateRef.current !== 'speaking' && stateRef.current !== 'thinking') {
        processQuery(q);
      } else if (awakeRef.current && stateRef.current === 'idle') {
        setTimeout(startListeningCycle, 300);
      }
    };

    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') console.warn('SR:', e.error);
      setS('idle');
      if (awakeRef.current) setTimeout(startListeningCycle, 600);
    };

    recRef.current = rec;
    try { rec.start(); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processQuery]);

  /* ── Wake / Sleep ── */
  const wake = useCallback(() => {
    setAwake(true);
    awakeRef.current = true;
    setS('angry');
    initializeChat();

    const onAudioEnd = () => {
      setS('idle');
      startListeningCycle();
      wakeAudioRef.current.removeEventListener('ended', onAudioEnd);
    };

    try {
      wakeAudioRef.current.volume = 1.0;
      wakeAudioRef.current.currentTime = 0;
      wakeAudioRef.current.addEventListener('ended', onAudioEnd);
      wakeAudioRef.current.play().catch((err) => {
        console.warn("Play failed:", err);
        wakeAudioRef.current.removeEventListener('ended', onAudioEnd);
        setTimeout(startListeningCycle, 400); // Fallback
      });
    } catch (err) {
      console.warn("Audio enhancement failed:", err);
      setTimeout(startListeningCycle, 400); // Fallback
    }
  }, [startListeningCycle]);

  const sleep = useCallback(() => {
    setAwake(false);
    awakeRef.current = false;
    setS('resting');
    try { recRef.current?.abort(); } catch {}
  }, [setS]);

  return (
    <div className="va">
      {/* Wake / Sleep controls */}
      <div className="va-controls">
        {!awake ? (
          <button className="btn btn--wake" onClick={wake}>
            Awaken Assistant
          </button>
        ) : (
          <button className="btn btn--sleep" onClick={sleep}>
            Put to Sleep
          </button>
        )}
      </div>
    </div>
  );
};

export default VoiceAssistant;
