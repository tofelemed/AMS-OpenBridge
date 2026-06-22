using AMS.AuditService.Models;
using Microsoft.EntityFrameworkCore;

namespace AMS.AuditService.Persistence;

public class AuditDbContext : DbContext
{
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();

    public AuditDbContext(DbContextOptions<AuditDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.HasDefaultSchema("audit");

        var e = mb.Entity<AuditEvent>();
        e.ToTable("immutable_events");
        e.HasKey(x => x.EventId);

        e.Property(x => x.TimestampUtc).IsRequired();
        e.Property(x => x.EventType).IsRequired().HasMaxLength(100);
        e.Property(x => x.UserId).HasMaxLength(100);
        e.Property(x => x.SourceIp).HasMaxLength(50);
        e.Property(x => x.Station).HasMaxLength(100);
        e.Property(x => x.EntityType).HasMaxLength(100);
        e.Property(x => x.EntityId).HasMaxLength(100);
        e.Property(x => x.CorrelationId).HasMaxLength(100);
        e.Property(x => x.PreviousHash).IsRequired().HasMaxLength(64);
        e.Property(x => x.CurrentHash).IsRequired().HasMaxLength(64);

        // JSON columns mapping for PostgreSQL
        e.Property(x => x.BeforeState).HasColumnType("jsonb");
        e.Property(x => x.AfterState).HasColumnType("jsonb");

        // Indexes for querying
        e.HasIndex(x => x.TimestampUtc);
        e.HasIndex(x => new { x.EntityType, x.EntityId });
        e.HasIndex(x => x.UserId);
        e.HasIndex(x => x.CurrentHash).IsUnique(); // Ensure chain uniqueness
    }

    // INTERCEPT SAVES TO PREVENT UPDATES OR DELETES
    public override int SaveChanges()
    {
        EnsureAppendOnly();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        EnsureAppendOnly();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void EnsureAppendOnly()
    {
        var modifiedOrDeleted = ChangeTracker.Entries()
            .Where(e => e.State == EntityState.Modified || e.State == EntityState.Deleted);

        if (modifiedOrDeleted.Any())
        {
            throw new InvalidOperationException("Audit records are immutable. UPDATE and DELETE operations are strictly forbidden.");
        }
    }
}
