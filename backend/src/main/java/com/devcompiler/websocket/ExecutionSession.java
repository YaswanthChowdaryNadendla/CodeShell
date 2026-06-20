package com.devcompiler.websocket;

import java.io.OutputStream;
import java.nio.file.Path;
import java.util.concurrent.ScheduledFuture;

public class ExecutionSession {
    private final String sessionId;
    private final String language;
    private final Path tempDir;
    private final long startTime;
    private Process process;
    private OutputStream stdinStream;
    private Thread outputThread;
    private Thread errorThread;
    private ScheduledFuture<?> timeoutTask;

    public ExecutionSession(String sessionId, String language, Path tempDir) {
        this.sessionId = sessionId;
        this.language = language;
        this.tempDir = tempDir;
        this.startTime = System.currentTimeMillis();
    }

    public String getSessionId() {
        return sessionId;
    }

    public String getLanguage() {
        return language;
    }

    public Path getTempDir() {
        return tempDir;
    }

    public long getStartTime() {
        return startTime;
    }

    public Process getProcess() {
        return process;
    }

    public void setProcess(Process process) {
        this.process = process;
    }

    public OutputStream getStdinStream() {
        return stdinStream;
    }

    public void setStdinStream(OutputStream stdinStream) {
        this.stdinStream = stdinStream;
    }

    public Thread getOutputThread() {
        return outputThread;
    }

    public void setOutputThread(Thread outputThread) {
        this.outputThread = outputThread;
    }

    public Thread getErrorThread() {
        return errorThread;
    }

    public void setErrorThread(Thread errorThread) {
        this.errorThread = errorThread;
    }

    public ScheduledFuture<?> getTimeoutTask() {
        return timeoutTask;
    }

    public void setTimeoutTask(ScheduledFuture<?> timeoutTask) {
        this.timeoutTask = timeoutTask;
    }

    public void cleanup() {
        if (timeoutTask != null) {
            timeoutTask.cancel(true);
        }
        if (process != null) {
            process.destroyForcibly();
        }
        if (outputThread != null) {
            outputThread.interrupt();
        }
        if (errorThread != null) {
            errorThread.interrupt();
        }
        // Delete temp directory recursively
        if (tempDir != null && java.nio.file.Files.exists(tempDir)) {
            try (var stream = java.nio.file.Files.walk(tempDir)) {
                stream.sorted(java.util.Comparator.reverseOrder())
                      .map(Path::toFile)
                      .forEach(java.io.File::delete);
            } catch (Exception e) {
                System.err.println("[ExecutionSession] Warning: failed to clean up temp dir " + tempDir + ": " + e.getMessage());
            }
        }
    }
}
