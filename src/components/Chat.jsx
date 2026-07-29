import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { sendMessageToBadal } from '../gemini';
import './Chat.css';

const Chat = () => {
  const [messages, setMessages] = useState([
    { role: 'model', text: 'Hi, I am Badal! Developed by the AWS Student builder group at Parul University. You can type or use the mic to talk to me!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [transcript, setTranscript] = useState('');

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  // ── scroll to bottom ──────────────────────────────────────────────────────
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [messages]);

  // ── Text-to-Speech ────────────────────────────────────────────────────────
  const speak = useCallback((text) => {
    if (!voiceEnabled || !synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Pick a nice voice — prefer en-GB or en-US
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(v => v.name.includes('Google UK English Female'))
      || voices.find(v => v.lang === 'en-GB')
      || voices.find(v => v.lang === 'en-US')
      || voices[0];
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synthRef.current.speak(utterance);
  }, [voiceEnabled]);

  // Load voices async (Chrome loads them lazily)
  useEffect(() => {
    const loadVoices = () => synthRef.current?.getVoices();
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // ── Speech-to-Text ────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    // Stop any ongoing speech when mic starts
    synthRef.current?.cancel();
    setIsSpeaking(false);

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      setTranscript('');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      setTranscript(interim || final);
      if (final) {
        setInput(final);
        // Auto-send after a short delay
        setTimeout(() => handleSendText(final), 300);
      }
    };

    recognition.onerror = (e) => {
      console.error('Speech recognition error:', e.error);
      setIsListening(false);
      setTranscript('');
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setTranscript('');
  }, []);

  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };

  const toggleVoice = () => {
    if (voiceEnabled) {
      synthRef.current?.cancel();
      setIsSpeaking(false);
    }
    setVoiceEnabled(prev => !prev);
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSendText = async (text) => {
    const msg = text.trim();
    if (!msg || isLoading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setIsLoading(true);

    try {
      const responseText = await sendMessageToBadal(msg);
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
      speak(responseText);
    } catch {
      const errMsg = 'Sorry, I ran into an error. Please try again.';
      setMessages(prev => [...prev, { role: 'model', text: errMsg }]);
      speak(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSendText(input);
  };

  return (
    <div className="chat-wrapper">
      {/* Voice status banner */}
      {isListening && (
        <div className="voice-banner">
          <span className="pulse-ring"></span>
          <span className="voice-banner-text">
            {transcript ? `"${transcript}"` : 'Listening…'}
          </span>
        </div>
      )}
      {isSpeaking && (
        <div className="voice-banner speaking">
          <span className="wave-bars">
            <span></span><span></span><span></span><span></span><span></span>
          </span>
          <span className="voice-banner-text">Badal is speaking…</span>
        </div>
      )}

      <div className="chat-container">
        <div className="messages-area">
          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className={`message-bubble ${msg.role}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-wrapper model">
              <div className="message-bubble model loading">
                <Loader2 className="spinner" size={18} />
                <span>Thinking…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="input-area" onSubmit={handleSubmit}>
          {/* Voice toggle */}
          <button
            type="button"
            onClick={toggleVoice}
            className={`icon-btn voice-toggle ${voiceEnabled ? 'active' : ''}`}
            title={voiceEnabled ? 'Mute Badal' : 'Unmute Badal'}
          >
            {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? 'Listening…' : 'Type or press mic to speak…'}
            disabled={isLoading || isListening}
            className="chat-input"
          />

          {/* Mic button */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={isLoading}
            className={`icon-btn mic-btn ${isListening ? 'listening' : ''}`}
            title={isListening ? 'Stop listening' : 'Start voice input'}
          >
            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {/* Send button */}
          <button
            type="submit"
            disabled={!input.trim() || isLoading || isListening}
            className="send-button"
            title="Send message"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default Chat;
