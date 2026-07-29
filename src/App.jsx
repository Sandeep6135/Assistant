import React, { useState } from 'react';
import Face from './components/Face';
import VoiceAssistant from './components/VoiceAssistant';
import './App.css';

function App() {
  const [state, setState] = useState('resting');

  return (
    <div className="app">
      <div className="bg-grid" />
      <div className={`bg-glow bg-glow--${state}`} />

      <main className="main">
        <header className="brand-header">
          <svg width="36" height="28" viewBox="0 0 36 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="brand-logo">
            <rect width="36" height="28" rx="6" fill="#0f0f0f" />
            <circle cx="11" cy="14" r="2.5" fill="#ffffff" />
            <circle cx="25" cy="14" r="2.5" fill="#ffffff" />
          </svg>
          <h1 className="brand-title">Voice assistant</h1>
        </header>

        <Face state={state} />
        <VoiceAssistant onStateChange={setState} />
      </main>
    </div>
  );
}

export default App;
