using AMS.Domain.Connectivity;
using AMS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AMS.Infrastructure.Repositories;

public sealed class OpcConnectionMetricsEnricher
{
    private readonly AmsDbContext _db;

    public OpcConnectionMetricsEnricher(AmsDbContext db) => _db = db;

    public async Task EnrichAsync(OpcConnection connection, CancellationToken ct)
    {
        if (connection.Status == OpcConnectionStatus.Connected)
            connection.PipelineStatus = OpcConnectionPipelineStatus.Running;
        else if (connection.Status == OpcConnectionStatus.Connecting)
            connection.PipelineStatus = OpcConnectionPipelineStatus.Reconnecting;
        else if (connection.Status == OpcConnectionStatus.Error)
            connection.PipelineStatus = OpcConnectionPipelineStatus.Error;
        else
            connection.PipelineStatus = OpcConnectionPipelineStatus.Stopped;

        var since = DateTimeOffset.UtcNow.AddMinutes(-1);
        var stats = await _db.ActiveAlarms
            .AsNoTracking()
            .Where(a => a.EventTime >= since)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Count = g.Count(),
                LastEvent = g.Max(a => a.EventTime)
            })
            .FirstOrDefaultAsync(ct);

        if (stats is not null)
        {
            connection.EventsPerSec = Math.Round(stats.Count / 60.0, 2);
            connection.LastEventUtc = stats.LastEvent;
        }
    }

    public async Task EnrichAllAsync(IReadOnlyList<OpcConnection> connections, CancellationToken ct)
    {
        foreach (var c in connections)
            await EnrichAsync(c, ct);
    }
}
