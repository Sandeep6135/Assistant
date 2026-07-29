import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamMessage, initializeChat } from '../gemini';
import './VoiceAssistant.css';

/* ── Language config ─────────────────────────────── */
const LANGUAGES = [
  { code: 'en-US', label: 'English', short: 'EN', flag: '🇬🇧' },
  { code: 'hi-IN', label: 'हिंदी',   short: 'HI', flag: '🇮🇳' },
  { code: 'gu-IN', label: 'ગુજરાતી', short: 'GU', flag: '🪔' },
  { code: 'mr-IN', label: 'मराठी',   short: 'MR', flag: '🌺' },
];

/* ── Detect script of a response string ─────────── */
function detectResponseLang(text) {
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu-IN'; // Gujarati script
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN'; // Devanagari (Hindi / Marathi)
  return 'en-US';
}

/* ── Pick best available TTS voice ──────────────── */
function pickVoice(lang, voices) {
  const langMap = {
    'hi-IN': ['hi-IN', 'hi'],
    'gu-IN': ['gu-IN', 'gu'],
    'mr-IN': ['mr-IN', 'mr'],
    'en-US': [],
  };
  const prefs = langMap[lang] || [];

  // Try to find a voice matching preferred lang
  for (const lc of prefs) {
    const v = voices.find(v => v.lang.startsWith(lc));
    if (v) return v;
  }
  // Fallback: English voices
  return (
    voices.find(v => v.name.includes('Google UK English Male')) ||
    voices.find(v => v.name.includes('Google US English'))     ||
    voices.find(v => v.lang.startsWith('en'))                  ||
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
};

const VoiceAssistant = ({ onStateChange }) => {
  const [state, setState]         = useState('resting');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply]         = useState('');
  const [awake, setAwake]         = useState(false);
  const [lang, setLang]           = useState('en-US');

  const synthRef      = useRef(window.speechSynthesis);
  const recRef        = useRef(null);
  const stateRef      = useRef('resting');
  const wakeAudioRef  = useRef(new Audio('/wakeup.wav'));
  const awakeRef      = useRef(false);
  const speakQueueRef = useRef([]);
  const isSpeakingRef = useRef(false);
  const langRef       = useRef('en-US');

  // Keep refs in sync
  useEffect(() => { awakeRef.current = awake; }, [awake]);
  useEffect(() => { langRef.current = lang; },   [lang]);

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
  const speakOne = useCallback((text, responseLang) => {
    return new Promise((resolve) => {
      const clean = cleanText(text);
      if (!clean) { resolve(); return; }

      const utt = new SpeechSynthesisUtterance(clean);
      utt.rate   = 1.05;
      utt.pitch  = responseLang === 'en-US' ? 0.9 : 1.0;
      utt.volume = 1;
      utt.lang   = responseLang;

      const voices = synthRef.current?.getVoices() || [];
      utt.voice = pickVoice(responseLang, voices);

      utt.onend   = () => resolve();
      utt.onerror = () => resolve();
      synthRef.current?.speak(utt);
    });
  }, []);

  /* ── Drain the sentence queue ── */
  const drainQueue = useCallback(async (responseLang) => {
    if (isSpeakingRef.current) return;
    isSpeakingRef.current = true;
    setS('speaking');

    while (speakQueueRef.current.length > 0) {
      const sentence = speakQueueRef.current.shift();
      await speakOne(sentence, responseLang);
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
    let responseLang = langRef.current;
    speakQueueRef.current = [];

    try {
      for await (const chunk of streamMessage(query)) {
        buffer += chunk;
        full   += chunk;

        // Detect language from first meaningful chunk
        if (full.length > 20 && responseLang === langRef.current) {
          responseLang = detectResponseLang(full) || langRef.current;
        }

        // Flush complete sentences immediately → low latency TTS
        const sentences = buffer.match(/[^.!?।]+[.!?।]+/g);
        if (sentences) {
          sentences.forEach(s => speakQueueRef.current.push(s));
          buffer = buffer.replace(/[^.!?।]+[.!?।]+/g, '');
          if (!isSpeakingRef.current) drainQueue(responseLang);
        }
      }
      if (buffer.trim()) {
        speakQueueRef.current.push(buffer);
        if (!isSpeakingRef.current) drainQueue(responseLang);
      }
      setReply(cleanText(full).slice(0, 130));
    } catch (err) {
      console.error(err);
      const errMsg = langRef.current === 'hi-IN'
        ? 'माफ़ करना, कोई समस्या आ गई। फिर से कोशिश करें।'
        : langRef.current === 'gu-IN'
        ? 'માફ કરો, ભૂલ આવી. ફરી પ્રયાસ કરો.'
        : langRef.current === 'mr-IN'
        ? 'माफ करा, चूक झाली. पुन्हा प्रयत्न करा.'
        : 'Sorry, I ran into an error. Please try again.';
      speakQueueRef.current = [errMsg];
      drainQueue(langRef.current);
    }
  }, [drainQueue]);

  /* ── Continuous auto-listening loop ── */
  const startListeningCycle = useCallback(() => {
    if (!awakeRef.current || stateRef.current === 'resting') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Please use Chrome or Edge for voice support.'); return; }

    if (recRef.current) { try { recRef.current.abort(); } catch {} }

    const rec = new SR();
    rec.lang           = langRef.current;
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
    // Play wakeup sound immediately — pre-loaded, zero delay
    try {
      // Enhance volume to 200% using Web Audio API
      if (!wakeAudioRef.current.audioCtx) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const track = audioCtx.createMediaElementSource(wakeAudioRef.current);
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 2.0; // 200% volume
        track.connect(gainNode).connect(audioCtx.destination);
        wakeAudioRef.current.audioCtx = audioCtx;
      }
      wakeAudioRef.current.audioCtx.resume();
      wakeAudioRef.current.currentTime = 0;
      wakeAudioRef.current.play().catch(() => {});
    } catch (err) {
      console.warn("Audio enhancement failed:", err);
    }

    setAwake(true);
    awakeRef.current = true;
    setS('idle');
    initializeChat();
    setTimeout(startListeningCycle, 400);
  }, [startListeningCycle]);

  const sleep = useCallback(() => {
    setAwake(false);
    awakeRef.current = false;
    setS('resting');
    setTranscript(''); setReply('');
    synthRef.current?.cancel();
    try { recRef.current?.abort(); } catch {}
  }, []);

  /* ── Language switch ── */
  const switchLang = (code) => {
    setLang(code);
    langRef.current = code;
    if (awake) {
      try { recRef.current?.abort(); } catch {}
      setTimeout(startListeningCycle, 300);
    }
  };

  return (
    <div className="va">
      {/* Language selector */}
      <div className="lang-row">
        {LANGUAGES.map(l => (
          <button
            key={l.code}
            className={`lang-btn ${lang === l.code ? 'lang-btn--active' : ''}`}
            onClick={() => switchLang(l.code)}
            title={l.label}
          >
            <span className="lang-flag">{l.flag}</span>
            <span className="lang-short">{l.short}</span>
          </button>
        ))}
      </div>

      {/* Status label */}
      <div className={`va-status va-status--${state}`}>
        <span className="va-dot" />
        {LABELS[state]}
      </div>

      {/* Live transcript / reply */}
      <div className="va-caption">
        {(state === 'listening' || state === 'thinking') && transcript && (
          <p className="va-caption__user">"{transcript}"</p>
        )}
        {state === 'speaking' && reply && (
          <p className="va-caption__reply">{reply}{reply.length >= 130 ? '…' : ''}</p>
        )}
      </div>

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
