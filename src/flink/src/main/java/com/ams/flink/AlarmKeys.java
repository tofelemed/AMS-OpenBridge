package com.ams.flink;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

/** Deterministic alarm identity — must match AMS.Api StableGuid (MD5). */
public final class AlarmKeys {
    private AlarmKeys() {}

    public static String alarmKey(String serverId, String source, String condition, String subCondition) {
        return serverId + "|" + source + "|" + condition + "|" + (subCondition == null ? "" : subCondition);
    }

    public static String stableAlarmId(String alarmKey) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hash = md.digest(alarmKey.getBytes(StandardCharsets.UTF_8));
            long msb = 0;
            long lsb = 0;
            for (int i = 0; i < 8; i++) msb = (msb << 8) | (hash[i] & 0xff);
            for (int i = 8; i < 16; i++) lsb = (lsb << 8) | (hash[i] & 0xff);
            return new UUID(msb, lsb).toString();
        } catch (Exception e) {
            return UUID.nameUUIDFromBytes(alarmKey.getBytes(StandardCharsets.UTF_8)).toString();
        }
    }
}
