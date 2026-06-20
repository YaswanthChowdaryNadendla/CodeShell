package com.devcompiler.model;

import java.util.Map;

public class CompileResponse {
    private boolean success;
    private String output;
    private String error;
    private String executionTime;
    private Map<String, String> metrics;

    public CompileResponse() {}

    // Original 4-arg constructor — backward-compatible with all other engines
    public CompileResponse(boolean success, String output, String error, String executionTime) {
        this.success = success;
        this.output = output;
        this.error = error;
        this.executionTime = executionTime;
    }

    // Extended constructor for Java engine (includes profiling metrics)
    public CompileResponse(boolean success, String output, String error,
                           String executionTime, Map<String, String> metrics) {
        this.success = success;
        this.output = output;
        this.error = error;
        this.executionTime = executionTime;
        this.metrics = metrics;
    }

    // Getters and Setters
    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getOutput() {
        return output;
    }

    public void setOutput(String output) {
        this.output = output;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public String getExecutionTime() {
        return executionTime;
    }

    public void setExecutionTime(String executionTime) {
        this.executionTime = executionTime;
    }

    public Map<String, String> getMetrics() {
        return metrics;
    }

    public void setMetrics(Map<String, String> metrics) {
        this.metrics = metrics;
    }
}
