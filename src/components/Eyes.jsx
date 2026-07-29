import React, { useEffect, useState, useRef } from 'react';
import './Eyes.css';

const Eyes = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({
        x: event.clientX,
        y: event.clientY,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const calculatePupilPosition = (eyeCenter, mousePos, maxRadius) => {
    const deltaX = mousePos.x - eyeCenter.x;
    const deltaY = mousePos.y - eyeCenter.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // If the mouse is close enough, don't bound the pupil
    // Otherwise, bound it to the maxRadius
    if (distance === 0) return { x: 0, y: 0 };
    
    const maxDist = Math.min(distance, maxRadius);
    const angle = Math.atan2(deltaY, deltaX);
    
    return {
      x: Math.cos(angle) * maxDist,
      y: Math.sin(angle) * maxDist,
    };
  };

  const getEyeCenter = (element) => {
    if (!element) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  // Bounding radius for the pupil inside the eye
  const maxPupilRadius = 15; 
  
  // We'll calculate positions via inline styles for simplicity in tracking
  return (
    <div className="eyes-container" ref={containerRef}>
      <Eye 
        mousePosition={mousePosition} 
        maxRadius={maxPupilRadius} 
        calculatePupilPosition={calculatePupilPosition} 
        getEyeCenter={getEyeCenter}
      />
      <Eye 
        mousePosition={mousePosition} 
        maxRadius={maxPupilRadius} 
        calculatePupilPosition={calculatePupilPosition} 
        getEyeCenter={getEyeCenter}
      />
    </div>
  );
};

const Eye = ({ mousePosition, maxRadius, calculatePupilPosition, getEyeCenter }) => {
  const eyeRef = useRef(null);
  const [pupilPos, setPupilPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (eyeRef.current) {
      const center = getEyeCenter(eyeRef.current);
      const newPos = calculatePupilPosition(center, mousePosition, maxRadius);
      setPupilPos(newPos);
    }
  }, [mousePosition, maxRadius, calculatePupilPosition, getEyeCenter]);

  return (
    <div className="eye" ref={eyeRef}>
      <div 
        className="pupil" 
        style={{ 
          transform: `translate(${pupilPos.x}px, ${pupilPos.y}px)` 
        }}
      >
        <div className="pupil-highlight"></div>
      </div>
    </div>
  );
};

export default Eyes;
