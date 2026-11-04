package com.ams.flink.cplm.replay;

import com.ams.flink.cplm.CplmNormalizedSample;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.source.RichSourceFunction;
import org.apache.iotdb.session.Session;


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

    private final String device;

    public IotDbBoundedSource(String host, int port, String user, String password,
                              String site, String loopId, String loopType, long fromMs, long toMs) {
        this(host, port, user, password, null, site, loopId, loopType, fromMs, toMs);
    }

    /** {@code device} is the writer's exact path (CHG-036); null falls back to root.&lt;site&gt;.cpm.&lt;loop&gt;. */
    public IotDbBoundedSource(String host, int port, String user, String password, String device,
                              String site, String loopId, String loopType, long fromMs, long toMs) {
        this.device = device;
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
        return devicePathFor("root." + safe(site) + ".cpm", loopId);
    }

    /** The writer's device: its root prefix (IotDbWriteOptions.LoopRootPrefix, default root.site1.cpm) + SafeNode(loop). */
    public static String devicePathFor(String rootPrefix, String loopId) {
        String prefix = rootPrefix == null || rootPrefix.isEmpty() ? "root.site1.cpm" : rootPrefix;
        while (prefix.endsWith(".")) prefix = prefix.substring(0, prefix.length() - 1);
        return prefix + "." + safeNode(loopId);
    }

    /** Mirrors cplm-api's IotDbWriteClient.SafeNode: non-alphanumerics to '_', a leading digit prefixed with '_'. */
    static String safeNode(String id) {
        if (id == null || id.trim().isEmpty()) return "unknown";
        StringBuilder sb = new StringBuilder(id.length());
        for (char ch : id.toCharArray()) sb.append(Character.isLetterOrDigit(ch) ? ch : '_');
        String out = sb.toString();
        return Character.isDigit(out.charAt(0)) ? "_" + out : out;
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
            String device = this.device != null && !this.device.isEmpty() ? this.device : devicePath(site, loopId);
            // CHG-102 5c: the read loop is shared with the on-demand evaluation job (IotDbLoopReader)
            long emitted = new IotDbLoopReader(device, loopId, loopType, fromMs, toMs).read(IotDbLoopReader.session(session), s -> {
                synchronized (ctx.getCheckpointLock()) {
                    ctx.collectWithTimestamp(s, s.eventTsMs);
                }
            }, () -> running, Long.MAX_VALUE);
            System.out.println("IOTDB_SOURCE_DONE loop=" + loopId + " from=" + fromMs + " to=" + toMs + " emitted=" + emitted);
        } finally {
            session.close();
        }
    }

    @Override
    public void cancel() {
        running = false;
    }
}
