package com.ams.flink.cplm.ondemand;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmParameterUpdateReader;
import com.ams.flink.cplm.replay.IotDbLoopReader;
import org.apache.iotdb.session.Session;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * CHG-102 5c: the two things an evaluation reads besides its request - the loop's historian samples and the registry's
 * parameter set - behind small seams, so the operator is tested without IoTDB or Kafka.
 */
public final class EvaluationSources {
    private EvaluationSources() {}

    /** One loop's samples in [fromMs, toMs); more than maxRows rows throws {@link IotDbLoopReader.TooManyRowsException}. */
    public interface Historian extends Serializable {
        List<CplmNormalizedSample> read(String device, String loopId, String loopType, long fromMs, long toMs, long maxRows) throws Exception;
    }

    /** The registry's parameter-set updates (compacted metadata topic), read from the beginning. */
    public interface Parameters extends Serializable {
        List<String> read() throws Exception;
    }

    /**
     * IoTDB through {@link IotDbLoopReader}: one session per request (a request is seconds of work; a session ms).
     * Null credentials are read from the TaskManager's environment when the request runs (IOTDB_USER, IOTDB_PASS or the
     * older IOTDB_PASSWORD; root/root otherwise) - the job graph is built in the submitting container, which carries none.
     */
    public static final class IotDbHistorian implements Historian {
        private static final long serialVersionUID = 1L;
        private final String host;
        private final int port;
        private final String user;
        private final String password;

        public IotDbHistorian(String host, int port, String user, String password) {
            this.host = host;
            this.port = port;
            this.user = user;
            this.password = password;
        }

        @Override
        public List<CplmNormalizedSample> read(String device, String loopId, String loopType, long fromMs, long toMs, long maxRows) throws Exception {
            java.util.Map<String, String> env = System.getenv();
            String u = user != null ? user : com.ams.flink.cplm.CplmHistoricalReplayJob.envFirst(env, "root", "IOTDB_USER");
            String p = password != null ? password : com.ams.flink.cplm.CplmHistoricalReplayJob.envFirst(env, "root", "IOTDB_PASS", "IOTDB_PASSWORD");
            Session session = new Session.Builder().host(host).port(port).username(u).password(p).build();
            session.open(false);
            try {
                List<CplmNormalizedSample> out = new ArrayList<>();
                new IotDbLoopReader(device, loopId, loopType, fromMs, toMs)
                        .read(IotDbLoopReader.session(session), out::add, () -> true, maxRows);
                return out;
            } finally {
                session.close();
            }
        }
    }

    /** The parameter set as the bounded jobs read it ({@link CplmParameterUpdateReader}). */
    public static final class KafkaParameters implements Parameters {
        private static final long serialVersionUID = 1L;
        private final String brokers;

        public KafkaParameters(String brokers) {
            this.brokers = brokers;
        }

        @Override
        public List<String> read() {
            return CplmParameterUpdateReader.readParameterUpdates(brokers);
        }
    }
}
