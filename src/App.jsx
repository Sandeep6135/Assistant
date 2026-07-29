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

      <header className="hdr">
        <h1 className="hdr__title">VOICE ASSISTANT</h1>
        <p className="hdr__sub">
          AWS Student Builder Group &nbsp;&bull;&nbsp; Cloud Computing Lab
          &nbsp;&bull;&nbsp; CV Raman Building, Parul University
        </p>
      </header>

      <main className="main">
        <Face state={state} />
        <VoiceAssistant onStateChange={setState} />
      </main>
    </div>
  );
}

export default App;
