package com.devcompiler.controller;

import com.devcompiler.model.CompileRequest;
import com.devcompiler.model.CompileResponse;
import com.devcompiler.service.CompilerService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/compiler")
@CrossOrigin(origins = "http://localhost:5173")
public class CompilerController {

    private final CompilerService compilerService;

    public CompilerController(CompilerService compilerService) {
        this.compilerService = compilerService;
    }

    @PostMapping("/run")
    public ResponseEntity<CompileResponse> runCode(@Valid @RequestBody CompileRequest request) {
        CompileResponse response = compilerService.runCode(request);
        return ResponseEntity.ok(response);
    }
}
