using Microsoft.Extensions.Configuration;
using Traverse.CplmApi.Services;
using Xunit;

/// <summary>
/// CHG-101 (2026-11-03): the loop historian tree moves from root.site1.cpm to root.hdpe.cpm by ONE .env value,
/// LOOP_ROOT_PREFIX, which compose hands cplm-api as the environment variable IotDb__LoopRootPrefix.
/// These tests pin that exact key: it must reach the KPI writer's options (section "IotDb") and the replay /
/// reconstruction device (CplmRecomputeService reads config["IotDb:LoopRootPrefix"]), and an unset value must
/// keep the legacy tree so an image deployed without the .env line changes nothing.
/// </summary>
public class LoopRootPrefixConfigTests
{
    private static IConfiguration FromEnv(string? value)
    {
        // A private prefix keeps the test off the process-wide IotDb__* names; the "__" -> ":" mapping is the same.
        const string scope = "CHG101TEST_";
        Environment.SetEnvironmentVariable(scope + "IotDb__LoopRootPrefix", value);
        try { return new ConfigurationBuilder().AddEnvironmentVariables(scope).Build(); }
        finally { Environment.SetEnvironmentVariable(scope + "IotDb__LoopRootPrefix", null); }
    }

    private static IotDbWriteOptions Bind(IConfiguration config)
    {
        var opts = new IotDbWriteOptions();
        config.GetSection(IotDbWriteOptions.SectionName).Bind(opts);
        return opts;
    }

    [Fact]
    public void ComposeVariableReachesTheWriterAndTheReplayDevice()
    {
        var config = FromEnv("root.hdpe.cpm");

        Assert.Equal("root.hdpe.cpm", Bind(config).LoopRootPrefix);
        Assert.Equal("root.hdpe.cpm", config["IotDb:LoopRootPrefix"]);
        Assert.Equal("root.hdpe.cpm.FIC10401",
            CplmRecomputeOptions.HistorianDevice(config["IotDb:LoopRootPrefix"], "FIC10401"));
    }

    [Fact]
    public void UnsetVariableKeepsTheLegacyTree()
    {
        var config = FromEnv(null);

        Assert.Equal("root.site1.cpm", Bind(config).LoopRootPrefix);
        Assert.Equal("root.site1.cpm.FIC10401",
            CplmRecomputeOptions.HistorianDevice(config["IotDb:LoopRootPrefix"], "FIC10401"));
    }

    [Fact]
    public void KpiDeviceAndSignalAssetPathUseTheConfiguredRoot()
    {
        // The same composition CplmResultConsumerService (kpi) and CpmLoopRegistryService.SignalAssets use.
        var prefix = Bind(FromEnv("root.hdpe.cpm")).LoopRootPrefix;

        Assert.Equal("root.hdpe.cpm.FIC10401.kpi.short_5m", $"{prefix}.{IotDbWriteClient.SafeNode("FIC10401")}.kpi.short_5m");
        Assert.Equal("root.hdpe.cpm._101FIC", $"{prefix}.{IotDbWriteClient.SafeNode("101FIC")}");
    }
}
