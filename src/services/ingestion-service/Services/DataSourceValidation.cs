using System.Text.RegularExpressions;
using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Services;

/// <summary>
/// Server-side validation (the wizard mirrors these rules client-side). Returns
/// null when valid, else (error, field) so the UI can route focus to the owning
/// wizard step.
/// </summary>
public static partial class DataSourceValidation
{
    [GeneratedRegex(@"^(mqtt|mqtts)://[^\s/:]+(:\d{1,5})?$")]
    private static partial Regex ConnectionUrlRegex();

    [GeneratedRegex(@"^[A-Za-z0-9_-]{1,64}$")]
    private static partial Regex ClientIdRegex();

    private const int MaxCaCertChars = 64 * 1024;

    public static (string Error, string Field)? ValidateCreate(CreateDataSourceRequest r)
    {
        if (!string.IsNullOrEmpty(r.SourceType) && r.SourceType != "MQTT")
            return ("Only source_type 'MQTT' is supported", "sourceType");
        if (string.IsNullOrWhiteSpace(r.Name))
            return ("Name is required", "name");
        if (r.Name.Length > 255)
            return ("Name must be 255 characters or fewer", "name");
        if (!ProfileRegistry.Exists(r.ProfileType))
            return ("Unknown profile type", "profileType");
        if (string.IsNullOrWhiteSpace(r.Username))
            return ("Username is required", "username");
        if (string.IsNullOrEmpty(r.Password))
            return ("Password is required", "password");

        return ValidateShared(r.ConnectionUrl, r.TimeoutSeconds, r.InsecureSkipVerify ?? false, r.ProfileConfig);
    }

    /// <summary>
    /// Update requests are partial, so cross-field rules (TLS coherence) must be
    /// checked against the MERGED state, not the sparse request — the caller merges
    /// the request onto the stored row first and passes the result here.
    /// </summary>
    public static (string Error, string Field)? ValidateMerged(
        string? name, string? username, string? connectionUrl, int? timeoutSeconds,
        bool insecureSkipVerify, string? profileType, ProfileConfig? profileConfig)
    {
        if (string.IsNullOrWhiteSpace(name))
            return ("Name is required", "name");
        if (name.Length > 255)
            return ("Name must be 255 characters or fewer", "name");
        if (!ProfileRegistry.Exists(profileType))
            return ("Unknown profile type", "profileType");
        if (string.IsNullOrWhiteSpace(username))
            return ("Username is required", "username");

        return ValidateShared(connectionUrl, timeoutSeconds, insecureSkipVerify, profileConfig);
    }

    private static (string Error, string Field)? ValidateShared(
        string? connectionUrl, int? timeoutSeconds, bool insecureSkipVerify, ProfileConfig? profileConfig)
    {
        if (string.IsNullOrWhiteSpace(connectionUrl))
            return ("Broker URL is required", "connectionUrl");
        if (!ConnectionUrlRegex().IsMatch(connectionUrl.Trim()))
            return ("Broker URL must look like mqtt://host:1883 or mqtts://host:8883 (scheme + host, optional port, no path)", "connectionUrl");
        if (timeoutSeconds is <= 0)
            return ("Timeout must be greater than 0", "timeoutSeconds");

        var mqtt = profileConfig?.Mqtt;
        if (mqtt is null)
            return ("profileConfig.mqtt is required", "profileConfig");

        var topics = (mqtt.Topics ?? new List<string>())
            .Select(t => t?.Trim() ?? "")
            .Where(t => t.Length > 0)
            .ToList();
        if (topics.Count == 0)
            return ("At least one topic filter is required", "topics");
        foreach (var topic in topics)
        {
            if (!IsValidTopicFilter(topic))
                return ($"Invalid topic filter '{topic}': '#' must be the last level and '+'/'#' must occupy a whole level", "topics");
        }
        mqtt.Topics = topics; // trimmed, blanks dropped (spec §10)

        if (mqtt.Qos is not (null or 0 or 1 or 2))
            return ("QoS must be 0, 1 or 2", "qos");
        if (mqtt.SessionExpirySeconds is < 0)
            return ("Session expiry must be 0 or greater", "sessionExpirySeconds");
        if (mqtt.KeepaliveSeconds is <= 0)
            return ("Keepalive must be greater than 0", "keepaliveSeconds");
        if (!string.IsNullOrWhiteSpace(mqtt.ClientId) && !ClientIdRegex().IsMatch(mqtt.ClientId.Trim()))
            return ("Client ID may contain letters, digits, '_' and '-' (max 64 chars)", "clientId");

        // TLS coherence (spec §10 INVARIANT): the three trust modes are mutually
        // exclusive — a stale leftover would make the UI lie about which
        // certificate is in use.
        var tls = mqtt.Tls;
        var hasPem = !string.IsNullOrWhiteSpace(tls?.CaCertPem);
        var hasPath = !string.IsNullOrWhiteSpace(tls?.CaCertPath);
        if (hasPem && hasPath)
            return ("Provide either an inline CA certificate or a server CA path, not both", "tls");
        if (insecureSkipVerify && (hasPem || hasPath))
            return ("Certificate verification is disabled — remove the CA certificate or re-enable verification", "tls");
        if (hasPem)
        {
            var pem = tls!.CaCertPem!;
            if (pem.Length > MaxCaCertChars)
                return ("CA certificate is larger than 64 KB — a CA certificate is a few KB; wrong file?", "tls");
            if (!pem.Contains("-----BEGIN CERTIFICATE-----", StringComparison.Ordinal))
                return ("Not a PEM certificate (missing BEGIN CERTIFICATE)", "tls");
            if (pem.Contains("PRIVATE KEY", StringComparison.Ordinal))
                return ("This file contains a private key — upload the CA certificate, never a key", "tls");
        }

        return ValidateLoopIngest(profileConfig);
    }

    /// <summary>Reserved names on the tuple wire — extension roles may not shadow them
    /// (docs/ot-data-integration/09 §4: contract fields + enrichment extensions).</summary>
    private static readonly HashSet<string> ReservedTupleFields = new(StringComparer.Ordinal)
    { "loop_id", "event_ts_ms", "ingest_ts_ms", "quality", "loop_type", "site", "area", "unit", "asset_uuid", "source_fcs" };

    /// <summary>Roles the pipeline cannot run without. No source for pv/sp/op means no
    /// loop ever emits a tuple; no source for mode means every tuple is stamped
    /// UNKNOWN and G1 excludes every loop. Either way the fleet goes dark from one
    /// config save, with G0 green — so it is refused at save time instead.</summary>
    private static readonly string[] RequiredRoles = { "pv", "sp", "op", "mode" };

    public static (string Error, string Field)? ValidateLoopIngest(ProfileConfig? profileConfig)
    {
        var li = profileConfig?.LoopIngest;
        if (li is null) return null;

        if (!string.IsNullOrWhiteSpace(li.TopicTemplate))
        {
            var captures = li.TopicTemplate.Split('/')
                .Where(s => s.Length > 1 && s[0] == '{' && s[^1] == '}')
                .Select(s => s[1..^1])
                .ToHashSet(StringComparer.Ordinal);
            foreach (var required in new[] { "site", "fcs", "loop", "param" })
                if (!captures.Contains(required))
                    return ($"topic_template must capture {{{required}}}", "loop_ingest.topic_template");
        }
        if (li.GridSeconds is <= 0)
            return ("grid_seconds must be greater than 0", "loop_ingest.grid_seconds");
        if (li.FutureSkewMaxSeconds is <= 0)
            return ("future_skew_max_seconds must be greater than 0", "loop_ingest.future_skew_max_seconds");
        if (li.RegistryRefreshSeconds is <= 0)
            return ("registry_refresh_seconds must be greater than 0", "loop_ingest.registry_refresh_seconds");

        if (li.ParamRoles is not null)
        {
            foreach (var (param, role) in li.ParamRoles)
            {
                if (string.IsNullOrWhiteSpace(param))
                    return ("param_roles keys must be non-blank", "loop_ingest.param_roles");
                // A null/blank VALUE is the explicit un-map of a built-in entry (the map
                // overlays the defaults) — legal, checked below against the effective map.
                if (string.IsNullOrWhiteSpace(role)) continue;
                var r = role.Trim();
                if (ReservedTupleFields.Contains(r))
                    return ($"role '{r}' shadows a tuple contract field", "loop_ingest.param_roles");
                if (!r.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c == '_'))
                    return ($"role '{r}' must be lowercase [a-z0-9_]", "loop_ingest.param_roles");
            }

            var effective = LoopIngestConfig.EffectiveParamRoles(li.ParamRoles);
            foreach (var required in RequiredRoles)
            {
                if (effective.Values.Any(v => v == required)) continue;
                return ($"param_roles leaves no source parameter mapped to '{required}' — " +
                        "every loop on this source would stop being analysed. Map a leaf to it " +
                        "(the built-in map is overlaid, not replaced; a null value removes an entry).",
                        "loop_ingest.param_roles");
            }
        }
        return null;
    }

    /// <summary>
    /// MQTT topic-filter rules: '#' matches all remaining levels and must be the
    /// entire last level ('a/#' ok, 'a/#/b' and 'a#' silently match nothing);
    /// '+' matches exactly one whole level.
    /// </summary>
    public static bool IsValidTopicFilter(string filter)
    {
        if (string.IsNullOrWhiteSpace(filter)) return false;
        var levels = filter.Split('/');
        for (var i = 0; i < levels.Length; i++)
        {
            var level = levels[i];
            if (level == "#")
            {
                if (i != levels.Length - 1) return false;
            }
            else if (level.Contains('#'))
            {
                return false;
            }
            else if (level.Contains('+') && level != "+")
            {
                return false;
            }
        }
        return true;
    }
}
