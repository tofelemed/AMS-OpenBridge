// A circuit breaker around the limiter's Redis: after N consecutive failures the gateway stops
// asking Redis for a while and decides from its own counters, so a sick Redis costs one request one
// bounded timeout instead of every request for as long as Redis is sick. When the open period ends
// the next request probes Redis (half-open); a failure re-opens it at once, a success closes it.
namespace Traverse.Gateway.RateLimit;

public sealed class RedisCircuit
{
    private readonly int _threshold;
    private readonly TimeSpan _openFor;
    private readonly object _gate = new();
    private int _consecutiveFailures;
    private DateTimeOffset? _openUntil;
    private DateTimeOffset? _lastFailure;
    private int _trips;

    public RedisCircuit(int failureThreshold = 3, TimeSpan? openFor = null)
    {
        _threshold = Math.Max(1, failureThreshold);
        _openFor = openFor ?? TimeSpan.FromSeconds(30);
    }

    /// <summary>True while the breaker is open: do not call Redis, decide locally.</summary>
    public bool IsOpen(DateTimeOffset now)
    {
        lock (_gate) return _openUntil is { } until && until > now;
    }

    /// <summary>Records a failed Redis call; returns true when this failure tripped (or re-tripped) the breaker.</summary>
    public bool RecordFailure(DateTimeOffset now)
    {
        lock (_gate)
        {
            _consecutiveFailures++;
            _lastFailure = now;
            if (_consecutiveFailures < _threshold) return false;
            var wasOpen = _openUntil is { } u && u > now;
            _openUntil = now + _openFor;
            if (!wasOpen) _trips++;
            return !wasOpen;
        }
    }

    /// <summary>Records a successful Redis call: the breaker closes and the failure count resets.</summary>
    public void RecordSuccess()
    {
        lock (_gate)
        {
            _consecutiveFailures = 0;
            _openUntil = null;
        }
    }

    public RedisCircuitStatus Status(DateTimeOffset now)
    {
        lock (_gate) return new(_openUntil is { } u && u > now, _consecutiveFailures, _openUntil, _lastFailure, _trips);
    }
}

public sealed record RedisCircuitStatus(bool Open, int ConsecutiveFailures, DateTimeOffset? OpenUntil, DateTimeOffset? LastFailure, int Trips);
