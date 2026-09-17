// 2026-09-17 frontend audit F10: the Overview "Live Flink runtime" panel and Pipeline Health list the
// jobs cplm-api SUPERVISES (CpmReadinessController.RequiredJobs); the three v2.5 engines (Condition,
// Instrument Context, Response) were submitted by the supervisor but never added to that list, so they
// were reported as "unexpected" and the pipeline read healthy with them dead. The list must be exactly
// what infra/docker/flink-job-supervisor.sh submits - pinned here against the script itself.
using System.Text.RegularExpressions;
using FluentAssertions;
using Traverse.CplmApi.Controllers;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class ReadinessJobsTests
{
    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "CLAUDE.md"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    [Fact]
    public void The_supervised_job_list_is_exactly_what_the_supervisor_script_submits()
    {
        var script = File.ReadAllText(Path.Combine(RepoRoot(), "infra", "docker", "flink-job-supervisor.sh"));
        var submitted = Regex.Matches(script, "submit_if_missing \"([^\"]+)\"").Select(m => m.Groups[1].Value).Distinct().OrderBy(x => x).ToList();
        var required = CpmReadinessController.RequiredJobNames.OrderBy(x => x).ToList();
        required.Should().Equal(submitted);
    }

    [Fact]
    public void The_three_v25_engines_count_as_cplm_jobs()
    {
        foreach (var name in new[] { "AMS - CPLM Condition Engine", "AMS - CPLM Instrument Context Engine", "AMS - CPLM Response Engine" })
            CpmReadinessController.RoleOf(name).Should().Be("cplm", name);
    }
}
