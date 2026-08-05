package com.ams.flink.cplm;

import java.io.BufferedReader;
import java.io.FileReader;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Offline certification runner: replays raw NDJSON samples through the exact
 * production engine path (computeShortFeatures + computeLongDiagnostics + fuse)
 * for one analysis window, and prints the fused gate payload JSON.
 *
 * Usage:
 *   CplmWindowCertificationCli <ndjsonPath> <loopId> <windowStartIso> <windowEndIso> [windowKind] [loopClass|AUTO]
 *
 * NDJSON lines may be raw JSON or Kafka "key&lt;TAB&gt;json" / "key|json" producer lines.
 * loopClass defaults to AUTO (resolve from loopId / ISA letter). Pass FIC|PIC|LIC|TIC|UNKNOWN to force.
 */
public final class CplmWindowCertificationCli {

    private CplmWindowCertificationCli() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 4) {
            System.err.println("Usage: CplmWindowCertificationCli <ndjsonPath> <loopId> <windowStartIso> <windowEndIso> [windowKind] [loopClass|AUTO]");
            System.exit(2);
        }
        String path = args[0];
        String loopId = args[1];
        long startMs = Instant.parse(args[2]).toEpochMilli();
        long endMs = Instant.parse(args[3]).toEpochMilli();
        String windowKind = args.length > 4 ? args[4] : "24h";
        String classArg = args.length > 5 ? args[5] : "AUTO";

        List<CplmNormalizedSample> samples = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new FileReader(path))) {
            String line;
            while ((line = reader.readLine()) != null) {
                int brace = line.indexOf('{');
                if (brace < 0) continue;
                CplmNormalizedSample s = CplmNormalizedSample.fromJson(line.substring(brace));
                if (s == null || !s.isValid || !loopId.equals(s.loopId)) continue;
                if (s.eventTsMs < startMs || s.eventTsMs >= endMs) continue;
                samples.add(s);
            }
        }

        CplmLoopDynamicsProfile profile;
        if (classArg == null || classArg.isEmpty() || "AUTO".equalsIgnoreCase(classArg)) {
            profile = CplmDynamicsParameterSetSupport.resolveFromSpine(loopId, null, null);
        } else {
            CplmLoopDynamicsProfile.LoopClass cls = CplmLoopDynamicsProfile.parseClass(classArg);
            if (cls == null) cls = CplmLoopDynamicsProfile.LoopClass.UNKNOWN;
            profile = CplmLoopDynamicsProfile.forClass(cls);
            profile.profileSource = CplmLoopDynamicsProfile.ProfileSource.LOOP_TYPE;
        }

        System.err.println("samples=" + samples.size()
                + " class=" + profile.loopClass
                + " source=" + profile.profileSource
                + " calc=" + profile.calculationVersion
                + " dyn=" + profile.dynamicsProfileVersion);

        CplmGateResult fused = CplmGateFusionEngine.fuseFromSamples(
                samples, startMs, endMs, windowKind, false, false, profile);
        System.out.println(fused.toJson());
    }
}
