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
    private static final int COMPILE_TIMEOUT = 10;
    private static final int RUN_TIMEOUT     = 5;

    // ─── Compilation Cache ───────────────────────────────────────────────────
    private static final int  MAX_CACHE_ENTRIES = 200;
    private static final Path CACHE_DIR =
            Paths.get(System.getProperty("java.io.tmpdir"), "devcompiler-cache");

    /**
     * LRU map: SHA-256(sanitizedCode) → cache sub-directory containing .class files.
     * Bounded at MAX_CACHE_ENTRIES; eviction deletes files from disk automatically.
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

        // ── [PERF] Total Request timer starts here ────────────────────────────
        long totalStart = System.currentTimeMillis();
        Path tempDir    = null;
        Process process = null;

        try {
            // Sanitise & hash (negligible overhead, not separately timed)
            String className     = detectClassName(code);
            String sanitizedCode = sanitizeCode(code);
            String codeHash      = sha256(sanitizedCode);

            // ── [PERF] Stage 1: Temp Directory Creation ───────────────────────
            long t0 = System.currentTimeMillis();
            tempDir = Files.createTempDirectory("devcompiler-java-");
            long tempDirMs = System.currentTimeMillis() - t0;

            // ── [PERF] Stage 2: Source File Write ─────────────────────────────
            long t1 = System.currentTimeMillis();
            Path sourceFile = tempDir.resolve(className + ".java");
            Files.writeString(sourceFile, sanitizedCode, StandardCharsets.UTF_8);
            long sourceWriteMs = System.currentTimeMillis() - t1;

            // ── [PERF] Stage 3: Compilation (or cache restore) ────────────────
            boolean cacheHit;
            long    compileMs;

            synchronized (compilationCache) {
                cacheHit = compilationCache.containsKey(codeHash);
            }

            long t2 = System.currentTimeMillis();

            if (cacheHit) {
                // CACHE HIT — copy .class files from persistent cache into run temp dir
                Path cachedDir;
                synchronized (compilationCache) {
                    cachedDir = compilationCache.get(codeHash);
                }
                copyCachedClasses(cachedDir, tempDir);
                cacheHits.incrementAndGet();

            } else {
                // CACHE MISS — invoke javac
                CompileResponse compileResult = compileJava(tempDir, className);
                cacheMisses.incrementAndGet();

                if (!compileResult.isSuccess()) {
                    compileMs = System.currentTimeMillis() - t2;
                    long totalMs = System.currentTimeMillis() - totalStart;
                    printPerfLog(tempDirMs, sourceWriteMs, compileMs, 0, 0, 0, totalMs, false);
                    return buildResponse(false, "", compileResult.getError(),
                            compileMs + "ms",
                            tempDirMs, sourceWriteMs, compileMs, 0, 0, 0, totalMs, false);
                }

                // Store compiled .class files in the persistent cache
                storeCachedClasses(codeHash, tempDir);
            }

            compileMs = System.currentTimeMillis() - t2;

            // ── [PERF] Stage 4: JVM Startup (OS process fork overhead) ────────
            // This measures the wall-clock time for the OS to create the JVM process.
            // Actual JVM class-loading and main() invocation are measured in Stage 5.
            ProcessBuilder pb = new ProcessBuilder(
                    "java",
                    "-XX:+TieredCompilation",   // enable tiered compilation infrastructure
                    "-XX:TieredStopAtLevel=1",  // stop at interpreter; skip C1/C2 JIT
                    "-Xverify:none",            // skip bytecode verification (trusted javac output)
                    "-cp", ".",
                    className
            );
            pb.directory(tempDir.toFile());

            long t3 = System.currentTimeMillis();
            process = pb.start();
            long jvmStartMs = System.currentTimeMillis() - t3;

            // Feed stdin immediately after process starts
            if (input != null && !input.isBlank()) {
                try (var os = process.getOutputStream()) {
                    os.write(input.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }
            } else {
                process.getOutputStream().close();
            }

            // Drain stdout / stderr concurrently to prevent blocking
            StreamGobbler outputGobbler = new StreamGobbler(process.getInputStream());
            StreamGobbler errorGobbler  = new StreamGobbler(process.getErrorStream());
            Thread outThread = new Thread(outputGobbler);
            Thread errThread = new Thread(errorGobbler);
            outThread.start();
            errThread.start();

            // ── [PERF] Stage 5: Execution (JVM class-loading + program run) ───
            // This is the dominant cost for short programs on cold JVM instances.
            long t4 = System.currentTimeMillis();
            boolean finished = process.waitFor(RUN_TIMEOUT, TimeUnit.SECONDS);
            long execMs = System.currentTimeMillis() - t4;

            if (!finished) {
                process.destroyForcibly();
                outThread.interrupt();
                errThread.interrupt();
                long totalMs = System.currentTimeMillis() - totalStart;
                printPerfLog(tempDirMs, sourceWriteMs, compileMs, jvmStartMs, execMs, 0, totalMs, cacheHit);
                return buildResponse(false, outputGobbler.getResult(),
                        "Time Limit Exceeded: execution took longer than " + RUN_TIMEOUT + "s.",
                        execMs + "ms",
                        tempDirMs, sourceWriteMs, compileMs, jvmStartMs, execMs, 0, totalMs, cacheHit);
            }

            outThread.join(1000);
            errThread.join(1000);

            int    exitCode = process.exitValue();
            String stdout   = outputGobbler.getResult();
            String stderr   = errorGobbler.getResult();

            // ── [PERF] Stage 6: Cleanup ───────────────────────────────────────
            long t5 = System.currentTimeMillis();
            cleanupDirectory(tempDir);
            tempDir = null; // prevent double-cleanup in finally
            long cleanupMs = System.currentTimeMillis() - t5;

            // ── [PERF] Total Request ──────────────────────────────────────────
            long totalMs = System.currentTimeMillis() - totalStart;

            printPerfLog(tempDirMs, sourceWriteMs, compileMs, jvmStartMs, execMs, cleanupMs, totalMs, cacheHit);

            if (exitCode != 0) {
                String err = stderr.isBlank()
                        ? "Runtime Error (exit code: " + exitCode + ")"
                        : stderr;
                return buildResponse(false, stdout, err, execMs + "ms",
                        tempDirMs, sourceWriteMs, compileMs, jvmStartMs, execMs, cleanupMs, totalMs, cacheHit);
            }

            return buildResponse(true, stdout, stderr, execMs + "ms",
                    tempDirMs, sourceWriteMs, compileMs, jvmStartMs, execMs, cleanupMs, totalMs, cacheHit);

        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            long totalMs = System.currentTimeMillis() - totalStart;
            return new CompileResponse(false, "",
                    "System Error: " + e.getMessage(), totalMs + "ms");
        } finally {
            if (process != null) process.destroy();
            if (tempDir != null) cleanupDirectory(tempDir);
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
            // SHA-256 is guaranteed by the Java specification — this is unreachable
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

    // ─── [PERF] Log Printer ───────────────────────────────────────────────────
    /**
     * Emits structured [PERF] lines to stdout so they appear in Render / Docker logs.
     *
     * Timing breakdown:
     *   Temp Directory Creation — OS tmpfs allocation (usually < 5 ms)
     *   Source Write            — disk I/O for .java file
     *   Compilation             — javac wall-clock time (0 on cache hit)
     *   JVM Startup             — OS process fork / exec overhead for `java`
     *   Execution               — JVM class-loading + main() runtime (dominant cost)
     *   Cleanup                 — recursive temp dir deletion
     *   Total Request           — sum of all stages + overhead
     *
     * NOTE: "JVM Startup" measures only the pb.start() call (OS fork).
     *       The JVM class-loading phase is captured inside "Execution" because
     *       it cannot be observed from outside the child process without bytecode injection.
     *       On a cold Render instance, "Execution" will be 300–800 ms for a Hello World —
     *       that entire cost is JVM class-loading.
     */
    private void printPerfLog(long tempDirMs, long sourceWriteMs,
                               long compileMs,  long jvmStartMs,
                               long execMs,     long cleanupMs,
                               long totalMs,    boolean cacheHit) {

        System.out.println("----------------------------------------");
        System.out.printf("[PERF] Temp Directory Creation = %d ms%n",  tempDirMs);
        System.out.printf("[PERF] Source Write            = %d ms%n",  sourceWriteMs);
        if (cacheHit) {
            System.out.println("[PERF] Compilation             = 0 ms  (CACHE HIT)");
        } else {
            System.out.printf("[PERF] Compilation             = %d ms%n", compileMs);
        }
        System.out.printf("[PERF] JVM Startup             = %d ms%n",  jvmStartMs);
        System.out.printf("[PERF] Execution               = %d ms%n",  execMs);
        System.out.printf("[PERF] Cleanup                 = %d ms%n",  cleanupMs);
        System.out.printf("[PERF] Total Request           = %d ms%n",  totalMs);
        System.out.printf("[PERF] Cache                   = hits=%d  misses=%d%n",
                cacheHits.get(), cacheMisses.get());
        System.out.println("----------------------------------------");
    }

    // ─── Response Builder ─────────────────────────────────────────────────────
    private CompileResponse buildResponse(
            boolean success, String output, String error, String execTime,
            long tempDirMs, long sourceWriteMs, long compileMs,
            long jvmStartMs, long execMs, long cleanupMs,
            long totalMs, boolean cacheHit) {

        String compileLabel = cacheHit ? "0ms (cached)" : compileMs + "ms";

        Map<String, String> metrics = new LinkedHashMap<>();
        metrics.put("tempDirTime",    tempDirMs    + "ms");
        metrics.put("sourceWrite",    sourceWriteMs + "ms");
        metrics.put("compileTime",    compileLabel);
        metrics.put("jvmStartup",     jvmStartMs   + "ms");
        metrics.put("executionTime",  execMs        + "ms");
        metrics.put("cleanupTime",    cleanupMs     + "ms");
        metrics.put("totalTime",      totalMs       + "ms");
        metrics.put("cacheHit",       String.valueOf(cacheHit));
        metrics.put("cacheHits",      String.valueOf(cacheHits.get()));
        metrics.put("cacheMisses",    String.valueOf(cacheMisses.get()));

        return new CompileResponse(success, output, error, execTime, metrics);
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
