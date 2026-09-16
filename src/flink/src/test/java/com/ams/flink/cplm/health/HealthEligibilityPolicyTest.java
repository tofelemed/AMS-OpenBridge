package com.ams.flink.cplm.health;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;

/**
 * v2.5 Task 1H.4 (spec v6 §4.6): one test per policy row. Eligibility is a POLICY over the
 * native evidence, never arithmetic on flags; absence of a binding is NOT_CONFIGURED, never OK.
 */
public class HealthEligibilityPolicyTest {
    private static HealthInterval interval(List<String> flags, List<String> affected, String collection, String impact, boolean complete) {
        HealthInterval i = new HealthInterval();
        i.activeFlags = new java.util.ArrayList<>(flags);
        i.affectedVariableIds = new java.util.ArrayList<>(affected);
        i.collectionState = collection;
        i.measurementImpact = impact;
        i.healthStateId = flags.isEmpty() && complete && "VERIFIED".equals(collection) ? HealthInterval.NO_ACTIVE_DIAGNOSTIC : "state-x";
        i.stateComplete = complete;
        return i;
    }

    private static HealthEligibilityPolicy.Result policyOf(HealthInterval i) {
        return HealthEligibilityPolicy.evaluate(i, "FIC1.PV");
    }

    @Test public void fAffectingThePvIsIneligible() {
        HealthEligibilityPolicy.Result r = policyOf(interval(Arrays.asList("F"), Collections.singletonList("FIC1.PV"), "VERIFIED", "INVALID", true));
        assertEquals("INELIGIBLE", r.eligibility); assertEquals("F_AFFECTS_SIGNAL", r.reason);
    }
    @Test public void fOnTheWholeDeviceIsIneligible() {
        assertEquals("INELIGIBLE", policyOf(interval(Arrays.asList("F"), Collections.emptyList(), "VERIFIED", "INVALID", true)).eligibility);
    }
    @Test public void cAffectingThePvIsIneligibleForIdentificationLimitedForDescriptive() {
        HealthEligibilityPolicy.Result r = policyOf(interval(Arrays.asList("C"), Collections.singletonList("FIC1.PV"), "VERIFIED", "INVALID", true));
        assertEquals("INELIGIBLE", r.eligibility); assertEquals("LIMITED", r.descriptive); assertEquals("C_TEST_ACTIVE", r.reason);
    }
    @Test public void sWithDegradedValidityIsLimitedNotFailed() {
        HealthEligibilityPolicy.Result r = policyOf(interval(Arrays.asList("S"), Collections.singletonList("FIC1.PV"), "VERIFIED", "DEGRADED", true));
        assertEquals("LIMITED", r.eligibility); assertEquals("S_DEGRADED", r.reason);
    }
    @Test public void nr044MWithValidPvStaysEligible() {
        HealthEligibilityPolicy.Result r = policyOf(interval(Arrays.asList("M"), Collections.emptyList(), "VERIFIED", "VALID", true));
        assertEquals("ELIGIBLE", r.eligibility); assertEquals("M_CONTEXT_ONLY", r.reason);
    }
    @Test public void nr042AFaultOnAnIndependentVariableLeavesThePvEligibleAndVisible() {
        HealthEligibilityPolicy.Result r = policyOf(interval(Arrays.asList("F"), Collections.singletonList("FIC1.TEMP_COMP"), "VERIFIED", "VALID", true));
        assertEquals("ELIGIBLE", r.eligibility); assertEquals("FLAG_ON_INDEPENDENT_VARIABLE", r.reason);
    }
    @Test public void unknownImpactOrStaleOrOfflineIsLimitedNeverAClearance() {
        assertEquals("LIMITED", policyOf(interval(Collections.emptyList(), Collections.emptyList(), "STALE", "UNKNOWN", true)).eligibility);
        assertEquals("LIMITED", policyOf(interval(Collections.emptyList(), Collections.emptyList(), "OFFLINE", "UNKNOWN", true)).eligibility);
        assertEquals("LIMITED", policyOf(interval(Collections.emptyList(), Collections.emptyList(), "UNKNOWN", "UNKNOWN", false)).eligibility);
        assertEquals("LIMITED", policyOf(interval(Collections.emptyList(), Collections.emptyList(), "VERIFIED", "UNKNOWN", true)).eligibility);
    }
    @Test public void noBindingIsNotConfiguredNeverManufacturedHealth() {
        HealthEligibilityPolicy.Result r = HealthEligibilityPolicy.notConfigured();
        assertEquals("NOT_CONFIGURED", r.eligibility); assertEquals("NO_BINDING", r.reason);
    }
    @Test public void aFreshCompleteEmptyStateIsEligibleAsNoActiveDiagnostic() {
        HealthEligibilityPolicy.Result r = policyOf(interval(Collections.emptyList(), Collections.emptyList(), "VERIFIED", "VALID", true));
        assertEquals("ELIGIBLE", r.eligibility); assertEquals("NO_ACTIVE_DIAGNOSTIC", r.reason);
    }
    @Test public void aDeviceLevelInvalidMeasurementIsIneligibleWhateverTheFlags() {
        assertEquals("INELIGIBLE", policyOf(interval(Collections.emptyList(), Collections.emptyList(), "VERIFIED", "INVALID", true)).eligibility);
    }
}
