// Per-route request-body limits (Plan 04 item 5, GW-01).
//
//   ACK endpoints ......... 4 KB   (an acknowledge carries an id + comment, nothing more)
//   display JSON .......... 2 MB   (full display definitions are large but bounded)
//   bulk imports .......... 8 MB   (a whole loop-registry batch in one request)
//   default ............... 256 KB
//
// Enforced two ways: Content-Length is rejected up front with 413, and the per-request
// Kestrel body-size feature is lowered so a chunked upload without Content-Length is cut
// off at the same bound instead of buffering unbounded.
using Microsoft.AspNetCore.Http.Features;

namespace Traverse.Gateway.Limits;

public sealed class BodyLimitMiddleware
{
    private readonly RequestDelegate _next;
    private readonly bool _enabled;
    private readonly long _defaultBytes;
    private readonly long _ackBytes;
    private readonly long _displayBytes;
    private readonly long _bulkBytes;

    public BodyLimitMiddleware(RequestDelegate next, IConfiguration config)
    {
        _next = next;
        _enabled = config.GetValue("BodyLimits:Enabled", true);
        _defaultBytes = config.GetValue("BodyLimits:DefaultBytes", 262_144L);
        _ackBytes     = config.GetValue("BodyLimits:AckBytes", 4_096L);
        _displayBytes = config.GetValue("BodyLimits:DisplayBytes", 2_097_152L);
        _bulkBytes    = config.GetValue("BodyLimits:BulkImportBytes", 8_388_608L);
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        var method = ctx.Request.Method;
        if (!_enabled || HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
        {
            await _next(ctx);
            return;
        }

        var path = ctx.Request.Path;
        long limit;
        if (path.StartsWithSegments("/api/alarms") &&
            (path.Value!.Contains("/acknowledge", StringComparison.OrdinalIgnoreCase) ||
             path.Value!.Contains("/ack", StringComparison.OrdinalIgnoreCase)))
            limit = _ackBytes;
        else if (path.StartsWithSegments("/api/displays"))
            limit = _displayBytes;
        // Bulk onboarding sends the whole batch in one body ON PURPOSE — that is
        // what makes it one mutation instead of N. The 256 KB default rejected
        // ~200 loops, so these routes carry their own (still bounded) cap.
        else if (path.Value!.EndsWith("/bulk-activate", StringComparison.OrdinalIgnoreCase)
                 || path.Value!.EndsWith("/assets/bulk", StringComparison.OrdinalIgnoreCase)
                 || path.Value!.EndsWith("/assets/by-paths", StringComparison.OrdinalIgnoreCase)
                 || path.Value!.EndsWith("/aliases/bulk", StringComparison.OrdinalIgnoreCase))
            limit = _bulkBytes;
        else
            limit = _defaultBytes;

        if (ctx.Request.ContentLength is > 0 && ctx.Request.ContentLength > limit)
        {
            ctx.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
            await ctx.Response.WriteAsJsonAsync(new { error = "Request body too large.", limitBytes = limit });
            return;
        }

        // Chunked bodies without Content-Length: let Kestrel enforce the same bound.
        var feature = ctx.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (feature is { IsReadOnly: false })
            feature.MaxRequestBodySize = limit;

        await _next(ctx);
    }
}
