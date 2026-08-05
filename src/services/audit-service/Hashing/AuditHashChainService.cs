using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AMS.AuditService.Models;

namespace AMS.AuditService.Hashing;

public class AuditHashChainService
{
    private static readonly string SecretSalt = Environment.GetEnvironmentVariable("AUDIT_SALT") ?? "default-development-salt";

    /// <summary>
    /// Generates a SHA-256 hash for the current event, chaining it to the previous hash.
    /// </summary>
    public string GenerateHash(AuditEvent evt, string previousHash)
    {
        evt.PreviousHash = previousHash;

        // Canonical string representation for hashing. The Before/AfterState
        // columns are jsonb: Postgres rewrites key order and whitespace, so the
        // hash must be over a canonical serialization (sorted keys, compact) or
        // verification fails on every round-tripped row — which is exactly what
        // happened to the original ToString()-based preimage.
        var payload = new StringBuilder()
            .Append(evt.EventId)
            .Append(evt.TimestampUtc.ToUnixTimeMilliseconds())
            .Append(evt.EventType)
            .Append(evt.UserId)
            .Append(evt.SourceIp)
            .Append(evt.EntityId)
            .Append(evt.BeforeState is null ? "null" : Canonical(evt.BeforeState.RootElement))
            .Append(evt.AfterState is null ? "null" : Canonical(evt.AfterState.RootElement))
            .Append(previousHash)
            .Append(SecretSalt)
            .ToString();

        using var sha256 = SHA256.Create();
        var bytes = Encoding.UTF8.GetBytes(payload);
        var hash = sha256.ComputeHash(bytes);
        
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    /// <summary>
    /// Validates if an event's hash matches its contents and previous hash.
    /// </summary>
    public bool VerifyIntegrity(AuditEvent evt)
    {
        var expectedHash = GenerateHash(evt, evt.PreviousHash);
        return evt.CurrentHash.Equals(expectedHash, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Order- and whitespace-independent JSON text: object keys sorted ordinally,
    /// compact separators, scalars as raw text. Stable across a jsonb round trip.
    /// </summary>
    private static string Canonical(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Object => "{" + string.Join(",",
            el.EnumerateObject()
              .OrderBy(p => p.Name, StringComparer.Ordinal)
              .Select(p => JsonSerializer.Serialize(p.Name) + ":" + Canonical(p.Value))) + "}",
        JsonValueKind.Array => "[" + string.Join(",", el.EnumerateArray().Select(Canonical)) + "]",
        _ => el.GetRawText(),
    };
}
