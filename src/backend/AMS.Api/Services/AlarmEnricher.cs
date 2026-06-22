using AMS.Application.Alarms.Queries;
using AMS.Domain.Alarms;
using AMS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using AMS.Api.BackgroundServices;

namespace AMS.Api.Services;

/// <summary>
/// Maps active alarm entities to API DTOs with OPC server names and KPI summary.
/// </summary>
public sealed class AlarmEnricher : IAlarmEnricher
{
    private readonly AmsDbContext _ctx;
    private readonly AlarmIngestionOptions _ingest;

    public AlarmEnricher(AmsDbContext ctx, IOptions<AlarmIngestionOptions> ingest)
    {
        _ctx = ctx;
        _ingest = ingest.Value;
    }

    public Task<IReadOnlyList<ActiveAlarmDto>> EnrichAsync(
        IEnumerable<ActiveAlarm> alarms, CancellationToken ct = default)
    {
        var list = alarms.ToList();
        if (list.Count == 0)
            return Task.FromResult<IReadOnlyList<ActiveAlarmDto>>(Array.Empty<ActiveAlarmDto>());

        return Task.FromResult<IReadOnlyList<ActiveAlarmDto>>(
            list.Select(a => MapToDto(a, _ingest.ServerName)).ToList());
    }

    public async Task<AlarmStatsSummary> GetStatsSummaryAsync(Guid? serverId, CancellationToken ct = default)
    {
        var q = _ctx.ActiveAlarms.AsNoTracking()
            .Where(a => a.State == AlarmState.UnacknowledgedUncleared || a.State == AlarmState.AcknowledgedUncleared);

        var rows = await q.Select(a => new { a.Severity, a.Acknowledged }).ToListAsync(ct);

        return new AlarmStatsSummary(
            TotalActive:      rows.Count,
            TotalCritical:    rows.Count(r => r.Severity >= 900),
            TotalHigh:        rows.Count(r => r.Severity >= 700 && r.Severity < 900),
            TotalMedium:      rows.Count(r => r.Severity >= 400 && r.Severity < 700),
            TotalLow:         rows.Count(r => r.Severity >= 100 && r.Severity < 400),
            Unacknowledged:   rows.Count(r => !r.Acknowledged),
            Shelved:          0,
            Suppressed:       0,
            AlarmsPerTenMin:  0,
            FloodActive:      false);
    }

    private ActiveAlarmDto MapToDto(ActiveAlarm a, string serverName)
    {
        var serverId = Guid.TryParse(_ingest.ServerId, out var sid)
            ? sid
            : AlarmIngestionOptions.DefaultHttpFeedServerId;

        var severity = a.Severity;
        var priority = severity switch
        {
            >= 900 => AlarmPriority.Critical,
            >= 700 => AlarmPriority.High,
            >= 400 => AlarmPriority.Medium,
            >= 100 => AlarmPriority.Low,
            _ => AlarmPriority.Diagnostic
        };

        var effectiveState = ResolveEffectiveState(a.State, a.Acknowledged);

        return new ActiveAlarmDto(
            Id:                 a.Id,
            ServerId:           serverId,
            ServerName:         serverName,
            SourceName:         a.SourceName,
            ConditionName:      a.ConditionName,
            SubConditionName:   a.SubConditionName,
            Message:            a.Message,
            Severity:           severity,
            Priority:           priority,
            Category:           AlarmCategory.Process,
            PriorityLabel:      priority.ToString().ToUpperInvariant(),
            StateLabel:         ConvertState(effectiveState),
            State:              effectiveState,
            ConditionActive:    effectiveState == AlarmState.AcknowledgedUncleared || effectiveState == AlarmState.UnacknowledgedUncleared,
            Acknowledged:       a.Acknowledged,
            IsShelved:          false,
            IsSuppressed:       false,
            IsOutOfService:     false,
            QualityGood:        true,
            EventTime:          a.EventTime,
            ActiveTime:         a.EventTime,
            AckTime:            a.Acknowledged ? DateTimeOffset.UtcNow : null,
            AckedByUsername:    null,
            AckComment:         null,
            ShelveUntil:        null,
            ShelveComment:      null,
            SuppressionReason:  null,
            CorrelationId:      null,
            IsRootCause:        false,
            ProcessValue:       null,
            ProcessUnit:        null,
            OpcAttributes:      new Dictionary<string, object>(a.OpcAttributes),
            TimeInAlarm:        DateTimeOffset.UtcNow - a.EventTime,
            AreaPath:           null,
            ServerReceivedAt:   DateTimeOffset.UtcNow,
            LogicalAlarmFamilyId: $"{serverId}|{a.SourceName}|{a.ConditionName}|{a.SubConditionName}",
            InstanceKeySchemaVersion: 1);
    }

    /// <summary>
    /// DB stores simplified state VARCHAR (ACTIVE/ACKNOWLEDGED); reconcile with ack_status for API projection.
    /// </summary>
    private static AlarmState ResolveEffectiveState(AlarmState state, bool acknowledged) =>
        acknowledged && state == AlarmState.UnacknowledgedUncleared
            ? AlarmState.AcknowledgedUncleared
            : !acknowledged && state == AlarmState.AcknowledgedUncleared
                ? AlarmState.UnacknowledgedUncleared
                : state;

    private static string ConvertState(AlarmState s) => s switch
    {
        AlarmState.UnacknowledgedUncleared => "UNACKNOWLEDGED_UNCLEARED",
        AlarmState.AcknowledgedUncleared   => "ACKNOWLEDGED_UNCLEARED",
        AlarmState.UnacknowledgedCleared   => "UNACKNOWLEDGED_CLEARED",
        AlarmState.AcknowledgedCleared     => "ACKNOWLEDGED_CLEARED",
        AlarmState.Shelved                 => "SHELVED",
        AlarmState.SuppressedByDesign      => "SUPPRESSED_BY_DESIGN",
        AlarmState.OutOfService            => "OUT_OF_SERVICE",
        AlarmState.Inhibited               => "INHIBITED",
        _                                  => "UNKNOWN"
    };
}
