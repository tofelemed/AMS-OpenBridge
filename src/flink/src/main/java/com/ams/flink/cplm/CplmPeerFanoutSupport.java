package com.ams.flink.cplm;

import org.apache.flink.api.common.state.BroadcastState;
import org.apache.flink.api.common.state.ReadOnlyBroadcastState;
import org.apache.flink.streaming.api.datastream.BroadcastStream;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.co.BroadcastProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * v2.5 Task 2F.1 (R09): the peer sample side-input of the long job. The registry broadcasts each
 * loop's peers on {@code cplm.loop.evidence} (the same control-plane envelope the profiles ride);
 * this operator keeps the reverse index (peer -> loops that list it) and, for every sample, emits
 * the sample itself (stamped with its own configured peers) plus one copy per loop that lists the
 * sample's loop as a peer, tagged {@code peerOfLoopId}. Keying on that tag delivers a loop's own
 * samples and its peers' samples to the same keyed window, where G13 aligns them. Topology is
 * configuration: no sample-stream field decides who is a peer.
 */
public final class CplmPeerFanoutSupport {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    static final String EVIDENCE_SUFFIX = ":" + CplmParameterSetBroadcastSupport.ATTR_LOOP_EVIDENCE;

    private CplmPeerFanoutSupport() {}

    public static DataStream<CplmNormalizedSample> connectPeerFanout(DataStream<CplmNormalizedSample> samples, StreamExecutionEnvironment env, CplmJobConfig cfg) {
        BroadcastStream<String> updates = CplmParameterSetBroadcastSupport.buildParameterUpdateStream(env, cfg).broadcast(CplmParameterSetBroadcastSupport.PROFILE_STATE);
        return samples.connect(updates)
                .process(new PeerFanoutFn())
                .name("cplm-long-peer-fanout")
                .uid("cplm-long-peer-fanout");
    }

    /** The key a fanned-out sample lands under: the loop it is a peer of, else its own loop. */
    public static String windowKey(CplmNormalizedSample s) {
        return s.peerOfLoopId != null ? s.peerOfLoopId : s.loopId;
    }

    /** loop -> configured peers, parsed from every {@code <loop>:cplm.loop.evidence} entry of the broadcast state. */
    static Map<String, List<String>> peersByLoop(Iterable<Map.Entry<String, String>> entries) {
        Map<String, List<String>> out = new HashMap<>();
        for (Map.Entry<String, String> e : entries) {
            if (e.getKey() == null || !e.getKey().endsWith(EVIDENCE_SUFFIX)) continue;
            String loop = e.getKey().substring(0, e.getKey().length() - EVIDENCE_SUFFIX.length());
            List<String> peers = new ArrayList<>();
            try {
                JsonNode ev = MAPPER.readTree(e.getValue());
                for (JsonNode p : ev.path("peers")) {
                    String id = p.asText("").trim();
                    if (!id.isEmpty() && !id.equalsIgnoreCase(loop) && !peers.contains(id)) peers.add(id);
                }
            } catch (Exception ignored) {
                // malformed evidence never breaks the sample stream; the loop simply has no peers
            }
            out.put(loop, peers);
        }
        return out;
    }

    /** peer -> loops that list it. */
    static Map<String, List<String>> reverse(Map<String, List<String>> peersByLoop) {
        Map<String, List<String>> out = new HashMap<>();
        for (Map.Entry<String, List<String>> e : peersByLoop.entrySet()) {
            for (String peer : e.getValue()) out.computeIfAbsent(peer, k -> new ArrayList<>()).add(e.getKey());
        }
        return out;
    }

    static final class PeerFanoutFn extends BroadcastProcessFunction<CplmNormalizedSample, String, CplmNormalizedSample> {
        private transient Map<String, List<String>> peersByLoop;
        private transient Map<String, List<String>> listedBy;
        private transient long revision;

        @Override
        public void processBroadcastElement(String value, Context ctx, Collector<CplmNormalizedSample> out) throws Exception {
            BroadcastState<String, String> state = ctx.getBroadcastState(CplmParameterSetBroadcastSupport.PROFILE_STATE);
            CplmParameterSetBroadcastSupport.applyUpdateToState(value, state);
            rebuild(state.entries());
        }

        private void rebuild(Iterable<Map.Entry<String, String>> entries) {
            peersByLoop = peersByLoop(entries);
            listedBy = reverse(peersByLoop);
            revision++;
        }

        @Override
        public void processElement(CplmNormalizedSample sample, ReadOnlyContext ctx, Collector<CplmNormalizedSample> out) throws Exception {
            if (peersByLoop == null) {
                ReadOnlyBroadcastState<String, String> state = ctx.getBroadcastState(CplmParameterSetBroadcastSupport.PROFILE_STATE);
                rebuild(state.immutableEntries());
            }
            sample.peerOfLoopId = null;
            sample.configuredPeers = peersByLoop.getOrDefault(sample.loopId, Collections.emptyList());
            sample.relationshipRevision = revision;
            out.collect(sample);
            for (String loop : listedBy.getOrDefault(sample.loopId, Collections.emptyList())) {
                out.collect(sample.peerCopy(loop));
            }
        }
    }
}
