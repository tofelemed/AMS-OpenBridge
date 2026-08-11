// Registration groups — extracted verbatim from Program.cs (Plan 10 B2).
// Each method is one cohesive concern; Program.cs composes them top-to-bottom.
using AMS.Infrastructure.Health;
using Asp.Versioning;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.OpenApi.Models;
using System.Threading.RateLimiting;

namespace AMS.Api.Extensions;

public static class ServiceCollectionExtensions
{
    /// <summary>Edge-only authentication + the RBAC permission policies (unchanged since Plan 04).</summary>
    public static IServiceCollection AddAmsAuthPolicies(this IServiceCollection services)
    {
        services.AddAuthentication(Auth.GatewayHeaderAuthHandler.SchemeName)
            .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions,
                       Auth.GatewayHeaderAuthHandler>(
                Auth.GatewayHeaderAuthHandler.SchemeName, _ => { });

        services.AddAuthorizationBuilder()
            .AddPolicy("alarm.view",             p => p.RequireClaim("permission", "alarm.view"))
            .AddPolicy("alarm.acknowledge",      p => p.RequireClaim("permission", "alarm.acknowledge"))
            .AddPolicy("alarm.acknowledge_batch",p => p.RequireClaim("permission", "alarm.acknowledge_batch"))
            .AddPolicy("alarm.shelve",           p => p.RequireClaim("permission", "alarm.shelve"))
            .AddPolicy("alarm.unshelve",         p => p.RequireClaim("permission", "alarm.unshelve"))
            .AddPolicy("alarm.suppress",         p => p.RequireClaim("permission", "alarm.suppress"))
            .AddPolicy("alarm.export",           p => p.RequireClaim("permission", "alarm.export"))
            .AddPolicy("soe.view",               p => p.RequireClaim("permission", "soe.view"))
            .AddPolicy("analytics.view",         p => p.RequireClaim("permission", "analytics.view"))
            .AddPolicy("admin.users.edit",       p => p.RequireClaim("permission", "admin.users.edit"))
            .AddPolicy("admin.audit.view",       p => p.RequireClaim("permission", "admin.audit.view"))
            // cpm.manage moved to cplm-api with the CPLM controllers (extraction Phase 6).
            .AddPolicy("system.manage",          p => p.RequireClaim("permission", "system.manage"));

        return services;
    }

    /// <summary>In-service rate limiting — kept alongside the gateway's limits by explicit decision
    /// (Plan 10 C4): it is the only limiter for in-network callers.</summary>
    public static IServiceCollection AddAmsRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(opt =>
        {
            opt.AddFixedWindowLimiter("alarms-read", o =>
            {
                o.PermitLimit        = 1000;
                o.Window             = TimeSpan.FromMinutes(1);
                o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
                o.QueueLimit         = 50;
            });

            opt.AddFixedWindowLimiter("alarms-write", o =>
            {
                o.PermitLimit = 300;
                o.Window      = TimeSpan.FromMinutes(1);
            });

            opt.OnRejected = async (ctx, ct) =>
            {
                ctx.HttpContext.Response.StatusCode = 429;
                ctx.HttpContext.Response.Headers.RetryAfter = "60";
                await ctx.HttpContext.Response.WriteAsJsonAsync(
                    new { message = "Rate limit exceeded. Retry after 60 seconds.", code = 429 }, ct);
            };
        });
        return services;
    }

    public static IServiceCollection AddAmsResponseCompression(this IServiceCollection services)
    {
        services.AddResponseCompression(opt =>
        {
            opt.Providers.Add<BrotliCompressionProvider>();
            opt.Providers.Add<GzipCompressionProvider>();
            opt.EnableForHttps = true;
            opt.MimeTypes      = ResponseCompressionDefaults.MimeTypes
                .Concat(new[] { "application/json", "application/x-ndjson", "text/event-stream" });
        });
        return services;
    }

    /// <summary>
    /// Plan 10 C1 — health semantics:
    ///  LIVENESS ("critical", served by /health/ready and the container probe) is postgres
    ///  only: the REST surface genuinely cannot function without it. Kafka/Flink outages
    ///  degrade the PIPELINE, not the API — they used to be tagged critical, so a down
    ///  Flink marked the whole container unhealthy while every endpoint still answered.
    ///  They remain fully visible in /health (aggregate detail) and /health/pipeline.
    ///  The kafka check is metadata-based (KafkaMetadataHealthCheck) — the old one
    ///  PUBLISHED a synthetic message to server-status on every probe.
    /// </summary>
    public static IServiceCollection AddAmsHealthChecks(
        this IServiceCollection services, IConfiguration config, string connStr)
    {
        services.AddSingleton<Health.KafkaMetadataHealthCheck>();
        services.AddHealthChecks()
            .AddNpgSql(connStr, name: "postgresql", tags: new[] { "database", "critical" })
            .AddCheck<Health.KafkaMetadataHealthCheck>("kafka", tags: new[] { "messaging", "pipeline" })
            .AddCheck<FlinkOnlyIngestHealthCheck>("flink-ingest", tags: new[] { "pipeline", "ingest" });
        return services;
    }

    public static IServiceCollection AddAmsCors(this IServiceCollection services, IConfiguration config)
    {
        services.AddCors(opt => opt.AddPolicy("AmsPolicy", p =>
        {
            var origins = config.GetSection("AllowedOrigins").Get<string[]>() ?? new[] { "http://localhost:3000" };
            p.WithOrigins(origins)
             .AllowAnyMethod()
             .AllowAnyHeader()
             .AllowCredentials()
             .WithExposedHeaders("X-Total-Count", "X-Api-Version");
        }));
        return services;
    }

    public static IServiceCollection AddAmsApiVersioning(this IServiceCollection services)
    {
        services.AddApiVersioning(opt =>
        {
            opt.DefaultApiVersion                = new ApiVersion(1, 0);
            opt.AssumeDefaultVersionWhenUnspecified = true;
            opt.ReportApiVersions                = true;
            opt.ApiVersionReader                 = ApiVersionReader.Combine(
                new UrlSegmentApiVersionReader(),
                new HeaderApiVersionReader("X-Api-Version"));
        }).AddApiExplorer(opt =>
        {
            opt.GroupNameFormat           = "'v'VVV";
            opt.SubstituteApiVersionInUrl = true;
        });
        return services;
    }

    public static IServiceCollection AddAmsSwagger(this IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(opt =>
        {
            opt.SwaggerDoc("v1", new OpenApiInfo
            {
                Title          = "AMS – Alarm Management System API",
                Version        = "v1",
                Description    = "OPC A&E 1.10 compliant enterprise alarm management REST API. " +
                                 "Supports ISA-18.2 and EEMUA-191 alarm lifecycle operations.",
                Contact        = new OpenApiContact { Name = "AMS Operations", Email = "ams-ops@company.com" },
                License        = new OpenApiLicense { Name = "Enterprise License" }
            });

            opt.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            {
                Type         = SecuritySchemeType.Http,
                Scheme       = "bearer",
                BearerFormat = "JWT",
                Description  = "Platform RS256 access token (validated at the API gateway)"
            });

            opt.AddSecurityRequirement(new OpenApiSecurityRequirement
            {
                [new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
                }] = Array.Empty<string>()
            });

            opt.EnableAnnotations();
            var apiXml = Path.Combine(AppContext.BaseDirectory, "AMS.Api.xml");
            if (File.Exists(apiXml))
                opt.IncludeXmlComments(apiXml, includeControllerXmlComments: true);
            opt.UseInlineDefinitionsForEnums();
        });
        return services;
    }
}
