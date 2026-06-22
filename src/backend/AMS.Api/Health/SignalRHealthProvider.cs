using AMS.Api.Hubs;
using AMS.Infrastructure.Health;

namespace AMS.Api.Health;

public sealed class SignalRHealthProvider : ISignalRHealthProvider
{
    public int ActiveConnectionCount => AlarmHub.TotalConnections;
}
