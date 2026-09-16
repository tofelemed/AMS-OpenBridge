package com.ams.flink.cplm.config;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * v2.5 Task 3A.2 (spec v6 §5.3; NR-046): which catalogue properties each CPLM job ACTUALLY reads -
 * the mapper's keys filtered by the job's consumer tier. This is what the job announces in its
 * CAPABILITY record; a property the catalogue assigns to a flink consumer that no job reads must
 * be listed in unsupported-in-build.json with a reason, or the coverage test fails the build.
 */
public final class PropertyReaders {
    public static final String SHORT = "AMS - CPLM Short Feature Engine";
    public static final String LONG = "AMS - CPLM Long Diagnostics Engine";
    public static final String FUSION = "AMS - CPLM Gate Fusion Engine";
    public static final String CONDITION = "AMS - CPLM Condition Engine";
    public static final String RESPONSE = "AMS - CPLM Response Engine";
    public static final String CONTEXT = "AMS - CPLM Instrument Context Engine";
    public static final List<String> JOBS = Collections.unmodifiableList(Arrays.asList(SHORT, LONG, FUSION, CONDITION, RESPONSE, CONTEXT));
    public static final String UNSUPPORTED_RESOURCE = "/cplm/gate-config/unsupported-in-build.json";

    private PropertyReaders() {}

    public static String consumerOf(String jobName) {
        switch (jobName) {
            case SHORT: return "flink:short";
            case LONG: return "flink:long";
            case FUSION: return "flink:fusion";
            case CONDITION: return "flink:condition";
            case RESPONSE: return "flink:response";
            default: return "flink:context";
        }
    }

    /** Sorted property ids the job reads: mapped by the mapper AND assigned to the job's consumer by the catalogue. */
    public static List<String> forJob(String jobName) {
        String consumer = consumerOf(jobName);
        PropertyCatalogue c = PropertyCatalogue.current();
        TreeSet<String> out = new TreeSet<>();
        Iterable<String> mapped = RESPONSE.equals(jobName) ? BundleProfileMapper.responseProperties() : BundleProfileMapper.profileProperties();
        for (String p : mapped) {
            PropertyCatalogue.Entry e = c.find(p);
            if (e != null && e.consumers.contains(consumer)) out.add(p);
        }
        return new ArrayList<>(out);
    }

    /** property -> reason, from the build's own declaration of what it does not (yet) read. */
    public static Map<String, String> unsupportedInBuild() {
        Map<String, String> out = new LinkedHashMap<>();
        try (InputStream in = PropertyReaders.class.getResourceAsStream(UNSUPPORTED_RESOURCE)) {
            if (in == null) return out;
            JsonNode root = new ObjectMapper().readTree(in);
            Iterator<Map.Entry<String, JsonNode>> it = root.path("unsupported").fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                out.put(e.getKey(), e.getValue().asText(""));
            }
        } catch (Exception ignored) {
            // a missing declaration means every flink property must be read - the coverage test says so
        }
        return out;
    }
}
