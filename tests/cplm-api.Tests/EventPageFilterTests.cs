// CHG-136 — Loop Events: a severity filter, search by episode number, and the support end on every row.
// SQL-shape and parser tests only (no database); the live predicates are covered by EventPageTests on the lab schema.
using FluentAssertions;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class EventPageFilterTests
{
    [Fact]
    public void Severity_filter_returns_only_that_severity()
    {
        // one parameter, compared without case, inside the shared scope so the page and every tab count agree
        EventPageSql.Scope.Should().Contain("lower(e.severity) = lower(@severity)");
        EventPageSql.Page("all", "triage").Should().Contain("@severity");
        EventPageSql.Counts().Should().Contain("@severity");
    }

    [Theory]
    [InlineData("EVT-16905", 16905L)]
    [InlineData("evt-16905", 16905L)]
    [InlineData("EVT 16905", 16905L)]
    [InlineData("16905", 16905L)]
    [InlineData("  16905 ", 16905L)]
    public void Search_matches_an_event_id(string q, long id)
    {
        EventPageSql.EventId(q).Should().Be(id);
        EventPageSql.Scope.Should().Contain("e.id = @eventId");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("FIC10301")]
    [InlineData("EVT-")]
    [InlineData("EVT-12x")]
    [InlineData("99999999999999999999")]
    public void Search_text_that_is_not_an_event_number_has_no_id(string? q)
    {
        EventPageSql.EventId(q).Should().BeNull();
    }

    [Fact]
    public void Every_row_carries_the_end_of_its_qualified_support()
    {
        EventPageSql.Columns.Should().Contain("e.support_until");
    }
}
