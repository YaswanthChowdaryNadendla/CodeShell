package com.devcompiler.service;

import com.devcompiler.model.CompileRequest;
import com.devcompiler.model.CompileResponse;
import org.springframework.stereotype.Service;

@Service
public class CompilerService {

    private final JavaExecutionEngine javaExecutionEngine;
    private final PythonExecutionEngine pythonExecutionEngine;
    private final JsExecutionEngine jsExecutionEngine;
    private final CppExecutionEngine cppExecutionEngine;

    public CompilerService(JavaExecutionEngine javaExecutionEngine, 
                           PythonExecutionEngine pythonExecutionEngine, 
                           JsExecutionEngine jsExecutionEngine,
                           CppExecutionEngine cppExecutionEngine) {
        this.javaExecutionEngine = javaExecutionEngine;
        this.pythonExecutionEngine = pythonExecutionEngine;
        this.jsExecutionEngine = jsExecutionEngine;
        this.cppExecutionEngine = cppExecutionEngine;
    }

    public CompileResponse runCode(CompileRequest request) {
        String language = request.getLanguage().toLowerCase().trim();
        String code = request.getCode();
        String input = request.getInput();

        switch (language) {
            case "java":
                return javaExecutionEngine.execute(code, input);
            case "python":
                return pythonExecutionEngine.execute(code, input);
            case "javascript":
                return jsExecutionEngine.execute(code, input);
            case "cpp":
                return cppExecutionEngine.execute(code, input);
            default:
                return new CompileResponse(false, "", "Unsupported language '" + language + "'. Currently supported: Java.", "0ms");
        }
    }
}
