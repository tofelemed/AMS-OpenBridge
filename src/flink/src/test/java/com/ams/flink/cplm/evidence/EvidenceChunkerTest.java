package com.ams.flink.cplm.evidence;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.util.Base64;
import java.util.List;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1G.2 (spec v6 R12 transport): an evidence artifact travels as f64 little-endian
 * columns, gzip-compressed, split into bounded chunks each with its own SHA-256, plus a
 * manifest whose SHA-256 covers the whole encoded payload. Reassembly is bit-identical.
 */
public class EvidenceChunkerTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static EvidenceArtifact big(int n) {
        double[] x = new double[n];
        double[] y = new double[n];
        boolean[] mask = new boolean[n];
        java.util.Random rnd = new java.util.Random(42);
        for (int i = 0; i < n; i++) {
            x[i] = 1_756_600_000_000L + i * 5000.0;
            y[i] = 50 + 10 * Math.sin(i / 20.0) + rnd.nextGaussian();     // incompressible enough to need chunks
            mask[i] = rnd.nextInt(50) != 0;
        }
        return EvidenceArtifact.series("m-run-1", "G5", "ACF_SERIES", "PV", "lag", "s", "acf", "1", x, y, mask);
    }

    @Test
    public void aLargeArtifactSplitsIntoChunksThatReassembleBitIdentical() {
        EvidenceArtifact a = big(100_000);
        byte[] encoded = EvidenceChunker.encode(a);
        List<byte[]> chunks = EvidenceChunker.split(encoded, EvidenceChunker.DEFAULT_CHUNK_BYTES);
        assertTrue("chunks " + chunks.size(), chunks.size() >= 2);
        for (byte[] c : chunks) assertTrue(c.length <= EvidenceChunker.DEFAULT_CHUNK_BYTES);
        assertArrayEquals(encoded, EvidenceChunker.join(chunks));
        double[][] cols = EvidenceChunker.decode(EvidenceChunker.join(chunks), a.columnCount(), a.calculationSamples());
        assertArrayEquals(a.x, cols[0], 0.0);
        assertArrayEquals(a.y, cols[1], 0.0);
        for (int i = 0; i < a.mask.length; i++) assertEquals(a.mask[i] ? 1.0 : 0.0, cols[2][i], 0.0);
    }

    @Test
    public void manifestAndChunkRecordsCarryVerifiableChecksums() throws Exception {
        EvidenceArtifact a = big(20_000);
        List<String> records = EvidenceKafkaRecords.records(a, MAPPER, 1_756_600_000_000L);
        JsonNode manifest = MAPPER.readTree(records.get(0));
        assertEquals("EVIDENCE_MANIFEST", manifest.path("record_kind").asText());
        assertEquals("m-run-1", manifest.path("method_run_id").asText());
        assertEquals("G5", manifest.path("gate_id").asText());
        assertEquals("ACF_SERIES", manifest.path("artifact_kind").asText());
        assertEquals("f64le+gzip", manifest.path("encoding").asText());
        assertEquals(20_000, manifest.path("calculation_samples").asInt());
        assertEquals("[\"x\",\"y\",\"mask\"]", manifest.path("columns").toString());
        int chunkCount = manifest.path("chunk_count").asInt();
        assertEquals(records.size() - 1, chunkCount);
        assertEquals(64, manifest.path("sha256").asText().length());

        java.io.ByteArrayOutputStream all = new java.io.ByteArrayOutputStream();
        for (int i = 1; i < records.size(); i++) {
            JsonNode chunk = MAPPER.readTree(records.get(i));
            assertEquals("EVIDENCE_CHUNK", chunk.path("record_kind").asText());
            assertEquals(manifest.path("evidence_id").asText(), chunk.path("evidence_id").asText());
            assertEquals(i - 1, chunk.path("chunk_no").asInt());
            byte[] payload = Base64.getDecoder().decode(chunk.path("payload_b64").asText());
            assertEquals(chunk.path("byte_length").asInt(), payload.length);
            assertEquals(chunk.path("sha256").asText(), EvidenceChunker.sha256Hex(payload));
            assertEquals(manifest.path("chunk_sha256").get(i - 1).asText(), chunk.path("sha256").asText());
            all.write(payload);
        }
        assertEquals(manifest.path("sha256").asText(), EvidenceChunker.sha256Hex(all.toByteArray()));
        assertEquals(manifest.path("total_bytes").asLong(), all.size());
    }

    @Test
    public void aDisplayDecimationNeverReplacesTheCalculationSamples() {
        EvidenceArtifact a = big(3_000);
        assertEquals(3_000, a.calculationSamples());
        assertEquals(Math.min(3_000, EvidenceArtifact.DEFAULT_DISPLAY_POINTS), a.displayPoints());
    }
}
