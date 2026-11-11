// CHG-172 (owner answer 3e) — the Tag aliases search ignores case.
//
// GET /aliases?search= matched with string.Contains, which Postgres runs case-sensitively: on the lab "FCS0102"
// found the aliases and "fcs0102" found none. The filter now compares lower-cased text on both sides. It needs
// no index or migration: a substring match could never use the btree indexes, before or after.
// No database: the filter runs over an in-memory list, and its SQL is read from the Npgsql provider without
// connecting (ToQueryString).
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Traverse.AssetModel.Data;
using Traverse.AssetModel.Models;
using Traverse.AssetModel.Services;
using Xunit;

namespace Traverse.AssetModel.Tests;

public sealed class AliasSearchTests
{
    private static AliasMapping Alias(string legacy, string canonical, string source = "ot-gateway", bool active = true) =>
        new() { Id = Guid.NewGuid(), LegacyPath = legacy, CanonicalPath = canonical, SourceSystem = source, IsActive = active };

    private static readonly AliasMapping[] Rows =
    {
        Alias("FCS0102.PIC30102.PV", "hdpe/section_100/u1005_catalyst_dosage/pic30102.pv"),
        Alias("FCS0102.PIC30102.SV", "hdpe/section_100/u1005_catalyst_dosage/pic30102.sp"),
        Alias("FCS0101.FIC10301.PV", "hdpe/section_100/u1003_feed/fic10301.pv"),
        Alias("U1-TEMP", "hdpe/section_100/u1/temp", source: "instrumental-pro"),
        Alias("FCS0102.PIC30104.PV", "hdpe/section_100/u1006_catalyst_storage/pic30104.pv", active: false),
    };

    private static List<string> Search(string? search, string? source = null, bool includeInactive = true) =>
        AliasQuery.Filter(Rows.AsQueryable(), search, source, includeInactive).Select(a => a.LegacyPath).ToList();

    [Fact]
    public void A_lower_case_search_finds_upper_case_tags()
    {
        Search("fcs0102").Should().BeEquivalentTo("FCS0102.PIC30102.PV", "FCS0102.PIC30102.SV", "FCS0102.PIC30104.PV");
    }

    [Fact]
    public void An_upper_case_search_finds_lower_case_paths()
    {
        Search("U1005_CATALYST").Should().BeEquivalentTo("FCS0102.PIC30102.PV", "FCS0102.PIC30102.SV");
    }

    [Fact]
    public void The_exact_case_still_matches()
    {
        Search("FCS0101").Should().Equal("FCS0101.FIC10301.PV");
    }

    [Fact]
    public void Source_and_inactive_filters_are_unchanged()
    {
        Search("pic3010", includeInactive: false).Should().BeEquivalentTo("FCS0102.PIC30102.PV", "FCS0102.PIC30102.SV");
        Search(null, source: "instrumental-pro").Should().Equal("U1-TEMP");
        Search("  ").Should().HaveCount(Rows.Length);
    }

    [Fact]
    public void The_SQL_compares_lower_cased_text()
    {
        var options = new DbContextOptionsBuilder<AssetDbContext>()
            .UseNpgsql("Host=unused.invalid;Database=unused")
            .Options;
        using var db = new AssetDbContext(options);

        var sql = AliasQuery.Filter(db.AliasMappings, "FCS0102", null, includeInactive: true).ToQueryString();

        sql.Should().Contain("lower(a.legacy_path)").And.Contain("lower(a.canonical_path)");
        sql.Should().Contain("fcs0102");
    }
}
