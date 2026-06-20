import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import CodeEditor from './components/CodeEditor';
import ConsolePanel from './components/ConsolePanel';
import Footer from './components/Footer';
import Explorer from './components/Explorer';
import { runCode } from './services/api';
import { createExecutionSocket } from './services/websocket';

const TEMPLATES = {
  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Welcome to CodeShell");
    }
}`,
  python: `print("Welcome to CodeShell")`,
  javascript: `console.log("Hello, World!");`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`
};

const INITIAL_FILES = [
  { id: '1', name: 'Main.java', content: TEMPLATES.java, language: 'java' },
  { id: '2', name: 'Helper.java', content: `public class Helper {\n    public static void greet() {\n        System.out.println("Hello from Helper.java!");\n    }\n}`, language: 'java' },
  { id: '3', name: 'Utils.java', content: `public class Utils {\n    public static int add(int a, int b) {\n        return a + b;\n    }\n}`, language: 'java' },
  { id: '4', name: 'Input.txt', content: 'test input data here...', language: 'plaintext' },
  { id: '5', name: 'Notes.md', content: '# CodeShell Notes\n\nStart writing notes or document your compiler scripts here.', language: 'markdown' }
];

export default function App() {
  // Virtual File System (VFS) States
  const [files, setFiles] = useState(() => {
    const saved = localStorage.getItem('codeshell_files');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return INITIAL_FILES;
  });

  const [activeFileId, setActiveFileId] = useState(() => {
    return localStorage.getItem('codeshell_active_file_id') || '1';
  });

  const [openFileIds, setOpenFileIds] = useState(() => {
    const saved = localStorage.getItem('codeshell_open_file_ids');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return ['1', '2', '3', '4', '5'];
  });

  const [input, setInput] = useState(() => {
    return localStorage.getItem('codeshell_input') || '';
  });

  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Ready');
  const [executionTime, setExecutionTime] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [terminalLines, setTerminalLines] = useState([]);
  const wsRef = useRef(null);

  const [dirtyFileIds, setDirtyFileIds] = useState([]);
  const [formatTrigger, setFormatTrigger] = useState(0);
  const [toastMessage, setToastMessage] = useState('');

  // Handle success toast auto-dismissal
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 2000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleSave = (fileId = activeFileId) => {
    setDirtyFileIds(prev => prev.filter(id => id !== fileId));
  };

  // Global keydown listener for Alt + Shift + F and Ctrl + S
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFormatTrigger(prev => prev + 1);
      }
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeFileId]);

  // Clean up WebSocket connection on component unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleBeautify = () => {
    setFormatTrigger(prev => prev + 1);
  };

  const handleFormatSuccess = () => {
    setToastMessage('Code formatted successfully');
  };

  // Explorer collapse and responsive states
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Execution History state
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('codeshell_history')) || [];
    } catch {
      return [];
    }
  });

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('codeshell_history');
  };

  // Pane Resizing States
  const [splitWidth, setSplitWidth] = useState(60); // Percentage for editor pane
  const containerRef = useRef(null);
  const isResizingRef = useRef(false);

  // Track responsive screen size
  useEffect(() => {
    const checkSize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsCollapsed(true); // Auto collapse on small screens
      }
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  // Sync VFS States to LocalStorage
  useEffect(() => {
    localStorage.setItem('codeshell_files', JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    localStorage.setItem('codeshell_active_file_id', activeFileId);
  }, [activeFileId]);

  useEffect(() => {
    localStorage.setItem('codeshell_open_file_ids', JSON.stringify(openFileIds));
  }, [openFileIds]);

  useEffect(() => {
    localStorage.setItem('codeshell_input', input);
  }, [input]);

  // Computed VFS properties
  const activeFile = files.find(f => f.id === activeFileId) || files[0];
  const code = activeFile ? activeFile.content : '';
  const language = activeFile ? activeFile.language : 'java';

  // Handle active file selection
  const handleSelectFile = (fileId) => {
    setActiveFileId(fileId);
    if (!openFileIds.includes(fileId)) {
      setOpenFileIds(prev => [...prev, fileId]);
    }
  };

  // Handle file tab close
  const handleCloseFile = (fileId) => {
    const filteredOpen = openFileIds.filter(id => id !== fileId);
    setOpenFileIds(filteredOpen);
    setDirtyFileIds(prev => prev.filter(id => id !== fileId));

    // If closing active file, open next tab or first file
    if (activeFileId === fileId) {
      if (filteredOpen.length > 0) {
        setActiveFileId(filteredOpen[0]);
      } else if (files.length > 0) {
        setActiveFileId(files[0].id);
      }
    }
  };

  // Handle new file creation
  const handleCreateFile = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    let lang = 'plaintext';
    let initialContent = '';
    
    if (ext === 'java') {
      lang = 'java';
      const className = fileName.split('.')[0];
      initialContent = `public class ${className} {\n    public static void main(String[] args) {\n        System.out.println("Hello from ${fileName}");\n    }\n}`;
    } else if (ext === 'py') {
      lang = 'python';
      initialContent = `print("Hello from ${fileName}")`;
    } else if (ext === 'js') {
      lang = 'javascript';
      initialContent = `console.log("Hello from ${fileName}");`;
    } else if (ext === 'cpp' || ext === 'cc') {
      lang = 'cpp';
      initialContent = `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello from ${fileName}" << endl;\n    return 0;\n}`;
    } else if (ext === 'md') {
      lang = 'markdown';
      initialContent = `# ${fileName}\n\nNotes go here.`;
    }

    const newFile = {
      id: Date.now().toString(),
      name: fileName,
      content: initialContent,
      language: lang
    };

    setFiles(prev => [...prev, newFile]);
    setOpenFileIds(prev => [...prev, newFile.id]);
    setActiveFileId(newFile.id);
  };

  // Handle file rename
  const handleRenameFile = (fileId, newName) => {
    const ext = newName.split('.').pop().toLowerCase();
    let lang = 'plaintext';
    if (ext === 'java') lang = 'java';
    else if (ext === 'py') lang = 'python';
    else if (ext === 'js') lang = 'javascript';
    else if (ext === 'cpp' || ext === 'cc') lang = 'cpp';
    else if (ext === 'md') lang = 'markdown';

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: newName, language: lang } : f));
  };

  // Handle file delete
  const handleDeleteFile = (fileId) => {
    if (files.length <= 1) return; // Prevent deleting the last file

    const filteredFiles = files.filter(f => f.id !== fileId);
    setFiles(filteredFiles);

    const filteredOpen = openFileIds.filter(id => id !== fileId);
    setOpenFileIds(filteredOpen);
    setDirtyFileIds(prev => prev.filter(id => id !== fileId));

    if (activeFileId === fileId) {
      if (filteredOpen.length > 0) {
        setActiveFileId(filteredOpen[0]);
      } else if (filteredFiles.length > 0) {
        setOpenFileIds([filteredFiles[0].id]);
        setActiveFileId(filteredFiles[0].id);
      }
    }
  };

  // Handle code change from Monaco Editor
  const handleCodeChange = (newVal) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: newVal } : f));
    setDirtyFileIds(prev => prev.includes(activeFileId) ? prev : [...prev, activeFileId]);
  };

  // Bridging Navbar language selection to VFS files
  const handleLanguageChange = (newLang) => {
    let matchedFile = files.find(f => f.language === newLang);
    if (!matchedFile) {
      const extMap = { java: 'java', python: 'py', javascript: 'js', cpp: 'cpp' };
      const ext = extMap[newLang] || 'txt';
      const name = `main.${ext}`;
      handleCreateFile(name);
    } else {
      handleSelectFile(matchedFile.id);
    }
  };

  // Run code handler
  const handleSendInput = (line) => {
    if (wsRef.current) {
      wsRef.current.send({ type: 'input', data: line + '\n' });
      setTerminalLines(prev => [...prev, { type: 'input', text: line + '\n' }]);
    }
  };

  const handleStop = () => {
    if (wsRef.current) {
      wsRef.current.send({ type: 'kill' });
    }
  };

  const handleRun = async () => {
    if (isRunning) return;

    if (!activeFile) return;

    // Auto-save on run
    handleSave(activeFile.id);

    const isCompilable = ['java', 'python', 'javascript', 'cpp'].includes(activeFile.language);
    if (!isCompilable) {
      setStatus('Ready');
      setError(`Cannot execute: "${activeFile.name}" is not a compilable source code file. Please select a C++, Java, Python, or JavaScript file.`);
      setOutput('');
      return;
    }

    const codeSize = new TextEncoder().encode(code).length;
    const inputSize = new TextEncoder().encode(input).length;

    if (codeSize > 1024 * 1024) {
      setStatus('Ready');
      setError(`Validation Error: Source code size exceeds the 1 MB limit. Current: ${(codeSize / 1024).toFixed(2)} KB.`);
      setOutput('');
      return;
    }

    if (inputSize > 50 * 1024) {
      setStatus('Ready');
      setError(`Validation Error: Stdin input size exceeds the 50 KB limit. Current: ${(inputSize / 1024).toFixed(2)} KB.`);
      setOutput('');
      return;
    }

    setIsRunning(true);
    setStatus('Executing');
    setOutput('');
    setError('');
    setExecutionTime('');
    
    const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    let startMsg = 'Starting execution...';
    if (activeFile.language === 'java') startMsg = 'Compiling Java code...';
    else if (activeFile.language === 'cpp') startMsg = 'Compiling C++ code...';
    else if (activeFile.language === 'python') startMsg = 'Starting Python...';
    else if (activeFile.language === 'javascript') startMsg = 'Starting JavaScript...';
    else {
      startMsg = `Starting ${capitalize(activeFile.language)}...`;
    }
    setTerminalLines([{ type: 'system', text: startMsg, isTemporary: true }]);

    // Open WebSocket connection
    const socket = createExecutionSocket(
      // onMessage
      (msg) => {
        if (msg.type === 'output') {
          setTerminalLines(prev => {
            const filtered = prev.filter(line => !line.isTemporary);
            return [...filtered, { type: 'output', text: msg.data }];
          });
        } else if (msg.type === 'error') {
          setTerminalLines(prev => {
            const filtered = prev.filter(line => !line.isTemporary);
            return [...filtered, { type: 'error', text: msg.data }];
          });
        } else if (msg.type === 'system') {
          if (msg.data.includes('Compilation Error:')) {
            setTerminalLines(prev => {
              const filtered = prev.filter(line => !line.isTemporary);
              return [...filtered, { type: 'system', text: msg.data }];
            });
          } else if (msg.data.trim() === 'compilation_success') {
            setTerminalLines(prev => prev.filter(line => !line.isTemporary));
          } else if (msg.data.startsWith('Compiling')) {
            setTerminalLines(prev => {
              const filtered = prev.filter(line => !line.isTemporary);
              return [...filtered, { type: 'system', text: msg.data.trim(), isTemporary: true }];
            });
          }
        } else if (msg.type === 'exit') {
          setIsRunning(false);
          setExecutionTime(msg.executionTime || '0ms');
          
          let mappedStatus = 'Success';
          if (msg.code === 0) {
            mappedStatus = 'Success';
          } else if (msg.code === -1) {
            mappedStatus = 'Killed';
            setTerminalLines(prev => {
              const filtered = prev.filter(line => !line.isTemporary);
              return [...filtered, { type: 'error', text: '\nExecution terminated by user.\n' }];
            });
            // Return early to skip normal history saving logic or just set status
            setStatus(mappedStatus);
            if (wsRef.current) {
              wsRef.current.close();
              wsRef.current = null;
            }
            return;
          } else {
            mappedStatus = 'Runtime Error';
          }
          setStatus(mappedStatus);

          setTerminalLines(prev => prev.filter(line => !line.isTemporary));

          // Save run to execution history
          const historyItem = {
            id: Date.now(),
            language: activeFile.language,
            timestamp: new Date().toLocaleTimeString(),
            executionTime: msg.executionTime || '0ms',
            status: mappedStatus
          };
          
          setHistory(prev => {
            const updated = [historyItem, ...prev].slice(0, 20);
            localStorage.setItem('codeshell_history', JSON.stringify(updated));
            return updated;
          });

          if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
          }
        }
      },
      // onClose
      () => {
        setIsRunning(false);
        wsRef.current = null;
      },
      // onError
      (err) => {
        setTerminalLines(prev => {
          const filtered = prev.filter(line => !line.isTemporary);
          return [...filtered, { type: 'error', text: '\n[WebSocket Connection Error]\n' }];
        });
        setIsRunning(false);
        wsRef.current = null;
      },
      // onOpen
      () => {
        socket.send({
          type: 'run',
          language: activeFile.language,
          code: code,
          preloadedInput: ""
        });
      }
    );

    wsRef.current = socket;
  };

  // Reset/Clear workspace handler
  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
    setStatus('Ready');
    setExecutionTime('');
    setTerminalLines([]);
    
    if (activeFile && TEMPLATES[activeFile.language]) {
      setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: TEMPLATES[activeFile.language] } : f));
    } else if (activeFile) {
      setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: '' } : f));
    }
    
    localStorage.setItem('codeshell_input', '');
  };

  // Mouse resizing handlers
  const handleMouseDown = () => {
    isResizingRef.current = true;
    document.body.classList.add('cursor-col-resize');
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingRef.current || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      
      // Account for explorer sidebar width if not collapsed
      const explorerWidth = isCollapsed ? 48 : 240; // Activity bar 48px, explorer 192px
      const relativeX = e.clientX - containerRect.left - explorerWidth;
      const workspaceWidth = containerRect.width - explorerWidth;
      
      const percentage = (relativeX / workspaceWidth) * 100;

      // Constrain panel width between 30% and 80%
      if (percentage >= 30 && percentage <= 80) {
        setSplitWidth(percentage);
      }
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.classList.remove('cursor-col-resize');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isCollapsed]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0d1117] text-[#e6edf3] font-sans select-none relative">
      {/* Top Navigation */}
      <Navbar
        language={language}
        setLanguage={handleLanguageChange}
        onRun={handleRun}
        onClear={handleClear}
        onStop={handleStop}
        isRunning={isRunning}
        status={status}
        code={code}
        activeFileName={activeFile ? activeFile.name : 'Main.java'}
        onBeautify={handleBeautify}
      />

      {/* Main Resizable Workspace */}
      <div 
        ref={containerRef}
        className="flex-1 flex overflow-hidden w-full relative p-2 gap-2 bg-[#0d1117]"
        style={{ height: 'calc(100vh - 56px - 56px)' }}
      >
        {/* Left Side: Collapsible/Drawer Explorer */}
        <div 
          className={`${
            isMobile && !isCollapsed 
              ? 'absolute left-2 top-2 bottom-2 z-40 shadow-2xl h-[calc(100%-1rem)]' 
              : 'relative'
          } flex flex-shrink-0`}
        >
          <Explorer
            files={files}
            activeFileId={activeFileId}
            onSelectFile={handleSelectFile}
            onCreateFile={handleCreateFile}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          />
        </div>

        {/* Overlay backdrop for mobile when explorer is open */}
        {isMobile && !isCollapsed && (
          <div 
            className="absolute inset-0 bg-black/60 z-30" 
            onClick={() => setIsCollapsed(true)} 
          />
        )}

        {/* Code Editor */}
        <div 
          style={{ width: `${splitWidth}%` }} 
          className="h-full flex flex-col min-w-[30%] relative z-10"
        >
          <CodeEditor
            language={language}
            code={code}
            onChange={handleCodeChange}
            onRun={handleRun}
            status={status}
            isRunning={isRunning}
            files={files}
            activeFileId={activeFileId}
            openFileIds={openFileIds}
            onSelectFile={handleSelectFile}
            onCloseFile={handleCloseFile}
            formatTrigger={formatTrigger}
            onFormatSuccess={handleFormatSuccess}
            dirtyFileIds={dirtyFileIds}
            onSave={handleSave}
          />
        </div>

        {/* Vertical Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1 bg-[#30363d] hover:bg-[#58a6ff] active:bg-[#58a6ff] cursor-col-resize transition-all duration-150 h-full relative resizer-handle z-20 flex-shrink-0"
        />

        {/* Right Side: Stdin & Stdout consoles */}
        <div 
          style={{ width: `${100 - splitWidth}%` }} 
          className="h-full flex flex-col min-w-[20%] relative z-10"
        >
          <ConsolePanel
            input={input}
            setInput={setInput}
            output={output}
            error={error}
            status={status}
            executionTime={executionTime}
            isRunning={isRunning}
            history={history}
            onClearHistory={handleClearHistory}
            terminalLines={terminalLines}
            onSendInput={handleSendInput}
          />
        </div>
      </div>

      {/* Footer Status Bar */}
      <Footer />

      {/* Success Toast */}
      {toastMessage && (
        <div className="absolute bottom-20 right-6 z-[100] bg-[#161b22] text-[#3fb950] border border-[#30363d] px-4 py-2.5 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center space-x-2 text-xs font-sans font-medium animate-slide-in select-none">
          <span>✨</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
