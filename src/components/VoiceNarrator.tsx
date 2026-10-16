import React, { useEffect, useRef, useState } from 'react';

interface NarratedSection {
  id: string;
  line: string;
}

const sections: NarratedSection[] = [
  { id: 'about', line: 'Let me tell you a bit about myself.' },
  { id: 'work', line: "Here are some of the projects I've built." },
  { id: 'skills', line: 'These are the tools and technologies I work with.' },
  { id: 'experience', line: 'A quick look at my journey so far.' },
  { id: 'contact', line: "Let's connect. Feel free to reach out." },
];

const INTRO_LINE = "Hi, my name is Aater Imran. Welcome to my portfolio.";

export const VoiceNarrator: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const spokenRef = useRef<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const startedRef = useRef(false);

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  const start = () => {
    if (startedRef.current || !('speechSynthesis' in window)) return;
    startedRef.current = true;
    setEnabled(true);
    spokenRef.current.add('hero');
    speak(INTRO_LINE);
  };

  // Try to speak immediately on load.
  useEffect(() => {
    start();
  }, []);

  // Fallback: if the browser blocked autoplay speech, the very first
  // scroll/click/keypress/touch anywhere on the page will kick it off.
  useEffect(() => {
    if (startedRef.current) return;
    const trigger = () => start();
    const events: (keyof WindowEventMap)[] = ['scroll', 'click', 'touchstart', 'keydown'];
    events.forEach((evt) => window.addEventListener(evt, trigger, { once: true, passive: true }));
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, trigger));
    };
  }, []);

  const handleToggle = () => {
    if (!('speechSynthesis' in window)) return;

    if (enabled) {
      window.speechSynthesis.cancel();
      setEnabled(false);
      startedRef.current = false;
      return;
    }

    start();
  };

  useEffect(() => {
    if (!enabled) {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const id = entry.target.id;
            const section = sections.find((s) => s.id === id);
            if (section && !spokenRef.current.has(id)) {
              spokenRef.current.add(id);
              speak(section.line);
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [enabled]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <button
      onClick={handleToggle}
      aria-label={enabled ? 'Mute voice intro' : 'Enable voice intro'}
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2 px-3 py-2.5 sm:px-4 rounded-full border border-[#8C6D4F]/40 bg-black/70 backdrop-blur-md text-[#E8DFD8] hover:border-[#D4AF37]/70 hover:text-[#F7E7C4] transition-colors shadow-[0_0_20px_rgba(0,0,0,0.4)]"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      <span className="text-sm">{enabled ? '🔊' : '🔈'}</span>
      <span className="hidden sm:inline text-[10px] font-medium tracking-[0.15em] uppercase">
        {enabled ? 'Voice On' : 'Voice Intro'}
      </span>
    </button>
  );
};
