package com.ams.flink.cplm.config;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.io.Serializable;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * v2.5 Task 3A.1 (spec v6 §5.1, R16 / R18): the 165-property gate configuration catalogue the jar
 * carries - a classpath copy of contracts/gate-config/v1/property-catalogue.json generated from the
 * spec sheet by scripts/gen-property-catalogue.py (the API embeds the same file). Typed accessors,
 * the dependency graph for change-class promotion, and the content hash the CAPABILITY ACK reports.
 */
public final class PropertyCatalogue implements Serializable {
    private static final long serialVersionUID = 1L;
    public static final String RESOURCE = "/cplm/gate-config/property-catalogue.json";
    private static final List<String> CLASS_ORDER = Collections.unmodifiableList(java.util.Arrays.asList("POLICY", "STATE_BOUNDARY", "DEPLOYMENT"));

    public static final class Entry implements Serializable {
        private static final long serialVersionUID = 1L;
        public String id, gate, property, type, unit, changeClass, effect;
        /** null = "Commissioning required"; else Long, Double, Boolean or String. */
        public Object defaultValue;
        /** The validation object: enum list ("values") or bounds ("minimum", "maximum", "minItems", "maxItems"). */
        public List<String> enumValuesList = new ArrayList<>();
        public Map<String, Double> bounds = new LinkedHashMap<>();
        public List<String> consumers = new ArrayList<>();
        public List<String> dependencies = new ArrayList<>();
        /** The validation JSON verbatim (for the hash). */
        String validationJson = "{}";

        public List<String> enumValues() { return enumValuesList; }
        public Double minimum() { return bounds.get("minimum"); }
        public Double maximum() { return bounds.get("maximum"); }
        public Integer minItems() { return bounds.containsKey("minItems") ? bounds.get("minItems").intValue() : null; }
        public Integer maxItems() { return bounds.containsKey("maxItems") ? bounds.get("maxItems").intValue() : null; }
        public boolean commissioningRequired() { return defaultValue == null; }
    }

    private final String catalogueHash;
    private final List<Entry> entries;
    private final Map<String, Entry> byProperty = new HashMap<>();
    private final Map<String, List<String>> dependants = new HashMap<>();

    private PropertyCatalogue(String hash, List<Entry> entries) {
        this.catalogueHash = hash;
        this.entries = Collections.unmodifiableList(entries);
        for (Entry e : entries) byProperty.put(e.property, e);
        for (Entry e : entries) for (String d : e.dependencies) dependants.computeIfAbsent(d, k -> new ArrayList<>()).add(e.property);
    }

    private static volatile PropertyCatalogue current;

    /** The catalogue this jar carries (loaded once). */
    public static PropertyCatalogue current() {
        PropertyCatalogue c = current;
        if (c == null) {
            synchronized (PropertyCatalogue.class) {
                if (current == null) current = load();
                c = current;
            }
        }
        return c;
    }

    static PropertyCatalogue load() {
        try (InputStream in = PropertyCatalogue.class.getResourceAsStream(RESOURCE)) {
            if (in == null) throw new IllegalStateException(RESOURCE + " is not on the classpath (run scripts/gen-property-catalogue.py)");
            return parse(new ObjectMapper().readTree(in));
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("cannot read " + RESOURCE, e);
        }
    }

    public static PropertyCatalogue parse(JsonNode root) {
        List<Entry> list = new ArrayList<>();
        for (JsonNode p : root.path("properties")) {
            Entry e = new Entry();
            e.id = p.path("id").asText();
            e.gate = p.path("gate").asText();
            e.property = p.path("property").asText();
            e.type = p.path("type").asText();
            e.unit = p.path("unit").asText("");
            e.changeClass = p.path("change_class").asText();
            e.effect = p.path("effect").asText("");
            JsonNode d = p.path("default");
            if (d.isNull() || d.isMissingNode()) e.defaultValue = null;
            else if (d.isBoolean()) e.defaultValue = d.asBoolean();
            else if (d.isIntegralNumber()) e.defaultValue = d.asLong();
            else if (d.isNumber()) e.defaultValue = d.asDouble();
            else e.defaultValue = d.asText();
            JsonNode v = p.path("validation");
            e.validationJson = v.isMissingNode() ? "{}" : v.toString();
            if (v.isArray()) for (JsonNode x : v) e.enumValuesList.add(x.asText());
            else if (v.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> it = v.fields();
                while (it.hasNext()) {
                    Map.Entry<String, JsonNode> f = it.next();
                    if (f.getValue().isNumber()) e.bounds.put(f.getKey(), f.getValue().asDouble());
                }
            }
            for (JsonNode c : p.path("consumers")) e.consumers.add(c.asText());
            for (JsonNode c : p.path("dependencies")) e.dependencies.add(c.asText());
            list.add(e);
        }
        String hash = root.hasNonNull("catalogue_hash") ? root.path("catalogue_hash").asText() : hashOf(list);
        return new PropertyCatalogue(hash, list);
    }

    public String catalogueHash() { return catalogueHash; }
    public int size() { return entries.size(); }
    public List<Entry> entries() { return entries; }
    public Entry find(String property) { return byProperty.get(property); }

    public Entry get(String property) {
        Entry e = byProperty.get(property);
        if (e == null) throw new IllegalArgumentException("'" + property + "' is not a catalogue property");
        return e;
    }

    public List<String> dependants(String property) {
        return dependants.getOrDefault(property, Collections.emptyList());
    }

    /** The maximum change class over the edited properties and everything that depends on them. */
    public String effectiveChangeClass(Collection<String> edited) {
        int best = 0;
        Set<String> seen = new HashSet<>();
        Deque<String> stack = new ArrayDeque<>(edited);
        while (!stack.isEmpty()) {
            String p = stack.pop();
            Entry e = byProperty.get(p);
            if (!seen.add(p) || e == null) continue;
            best = Math.max(best, CLASS_ORDER.indexOf(e.changeClass));
            stack.addAll(dependants(p));
        }
        return CLASS_ORDER.get(Math.max(0, best));
    }

    public boolean hasCycle() {
        Map<String, Integer> state = new HashMap<>();
        for (Entry e : entries) if (visit(e.property, state)) return true;
        return false;
    }

    private boolean visit(String p, Map<String, Integer> state) {
        Integer s = state.get(p);
        if (s != null) return s == 1;
        state.put(p, 1);
        for (String d : get(p).dependencies) if (visit(d, state)) return true;
        state.put(p, 2);
        return false;
    }

    /** SHA-256 over the generator's canonical JSON (sorted keys, no whitespace, Python number formatting). */
    public static String hashOf(List<Entry> entries) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (Entry e : entries) {
            if (!first) sb.append(',');
            first = false;
            sb.append('{');
            sb.append("\"change_class\":").append(pyString(e.changeClass)).append(',');
            sb.append("\"consumers\":").append(pyArray(e.consumers)).append(',');
            sb.append("\"default\":").append(pyValue(e.defaultValue)).append(',');
            sb.append("\"dependencies\":").append(pyArray(e.dependencies)).append(',');
            sb.append("\"effect\":").append(pyString(e.effect)).append(',');
            sb.append("\"gate\":").append(pyString(e.gate)).append(',');
            sb.append("\"id\":").append(pyString(e.id)).append(',');
            sb.append("\"property\":").append(pyString(e.property)).append(',');
            sb.append("\"type\":").append(pyString(e.type)).append(',');
            sb.append("\"unit\":").append(pyString(e.unit)).append(',');
            sb.append("\"validation\":").append(pyValidation(e.validationJson));
            sb.append('}');
        }
        sb.append(']');
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format(Locale.ROOT, "%02x", b));
            return hex.toString();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String pyArray(List<String> items) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) sb.append(i == 0 ? "" : ",").append(pyString(items.get(i)));
        return sb.append(']').toString();
    }

    private static String pyString(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                default:
                    if (ch < 0x20) sb.append(String.format(Locale.ROOT, "\\u%04x", (int) ch)); else sb.append(ch);
            }
        }
        return sb.append('"').toString();
    }

    private static String pyValue(Object v) {
        if (v == null) return "null";
        if (v instanceof Boolean) return ((Boolean) v) ? "true" : "false";
        if (v instanceof Long || v instanceof Integer) return String.valueOf(v);
        if (v instanceof Double) return pyFloat((Double) v);
        return pyString(String.valueOf(v));
    }

    /** Python's float repr: shortest digits, positional for 1e-4 <= |x| < 1e16 (with a '.'), else d.ddde±XX. */
    static String pyFloat(double d) {
        if (d == 0) return (1 / d < 0) ? "-0.0" : "0.0";
        java.math.BigDecimal bd = new java.math.BigDecimal(Double.toString(Math.abs(d)));   // Double.toString is shortest round-trip
        String digits = bd.unscaledValue().toString().replaceAll("0+$", "");
        if (digits.isEmpty()) digits = "0";
        int lead = bd.precision() - bd.scale();                                   // digits before the decimal point
        int e10 = lead - 1;
        String body;
        if (e10 >= -4 && e10 < 16) {
            if (lead <= 0) body = "0." + repeat('0', -lead) + digits;
            else if (lead >= digits.length()) body = digits + repeat('0', lead - digits.length()) + ".0";
            else body = digits.substring(0, lead) + "." + digits.substring(lead);
        } else {
            String m = digits.length() == 1 ? digits : digits.substring(0, 1) + "." + digits.substring(1);
            body = m + "e" + (e10 < 0 ? "-" : "+") + String.format(Locale.ROOT, "%02d", Math.abs(e10));
        }
        return d < 0 ? "-" + body : body;
    }

    private static String repeat(char c, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append(c);
        return sb.toString();
    }

    /** The validation JSON re-emitted canonically (sorted keys, Python numbers). */
    private static String pyValidation(String json) {
        try {
            return pyNode(new ObjectMapper().readTree(json));
        } catch (Exception e) {
            return "{}";
        }
    }

    private static String pyNode(JsonNode n) {
        if (n.isObject()) {
            TreeMap<String, JsonNode> sorted = new TreeMap<>();
            Iterator<Map.Entry<String, JsonNode>> it = n.fields();
            while (it.hasNext()) { Map.Entry<String, JsonNode> f = it.next(); sorted.put(f.getKey(), f.getValue()); }
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<String, JsonNode> f : sorted.entrySet()) {
                if (!first) sb.append(',');
                first = false;
                sb.append(pyString(f.getKey())).append(':').append(pyNode(f.getValue()));
            }
            return sb.append('}').toString();
        }
        if (n.isArray()) {
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (JsonNode x : n) { if (!first) sb.append(','); first = false; sb.append(pyNode(x)); }
            return sb.append(']').toString();
        }
        if (n.isTextual()) return pyString(n.asText());
        if (n.isBoolean()) return n.asBoolean() ? "true" : "false";
        if (n.isNull()) return "null";
        if (n.isIntegralNumber()) return n.asText();
        return pyFloat(n.asDouble());
    }
}
