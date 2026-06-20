package com.devcompiler.service;

import com.devcompiler.model.CompileResponse;
import com.devcompiler.util.StreamGobbler;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.concurrent.TimeUnit;

@Service
public class CppExecutionEngine implements ExecutionEngine {

    private static final int TIMEOUT_SECONDS = 30;
    private static final String DEFAULT_GPP = "g++";
    private static final String FALLBACK_GPP = "C:\\msys64\\ucrt64\\bin\\g++.exe";
    private static final String MSYS_BIN_DIR = "C:\\msys64\\ucrt64\\bin";

    private String resolvedGppCommand = DEFAULT_GPP;

    @Override
    public CompileResponse execute(String code, String input) {
        // 1. Probing for g++ toolchain
        if (!probeGppCompiler()) {
            return new CompileResponse(
                false,
                "",
                "G++ compiler not found.",
                "0ms"
            );
        }

        Path tempDir = null;
        Process compileProcess = null;
        Process runProcess = null;
        Thread outThread = null;
        Thread errThread = null;
        long startTime = System.currentTimeMillis();

        try {
            // 2. Create unique isolated temporary directory
            tempDir = Files.createTempDirectory("devcompiler-cpp-");

            // 3. Write C++ source code to main.cpp
            Path sourceFile = tempDir.resolve("main.cpp");
            Files.writeString(sourceFile, code, StandardCharsets.UTF_8);

            // 4. Compile: g++ main.cpp -o main.exe
            long compileStart = System.currentTimeMillis();
            ProcessBuilder compilePb = new ProcessBuilder(resolvedGppCommand, "main.cpp", "-o", "main.exe");
            compilePb.directory(tempDir.toFile());
            
            // Inject UCRT64 bin folder into compilation PATH environment variable (prevents g++ dll warnings)
            injectMsysPath(compilePb);
            
            compileProcess = compilePb.start();

            StreamGobbler compileErrorGobbler = new StreamGobbler(compileProcess.getErrorStream());
            StreamGobbler compileOutputGobbler = new StreamGobbler(compileProcess.getInputStream());
            Thread cErrThread = new Thread(compileErrorGobbler);
            Thread cOutThread = new Thread(compileOutputGobbler);
            cErrThread.start();
            cOutThread.start();

            boolean compileFinished = compileProcess.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            long compileElapsed = System.currentTimeMillis() - compileStart;

            if (!compileFinished) {
                compileProcess.destroyForcibly();
                return new CompileResponse(false, "", "Compilation Timeout: g++ compiler took longer than " + TIMEOUT_SECONDS + " seconds.", compileElapsed + "ms");
            }

            cErrThread.join(1000);
            cOutThread.join(1000);

            int compileExit = compileProcess.exitValue();
            if (compileExit != 0) {
                String errors = compileErrorGobbler.getResult();
                if (errors.isBlank()) {
                    errors = compileOutputGobbler.getResult();
                }
                return new CompileResponse(false, "", "Compilation Error:\n" + errors, compileElapsed + "ms");
            }

            // 5. Execute: main.exe
            Path binaryPath = tempDir.resolve("main.exe");
            ProcessBuilder runPb = new ProcessBuilder(binaryPath.toString());
            runPb.directory(tempDir.toFile());
            
            // Inject UCRT64 bin folder into execution PATH environment variable (so main.exe finds libstdc++-6.dll, etc.)
            injectMsysPath(runPb);

            runProcess = runPb.start();

            // Feed stdin to the process
            if (input != null && !input.isBlank()) {
                try (var os = runProcess.getOutputStream()) {
                    os.write(input.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }
            } else {
                runProcess.getOutputStream().close();
            }

            // Gobble stdout/stderr
            StreamGobbler outputGobbler = new StreamGobbler(runProcess.getInputStream());
            StreamGobbler errorGobbler = new StreamGobbler(runProcess.getErrorStream());

            outThread = new Thread(outputGobbler);
            errThread = new Thread(errorGobbler);
            outThread.start();
            errThread.start();

            boolean finished = runProcess.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            long elapsed = System.currentTimeMillis() - startTime;

            if (!finished) {
                runProcess.destroyForcibly();
                outThread.interrupt();
                errThread.interrupt();
                return new CompileResponse(false, outputGobbler.getResult(), "Time Limit Exceeded: Execution took longer than " + TIMEOUT_SECONDS + " seconds.", elapsed + "ms");
            }

            outThread.join(1000);
            errThread.join(1000);

            int exitCode = runProcess.exitValue();
            String stdout = outputGobbler.getResult();
            String stderr = errorGobbler.getResult();

            if (exitCode != 0) {
                String runtimeError = stderr.isBlank() ? "Runtime Error (exit code: " + exitCode + ")" : stderr;
                return new CompileResponse(false, stdout, runtimeError, elapsed + "ms");
            }

            return new CompileResponse(true, stdout, stderr, elapsed + "ms");

        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            long elapsed = System.currentTimeMillis() - startTime;
            return new CompileResponse(false, "", "Execution Exception: " + e.getMessage(), elapsed + "ms");
        } finally {
            if (compileProcess != null) {
                compileProcess.destroy();
            }
            if (runProcess != null) {
                runProcess.destroy();
            }
            // 6. Cleanup the temporary folder and its contents
            cleanupDirectory(tempDir);
        }
    }

    private boolean probeGppCompiler() {
        // Probe Option A: Check default global "g++" command
        try {
            Process testProcess = new ProcessBuilder(DEFAULT_GPP, "--version").start();
            testProcess.destroy();
            resolvedGppCommand = DEFAULT_GPP;
            return true;
        } catch (IOException e) {
            // Probe Option B: Check MSYS2 fallback path
            File fallbackFile = new File(FALLBACK_GPP);
            if (fallbackFile.exists()) {
                resolvedGppCommand = FALLBACK_GPP;
                return true;
            }
            return false;
        }
    }

    private void injectMsysPath(ProcessBuilder pb) {
        var env = pb.environment();
        // Resolve case-insensitive key on Windows (e.g. Path, PATH, path)
        String pathKey = env.keySet().stream()
                .filter(k -> k.equalsIgnoreCase("path"))
                .findFirst()
                .orElse("PATH");
        
        String currentPath = env.getOrDefault(pathKey, "");
        if (currentPath.isEmpty()) {
            env.put(pathKey, MSYS_BIN_DIR);
        } else if (!currentPath.contains(MSYS_BIN_DIR)) {
            env.put(pathKey, currentPath + ";" + MSYS_BIN_DIR);
        }
    }

    private void cleanupDirectory(Path tempDir) {
        if (tempDir == null || !Files.exists(tempDir)) {
            return;
        }
        try (var stream = Files.walk(tempDir)) {
            stream.sorted(Comparator.reverseOrder())
                  .map(Path::toFile)
                  .forEach(File::delete);
        } catch (IOException e) {
            System.err.println("Warning: Failed to clean up temp directory " + tempDir + ": " + e.getMessage());
        }
    }
}
