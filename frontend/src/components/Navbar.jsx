import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Download, Sparkles } from 'lucide-react';
import { JavaIcon, PythonIcon, JavaScriptIcon, CppIcon } from './Icons';

export default function Navbar({
  language,
  setLanguage,
  onRun,
  onClear,
  onStop,
  isRunning,
  status,
  code = '',
  activeFileName = 'Main.java',
  onBeautify
}) {
  const [runResult, setRunResult] = useState(null); // null | 'success' | 'error' | 'timeout'
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Map run status temporarily (1.5 seconds) for button state feedback
  useEffect(() => {
    if (status === 'Success') {
      setRunResult('success');
      const timer = setTimeout(() => setRunResult(null), 1500);
      return () => clearTimeout(timer);
    } else if (status === 'Compilation Error' || status === 'Runtime Error') {
      setRunResult('error');
      const timer = setTimeout(() => setRunResult(null), 1500);
      return () => clearTimeout(timer);
    } else if (status === 'Timeout') {
      setRunResult('timeout');
      const timer = setTimeout(() => setRunResult(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  const handleDownload = () => {
    if (!code) return;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const languages = [
    { id: 'java', name: 'Java 25', icon: <JavaIcon size={18} /> },
    { id: 'python', name: 'Python', icon: <PythonIcon size={18} /> },
    { id: 'javascript', name: 'JavaScript', icon: <JavaScriptIcon size={18} /> },
    { id: 'cpp', name: 'C++', icon: <CppIcon size={18} /> }
  ];

  const currentLang = languages.find(l => l.id === language) || languages[0];

  return (
    <nav className="h-14 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between px-6 select-none relative z-50 sticky top-0">
      
      {/* Left: Brand Logo */}
      <div className="flex items-center space-x-2.5">
        <div className="flex items-center justify-center w-5 h-5 select-none flex-shrink-0">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 8L2 12L6 16" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10.5 19L13.5 5" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M18 8L22 12L18 16" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span className="font-bold text-[#e6edf3] tracking-wide text-[18px] hidden sm:inline select-none leading-none">
          CodeShell
        </span>
      </div>

      {/* Center: Download, File Size & Beautify */}
      <div className="flex items-center space-x-3">
        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={!code || isRunning}
          className="h-10 px-4 text-xs font-semibold text-[#e6edf3] bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] rounded-xl flex items-center space-x-1.5 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed select-none group"
          title="Download active file"
        >
          <Download size={13} className="text-[#8b949e] group-hover:text-[#e6edf3] transition-colors" />
          <span>Download</span>
        </button>



        {/* Beautify Button */}
        <button
          onClick={onBeautify}
          disabled={!code || isRunning}
          className="h-10 px-4 text-xs font-semibold text-[#e6edf3] bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] rounded-xl flex items-center space-x-1.5 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed select-none group"
          title="Format active file (Shift + Alt + F)"
        >
          <Sparkles size={13} className="text-[#8b949e] group-hover:text-[#e6edf3] transition-colors" />
          <span>Beautify</span>
        </button>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center space-x-3 justify-end">
        
        {/* Custom Language Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => !isRunning && setIsOpen(!isOpen)}
            disabled={isRunning}
            className="h-10 px-4 bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] rounded-xl flex items-center space-x-2.5 transition-all duration-200 text-xs font-sans font-medium text-[#e6edf3] focus:outline-none cursor-pointer disabled:cursor-not-allowed select-none"
          >
            <span className="flex-shrink-0 flex items-center">{currentLang.icon}</span>
            <span>{currentLang.name}</span>
            <ChevronDown size={12} className="text-[#8b949e] transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
          </button>

          {isOpen && (
            <div className="absolute top-12 right-0 w-44 bg-[#161b22] border border-[#30363d] rounded-xl p-2 shadow-2xl z-50 flex flex-col space-y-1 select-none">
              {languages.map((lang) => {
                const isActive = lang.id === language;
                return (
                  <button
                    key={lang.id}
                    onClick={() => {
                      setLanguage(lang.id);
                      setIsOpen(false);
                    }}
                    className={`h-9 px-3 rounded-lg flex items-center space-x-2.5 text-xs font-sans font-medium transition-all duration-150 text-left w-full ${
                      isActive 
                        ? 'bg-[#1f6feb] text-white font-semibold' 
                        : 'text-[#e6edf3] hover:bg-[#21262d]'
                    }`}
                  >
                    <span className="flex-shrink-0 flex items-center">{lang.icon}</span>
                    <span>{lang.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Clear Button */}
        <button
          onClick={onClear}
          disabled={isRunning}
          className="h-10 px-5 text-xs text-[#e6edf3] bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] rounded-xl flex items-center space-x-1.5 transition-all duration-200 hover:scale-103 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
          title="Clear Editor & Consoles"
        >
          <span className="text-sm font-semibold">↻</span>
          <span>Clear</span>
        </button>

        {/* Stop Button */}
        <button
          onClick={onStop}
          disabled={!isRunning}
          className="h-10 px-5 text-xs text-white bg-[#f85149] hover:bg-[#da3633] border border-[#f85149]/20 rounded-xl flex items-center space-x-1.5 transition-all duration-200 hover:scale-103 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
          title="Stop Execution"
        >
          <span className="text-[10px] leading-none">■</span>
          <span>Stop</span>
        </button>

        {/* Premium Run Button */}
        {isRunning ? (
          <button
            disabled
            className="h-10 px-5 text-xs text-white bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] border border-[#8b5cf6]/20 rounded-xl flex items-center space-x-1.5 font-bold cursor-not-allowed select-none transition-all duration-150"
          >
            <span className="inline-block animate-spin font-bold text-sm leading-none">⟳</span>
            <span>Running...</span>
          </button>
        ) : runResult === 'success' ? (
          <button
            disabled
            className="h-10 px-5 text-xs text-white bg-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-[#10b981]/20 rounded-xl flex items-center space-x-1.5 font-bold transition-all duration-200 select-none"
          >
            <span>✓</span>
            <span>Success</span>
          </button>
        ) : runResult === 'error' ? (
          <button
            disabled
            className="h-10 px-5 text-xs text-white bg-[#f85149] shadow-[0_0_15px_rgba(248,81,73,0.3)] border border-[#f85149]/20 rounded-xl flex items-center space-x-1.5 font-bold transition-all duration-200 select-none"
          >
            <span>✕</span>
            <span>Error</span>
          </button>
        ) : runResult === 'timeout' ? (
          <button
            disabled
            className="h-10 px-5 text-xs text-white bg-[#db6d28] shadow-[0_0_15px_rgba(219,109,40,0.3)] border border-[#db6d28]/20 rounded-xl flex items-center space-x-1.5 font-bold transition-all duration-200 select-none"
          >
            <span>⏰</span>
            <span>Timeout</span>
          </button>
        ) : (
          <button
            onClick={onRun}
            className="h-10 px-5 text-xs text-white bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] border border-[#8b5cf6]/20 rounded-xl flex items-center space-x-1.5 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] font-bold"
            title="Run Code (Ctrl + Enter)"
          >
            <span className="text-[10px] leading-none">▶</span>
            <span>Run</span>
          </button>
        )}
      </div>
    </nav>
  );
}
