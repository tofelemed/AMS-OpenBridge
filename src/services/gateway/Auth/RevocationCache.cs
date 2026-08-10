// Edge revocation (Plan 04 §2 — "the single enforcement point").
//
// auth-service owns the revocation truth: every role/permission/password change or user
// deactivation bumps that user's credentials_changed_at (Plan 03 / RBAC build). This cache
// polls auth-service's internal endpoint every few seconds and keeps an in-memory snapshot
// of recently-revoked users, so the gateway rejects a signature-valid token whose owner was
// revoked — within seconds, with no per-request dependency on auth-service or its database.
//
// Failure semantics: if a poll fails the LAST snapshot is kept (fail-open, logged). The
// 15-minute access-token TTL remains the hard backstop, identical to the pre-gateway world.
using System.Collections.Concurrent;
using System.Net.Http.Json;

namespace Traverse.Gateway.Auth;

public sealed class RevocationCache : BackgroundService
{
    private sealed record RevocationEntry(string user_id, long changed, bool is_active);
    private sealed record RevocationResponse(List<RevocationEntry> data);

    private readonly IHttpClientFactory _http;
    private readonly ILogger<RevocationCache> _log;
    private readonly string _url;
    private readonly string _serviceKey;
    private readonly TimeSpan _pollInterval;

    // Snapshot semantics: rebuilt wholesale on every successful poll (self-pruning).
    private volatile ConcurrentDictionary<string, (long Changed, bool Inactive)> _revoked = new();

    public RevocationCache(IConfiguration config, IHttpClientFactory http, ILogger<RevocationCache> log)
    {
        _http = http;
        _log = log;
        var authBase = (config["Auth:AuthServiceUrl"] ?? "http://auth-service:3002").TrimEnd('/');
        _url = authBase + "/api/auth/internal/revocations";
        _serviceKey = config["Auth:ServiceKey"] ?? "";
        _pollInterval = TimeSpan.FromSeconds(config.GetValue("Auth:RevocationPollSeconds", 5));
    }

    /// <summary>True if this subject's token (issued at <paramref name="issuedAtEpoch"/>) is revoked.</summary>
    public bool IsRevoked(string subject, long issuedAtEpoch)
    {
        if (!_revoked.TryGetValue(subject, out var entry)) return false;
        return entry.Inactive || issuedAtEpoch < entry.Changed;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrEmpty(_serviceKey))
        {
            _log.LogWarning(
                "Auth:ServiceKey is not configured — edge revocation polling is DISABLED. " +
                "Tokens remain bounded by their 15-minute TTL only.");
            return;
        }

        _log.LogInformation("Edge revocation polling {Url} every {Seconds}s",
            _url, _pollInterval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // 30-minute window: any token older than that is past the 15m TTL anyway.
                var since = DateTimeOffset.UtcNow.AddMinutes(-30).ToUnixTimeSeconds();
                var client = _http.CreateClient();
                var req = new HttpRequestMessage(HttpMethod.Get, $"{_url}?sinceEpoch={since}");
                req.Headers.Add("X-Service-Key", _serviceKey);
                var res = await client.SendAsync(req, stoppingToken);
                res.EnsureSuccessStatusCode();

                var payload = await res.Content.ReadFromJsonAsync<RevocationResponse>(stoppingToken);
                var fresh = new ConcurrentDictionary<string, (long, bool)>();
                foreach (var e in payload?.data ?? new List<RevocationEntry>())
                    fresh[e.user_id] = (e.changed, !e.is_active);
                _revoked = fresh;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex,
                    "Revocation poll failed — keeping the previous snapshot ({Count} entries)",
                    _revoked.Count);
            }

            try { await Task.Delay(_pollInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
