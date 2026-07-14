using Microsoft.IdentityModel.Tokens;

namespace Traverse.DisplayService.Auth;

/// <summary>
/// Phase K — resolves the RS256 signing keys published by auth-service at
/// <c>/api/auth/.well-known/jwks.json</c>.
///
/// auth-service is not an OIDC provider (it serves JWKS but no discovery document), so JwtBearer's
/// Authority/metadata flow cannot be used. This cache fetches the key set directly and refreshes it
/// when a token arrives with an unknown <c>kid</c> — which is what happens after auth-service rotates
/// or regenerates its keypair.
/// </summary>
public sealed class JwksKeyCache
{
    private readonly string _jwksUrl;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<JwksKeyCache> _log;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private IReadOnlyCollection<SecurityKey> _keys = Array.Empty<SecurityKey>();
    private DateTimeOffset _fetchedAt = DateTimeOffset.MinValue;

    // Don't hammer the auth service if a caller presents a garbage kid in a loop.
    private static readonly TimeSpan MinRefreshInterval = TimeSpan.FromSeconds(30);

    public JwksKeyCache(IConfiguration config, IHttpClientFactory http, ILogger<JwksKeyCache> log)
    {
        _jwksUrl = config["Auth:JwksUrl"]
                   ?? "http://auth-service:3002/api/auth/.well-known/jwks.json";
        _http = http;
        _log = log;
    }

    /// <summary>Signing-key resolver for <see cref="TokenValidationParameters"/>.</summary>
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
            var jwks = new JsonWebKeySet(json);
            _keys = jwks.GetSigningKeys().ToList();
            _fetchedAt = DateTimeOffset.UtcNow;
            _log.LogInformation("JWKS loaded from {Url}: {Count} signing key(s)", _jwksUrl, _keys.Count);
        }
        catch (Exception ex)
        {
            // Never fail the request pipeline on a transient auth-service outage: with no keys, token
            // validation simply fails and the caller gets 401 (not a 500) until JWKS is reachable.
            _log.LogError(ex, "Failed to fetch JWKS from {Url}", _jwksUrl);
        }
        finally
        {
            _gate.Release();
        }
    }
}
