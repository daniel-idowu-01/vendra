"use client";

import { useState, useEffect } from "react";

const words = ["WhatsApp", "Anywhere"];

export function Typewriter() {
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = words[wordIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting && charIndex < current.length) {
      timeout = setTimeout(() => setCharIndex((i) => i + 1), 80);
    } else if (!deleting && charIndex === current.length) {
      timeout = setTimeout(() => setDeleting(true), 2000);
    } else if (deleting && charIndex > 0) {
      timeout = setTimeout(() => setCharIndex((i) => i - 1), 40);
    } else if (deleting && charIndex === 0) {
      setDeleting(false);
      setWordIndex((i) => (i + 1) % words.length);
    }

    return () => clearTimeout(timeout);
  }, [wordIndex, charIndex, deleting]);

  return (
    <span className="text-accent">
      {words[wordIndex].slice(0, charIndex)}
      <span className="animate-pulse">|</span>
    </span>
  );
}
