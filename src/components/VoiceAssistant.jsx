import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamMessage, initializeChat } from '../gemini';
import './VoiceAssistant.css';

// Removed LANGUAGES constant as it is no longer needed

/* ── Pick Master Voice (Calm & Peaceful) ─────── */
function pickVoice(voices) {
  return (
    voices.find(v => v.name.includes('Google UK English Male')) ||
    voices.find(v => v.name.includes('Microsoft David')) ||
    voices.find(v => v.name.includes('Microsoft Ravi')) ||
    voices.find(v => v.name.includes('Google US English')) ||
    voices.find(v => v.lang.startsWith('en')) ||
    voices[0]
  );
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

const LABELS = {
  resting:   'RESTING',
  idle:      'LISTENING FOR YOU',
  listening: 'LISTENING',
  thinking:  'PROCESSING',
  speaking:  'SPEAKING',
  angry:     'AWAKENING...',
};

const VoiceAssistant = ({ onStateChange }) => {
  const [state, setState]         = useState('resting');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply]         = useState('');
  const [awake, setAwake]         = useState(false);

  const synthRef      = useRef(window.speechSynthesis);
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

  /* ── Load voices ── */
  useEffect(() => {
    const load = () => synthRef.current?.getVoices();
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  /* ── TTS: speak one piece ── */
  const speakOne = useCallback((text) => {
    return new Promise((resolve) => {
      const clean = cleanText(text);
      if (!clean) { resolve(); return; }

      const utt = new SpeechSynthesisUtterance(clean);
      // Master Voice Acoustic Tuning (Calm & Peaceful)
      utt.rate   = 0.9;
      utt.pitch  = 0.85;
      utt.volume = 1.0;
      utt.lang   = 'en-US';

      const voices = synthRef.current?.getVoices() || [];
      utt.voice = pickVoice(voices);

      utt.onend   = () => resolve();
      utt.onerror = () => resolve();
      synthRef.current?.speak(utt);
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
    setTranscript(query);
    setReply('');
    setS('thinking');
    synthRef.current?.cancel();
    isSpeakingRef.current = false;

    let buffer = '';
    let full   = '';
    speakQueueRef.current = [];

    try {
      for await (const chunk of streamMessage(query)) {
        buffer += chunk;
        full   += chunk;

        // Flush complete sentences immediately → low latency TTS
        const sentences = buffer.match(/[^.!?।]+[.!?।]+/g);
        if (sentences) {
          sentences.forEach(s => speakQueueRef.current.push(s));
          buffer = buffer.replace(/[^.!?।]+[.!?।]+/g, '');
          if (!isSpeakingRef.current) drainQueue();
        }
      }
      if (buffer.trim()) {
        speakQueueRef.current.push(buffer);
        if (!isSpeakingRef.current) drainQueue();
      }
      setReply(cleanText(full).slice(0, 130));
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
      if (interim || finalText) { setTranscript(interim || finalText); setS('listening'); }
    };

    rec.onend = () => {
      const q = finalText.trim();
      finalText = '';
      setTranscript('');
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
    setTranscript(''); setReply('');
    synthRef.current?.cancel();
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
