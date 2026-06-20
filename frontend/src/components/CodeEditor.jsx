import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { X } from 'lucide-react';
import { getFileIcon } from './Icons';
import { formatBraceLanguage, formatPython } from '../utils/formatter';

export default function CodeEditor({
  language,
  code,
  onChange,
  onRun,
  status,
  isRunning,
  files = [],
  activeFileId = '',
  openFileIds = [],
  onSelectFile,
  onCloseFile,
  formatTrigger = 0,
  onFormatSuccess,
  dirtyFileIds = [],
  onSave,
}) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const activeFileIdRef = useRef(activeFileId);

  // Sync activeFileId ref
  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  const handleBeautifyInternal = () => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const currentCode = editorRef.current.getValue();
    let formatted = currentCode;

    if (language === 'java' || language === 'cpp' || language === 'javascript') {
      formatted = formatBraceLanguage(currentCode);
    } else if (language === 'python') {
      formatted = formatPython(currentCode);
    }

    if (formatted !== currentCode) {
      editorRef.current.pushUndoStop();
      editorRef.current.executeEdits('beautify', [
        {
          range: model.getFullModelRange(),
          text: formatted,
          forceMoveMarkers: true,
        },
      ]);
      editorRef.current.pushUndoStop();
    }

    if (onFormatSuccess) {
      onFormatSuccess();
    }
  };

  // Listen to external formats triggered from the navbar/global shortcut
  useEffect(() => {
    if (formatTrigger > 0) {
      handleBeautifyInternal();
    }
  }, [formatTrigger]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Add custom keyboard shortcut Ctrl+Enter to trigger code run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRun();
    });

    // Add custom keyboard shortcut Ctrl+S to save code
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onSave) {
        onSave(activeFileIdRef.current);
      }
    });

    // Register shift+alt+f keyboard shortcut within the editor itself
    editor.addAction({
      id: 'beautify-code',
      label: 'Beautify Code',
      keybindings: [
        monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      ],
      run: () => {
        handleBeautifyInternal();
      },
    });
  };

  // Convert language code to display label
  const getLanguageLabel = (lang) => {
    switch (lang) {
      case 'java': return 'Java 25';
      case 'python': return 'Python 3';
      case 'javascript': return 'JavaScript';
      case 'cpp': return 'C++ (G++)';
      case 'plaintext': return 'Plain Text';
      case 'markdown': return 'Markdown';
      default: return lang;
    }
  };

  // Get status badge configuration using GitHub Dark hex status colors
  const getStatusInfo = (statusState) => {
    switch (statusState) {
      case 'Executing':
        return { text: 'Executing', colorClass: 'bg-[#58a6ff]', animate: 'animate-pulse' };
      case 'Success':
        return { text: 'Ready', colorClass: 'bg-[#3fb950]', animate: '' };
      case 'Compilation Error':
        return { text: 'Compilation Error', colorClass: 'bg-[#d29922]', animate: '' };
      case 'Runtime Error':
        return { text: 'Runtime Error', colorClass: 'bg-[#f85149]', animate: '' };
      case 'Timeout':
        return { text: 'Timeout', colorClass: 'bg-[#db6d28]', animate: '' };
      case 'Ready':
      default:
        return { text: 'Ready', colorClass: 'bg-[#8b949e]', animate: '' };
    }
  };

  const statusInfo = getStatusInfo(status);

  // Using shared getFileIcon helper from Icons.jsx

  const lineCount = (code || '').split('\n').length;
  const charCount = (code || '').length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden shadow-sm select-none">
      
      {/* Editor Header Tab Row */}
      <div className="h-10 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between px-0 select-none overflow-hidden flex-shrink-0">
        
        {/* Horizontal tabs */}
        <div className="flex-1 flex items-center h-full overflow-x-auto scrollbar-none font-sans">
          {openFileIds.map((fileId) => {
            const file = files.find(f => f.id === fileId);
            if (!file) return null;
            const isActive = fileId === activeFileId;
            const isDirty = dirtyFileIds.includes(fileId);

            return (
              <div
                key={fileId}
                onClick={() => onSelectFile(fileId)}
                className={`h-10 border-r border-[#30363d] px-3 flex items-center text-xs font-sans cursor-pointer relative select-none group transition-all duration-150 ${
                  isActive 
                    ? 'bg-[#161b22] text-[#e6edf3] border-t-2 border-t-[#8b5cf6] font-semibold' 
                    : 'bg-[#0d1117] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]/40 font-medium'
                }`}
              >
                {/* Language Icon */}
                <span className="flex-shrink-0 select-none flex items-center mr-1.5">{getFileIcon(file.name, 16)}</span>
                
                {/* File Name */}
                <span className="whitespace-nowrap select-none">{file.name}</span>
                
                {/* Close Button / Unsaved changes Indicator container */}
                <div className="relative w-4 h-4 flex items-center justify-center ml-2 flex-shrink-0">
                  {/* Unsaved indicator (visible by default when dirty, scales to 0 on hover) */}
                  {isDirty && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8b949e] group-hover:scale-0 transition-transform duration-100 absolute" />
                  )}
                  
                  {/* Close Button (opacity 0, scales up on hover) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseFile(fileId);
                    }}
                    className={`p-0.5 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#e6edf3] flex items-center justify-center absolute transition-all duration-100 ${
                      isDirty 
                        ? 'opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100' 
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title="Close Tab"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monaco Editor Workspace */}
      <div className="flex-1 w-full bg-transparent relative select-text">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={onChange}
          theme="vs-dark"
          onMount={handleEditorDidMount}
          loading={
            <div className="absolute inset-0 flex items-center justify-center bg-transparent text-[#8b949e] font-mono text-xs">
              Loading Monaco Editor...
            </div>
          }
          options={{
            fontSize: 14,
            lineHeight: 22,
            fontFamily: "Cascadia Code",
            fontLigatures: true,
            minimap: { enabled: false },
            lineNumbers: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'on',
            scrollbar: {
              vertical: 'visible',
              horizontal: 'visible',
              useShadows: false,
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            cursorBlinking: 'blink',
            cursorSmoothCaretAnimation: 'on',
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            quickSuggestions: {
              other: true,
              comments: false,
              strings: false
            },
            renderWhitespace: 'none',
          }}
        />
      </div>

      {/* Editor Status Bar */}
      <div className="h-7 bg-[#161b22] text-[#8b949e] border-t border-[#30363d] flex items-center justify-center space-x-4 text-[12px] font-medium select-none font-mono">
        <span>Lines: {lineCount}</span>
        <span className="opacity-30">|</span>
        <span>Characters: {charCount}</span>
        <span className="opacity-30">|</span>
        <span>Tab Size: 4</span>
        <span className="opacity-30">|</span>
        <span>Spaces: 4</span>
      </div>
    </div>
  );
}
