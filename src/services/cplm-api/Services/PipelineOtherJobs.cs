using System.Text.RegularExpressions;

namespace Traverse.CplmApi.Services;

/// <summary>A job the engine runs that the required list does not name, with the engine's state (GET pipeline-status).</summary>
public sealed record PipelineOtherJob(string Name, string State, bool Running);

/// <summary>
/// CHG-170 (owner answer 3d) - the `otherJobs` of GET /pipeline-status: every job the engine lists that is not on the
/// required list, with its state, so Pipeline Health shows them as rows ("Not on the required list"). A finished on-demand
/// run is left out: those jobs carry their run id in the name ("AMS - CPLM Historical Replay [7c1e04a29b3d]", the evidence
/// reconstruction and the alarm replay) and linger in the engine's overview after they end; once FINISHED, FAILED or
/// CANCELED they are history, not a job. While one runs it is listed. `unexpectedJobs` (names only) is unchanged.
/// </summary>
public static partial class PipelineOtherJobs
{
    private static readonly HashSet<string> Terminal = new(StringComparer.Ordinal) { "FINISHED", "FAILED", "CANCELED" };

    [GeneratedRegex(@"\[[^\]]+\]\s*$")]
    private static partial Regex RunIdSuffix();

    /// <summary>False only for an on-demand run (a name ending in "[run id]") in a terminal state.</summary>
    public static bool IsListed(string name, string state) => !(RunIdSuffix().IsMatch(name) && Terminal.Contains(state));

    /// <summary>The jobs off the required list, by name, each once (the caller's states already let RUNNING win).</summary>
    public static IReadOnlyList<PipelineOtherJob> Of(IReadOnlyDictionary<string, string> states, IEnumerable<string> required)
    {
        var req = new HashSet<string>(required, StringComparer.Ordinal);
        return states.Where(s => !req.Contains(s.Key) && IsListed(s.Key, s.Value))
            .OrderBy(s => s.Key, StringComparer.Ordinal)
            .Select(s => new PipelineOtherJob(s.Key, s.Value, s.Value == "RUNNING"))
            .ToList();
    }
}
