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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class JavaExecutionEngine implements ExecutionEngine {

    private static final int TIMEOUT_SECONDS = 30;

    @Override
    public CompileResponse execute(String code, String input) {
        Path tempDir = null;
        try {
            // 1. Create a unique, isolated temporary directory for this request
            tempDir = Files.createTempDirectory("devcompiler-java-");

            // 2. Detect the class name from user code, default to "Main"
            String className = detectClassName(code);

            // 3. Strip package declarations (e.g. package com.example;) to run code flat
            String sanitizedCode = sanitizeCode(code);

            // 4. Write code to <ClassName>.java
            Path sourceFile = tempDir.resolve(className + ".java");
            Files.writeString(sourceFile, sanitizedCode, StandardCharsets.UTF_8);

            // 5. Compile: javac <ClassName>.java
            long startTime = System.currentTimeMillis();
            CompileResponse compileResult = compileJava(tempDir, className);
            
            // If compilation fails, return the errors immediately
            if (!compileResult.isSuccess()) {
                return compileResult;
            }

            // 6. Execute: java <ClassName>
            CompileResponse runResult = runJava(tempDir, className, input, startTime);
            return runResult;

        } catch (IOException e) {
            return new CompileResponse(false, "", "System IO Error: " + e.getMessage(), "0ms");
        } finally {
            // 7. Recursive cleanup of the temporary folder
            cleanupDirectory(tempDir);
        }
    }

    private String detectClassName(String code) {
        // Look for public class ClassName
        Pattern publicClassPattern = Pattern.compile("public\\s+class\\s+(\\w+)");
        Matcher publicMatcher = publicClassPattern.matcher(code);
        if (publicMatcher.find()) {
            return publicMatcher.group(1);
        }

        // Look for default class ClassName
        Pattern classPattern = Pattern.compile("class\\s+(\\w+)");
        Matcher matcher = classPattern.matcher(code);
        if (matcher.find()) {
            return matcher.group(1);
        }

        return "Main";
    }

    private String sanitizeCode(String code) {
        // Regex to match package statements
        return code.replaceAll("(?m)^\\s*package\\s+[^;]+;\\s*", "");
    }

    private CompileResponse compileJava(Path tempDir, String className) {
        Process process = null;
        try {
            // ProcessBuilder pb = new ProcessBuilder("javac", className + ".java");
            // ProcessBuilder pb = new ProcessBuilder("javac", "-version");
            ProcessBuilder pb = new ProcessBuilder("javac", className + ".java");
            pb.directory(tempDir.toFile());

            long start = System.currentTimeMillis();
            process = pb.start();

            StreamGobbler errorGobbler = new StreamGobbler(process.getErrorStream());
            StreamGobbler outputGobbler = new StreamGobbler(process.getInputStream());

            Thread errThread = new Thread(errorGobbler);
            Thread outThread = new Thread(outputGobbler);
            errThread.start();
            outThread.start();

            boolean finished = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            long elapsed = System.currentTimeMillis() - start;

            if (!finished) {
                process.destroyForcibly();
                return new CompileResponse(false, "", "Compilation Timeout: javac compiler took longer than " + TIMEOUT_SECONDS + " seconds.", elapsed + "ms");
            }

            errThread.join(1000);
            outThread.join(1000);

            int exitCode = process.exitValue();
            if (exitCode != 0) {
                String compilerErrors = errorGobbler.getResult();
                if (compilerErrors.isBlank()) {
                    compilerErrors = outputGobbler.getResult();
                }
                return new CompileResponse(false, "", "Compilation Error:\n" + compilerErrors, elapsed + "ms");
            }

            return new CompileResponse(true, "", "", "0ms");

        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            return new CompileResponse(false, "", "Compilation Exception: " + e.getMessage(), "0ms");
        } finally {
            if (process != null) {
                process.destroy();
            }
        }
    }

    private CompileResponse runJava(Path tempDir, String className, String input, long startTime) {
        Process process = null;
        Thread errThread = null;
        Thread outThread = null;
        try {
            // We use -cp . (classpath current directory) to execute compiled bytecode
            ProcessBuilder pb = new ProcessBuilder("java", "-cp", ".", className);
            pb.directory(tempDir.toFile());

            process = pb.start();

            // Feed stdin to the process
            if (input != null && !input.isBlank()) {
                try (var os = process.getOutputStream()) {
                    os.write(input.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }
            } else {
                // Close stdin stream if no custom input is provided
                process.getOutputStream().close();
            }

            // Start draining output streams
            StreamGobbler outputGobbler = new StreamGobbler(process.getInputStream());
            StreamGobbler errorGobbler = new StreamGobbler(process.getErrorStream());

            outThread = new Thread(outputGobbler);
            errThread = new Thread(errorGobbler);
            outThread.start();
            errThread.start();

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
            Thread.currentThread().interrupt();
            long elapsed = System.currentTimeMillis() - startTime;
            return new CompileResponse(false, "", "Execution Exception: " + e.getMessage(), elapsed + "ms");
        } finally {
            if (process != null) {
                process.destroy();
            }
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
