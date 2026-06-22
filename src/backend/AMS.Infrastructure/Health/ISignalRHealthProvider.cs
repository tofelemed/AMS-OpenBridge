namespace AMS.Infrastructure.Health;

public interface ISignalRHealthProvider
{
    int ActiveConnectionCount { get; }
}
