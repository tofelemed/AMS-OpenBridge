using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Traverse.CplmApi.Config;

/// <summary>
/// v2.5 Task 3A.1 (spec v6 §5.1, R16 / R18): the 165-property gate configuration catalogue as the
/// service carries it - an embedded copy of contracts/gate-config/v1/property-catalogue.json generated
/// from the spec sheet. Typed accessors, the dependency graph (change-class promotion walks the
/// dependants of an edited property), and the content hash that /capabilities reports and the
/// Flink CAPABILITY ACK must match.
/// </summary>
public sealed class PropertyCatalogue
{
    public sealed record Entry(
        string Id, string Gate, string Property, string Type, string Unit, object? Default, JsonElement Validation,
        string ChangeClass, IReadOnlyList<string> Consumers, IReadOnlyList<string> Dependencies, string Effect)
    {
        public IReadOnlyList<string> EnumValues => Validation.ValueKind == JsonValueKind.Array ? Validation.EnumerateArray().Select(v => v.GetString() ?? "").ToList() : Array.Empty<string>();
        public double? Minimum => Num("minimum");
        public double? Maximum => Num("maximum");
        public int? MinItems => Num("minItems") is { } v ? (int)v : null;
        public int? MaxItems => Num("maxItems") is { } v ? (int)v : null;
        public bool CommissioningRequired => Default is null;

        private double? Num(string name) =>
            Validation.ValueKind == JsonValueKind.Object && Validation.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
    }

    public static readonly string[] ChangeClasses = { "POLICY", "STATE_BOUNDARY", "DEPLOYMENT" };
    private static readonly string[] ClassOrder = ChangeClasses;

    public string CatalogueHash { get; }
    public string Schema { get; }
    public IReadOnlyList<Entry> Properties { get; }
    public int Count => Properties.Count;
    private readonly Dictionary<string, Entry> _byProperty;
    private readonly Dictionary<string, List<string>> _dependants;

    private PropertyCatalogue(string schema, string hash, IReadOnlyList<Entry> properties)
    {
        Schema = schema;
        CatalogueHash = hash;
        Properties = properties;
        _byProperty = properties.ToDictionary(p => p.Property, StringComparer.Ordinal);
        _dependants = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var p in properties)
            foreach (var d in p.Dependencies)
                (_dependants.TryGetValue(d, out var l) ? l : _dependants[d] = new List<string>()).Add(p.Property);
    }

    private static readonly Lazy<PropertyCatalogue> Loaded = new(LoadEmbedded);

    /// <summary>The catalogue this build carries.</summary>
    public static PropertyCatalogue Current => Loaded.Value;

    public Entry this[string property] => _byProperty.TryGetValue(property, out var e) ? e : throw new KeyNotFoundException($"'{property}' is not a catalogue property");

    public bool TryGet(string property, out Entry entry) => _byProperty.TryGetValue(property, out entry!);

    public IReadOnlyList<string> Dependants(string property) => _dependants.TryGetValue(property, out var l) ? l : Array.Empty<string>();

    /// <summary>
    /// The change class a set of edits carries: the maximum over the edited properties AND every
    /// property that depends on them (transitively) - a policy threshold an event detector reads is
    /// a state boundary change.
    /// </summary>
    public string EffectiveChangeClass(IEnumerable<string> editedProperties)
    {
        var best = 0;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var stack = new Stack<string>(editedProperties);
        while (stack.Count > 0)
        {
            var p = stack.Pop();
            if (!seen.Add(p) || !_byProperty.TryGetValue(p, out var e)) continue;
            best = Math.Max(best, Array.IndexOf(ClassOrder, e.ChangeClass));
            foreach (var d in Dependants(p)) stack.Push(d);
        }
        return ClassOrder[Math.Max(0, best)];
    }

    public bool HasCycle()
    {
        var state = new Dictionary<string, int>(StringComparer.Ordinal);
        bool Visit(string p)
        {
            if (state.TryGetValue(p, out var s)) return s == 1;
            state[p] = 1;
            foreach (var d in this[p].Dependencies) if (Visit(d)) return true;
            state[p] = 2;
            return false;
        }
        return Properties.Any(p => Visit(p.Property));
    }

    /// <summary>SHA-256 over the canonical (sorted keys, no whitespace) JSON of the entries - the generator's rule.</summary>
    public static string HashOf(IEnumerable<Entry> entries)
    {
        var canonical = Canonical(entries);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    private static string Canonical(IEnumerable<Entry> entries)
    {
        // Python json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False): keys sorted, no spaces,
        // numbers as Python prints them (1.0 -> 1.0, 1e-06 -> 1e-06, ints as ints)
        var sb = new StringBuilder("[");
        var first = true;
        foreach (var e in entries)
        {
            if (!first) sb.Append(',');
            first = false;
            sb.Append('{');
            sb.Append("\"change_class\":").Append(JsonSerializer.Serialize(e.ChangeClass)).Append(',');
            sb.Append("\"consumers\":").Append(JsonArray(e.Consumers)).Append(',');
            sb.Append("\"default\":").Append(PyValue(e.Default)).Append(',');
            sb.Append("\"dependencies\":").Append(JsonArray(e.Dependencies)).Append(',');
            sb.Append("\"effect\":").Append(PyString(e.Effect)).Append(',');
            sb.Append("\"gate\":").Append(JsonSerializer.Serialize(e.Gate)).Append(',');
            sb.Append("\"id\":").Append(JsonSerializer.Serialize(e.Id)).Append(',');
            sb.Append("\"property\":").Append(JsonSerializer.Serialize(e.Property)).Append(',');
            sb.Append("\"type\":").Append(JsonSerializer.Serialize(e.Type)).Append(',');
            sb.Append("\"unit\":").Append(PyString(e.Unit)).Append(',');
            sb.Append("\"validation\":").Append(PyElement(e.Validation));
            sb.Append('}');
        }
        return sb.Append(']').ToString();
    }

    private static string JsonArray(IEnumerable<string> items) => "[" + string.Join(",", items.Select(PyString)) + "]";

    /// <summary>Python json.dumps(ensure_ascii=False) string escaping: only the JSON-mandatory escapes.</summary>
    private static string PyString(string s)
    {
        var sb = new StringBuilder("\"");
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (ch < 0x20) sb.Append("\\u").Append(((int)ch).ToString("x4")); else sb.Append(ch);
                    break;
            }
        }
        return sb.Append('"').ToString();
    }

    private static string PyValue(object? v) => v switch
    {
        null => "null",
        bool b => b ? "true" : "false",
        long l => l.ToString(System.Globalization.CultureInfo.InvariantCulture),
        double d => PyFloat(d),
        string s => PyString(s),
        _ => JsonSerializer.Serialize(v),
    };

    /// <summary>
    /// Python's float repr: the shortest round-trip digits, positional for 1e-4 &lt;= |x| &lt; 1e16 (always with a
    /// '.'), else 'd.ddde±XX' with at least two exponent digits ('5.0', '0.001', '1000000000000000.0', '1e-06').
    /// </summary>
    internal static string PyFloat(double d)
    {
        if (d == 0) return d.ToString("R", System.Globalization.CultureInfo.InvariantCulture).StartsWith('-') ? "-0.0" : "0.0";
        var r = d.ToString("R", System.Globalization.CultureInfo.InvariantCulture);
        var neg = r.StartsWith('-');
        if (neg) r = r[1..];
        string mant;
        int exp;
        if (r.Contains('E'))
        {
            var parts = r.Split('E');
            mant = parts[0];
            exp = int.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture);
        }
        else
        {
            mant = r;
            exp = 0;
        }
        var point = mant.IndexOf('.');
        var digits = mant.Replace(".", "");
        var intLen = (point < 0 ? mant.Length : point) + exp;               // digits before the decimal point
        digits = digits.TrimStart('0');
        if (digits.Length == 0) return neg ? "-0.0" : "0.0";
        // decimal exponent of the leading digit
        var lead = intLen - (mant.Replace(".", "").Length - mant.Replace(".", "").TrimStart('0').Length);
        var e10 = lead - 1;
        digits = digits.TrimEnd('0');
        if (digits.Length == 0) digits = "0";
        string body;
        if (e10 >= -4 && e10 < 16)
        {
            if (lead <= 0) body = "0." + new string('0', -lead) + digits;
            else if (lead >= digits.Length) body = digits + new string('0', lead - digits.Length) + ".0";
            else body = digits[..lead] + "." + digits[lead..];
        }
        else
        {
            var m = digits.Length == 1 ? digits : digits[..1] + "." + digits[1..];
            body = m + "e" + (e10 < 0 ? "-" : "+") + Math.Abs(e10).ToString("00", System.Globalization.CultureInfo.InvariantCulture);
        }
        return neg ? "-" + body : body;
    }

    private static string PyElement(JsonElement el)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.Object:
                return "{" + string.Join(",", el.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal).Select(p => PyString(p.Name) + ":" + PyElement(p.Value))) + "}";
            case JsonValueKind.Array:
                return "[" + string.Join(",", el.EnumerateArray().Select(PyElement)) + "]";
            case JsonValueKind.String:
                return PyString(el.GetString() ?? "");
            case JsonValueKind.Number:
                var raw = el.GetRawText();
                return raw.Contains('.') || raw.Contains('e') || raw.Contains('E') ? PyFloat(el.GetDouble()) : raw;
            case JsonValueKind.True: return "true";
            case JsonValueKind.False: return "false";
            default: return "null";
        }
    }

    private static PropertyCatalogue LoadEmbedded()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Traverse.CplmApi.Config.property-catalogue.json")
            ?? throw new InvalidOperationException("property-catalogue.json is not embedded (run scripts/gen-property-catalogue.py)");
        using var doc = JsonDocument.Parse(stream);
        return Parse(doc.RootElement);
    }

    public static PropertyCatalogue Parse(JsonElement root)
    {
        var entries = new List<Entry>();
        foreach (var p in root.GetProperty("properties").EnumerateArray())
        {
            object? def = p.GetProperty("default").ValueKind switch
            {
                JsonValueKind.Null => null,
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Number => p.GetProperty("default").GetRawText().Contains('.') || p.GetProperty("default").GetRawText().Contains('e') ? p.GetProperty("default").GetDouble() : (object)p.GetProperty("default").GetInt64(),
                _ => p.GetProperty("default").GetString(),
            };
            entries.Add(new Entry(
                p.GetProperty("id").GetString()!, p.GetProperty("gate").GetString()!, p.GetProperty("property").GetString()!, p.GetProperty("type").GetString()!,
                p.GetProperty("unit").GetString() ?? "", def, p.GetProperty("validation").Clone(), p.GetProperty("change_class").GetString()!,
                p.GetProperty("consumers").EnumerateArray().Select(c => c.GetString()!).ToList(),
                p.GetProperty("dependencies").EnumerateArray().Select(c => c.GetString()!).ToList(),
                p.TryGetProperty("effect", out var ef) ? ef.GetString() ?? "" : ""));
        }
        var hash = root.TryGetProperty("catalogue_hash", out var h) ? h.GetString() ?? "" : HashOf(entries);
        return new PropertyCatalogue(root.TryGetProperty("schema", out var s) ? s.GetString() ?? "" : "", hash, entries);
    }
}
