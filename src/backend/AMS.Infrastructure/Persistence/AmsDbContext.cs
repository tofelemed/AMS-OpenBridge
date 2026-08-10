using System.Text.Json;
using AMS.Domain.Alarms;
using AMS.Domain.Connectivity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AMS.Infrastructure.Persistence;

public sealed class AmsDbContext : DbContext
{
    public AmsDbContext(DbContextOptions<AmsDbContext> options) : base(options) { }

    public DbSet<ActiveAlarm> ActiveAlarms => Set<ActiveAlarm>();
    public DbSet<OpcConnection> OpcConnections => Set<OpcConnection>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.HasDefaultSchema("alarms");
        mb.ApplyConfigurationsFromAssembly(typeof(AmsDbContext).Assembly);
        base.OnModelCreating(mb);
    }
}

public sealed class ActiveAlarmConfiguration : IEntityTypeConfiguration<ActiveAlarm>
{
    public void Configure(EntityTypeBuilder<ActiveAlarm> b)
    {
        b.ToTable("alarm_current", "alarms");

        b.HasKey(a => a.Id);
        b.Property(a => a.Id).HasColumnName("id").ValueGeneratedNever();

        b.Property(a => a.AlarmId).HasColumnName("alarm_id").IsRequired();
        // DATA-01: server_id is part of the alarm's identity
        // (server + source + condition + subCondition) and is backed by
        // uq_alarm_current_identity. It was previously unmapped, which let two
        // OPC servers exposing the same tag name collide in the projection.
        b.Property(a => a.ServerId).HasColumnName("server_id").IsRequired();
        b.Property(a => a.SourceName).HasColumnName("source").IsRequired();
        b.Property(a => a.Severity).HasColumnName("severity").IsRequired();
        b.Property(a => a.Message).HasColumnName("message");
        b.Property(a => a.ConditionName).HasColumnName("condition");
        b.Property(a => a.SubConditionName).HasColumnName("sub_condition");
        b.Property(a => a.EventTime).HasColumnName("event_time").HasColumnType("timestamptz(3)");
        b.Property(a => a.Acknowledged).HasColumnName("ack_status");

        b.Property(a => a.OpcAttributes)
            .HasColumnName("opc_attributes")
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, JsonOpts),
                v => string.IsNullOrWhiteSpace(v)
                    ? new Dictionary<string, object>()
                    : JsonSerializer.Deserialize<Dictionary<string, object>>(v, JsonOpts) ?? new Dictionary<string, object>())
            .Metadata.SetValueComparer(new ValueComparer<Dictionary<string, object>>(
                (a, b) => JsonSerializer.Serialize(a, JsonOpts) == JsonSerializer.Serialize(b, JsonOpts),
                v => JsonSerializer.Serialize(v, JsonOpts).GetHashCode(),
                v => JsonSerializer.Deserialize<Dictionary<string, object>>(
                    JsonSerializer.Serialize(v, JsonOpts), JsonOpts) ?? new Dictionary<string, object>()));

        // The schema uses "state" as VARCHAR(64). ActiveAlarm uses enum AlarmState.
        b.Property(a => a.State)
            .HasColumnName("state")
            .HasConversion(
                v => ConvertToDb(v),
                v => ConvertFromDb(v)
            );

        // Ignored properties to match the new simple table schema without throwing errors:
        b.Ignore(a => a.CreatedAt);
        b.Ignore(a => a.UpdatedAt);
        b.Ignore(a => a.AlarmTagId);
        b.Ignore(a => a.EventType);
        b.Ignore(a => a.Priority);
        b.Ignore(a => a.Category);
        b.Ignore(a => a.Quality);
        b.Ignore(a => a.QualityGood);
        b.Ignore(a => a.ConditionActive);
        b.Ignore(a => a.ActiveTime);
        b.Ignore(a => a.AckTime);
        b.Ignore(a => a.AckedBy);
        b.Ignore(a => a.AckComment);
        b.Ignore(a => a.ServerReceivedAt);
        // DOM-02: shelving is now persisted. These were ignored, so an operator's
        // shelve was lost on the next reload and shelve expiry had nothing to act on.
        b.Property(a => a.IsShelved).HasColumnName("is_shelved");
        b.Property(a => a.ShelveUntil).HasColumnName("shelve_until").HasColumnType("timestamptz(3)");
        b.Property(a => a.IsSuppressed).HasColumnName("is_suppressed");
        b.Ignore(a => a.ShelvedAt);
        b.Property(a => a.ShelvedBy).HasColumnName("shelved_by");
        b.Ignore(a => a.ShelveComment);
        b.Ignore(a => a.SuppressedAt);
        b.Ignore(a => a.SuppressedBy);
        b.Ignore(a => a.SuppressionReason);
        b.Ignore(a => a.IsOutOfService);
        b.Ignore(a => a.CorrelationId);
        b.Ignore(a => a.RootCauseAlarmId);
        b.Ignore(a => a.IsRootCause);
        b.Ignore(a => a.ProcessValue);
        b.Ignore(a => a.ProcessUnit);
        b.Ignore(a => a.CustomAttributes);
        b.Ignore(a => a.KafkaOffset);
        b.Ignore(a => a.KafkaPartition);
        b.Ignore(a => a.KafkaTopic);
        b.Ignore(a => a.DomainEvents);
    }

    private static string ConvertToDb(AlarmState v)
    {
        return v switch
        {
            AlarmState.UnacknowledgedUncleared => "ACTIVE",
            AlarmState.AcknowledgedUncleared => "ACTIVE",
            AlarmState.UnacknowledgedCleared => "CLEARED",
            AlarmState.AcknowledgedCleared => "CLEARED",
            AlarmState.Shelved => "SHELVED",
            AlarmState.SuppressedByDesign => "SUPPRESSED",
            AlarmState.OutOfService => "OUT_OF_SERVICE",
            AlarmState.Inhibited => "INHIBITED",
            _ => v.ToString().ToUpperInvariant()
        };
    }

    private static AlarmState ConvertFromDb(string v)
    {
        return v.ToUpperInvariant() switch
        {
            "ACTIVE" => AlarmState.UnacknowledgedUncleared,
            "CLEARED" => AlarmState.UnacknowledgedCleared,  // ack_status col disambiguates; both excluded from active query
            "ACKNOWLEDGED" => AlarmState.AcknowledgedUncleared,
            "UNACKNOWLEDGED_UNCLEARED" => AlarmState.UnacknowledgedUncleared,
            "ACKNOWLEDGED_UNCLEARED" => AlarmState.AcknowledgedUncleared,
            "UNACKNOWLEDGED_CLEARED" => AlarmState.UnacknowledgedCleared,
            "ACKNOWLEDGED_CLEARED" => AlarmState.AcknowledgedCleared,
            "SHELVED" => AlarmState.Shelved,
            "SUPPRESSED" => AlarmState.SuppressedByDesign,
            "SUPPRESSED_BY_DESIGN" => AlarmState.SuppressedByDesign,
            "OUT_OF_SERVICE" => AlarmState.OutOfService,
            "INHIBITED" => AlarmState.Inhibited,
            _ => System.Enum.TryParse<AlarmState>(v, true, out var result) ? result : AlarmState.UnacknowledgedUncleared
        };
    }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
}
