using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class LoopRegistryCacheTests
{
    // The real cplm-api shape: GET /api/v1/cpm/loops returns { loops: [...], count: N }
    // (CpmLoopsController.GetAll — NOT a bare array).
    private const string LoopsJson = """
        {"loops":[
          {"loopId":"FIC10302","assetId":"11111111-2222-3333-4444-555555555555","site":"hdpe",
           "area":"section_100","unit":"u1001_polymerization_reactor_1","loopType":"FIC","isActive":true},
          {"loopId":"TIC10101","assetId":null,"site":"hdpe","area":null,"unit":null,"loopType":"TIC","isActive":true},
          {"loopId":"FIC90000","site":"hdpe","loopType":"FIC","isActive":false}
        ],"count":3}
        """;

    [Fact]
    public void ParseLoops_reads_the_cplm_wrapper_shape()
    {
        var loops = CplmRegistryClient.ParseLoops(LoopsJson);
        Assert.Equal(3, loops.Count);
        var fic = loops[0];
        Assert.Equal("FIC10302", fic.LoopId);
        Assert.Equal("11111111-2222-3333-4444-555555555555", fic.AssetUuid);
        Assert.Equal("hdpe", fic.Site);
        Assert.Equal("section_100", fic.Area);
        Assert.Equal("u1001_polymerization_reactor_1", fic.Unit);
        Assert.Equal("FIC", fic.LoopType);
        Assert.True(fic.IsActive);
        Assert.Null(loops[1].AssetUuid);
    }

    [Fact]
    public void ParseLoops_tolerates_a_bare_array()
    {
        var loops = CplmRegistryClient.ParseLoops("""[{"loopId":"PIC1","site":"hdpe","loopType":"PIC"}]""");
        Assert.Single(loops);
        Assert.True(loops[0].IsActive); // absent isActive defaults true
    }

    [Fact]
    public void Cache_resolves_case_insensitively_with_registry_casing()
    {
        var cache = new LoopRegistryCache(CplmRegistryClient.ParseLoops(LoopsJson));
        Assert.True(cache.TryResolve("fic10302", out var loop));
        Assert.Equal("FIC10302", loop.LoopId); // registry casing wins — the engine keys by exact string
    }

    [Fact]
    public void Inactive_loops_do_not_resolve()
    {
        var cache = new LoopRegistryCache(CplmRegistryClient.ParseLoops(LoopsJson));
        Assert.False(cache.TryResolve("FIC90000", out _));
    }

    [Fact]
    public void Unknown_loop_does_not_resolve()
    {
        var cache = new LoopRegistryCache(CplmRegistryClient.ParseLoops(LoopsJson));
        Assert.False(cache.TryResolve("FIC99999", out _));
        Assert.Equal(3, cache.Count);
    }
}
