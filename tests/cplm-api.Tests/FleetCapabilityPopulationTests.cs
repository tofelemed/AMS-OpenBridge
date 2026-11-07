// CHG-153 — the Diagnostic capability tile and its drill-down count the same loops.
//
// The tile number is the registry summary's vp_expected_unmapped; the drill-down lists FleetKpiSql.Rows filtered by
// FleetKpiClassifier "capability". Rows holds monitored loops only, so the summary must count monitored loops only:
// a registered, unmonitored loop would otherwise add to the number and never appear in the list.
using FluentAssertions;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class FleetCapabilityPopulationTests
{
    private const string Monitored = "COALESCE((monitoring->>'enabled')::boolean, FALSE)";

    /// <summary>The COUNT(*) FILTER (...) expression that ends in <c>AS alias</c>.</summary>
    private static string Expression(string sql, string alias)
    {
        var end = sql.IndexOf($"AS {alias}", StringComparison.Ordinal);
        return sql[sql.LastIndexOf("COUNT(*)", end, StringComparison.Ordinal)..end];
    }

    [Fact]
    public void The_capability_count_covers_monitored_loops_only()
    {
        var line = Expression(FleetRegistrySummarySql.Registry, "vp_expected_unmapped");
        line.Should().Contain(Monitored, "the drill-down lists the monitored loops, so the number must count the same ones");
    }

    [Fact]
    public void The_drill_down_rows_are_the_monitored_loops()
    {
        FleetKpiSql.Rows.Should().Contain("COALESCE((r.monitoring->>'enabled')::boolean, FALSE)");
    }
}
