package com.ams.flink.cplm.config;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * v2.5 Task 3C.1 (spec v6 §5.3): RFC 8785 JSON Canonicalization Scheme, the same rules cplm-api
 * applies (Config/CanonicalJson.cs) - keys sorted by UTF-16 code units, no whitespace, numbers in
 * ES6 Number::toString form, strings with only the mandatory escapes - so a bundle's content hash
 * and its HMAC-SHA256 signature verify on the worker from the bytes the control plane signed.
 */
public final class CanonicalJson {
    private CanonicalJson() {}

    public static String canonicalize(JsonNode n) {
        StringBuilder sb = new StringBuilder();
        write(sb, n);
        return sb.toString();
    }

    public static String sha256(JsonNode n) {
        return sha256Hex(canonicalize(n));
    }

    public static String sha256Hex(String text) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** HMAC-SHA256 (hex, lower case) over the canonical text with the UTF-8 bytes of the key: the bundle signature. */
    public static String signature(JsonNode bundle, String key) {
        return hmacSha256Hex(key, canonicalize(bundle));
    }

    public static String hmacSha256Hex(String key, String text) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return hex(mac.doFinal(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    private static void write(StringBuilder sb, JsonNode n) {
        if (n == null || n.isNull() || n.isMissingNode()) { sb.append("null"); return; }
        if (n.isObject()) {
            List<String> keys = new ArrayList<>();
            Iterator<String> it = n.fieldNames();
            while (it.hasNext()) keys.add(it.next());
            Collections.sort(keys);                                   // String.compareTo = UTF-16 code unit order
            sb.append('{');
            boolean first = true;
            for (String k : keys) {
                if (!first) sb.append(',');
                first = false;
                writeString(sb, k);
                sb.append(':');
                write(sb, n.get(k));
            }
            sb.append('}');
        } else if (n.isArray()) {
            sb.append('[');
            boolean first = true;
            for (JsonNode item : n) {
                if (!first) sb.append(',');
                first = false;
                write(sb, item);
            }
            sb.append(']');
        } else if (n.isTextual()) {
            writeString(sb, n.asText());
        } else if (n.isNumber()) {
            sb.append(es6Number(n.asDouble()));
        } else if (n.isBoolean()) {
            sb.append(n.asBoolean() ? "true" : "false");
        } else {
            sb.append("null");
        }
    }

    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch));
                    else sb.append(ch);
            }
        }
        sb.append('"');
    }

    /** ES6 Number::toString (RFC 8785 §3.2.2.3): shortest round-trip digits, positional for 1e-7 &lt;= |x| &lt; 1e21, else exponent form. */
    public static String es6Number(double d) {
        if (d == 0) return "0";
        if (Double.isNaN(d) || Double.isInfinite(d)) throw new IllegalArgumentException("non-finite numbers cannot be canonicalised");
        String r = Double.toString(Math.abs(d));                    // shortest round-trip digits: "2500.0", "1.0E-4", "0.75"
        String mant;
        int exp = 0;
        int e = r.indexOf('E');
        if (e >= 0) { mant = r.substring(0, e); exp = Integer.parseInt(r.substring(e + 1)); } else mant = r;
        int point = mant.indexOf('.');
        String digitsRaw = mant.replace(".", "");
        int intLen = (point < 0 ? mant.length() : point) + exp;
        String noLead = stripLeading(digitsRaw);
        int leadingZeros = digitsRaw.length() - noLead.length();
        String digits = stripTrailing(noLead);
        if (digits.isEmpty()) return "0";
        int n = intLen - leadingZeros;                                // decimal point position relative to the first significant digit
        int k = digits.length();
        String body;
        if (k <= n && n <= 21) body = digits + zeros(n - k);
        else if (0 < n && n <= 21) body = digits.substring(0, n) + "." + digits.substring(n);
        else if (-6 < n && n <= 0) body = "0." + zeros(-n) + digits;
        else {
            int ex = n - 1;
            String m = k == 1 ? digits : digits.substring(0, 1) + "." + digits.substring(1);
            body = m + "e" + (ex < 0 ? "-" : "+") + Math.abs(ex);
        }
        return d < 0 ? "-" + body : body;
    }

    private static String stripLeading(String s) {
        int i = 0;
        while (i < s.length() && s.charAt(i) == '0') i++;
        return s.substring(i);
    }

    private static String stripTrailing(String s) {
        int i = s.length();
        while (i > 0 && s.charAt(i - 1) == '0') i--;
        return s.substring(0, i);
    }

    private static String zeros(int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append('0');
        return sb.toString();
    }

    /** Convenience for tests and tools: canonical text of a map-like structure already parsed. */
    public static String canonicalizeEntries(Map<String, JsonNode> fields) {
        StringBuilder sb = new StringBuilder("{");
        List<String> keys = new ArrayList<>(fields.keySet());
        Collections.sort(keys);
        boolean first = true;
        for (String k : keys) {
            if (!first) sb.append(',');
            first = false;
            writeString(sb, k);
            sb.append(':');
            write(sb, fields.get(k));
        }
        return sb.append('}').toString();
    }
}
