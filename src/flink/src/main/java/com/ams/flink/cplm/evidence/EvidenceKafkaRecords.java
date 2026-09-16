package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.identity.BuildIdentity;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * v2.5 Task 1G.2: the records an artifact becomes on traverse.cpa.clpm.gate.evidence.v1 -
 * one EVIDENCE_MANIFEST followed by its EVIDENCE_CHUNKs, all keyed by method_run_id (so they
 * land on one partition, in order). One serialisation format (JSON; chunk payload base64).
 * The consumer marks a manifest COMPLETE only when every chunk is present and every checksum
 * verifies - never early.
 */
public final class EvidenceKafkaRecords {
    public static final String KEY_FIELD = "method_run_id";
    public static final String MANIFEST = "EVIDENCE_MANIFEST";
    public static final String CHUNK = "EVIDENCE_CHUNK";

    private EvidenceKafkaRecords() {
    }

    public static List<String> records(EvidenceArtifact a, ObjectMapper m, long emittedAtMs) {
        byte[] encoded = EvidenceChunker.encode(a);
        List<byte[]> chunks = EvidenceChunker.split(encoded, EvidenceChunker.DEFAULT_CHUNK_BYTES);
        BuildIdentity id = BuildIdentity.current();
        List<String> out = new ArrayList<>(chunks.size() + 1);

        ObjectNode manifest = m.createObjectNode();
        manifest.put("record_kind", MANIFEST);
        manifest.put("evidence_id", a.evidenceId);
        manifest.put(KEY_FIELD, a.methodRunId);
        manifest.put("gate_id", a.gate);
        manifest.put("artifact_kind", a.kind);
        manifest.put("role_or_path", a.roleOrPath == null ? "" : a.roleOrPath);
        manifest.put("x_quantity", a.xQuantity);
        manifest.put("x_unit", a.xUnit);
        manifest.put("y_quantity", a.yQuantity);
        manifest.put("y_unit", a.yUnit);
        manifest.put("data_type", "f64");
        ArrayNode cols = manifest.putArray("columns");
        for (String c : a.columns()) cols.add(c);
        manifest.put("column_count", a.columnCount());
        ObjectNode units = manifest.putObject("column_units");
        units.put("x", a.xUnit);
        units.put("y", a.yUnit);
        if (a.mask != null) units.put("mask", "boolean");
        for (Map.Entry<String, String> e : a.columnUnits.entrySet()) units.put(e.getKey(), e.getValue());
        ObjectNode legends = manifest.putObject("legends");
        for (Map.Entry<String, String> e : a.legends.entrySet()) legends.put(e.getKey(), e.getValue());
        manifest.put("encoding", EvidenceChunker.ENCODING);
        manifest.put("calculation_samples", a.calculationSamples());
        manifest.put("display_points", a.displayPoints());
        manifest.put("chunk_count", chunks.size());
        manifest.put("total_bytes", encoded.length);
        manifest.put("sha256", EvidenceChunker.sha256Hex(encoded));
        ArrayNode chunkShas = manifest.putArray("chunk_sha256");
        for (byte[] c : chunks) chunkShas.add(EvidenceChunker.sha256Hex(c));
        ObjectNode prov = manifest.putObject("provenance");
        for (Map.Entry<String, Object> e : a.provenance.entrySet()) prov.put(e.getKey(), String.valueOf(e.getValue()));
        // the store persists columns + provenance only: units and legends travel inside provenance as well
        if (!a.columnUnits.isEmpty()) prov.put("column_units", units.toString());
        if (!a.legends.isEmpty()) prov.put("legends", legends.toString());
        manifest.put("sourceCommit", id.sourceCommit);
        manifest.put("jarSha256", id.jarSha256);
        manifest.put("contractVersion", BuildIdentity.CONTRACT_VERSION);
        manifest.put("emitted_at_ms", emittedAtMs);
        out.add(manifest.toString());

        for (int i = 0; i < chunks.size(); i++) {
            byte[] c = chunks.get(i);
            ObjectNode chunk = m.createObjectNode();
            chunk.put("record_kind", CHUNK);
            chunk.put("evidence_id", a.evidenceId);
            chunk.put(KEY_FIELD, a.methodRunId);
            chunk.put("chunk_no", i);
            chunk.put("byte_length", c.length);
            chunk.put("sha256", EvidenceChunker.sha256Hex(c));
            chunk.put("payload_b64", Base64.getEncoder().encodeToString(c));
            chunk.put("emitted_at_ms", emittedAtMs);
            out.add(chunk.toString());
        }
        return out;
    }
}
