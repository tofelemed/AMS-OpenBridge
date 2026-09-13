namespace Traverse.CplmApi.Services;

/// <summary>Outcome for one loop of a bulk republish.</summary>
public sealed record CpmBulkRepublishItem(string LoopId, bool Ok, int ProjectedLinks = 0, string? Error = null);

public sealed record CpmBulkRepublishResult(
    int Requested,
    int Republished,
    /// <summary>Ids that are not in the registry — already retired, or a typo.</summary>
    IReadOnlyList<string> NotFound,
    /// <summary>Signal assets projected for the whole batch (the batch form reports a total, not per loop).</summary>
    int SignalAssets,
    long ElapsedMs,
    IReadOnlyList<CpmBulkRepublishItem> Items);

/// <summary>
/// CHG-024 — the orchestration behind POST /loops/bulk-republish-evidence, kept free of
/// I/O so the order and the failure isolation can be proven (tests/cplm-api.Tests).
///
/// Per loop: registered? → project links (asset-model relationships are per asset, so
/// this stays per loop). Then, for every loop that got this far, the batch forms the
/// service already has: one signal-asset projection and one evidence publish. A loop
/// that fails a step fails alone; a failed batch step fails every loop it covered — none
/// of them was published, and the result must say so.
/// </summary>
public static class BulkRepublish
{
    public sealed record Steps(
        Func<string, Task<bool>> Exists,
        Func<string, Task<int>> ProjectLinks,
        Func<IReadOnlyList<string>, Task<int>> ProjectSignalAssets,
        Func<IReadOnlyList<string>, Task> PublishEvidence);

    public static async Task<CpmBulkRepublishResult> RunAsync(IReadOnlyList<string> loopIds, Steps steps, CancellationToken ct)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var ids = loopIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.Ordinal).ToList();

        var items = new Dictionary<string, CpmBulkRepublishItem>(StringComparer.Ordinal);
        var notFound = new List<string>();
        var remaining = new List<string>();

        foreach (var id in ids)
        {
            ct.ThrowIfCancellationRequested();
            if (!await steps.Exists(id))
            {
                notFound.Add(id);
                items[id] = new CpmBulkRepublishItem(id, false, Error: $"Loop '{id}' is not registered");
                continue;
            }
            try
            {
                var projected = await steps.ProjectLinks(id);
                items[id] = new CpmBulkRepublishItem(id, true, projected);
                remaining.Add(id);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                items[id] = new CpmBulkRepublishItem(id, false, Error: $"Link projection failed: {ex.Message}");
            }
        }

        var signalAssets = 0;
        if (remaining.Count > 0)
        {
            try
            {
                signalAssets = await steps.ProjectSignalAssets(remaining);
                await steps.PublishEvidence(remaining);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // A batch step covers every remaining loop: none of them was republished.
                foreach (var id in remaining)
                    items[id] = items[id] with { Ok = false, Error = $"Batch step failed: {ex.Message}" };
            }
        }

        var ordered = ids.Select(id => items[id]).ToList();
        return new CpmBulkRepublishResult(
            Requested: ids.Count,
            Republished: ordered.Count(i => i.Ok),
            NotFound: notFound,
            SignalAssets: signalAssets,
            ElapsedMs: sw.ElapsedMilliseconds,
            Items: ordered);
    }
}
