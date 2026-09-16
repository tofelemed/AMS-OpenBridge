// v2.5 Task 2G.1 (spec v6 §6.1-6.3, R05 / R25; NR-016, NR-019): the loop model is five separate
// dimensions plus an acquisition contract. A loop_type only SUGGESTS a preset (stamped
// PRESET_FROM_LOOP_TYPE); an explicit value is EXPLICIT and no later preset overwrites it; every
// enum is validated against the registry contract; the acquisition contract is typed.
using FluentAssertions;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Registry;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class RegistryDimensionsTests
{
    [Theory]
    [InlineData("FIC", "FLOW", "FAST_SELF_REG", "TIGHT", "OP_TO_VALVE")]
    [InlineData("LIC", "LEVEL", "INTEGRATING", "AVERAGING", "OP_TO_VALVE")]
    [InlineData("TIC", "TEMPERATURE", "SLOW_SELF_REG", "TIGHT", "OP_TO_VALVE")]
    [InlineData("PIC", "PRESSURE_LIQUID", "FAST_SELF_REG", "TIGHT", "OP_TO_VALVE")]
    [InlineData("PIC_GAS", "PRESSURE_GAS", "INTEGRATING", "AVERAGING", "OP_TO_VALVE")]
    [InlineData("PIC_VAPOUR", "PRESSURE_VAPOUR", "SLOW_SELF_REG", "TIGHT", "OP_TO_VALVE")]
    [InlineData("UNKNOWN", "UNKNOWN_UNSTABLE_INVERSE_MIMO", "UNKNOWN", "UNSET", "UNKNOWN")]
    public void A_loop_type_yields_a_preset_stamped_as_such(string loopType, string family, string dyn, string objective, string path)
    {
        var d = LoopModelDimensions.Resolve(loopType, null, stored: null);
        d.ClassificationSource.Should().Be("PRESET_FROM_LOOP_TYPE");
        d.ServiceFamily.Should().Be(family);
        d.DynamicClass.Should().Be(dyn);
        d.ObjectiveType.Should().Be(objective);
        d.Topology.Should().Be("SINGLE");
        d.CommandPath.Should().Be(path);
        d.Acquisition.Mode.Should().Be("PERIODIC");
        d.Acquisition.GridSeconds.Should().BeNull(because: "the grid is declared by the data source, never guessed");
    }

    [Fact]
    public void An_explicit_model_is_explicit_and_partial_fields_fall_back_to_the_preset()
    {
        var req = new CpmLoopModel(ServiceFamily: "LEVEL", DynamicClass: "SLOW_SELF_REG", ObjectiveType: null, Topology: "CASCADE_SLAVE", CommandPath: null,
            Acquisition: new CpmAcquisition("RBE", 5, 2.0, 1000, 1.0));
        var d = LoopModelDimensions.Resolve("LIC", req, stored: null);
        d.ClassificationSource.Should().Be("EXPLICIT");
        d.ServiceFamily.Should().Be("LEVEL");
        d.DynamicClass.Should().Be("SLOW_SELF_REG", because: "a level loop can be self-regulating (drained tank); the person knows, the tag does not");
        d.ObjectiveType.Should().Be("AVERAGING", because: "an omitted field takes the preset");
        d.Topology.Should().Be("CASCADE_SLAVE");
        d.CommandPath.Should().Be("OP_TO_VALVE");
        d.Acquisition.Should().Be(new CpmAcquisition("RBE", 5, 2.0, 1000, 1.0));
    }

    [Fact]
    public void A_re_activation_with_a_preset_never_overwrites_a_stored_explicit_model()
    {
        var stored = new LoopModelDimensions.Resolved("LEVEL", "SLOW_SELF_REG", "AVERAGING", "CASCADE_SLAVE", "OP_TO_VALVE", new CpmAcquisition("RBE", 5, null, null, null), "EXPLICIT");
        var d = LoopModelDimensions.Resolve("LIC", null, stored);
        d.Should().Be(stored, because: "re-activating from the wizard without the model keeps what a person declared");

        var explicitAgain = LoopModelDimensions.Resolve("LIC", new CpmLoopModel("LEVEL", "INTEGRATING", null, null, null, null), stored);
        explicitAgain.DynamicClass.Should().Be("INTEGRATING", because: "a new explicit value replaces the old explicit value");
        explicitAgain.ClassificationSource.Should().Be("EXPLICIT");
    }

    [Fact]
    public void A_stored_preset_is_refreshed_from_the_current_loop_type()
    {
        var stored = new LoopModelDimensions.Resolved("FLOW", "FAST_SELF_REG", "TIGHT", "SINGLE", "OP_TO_VALVE", CpmAcquisition.Default, "PRESET_FROM_LOOP_TYPE");
        var d = LoopModelDimensions.Resolve("LIC", null, stored);
        d.ServiceFamily.Should().Be("LEVEL");
        d.ClassificationSource.Should().Be("PRESET_FROM_LOOP_TYPE");
    }

    [Theory]
    [InlineData("serviceFamily", "STEAM")]
    [InlineData("dynamicClass", "FAST")]
    [InlineData("objectiveType", "LOOSE")]
    [InlineData("topology", "TREE")]
    [InlineData("commandPath", "OP_TO_PUMP")]
    public void An_unknown_enum_value_is_refused_naming_the_field(string field, string value)
    {
        var m = new CpmLoopModel(
            field == "serviceFamily" ? value : null, field == "dynamicClass" ? value : null, field == "objectiveType" ? value : null,
            field == "topology" ? value : null, field == "commandPath" ? value : null, null);
        var errors = LoopModelDimensions.Validate(m);
        errors.Should().ContainSingle().Which.Should().Contain(field).And.Contain(value);
    }

    [Fact]
    public void The_acquisition_contract_is_typed_and_bounded()
    {
        LoopModelDimensions.Validate(new CpmLoopModel(null, null, null, null, null, new CpmAcquisition("SAMPLE_HOLD", 5, null, null, null))).Should().BeEmpty();
        LoopModelDimensions.Validate(new CpmLoopModel(null, null, null, null, null, new CpmAcquisition("SOMETIMES", 5, null, null, null))).Should().ContainSingle().Which.Should().Contain("acquisition.mode");
        LoopModelDimensions.Validate(new CpmLoopModel(null, null, null, null, null, new CpmAcquisition("PERIODIC", 0, null, null, null))).Should().ContainSingle().Which.Should().Contain("grid_seconds");
        LoopModelDimensions.Validate(new CpmLoopModel(null, null, null, null, null, new CpmAcquisition("PERIODIC", 5, -1, null, null))).Should().ContainSingle().Which.Should().Contain("source_filter_s");
    }

    [Fact]
    public void The_contract_lists_every_enum_the_database_checks()
    {
        var c = LoopModelDimensions.Contract;
        c.ServiceFamilies.Should().Contain(new[] { "FLOW", "LEVEL", "CASCADE", "UNKNOWN_UNSTABLE_INVERSE_MIMO" }).And.HaveCount(12);
        c.DynamicClasses.Should().Equal("FAST_SELF_REG", "SLOW_SELF_REG", "INTEGRATING", "INTEGRATING_LAG", "UNDERDAMPED", "UNKNOWN");
        c.ObjectiveTypes.Should().HaveCount(9).And.Contain("UNSET");
        c.Topologies.Should().HaveCount(8).And.Contain("CASCADE_SLAVE");
        c.CommandPaths.Should().Equal("OP_TO_VALVE", "OP_TO_VFD", "OP_TO_SLAVE_SP", "UNKNOWN");
        c.AcquisitionModes.Should().Equal("PERIODIC", "RBE", "SAMPLE_HOLD");
        c.ClassificationSources.Should().Equal("PRESET_FROM_LOOP_TYPE", "EXPLICIT");
    }

    [Fact]
    public void The_broadcast_attribute_carries_the_dimensions_and_the_source()
    {
        var d = LoopModelDimensions.Resolve("TIC", new CpmLoopModel(null, "UNDERDAMPED", null, null, null, new CpmAcquisition("PERIODIC", 5, null, null, 1.0)), null);
        var json = LoopModelDimensions.BroadcastJson(d);
        json.Should().Contain("\"dynamic_class\":\"UNDERDAMPED\"").And.Contain("\"classification_source\":\"EXPLICIT\"").And.Contain("\"grid_seconds\":5");
    }
}
