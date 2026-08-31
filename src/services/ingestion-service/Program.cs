// ingestion-service — OT data-source configuration (MQTT broker connections).
//
// Phase 1 of the OT ingestion feature (docs/ot-data-integration/05-mqtt-source-config-
// implementation-plan.md): config CRUD, credential encryption, one-shot connection
// test, activate/deactivate. The MQTT subscriber pipeline (parsers, sink, DLQ)
// arrives in phase 2 and reads the same table — which is why config CRUD lives in
// this service: decrypted credentials never cross the network.
using System.Security.Claims;
using Dapper;
using Npgsql;
using Traverse.Auth;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Services;

DefaultTypeMap.MatchNamesWithUnderscores = true;

var builder = WebApplication.CreateBuilder(args);

// ── Credential encryption (spec §4) ─────────────────────────────────────────
// Fail closed outside Development: without a real key the service could not
// decrypt anything it stores, so limping on silently would only defer the error.
const string InsecureDevEncryptionKey = "traverse-ingestion-insecure-dev-key-000";
var encryptionKey = builder.Configuration["ENCRYPTION_KEY"];
var usingDevEncryptionKey = false;
if (string.IsNullOrEmpty(encryptionKey) || encryptionKey.Length < 32)
{
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException(
            "ENCRYPTION_KEY must be set to at least 32 characters (docker env ENCRYPTION_KEY / " +
            ".env INGESTION_ENCRYPTION_KEY). Rotating it orphans every stored password.");
    encryptionKey = InsecureDevEncryptionKey;
    usingDevEncryptionKey = true;
}
builder.Services.AddSingleton(new CredentialCipher(encryptionKey));

// ── Postgres ────────────────────────────────────────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("TraverseIngestion")
    ?? "Host=postgres;Database=traverse_ingestion;Username=postgres;Password=postgres";
builder.Services.AddSingleton(NpgsqlDataSource.Create(connectionString));
builder.Services.AddSingleton<DataSourceRepository>();
builder.Services.AddSingleton<MqttConnectionTester>();
builder.Services.AddSingleton<IAuditEmitter, AuditEmitter>();

// ── Auth (edge-only model: gateway-injected X-Auth-* headers) ───────────────
builder.AddTraverseAuth();

var app = builder.Build();

if (usingDevEncryptionKey)
    app.Logger.LogWarning(
        "ENCRYPTION_KEY is missing/short — using the insecure built-in dev key. " +
        "Set a unique 32+ char key before deploying beyond a local lab.");

app.UseTraverseAuth();

// ── Startup self-heal ───────────────────────────────────────────────────────
// database/scripts/45+46 only run on an EMPTY postgres volume; existing
// environments get the database + schema from here (same DDL — keep in sync).
await SelfHeal.EnsureDatabaseAndSchemaAsync(connectionString, app.Logger);

static string UserName(ClaimsPrincipal user) =>
    user.FindFirst("preferred_username")?.Value
    ?? user.FindFirst(ClaimTypes.Name)?.Value
    ?? user.FindFirst("sub")?.Value
    ?? "unknown";

static string HostOf(string url)
{
    try { return new Uri(url).Host; } catch { return url; }
}

// ── GET /health ─────────────────────────────────────────────────────────────
app.MapGet("/health", async (NpgsqlDataSource dataSource) =>
{
    var checks = new Dictionary<string, object>();
    var healthy = true;
    try
    {
        await using var conn = await dataSource.OpenConnectionAsync();
        await conn.ExecuteScalarAsync<int>("SELECT 1");
        checks["postgres"] = new { status = "Healthy", description = "traverse_ingestion reachable" };
    }
    catch (Exception ex)
    {
        healthy = false;
        checks["postgres"] = new { status = "Unhealthy", description = ex.Message };
    }
    checks["subscriber"] = new { status = "NotBuilt", description = "MQTT subscriber pipeline arrives in phase 2" };

    var overall = healthy ? "Healthy" : "Degraded";
    return healthy
        ? Results.Json(new { status = overall, checks })
        : Results.Json(new { status = overall, checks }, statusCode: StatusCodes.Status503ServiceUnavailable);
});

// ── GET /profiles ───────────────────────────────────────────────────────────
app.MapGet("/profiles", () => Results.Ok(ProfileRegistry.All))
    .RequireAuthorization(Perms.IngestionView);

// ── GET /data-sources ───────────────────────────────────────────────────────
app.MapGet("/data-sources", async (DataSourceRepository repo) =>
{
    var rows = await repo.ListAsync(activeOnly: false);
    return Results.Ok(rows.Select(DataSourceDto.From));
}).RequireAuthorization(Perms.IngestionView);

// ── GET /data-sources/active ────────────────────────────────────────────────
app.MapGet("/data-sources/active", async (DataSourceRepository repo) =>
{
    var rows = await repo.ListAsync(activeOnly: true);
    return Results.Ok(rows.Select(DataSourceDto.From));
}).RequireAuthorization(Perms.IngestionView);

// ── GET /data-sources/{id} ──────────────────────────────────────────────────
app.MapGet("/data-sources/{id:guid}", async (Guid id, DataSourceRepository repo) =>
{
    var row = await repo.GetAsync(id);
    return row is null ? Results.NotFound() : Results.Ok(DataSourceDto.From(row));
}).RequireAuthorization(Perms.IngestionView);

// ── POST /data-sources ──────────────────────────────────────────────────────
app.MapPost("/data-sources", async (
    CreateDataSourceRequest request, ClaimsPrincipal user,
    DataSourceRepository repo, CredentialCipher cipher, IAuditEmitter audit) =>
{
    if (DataSourceValidation.ValidateCreate(request) is { } invalid)
        return Results.BadRequest(new { error = invalid.Error, field = invalid.Field });

    var row = await repo.InsertAsync(
        request.ProfileType, request.Name!.Trim(), request.Description,
        request.ConnectionUrl!.Trim(), request.Username!.Trim(),
        cipher.Encrypt(request.Password!),
        request.TimeoutSeconds ?? 30, request.InsecureSkipVerify ?? false,
        (request.ProfileConfig ?? new ProfileConfig()).ToJson(),
        UserName(user));

    audit.Emit("ingestion.datasource.created", UserName(user), row.ConfigId.ToString(),
        new { row.Name, host = HostOf(row.ConnectionUrl) });
    return Results.Created($"/data-sources/{row.ConfigId}", DataSourceDto.From(row));
}).RequireAuthorization(Perms.IngestionManage);

// ── PUT /data-sources/{id} ──────────────────────────────────────────────────
app.MapPut("/data-sources/{id:guid}", async (
    Guid id, UpdateDataSourceRequest request, ClaimsPrincipal user,
    DataSourceRepository repo, CredentialCipher cipher, IAuditEmitter audit) =>
{
    var existing = await repo.GetAsync(id);
    if (existing is null) return Results.NotFound();

    // Cross-field rules (TLS coherence) must hold on the MERGED state, not the
    // sparse request.
    var merged = DataSourceValidation.ValidateMerged(
        name: request.Name ?? existing.Name,
        username: request.Username ?? existing.Username,
        connectionUrl: request.ConnectionUrl ?? existing.ConnectionUrl,
        timeoutSeconds: request.TimeoutSeconds ?? existing.TimeoutSeconds,
        insecureSkipVerify: request.InsecureSkipVerify ?? existing.InsecureSkipVerify,
        profileType: request.ProfileType ?? existing.ProfileType,
        profileConfig: request.ProfileConfig ?? ProfileConfig.FromJson(existing.ProfileConfig));
    if (merged is { } invalid)
        return Results.BadRequest(new { error = invalid.Error, field = invalid.Field });

    // INVARIANT (spec §5 rule 1): absent or "" password keeps the stored credential.
    var passwordEncrypted = string.IsNullOrEmpty(request.Password) ? null : cipher.Encrypt(request.Password);
    var profileConfigJson = request.ProfileConfig?.ToJson();

    var row = await repo.UpdateAsync(id, request, passwordEncrypted, profileConfigJson, UserName(user));
    if (row is null) return Results.NotFound();

    audit.Emit("ingestion.datasource.updated", UserName(user), row.ConfigId.ToString(),
        new { row.Name, host = HostOf(row.ConnectionUrl), passwordChanged = passwordEncrypted is not null });
    return Results.Ok(DataSourceDto.From(row));
}).RequireAuthorization(Perms.IngestionManage);

// ── DELETE /data-sources/{id} ───────────────────────────────────────────────
app.MapDelete("/data-sources/{id:guid}", async (
    Guid id, ClaimsPrincipal user, DataSourceRepository repo, IAuditEmitter audit) =>
{
    var existing = await repo.GetAsync(id);
    if (existing is null) return Results.NotFound();

    await repo.DeleteAsync(id);
    audit.Emit("ingestion.datasource.deleted", UserName(user), id.ToString(),
        new { existing.Name, host = HostOf(existing.ConnectionUrl) });
    return Results.NoContent();
}).RequireAuthorization(Perms.IngestionManage);

// ── POST /data-sources/{id}/test ────────────────────────────────────────────
app.MapPost("/data-sources/{id:guid}/test", async (
    Guid id, ClaimsPrincipal user, DataSourceRepository repo,
    CredentialCipher cipher, MqttConnectionTester tester, IAuditEmitter audit,
    CancellationToken cancellationToken) =>
{
    var row = await repo.GetAsync(id);
    if (row is null) return Results.NotFound();

    string password;
    try
    {
        password = cipher.Decrypt(row.PasswordEncrypted);
    }
    catch (Exception ex)
    {
        var error = $"Could not decrypt stored password: {ex.Message} (was ENCRYPTION_KEY rotated?)";
        await repo.StoreTestResultAsync(id, ok: false, error);
        return Results.Ok(new { ok = false, error, latencyMs = 0L, status = "FAILED" });
    }

    var result = await tester.TestAsync(row, password, cancellationToken);
    await repo.StoreTestResultAsync(id, result.Ok, result.Error);
    audit.Emit("ingestion.datasource.tested", UserName(user), id.ToString(),
        new { row.Name, host = HostOf(row.ConnectionUrl), status = result.Ok ? "SUCCESS" : "FAILED" });
    return Results.Ok(new { ok = result.Ok, error = result.Error, latencyMs = result.LatencyMs, status = result.Ok ? "SUCCESS" : "FAILED" });
}).RequireAuthorization(Perms.IngestionManage);

// ── POST /data-sources/{id}/activate | /deactivate ──────────────────────────
app.MapPost("/data-sources/{id:guid}/activate", async (
    Guid id, ClaimsPrincipal user, DataSourceRepository repo, IAuditEmitter audit) =>
{
    var row = await repo.SetActiveAsync(id, isActive: true, UserName(user));
    if (row is null) return Results.NotFound();
    audit.Emit("ingestion.datasource.activated", UserName(user), id.ToString(), new { row.Name });
    return Results.Ok(DataSourceDto.From(row));
}).RequireAuthorization(Perms.IngestionManage);

app.MapPost("/data-sources/{id:guid}/deactivate", async (
    Guid id, ClaimsPrincipal user, DataSourceRepository repo, IAuditEmitter audit) =>
{
    var row = await repo.SetActiveAsync(id, isActive: false, UserName(user));
    if (row is null) return Results.NotFound();
    audit.Emit("ingestion.datasource.deactivated", UserName(user), id.ToString(), new { row.Name });
    return Results.Ok(DataSourceDto.From(row));
}).RequireAuthorization(Perms.IngestionManage);

app.Run();

// ── Self-heal DDL ───────────────────────────────────────────────────────────
internal static class SelfHeal
{
    // Mirrors database/scripts/46_ingestion_data_sources.sql — keep the two in sync.
    private static readonly string[] SchemaDdl =
    {
        "CREATE SCHEMA IF NOT EXISTS ingestion",
        """
        CREATE TABLE IF NOT EXISTS ingestion.data_source_configs (
            config_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            source_type            VARCHAR(50)  NOT NULL DEFAULT 'MQTT' CHECK (source_type IN ('MQTT')),
            profile_type           VARCHAR(50),
            name                   VARCHAR(255) NOT NULL,
            description            TEXT,
            connection_url         TEXT         NOT NULL,
            username               VARCHAR(255) NOT NULL,
            password_encrypted     TEXT         NOT NULL,
            timeout_seconds        INTEGER      DEFAULT 30 CHECK (timeout_seconds > 0),
            insecure_skip_verify   BOOLEAN      DEFAULT FALSE,
            profile_config         JSONB        DEFAULT '{}',
            is_active              BOOLEAN      DEFAULT TRUE,
            last_connection_test   TIMESTAMPTZ,
            last_connection_status VARCHAR(20)  CHECK (last_connection_status IN ('SUCCESS','FAILED','PENDING')),
            last_connection_error  TEXT,
            last_data_received     TIMESTAMPTZ,
            created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            created_by             VARCHAR(100) NOT NULL,
            updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_by             VARCHAR(100),
            version                INTEGER      NOT NULL DEFAULT 1
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_dsc_is_active ON ingestion.data_source_configs(is_active)",
        "CREATE INDEX IF NOT EXISTS idx_dsc_profile_type ON ingestion.data_source_configs(profile_type)",
        """
        CREATE OR REPLACE FUNCTION ingestion.touch_data_source_configs()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            NEW.version = OLD.version + 1;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """,
        "DROP TRIGGER IF EXISTS trg_touch_data_source_configs ON ingestion.data_source_configs",
        """
        CREATE TRIGGER trg_touch_data_source_configs
            BEFORE UPDATE ON ingestion.data_source_configs
            FOR EACH ROW EXECUTE FUNCTION ingestion.touch_data_source_configs()
        """,
        // Mirrors database/scripts/49_ingestion_unknown_sources.sql — keep in sync.
        """
        CREATE TABLE IF NOT EXISTS ingestion.unknown_sources (
            config_id     UUID         NOT NULL,
            reason        VARCHAR(40)  NOT NULL,
            source_key    VARCHAR(256) NOT NULL,
            first_seen    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            last_seen     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            message_count BIGINT       NOT NULL DEFAULT 1,
            last_topic    TEXT,
            last_payload  JSONB,
            PRIMARY KEY (config_id, reason, source_key)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_unknown_sources_last_seen ON ingestion.unknown_sources(last_seen DESC)",
    };

    public static async Task EnsureDatabaseAndSchemaAsync(string connectionString, ILogger logger)
    {
        const int maxAttempts = 10;
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                await EnsureDatabaseExistsAsync(connectionString);
                await using var conn = new NpgsqlConnection(connectionString);
                await conn.OpenAsync();
                foreach (var statement in SchemaDdl)
                    await conn.ExecuteAsync(statement);
                logger.LogInformation("ingestion schema self-heal complete");
                return;
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                logger.LogWarning("Schema self-heal attempt {Attempt}/{Max} failed: {Message} — retrying",
                    attempt, maxAttempts, ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(3));
            }
            catch (Exception ex)
            {
                // Endpoints will fail and /health reports Degraded — fail loud, not dead.
                logger.LogError(ex, "Schema self-heal failed after {Max} attempts", maxAttempts);
                return;
            }
        }
    }

    private static async Task EnsureDatabaseExistsAsync(string connectionString)
    {
        var csb = new NpgsqlConnectionStringBuilder(connectionString);
        var databaseName = csb.Database ?? "traverse_ingestion";
        var admin = new NpgsqlConnectionStringBuilder(connectionString) { Database = "postgres" };

        await using var conn = new NpgsqlConnection(admin.ConnectionString);
        await conn.OpenAsync();
        var exists = await conn.ExecuteScalarAsync<bool>(
            "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = @databaseName)", new { databaseName });
        if (!exists)
        {
            // Identifier, not a value — cannot be parameterized. databaseName comes from
            // our own connection string, not from user input.
            await conn.ExecuteAsync($"CREATE DATABASE \"{databaseName}\"");
        }
    }
}
