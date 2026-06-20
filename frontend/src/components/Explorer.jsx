import React, { useState, useRef, useEffect } from 'react';
import { getFileIcon } from './Icons';
import { 
  FolderOpen, 
  Plus, 
  Trash2, 
  Edit3, 
  ChevronRight, 
  ChevronDown, 
  FileText
} from 'lucide-react';

export default function Explorer({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  isCollapsed,
  onToggleCollapse,
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [editingFileId, setEditingFileId] = useState(null);
  const [editName, setEditName] = useState('');
  const createInputRef = useRef(null);
  const editInputRef = useRef(null);

  // Focus create input when opening
  useEffect(() => {
    if (isCreating && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [isCreating]);

  // Focus edit input when opening
  useEffect(() => {
    if (editingFileId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingFileId]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newFileName.trim()) {
      setIsCreating(false);
      return;
    }
    onCreateFile(newFileName.trim());
    setNewFileName('');
    setIsCreating(false);
  };

  const handleEditSubmit = (e, fileId) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditingFileId(null);
      return;
    }
    onRenameFile(fileId, editName.trim());
    setEditingFileId(null);
    setEditName('');
  };

  // Using shared getFileIcon helper from Icons.jsx

  return (
    <div className="h-full flex flex-shrink-0 select-none">
      
      {/* 1. VS Code Activity Bar (Leftmost narrow strip) */}
      <div className="w-12 h-full bg-[#0d1117] border-r border-[#30363d] flex flex-col items-center py-4 justify-between">
        <div className="flex flex-col space-y-4 items-center w-full">
          <button 
            onClick={onToggleCollapse}
            className={`p-2 rounded-lg transition-colors duration-150 relative group ${
              !isCollapsed ? 'text-[#e6edf3] bg-[#21262d]' : 'text-[#8b949e] hover:text-[#e6edf3]'
            }`}
            title="Toggle File Explorer"
          >
            <FolderOpen size={18} />
            <span className="absolute left-14 bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[10px] px-2 py-1 rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50">
              Explorer
            </span>
          </button>
        </div>
      </div>

      {/* 2. File Explorer Panel */}
      <div 
        className={`h-full bg-[#161b22] border-r border-[#30363d] flex flex-col transition-all duration-200 overflow-hidden ${
          isCollapsed ? 'w-0 border-r-0' : 'w-48'
        }`}
      >
        {/* Header */}
        <div className="h-10 px-3 flex items-center justify-between border-b border-[#30363d] bg-[#0d1117] flex-shrink-0">
          <span className="text-[11px] font-bold tracking-wider text-[#8b949e] font-sans">
            EXPLORER
          </span>
          <button
            onClick={() => setIsCreating(true)}
            className="p-1 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] rounded transition-colors duration-150"
            title="New File..."
          >
            <Plus size={14} />
          </button>
        </div>

        {/* File Tree List */}
        <div className="flex-1 overflow-y-auto py-2 font-sans text-xs">
          
          {/* Workspace Root Node */}
          <div className="px-3 py-1.5 flex items-center text-[#8b949e] font-semibold text-[10px] uppercase tracking-wider select-none font-sans">
            <ChevronDown size={12} className="mr-1.5" />
            <span>Workspace</span>
          </div>

          {/* Inline Create Form */}
          {isCreating && (
            <form onSubmit={handleCreateSubmit} className="pl-6 pr-2 py-1 flex items-center">
              <span className="mr-1.5 text-[#8b949e]"><FileText size={12} /></span>
              <input
                ref={createInputRef}
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onBlur={() => setIsCreating(false)}
                placeholder="filename.ext"
                className="w-full bg-[#0d1117] border border-[#58a6ff] text-[#e6edf3] text-[13px] font-medium px-1.5 py-0.5 rounded focus:outline-none font-sans"
              />
            </form>
          )}

          {/* Files List */}
          <div className="flex flex-col space-y-[4px] mt-1 pl-4 pr-1">
            {files.map((file) => {
              const isActive = file.id === activeFileId;
              const isEditing = file.id === editingFileId;

              return (
                <div
                  key={file.id}
                  className={`group flex items-center justify-between pl-2 pr-2 py-1.5 rounded-r-md cursor-pointer transition-colors duration-150 border-l-2 ${
                    isActive 
                      ? 'bg-[#21262d] text-[#e6edf3] font-semibold border-[#8b5cf6]' 
                      : 'text-[#8b949e] hover:bg-[#21262d]/40 hover:text-[#e6edf3] border-transparent'
                  }`}
                  onClick={() => !isEditing && onSelectFile(file.id)}
                >
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    {/* File Icon */}
                    <span className="flex-shrink-0 select-none flex items-center">{getFileIcon(file.name, 16)}</span>
                    
                    {/* File Name Label / Input */}
                    {isEditing ? (
                      <form 
                        onSubmit={(e) => handleEditSubmit(e, file.id)}
                        className="flex-1 min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => setEditingFileId(null)}
                          className="w-full bg-[#0d1117] border border-[#58a6ff] text-[#e6edf3] text-[13px] font-medium px-1 py-0.5 rounded focus:outline-none font-sans"
                        />
                      </form>
                    ) : (
                      <span className="truncate font-sans text-[13px] font-medium">{file.name}</span>
                    )}
                  </div>

                  {/* Actions (Pencil & Trash) */}
                  {!isEditing && (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 pl-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFileId(file.id);
                          setEditName(file.name);
                        }}
                        className="p-0.5 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#30363d] rounded transition-colors duration-150"
                        title="Rename file"
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFile(file.id);
                        }}
                        className="p-0.5 text-[#8b949e] hover:text-[#f85149] hover:bg-[#30363d] rounded transition-colors duration-150"
                        title="Delete file"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>

    </div>
  );
}
