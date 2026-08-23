using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Services;

/// <summary>
/// Registered data-source profiles (spec §8.2). One profile per consolidated-app
/// module: the operator picks WHAT a configuration is for, and the profile carries
/// the module's topic defaults + the pipeline destination its data will land on.
/// Phase 1 registers metadata only — the parser + producer that a profile binds
/// arrive with the phase-2 subscriber, so a new payload shape becomes a new profile
/// entry, never a transport change.
/// </summary>
public static class ProfileRegistry
{
    public static readonly ProfileInfo[] All =
    {
        new(
            ProfileType: "MQTT_ALARMS",
            DisplayName: "Alarms & Events",
            Module: "Alarm Management (CAMS)",
            Transport: "MQTT",
            Description: "DCS alarm and event stream from the OT gateway. Each message is one alarm " +
                         "state change (active/cleared/acknowledged). Feeds the ISA-18.2 alarm state " +
                         "machine, the alarm console, and alarm history.",
            Destination: "raw-alarms",
            DefaultTopics: new[] { "ot/alarms/#" }),
        new(
            ProfileType: "MQTT_LOOP_SAMPLES",
            DisplayName: "Control-Loop Signals (CPA)",
            Module: "Loop Performance (CPM)",
            Transport: "MQTT",
            Description: "Per-tag control-loop signals (PV/SP/OP/VP/MODE) from the OT gateway. The " +
                         "ingestion pipeline joins them into per-loop tuples for the CPM diagnostics " +
                         "engine — loops must be registered in the CPM Loop Registry first.",
            Destination: "loop.samples.v1",
            DefaultTopics: new[] { "ot/loops/#" }),
        new(
            ProfileType: "MQTT_TELEMETRY",
            DisplayName: "Process Telemetry",
            Module: "HMI Displays & Historian",
            Transport: "MQTT",
            Description: "Process values (analog/discrete tag updates) for live HMI displays, Redis " +
                         "snapshots, and IoTDB trend history. Tags must be mapped in the UNS asset " +
                         "model (alias mapping) before their data can land.",
            Destination: "live.metrics",
            DefaultTopics: new[] { "ot/telemetry/#" }),
        new(
            ProfileType: "MQTT_PRM",
            DisplayName: "PRM (MQTT Gateway)",
            Module: "Device Diagnostics (PRM)",
            Transport: "MQTT",
            Description: "OT gateway pushes one MQTT message per PRM diagnostic row. " +
                         "Classification (NE107 category, severity, fault codes) is done " +
                         "upstream by the gateway and passed straight through.",
            Destination: "prm.diagnostics.v1 (provisioned with the phase-2 subscriber)",
            DefaultTopics: new[] { "prm/data/#" }),
    };

    public static bool Exists(string? profileType) =>
        !string.IsNullOrWhiteSpace(profileType) &&
        All.Any(p => string.Equals(p.ProfileType, profileType, StringComparison.Ordinal));
}
