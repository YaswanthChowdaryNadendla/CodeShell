package com.devcompiler.exception;

import com.devcompiler.model.CompileResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<CompileResponse> handleValidationExceptions(MethodArgumentNotValidException ex) {
        String errorMessage = ex.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));

        CompileResponse response = new CompileResponse(
                false,
                "",
                "Validation Failure: " + errorMessage,
                "0ms"
        );
        return ResponseEntity.badRequest().body(response);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<CompileResponse> handleAllExceptions(Exception ex) {
        CompileResponse response = new CompileResponse(
                false,
                "",
                "Execution Engine Failure: " + ex.getMessage(),
                "0ms"
        );
        return ResponseEntity.status(500).body(response);
    }
}
