// v2.5 Task 1D.5 (spec v6 R11) — the condition-event consumer's pure parts: parsing the
// Flink record, the idempotent upsert, and the rule that a CLOSED condition is never
// regressed by a late UPDATE (Kafka may redeliver; the consumer is at-least-once).
using FluentAssertions;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class ConditionEventStoreTests
{
    private const string Open = """
        {"schemaVersion":1,"eventType":"CPLM_CONDITION","loop_id":"FIC10302","gate":"G10","kind":"LIMIT_HIGH",
         "state":"OPEN","start_ms":1756600000000,"last_ms":1756600030000,"end_ms":null,"duration_s":30.0,
         "close_reason":"","evidence":{"limit_source":"DECLARED_RANGE","limit_high_pp":95.0},
         "emitted_at_ms":1756600030000,"sourceCommit":"abc","jarSha256":"def","contractVersion":"v1"}
        """;

    [Fact]
    public void Parses_a_flink_condition_record_into_a_row()
    {
        var row = ConditionEventStore.Parse(Open);
        row.Should().NotBeNull();
        row!.LoopId.Should().Be("FIC10302");
        row.Gate.Should().Be("G10");
        row.Kind.Should().Be("LIMIT_HIGH");
        row.State.Should().Be("OPEN");
        row.StartMs.Should().Be(1756600000000);
        row.LastMs.Should().Be(1756600030000);
        row.EndMs.Should().BeNull();
        row.DurationS.Should().Be(30.0);
        row.CloseReason.Should().Be("");
        row.Evidence.Should().Contain("DECLARED_RANGE");
        row.SourceCommit.Should().Be("abc");
        row.JarSha256.Should().Be("def");
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"eventType":"CPLM_GATE_RESULT","loop_id":"X"}""")]           // wrong record kind
    [InlineData("""{"eventType":"CPLM_CONDITION","gate":"G10","kind":"FREEZE","state":"OPEN","start_ms":1}""")]  // no loop id
    public void Rejects_records_it_cannot_apply(string json)
    {
        ConditionEventStore.Parse(json).Should().BeNull();
    }

    [Theory]
    [InlineData(null, "OPEN", true)]
    [InlineData("OPEN", "UPDATE", true)]
    [InlineData("UPDATE", "UPDATE", true)]
    [InlineData("UPDATE", "CLOSED", true)]
    [InlineData("CLOSED", "CLOSED", true)]      // redelivery: idempotent, same terminal state
    [InlineData("CLOSED", "UPDATE", false)]     // a late UPDATE must not reopen a closed condition
    [InlineData("CLOSED", "OPEN", false)]
    public void A_closed_condition_is_never_regressed(string? existing, string incoming, bool apply)
    {
        ConditionEventStore.ShouldApply(existing, incoming).Should().Be(apply);
    }

    [Fact]
    public void Upsert_sql_keys_on_the_condition_identity_and_guards_the_terminal_state()
    {
        ConditionEventStore.UpsertSql.Should().Contain("ON CONFLICT (loop_id, gate, kind, start_ms)");
        ConditionEventStore.UpsertSql.Should().Contain("analytics.condition_event");
        // the SQL-side twin of ShouldApply: only a CLOSED incoming row may touch a CLOSED stored row
        ConditionEventStore.UpsertSql.Should().Contain("analytics.condition_event.state <> 'CLOSED' OR EXCLUDED.state = 'CLOSED'");
    }
}
