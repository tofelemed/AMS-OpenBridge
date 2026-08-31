namespace Traverse.IngestionService.Pipeline;

/// <summary>Source identity parsed from an OT topic (docs/ot-data-integration/09 §1).</summary>
public sealed record OtTopicIdentity(string Site, string Fcs, string ProcessClass, string LoopTag, string Parameter);

/// <summary>
/// Template-driven topic parser. The template is '/'-separated; '{name}' captures a
/// level, any other segment must match the topic level literally (case-sensitive —
/// MQTT topics are). Required captures: {site} {fcs} {loop} {param}; {class} is
/// optional; other captures ({ns}, {group}, …) are accepted and ignored.
/// </summary>
public static class OtTopicParser
{
    public static bool TryParse(string template, string topic, out OtTopicIdentity? identity, out string? error)
    {
        identity = null; error = null;
        var t = template.Split('/');
        var s = topic.Split('/');
        if (t.Length != s.Length)
        {
            error = $"topic has {s.Length} levels, template expects {t.Length}";
            return false;
        }
        string? site = null, fcs = null, cls = null, loop = null, param = null;
        for (var i = 0; i < t.Length; i++)
        {
            var seg = t[i];
            if (seg.Length > 1 && seg[0] == '{' && seg[^1] == '}')
            {
                switch (seg[1..^1])
                {
                    case "site": site = s[i]; break;
                    case "fcs": fcs = s[i]; break;
                    case "class": cls = s[i]; break;
                    case "loop": loop = s[i]; break;
                    case "param": param = s[i]; break;
                }
            }
            else if (!string.Equals(seg, s[i], StringComparison.Ordinal))
            {
                error = $"level {i + 1} is '{s[i]}', template requires '{seg}'";
                return false;
            }
        }
        foreach (var (value, name) in new[] { (site, "{site}"), (fcs, "{fcs}"), (loop, "{loop}"), (param, "{param}") })
        {
            if (value is null) { error = $"template does not capture {name}"; return false; }
        }
        if (string.IsNullOrWhiteSpace(loop) || string.IsNullOrWhiteSpace(param))
        {
            error = "empty loop or parameter level";
            return false;
        }
        identity = new OtTopicIdentity(site!, fcs!, cls ?? "", loop!, param!);
        return true;
    }
}
