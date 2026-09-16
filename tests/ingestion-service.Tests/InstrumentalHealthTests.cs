// v2.5 Task 1H.2 (spec v6 §4.3-4.5; NR-036, NR-038, NR-039, NR-040) — the Instrumental health
// subscriber's pure decision: strict contract validation, identity == topic == scope, idempotent
// duplicates vs integrity conflicts, and epoch discipline. No broker, no Kafka.
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FluentAssertions;
using Traverse.IngestionService.Health;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class InstrumentalHealthTests
{
    private const string Prefix = "traverse/instrumental/v1";
    private static readonly DateTimeOffset Now = new(2026, 9, 16, 12, 0, 0, TimeSpan.Zero);

    private sealed class FakeSink : IInstrumentalHealthSink
    {
        public bool Enabled => true;
        public Task PublishAsync(string key, string json, CancellationToken ct) => Task.CompletedTask;
        public Task PublishDeadLetterAsync(string key, DeadLetterRecord record, CancellationToken ct) => Task.CompletedTask;
    }

    private static InstrumentalHealthSubscriber Subscriber(params string[] allowed)
    {
        var row = new DataSourceRow { ConfigId = Guid.NewGuid(), Name = "instr", Username = "instr-gw", ProfileType = "INSTRUMENTAL_HEALTH" };
        var settings = new InstrumentalHealthConfig { TenantId = "default", SiteId = "hdpe", AllowedSourceIds = allowed.ToList() }.Resolve();
        var status = new SubscriberStatus { ConfigId = row.ConfigId, Name = row.Name, ProfileType = row.ProfileType };
        return new InstrumentalHealthSubscriber(row, "pw", settings, new FakeSink(), status,
            Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance);
    }

    private static string Snapshot(string device = "TT-10302", string observationId = "obs-1", long epoch = 1, long seq = 0,
        bool complete = true, string[]? flags = null, string nativeStatus = "Failure", string publishedAt = "2026-09-16T12:00:00.000Z",
        string source = "instr-prm-1", string kind = "STATE_SNAPSHOT", string extraDiag = "")
    {
        flags ??= new[] { "F" };
        var flagsJson = string.Join(",", flags.Select(f => $"\"{f}\""));
        var eventFields = kind == "STATE_EVENT" ? "\"event_id\":\"evt-1\",\"change_kind\":\"DIAGNOSTIC_RAISED\",\"diagnostic_ids\":[\"occ-1\"]," : "";
        return $$$"""
            {"schema_version":"1.0","message_kind":"{{{kind}}}",{{{eventFields}}}"observation_id":"{{{observationId}}}",
             "tenant_id":"default","site_id":"hdpe","producer_id":"instrumental-sim","producer_epoch":{{{epoch}}},"sequence":{{{seq}}},
             "source_id":"{{{source}}}","device_id":"{{{device}}}","installation_id":"inst-1",
             "observed_at":"2026-09-16T11:58:00.000Z","verified_at":"2026-09-16T11:59:30.000Z","published_at":"{{{publishedAt}}}",
             "state_revision":1,"state_complete":{{{(complete ? "true" : "false")}}},"verification_kind":"UPSTREAM_DATABASE_POLL",
             "scan_interval_s":30,"mapping_version":"ne107-2025-07-15/sim-1",
             "state":{"active_flags":[{{{flagsJson}}}],"native_status":"{{{nativeStatus}}}","primary_flag":"{{{flags[0]}}}",
               "collection_state":"VERIFIED","measurement_impact":"INVALID",
               "diagnostics":[{"diagnostic_id":"occ-1","native_code":"F210","message":"Sensor element failure","flags":["F"],
                 "affected_variable_ids":["FIC10302.PV"],"measurement_impact":"INVALID","first_observed_at":"2026-09-16T11:58:00.000Z",
                 "cause":"Open circuit","remedy":"Replace the sensor","source_record_ref":"prm://instrumental/occurrences/occ-1"{{{extraDiag}}} }]}}
            """;
    }

    private static string Topic(string device = "TT-10302", string kind = "state", string tenant = "default", string site = "hdpe") =>
        $"{Prefix}/{tenant}/{site}/devices/{device}/{kind}";

    private static (InstrumentalHealthSubscriber.Outcome outcome, string? key, string? json, DeadLetterRecord? dlq) Run(
        InstrumentalHealthSubscriber s, string topic, string payload, bool retained = true)
    {
        var o = s.ProcessOne(topic, Encoding.UTF8.GetBytes(payload), retained, Now, out var key, out var json, out var dlq);
        return (o, key, json, dlq);
    }

    [Fact]
    public void A_valid_snapshot_is_forwarded_wrapped_with_the_gateways_facts_and_keyed_by_device()
    {
        var (o, key, json, _) = Run(Subscriber("instr-prm-1"), Topic(), Snapshot());
        o.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward);
        key.Should().Be("TT-10302");
        var record = JsonNode.Parse(json!)!.AsObject();
        record["gateway"]!["received_at"]!.GetValue<string>().Should().Be("2026-09-16T12:00:00.000Z");
        record["gateway"]!["topic"]!.GetValue<string>().Should().Be(Topic());
        record["gateway"]!["mqtt_retained"]!.GetValue<bool>().Should().BeTrue();
        record["gateway"]!["authenticated_producer"]!.GetValue<string>().Should().Be("instr-gw", "the MQTT identity we connected with, never the payload's claim");
        record["observation"]!["state"]!["active_flags"]!.AsArray().Select(x => x!.GetValue<string>()).Should().Equal("F");
    }

    [Fact]
    public void Nr036_every_active_flag_is_preserved_never_collapsed()
    {
        var (o, _, json, _) = Run(Subscriber("instr-prm-1"), Topic(), Snapshot(flags: new[] { "F", "M" }));
        o.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward);
        var flags = JsonNode.Parse(json!)!["observation"]!["state"]!["active_flags"]!.AsArray().Select(x => x!.GetValue<string>());
        flags.Should().Equal("F", "M");
    }

    [Fact]
    public void Nr038_an_old_retained_snapshot_is_valid_data_not_a_rejection()
    {
        // observed/verified two hours ago, published now: freshness is Flink's judgement, not a schema failure
        var (o, _, _, _) = Run(Subscriber("instr-prm-1"), Topic(), Snapshot());
        o.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward);
    }

    [Fact]
    public void Nr039_an_exact_duplicate_is_idempotent_and_a_differing_payload_is_an_integrity_conflict()
    {
        var s = Subscriber("instr-prm-1");
        Run(s, Topic(), Snapshot()).outcome.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward);
        // same bytes re-delivered (retained re-delivery)
        Run(s, Topic(), Snapshot()).outcome.Should().Be(InstrumentalHealthSubscriber.Outcome.Duplicate);
        // same content, different key order => still a duplicate (canonical hash)
        var reordered = JsonNode.Parse(Snapshot())!.AsObject();
        var rebuilt = new JsonObject();
        foreach (var kv in reordered.Reverse().ToList()) rebuilt[kv.Key] = kv.Value!.DeepClone();
        Run(s, Topic(), rebuilt.ToJsonString()).outcome.Should().Be(InstrumentalHealthSubscriber.Outcome.Duplicate);
        // same observation id, different payload
        var (o, _, _, dlq) = Run(s, Topic(), Snapshot(nativeStatus: "Failure (edited)", seq: 1));
        o.Should().Be(InstrumentalHealthSubscriber.Outcome.DeadLetter);
        dlq!.Reason.Should().Be(HealthDlqReasons.IntegrityConflict);
    }

    [Fact]
    public void Nr040_an_event_of_a_new_epoch_is_parked_until_that_epochs_complete_snapshot_arrives()
    {
        var s = Subscriber("instr-prm-1");
        Run(s, Topic(), Snapshot(observationId: "obs-1", epoch: 1, seq: 0)).outcome.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward);
        var (o, _, _, dlq) = Run(s, Topic(kind: "events"), Snapshot(observationId: "obs-2", epoch: 2, seq: 0, kind: "STATE_EVENT"), retained: false);
        o.Should().Be(InstrumentalHealthSubscriber.Outcome.DeadLetter);
        dlq!.Reason.Should().Be(HealthDlqReasons.EpochWithoutSnapshot);
        // the complete snapshot of epoch 2 supersedes
        Run(s, Topic(), Snapshot(observationId: "obs-3", epoch: 2, seq: 1)).outcome.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward);
        // an old-epoch message is forwarded FLAGGED, never applied by the state machine
        var (o2, _, json2, _) = Run(s, Topic(), Snapshot(observationId: "obs-4", epoch: 1, seq: 5));
        o2.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward);
        JsonNode.Parse(json2!)!["gateway"]!["flags"]!.AsArray().Select(x => x!.GetValue<string>()).Should().Contain("STALE_EPOCH");
        // a regressed sequence within the epoch is flagged too
        var (o3, _, json3, _) = Run(s, Topic(), Snapshot(observationId: "obs-5", epoch: 2, seq: 0));
        o3.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward);
        JsonNode.Parse(json3!)!["gateway"]!["flags"]!.AsArray().Select(x => x!.GetValue<string>()).Should().Contain("SEQUENCE_REGRESSION");
    }

    [Fact]
    public void The_strict_contract_rejects_aliases_unknown_versions_and_incomplete_envelopes()
    {
        var s = Subscriber("instr-prm-1");
        Run(s, Topic(), Snapshot(extraDiag: ",\"first_seen\":\"2026-09-16T11:58:00.000Z\"")).dlq!.Reason.Should().Be(HealthDlqReasons.SchemaInvalid);
        Run(s, Topic(), Snapshot().Replace("\"schema_version\":\"1.0\"", "\"schema_version\":\"0.9\"")).dlq!.Reason.Should().Be(HealthDlqReasons.UnsupportedVersion);
        Run(s, Topic(), Snapshot().Replace("\"state_complete\":true,", "")).dlq!.Reason.Should().Be(HealthDlqReasons.SchemaInvalid);
        Run(s, Topic(), "not json").dlq!.Reason.Should().Be(HealthDlqReasons.NotJson);
        Run(s, Topic(), Snapshot().Replace("\"F\"]", "\"F\",\"X\"]")).dlq!.Reason.Should().Be(HealthDlqReasons.SchemaInvalid);
    }

    [Fact]
    public void Identity_must_match_the_topic_and_the_sources_scope_and_the_producer_must_be_allowed()
    {
        Run(Subscriber("instr-prm-1"), Topic(device: "TT-OTHER"), Snapshot()).dlq!.Reason.Should().Be(HealthDlqReasons.IdentityMismatch);
        Run(Subscriber("instr-prm-1"), Topic(site: "otherplant"), Snapshot()).dlq!.Reason.Should().Be(HealthDlqReasons.IdentityMismatch);
        Run(Subscriber("instr-prm-1"), Topic(kind: "events"), Snapshot()).dlq!.Reason.Should().Be(HealthDlqReasons.KindMismatch);
        Run(Subscriber("some-other-source"), Topic(), Snapshot()).dlq!.Reason.Should().Be(HealthDlqReasons.SourceNotAllowed);
        Run(Subscriber("instr-prm-1"), "traverse/instrumental/v1/default/hdpe/devices/TT-10302", Snapshot()).dlq!.Reason.Should().Be(HealthDlqReasons.TopicShape);
    }

    [Fact]
    public void Transport_skew_is_limited_but_observation_age_is_not()
    {
        var s = Subscriber("instr-prm-1");
        Run(s, Topic(), Snapshot(publishedAt: "2026-09-10T12:00:00.000Z")).dlq!.Reason.Should().Be(HealthDlqReasons.TimestampSkew);
        Run(s, Topic(), Snapshot(observationId: "obs-old")).outcome.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward);
    }

    [Fact]
    public void Oversized_messages_are_refused_before_parsing()
    {
        var big = Snapshot().Replace("\"Open circuit\"", "\"" + new string('x', 70_000) + "\"");
        Run(Subscriber("instr-prm-1"), Topic(), big).dlq!.Reason.Should().Be(HealthDlqReasons.TooLarge);
    }

    [Fact]
    public void Availability_is_forwarded_keyed_by_source_without_dedupe()
    {
        var s = Subscriber("instr-prm-1");
        var av = """
            {"schema_version":"1.0","message_kind":"SOURCE_AVAILABILITY","tenant_id":"default","site_id":"hdpe","source_id":"instr-prm-1",
             "producer_id":"instrumental-sim","producer_epoch":1,"state":"OFFLINE","since":"2026-09-16T11:59:00.000Z",
             "published_at":"2026-09-16T12:00:00.000Z","last_will":true}
            """;
        var topic = $"{Prefix}/default/hdpe/sources/instr-prm-1/availability";
        var (o, key, _, _) = Run(s, topic, av);
        o.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward);
        key.Should().Be("instr-prm-1");
        Run(s, topic, av).outcome.Should().Be(InstrumentalHealthSubscriber.Outcome.Forward, "availability carries no observation id");
    }

    [Fact]
    public void The_profile_block_is_validated_at_save_time()
    {
        InstrumentalHealthConfig.Validate(new InstrumentalHealthConfig { TenantId = "default", SiteId = "hdpe", AllowedSourceIds = new() { "instr-prm-1" } }).Should().BeNull();
        InstrumentalHealthConfig.Validate(new InstrumentalHealthConfig { TenantId = "", SiteId = "hdpe", AllowedSourceIds = new() { "x" } })!.Value.Field.Should().Be("instrumental_health.tenant_id");
        InstrumentalHealthConfig.Validate(new InstrumentalHealthConfig { TenantId = "default", SiteId = "hdpe" })!.Value.Field.Should().Be("instrumental_health.allowed_source_ids");
        var settings = new InstrumentalHealthConfig { TenantId = "default", SiteId = "hdpe", AllowedSourceIds = new() { "s1" } }.Resolve();
        settings.SubscriptionFilters().Should().Equal(
            "traverse/instrumental/v1/default/hdpe/devices/+/state",
            "traverse/instrumental/v1/default/hdpe/devices/+/events",
            "traverse/instrumental/v1/default/hdpe/sources/+/availability");
    }
}
