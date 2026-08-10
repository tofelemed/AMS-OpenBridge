// Same JWKS-fetch pattern the estate's services use (see src/services/_shared/TraverseAuth.cs):
// auth-service publishes JWKS but no OIDC discovery document, so JwtBearer's Authority flow can't
// be used — the key set is fetched directly and re-fetched when an unknown `kid` shows up (which
// is exactly what happens during a key rotation overlap, AUTH-06).
using Microsoft.IdentityModel.Tokens;

namespace Traverse.Gateway.Auth;

public sealed class JwksKeyCache
{
    private readonly string _jwksUrl;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<JwksKeyCache> _log;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private IReadOnlyCollection<SecurityKey> _keys = Array.Empty<SecurityKey>();
    private DateTimeOffset _fetchedAt = DateTimeOffset.MinValue;
    private static readonly TimeSpan MinRefreshInterval = TimeSpan.FromSeconds(30);

    public JwksKeyCache(IConfiguration config, IHttpClientFactory http, ILogger<JwksKeyCache> log)
    {
        _jwksUrl = config["Auth:JwksUrl"] ?? "http://auth-service:3002/api/auth/.well-known/jwks.json";
        _http = http;
        _log = log;
    }

    public IEnumerable<SecurityKey> Resolve(string token, SecurityToken securityToken, string kid,
                                            TokenValidationParameters parameters)
    {
        var keys = _keys;
        if (keys.Count == 0 || (kid is not null && !keys.Any(k => k.KeyId == kid)))
        {
            RefreshAsync().GetAwaiter().GetResult();
            keys = _keys;
        }
        return kid is null ? keys : keys.Where(k => k.KeyId == kid);
    }

    public async Task RefreshAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            if (DateTimeOffset.UtcNow - _fetchedAt < MinRefreshInterval && _keys.Count > 0) return;

            var json = await _http.CreateClient().GetStringAsync(_jwksUrl, ct);
            _keys = new JsonWebKeySet(json).GetSigningKeys().ToList();
            _fetchedAt = DateTimeOffset.UtcNow;
            _log.LogInformation("JWKS loaded from {Url}: {Count} signing key(s)", _jwksUrl, _keys.Count);
        }
        catch (Exception ex)
        {
            // Never crash on a transient auth-service outage: with no keys, validation fails and
            // callers get 401 until JWKS is reachable again.
            _log.LogError(ex, "Failed to fetch JWKS from {Url}", _jwksUrl);
        }
        finally
        {
            _gate.Release();
        }
    }
}
