using Microsoft.EntityFrameworkCore;
using Traverse.AssetModel.Models;

namespace Traverse.AssetModel.Data;

public class AssetDbContext : DbContext
{
    public AssetDbContext(DbContextOptions<AssetDbContext> options) : base(options) { }
    
    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<AliasMapping> AliasMappings => Set<AliasMapping>();
    public DbSet<AssetRelationship> AssetRelationships => Set<AssetRelationship>();
    
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

            // Transport overrides (43_traverse_assets_transport_overrides.sql).
            // Stored so an asset can state where its data ACTUALLY lives when the
            // path-derived transport is wrong (CPLM loop signals). Null = derive.
            entity.Property(e => e.IoTDbPathOverride).HasColumnName("iotdb_path_override");
            entity.Property(e => e.SparkplugGroupOverride).HasColumnName("sparkplug_group_override");
            entity.Property(e => e.SparkplugEdgeNodeOverride).HasColumnName("sparkplug_edge_override");
            entity.Property(e => e.SparkplugDeviceOverride).HasColumnName("sparkplug_device_override");
            entity.Property(e => e.SparkplugMetricOverride).HasColumnName("sparkplug_metric_override");
            
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

        modelBuilder.Entity<AssetRelationship>(entity =>
        {
            entity.ToTable("asset_relationships");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            entity.Property(e => e.FromAssetId).HasColumnName("from_asset_id").IsRequired();
            entity.Property(e => e.ToAssetId).HasColumnName("to_asset_id").IsRequired();
            entity.Property(e => e.RelType).HasColumnName("rel_type").IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");

            entity.HasIndex(e => new { e.FromAssetId, e.ToAssetId, e.RelType }).IsUnique();
            entity.HasIndex(e => new { e.FromAssetId, e.RelType });
            entity.HasIndex(e => new { e.ToAssetId, e.RelType });
        });
    }
}
