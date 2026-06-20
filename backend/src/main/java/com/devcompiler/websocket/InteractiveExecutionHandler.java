package com.devcompiler.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class InteractiveExecutionHandler extends TextWebSocketHandler {

    private final ConcurrentHashMap<String, ExecutionSession> sessions = new ConcurrentHashMap<>();
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final int TIMEOUT_SECONDS = 30;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        // Connection established, wait for "run" message
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        try {
            Map<String, Object> payload = objectMapper.readValue(message.getPayload(), Map.class);
            String type = (String) payload.get("type");

            if ("run".equalsIgnoreCase(type)) {
                handleRun(session, payload);
            } else if ("input".equalsIgnoreCase(type)) {
                handleInput(session, payload);
            } else if ("kill".equalsIgnoreCase(type)) {
                handleKill(session);
            }
        } catch (Exception e) {
            sendJsonMessage(session, Map.of(
                "type", "error",
                "data", "Invalid message format: " + e.getMessage()
            ));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        ExecutionSession executionSession = sessions.remove(session.getId());
        if (executionSession != null) {
            executionSession.cleanup();
        }
    }

    private void handleRun(WebSocketSession wsSession, Map<String, Object> payload) {
        System.out.println("[WS] Run Request Received");
        // Clean up any existing execution on this socket
        ExecutionSession oldSession = sessions.remove(wsSession.getId());
        if (oldSession != null) {
            oldSession.cleanup();
        }

        String language = (String) payload.get("language");
        String code = (String) payload.get("code");
        String preloadedInput = (String) payload.get("preloadedInput");

        if (language == null || code == null) {
            sendJsonMessage(wsSession, Map.of("type", "error", "data", "Language and code are required."));
            return;
        }

        try {
            Path tempDir = Files.createTempDirectory("devcompiler-ws-");
            ExecutionSession session = new ExecutionSession(wsSession.getId(), language, tempDir);
            sessions.put(wsSession.getId(), session);

            executorService.submit(() -> executeProcess(wsSession, session, code, preloadedInput));

        } catch (IOException e) {
            sendJsonMessage(wsSession, Map.of("type", "error", "data", "Failed to create environment: " + e.getMessage()));
        }
    }

    private void handleInput(WebSocketSession wsSession, Map<String, Object> payload) {
        ExecutionSession session = sessions.get(wsSession.getId());
        if (session == null || session.getProcess() == null || !session.getProcess().isAlive()) {
            sendJsonMessage(wsSession, Map.of("type", "error", "data", "No active execution process to receive input."));
            return;
        }

        String data = (String) payload.get("data");
        if (data != null) {
            System.out.println("[WS] Input Received: " + data.trim());
            try {
                OutputStream os = session.getStdinStream();
                if (os != null) {
                    System.out.println("[WS] Writing To Process Stdin");
                    os.write(data.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }
            } catch (IOException e) {
                sendJsonMessage(wsSession, Map.of("type", "error", "data", "Failed to write to stdin: " + e.getMessage()));
            }
        }
    }

    private void handleKill(WebSocketSession wsSession) {
        ExecutionSession session = sessions.remove(wsSession.getId());
        if (session != null) {
            session.cleanup();
            sendJsonMessage(wsSession, Map.of("type", "exit", "code", -1, "executionTime", "0ms"));
        } else {
            sendJsonMessage(wsSession, Map.of("type", "error", "data", "No active execution to kill."));
        }
    }

    private void executeProcess(WebSocketSession wsSession, ExecutionSession session, String code, String preloadedInput) {
        Process process = null;
        try {
            String language = session.getLanguage().toLowerCase().trim();
            Path tempDir = session.getTempDir();
            ProcessBuilder pb = null;

            if ("java".equals(language)) {
                sendJsonMessage(wsSession, Map.of("type", "system", "data", "Compiling Java code...\n"));
                String className = detectClassName(code);
                String sanitizedCode = code.replaceAll("(?m)^\\s*package\\s+[^;]+;\\s*", "");
                Path sourceFile = tempDir.resolve(className + ".java");
                Files.writeString(sourceFile, sanitizedCode, StandardCharsets.UTF_8);

                // Compile
                ProcessBuilder compilePb = new ProcessBuilder("javac", className + ".java");
                compilePb.directory(tempDir.toFile());
                Process compileProcess = compilePb.start();

                // Gobble compile error
                try (var compileErrReader = new InputStreamReader(compileProcess.getErrorStream(), StandardCharsets.UTF_8);
                     var compileOutReader = new InputStreamReader(compileProcess.getInputStream(), StandardCharsets.UTF_8)) {
                    
                    StringBuilder compileErr = new StringBuilder();
                    char[] buffer = new char[512];
                    int read;
                    while ((read = compileErrReader.read(buffer)) != -1) {
                        compileErr.append(buffer, 0, read);
                    }
                    while ((read = compileOutReader.read(buffer)) != -1) {
                        compileErr.append(buffer, 0, read);
                    }

                    boolean compileFinished = compileProcess.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
                    if (!compileFinished || compileProcess.exitValue() != 0) {
                        sendJsonMessage(wsSession, Map.of(
                            "type", "system",
                            "data", "Compilation Error:\n" + (compileErr.toString().isEmpty() ? "Compilation timed out or exited with error." : compileErr.toString())
                        ));
                        sendJsonMessage(wsSession, Map.of("type", "exit", "code", 1, "executionTime", "0ms"));
                        session.cleanup();
                        sessions.remove(wsSession.getId());
                        return;
                    }
                }

                sendJsonMessage(wsSession, Map.of("type", "system", "data", "compilation_success"));

                pb = new ProcessBuilder("java", "-XX:+TieredCompilation", "-XX:TieredStopAtLevel=1", "-cp", ".", className);

            } else if ("python".equals(language)) {
                Path sourceFile = tempDir.resolve("script.py");
                Files.writeString(sourceFile, code, StandardCharsets.UTF_8);
                String pythonCmd = resolvePython();
                pb = new ProcessBuilder(pythonCmd, "script.py");

            } else if ("javascript".equals(language)) {
                Path sourceFile = tempDir.resolve("script.js");
                Files.writeString(sourceFile, code, StandardCharsets.UTF_8);
                pb = new ProcessBuilder("node", "script.js");

            } else if ("cpp".equals(language)) {
                sendJsonMessage(wsSession, Map.of("type", "system", "data", "Compiling C++ code...\n"));
                String gppCmd = resolveGpp();
                if (gppCmd == null) {
                    sendJsonMessage(wsSession, Map.of("type", "system", "data", "Compilation Error:\ng++ compiler not found in the environment."));
                    sendJsonMessage(wsSession, Map.of("type", "exit", "code", 1, "executionTime", "0ms"));
                    session.cleanup();
                    sessions.remove(wsSession.getId());
                    return;
                }

                Path sourceFile = tempDir.resolve("main.cpp");
                Files.writeString(sourceFile, code, StandardCharsets.UTF_8);

                // Compile
                ProcessBuilder compilePb = new ProcessBuilder(gppCmd, "main.cpp", "-o", "main.exe");
                compilePb.directory(tempDir.toFile());
                injectMsysPath(compilePb);

                Process compileProcess = compilePb.start();

                // Gobble compile error
                try (var compileErrReader = new InputStreamReader(compileProcess.getErrorStream(), StandardCharsets.UTF_8);
                     var compileOutReader = new InputStreamReader(compileProcess.getInputStream(), StandardCharsets.UTF_8)) {
                    
                    StringBuilder compileErr = new StringBuilder();
                    char[] buffer = new char[512];
                    int read;
                    while ((read = compileErrReader.read(buffer)) != -1) {
                        compileErr.append(buffer, 0, read);
                    }
                    while ((read = compileOutReader.read(buffer)) != -1) {
                        compileErr.append(buffer, 0, read);
                    }

                    boolean compileFinished = compileProcess.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
                    if (!compileFinished || compileProcess.exitValue() != 0) {
                        sendJsonMessage(wsSession, Map.of(
                            "type", "system",
                            "data", "Compilation Error:\n" + (compileErr.toString().isEmpty() ? "Compilation timed out or exited with error." : compileErr.toString())
                        ));
                        sendJsonMessage(wsSession, Map.of("type", "exit", "code", 1, "executionTime", "0ms"));
                        session.cleanup();
                        sessions.remove(wsSession.getId());
                        return;
                    }
                }

                sendJsonMessage(wsSession, Map.of("type", "system", "data", "compilation_success"));

                Path binaryPath = tempDir.resolve("main.exe");
                pb = new ProcessBuilder(binaryPath.toString());
                injectMsysPath(pb);

            } else {
                sendJsonMessage(wsSession, Map.of("type", "error", "data", "Unsupported language '" + language + "'."));
                session.cleanup();
                sessions.remove(wsSession.getId());
                return;
            }

            pb.directory(tempDir.toFile());
            final Process activeProcess = pb.start();
            process = activeProcess;
            session.setProcess(activeProcess);
            session.setStdinStream(activeProcess.getOutputStream());

            // Feed preloaded input if available
            if (preloadedInput != null && !preloadedInput.trim().isEmpty()) {
                System.out.println("[WS] Writing Preloaded Input: " + preloadedInput.trim());
                OutputStream os = activeProcess.getOutputStream();
                os.write(preloadedInput.getBytes(StandardCharsets.UTF_8));
                os.flush();
            }

            // Stream stdout
            Thread outputThread = new Thread(() -> {
                try (var reader = new InputStreamReader(activeProcess.getInputStream(), StandardCharsets.UTF_8)) {
                    char[] buffer = new char[256];
                    int read;
                    while ((read = reader.read(buffer)) != -1) {
                        String chunk = new String(buffer, 0, read);
                        System.out.print("[WS] Output Chunk: " + chunk);
                        sendJsonMessage(wsSession, Map.of("type", "output", "data", chunk));
                    }
                } catch (IOException e) {
                    // process closed or connection lost
                }
            });

            // Stream stderr
            Thread errorThread = new Thread(() -> {
                try (var reader = new InputStreamReader(activeProcess.getErrorStream(), StandardCharsets.UTF_8)) {
                    char[] buffer = new char[256];
                    int read;
                    while ((read = reader.read(buffer)) != -1) {
                        String chunk = new String(buffer, 0, read);
                        System.out.print("[WS] Output Chunk: " + chunk);
                        sendJsonMessage(wsSession, Map.of("type", "error", "data", chunk));
                    }
                } catch (IOException e) {
                    // process closed or connection lost
                }
            });

            session.setOutputThread(outputThread);
            session.setErrorThread(errorThread);
            outputThread.start();
            errorThread.start();

            // Set timeout
            ScheduledFuture<?> timeoutTask = scheduler.schedule(() -> {
                sendJsonMessage(wsSession, Map.of(
                    "type", "error",
                    "data", "\nTime Limit Exceeded: execution took longer than " + TIMEOUT_SECONDS + "s.\n"
                ));
                session.cleanup();
                sessions.remove(wsSession.getId());
            }, TIMEOUT_SECONDS, TimeUnit.SECONDS);
            session.setTimeoutTask(timeoutTask);

            // Wait for exit
            int exitCode = process.waitFor();
            long elapsed = System.currentTimeMillis() - session.getStartTime();

            // Cancel timeout task
            if (session.getTimeoutTask() != null) {
                session.getTimeoutTask().cancel(true);
            }

            // Let streamer threads finish reading remaining buffer
            outputThread.join(500);
            errorThread.join(500);

            if (sessions.containsKey(wsSession.getId())) {
                sendJsonMessage(wsSession, Map.of(
                    "type", "exit",
                    "code", exitCode,
                    "executionTime", elapsed + "ms"
                ));
                session.cleanup();
                sessions.remove(wsSession.getId());
            }

        } catch (Exception e) {
            sendJsonMessage(wsSession, Map.of("type", "error", "data", "Execution error: " + e.getMessage()));
            session.cleanup();
            sessions.remove(wsSession.getId());
        }
    }

    private void sendJsonMessage(WebSocketSession wsSession, Map<String, Object> data) {
        synchronized (wsSession) {
            if (wsSession.isOpen()) {
                try {
                    wsSession.sendMessage(new TextMessage(objectMapper.writeValueAsString(data)));
                } catch (IOException e) {
                    System.err.println("[InteractiveExecutionHandler] WebSocket message failed: " + e.getMessage());
                }
            }
        }
    }

    private String detectClassName(String code) {
        Pattern publicClassPattern = Pattern.compile("public\\s+class\\s+(\\w+)");
        Matcher publicMatcher = publicClassPattern.matcher(code);
        if (publicMatcher.find()) {
            return publicMatcher.group(1);
        }
        Pattern classPattern = Pattern.compile("class\\s+(\\w+)");
        Matcher matcher = classPattern.matcher(code);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "Main";
    }

    private String resolveGpp() {
        try {
            Process testProcess = new ProcessBuilder("g++", "--version").start();
            testProcess.destroy();
            return "g++";
        } catch (IOException e) {
            File fallbackFile = new File("C:\\msys64\\ucrt64\\bin\\g++.exe");
            if (fallbackFile.exists()) {
                return "C:\\msys64\\ucrt64\\bin\\g++.exe";
            }
            return null;
        }
    }

    private String resolvePython() {
        String[] commands = {"python3", "python", "py"};
        for (String cmd : commands) {
            try {
                Process process = new ProcessBuilder(cmd, "--version").start();
                boolean finished = process.waitFor(2, TimeUnit.SECONDS);
                if (finished && process.exitValue() == 0) {
                    process.destroy();
                    return cmd;
                }
                process.destroy();
            } catch (Exception e) {
                // Ignore and try next
            }
        }
        return "python";
    }

    private void injectMsysPath(ProcessBuilder pb) {
        var env = pb.environment();
        String pathKey = env.keySet().stream()
                .filter(k -> k.equalsIgnoreCase("path"))
                .findFirst()
                .orElse("PATH");

        String currentPath = env.getOrDefault(pathKey, "");
        String msysBinDir = "C:\\msys64\\ucrt64\\bin";
        if (currentPath.isEmpty()) {
            env.put(pathKey, msysBinDir);
        } else if (!currentPath.contains(msysBinDir)) {
            env.put(pathKey, currentPath + ";" + msysBinDir);
        }
    }
}
