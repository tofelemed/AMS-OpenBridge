// CHG-226 follow-up (24 Nov 2026): the fleet heatmap reads one row per monitored loop twice (the newest window, and the last
// real verdict). The verdict probe must not carry the payload: on a hypertable the old chunks are compressed, and reading that
// column decompressed the whole segment for every loop (0.25 s -> 4.4 s on the lab, measured 24 Nov). The payload of the shown
// verdict is read only for a loop that shows its last stored result. Pure SQL-text test, no database.
using FluentAssertions;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class FleetHeatmapSqlShapeTests
{
    private static readonly string Sql = FleetLatestSql.HeatmapFiltered("");

    /// <summary>The text of the lateral whose alias is <paramref name="alias"/> (from its own LEFT JOIN LATERAL to ") alias ON TRUE").</summary>
    private static string Lateral(string alias)
    {
        var end = Sql.IndexOf($") {alias} ON TRUE", StringComparison.Ordinal);
        end.Should().BeGreaterThan(0, $"the heatmap has a lateral named {alias}");
        var start = Sql.LastIndexOf("LEFT JOIN LATERAL (", end, StringComparison.Ordinal);
        return Sql[start..end];
    }

    [Fact]
    public void The_verdict_probe_carries_no_payload_and_no_run_ids()
    {
        var v = Lateral("v");
        v.Should().Contain("ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC").And.Contain("LIMIT 1");
        v.Should().NotContain("payload").And.NotContain("method_run_ids");
    }

    [Fact]
    public void The_verdicts_payload_is_read_only_for_a_loop_that_shows_its_last_stored_result()
    {
        var vp = Lateral("vp");
        vp.Should().Contain("WHERE ls.last_stored", "a loop that runs normally must not touch the payload");
        vp.Should().Contain("g.payload").And.Contain("g.method_run_ids");
        // it is the very row the verdict probe chose
        vp.Should().Contain("g.window_end = v.window_end").And.Contain("g.created_at = v.created_at");
        Sql.IndexOf(") ls", StringComparison.Ordinal).Should().BeLessThan(Sql.IndexOf(") vp ON TRUE", StringComparison.Ordinal));
        foreach (var col in new[] { "v_gates", "v_method_run_ids", "v_insufficient_reason", "v_flags" })
            Sql.Should().MatchRegex($@"vp\.\S.*AS {col}", $"{col} comes from the lookup, not from the probe");
    }
}
