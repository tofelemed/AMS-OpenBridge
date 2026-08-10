// Edge-only authentication (MIGRATION_LOG decision #16, Plan 04 final lockdown).
//
// The API gateway is the platform's single JWT validator: it validates the RS256 token
// against auth-service JWKS (including SignalR's ?access_token=), enforces revocation,
// strips client-supplied X-Auth-* headers, and forwards the caller's identity as
// X-Auth-Subject / X-Auth-Username / X-Auth-Role / X-Auth-Permissions.
//
// This handler does NO cryptography — it materialises that forwarded identity into a
// ClaimsPrincipal so the existing permission policies (alarm.view, alarm.acknowledge,
// system.manage, …) and the [Authorize] hubs keep working unchanged. Safe only because
// ams-api's port is not published: the gateway is the sole way in from outside the
// compose network (on-prem adds gateway↔service mTLS).
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace AMS.Api.Auth;

public sealed class GatewayHeaderAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "GatewayHeaders";

    public GatewayHeaderAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var subject = Request.Headers["X-Auth-Subject"].ToString();
        if (string.IsNullOrEmpty(subject))
            return Task.FromResult(AuthenticateResult.NoResult());

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, subject),
            new("sub", subject),
        };
        var username = Request.Headers["X-Auth-Username"].ToString();
        if (!string.IsNullOrEmpty(username))
        {
            claims.Add(new Claim("preferred_username", username));
            claims.Add(new Claim(ClaimTypes.Name, username));
        }
        var role = Request.Headers["X-Auth-Role"].ToString();
        if (!string.IsNullOrEmpty(role))
        {
            claims.Add(new Claim("role", role));
            claims.Add(new Claim(ClaimTypes.Role, role));
        }
        claims.AddRange(Request.Headers["X-Auth-Permissions"].ToString()
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(p => new Claim("permission", p)));

        var identity = new ClaimsIdentity(claims, SchemeName);
        return Task.FromResult(AuthenticateResult.Success(
            new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
}
