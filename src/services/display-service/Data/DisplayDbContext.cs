using Microsoft.EntityFrameworkCore;
using Traverse.DisplayService.Models;

namespace Traverse.DisplayService.Data;

public class DisplayDbContext : DbContext
{
    public DisplayDbContext(DbContextOptions<DisplayDbContext> options) : base(options) { }
    
    public DbSet<Display> Displays => Set<Display>();
    public DbSet<DisplayVersion> DisplayVersions => Set<DisplayVersion>();
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("displays");
        
        modelBuilder.Entity<Display>(entity =>
        {
            entity.ToTable("display_definitions");
            entity.HasKey(e => e.Id);
            
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name").IsRequired();
            entity.Property(e => e.Category).HasColumnName("category").IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.HierarchyPath).HasColumnName("hierarchy_path");
            entity.Property(e => e.Width).HasColumnName("width");
            entity.Property(e => e.Height).HasColumnName("height");
            entity.Property(e => e.BackgroundColor).HasColumnName("background_color");
            entity.Property(e => e.PublishedVersion).HasColumnName("published_version");
            entity.Property(e => e.DraftVersion).HasColumnName("draft_version");
            entity.Property(e => e.OwnerId).HasColumnName("owner_id").IsRequired();
            entity.Property(e => e.IsDeleted).HasColumnName("is_deleted").HasDefaultValue(false);
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            
            entity.HasIndex(e => e.Name);
            entity.HasIndex(e => e.Category);
            entity.HasIndex(e => e.HierarchyPath);
            entity.HasIndex(e => e.OwnerId);
            
            entity.HasMany(e => e.Versions)
                .WithOne(v => v.Display)
                .HasForeignKey(v => v.DisplayId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        
        modelBuilder.Entity<DisplayVersion>(entity =>
        {
            entity.ToTable("display_versions");
            entity.HasKey(e => e.Id);
            
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.DisplayId).HasColumnName("display_id");
            entity.Property(e => e.Version).HasColumnName("version");
            entity.Property(e => e.Snapshot).HasColumnName("snapshot").HasColumnType("jsonb");
            entity.Property(e => e.Status).HasColumnName("status").IsRequired();
            entity.Property(e => e.ChangeNote).HasColumnName("change_note");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by").IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            
            entity.HasIndex(e => new { e.DisplayId, e.Version }).IsUnique();
            entity.HasIndex(e => e.Status);
        });
    }
}
