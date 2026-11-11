using System.Security.Claims;
using System.Text.Json;
using AMS.AuditService.Models;

namespace AMS.AuditService.Verification;

/// <summary>
/// Who asked for a rechain: the gateway-forwarded identity (X-Auth-Subject / X-Auth-Username,
/// turned into claims by the shared header-trust module), never anything from the request body.
/// </summary>
public sealed record RechainActor(string? UserId, string Username)
{
    public static RechainActor From(ClaimsPrincipal user) => new(
        user.FindFirst("sub")?.Value,
        user.FindFirst("preferred_username")?.Value
            ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? "unknown");
}

/// <summary>
/// CHG-173: the chain's own record of a rechain. It is appended after the rehash, in the same
/// save, so it is hashed under the new chain and shows in the trail: a rechain is never silent.
/// Shape as the other governance events: <c>UserId</c> is the user name,
/// <c>AfterState.actor = { user_id, username }</c>.
/// </summary>
public static class RechainRecord
{
    public const string EventType = "AUDIT_CHAIN_RECHAINED";
    public const string EntityType = "AuditChain";
    public const string EntityId = "audit.immutable_events";

    /// <param name="total">Rows in the chain when it was recomputed (this record not included).</param>
    /// <param name="rehashed">Rows whose hashes were rewritten.</param>
    /// <param name="at">When the rechain ran.</param>
    /// <param name="tailTimestamp">Timestamp of the chain's last row, if any.</param>
    public static AuditEvent Create(RechainActor actor, int total, int rehashed,
        DateTimeOffset at, DateTimeOffset? tailTimestamp)
    {
        // The chain is ordered by timestamp. A row dated ahead of this clock would otherwise
        // sort after the record and break verification, so the record goes just after it;
        // AfterState.at keeps the real time.
        var timestamp = tailTimestamp is { } tail && tail >= at ? tail.AddMilliseconds(1) : at;

        return new AuditEvent
        {
            TimestampUtc = timestamp,
            EventType = EventType,
            UserId = actor.Username,
            EntityType = EntityType,
            EntityId = EntityId,
            AfterState = JsonSerializer.SerializeToDocument(new
            {
                total,
                rehashed,
                actor = new { user_id = actor.UserId, username = actor.Username },
                at,
            }),
        };
    }
}
