using AMS.Application.Alarms;
using AMS.Application.Alarms.Commands;
using AMS.Domain.Alarms;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace AMS.Infrastructure.Kafka;

public sealed class OperatorActionPublisher : IOperatorActionPublisher
{
    private readonly AlarmEventProducer _producer;
    private readonly LifecycleEventPublisher _lifecycle;
    private readonly KafkaOptions _opts;
    private readonly string? _defaultOpcServerId;
    private readonly ILogger<OperatorActionPublisher> _logger;

    public OperatorActionPublisher(
        AlarmEventProducer producer,
        LifecycleEventPublisher lifecycle,
        IOptions<KafkaOptions> opts,
        IConfiguration configuration,
        ILogger<OperatorActionPublisher> logger)
    {
        _producer  = producer;
        _lifecycle = lifecycle;
        _opts      = opts.Value;
        _defaultOpcServerId = configuration["OpcGateway:DefaultServerId"];
        _logger    = logger;
    }

    public async Task PublishAcknowledgeAsync(
        ActiveAlarm alarm,
        Guid userId,
        string username,
        string? comment,
        string? operatorStation,
        CancellationToken ct = default)
    {
        if (!OpcCookieHelper.IsWritebackAckEligible(alarm))
        {
            var reason = OpcCookieHelper.AckIneligibleReason(alarm);
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(reason)
                ? "Alarm is not eligible for OPC ACK writeback"
                : reason);
        }

        var cookie = OpcCookieHelper.ExtractCookieOffset(alarm);
        var serverId = OpcCookieHelper.ResolveServerId(alarm, _defaultOpcServerId);
        var activeTimeMs = OpcCookieHelper.ExtractActiveTimeEpochMs(alarm);
        var activeFileTime = OpcCookieHelper.ExtractActiveFileTime(alarm);
        var correlation = AckCorrelationContext.CreateNew();
        var requestedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var partitionKey = AlarmPartitionKeys.AssetKey(serverId, alarm.SourceName);

        await _lifecycle.EmitAsync(correlation, alarm.Id.ToString(), partitionKey,
            AckLifecycleStates.Requested,
            $"Operator {username} initiated ACK",
            ct: ct);

        var action = new OperatorActionMessage
        {
            SchemaVersion     = StreamSchemaVersion.Current,
            EventType         = StreamEventTypes.OperatorAckCommand,
            CommandId         = correlation.CommandId,
            CorrelationId     = correlation.CorrelationId,
            LifecycleId       = correlation.NewLifecycleId(),
            ActionId          = correlation.CommandId,
            AlarmId           = alarm.Id.ToString(),
            SourceAlarmId     = alarm.AlarmId,
            SourceEventId     = OpcCookieHelper.ExtractSourceEventId(alarm),
            ActionType        = "ACKNOWLEDGE",
            UserId            = userId.ToString(),
            Username          = username,
            Comment           = comment,
            ActionTimeEpochMs = requestedAt,
            ServerId          = serverId.ToString(),
            SourceName        = alarm.SourceName,
            ConditionName     = alarm.ConditionName,
            SubConditionName  = alarm.SubConditionName,
            ActiveTimeEpochMs = activeTimeMs,
            ActiveFileTime    = activeFileTime,
            CookieOffset      = cookie,
            OperatorStation   = operatorStation,
        };

        await _producer.PublishAsync(
            _opts.OperatorActionsTopic,
            AlarmPartitionKeys.AssetKey(alarm.ServerId, alarm.SourceName),
            action, ct);

        await _lifecycle.EmitAsync(correlation, alarm.Id.ToString(), partitionKey,
            AckLifecycleStates.Queued,
            "Published to operator-actions topic",
            AckLifecycleStates.Requested,
            ct);

        _logger.LogInformation(
            "ACK command published alarm={AlarmId} command={CommandId} correlation={CorrelationId}",
            alarm.Id, correlation.CommandId, correlation.CorrelationId);
    }

}
