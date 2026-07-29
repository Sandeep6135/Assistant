import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Face.css';

/* ─────────────────────────────────────────────
   Eye — morphing rounded square that tracks mouse
───────────────────────────────────────────── */
const Eye = ({ state, mousePosition, eyeRef }) => {
  const [pupilPos, setPupilPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!eyeRef?.current || state === 'resting') return;
    const rect = eyeRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = mousePosition.x - cx;
    const dy = mousePosition.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxR = 18;
    const r = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    setPupilPos({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }, [mousePosition, state, eyeRef]);

  return (
    <div className={`eye eye--${state}`} ref={eyeRef}>
      {state !== 'resting' && (
        <div
          className="pupil"
          style={{ transform: `translate(${pupilPos.x}px, ${pupilPos.y}px)` }}
        >
          <div className="pupil-shine" />
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Face — container with two eyes + mouth
───────────────────────────────────────────── */
const Face = ({ state, volume }) => {
  const [mouse, setMouse] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const leftEyeRef  = useRef(null);
  const rightEyeRef = useRef(null);

  useEffect(() => {
    const h = (e) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, []);

  return (
    <div className={`face-panel face-panel--${state}`}>
      <div className="eyes-row">
        <Eye state={state} mousePosition={mouse} eyeRef={leftEyeRef} />
        <Eye state={state} mousePosition={mouse} eyeRef={rightEyeRef} />
      </div>
      <Mouth state={state} volume={volume} />
    </div>
  );
};

/* ─────────────────────────────────────────────
   Mouth — animated shape below the eyes
───────────────────────────────────────────── */
const Mouth = ({ state }) => (
  <div className={`mouth mouth--${state}`}>
    {state === 'speaking' && (
      <div className="mouth-bars">
        {[...Array(9)].map((_, i) => (
          <div
            key={i}
            className="mbar"
            style={{ animationDelay: `${i * 0.06}s`, animationDuration: `${0.4 + (i % 3) * 0.1}s` }}
          />
        ))}
      </div>
    )}
    {state === 'thinking' && (
      <div className="mouth-dots">
        {[0, 0.2, 0.4].map((d, i) => (
          <span key={i} style={{ animationDelay: `${d}s` }} />
        ))}
      </div>
    )}
    {(state === 'idle' || state === 'listening') && (
      <div className={`mouth-line mouth-line--${state}`} />
    )}
    {state === 'resting' && <div className="mouth-rest" />}
  </div>
);

export default Face;
