package com.ams.flink.cplm.identity;

import java.io.InputStream;
import java.io.Serializable;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.CodeSource;
import java.security.MessageDigest;
import java.util.Properties;

/**
 * Identity of the running build (spec v6 R26 / C07): the source commit and the SHA-256 of
 * the jar this class was loaded from. Version strings such as "3.0.0" / "2.0.0" label a
 * contract, not a behaviour; two jars with the same labels can compute different results,
 * so every CPLM result carries these two values.
 *
 * <p>The commit comes from {@code /git.properties} on the classpath, written by
 * {@code scripts/build-flink-jar.ps1} before the containerised Maven build (the container
 * mounts only src/flink, so Maven cannot see .git). Absence yields the literal
 * {@link #UNKNOWN}, never an empty string, so a result built without identity is visibly
 * unidentified rather than silently blank.
 */
public final class BuildIdentity implements Serializable {
    private static final long serialVersionUID = 1L;

    public static final String UNKNOWN = "unknown";
    /** Digest value when the code did not come from a jar (unit tests, IDE). */
    public static final String NOT_A_JAR = "unknown-not-a-jar";
    /** Wire-contract version of the CPLM result messages (schemaVersion 1 payloads). */
    public static final String CONTRACT_VERSION = "v1";

    private static volatile BuildIdentity current;

    public final String sourceCommit;
    public final String jarSha256;
    public final String buildTimeUtc;

    private BuildIdentity(String sourceCommit, String jarSha256, String buildTimeUtc) {
        this.sourceCommit = sourceCommit;
        this.jarSha256 = jarSha256;
        this.buildTimeUtc = buildTimeUtc;
    }

    /** Memoised identity of this JVM's build; safe to call per record. */
    public static BuildIdentity current() {
        BuildIdentity c = current;
        if (c == null) {
            synchronized (BuildIdentity.class) {
                c = current;
                if (c == null) {
                    current = c = fromProperties(loadGitProperties(), locateJar());
                }
            }
        }
        return c;
    }

    /** Deterministic constructor used by {@link #current()} and by tests. */
    public static BuildIdentity fromProperties(Properties props, Path jar) {
        String commit = nonBlank(props.getProperty("git.commit.id.full"), UNKNOWN);
        String time = nonBlank(props.getProperty("git.build.time"), UNKNOWN);
        return new BuildIdentity(commit, sha256OfJar(jar), time);
    }

    private static Properties loadGitProperties() {
        Properties p = new Properties();
        try (InputStream in = BuildIdentity.class.getResourceAsStream("/git.properties")) {
            if (in != null) p.load(in);
        } catch (Exception ignored) {
            // A missing or unreadable file is reported as UNKNOWN by fromProperties.
        }
        return p;
    }

    private static Path locateJar() {
        try {
            CodeSource src = BuildIdentity.class.getProtectionDomain().getCodeSource();
            if (src == null) return null;
            URL url = src.getLocation();
            if (url == null) return null;
            Path path = Paths.get(url.toURI());
            // Any regular file is digested: in a Flink cluster the TaskManager loads user code from
            // a BlobServer copy named blob_p-<hash>-<id> (no .jar suffix) that is byte-identical to the
            // submitted jar, so its digest equals the jar's. Only a directory (tests, IDE) has no jar.
            return Files.isRegularFile(path) ? path : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static String sha256OfJar(Path jar) {
        if (jar == null) return NOT_A_JAR;
        try (InputStream in = Files.newInputStream(jar)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            StringBuilder sb = new StringBuilder(64);
            for (byte b : md.digest()) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return UNKNOWN;
        }
    }

    private static String nonBlank(String v, String fallback) {
        return v == null || v.trim().isEmpty() ? fallback : v.trim();
    }

    @Override
    public String toString() {
        return "BuildIdentity{commit=" + sourceCommit + ", jar=" + jarSha256 + ", built=" + buildTimeUtc + "}";
    }
}
