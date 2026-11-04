package com.ams.flink.cplm.replay;

import com.ams.flink.cplm.CplmNormalizedSample;
import org.apache.iotdb.isession.SessionDataSet;
import org.apache.iotdb.session.Session;
import org.apache.iotdb.tsfile.read.common.Field;
import org.apache.iotdb.tsfile.read.common.RowRecord;

import java.io.Serializable;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/**
 * One loop's historian samples ({@code <device>.{pv,sp,op,vp,mode}}) between {@code fromMs} and {@code toMs}, paged by
 * 6 h of time so memory stays bounded. Shared by the bounded replay source ({@link IotDbBoundedSource}) and the
 * always-running on-demand evaluation job (CHG-102 5c), so both read exactly the same rows the same way.
 *
 * <p>The historian stores VALUES, not quality: every sample is stamped {@code quality = GOOD} under the explicit,
 * visible assumption {@link IotDbBoundedSource#QUALITY_PROTOCOL} (see that class). A row missing pv, sp or op is not a
 * tuple and is skipped; a missing mode reads as AUT.
 */
public final class IotDbLoopReader implements Serializable {
    private static final long serialVersionUID = 1L;
    static final long PAGE_MS = 6L * 3600 * 1000;

    /** The rows of one query (an adapter over SessionDataSet, a fake in tests). */
    public interface Rows {
        /** Column names as IoTDB returns them: Time, device.pv, device.sp, ... */
        List<String> columns() throws Exception;
        boolean hasNext() throws Exception;
        RowRecord next() throws Exception;
        void close() throws Exception;
    }

    /** Runs one SELECT. */
    public interface Querier {
        Rows query(String sql) throws Exception;
    }

    /** More rows in the range than the caller allows (the on-demand job's --max-rows). */
    public static final class TooManyRowsException extends Exception {
        private static final long serialVersionUID = 1L;
        public final long limit;

        public TooManyRowsException(long limit, String device) {
            super("more than " + limit + " historian rows on " + device + " in the requested range");
            this.limit = limit;
        }
    }

    private final String device;
    private final String loopId;
    private final String loopType;
    private final long fromMs;
    private final long toMs;

    public IotDbLoopReader(String device, String loopId, String loopType, long fromMs, long toMs) {
        this.device = device;
        this.loopId = loopId;
        this.loopType = loopType;
        this.fromMs = fromMs;
        this.toMs = toMs;
    }

    public String device() {
        return device;
    }

    /** The SELECT of one page (time-ordered, [pageStart, pageEnd)). */
    static String pageSql(String device, long pageStart, long pageEnd) {
        return "SELECT pv, sp, op, vp, mode FROM " + device
                + " WHERE time >= " + pageStart + " AND time < " + pageEnd + " ORDER BY time ASC";
    }

    /**
     * Reads every page and hands each sample to {@code out}; stops early when {@code running} turns false.
     * Returns the samples emitted. More than {@code maxRows} rows read (complete or not) fails the read.
     */
    public long read(Querier querier, Consumer<CplmNormalizedSample> out, BooleanSupplier running, long maxRows) throws Exception {
        long emitted = 0;
        long rows = 0;
        for (long pageStart = fromMs; running.getAsBoolean() && pageStart < toMs; pageStart += PAGE_MS) {
            long pageEnd = Math.min(toMs, pageStart + PAGE_MS);
            Rows ds = querier.query(pageSql(device, pageStart, pageEnd));
            try {
                List<String> columns = ds.columns();
                int iPv = indexOf(columns, ".pv"), iSp = indexOf(columns, ".sp"), iOp = indexOf(columns, ".op");
                int iVp = indexOf(columns, ".vp"), iMode = indexOf(columns, ".mode");
                while (running.getAsBoolean() && ds.hasNext()) {
                    RowRecord row = ds.next();
                    if (++rows > maxRows) throw new TooManyRowsException(maxRows, device);
                    CplmNormalizedSample s = sample(row, iPv, iSp, iOp, iVp, iMode);
                    if (s == null) continue;   // an incomplete row is not a tuple
                    out.accept(s);
                    emitted++;
                }
            } finally {
                ds.close();
            }
        }
        return emitted;
    }

    private CplmNormalizedSample sample(RowRecord row, int iPv, int iSp, int iOp, int iVp, int iMode) {
        List<Field> f = row.getFields();
        Double pv = dbl(f, iPv), sp = dbl(f, iSp), op = dbl(f, iOp);
        if (pv == null || sp == null || op == null) return null;
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = loopId;
        s.loopType = loopType;
        s.eventTsMs = row.getTimestamp();
        s.pv = pv;
        s.sp = sp;
        s.op = op;
        s.vp = dbl(f, iVp);
        String mode = str(f, iMode);
        s.mode = mode == null || mode.isEmpty() ? "AUT" : mode;
        s.quality = "GOOD";                       // explicit assumption, see class doc
        s.isValid = true;
        stampRoles(s);
        return s;
    }

    /** The Querier over an open IoTDB session. */
    public static Querier session(Session session) {
        return sql -> {
            SessionDataSet ds = session.executeQueryStatement(sql);
            return new Rows() {
                @Override public List<String> columns() { return ds.getColumnNames(); }
                @Override public boolean hasNext() throws Exception { return ds.hasNext(); }
                @Override public RowRecord next() throws Exception { return ds.next(); }
                @Override public void close() throws Exception { ds.closeOperationHandle(); }
            };
        };
    }

    private static void stampRoles(CplmNormalizedSample s) {
        for (String role : new String[]{"pv", "sp", "op", "vp", "mode"}) {
            if ("vp".equals(role) && s.vp == null) continue;
            com.ams.flink.cplm.contract.RoleObservation r = new com.ams.flink.cplm.contract.RoleObservation();
            r.role = role;
            switch (role) {
                case "pv": r.value = s.pv; break;
                case "sp": r.value = s.sp; break;
                case "op": r.value = s.op; break;
                case "vp": r.value = s.vp; break;
                default: r.stringValue = s.mode; r.modeNative = s.mode; break;
            }
            r.sampleTsMs = s.eventTsMs;
            r.verifiedTsMs = s.eventTsMs;
            r.quality = "GOOD";
            r.qualityNative = IotDbBoundedSource.QUALITY_PROTOCOL;   // the assumption is written where the native word would be
            r.provenance = "HISTORIAN";
            r.held = false;
            r.ageMs = 0;
            s.roles.put(role, r);
        }
    }

    private static int indexOf(List<String> columns, String suffix) {
        for (int i = 0; i < columns.size(); i++) if (columns.get(i).endsWith(suffix)) return i - 1;   // fields exclude Time
        return -1;
    }

    private static Double dbl(List<Field> f, int i) {
        if (i < 0 || i >= f.size()) return null;
        Field x = f.get(i);
        if (x == null || x.getDataType() == null) return null;
        try {
            switch (x.getDataType()) {
                case DOUBLE: return x.getDoubleV();
                case FLOAT: return (double) x.getFloatV();
                case INT32: return (double) x.getIntV();
                case INT64: return (double) x.getLongV();
                case TEXT: return Double.parseDouble(x.getStringValue());
                default: return null;
            }
        } catch (Exception e) {
            return null;
        }
    }

    private static String str(List<Field> f, int i) {
        if (i < 0 || i >= f.size()) return null;
        Field x = f.get(i);
        if (x == null || x.getDataType() == null) return null;
        return x.getStringValue();
    }
}
