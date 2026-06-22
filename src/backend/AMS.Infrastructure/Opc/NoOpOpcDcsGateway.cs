using AMS.Application.Alarms.Commands;
using Microsoft.Extensions.Logging;

namespace AMS.Infrastructure.Opc;

/// <summary>
/// A no-op implementation of the OPC DCS Gateway.
/// Used after StreamPipes was removed. Replaces StreamPipesOpcWritebackGateway.
/// </summary>
public sealed class NoOpOpcDcsGateway : IOpcDcsGateway
{
    private readonly ILogger<NoOpOpcDcsGateway> _logger;

    public NoOpOpcDcsGateway(ILogger<NoOpOpcDcsGateway> logger)
    {
        _logger = logger;
    }

    public Task AcknowledgeAlarmAsync(Guid serverId, string sourceName, string? comment, CancellationToken ct = default)
    {
        _logger.LogInformation("NoOp Acknowledge for {Source} (direct OPC writeback deferred/disabled).", sourceName);
        return Task.CompletedTask;
    }

    public Task ShelveAlarmAsync(Guid serverId, string sourceName, int durationMinutes, string comment, CancellationToken ct = default)
    {
        _logger.LogWarning("NoOp Shelve for {Source} (direct OPC writeback deferred/disabled).", sourceName);
        return Task.CompletedTask;
    }
}
