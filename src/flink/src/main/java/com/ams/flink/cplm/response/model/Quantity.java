package com.ams.flink.cplm.response.model;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.Objects;

/** One typed metric: value or null WITH a reason (spec §2.10). Units are part of the identity, never implied. */
public final class Quantity implements Serializable {
    private static final long serialVersionUID = 1L;
    public final String quantityId;
    public final Double value;
    public final String unit;
    public final Double uncertainty;
    public final String method;
    public final String reasonIfNull;

    private Quantity(String quantityId, Double value, String unit, Double uncertainty, String method, String reasonIfNull) {
        this.quantityId = Objects.requireNonNull(quantityId);
        this.value = value;
        this.unit = Objects.requireNonNull(unit);
        this.uncertainty = uncertainty;
        this.method = method == null ? "" : method;
        this.reasonIfNull = reasonIfNull == null ? "" : reasonIfNull;
    }

    public static Quantity of(String id, double value, String unit, String method) {
        return of(id, value, unit, method, null);
    }

    public static Quantity of(String id, double value, String unit, String method, Double uncertainty) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(id + ": non-finite value");
        return new Quantity(id, value, unit, uncertainty, method, "");
    }

    public static Quantity unavailable(String id, String unit, String reason) {
        if (reason == null || reason.isEmpty()) throw new IllegalArgumentException(id + ": an unavailable quantity needs a reason");
        return new Quantity(id, null, unit, null, "", reason);
    }

    public boolean available() { return value != null; }

    public ObjectNode toJson(ObjectMapper m) {
        ObjectNode n = m.createObjectNode();
        n.put("quantity_id", quantityId);
        if (value == null) n.putNull("value"); else n.put("value", value);
        n.put("unit", unit);
        if (uncertainty == null) n.putNull("uncertainty"); else n.put("uncertainty", uncertainty);
        n.put("method", method);
        if (value == null) n.put("reason_if_null", reasonIfNull);
        return n;
    }

    @Override
    public String toString() {
        return quantityId + "=" + (value == null ? "null(" + reasonIfNull + ")" : value + " " + unit);
    }
}
