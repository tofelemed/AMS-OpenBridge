package com.ams.flink.cplm.replay;

import com.ams.flink.cplm.CplmNormalizedSample;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.source.RichSourceFunction;
import org.apache.iotdb.isession.SessionDataSet;
import org.apache.iotdb.session.Session;
import org.apache.iotdb.tsfile.read.common.Field;
import org.apache.iotdb.tsfile.read.common.RowRecord;

import java.util.List;

/**
 * v2.5 Task 1G.4 (spec v6 R19; NR-056): a BOUNDED source that reads one loop's samples from the
 * historian ({@code root.<site>.cpm.<loop>.{pv,sp,op,vp,mode}}, written by ams-api's
 * RawLoopIotDbConsumer) between {@code fromMs} and {@code toMs}, paged by time so memory is
 * bounded. Parallelism 1 (the replay job is parallelism 1 already).
 *
 * <p>The historian stores VALUES, not quality. A sample read from it is therefore stamped
 * {@code quality = GOOD} under an EXPLICIT, VISIBLE assumption - every role carries
 * {@code quality_protocol = HISTORIAN_ASSUMED} and the replay result carries the observability
 * flag HISTORIAN_QUALITY_ASSUMED - never as a silent default (R04). Held/hold_kind is unknown
 * for historian rows ({@code hold_kind = HISTORIAN}).
 */
public final class IotDbBoundedSource extends RichSourceFunction<CplmNormalizedSample> {
    private static final long serialVersionUID = 1L;
    public static final String QUALITY_PROTOCOL = "HISTORIAN_ASSUMED";
    public static final String OBSERVABILITY_FLAG = "HISTORIAN_QUALITY_ASSUMED";
    private static final long PAGE_MS = 6L * 3600 * 1000;

    private final String host;
    private final int port;
    private final String user;
    private final String password;
    private final String site;
    private final String loopId;
    private final String loopType;
    private final long fromMs;
    private final long toMs;
    private volatile boolean running = true;

    public IotDbBoundedSource(String host, int port, String user, String password,
                              String site, String loopId, String loopType, long fromMs, long toMs) {
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;
        this.site = site;
        this.loopId = loopId;
        this.loopType = loopType;
        this.fromMs = fromMs;
        this.toMs = toMs;
    }

    /** The device path the historian writer uses (site and loop are path-safe identifiers). */
    public static String devicePath(String site, String loopId) {
        return "root." + safe(site) + ".cpm." + safe(loopId);
    }

    static String safe(String s) {
        return s == null ? "unknown" : s.replaceAll("[^A-Za-z0-9_]", "_");
    }

    @Override
    public void open(Configuration parameters) {
    }

    @Override
    public void run(SourceContext<CplmNormalizedSample> ctx) throws Exception {
        Session session = new Session.Builder().host(host).port(port).username(user).password(password).build();
        session.open(false);
        try {
            String device = devicePath(site, loopId);
            long emitted = 0;
            for (long pageStart = fromMs; running && pageStart < toMs; pageStart += PAGE_MS) {
                long pageEnd = Math.min(toMs, pageStart + PAGE_MS);
                String sql = "SELECT pv, sp, op, vp, mode FROM " + device
                        + " WHERE time >= " + pageStart + " AND time < " + pageEnd + " ORDER BY time ASC";
                SessionDataSet ds = session.executeQueryStatement(sql);
                try {
                    List<String> columns = ds.getColumnNames();   // Time, device.pv, device.sp, ...
                    int iPv = indexOf(columns, ".pv"), iSp = indexOf(columns, ".sp"), iOp = indexOf(columns, ".op");
                    int iVp = indexOf(columns, ".vp"), iMode = indexOf(columns, ".mode");
                    while (running && ds.hasNext()) {
                        RowRecord row = ds.next();
                        List<Field> f = row.getFields();
                        Double pv = dbl(f, iPv), sp = dbl(f, iSp), op = dbl(f, iOp);
                        if (pv == null || sp == null || op == null) continue;   // an incomplete row is not a tuple
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
                        synchronized (ctx.getCheckpointLock()) {
                            ctx.collectWithTimestamp(s, s.eventTsMs);
                        }
                        emitted++;
                    }
                } finally {
                    ds.closeOperationHandle();
                }
            }
            System.out.println("IOTDB_SOURCE_DONE loop=" + loopId + " from=" + fromMs + " to=" + toMs + " emitted=" + emitted);
        } finally {
            session.close();
        }
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
            r.qualityNative = QUALITY_PROTOCOL;       // the assumption is written where the native word would be
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

    @Override
    public void cancel() {
        running = false;
    }
}
