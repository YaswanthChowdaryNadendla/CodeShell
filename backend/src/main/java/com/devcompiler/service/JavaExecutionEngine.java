// ─── Legacy implementation (kept for reference) ──────────────────────────────
// package com.devcompiler.service;
// import com.devcompiler.model.CompileResponse;
// import com.devcompiler.util.StreamGobbler;
// import org.springframework.stereotype.Service;
// import java.io.File;
// import java.io.IOException;
// import java.nio.charset.StandardCharsets;
// import java.nio.file.Files;
// import java.nio.file.Path;
// import java.util.Comparator;
// import java.util.concurrent.TimeUnit;
// import java.util.regex.Matcher;
// import java.util.regex.Pattern;
//
// @Service
// public class JavaExecutionEngine implements ExecutionEngine {
//
//     private static final int TIMEOUT_SECONDS = 30;
//
//     @Override
//     public CompileResponse execute(String code, String input) {
//         Path tempDir = null;
//         try {
//             tempDir = Files.createTempDirectory("devcompiler-java-");
//             String className = detectClassName(code);
//             String sanitizedCode = sanitizeCode(code);
//             Path sourceFile = tempDir.resolve(className + ".java");
//             Files.writeString(sourceFile, sanitizedCode, StandardCharsets.UTF_8);
//             long startTime = System.currentTimeMillis();
//             CompileResponse compileResult = compileJava(tempDir, className);
//             if (!compileResult.isSuccess()) { return compileResult; }
//             return runJava(tempDir, className, input, startTime);
//         } catch (IOException e) {
//             return new CompileResponse(false, "", "System IO Error: " + e.getMessage(), "0ms");
//         } finally {
//             cleanupDirectory(tempDir);
//         }
//     }
// }
// ─────────────────────────────────────────────────────────────────────────────

package com.devcompiler.service;

import com.devcompiler.model.CompileResponse;
import com.devcompiler.util.StreamGobbler;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class JavaExecutionEngine implements ExecutionEngine {

    // ─── Timeouts ────────────────────────────────────────────────────────────
    private static final int COMPILE_TIMEOUT   = 10;
    private static final int RUN_TIMEOUT       = 5;

    // ─── Compilation Cache ───────────────────────────────────────────────────
    private static final int  MAX_CACHE_ENTRIES = 200;
    private static final Path CACHE_DIR =
            Paths.get(System.getProperty("java.io.tmpdir"), "devcompiler-cache");

    /**
     * LRU map: SHA-256(sanitizedCode) → cache sub-directory containing .class files.
     * Bounded at MAX_CACHE_ENTRIES; eviction deletes files from disk.
     */
    @SuppressWarnings("serial")
    private final Map<String, Path> compilationCache =
            new LinkedHashMap<String, Path>(MAX_CACHE_ENTRIES, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Path> eldest) {
                    if (size() > MAX_CACHE_ENTRIES) {
                        cleanupDirectory(eldest.getValue());
                        return true;
                    }
                    return false;
                }
            };

    // ─── Cache Statistics ─────────────────────────────────────────────────────
    private final AtomicLong cacheHits   = new AtomicLong(0);
    private final AtomicLong cacheMisses = new AtomicLong(0);

    // ─── Initialiser ─────────────────────────────────────────────────────────
    public JavaExecutionEngine() {
        try {
            Files.createDirectories(CACHE_DIR);
            System.out.println("[JavaEngine] Cache directory initialised: " + CACHE_DIR);
        } catch (IOException e) {
            System.err.println("[JavaEngine] WARNING: Could not create cache dir: " + e.getMessage());
        }
    }

    // ─── Entry Point ─────────────────────────────────────────────────────────
    @Override
    public CompileResponse execute(String code, String input) {
        long totalStart = System.currentTimeMillis();
        Path tempDir    = null;

        try {
            // ── Detect class name & sanitise code ────────────────────────────
            String className     = detectClassName(code);
            String sanitizedCode = sanitizeCode(code);
            String codeHash      = sha256(sanitizedCode);

            // ── Stage 1: Create isolated temp directory + write source ────────
            long fsStart = System.currentTimeMillis();
            tempDir = Files.createTempDirectory("devcompiler-java-");
            Path sourceFile = tempDir.resolve(className + ".java");
            Files.writeString(sourceFile, sanitizedCode, StandardCharsets.UTF_8);
            long fileCreateMs = System.currentTimeMillis() - fsStart;

            // ── Stage 2: Compile or restore from cache ────────────────────────
            long    compileMs;
            boolean cacheHit;

            synchronized (compilationCache) {
                cacheHit = compilationCache.containsKey(codeHash);
            }

            if (cacheHit) {
                // CACHE HIT — copy .class files from cache into the run temp dir
                long restoreStart = System.currentTimeMillis();
                Path cachedDir;
                synchronized (compilationCache) {
                    cachedDir = compilationCache.get(codeHash);
                }
                copyCachedClasses(cachedDir, tempDir);
                compileMs = System.currentTimeMillis() - restoreStart;
                cacheHits.incrementAndGet();

            } else {
                // CACHE MISS — invoke javac
                long compileStart = System.currentTimeMillis();
                CompileResponse compileResult = compileJava(tempDir, className);
                compileMs = System.currentTimeMillis() - compileStart;
                cacheMisses.incrementAndGet();

                if (!compileResult.isSuccess()) {
                    // Compilation error — return immediately with partial metrics
                    long totalMs = System.currentTimeMillis() - totalStart;
                    return buildResponse(false, "", compileResult.getError(),
                            compileMs + "ms",
                            fileCreateMs, compileMs, 0L, 0L, totalMs, false);
                }

                // Cache the freshly compiled .class files for future requests
                storeCachedClasses(codeHash, tempDir);
            }

            // ── Stage 3: Execute ──────────────────────────────────────────────
            long runStart = System.currentTimeMillis();
            CompileResponse runResult = runJava(tempDir, className, input, runStart);
            long execMs = System.currentTimeMillis() - runStart;

            // ── Stage 4: Cleanup ──────────────────────────────────────────────
            long cleanupStart = System.currentTimeMillis();
            cleanupDirectory(tempDir);
            tempDir = null; // prevent double-cleanup in finally
            long cleanupMs = System.currentTimeMillis() - cleanupStart;

            // ── Total ─────────────────────────────────────────────────────────
            long totalMs = System.currentTimeMillis() - totalStart;

            printMetrics(fileCreateMs, compileMs, execMs, cleanupMs, totalMs, cacheHit);

            return buildResponse(
                    runResult.isSuccess(),
                    runResult.getOutput(),
                    runResult.getError(),
                    execMs + "ms",
                    fileCreateMs, compileMs, execMs, cleanupMs, totalMs, cacheHit
            );

        } catch (IOException e) {
            long totalMs = System.currentTimeMillis() - totalStart;
            return new CompileResponse(false, "",
                    "System IO Error: " + e.getMessage(), totalMs + "ms");
        } finally {
            if (tempDir != null) {
                cleanupDirectory(tempDir);
            }
        }
    }

    // ─── SHA-256 Hash ─────────────────────────────────────────────────────────
    private String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed by the Java spec — this branch is unreachable
            throw new RuntimeException("SHA-256 unavailable", e);
        }
    }

    // ─── Cache: Store ─────────────────────────────────────────────────────────
    private void storeCachedClasses(String hash, Path compiledDir) {
        try {
            Path cacheEntry = CACHE_DIR.resolve(hash);
            Files.createDirectories(cacheEntry);
            try (var stream = Files.list(compiledDir)) {
                stream.filter(p -> p.toString().endsWith(".class"))
                      .forEach(classFile -> {
                          try {
                              Files.copy(classFile,
                                      cacheEntry.resolve(classFile.getFileName()),
                                      StandardCopyOption.REPLACE_EXISTING);
                          } catch (IOException e) {
                              System.err.println("[JavaEngine] Cache store warn: " + e.getMessage());
                          }
                      });
            }
            synchronized (compilationCache) {
                compilationCache.put(hash, cacheEntry);
            }
        } catch (IOException e) {
            System.err.println("[JavaEngine] Cache store failed: " + e.getMessage());
        }
    }

    // ─── Cache: Restore ───────────────────────────────────────────────────────
    private void copyCachedClasses(Path cachedDir, Path targetDir) {
        try (var stream = Files.list(cachedDir)) {
            stream.filter(p -> p.toString().endsWith(".class"))
                  .forEach(classFile -> {
                      try {
                          Files.copy(classFile,
                                  targetDir.resolve(classFile.getFileName()),
                                  StandardCopyOption.REPLACE_EXISTING);
                      } catch (IOException e) {
                          System.err.println("[JavaEngine] Cache restore warn: " + e.getMessage());
                      }
                  });
        } catch (IOException e) {
            System.err.println("[JavaEngine] Cache restore failed: " + e.getMessage());
        }
    }

    // ─── Class Name Detection ─────────────────────────────────────────────────
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

    // ─── Code Sanitiser ───────────────────────────────────────────────────────
    private String sanitizeCode(String code) {
        return code.replaceAll("(?m)^\\s*package\\s+[^;]+;\\s*", "");
    }

    // ─── Compilation ──────────────────────────────────────────────────────────
    private CompileResponse compileJava(Path tempDir, String className) {
        Process process = null;
        try {
            ProcessBuilder pb = new ProcessBuilder("javac", className + ".java");
            pb.directory(tempDir.toFile());
            process = pb.start();

            StreamGobbler errorGobbler  = new StreamGobbler(process.getErrorStream());
            StreamGobbler outputGobbler = new StreamGobbler(process.getInputStream());
            Thread errThread = new Thread(errorGobbler);
            Thread outThread = new Thread(outputGobbler);
            errThread.start();
            outThread.start();

            boolean finished = process.waitFor(COMPILE_TIMEOUT, TimeUnit.SECONDS);

            if (!finished) {
                process.destroyForcibly();
                return new CompileResponse(false, "",
                        "Compilation Timeout: javac took longer than " + COMPILE_TIMEOUT + "s.",
                        "0ms");
            }

            errThread.join(1000);
            outThread.join(1000);

            int exitCode = process.exitValue();
            if (exitCode != 0) {
                String errors = errorGobbler.getResult();
                if (errors.isBlank()) errors = outputGobbler.getResult();
                return new CompileResponse(false, "", "Compilation Error:\n" + errors, "0ms");
            }

            return new CompileResponse(true, "", "", "0ms");

        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            return new CompileResponse(false, "",
                    "Compilation Exception: " + e.getMessage(), "0ms");
        } finally {
            if (process != null) process.destroy();
        }
    }

    // ─── Execution ────────────────────────────────────────────────────────────
    private CompileResponse runJava(Path tempDir, String className, String input, long startTime) {
        Process process  = null;
        Thread errThread = null;
        Thread outThread = null;
        try {
            // Optimised JVM flags for fast startup on low-resource / cloud environments:
            //   TieredStopAtLevel=1 — interpreter-only mode; skip C1/C2 JIT compilation
            //   Xverify:none        — skip bytecode verification (trusted javac output)
            ProcessBuilder pb = new ProcessBuilder(
                    "java",
                    "-XX:+TieredCompilation",
                    "-XX:TieredStopAtLevel=1",
                    "-Xverify:none",
                    "-cp", ".",
                    className
            );
            pb.directory(tempDir.toFile());
            process = pb.start();

            // Feed stdin
            if (input != null && !input.isBlank()) {
                try (var os = process.getOutputStream()) {
                    os.write(input.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }
            } else {
                process.getOutputStream().close();
            }

            // Drain stdout / stderr concurrently
            StreamGobbler outputGobbler = new StreamGobbler(process.getInputStream());
            StreamGobbler errorGobbler  = new StreamGobbler(process.getErrorStream());
            outThread = new Thread(outputGobbler);
            errThread = new Thread(errorGobbler);
            outThread.start();
            errThread.start();

            boolean finished = process.waitFor(RUN_TIMEOUT, TimeUnit.SECONDS);
            long elapsed = System.currentTimeMillis() - startTime;

            if (!finished) {
                process.destroyForcibly();
                outThread.interrupt();
                errThread.interrupt();
                return new CompileResponse(false, outputGobbler.getResult(),
                        "Time Limit Exceeded: execution took longer than " + RUN_TIMEOUT + "s.",
                        elapsed + "ms");
            }

            outThread.join(1000);
            errThread.join(1000);

            int    exitCode = process.exitValue();
            String stdout   = outputGobbler.getResult();
            String stderr   = errorGobbler.getResult();

            if (exitCode != 0) {
                String err = stderr.isBlank()
                        ? "Runtime Error (exit code: " + exitCode + ")"
                        : stderr;
                return new CompileResponse(false, stdout, err, elapsed + "ms");
            }

            return new CompileResponse(true, stdout, stderr, elapsed + "ms");

        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            long elapsed = System.currentTimeMillis() - startTime;
            return new CompileResponse(false, "",
                    "Execution Exception: " + e.getMessage(), elapsed + "ms");
        } finally {
            if (process != null) process.destroy();
        }
    }

    // ─── Response Builder ─────────────────────────────────────────────────────
    private CompileResponse buildResponse(
            boolean success, String output, String error, String execTime,
            long fileCreateMs, long compileMs, long execMs,
            long cleanupMs, long totalMs, boolean cacheHit) {

        String compileLabel = cacheHit ? "0ms (cached)" : compileMs + "ms";

        Map<String, String> metrics = new java.util.LinkedHashMap<>();
        metrics.put("fileCreateTime", fileCreateMs + "ms");
        metrics.put("compileTime",    compileLabel);
        metrics.put("executionTime",  execMs + "ms");
        metrics.put("cleanupTime",    cleanupMs + "ms");
        metrics.put("totalTime",      totalMs + "ms");
        metrics.put("cacheHit",       String.valueOf(cacheHit));
        metrics.put("cacheHits",      String.valueOf(cacheHits.get()));
        metrics.put("cacheMisses",    String.valueOf(cacheMisses.get()));

        return new CompileResponse(success, output, error, execTime, metrics);
    }

    // ─── Metrics Logger ───────────────────────────────────────────────────────
    private void printMetrics(long fileCreateMs, long compileMs,
                               long execMs, long cleanupMs,
                               long totalMs, boolean cacheHit) {
        System.out.printf("[JavaEngine] File Create  : %dms%n", fileCreateMs);
        if (cacheHit) {
            System.out.println("[JavaEngine] Compile Time : 0ms (CACHE HIT — skipped javac)");
        } else {
            System.out.printf("[JavaEngine] Compile Time : %dms%n", compileMs);
        }
        System.out.printf("[JavaEngine] Execution    : %dms%n", execMs);
        System.out.printf("[JavaEngine] Cleanup      : %dms%n", cleanupMs);
        System.out.printf("[JavaEngine] Total        : %dms%n", totalMs);
        System.out.printf("[JavaEngine] Cache        : hits=%d  misses=%d%n",
                cacheHits.get(), cacheMisses.get());
    }

    // ─── Directory Cleanup ────────────────────────────────────────────────────
    private void cleanupDirectory(Path dir) {
        if (dir == null || !Files.exists(dir)) return;
        try (var stream = Files.walk(dir)) {
            stream.sorted(Comparator.reverseOrder())
                  .map(Path::toFile)
                  .forEach(File::delete);
        } catch (IOException e) {
            System.err.println("[JavaEngine] Cleanup warn: " + e.getMessage());
        }
    }
}
