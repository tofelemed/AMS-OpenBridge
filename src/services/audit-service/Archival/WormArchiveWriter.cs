using Amazon.S3;
using Amazon.S3.Model;
using AMS.AuditService.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AMS.AuditService.Archival;

public class WormArchiveWriter : BackgroundService
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<WormArchiveWriter> _logger;
    private readonly IAmazonS3 _s3Client;
    private readonly string _bucketName;

    public WormArchiveWriter(IServiceProvider sp, ILogger<WormArchiveWriter> logger, IConfiguration config)
    {
        _sp = sp;
        _logger = logger;

        // Air-gap: only the on-prem object store (MinIO) is ever a valid target.
        // A bare AmazonS3Client() resolves the public AWS endpoint and probes the
        // link-local IMDS credential chain, so an explicit internal endpoint plus
        // static credentials are required; public AWS endpoints are refused.
        var serviceUrl = config["S3:ServiceUrl"];
        if (string.IsNullOrWhiteSpace(serviceUrl) ||
            serviceUrl.Contains("amazonaws.com", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException(
                "S3:ServiceUrl must point at the on-prem object store (e.g. http://minio:9000).");

        var accessKey = config["S3:AccessKey"]
            ?? throw new InvalidOperationException("S3:AccessKey must be set for WORM archival.");
        var secretKey = config["S3:SecretKey"]
            ?? throw new InvalidOperationException("S3:SecretKey must be set for WORM archival.");

        // The bucket MUST be created with Object Lock for the WORM claim to hold
        // (minio-init: `mc mb --with-lock local/ams-audit-archive-worm`).
        _s3Client = new AmazonS3Client(
            new Amazon.Runtime.BasicAWSCredentials(accessKey, secretKey),
            new AmazonS3Config
            {
                ServiceURL = serviceUrl,
                ForcePathStyle = true,              // MinIO is path-style
                AuthenticationRegion = "us-east-1", // MinIO ignores it; the SDK signer needs a value
            });
        _bucketName = config.GetValue<string>("S3:AuditBucket") ?? "ams-audit-archive-worm";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTimeOffset.UtcNow;
            // Run daily at midnight
            var nextRun = new DateTimeOffset(now.Year, now.Month, now.Day, 0, 0, 0, TimeSpan.Zero).AddDays(1);
            var delay = nextRun - now;

            _logger.LogInformation("Next WORM archive export scheduled for {Time}", nextRun);
            await Task.Delay(delay, stoppingToken);

            try
            {
                await ExportDailyArchive(now.Date, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to export daily WORM archive");
            }
        }
    }

    private async Task ExportDailyArchive(DateTime date, CancellationToken ct)
    {
        _logger.LogInformation("Starting WORM archive export for {Date}", date.ToString("yyyy-MM-dd"));

        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AuditDbContext>();

        var events = await db.AuditEvents
            .AsNoTracking()
            .Where(x => x.TimestampUtc >= date && x.TimestampUtc < date.AddDays(1))
            .OrderBy(x => x.TimestampUtc)
            .ToListAsync(ct);

        if (events.Count == 0) return;

        var json = System.Text.Json.JsonSerializer.Serialize(events, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
        
        var request = new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = $"audit/daily/{date:yyyy-MM-dd}.json",
            ContentBody = json,
            // By putting it in a bucket with ObjectLockEnabled=True, this object becomes immutable
        };

        await _s3Client.PutObjectAsync(request, ct);
        _logger.LogInformation("Successfully exported {Count} audit events to immutable WORM storage.", events.Count);
    }
}
