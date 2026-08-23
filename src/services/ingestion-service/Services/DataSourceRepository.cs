using Dapper;
using Npgsql;
using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Services;

/// <summary>
/// Parameterized-SQL data access over ingestion.data_source_configs (spec §5 rule 2).
/// Partial updates build a dynamic SET list touching only provided columns; the DB
/// trigger bumps updated_at/version.
/// </summary>
public sealed class DataSourceRepository
{
    private const string AllColumns = """
        config_id, source_type, profile_type, name, description,
        connection_url, username, password_encrypted, timeout_seconds, insecure_skip_verify,
        profile_config, is_active, last_connection_test, last_connection_status,
        last_connection_error, last_data_received,
        created_at, created_by, updated_at, updated_by, version
        """;

    private readonly NpgsqlDataSource _dataSource;

    public DataSourceRepository(NpgsqlDataSource dataSource) => _dataSource = dataSource;

    public async Task<IReadOnlyList<DataSourceRow>> ListAsync(bool activeOnly)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var where = activeOnly ? "WHERE is_active = TRUE" : "";
        var rows = await conn.QueryAsync<DataSourceRow>(
            $"SELECT {AllColumns} FROM ingestion.data_source_configs {where} ORDER BY name");
        return rows.ToList();
    }

    public async Task<DataSourceRow?> GetAsync(Guid configId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<DataSourceRow>(
            $"SELECT {AllColumns} FROM ingestion.data_source_configs WHERE config_id = @configId",
            new { configId });
    }

    public async Task<DataSourceRow> InsertAsync(
        string? profileType, string name, string? description, string connectionUrl,
        string username, string passwordEncrypted, int timeoutSeconds, bool insecureSkipVerify,
        string profileConfigJson, string createdBy)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        return await conn.QuerySingleAsync<DataSourceRow>(
            $"""
            INSERT INTO ingestion.data_source_configs
                (source_type, profile_type, name, description, connection_url, username,
                 password_encrypted, timeout_seconds, insecure_skip_verify, profile_config, created_by)
            VALUES ('MQTT', @profileType, @name, @description, @connectionUrl, @username,
                    @passwordEncrypted, @timeoutSeconds, @insecureSkipVerify, @profileConfigJson::jsonb, @createdBy)
            RETURNING {AllColumns}
            """,
            new
            {
                profileType, name, description, connectionUrl, username,
                passwordEncrypted, timeoutSeconds, insecureSkipVerify, profileConfigJson, createdBy,
            });
    }

    public async Task<DataSourceRow?> UpdateAsync(Guid configId, UpdateDataSourceRequest request,
        string? passwordEncrypted, string? profileConfigJson, string updatedBy)
    {
        var sets = new List<string> { "updated_by = @updatedBy" };
        var p = new DynamicParameters();
        p.Add("configId", configId);
        p.Add("updatedBy", updatedBy);

        void Set(string column, string param, object? value)
        {
            sets.Add($"{column} = @{param}");
            p.Add(param, value);
        }

        if (request.ProfileType is not null) Set("profile_type", "profileType", request.ProfileType);
        if (request.Name is not null) Set("name", "name", request.Name);
        if (request.Description is not null) Set("description", "description", request.Description);
        if (request.ConnectionUrl is not null) Set("connection_url", "connectionUrl", request.ConnectionUrl);
        if (request.Username is not null) Set("username", "username", request.Username);
        if (request.TimeoutSeconds is not null) Set("timeout_seconds", "timeoutSeconds", request.TimeoutSeconds);
        if (request.InsecureSkipVerify is not null) Set("insecure_skip_verify", "insecureSkipVerify", request.InsecureSkipVerify);
        // INVARIANT (spec §5 rule 1): absent/blank password keeps the stored credential —
        // the caller passes passwordEncrypted only when the request carried a real value.
        if (passwordEncrypted is not null) Set("password_encrypted", "passwordEncrypted", passwordEncrypted);
        if (profileConfigJson is not null)
        {
            sets.Add("profile_config = @profileConfigJson::jsonb");
            p.Add("profileConfigJson", profileConfigJson);
        }

        await using var conn = await _dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<DataSourceRow>(
            $"""
            UPDATE ingestion.data_source_configs
            SET {string.Join(", ", sets)}
            WHERE config_id = @configId
            RETURNING {AllColumns}
            """, p);
    }

    public async Task<bool> DeleteAsync(Guid configId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var affected = await conn.ExecuteAsync(
            "DELETE FROM ingestion.data_source_configs WHERE config_id = @configId", new { configId });
        return affected > 0;
    }

    public async Task<DataSourceRow?> SetActiveAsync(Guid configId, bool isActive, string updatedBy)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<DataSourceRow>(
            $"""
            UPDATE ingestion.data_source_configs
            SET is_active = @isActive, updated_by = @updatedBy
            WHERE config_id = @configId
            RETURNING {AllColumns}
            """,
            new { configId, isActive, updatedBy });
    }

    public async Task StoreTestResultAsync(Guid configId, bool ok, string? error)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync(
            """
            UPDATE ingestion.data_source_configs
            SET last_connection_test = NOW(),
                last_connection_status = @status,
                last_connection_error = @error
            WHERE config_id = @configId
            """,
            new { configId, status = ok ? "SUCCESS" : "FAILED", error });
    }
}
