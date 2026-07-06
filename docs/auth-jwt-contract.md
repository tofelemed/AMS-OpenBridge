# Auth JWT Contract (for .NET / other validators)

The Node/Express **auth-service** (`src/services/auth-service`) is the token issuer and
the source of truth for roles and permissions. This document is the contract other
services validate against. **No .NET code is changed by the auth milestone** — this is the
wiring guide for whoever enables real bearer auth later.

## Token facts

| Property | Value |
| --- | --- |
| Algorithm | **RS256** (asymmetric; only auth-service holds the private key) |
| Issuer (`iss`) | `traverse-auth` (env `JWT_ISSUER`) |
| Audience (`aud`) | `ams-services` (env `JWT_AUDIENCE`) |
| Access token lifetime | `15m` (env `JWT_EXPIRES_IN`) |
| Refresh token | `7d`, httpOnly cookie `refresh_token`, path `/api/auth` — **never** sent to other services |
| Public keys (JWKS) | `GET /api/auth/.well-known/jwks.json` (in-cluster: `http://auth-service:3002/...`) |
| `kid` | present in the JWT header; matches the JWKS key id |

### Access-token claims

```json
{
  "sub": "a0000000-0000-0000-0000-000000000001",   // user id (GUID)
  "preferred_username": "admin",
  "email": "admin@local",
  "role": "Admin",                                   // one of Admin|Engineer|Operator|Viewer
  "permission": ["alarm.view", "alarm.acknowledge", "admin.users.edit", "..."],
  "iss": "traverse-auth",
  "aud": "ams-services",
  "iat": 1720000000,
  "exp": 1720000900
}
```

The `permission` claim is an **array** → ASP.NET expands it into multiple
`Claim("permission", <value>)` entries, so the existing policies in
`AMS.Api/Program.cs` (`RequireClaim("permission", "alarm.acknowledge")`, etc.) match with
**no changes**. Because permissions are embedded, the dormant `AddFallbackPermissionClaims`
role→permission mapper (`Program.cs:413-521`) is **not needed** and can be removed.

Permission keys mirror the existing .NET policies:
`alarm.view`, `alarm.acknowledge`, `alarm.acknowledge_batch`, `alarm.shelve`,
`alarm.unshelve`, `alarm.suppress`, `alarm.export`, `soe.view`, `analytics.view`,
`admin.users.edit`, `admin.audit.view`.

## .NET wiring (replaces the TestAuthHandler bypass, `Program.cs:241-248`)

```csharp
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect; // ConfigurationManager

services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var jwksUrl = config["Auth:JwksUrl"]
            ?? "http://auth-service:3002/api/auth/.well-known/jwks.json";

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidIssuer              = config["Auth:Issuer"]   ?? "traverse-auth",
            ValidateAudience         = true,
            ValidAudience            = config["Auth:Audience"] ?? "ams-services",
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            NameClaimType            = "preferred_username",
            RoleClaimType            = "role",
        };

        // Fetch + cache the RS256 public keys from the JWKS endpoint.
        options.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
            jwksUrl,
            new JwksKeySetRetriever(),                       // returns config with the JWKS keys
            new HttpDocumentRetriever { RequireHttps = false }); // plain HTTP inside the cluster
    });
```

`JwksKeySetRetriever` is a tiny `IConfigurationRetriever<OpenIdConnectConfiguration>` that
parses the JWKS body into `JsonWebKeySet` and copies its keys onto an
`OpenIdConnectConfiguration` (the auth-service serves a bare JWKS, not a full OIDC discovery
document). If you prefer no custom retriever, resolve keys inline instead:

```csharp
options.TokenValidationParameters.IssuerSigningKeyResolver = (_, _, kid, _) =>
{
    var json = _httpClientFactory.CreateClient().GetStringAsync(jwksUrl).Result; // cache this!
    return new JsonWebKeySet(json).GetSigningKeys();
};
```

`appsettings.json`:

```json
"Auth": {
  "Issuer": "traverse-auth",
  "Audience": "ams-services",
  "JwksUrl": "http://auth-service:3002/api/auth/.well-known/jwks.json"
}
```

## Notes

- Keep `app.UseAuthentication(); app.UseAuthorization();` (already present).
- The existing `[Authorize(Policy = "...")]` attributes and `AddAuthorizationBuilder`
  policies work unchanged once tokens are validated.
- Frontend origins already allowed by `AllowedOrigins`/`AmsPolicy` CORS: add the auth
  origins if browsers call the API cross-origin (`http://localhost:5174`, `:3000`).
- **Dev caveat:** in `NODE_ENV=development` the auth-service uses an *ephemeral* RS256 key
  (regenerated on restart), so cached JWKS becomes stale after an auth-service restart —
  validators should honor JWKS refresh. For stable keys set `JWT_PRIVATE_KEY` /
  `JWT_PRIVATE_KEY_PATH` and `NODE_ENV=production`.
