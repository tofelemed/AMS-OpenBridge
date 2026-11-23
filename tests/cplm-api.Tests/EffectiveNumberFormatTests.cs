// CHG-224 re-check follow-up (23 Nov 2026): Values in use and its hover text show numbers as people read them - grouped thousands,
// plain decimals, never scientific notation ("1E-09" for the fit tolerance was the last case). Pure unit test, no database.
using FluentAssertions;
using Traverse.CplmApi.Services.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class EffectiveNumberFormatTests
{
    [Theory]
    [InlineData(1e-9, "0.000000001")]
    [InlineData(0.0035, "0.0035")]
    [InlineData(0.00012345, "0.00012")]
    [InlineData(-0.004, "-0.004")]
    [InlineData(0.5, "0.5")]
    [InlineData(2.0, "2.0")]
    [InlineData(14400, "14,400")]
    [InlineData(0, "0")]
    public void SmallAndLargeNumbersReadPlainly(double value, string expected) =>
        EffectiveEntries.Fmt(value).Should().Be(expected);

    [Theory]
    [InlineData(1e-9)]
    [InlineData(3.2e-12)]
    [InlineData(0.009)]
    public void NeverScientificNotation(double value) =>
        EffectiveEntries.Fmt(value).Should().NotContainAny("E", "e");
}
