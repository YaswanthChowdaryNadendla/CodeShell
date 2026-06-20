import React from 'react';
import javaSvg from '../assets/languages/java.svg';
import pythonSvg from '../assets/languages/python.svg';
import javascriptSvg from '../assets/languages/javascript.svg';
import cppSvg from '../assets/languages/cpp.svg';
import notesSvg from '../assets/languages/notes.svg';
import textSvg from '../assets/languages/text.svg';

export function JavaIcon({ size = 16, className = "" }) {
  return (
    <img
      src={javaSvg}
      alt="Java"
      width={size}
      height={size}
      className={`select-none pointer-events-none align-middle ${className}`}
      style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}

export function PythonIcon({ size = 16, className = "" }) {
  return (
    <img
      src={pythonSvg}
      alt="Python"
      width={size}
      height={size}
      className={`select-none pointer-events-none align-middle ${className}`}
      style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}

export function JavaScriptIcon({ size = 16, className = "" }) {
  return (
    <img
      src={javascriptSvg}
      alt="JavaScript"
      width={size}
      height={size}
      className={`select-none pointer-events-none align-middle ${className}`}
      style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}

export function CppIcon({ size = 16, className = "" }) {
  return (
    <img
      src={cppSvg}
      alt="C++"
      width={size}
      height={size}
      className={`select-none pointer-events-none align-middle ${className}`}
      style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}

export function MarkdownIcon({ size = 16, className = "" }) {
  return (
    <img
      src={notesSvg}
      alt="Notes"
      width={size}
      height={size}
      className={`select-none pointer-events-none align-middle ${className}`}
      style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}

export function TextIcon({ size = 16, className = "" }) {
  return (
    <img
      src={textSvg}
      alt="Text"
      width={size}
      height={size}
      className={`select-none pointer-events-none align-middle ${className}`}
      style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}

export function getFileIcon(fileName, size = 14, className = "") {
  if (!fileName) return <TextIcon size={size} className={className} />;
  const ext = fileName.split('.').pop().toLowerCase();
  switch (ext) {
    case 'java':
      return <JavaIcon size={size} className={className} />;
    case 'py':
      return <PythonIcon size={size} className={className} />;
    case 'js':
      return <JavaScriptIcon size={size} className={className} />;
    case 'cpp':
    case 'cc':
    case 'c':
      return <CppIcon size={size} className={className} />;
    case 'md':
      return <MarkdownIcon size={size} className={className} />;
    case 'txt':
    default:
      return <TextIcon size={size} className={className} />;
  }
}
