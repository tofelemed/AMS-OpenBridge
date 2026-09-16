using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Traverse.CplmApi.Config;

/// <summary>
/// v2.5 Task 3B.2 (spec v6 §5.3): RFC 8785 JSON Canonicalization Scheme - object keys sorted by
/// UTF-16 code units, no whitespace, numbers in ES6 Number::toString form, strings with only the
/// mandatory escapes. The content hash of a bundle is SHA-256 over this text, so the same layers
/// always give the same hash on every machine and in every language.
/// </summary>
public static class CanonicalJson
{
    public static string Canonicalize(JsonElement el)
    {
        var sb = new StringBuilder();
        Write(sb, el);
        return sb.ToString();
    }

    public static string Sha256(JsonElement el) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Canonicalize(el)))).ToLowerInvariant();

    public static string Sha256(string canonicalText) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonicalText))).ToLowerInvariant();

    private static void Write(StringBuilder sb, JsonElement el)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.Object:
                sb.Append('{');
                var first = true;
                foreach (var p in el.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal))   // ordinal = UTF-16 code unit order
                {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteString(sb, p.Name);
                    sb.Append(':');
                    Write(sb, p.Value);
                }
                sb.Append('}');
                break;
            case JsonValueKind.Array:
                sb.Append('[');
                var firstItem = true;
                foreach (var item in el.EnumerateArray())
                {
                    if (!firstItem) sb.Append(',');
                    firstItem = false;
                    Write(sb, item);
                }
                sb.Append(']');
                break;
            case JsonValueKind.String:
                WriteString(sb, el.GetString() ?? "");
                break;
            case JsonValueKind.Number:
                sb.Append(Es6Number(el.GetDouble()));
                break;
            case JsonValueKind.True: sb.Append("true"); break;
            case JsonValueKind.False: sb.Append("false"); break;
            default: sb.Append("null"); break;
        }
    }

    private static void WriteString(StringBuilder sb, string s)
    {
        sb.Append('"');
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (ch < 0x20) sb.Append("\\u").Append(((int)ch).ToString("x4", CultureInfo.InvariantCulture));
                    else sb.Append(ch);
                    break;
            }
        }
        sb.Append('"');
    }

    /// <summary>ES6 Number::toString (RFC 8785 §3.2.2.3): shortest round-trip digits, positional for 1e-7 &lt;= |x| &lt; 1e21, else exponent form.</summary>
    public static string Es6Number(double d)
    {
        if (d == 0) return "0";
        if (double.IsNaN(d) || double.IsInfinity(d)) throw new ArgumentException("non-finite numbers cannot be canonicalised");
        var r = d.ToString("R", CultureInfo.InvariantCulture);
        var neg = r.StartsWith('-');
        if (neg) r = r[1..];
        string mant;
        int exp = 0;
        if (r.Contains('E'))
        {
            var parts = r.Split('E');
            mant = parts[0];
            exp = int.Parse(parts[1], CultureInfo.InvariantCulture);
        }
        else mant = r;
        var point = mant.IndexOf('.');
        var digitsRaw = mant.Replace(".", "");
        var intLen = (point < 0 ? mant.Length : point) + exp;
        var leadingZeros = digitsRaw.Length - digitsRaw.TrimStart('0').Length;
        var digits = digitsRaw.TrimStart('0').TrimEnd('0');
        if (digits.Length == 0) return "0";
        var n = intLen - leadingZeros;                                 // decimal point position relative to the first significant digit
        var k = digits.Length;
        string body;
        if (k <= n && n <= 21) body = digits + new string('0', n - k);
        else if (0 < n && n <= 21) body = digits[..n] + "." + digits[n..];
        else if (-6 < n && n <= 0) body = "0." + new string('0', -n) + digits;
        else
        {
            var e = n - 1;
            var m = k == 1 ? digits : digits[..1] + "." + digits[1..];
            body = m + "e" + (e < 0 ? "-" : "+") + Math.Abs(e).ToString(CultureInfo.InvariantCulture);
        }
        return neg ? "-" + body : body;
    }
}
