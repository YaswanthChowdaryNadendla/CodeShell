import React from 'react';

export default function Footer() {
  return (
    <footer className="h-[56px] bg-[#161b22] border-t border-[#30363d] flex items-center justify-between px-6 text-[#8b949e] select-none relative z-50 flex-shrink-0 font-sans">

      {/* Left — Developer credit */}
      <span className="flex items-center space-x-1.5 text-[12px] font-semibold">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
          <path d="M6 8L2 12L6 16" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10.5 19L13.5 5" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M18 8L22 12L18 16" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>
          {'Developed by '}
          <a
            href="https://linkedin.com/in/yaswanth-chowdary-nadendla-174a662a8"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#8b949e] hover:text-[#58a6ff] transition-colors duration-200"
          >
            Yaswanth Chowdary Nadendla
          </a>
        </span>
      </span>

      {/* Center — AlgoForge promo */}
      <span className="text-[12px] font-semibold">
        {'DSA Hard? '}
        <a
          href="https://algoforge-dsa.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#58a6ff] hover:text-[#79c0ff] transition-colors duration-200"
        >
          AlgoForge
        </a>
        {' Will Help You.'}
      </span>

      {/* Right — Copyright */}
      <span className="text-[12px] font-semibold">© 2026 CodeShell. All rights reserved.</span>

    </footer>
  );
}

