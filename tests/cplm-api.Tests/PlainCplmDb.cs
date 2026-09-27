// CHG-033 - a throwaway PLAIN PostgreSQL database on the lab server (no Timescale hypertables), built
// from the fresh-install script and then scripts/cpm-10b, so the plant's partition shape is proven where
// the lab's hypertables cannot show it. One per test class; dropped afterwards.
using Npgsql;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class PlainCplmDb : IAsyncLifetime
{
    public const string Name = "cplm_plain_test";
    public NpgsqlDataSource Db { get; private set; } = null!;
    private string _adminCs = null!;

    /// <summary>A file under the repository root (found by walking up to the directory that holds migration/schema).</summary>
    public static string RepoFile(params string[] parts)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "migration", "schema"))) dir = dir.Parent;
        if (dir is null) throw new InvalidOperationException("repository root (migration/schema) not found above " + AppContext.BaseDirectory);
        return Path.Combine(new[] { dir.FullName }.Concat(parts).ToArray());
    }

    public async Task InitializeAsync()
    {
        var cs = new NpgsqlConnectionStringBuilder(TestDb.ConnectionString()) { Database = "postgres" };
        _adminCs = cs.ConnectionString;
        await AdminAsync($"DROP DATABASE IF EXISTS {Name} WITH (FORCE)");
        await AdminAsync($"CREATE DATABASE {Name}");
        cs.Database = Name;
        Db = NpgsqlDataSource.Create(cs.ConnectionString);
        await ApplyAsync(RepoFile("migration", "schema", "03-traverse_cplm.sql"));
        // the plant's tables were self-healed by cplm-api at every start since v2.5 (the feature GIN indexes exist
        // only through that DDL); cpm-10b replays whatever indexes it finds, so the history is reproduced here
        await using (var conn = await Db.OpenConnectionAsync())
        await using (var cmd = new NpgsqlCommand(Traverse.CplmApi.Data.CplmResultSchema.Ddl, conn) { CommandTimeout = 600 })
            await cmd.ExecuteNonQueryAsync();
        await ApplyAsync(RepoFile("scripts", "cpm-10b-result-partitions.sql"));
    }

    private async Task AdminAsync(string sql)
    {
        await using var admin = new NpgsqlConnection(_adminCs);
        await admin.OpenAsync();
        await new NpgsqlCommand(sql, admin).ExecuteNonQueryAsync();
    }

    /// <summary>Runs one SQL file as a single multi-statement command (these scripts carry no psql meta-commands or variables).</summary>
    public async Task ApplyAsync(string path)
    {
        await using var conn = await Db.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(await File.ReadAllTextAsync(path), conn) { CommandTimeout = 600 };
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync()
    {
        await Db.DisposeAsync();
        NpgsqlConnection.ClearAllPools();
        await AdminAsync($"DROP DATABASE IF EXISTS {Name} WITH (FORCE)");
    }
}
