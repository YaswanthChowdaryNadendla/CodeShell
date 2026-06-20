import React, { useState } from 'react';
import { Copy, Check, CornerDownLeft, Clock, Trash2 } from 'lucide-react';
import { getFileIcon } from './Icons';

// Custom OutputIcon rendering a command-line/output prompt symbol in SVG
const OutputIcon = ({ size = 13, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

export default function ConsolePanel({
  input,
  setInput,
  output,
  error,
  status,
  executionTime,
  isRunning,
  history = [],
  onClearHistory,
}) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('output'); // 'output' | 'history'



  const handleCopy = () => {
    const textToCopy = error ? `${error}\n${output}` : output;
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Convert status to visual chip configuration using GitHub Dark hex values with emojis
  const getStatusBadge = (statusState, timeStr) => {
    const timeLabel = timeStr ? ` • ${timeStr}` : '';
    switch (statusState) {
      case 'Executing':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#58a6ff]/10 text-[#58a6ff] border border-[#58a6ff]/20 animate-pulse">
            🔵 Running
          </span>
        );
      case 'Success':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#3fb950]/10 text-[#3fb950] border border-[#3fb950]/20">
            🟢 Success{timeLabel}
          </span>
        );
      case 'Compilation Error':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#d29922]/10 text-[#d29922] border border-[#d29922]/20">
            🟠 Compilation Error{timeLabel}
          </span>
        );
      case 'Runtime Error':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#f85149]/10 text-[#f85149] border border-[#f85149]/20">
            🔴 Runtime Error{timeLabel}
          </span>
        );
      case 'Timeout':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#db6d28]/10 text-[#db6d28] border border-[#db6d28]/20">
            ⏰ Timeout
          </span>
        );
      case 'Ready':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#8b949e]/10 text-[#8b949e] border border-[#8b949e]/20">
            Ready
          </span>
        );
    }
  };

  // Status with emoji and time representation
  const getStatusTextWithTime = (statusState, timeStr) => {
    const timeLabel = timeStr ? ` • ${timeStr}` : '';
    switch (statusState) {
      case 'Executing':
        return <span className="text-[#58a6ff] font-semibold flex items-center">🔵 Running</span>;
      case 'Success':
        return <span className="text-[#3fb950] font-semibold flex items-center">🟢 Success{timeLabel}</span>;
      case 'Compilation Error':
        return <span className="text-[#d29922] font-semibold flex items-center">🟠 Compilation Error{timeLabel}</span>;
      case 'Runtime Error':
        return <span className="text-[#f85149] font-semibold flex items-center">🔴 Runtime Error{timeLabel}</span>;
      case 'Timeout':
        return <span className="text-[#db6d28] font-semibold flex items-center">⏰ Timeout</span>;
      case 'Ready':
      default:
        return <span className="text-[#8b949e] font-semibold flex items-center">Ready</span>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden shadow-sm select-none">
      
      {/* SECTION 1: CUSTOM INPUT CONSOLE */}
      <div className="flex-1 flex flex-col border-b border-[#30363d] min-h-[150px]">
        {/* Input Header */}
        <div className="h-10 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between px-4">
          <div className="flex items-center space-x-1.5">
            <CornerDownLeft size={13} className="text-[#8b949e]" />
            <span className="text-[14px] font-semibold text-[#e6edf3] font-sans">Standard Input (stdin)</span>
          </div>

        </div>

        {/* Input Text Area */}
        <div className="flex-1 p-3 bg-transparent select-text">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isRunning}
            placeholder="Provide custom input arguments here (one per line)..."
            className="w-full h-full bg-transparent text-[#e6edf3] font-sans text-xs focus:outline-none resize-none placeholder-[#8b949e] leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* SECTION 2: OUTPUT & HISTORY CONSOLE */}
      <div className="flex-[1.5] flex flex-col min-h-[220px]">
        {/* Tab Headers (Segmented Equal Widths) */}
        <div className="h-11 bg-[#0d1117] border-b border-[#30363d] flex items-center px-0 select-none overflow-hidden flex-shrink-0 w-full">
          
          {/* Column 1: Output Tab */}
          <button
            onClick={() => setActiveTab('output')}
            className={`flex-1 h-full flex items-center justify-center space-x-1.5 text-xs font-sans font-semibold transition-colors duration-150 border-r border-[#30363d] group ${
              activeTab === 'output'
                ? 'bg-[#161b22] text-[#e6edf3] border-t-2 border-t-[#8b5cf6]'
                : 'bg-[#0d1117] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]/40'
            }`}
          >
            <OutputIcon size={13} className="text-[#8b949e] group-hover:text-[#e6edf3] transition-colors" />
            <span>Output</span>
          </button>

          {/* Column 2: History Tab */}
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 h-full flex items-center justify-center space-x-1.5 text-xs font-sans font-semibold transition-colors duration-150 border-r border-[#30363d] group ${
              activeTab === 'history'
                ? 'bg-[#161b22] text-[#e6edf3] border-t-2 border-t-[#8b5cf6]'
                : 'bg-[#0d1117] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]/40'
            }`}
          >
            <Clock size={13} className="text-[#8b949e] group-hover:text-[#e6edf3] transition-colors" />
            <span>History</span>
            <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-[#30363d] text-[#8b949e] group-hover:bg-[#21262d] group-hover:text-[#e6edf3] transition-all duration-150">
              {history.length}
            </span>
          </button>

          {/* Column 3: Action Button (Copy / Clear Logs) */}
          <div className="flex-1 h-full flex items-center justify-center">
            {activeTab === 'output' ? (
              <button
                onClick={handleCopy}
                disabled={(!output && !error) || isRunning}
                className="w-full h-full flex items-center justify-center space-x-1.5 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold font-sans text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]/40"
                title="Copy Output"
              >
                {copied ? (
                  <>
                    <Check size={13} className="text-[#3fb950]" />
                    <span className="text-[#3fb950]">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} className="text-[#8b949e]" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={onClearHistory}
                disabled={history.length === 0}
                className="w-full h-full flex items-center justify-center space-x-1.5 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold font-sans text-[#8b949e] hover:text-[#f85149] hover:bg-[#161b22]/40"
                title="Clear Run History"
              >
                <Trash2 size={13} className={history.length === 0 ? "text-[#8b949e]" : "text-[#f85149]"} />
                <span className={history.length === 0 ? "text-[#8b949e]" : "text-[#f85149]"}>Clear Logs</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === 'output' ? (
          // Output Viewer
          <div className="flex-1 flex flex-col min-h-0 bg-transparent">
            <div className="flex-1 p-4 overflow-y-auto font-sans text-xs select-text leading-relaxed relative">
              {isRunning ? (
                <div className="flex flex-col items-center justify-center h-full text-[#8b949e] space-y-2.5 select-none">
                  <div className="w-6 h-6 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
                  <p className="text-[11px] animate-pulse">Executing code on sandbox...</p>
                </div>
              ) : error ? (
                <div className="text-[#f85149] font-sans whitespace-pre-wrap">{error}</div>
              ) : output ? (
                <div className="text-[#e6edf3] font-sans whitespace-pre-wrap">{output}</div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-[#8b949e] space-y-2 select-none text-center font-sans">
                  <h3 className="text-[24px] font-bold text-[#e6edf3]">Welcome to CodeShell</h3>
                  <p className="text-[15px] font-medium text-[#8b949e] leading-relaxed">
                    Write. Compile. Execute.
                  </p>
                  <p className="text-[14px] font-medium text-[#8b949e] leading-relaxed mt-2">
                    Press Run or Ctrl + Enter to start coding.
                  </p>
                </div>
              )}
            </div>

            {/* Output Stats Footer */}
            {!isRunning && status !== 'Ready' && (
              <div className="h-8 bg-[#0d1117] border-t border-[#30363d] px-4 flex items-center text-[11px] font-sans text-[#8b949e] select-none">
                {getStatusTextWithTime(status, executionTime)}
              </div>
            )}
          </div>
        ) : (
          // History Log Viewer
          <div className="flex-1 p-4 bg-transparent overflow-y-auto font-sans text-xs select-text leading-relaxed">
            {history.length === 0 ? (
              <div className="text-[#8b949e] italic flex items-center justify-center h-full select-none text-[11px]">
                No execution logs found. Run code to populate the logs.
              </div>
            ) : (
              <div className="flex flex-col space-y-3 select-none">
                <div className="text-[10px] text-[#8b949e] uppercase font-bold tracking-wider border-b border-[#30363d] pb-2 flex justify-between font-sans">
                  <span>Last 20 Runs</span>
                  <span>Execution Log</span>
                </div>
                <div className="flex flex-col space-y-1.5">
                  {history.map((run) => {
                    const langMap = {
                      java: { name: 'Java', ext: 'main.java' },
                      python: { name: 'Python', ext: 'main.py' },
                      javascript: { name: 'JavaScript', ext: 'main.js' },
                      cpp: { name: 'C++', ext: 'main.cpp' }
                    };
                    const langInfo = langMap[run.language] || { name: run.language, ext: 'main.txt' };
                    
                    const getStatusText = (s) => {
                      switch (s) {
                        case 'Success': return <span className="text-[#3fb950]">Success</span>;
                        case 'Compilation Error': return <span className="text-[#d29922]">Compilation Error</span>;
                        case 'Runtime Error': return <span className="text-[#f85149]">Runtime Error</span>;
                        case 'Timeout': return <span className="text-[#db6d28]">Timeout</span>;
                        default: return <span>{s}</span>;
                      }
                    };

                    return (
                      <div key={run.id} className="py-2 px-3 flex items-center justify-between hover:bg-[#21262d]/50 rounded-lg transition-all duration-150 border border-transparent hover:border-[#30363d] font-sans text-[11px] text-[#8b949e]">
                        <div className="flex items-center space-x-2">
                          <span className="flex-shrink-0 flex items-center">{getFileIcon(langInfo.ext, 14)}</span>
                          <span className="font-semibold text-[#e6edf3]">{langInfo.name}</span>
                          <span>•</span>
                          {getStatusText(run.status)}
                          <span>•</span>
                          <span className="text-[#e6edf3]">{run.executionTime}</span>
                        </div>
                        <div className="text-[10px] opacity-60">
                          {run.timestamp}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
