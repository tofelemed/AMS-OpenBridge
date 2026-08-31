/**
 * Emits RBAC governance events to the platform audit trail (Kafka `traverse.cpa.audit-events`),
 * which audit-service consumes into its immutable hash-chained store (Phase 3).
 *
 * Previously auth-service logged role/permission changes to the app log only, so
 * "who changed which role, when" was not in the tamper-evident audit trail. This
 * connects it, mirroring the .NET AuditEmitter event shape
 * ({ EventType, TimestampUtc, UserId, EntityType, EntityId, BeforeState?, AfterState? }).
 *
 * Best-effort by design: an audit emit must NEVER fail an RBAC operation. The
 * producer connects lazily, and every failure is logged, not thrown. If
 * KAFKA_BOOTSTRAP_SERVERS is unset the emitter is a no-op (local dev without Kafka).
 */

import { Kafka, Producer, logLevel } from 'kafkajs';
import logger from '../config/logger';

const TOPIC = 'traverse.cpa.audit-events';

class AuditEmitter {
  private producer: Producer | null = null;
  private connecting: Promise<void> | null = null;
  private readonly enabled: boolean;

  constructor() {
    const brokers = (process.env.KAFKA_BOOTSTRAP_SERVERS || '')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);
    this.enabled = brokers.length > 0;
    if (!this.enabled) {
      logger.info('KAFKA_BOOTSTRAP_SERVERS not set — RBAC audit emit disabled');
      return;
    }
    const kafka = new Kafka({ clientId: 'auth-service', brokers, logLevel: logLevel.ERROR });
    this.producer = kafka.producer({ allowAutoTopicCreation: true });
  }

  private async ensureConnected(): Promise<void> {
    if (!this.producer) return;
    if (!this.connecting) {
      this.connecting = this.producer.connect().catch((err) => {
        this.connecting = null; // allow a later retry
        throw err;
      });
    }
    return this.connecting;
  }

  /**
   * Fire-and-forget audit emit. `actorUserId` is the admin performing the change;
   * `entityId` is the role name or user id affected.
   */
  emit(
    eventType: string,
    actorUserId: string | undefined,
    entityType: 'Role' | 'User' | 'RolePermissions',
    entityId: string,
    before?: unknown,
    after?: unknown
  ): void {
    if (!this.enabled || !this.producer) return;
    const payload = JSON.stringify({
      EventType: eventType,
      TimestampUtc: new Date().toISOString(),
      UserId: actorUserId ?? 'system',
      EntityType: entityType,
      EntityId: entityId,
      ...(before !== undefined ? { BeforeState: before } : {}),
      ...(after !== undefined ? { AfterState: after } : {}),
    });

    void this.ensureConnected()
      .then(() => this.producer!.send({ topic: TOPIC, messages: [{ value: payload }] }))
      .catch((err) => logger.warn(`RBAC audit emit failed for ${eventType}/${entityId}: ${err?.message ?? err}`));
  }

  async shutdown(): Promise<void> {
    if (this.producer && this.connecting) {
      try { await this.producer.disconnect(); } catch { /* ignore */ }
    }
  }
}

export const auditEmitter = new AuditEmitter();
