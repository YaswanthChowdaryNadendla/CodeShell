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
public class PythonExecutionEngine implements ExecutionEngine {

    private static final int TIMEOUT_SECONDS = 5;

    @Override
    public CompileResponse execute(String code, String input) {
        Path tempDir = null;
        Process process = null;
        Thread outThread = null;
        Thread errThread = null;
        long startTime = System.currentTimeMillis();

        try {
            // 1. Create a unique, isolated temporary directory for this request
            tempDir = Files.createTempDirectory("devcompiler-python-");

            // 2. Write Python source code to script.py
            Path sourceFile = tempDir.resolve("script.py");
            Files.writeString(sourceFile, code, StandardCharsets.UTF_8);

            // 3. Execute: python script.py
            ProcessBuilder pb = new ProcessBuilder("python", "script.py");
            pb.directory(tempDir.toFile());

            process = pb.start();

            // 4. Feed stdin to the process
            if (input != null && !input.isBlank()) {
                try (var os = process.getOutputStream()) {
                    os.write(input.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }
            } else {
                // Close stdin stream if no input is provided
                process.getOutputStream().close();
            }

            // 5. Asynchronous gobbling of stdout and stderr
            StreamGobbler outputGobbler = new StreamGobbler(process.getInputStream());
            StreamGobbler errorGobbler = new StreamGobbler(process.getErrorStream());

            outThread = new Thread(outputGobbler);
            errThread = new Thread(errorGobbler);
            outThread.start();
            errThread.start();

            // 6. Enforce 5 second execution timeout limit
            boolean finished = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            long elapsed = System.currentTimeMillis() - startTime;

            if (!finished) {
                process.destroyForcibly();
                outThread.interrupt();
                errThread.interrupt();
                return new CompileResponse(false, outputGobbler.getResult(), "Time Limit Exceeded: Execution took longer than " + TIMEOUT_SECONDS + " seconds.", elapsed + "ms");
            }

            outThread.join(1000);
            errThread.join(1000);

            int exitCode = process.exitValue();
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
            if (process != null) {
                process.destroy();
            }
            // 7. Cleanup the temporary folder and its contents
            cleanupDirectory(tempDir);
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
