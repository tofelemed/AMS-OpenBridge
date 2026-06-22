using System;
using System.Text.Json;

namespace AMS.AuditService.Models;

public class AuditEvent
{
    public Guid EventId { get; set; } = Guid.NewGuid();
    public DateTimeOffset TimestampUtc { get; set; } = DateTimeOffset.UtcNow;
    public string EventType { get; set; } = string.Empty; // e.g., ALARM_ACKNOWLEDGED, LOGIN_FAILED
    public string UserId { get; set; } = string.Empty;
    public string SourceIp { get; set; } = string.Empty;
    public string Station { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty; // e.g., Alarm, User, Topology
    public string EntityId { get; set; } = string.Empty;
    
    // JSON payloads representing state changes
    public JsonDocument? BeforeState { get; set; }
    public JsonDocument? AfterState { get; set; }
    
    public string? CorrelationId { get; set; } // Links to root-cause-id or trace-id

    // Cryptographic Chain
    public string PreviousHash { get; set; } = string.Empty;
    public string CurrentHash { get; set; } = string.Empty;
}
