package com.ams.flink.cplm.identity;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.util.Properties;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * R26 / C07: version strings ("3.0.0", "2.0.0") do not identify behaviour. Every CPLM
 * result must carry the source commit and the SHA-256 of the running jar so identically
 * labelled results from different builds cannot be mistaken for the same calculation.
 */
public class BuildIdentityTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String TEST_COMMIT = "0123456789abcdef0123456789abcdef01234567";

    @Test
    public void currentReadsCommitFromGitPropertiesOnClasspath() {
        BuildIdentity id = BuildIdentity.current();
        assertEquals(TEST_COMMIT, id.sourceCommit);
        assertEquals("2026-09-16T00:00:00Z", id.buildTimeUtc);
        // Tests run from target/classes, not from a jar: the digest must say so, never lie.
        assertEquals(BuildIdentity.NOT_A_JAR, id.jarSha256);
    }

    @Test
    public void missingPropertiesYieldExplicitUnknownNotEmptyString() {
        BuildIdentity id = BuildIdentity.fromProperties(new Properties(), null);
        assertEquals(BuildIdentity.UNKNOWN, id.sourceCommit);
        assertEquals(BuildIdentity.UNKNOWN, id.buildTimeUtc);
        assertEquals(BuildIdentity.NOT_A_JAR, id.jarSha256);
    }

    @Test
    public void everyResultTypeCarriesBuildIdentityInItsJson() throws Exception {
        assertIdentity(MAPPER.readTree(new CplmGateResult().toJson()));
        assertIdentity(MAPPER.readTree(new CplmShortFeatureResult().toJson()));
        assertIdentity(MAPPER.readTree(new CplmLongDiagnosticsResult().toJson()));
    }

    @Test
    public void shortAndLongResultsRoundTripTheIdentity() {
        CplmShortFeatureResult s = CplmShortFeatureResult.fromJson(new CplmShortFeatureResult().toJson());
        assertEquals(TEST_COMMIT, s.sourceCommit);
        assertEquals(BuildIdentity.NOT_A_JAR, s.jarSha256);
        assertEquals("v1", s.contractVersion);
        CplmLongDiagnosticsResult l = CplmLongDiagnosticsResult.fromJson(new CplmLongDiagnosticsResult().toJson());
        assertEquals(TEST_COMMIT, l.sourceCommit);
        assertEquals(BuildIdentity.NOT_A_JAR, l.jarSha256);
        assertEquals("v1", l.contractVersion);
    }

    private static void assertIdentity(JsonNode root) {
        assertEquals(TEST_COMMIT, root.path("sourceCommit").asText());
        assertEquals(BuildIdentity.NOT_A_JAR, root.path("jarSha256").asText());
        assertEquals("v1", root.path("contractVersion").asText());
        assertTrue("legacy version strings must remain", root.has("calculationVersion"));
    }
}
