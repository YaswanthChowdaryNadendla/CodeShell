package com.devcompiler.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class CompileRequest {

    @NotBlank(message = "Language is required")
    private String language;

    @NotBlank(message = "Source code cannot be empty")
    @Size(max = 100 * 1024, message = "Source code size cannot exceed 100 KB")
    private String code;

    @Size(max = 50 * 1024, message = "Standard input size cannot exceed 50 KB")
    private String input;

    // Getters and Setters
    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getInput() {
        return input;
    }

    public void setInput(String input) {
        this.input = input;
    }
}
