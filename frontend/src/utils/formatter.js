export function formatBraceLanguage(code) {
  if (!code) return '';

  // Step 1: Preprocess the code to break it into correct lines based on curly braces and statements
  let preprocessed = '';
  let inString = null; // null | '"' | "'" | '`'
  let isEscaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  let parenDepth = 0;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const nextChar = code[i + 1] || '';
    const prevChar = code[i - 1] || '';

    // Handle string escape sequences
    if (isEscaped) {
      preprocessed += char;
      isEscaped = false;
      continue;
    }

    // Inside String Literal
    if (inString) {
      if (char === '\\') {
        isEscaped = true;
      } else if (char === inString) {
        inString = null;
      }
      preprocessed += char;
      continue;
    }

    // Inside Single-line comment
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        preprocessed += char;
      } else {
        preprocessed += char;
      }
      continue;
    }

    // Inside Block comment
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        preprocessed += '*/';
        i++; // skip '/'
      } else {
        preprocessed += char;
      }
      continue;
    }

    // Detect line comment start
    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      preprocessed += '//';
      i++;
      continue;
    }

    // Detect block comment start
    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      preprocessed += '/*';
      i++;
      continue;
    }

    // Detect string start
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      preprocessed += char;
      continue;
    }

    // Track parentheses depth (to avoid breaking on semicolons in for-loops)
    if (char === '(') {
      parenDepth++;
      preprocessed += char;
      continue;
    }
    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      preprocessed += char;
      continue;
    }

    // Insert newlines and spaces around braces and semicolons
    if (char === '{') {
      // Ensure space before opening brace
      const lastChar = preprocessed.slice(-1);
      if (lastChar && !/\s|\{/.test(lastChar)) {
        preprocessed += ' {';
      } else {
        preprocessed += '{';
      }
      preprocessed += '\n';
    } else if (char === '}') {
      // Ensure newline before closing brace
      const lastChar = preprocessed.slice(-1);
      if (lastChar && lastChar !== '\n') {
        preprocessed += '\n}';
      } else {
        preprocessed += '}';
      }
      preprocessed += '\n';
    } else if (char === ';' && parenDepth === 0) {
      preprocessed += ';\n';
    } else {
      preprocessed += char;
    }
  }

  // Step 2: Clean up line indentation and add spaces around operators
  const lines = preprocessed.split('\n');
  let indentLevel = 0;
  const formattedLines = [];
  const indentStr = '    '; // 4 spaces
  
  inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inBlockComment) {
      formattedLines.push(indentStr.repeat(indentLevel) + trimmed);
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }
    
    if (trimmed.startsWith('/*')) {
      inBlockComment = true;
      formattedLines.push(indentStr.repeat(indentLevel) + trimmed);
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed === '') {
      // Avoid multiple consecutive empty lines
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      continue;
    }

    // Determine indentation for the current line
    let currentLineIndent = indentLevel;
    const firstChar = trimmed.charAt(0);
    if (firstChar === '}' || firstChar === ']' || firstChar === ')') {
      let leadingCloses = 0;
      for (let char of trimmed) {
        if (char === '}' || char === ']' || char === ')') {
          leadingCloses++;
        } else if (char === ' ' || char === '\t') {
          continue;
        } else {
          break;
        }
      }
      currentLineIndent = Math.max(0, indentLevel - leadingCloses);
    }

    // Apply safe operator spacing outside string literals
    const processedLine = formatOperators(trimmed);
    const formattedLine = indentStr.repeat(currentLineIndent) + processedLine;
    formattedLines.push(formattedLine);

    // Calculate indent level for subsequent lines
    let cleanLine = trimmed;
    cleanLine = cleanLine.replace(/\/\/.*$/g, '');
    cleanLine = cleanLine.replace(/"(\\.|[^"\\])*"/g, '""');
    cleanLine = cleanLine.replace(/'(\\.|[^'\\])*'/g, "''");

    let opens = 0;
    let closes = 0;
    for (let char of cleanLine) {
      if (char === '{' || char === '(' || char === '[') {
        opens++;
      } else if (char === '}' || char === ')' || char === ']') {
        closes++;
      }
    }

    indentLevel += (opens - closes);
    indentLevel = Math.max(0, indentLevel);
  }

  // Remove trailing empty lines
  while (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] === '') {
    formattedLines.pop();
  }

  return formattedLines.join('\n');
}

function formatOperators(line) {
  let result = '';
  let inString = null;
  let isEscaped = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1] || '';
    const prevChar = line[i - 1] || '';
    const nextNextChar = line[i + 2] || '';

    if (isEscaped) {
      result += char;
      isEscaped = false;
      continue;
    }

    if (inString) {
      if (char === '\\') {
        isEscaped = true;
      } else if (char === inString) {
        inString = null;
      }
      result += char;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      result += char;
      continue;
    }

    // Skip comments
    if (char === '/' && (nextChar === '/' || nextChar === '*')) {
      result += line.substring(i);
      break;
    }

    // Format C++ stream insertion/extraction operators: << and >>
    if (char === '<' && nextChar === '<') {
      if (prevChar !== ' ') result += ' ';
      result += '<<';
      i++;
      if (line[i + 1] !== ' ') result += ' ';
      continue;
    }
    if (char === '>' && nextChar === '>') {
      if (prevChar !== ' ') result += ' ';
      result += '>>';
      i++;
      if (line[i + 1] !== ' ') result += ' ';
      continue;
    }

    // Format assignment & comparison operators safely
    const isOperatorStart = (char === '=' || char === '!' || char === '<' || char === '>' || char === '+' || char === '-' || char === '*' || char === '/' || char === '%');
    
    if (isOperatorStart) {
      let op = '';
      if (char === '=' && nextChar === '=' && nextNextChar === '=') {
        op = '===';
      } else if (char === '!' && nextChar === '=' && nextNextChar === '=') {
        op = '!==';
      } else if (char === '=' && nextChar === '=') {
        op = '==';
      } else if (char === '!' && nextChar === '=') {
        op = '!=';
      } else if (char === '<' && nextChar === '=') {
        op = '<=';
      } else if (char === '>' && nextChar === '=') {
        op = '>=';
      } else if (char === '+' && nextChar === '=') {
        op = '+=';
      } else if (char === '-' && nextChar === '=') {
        op = '-=';
      } else if (char === '*' && nextChar === '=') {
        op = '*=';
      } else if (char === '/' && nextChar === '=') {
        op = '/=';
      } else if (char === '%' && nextChar === '=') {
        op = '%=';
      } else if (char === '<') {
        op = '<';
      } else if (char === '>') {
        op = '>';
      } else if (char === '=') {
        if (nextChar === '>') {
          op = '=>';
        } else if (prevChar !== '=' && prevChar !== '!' && prevChar !== '<' && prevChar !== '>' && prevChar !== '+' && prevChar !== '-' && prevChar !== '*' && prevChar !== '/') {
          op = '=';
        }
      }

      if (op) {
        i += op.length - 1;
        if (result.slice(-1) !== ' ' && result.length > 0) result += ' ';
        result += op;
        if (line[i + 1] !== ' ' && i + 1 < line.length) result += ' ';
        continue;
      }
    }

    // Format Logical Operators
    if (char === '&' && nextChar === '&') {
      if (prevChar !== ' ') result += ' ';
      result += '&&';
      i++;
      if (line[i + 1] !== ' ') result += ' ';
      continue;
    }
    if (char === '|' && nextChar === '|') {
      if (prevChar !== ' ') result += ' ';
      result += '||';
      i++;
      if (line[i + 1] !== ' ') result += ' ';
      continue;
    }

    // Format commas with trailing spaces
    if (char === ',') {
      result += ',';
      if (nextChar !== ' ' && nextChar !== '\n' && nextChar !== '') {
        result += ' ';
      }
      continue;
    }

    result += char;
  }

  return result;
}

export function formatPython(code) {
  if (!code) return '';
  const lines = code.split('\n');
  const formattedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Standardize tabs to 4 spaces
    let processed = line.replace(/\t/g, '    ');
    
    // Remove trailing spaces
    processed = processed.trimEnd();
    
    if (processed.trim() === '') {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      continue;
    }
    
    formattedLines.push(processed);
  }
  
  // Remove trailing empty lines
  while (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] === '') {
    formattedLines.pop();
  }
  
  return formattedLines.join('\n');
}
