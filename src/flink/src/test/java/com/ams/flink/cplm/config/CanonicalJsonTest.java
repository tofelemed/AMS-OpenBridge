package com.ams.flink.cplm.config;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 3C.1: the jar canonicalises exactly as cplm-api does (tests/cplm-api.Tests/ConfigLibraryTests
 * Canonical_json_follows_rfc_8785 carries the same vectors), so a bundle's content hash and its HMAC
 * verify on the worker byte for byte.
 */
public class CanonicalJsonTest {
    private static final ObjectMapper M = new ObjectMapper();

    private static JsonNode j(String s) throws Exception {
        return M.readTree(s);
    }

    @Test
    public void followsRfc8785LikeTheApi() throws Exception {
        assertEquals("{\"a\":{\"x\":null,\"y\":true},\"b\":1,\"c\":[3,1,2500,1e+21,1e-7]}",
                CanonicalJson.canonicalize(j("{\"b\":1,\"a\":{\"y\":true,\"x\":null},\"c\":[3,1.0,2.5e3,1e21,0.0000001]}")));
        assertEquals("{\"1\":\"x\",\"é\":\"tab\\tq\\\"\",\"€\":\"a\\u000bb\"}",
                CanonicalJson.canonicalize(j("{\"€\":\"a\\u000bb\",\"é\":\"tab\\tq\\\"\",\"1\":\"x\"}")));
        assertEquals(CanonicalJson.sha256(j("{\"a\":1}")), CanonicalJson.sha256(j("{ \"a\" : 1.0 }")));
        assertTrue(CanonicalJson.sha256(j("{\"a\":1}")).matches("^[0-9a-f]{64}$"));
    }

    @Test
    public void es6Numbers() {
        assertEquals("0", CanonicalJson.es6Number(0));
        assertEquals("0.75", CanonicalJson.es6Number(0.75));
        assertEquals("4.5", CanonicalJson.es6Number(4.5));
        assertEquals("21600", CanonicalJson.es6Number(21600.0));
        assertEquals("0.0001", CanonicalJson.es6Number(1e-4));
        assertEquals("1e-7", CanonicalJson.es6Number(1e-7));
        assertEquals("0.000001", CanonicalJson.es6Number(1e-6));
        assertEquals("1e+21", CanonicalJson.es6Number(1e21));
        assertEquals("100000000000000000000", CanonicalJson.es6Number(1e20));
        assertEquals("-2.5", CanonicalJson.es6Number(-2.5));
        assertEquals("1000000000", CanonicalJson.es6Number(1e9));
        assertEquals("123456789.125", CanonicalJson.es6Number(123456789.125));
    }

    @Test
    public void hmacMatchesTheControlPlane() throws Exception {
        // pinned outside the JVM: python3 -c "import hmac,hashlib; print(hmac.new(b'test-key', b'{\"a\":[1.5,\"x\"],\"b\":1}', hashlib.sha256).hexdigest())"
        assertEquals("{\"a\":[1.5,\"x\"],\"b\":1}", CanonicalJson.canonicalize(j("{\"b\":1,\"a\":[1.5,\"x\"]}")));
        assertEquals("7c01df346976644843429e8459d10fcfec52d0362402b181ecfe1215a82a9461", CanonicalJson.signature(j("{\"b\":1,\"a\":[1.5,\"x\"]}"), "test-key"));
        assertEquals("015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862", CanonicalJson.sha256(j("{ \"a\" : 1.0 }")));
    }
}
