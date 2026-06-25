package com.ams.sparkplug;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.Pipeline;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Assigns and tracks integer aliases for Sparkplug B metrics.
 *
 * Sparkplug B spec §6.4.15: DBIRTH carries metric name + alias; DDATA carries alias only.
 * Aliases are stable within a session (reset on NBIRTH). They are also persisted
 * to Redis so the BFF snapshot endpoint can resolve alias → metric name without
 * needing to decode birth certificates.
 *
 * Redis key: alias:<group>:<edge>  →  Hash{ "<alias>": "<metricName>" }
 */
public final class MetricAliasRegistry {

    private final Map<String, Long>  nameToAlias = new ConcurrentHashMap<>();
    private final Map<Long, String>  aliasToName = new ConcurrentHashMap<>();
    private final AtomicInteger      counter     = new AtomicInteger(0);

    private final JedisPool jedisPool;
    private final String    redisHashKey;  // alias:<group>:<edge>

    public MetricAliasRegistry(JedisPool jedisPool, String group, String edge) {
        this.jedisPool    = jedisPool;
        this.redisHashKey = "alias:" + group + ":" + edge;
    }

    /**
     * Returns the alias for a metric name, creating one on first call.
     * Thread-safe; alias is written to Redis on creation.
     */
    public long aliasFor(String metricName) {
        return nameToAlias.computeIfAbsent(metricName, name -> {
            long alias = counter.getAndIncrement();
            aliasToName.put(alias, name);
            persistAlias(alias, name);
            return alias;
        });
    }

    public String nameFor(long alias) {
        return aliasToName.getOrDefault(alias, "alias_" + alias);
    }

    public Map<String, Long> allMappings() {
        return Map.copyOf(nameToAlias);
    }

    /** Clears all aliases — called before NBIRTH so aliases restart from 0. */
    public void reset() {
        nameToAlias.clear();
        aliasToName.clear();
        counter.set(0);
        try (Jedis jedis = jedisPool.getResource()) {
            jedis.del(redisHashKey);
        } catch (Exception ignored) {}
    }

    private void persistAlias(long alias, String name) {
        try (Jedis jedis = jedisPool.getResource()) {
            Pipeline pipe = jedis.pipelined();
            pipe.hset(redisHashKey, String.valueOf(alias), name);
            pipe.sync();
        } catch (Exception e) {
            // Non-fatal: alias map is still in-memory; Redis write is best-effort
        }
    }
}
