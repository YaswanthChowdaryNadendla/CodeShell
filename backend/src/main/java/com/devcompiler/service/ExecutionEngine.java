package com.devcompiler.service;

import com.devcompiler.model.CompileResponse;

public interface ExecutionEngine {
    CompileResponse execute(String code, String input);
}
