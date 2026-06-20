import React from 'react';

export default function Footer() {
  return (
    <footer className="h-[56px] bg-[#161b22] border-t border-[#30363d] flex flex-col items-center justify-center text-[10px] font-sans text-[#8b949e] select-none relative z-50 py-2 flex-shrink-0">
      <div className="text-[#e6edf3] font-semibold text-[11px] tracking-wide flex items-center justify-center space-x-1.5 font-sans">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
          <path d="M6 8L2 12L6 16" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10.5 19L13.5 5" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M18 8L22 12L18 16" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>Developed by Yaswanth Chowdary Nadendla</span>
      </div>
      <div className="flex items-center space-x-1 text-[10px] mt-1 opacity-70 font-sans font-medium">
        <span>CodeShell v1.0.0</span>
        <span className="mx-2 text-[#30363d]">|</span>
        <span>React • Monaco • Spring Boot • Java • Python • JavaScript • C++</span>
        <span className="mx-2 text-[#30363d]">|</span>
        <a href="https://www.flaticon.com/free-icons/code" title="code icons" target="_blank" rel="noopener noreferrer" className="hover:text-[#58a6ff] transition-colors">Icons by meaicon</a>
      </div>
    </footer>
  );
}
