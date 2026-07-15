using Microsoft.EntityFrameworkCore;
using Traverse.AssetModel.Models;

namespace Traverse.AssetModel.Data;

public class AssetDbContext : DbContext
{
    public AssetDbContext(DbContextOptions<AssetDbContext> options) : base(options) { }
    
    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<AliasMapping> AliasMappings => Set<AliasMapping>();
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("assets");
        
        modelBuilder.Entity<Asset>(entity =>
        {
            entity.ToTable("assets");
            entity.HasKey(e => e.Id);
            
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.ContextualPath).HasColumnName("contextual_path").IsRequired();
            entity.Property(e => e.Name).HasColumnName("name").IsRequired();
            entity.Property(e => e.Type).HasColumnName("asset_type").IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.EngineeringUnit).HasColumnName("engineering_unit");
            entity.Property(e => e.LoEngLimit).HasColumnName("lo_eng_limit");
            entity.Property(e => e.HiEngLimit).HasColumnName("hi_eng_limit");
            entity.Property(e => e.Template).HasColumnName("template");
            entity.Property(e => e.ParentId).HasColumnName("parent_id");
            entity.Property(e => e.IsDeleted).HasColumnName("is_deleted").HasDefaultValue(false);
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            
            entity.HasIndex(e => e.ContextualPath).IsUnique().HasFilter("NOT is_deleted");
            entity.HasIndex(e => e.ParentId);
            entity.HasIndex(e => e.Type);
            
            // Ignore computed properties
            entity.Ignore(e => e.IoTDbPath);
            entity.Ignore(e => e.SparkplugGroup);
            entity.Ignore(e => e.SparkplugEdgeNode);
            entity.Ignore(e => e.SparkplugDevice);
            entity.Ignore(e => e.SparkplugMetric);
            entity.Ignore(e => e.SparkplugTopic);
            entity.Ignore(e => e.AlarmSource);
            entity.Ignore(e => e.RedisSnapshotKey);
        });
        
        modelBuilder.Entity<AliasMapping>(entity =>
        {
            entity.ToTable("alias_mapping");
            entity.HasKey(e => e.Id);
            
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.LegacyPath).HasColumnName("legacy_path").IsRequired();
            entity.Property(e => e.CanonicalPath).HasColumnName("canonical_path").IsRequired();
            entity.Property(e => e.SourceSystem).HasColumnName("source_system").IsRequired();
            entity.Property(e => e.IsActive).HasColumnName("is_active").HasDefaultValue(true);
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            
            entity.HasIndex(e => new { e.LegacyPath, e.SourceSystem }).IsUnique();
            entity.HasIndex(e => e.CanonicalPath);
        });
    }
}
