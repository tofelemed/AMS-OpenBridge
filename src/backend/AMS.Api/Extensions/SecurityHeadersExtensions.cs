// Security-headers middleware — moved out of Program.cs (Plan 10 B1, verbatim).
namespace AMS.Api.Extensions;

public static class SecurityHeadersExtensions
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app)
        => app.Use(async (ctx, next) =>
        {
            ctx.Response.Headers["X-Content-Type-Options"]  = "nosniff";
            ctx.Response.Headers["X-Frame-Options"]          = "DENY";
            ctx.Response.Headers["X-XSS-Protection"]         = "1; mode=block";
            ctx.Response.Headers["Referrer-Policy"]          = "strict-origin-when-cross-origin";
            ctx.Response.Headers["Permissions-Policy"]       = "geolocation=(), camera=(), microphone=()";
            if (!ctx.Request.IsHttps)
                ctx.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
            await next();
        });
}
