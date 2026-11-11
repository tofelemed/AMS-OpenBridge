using System.Security.Claims;
using AMS.AuditService.Hashing;
using AMS.AuditService.Models;
using AMS.AuditService.Persistence;
using AMS.AuditService.Verification;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace AMS.AuditService.Tests;

/// <summary>CHG-173: the rechain and its AUDIT_CHAIN_RECHAINED record, below the HTTP layer.</summary>
public sealed class RechainRecordTests
{
    private readonly string _dbName = "audit-unit-" + Guid.NewGuid();
    private static readonly RechainActor Actor = new("sub-ops", "ops.admin");

    private static ChainIntegrityVerifier Verifier(AuditDbContext db) =>
        new(db, new AuditHashChainService(), NullLogger<ChainIntegrityVerifier>.Instance);

    [Fact]
    public async Task A_failed_rechain_records_nothing_and_rewrites_nothing()
    {
        var legacy = TestChain.LegacyEvents(3);
        await using (var seed = InMemoryAuditDbContext.Create(_dbName))
        {
            seed.AuditEvents.AddRange(legacy);
            await seed.SaveChangesAsync();
        }

        await using (var db = InMemoryAuditDbContext.Create(_dbName, new FailingSave()))
        {
            var act = () => Verifier(db).RechainAsync(Actor, CancellationToken.None);
            await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("simulated*");
        }

        await using var check = InMemoryAuditDbContext.Create(_dbName);
        var chain = await check.AuditEvents.AsNoTracking().ToListAsync();
        chain.Should().HaveCount(3);
        chain.Should().NotContain(e => e.EventType == TestChain.RechainedType);
        chain.Select(e => e.CurrentHash).Should().BeEquivalentTo(legacy.Select(e => e.CurrentHash));
    }

    [Fact]
    public async Task The_record_stays_last_when_a_row_is_dated_ahead_of_this_clock()
    {
        await using (var seed = InMemoryAuditDbContext.Create(_dbName))
        {
            seed.AuditEvents.AddRange(TestChain.LegacyEvents(2, DateTimeOffset.UtcNow.AddHours(1)));
            await seed.SaveChangesAsync();
        }

        await using (var db = InMemoryAuditDbContext.Create(_dbName))
            (await Verifier(db).RechainAsync(Actor, CancellationToken.None)).Should().Be((2, 2));

        await using var check = InMemoryAuditDbContext.Create(_dbName);
        var chain = await check.AuditEvents.AsNoTracking()
            .OrderBy(e => e.TimestampUtc).ThenBy(e => e.EventId).ToListAsync();
        chain[^1].EventType.Should().Be(TestChain.RechainedType);
        (await Verifier(check).VerifyFullChainAsync(CancellationToken.None)).Should().BeTrue();
    }

    [Fact]
    public async Task An_empty_chain_still_records_the_call()
    {
        await using (var db = InMemoryAuditDbContext.Create(_dbName))
            (await Verifier(db).RechainAsync(Actor, CancellationToken.None)).Should().Be((0, 0));

        await using var check = InMemoryAuditDbContext.Create(_dbName);
        var only = await check.AuditEvents.AsNoTracking().SingleAsync();
        only.EventType.Should().Be(TestChain.RechainedType);
        only.PreviousHash.Should().Be(new string('0', 64));
        (await Verifier(check).VerifyFullChainAsync(CancellationToken.None)).Should().BeTrue();
    }

    [Fact]
    public void The_actor_is_read_from_the_gateway_identity()
    {
        var gateway = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "u-42"), new Claim("sub", "u-42"),
            new Claim("preferred_username", "jane"),
        }, "TraverseHeaders"));
        RechainActor.From(gateway).Should().Be(new RechainActor("u-42", "jane"));

        var noUsername = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "u-7"), new Claim("sub", "u-7"),
        }, "TraverseHeaders"));
        RechainActor.From(noUsername).Should().Be(new RechainActor("u-7", "u-7"));
    }

    /// <summary>
    /// Fails only the save that carries the record, so a rehash saved on its own before the
    /// record (a rechain that could end up unrecorded) would leave rewritten hashes and fail the test.
    /// </summary>
    private sealed class FailingSave : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
        {
            var carriesRecord = eventData.Context!.ChangeTracker.Entries<AuditEvent>()
                .Any(e => e.State == EntityState.Added && e.Entity.EventType == TestChain.RechainedType);
            if (carriesRecord) throw new InvalidOperationException("simulated database failure");
            return ValueTask.FromResult(result);
        }
    }
}
