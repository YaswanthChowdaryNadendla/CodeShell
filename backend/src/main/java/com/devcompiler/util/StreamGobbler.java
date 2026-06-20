package com.devcompiler.util;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class StreamGobbler implements Runnable {
    private final InputStream inputStream;
    private final StringBuilder result = new StringBuilder();
    private static final int MAX_CHAR_LIMIT = 500 * 1024; // 500 KB max output limit

    public StreamGobbler(InputStream inputStream) {
        this.inputStream = inputStream;
    }

    @Override
    public void run() {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int numRead;
            while ((numRead = reader.read(buffer)) != -1) {
                if (Thread.currentThread().isInterrupted()) {
                    break;
                }
                if (result.length() < MAX_CHAR_LIMIT) {
                    int lengthToAppend = Math.min(numRead, MAX_CHAR_LIMIT - result.length());
                    result.append(buffer, 0, lengthToAppend);
                    if (result.length() >= MAX_CHAR_LIMIT) {
                        result.append("\n... [Output truncated: output limit of 500 KB reached]");
                        break;
                    }
                } else {
                    break;
                }
            }
        } catch (Exception e) {
            result.append("\n[Error gobbling process stream: ").append(e.getMessage()).append("]");
        }
    }

    public String getResult() {
        return result.toString().stripTrailing();
    }
}
