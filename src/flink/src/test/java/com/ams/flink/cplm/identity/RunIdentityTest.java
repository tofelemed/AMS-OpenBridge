package com.ams.flink.cplm.identity;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import org.junit.Test;

import java.util.Map;
import java.util.UUID;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1G.2 (spec v6 R19 / R26): a method run has an IMMUTABLE, DETERMINISTIC identity -
 * the same loop, gate, method, support and configuration always yield the same id (so retries
 * and redeliveries are idempotent), and a different configuration yields a different id (so a
 * re-evaluation under another bundle is a new run, never an overwrite).
 */
public class RunIdentityTest {

    @Test
    public void uuidV5MatchesTheRfc4122ReferenceVector() {
        // RFC 4122 name-based SHA-1 UUID of "python.org" in the DNS namespace (the standard test vector).
        UUID dns = UUID.fromString("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
        assertEquals("886313e1-3b8a-5372-9b90-0c9aee199e5d", RunIdentity.uuidV5(dns, "python.org").toString());
    }

    @Test
    public void sameInputsGiveTheSameIdAndADifferentBundleGivesAnotherOne() {
        String a = RunIdentity.methodRunId("FIC101", "G5", "G5.ACF_OSCILLATION", "1", 0, 86_400_000L, "profile:abc", 0, 1);
        String b = RunIdentity.methodRunId("FIC101", "G5", "G5.ACF_OSCILLATION", "1", 0, 86_400_000L, "profile:abc", 0, 1);
        String c = RunIdentity.methodRunId("FIC101", "G5", "G5.ACF_OSCILLATION", "1", 0, 86_400_000L, "profile:def", 0, 1);
        String d = RunIdentity.methodRunId("FIC101", "G5", "G5.ACF_OSCILLATION", "1", 0, 86_400_000L, "profile:abc", 0, 2);
        assertEquals(a, b);
        assertNotEquals(a, c);
        assertNotEquals(a, d);
        assertEquals('5', a.charAt(14));                               // version nibble
        assertTrue(UUID.fromString(a).variant() == 2);                  // RFC variant
    }

    @Test
    public void everyGateGetsExactlyOneIdInCatalogueOrder() {
        Map<String, String> ids = RunIdentity.forGates("FIC101", 0, 86_400_000L, "profile:abc", 0, 1);
        assertEquals(17, ids.size());
        assertEquals("[G0, G1, G2, G2r, G3, G4, G5, G6, G7, G8, G9, G10, G11, G12, G13, G14, G15]", ids.keySet().toString());
        assertEquals(17, ids.values().stream().distinct().count());
        assertEquals(ids.get("G14"), RunIdentity.methodRunId("FIC101", "G14",
                GateMethodCatalog.methodId("G14"), GateMethodCatalog.methodVersion("G14"), 0, 86_400_000L, "profile:abc", 0, 1));
    }

    @Test
    public void theProfileHashIdentifiesTheConfigurationValuesNotTheirProvenance() {
        CplmLoopDynamicsProfile a = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC);
        CplmLoopDynamicsProfile b = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC);
        assertEquals(ProfileHash.of(a), ProfileHash.of(b));
        assertTrue(ProfileHash.of(a).startsWith("profile:"));
        CplmLoopDynamicsProfile.ProfileSource[] sources = CplmLoopDynamicsProfile.ProfileSource.values();
        b.profileSource = sources[(a.profileSource.ordinal() + 1) % sources.length];   // where it came from is not a value
        assertEquals(ProfileHash.of(a), ProfileHash.of(b));
        b.g4ActivityWarnRatio = 3.5;                                          // a threshold is
        assertNotEquals(ProfileHash.of(a), ProfileHash.of(b));
        assertNotEquals(ProfileHash.of(a), ProfileHash.of(CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC)));
    }
}
