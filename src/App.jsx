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
        <Face state={state} />
        <VoiceAssistant onStateChange={setState} />
      </main>
    </div>
  );
}

export default App;
