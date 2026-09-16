package com.ams.flink.cplm.contract;

import java.io.Serializable;

/**
 * One role's observation from the samples tuple's {@code roles{}} block (schema 1.1,
 * spec v6 R03/C02). Mirrors ingestion-service {@code Pipeline/RoleObservation.cs}.
 *
 * <p>{@link #provenance} says where the values came from: {@link #SOURCE_ROLES_BLOCK} when
 * the producer wrote them, {@link #SOURCE_LEGACY_TUPLE} when they were synthesised from a
 * 1.0 tuple's single timestamp/quality — in which case {@code held} is unknown (false) and
 * {@code ageMs} is 0, and no method may claim per-role freshness evidence from them.
 */
public final class RoleObservation implements Serializable {
    private static final long serialVersionUID = 1L;

    public static final String SOURCE_ROLES_BLOCK = "ROLES_BLOCK";
    public static final String SOURCE_LEGACY_TUPLE = "LEGACY_TUPLE";

    public String role;
    /** Numeric value; null for MODE (see {@link #stringValue}). */
    public Double value;
    public String stringValue;
    /** MODE only: the source token before mode_value_map translation. */
    public String modeNative;
    public long sampleTsMs;
    public long verifiedTsMs;
    public String qualityNative = "";
    /** GOOD | UNCERTAIN | BAD | UNKNOWN (per-role verdict). */
    public String quality = "UNKNOWN";
    public String unit;
    public boolean held;
    public long ageMs;
    public String provenance = SOURCE_ROLES_BLOCK;

    public RoleObservation() {
    }

    public boolean isGood() {
        return "GOOD".equals(quality);
    }
}
