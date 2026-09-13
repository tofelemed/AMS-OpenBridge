// CHG-024 (batch 3) — POST /loops/bulk-republish-evidence.
//
// Republish was one POST per loop (registry read, link projection, signal-asset projection,
// Kafka evidence publish, audit). The v3 data load ran it 175 times from a shell with
// `sleep 0.5` to stay under the mutation rate class. The bulk form keeps every loop's
// steps but runs them in one request: links are projected per loop (that call is
// per-asset in asset-model), then the signal assets and the evidence broadcast use the
// batch forms the service already has. Per-item outcomes: a bad loop fails alone.
using FluentAssertions;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class BulkRepublishTests
{
    private sealed class Calls
    {
        public List<string> Exists = new(), ProjectLinks = new();
        public List<IReadOnlyList<string>> SignalBatches = new(), PublishBatches = new();
    }

    private static (BulkRepublish.Steps Steps, Calls Calls) Fake(
        HashSet<string> registered, Func<string, int>? linksFor = null, Exception? publishFailure = null)
    {
        var calls = new Calls();
        var steps = new BulkRepublish.Steps(
            Exists: id => { calls.Exists.Add(id); return Task.FromResult(registered.Contains(id)); },
            ProjectLinks: id => { calls.ProjectLinks.Add(id); return Task.FromResult(linksFor?.Invoke(id) ?? 1); },
            ProjectSignalAssets: ids => { calls.SignalBatches.Add(ids); return Task.FromResult(ids.Count * 5); },
            PublishEvidence: ids => { calls.PublishBatches.Add(ids); return publishFailure is null ? Task.CompletedTask : Task.FromException(publishFailure); });
        return (steps, calls);
    }

    [Fact]
    public async Task Projects_links_per_loop_in_input_order_then_one_signal_batch_and_one_publish_batch()
    {
        var (steps, calls) = Fake(new() { "A", "B", "C" });

        var result = await BulkRepublish.RunAsync(new[] { "B", "A", "C" }, steps, CancellationToken.None);

        calls.ProjectLinks.Should().Equal("B", "A", "C");
        calls.SignalBatches.Should().ContainSingle().Which.Should().Equal("B", "A", "C");
        calls.PublishBatches.Should().ContainSingle().Which.Should().Equal("B", "A", "C");
        result.Requested.Should().Be(3);
        result.Republished.Should().Be(3);
        result.SignalAssets.Should().Be(15);
        result.Items.Select(i => (i.LoopId, i.Ok)).Should().Equal(("B", true), ("A", true), ("C", true));
    }

    [Fact]
    public async Task Unknown_loops_are_reported_and_never_projected_or_published()
    {
        var (steps, calls) = Fake(new() { "A" });

        var result = await BulkRepublish.RunAsync(new[] { "A", "ghost" }, steps, CancellationToken.None);

        result.NotFound.Should().Equal("ghost");
        result.Republished.Should().Be(1);
        calls.ProjectLinks.Should().Equal("A");
        calls.SignalBatches.Single().Should().Equal("A");
        calls.PublishBatches.Single().Should().Equal("A");
        result.Items.Single(i => i.LoopId == "ghost").Ok.Should().BeFalse();
        result.Items.Single(i => i.LoopId == "ghost").Error.Should().Contain("not registered");
    }

    [Fact]
    public async Task A_failing_link_projection_fails_that_loop_alone_and_the_rest_are_still_published()
    {
        var (steps, calls) = Fake(new() { "A", "B", "C" }, linksFor: id => id == "B" ? throw new InvalidOperationException("asset-model 503") : 2);

        var result = await BulkRepublish.RunAsync(new[] { "A", "B", "C" }, steps, CancellationToken.None);

        result.Republished.Should().Be(2);
        result.Items.Single(i => i.LoopId == "B").Ok.Should().BeFalse();
        result.Items.Single(i => i.LoopId == "B").Error.Should().Contain("asset-model 503");
        calls.SignalBatches.Single().Should().Equal("A", "C");
        calls.PublishBatches.Single().Should().Equal("A", "C");
        result.Items.Single(i => i.LoopId == "A").ProjectedLinks.Should().Be(2);
    }

    [Fact]
    public async Task A_failed_publish_batch_marks_every_remaining_loop_failed_not_republished()
    {
        var (steps, _) = Fake(new() { "A", "B" }, publishFailure: new TimeoutException("kafka flush"));

        var result = await BulkRepublish.RunAsync(new[] { "A", "B" }, steps, CancellationToken.None);

        result.Republished.Should().Be(0);
        result.Items.Should().OnlyContain(i => !i.Ok && i.Error!.Contains("kafka flush"));
    }

    [Fact]
    public async Task Duplicate_ids_are_processed_once_and_an_empty_request_does_nothing()
    {
        var (steps, calls) = Fake(new() { "A" });

        var dup = await BulkRepublish.RunAsync(new[] { "A", "A" }, steps, CancellationToken.None);
        var empty = await BulkRepublish.RunAsync(Array.Empty<string>(), steps, CancellationToken.None);

        dup.Requested.Should().Be(1);
        calls.ProjectLinks.Should().Equal("A");
        empty.Requested.Should().Be(0);
        calls.SignalBatches.Should().HaveCount(1);
        calls.PublishBatches.Should().HaveCount(1);
    }
}
