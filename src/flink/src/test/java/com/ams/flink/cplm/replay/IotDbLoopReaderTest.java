package com.ams.flink.cplm.replay;

import com.ams.flink.cplm.CplmNormalizedSample;
import org.apache.iotdb.tsfile.file.metadata.enums.TSDataType;
import org.apache.iotdb.tsfile.read.common.Field;
import org.apache.iotdb.tsfile.read.common.RowRecord;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * CHG-102 5c: the historian read loop shared by the bounded replay source and the on-demand evaluation job - 6 h
 * pages over the requested range, the IoTDB column order, incomplete rows skipped, the quality assumption stamped,
 * and the row cap the on-demand job enforces.
 */
public class IotDbLoopReaderTest {
    private static final long H = 3_600_000L;
    private static final String DEV = "root.hdpe.cpm.FIC_101";

    private static Field dbl(double v) {
        Field f = new Field(TSDataType.DOUBLE);
        f.setDoubleV(v);
        return f;
    }

    private static Field flt(float v) {
        Field f = new Field(TSDataType.FLOAT);
        f.setFloatV(v);
        return f;
    }

    private static Field text(String v) {
        Field f = new Field(TSDataType.TEXT);
        f.setBinaryV(new org.apache.iotdb.tsfile.utils.Binary(v.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        return f;
    }

    private static RowRecord row(long ts, Field pv, Field sp, Field op, Field vp, Field mode) {
        RowRecord r = new RowRecord(ts);
        for (Field f : new Field[]{pv, sp, op, vp, mode}) r.addField(f);
        return r;
    }

    /** A fake querier: records the SQL, answers each page with the rows inside it. */
    private static final class Fake implements IotDbLoopReader.Querier {
        final List<String> sql = new ArrayList<>();
        final List<RowRecord> rows;

        Fake(RowRecord... rows) {
            this.rows = Arrays.asList(rows);
        }

        @Override
        public IotDbLoopReader.Rows query(String q) {
            sql.add(q);
            long from = Long.parseLong(q.replaceAll(".*time >= (\\d+).*", "$1"));
            long to = Long.parseLong(q.replaceAll(".*time < (\\d+).*", "$1"));
            List<RowRecord> page = new ArrayList<>();
            for (RowRecord r : rows) if (r.getTimestamp() >= from && r.getTimestamp() < to) page.add(r);
            Iterator<RowRecord> it = page.iterator();
            return new IotDbLoopReader.Rows() {
                @Override public List<String> columns() {
                    return Arrays.asList("Time", DEV + ".pv", DEV + ".sp", DEV + ".op", DEV + ".vp", DEV + ".mode");
                }
                @Override public boolean hasNext() { return it.hasNext(); }
                @Override public RowRecord next() { return it.next(); }
                @Override public void close() {}
            };
        }
    }

    @Test
    public void readsSixHourPagesInOrderAndStampsTheAssumption() throws Exception {
        long t0 = 1_762_128_000_000L;
        Fake fake = new Fake(
                row(t0, dbl(50.5), dbl(50), dbl(40), null, text("CAS")),
                row(t0 + 7 * H, flt(51.25f), dbl(50), dbl(41), dbl(39), null),
                row(t0 + 8 * H, null, dbl(50), dbl(41), null, null),          // no pv: not a tuple
                row(t0 + 12 * H + 1, dbl(52), dbl(50), dbl(42), null, null));
        List<CplmNormalizedSample> out = new ArrayList<>();
        long n = new IotDbLoopReader(DEV, "FIC-101", "FLOW", t0, t0 + 13 * H).read(fake, out::add, () -> true, Long.MAX_VALUE);
        assertEquals(3, n);
        assertEquals("13 h = three 6 h pages", 3, fake.sql.size());
        assertEquals("SELECT pv, sp, op, vp, mode FROM " + DEV + " WHERE time >= " + t0 + " AND time < " + (t0 + 6 * H) + " ORDER BY time ASC",
                fake.sql.get(0));
        assertTrue(fake.sql.get(2).endsWith("time < " + (t0 + 13 * H) + " ORDER BY time ASC"));
        CplmNormalizedSample a = out.get(0), b = out.get(1);
        assertEquals("FIC-101", a.loopId);
        assertEquals("FLOW", a.loopType);
        assertEquals(50.5, a.pv, 0);
        assertEquals("CAS", a.mode);
        assertNull(a.vp);
        assertEquals("GOOD", a.quality);
        assertEquals(IotDbBoundedSource.QUALITY_PROTOCOL, a.roles.get("pv").qualityNative);
        assertTrue("no vp role without a vp value", !a.roles.containsKey("vp"));
        assertEquals(51.25, b.pv, 0);
        assertEquals("a missing mode reads AUT", "AUT", b.mode);
        assertEquals(39.0, b.vp, 0);
        assertEquals(t0 + 12 * H + 1, out.get(2).eventTsMs);
    }

    @Test
    public void moreRowsThanAllowedFailsTheRead() throws Exception {
        long t0 = 1_762_128_000_000L;
        Fake fake = new Fake(row(t0, dbl(1), dbl(1), dbl(1), null, null), row(t0 + 1, dbl(1), dbl(1), dbl(1), null, null),
                row(t0 + 2, dbl(1), dbl(1), dbl(1), null, null));
        try {
            new IotDbLoopReader(DEV, "FIC-101", null, t0, t0 + H).read(fake, s -> {}, () -> true, 2);
            fail("expected TooManyRowsException");
        } catch (IotDbLoopReader.TooManyRowsException e) {
            assertEquals(2, e.limit);
            assertTrue(e.getMessage().contains(DEV));
        }
    }

    @Test
    public void aCancelStopsBeforeTheNextPage() throws Exception {
        long t0 = 1_762_128_000_000L;
        Fake fake = new Fake(row(t0, dbl(1), dbl(1), dbl(1), null, null));
        long n = new IotDbLoopReader(DEV, "FIC-101", null, t0, t0 + 24 * H).read(fake, s -> {}, () -> false, Long.MAX_VALUE);
        assertEquals(0, n);
        assertTrue(fake.sql.isEmpty());
    }
}
