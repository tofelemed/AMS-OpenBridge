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
        
        // Canonical string representation for hashing
        var payload = new StringBuilder()
            .Append(evt.EventId)
            .Append(evt.TimestampUtc.ToUnixTimeMilliseconds())
            .Append(evt.EventType)
            .Append(evt.UserId)
            .Append(evt.SourceIp)
            .Append(evt.EntityId)
            .Append(evt.BeforeState?.RootElement.ToString() ?? "null")
            .Append(evt.AfterState?.RootElement.ToString() ?? "null")
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
}
