using Microsoft.EntityFrameworkCore;
using Traverse.TemplateService.Models;

namespace Traverse.TemplateService.Data;

public class TemplateDbContext : DbContext
{
    public TemplateDbContext(DbContextOptions<TemplateDbContext> options) : base(options) { }
    
    public DbSet<ElementTemplate> Templates => Set<ElementTemplate>();
    public DbSet<TemplateVersion> TemplateVersions => Set<TemplateVersion>();
    public DbSet<TemplateParameter> TemplateParameters => Set<TemplateParameter>();
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("templates");
        
        modelBuilder.Entity<ElementTemplate>(entity =>
        {
            entity.ToTable("element_templates");
            entity.HasKey(e => e.Id);
            
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name").IsRequired();
            entity.Property(e => e.Category).HasColumnName("category").IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.Icon).HasColumnName("icon");
            entity.Property(e => e.PublishedVersion).HasColumnName("published_version");
            entity.Property(e => e.DraftVersion).HasColumnName("draft_version");
            entity.Property(e => e.OwnerId).HasColumnName("owner_id").IsRequired();
            entity.Property(e => e.IsSystem).HasColumnName("is_system").HasDefaultValue(false);
            entity.Property(e => e.IsDeleted).HasColumnName("is_deleted").HasDefaultValue(false);
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            
            entity.HasIndex(e => e.Name);
            entity.HasIndex(e => e.Category);
            
            entity.HasMany(e => e.Versions)
                .WithOne(v => v.Template)
                .HasForeignKey(v => v.TemplateId)
                .OnDelete(DeleteBehavior.Cascade);
            
            entity.HasMany(e => e.Parameters)
                .WithOne(p => p.Template)
                .HasForeignKey(p => p.TemplateId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        
        modelBuilder.Entity<TemplateVersion>(entity =>
        {
            entity.ToTable("template_versions");
            entity.HasKey(e => e.Id);
            
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.TemplateId).HasColumnName("template_id");
            entity.Property(e => e.Version).HasColumnName("version");
            entity.Property(e => e.Definition).HasColumnName("definition").HasColumnType("jsonb");
            entity.Property(e => e.DefaultWidth).HasColumnName("default_width");
            entity.Property(e => e.DefaultHeight).HasColumnName("default_height");
            entity.Property(e => e.Status).HasColumnName("status").IsRequired();
            entity.Property(e => e.ChangeNote).HasColumnName("change_note");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by").IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            
            entity.HasIndex(e => new { e.TemplateId, e.Version }).IsUnique();
        });
        
        modelBuilder.Entity<TemplateParameter>(entity =>
        {
            entity.ToTable("template_parameters");
            entity.HasKey(e => e.Id);
            
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.TemplateId).HasColumnName("template_id");
            entity.Property(e => e.Name).HasColumnName("name").IsRequired();
            entity.Property(e => e.Label).HasColumnName("label").IsRequired();
            entity.Property(e => e.Type).HasColumnName("type").IsRequired();
            entity.Property(e => e.DefaultValue).HasColumnName("default_value");
            entity.Property(e => e.Required).HasColumnName("required").HasDefaultValue(true);
            entity.Property(e => e.Description).HasColumnName("description");
            
            entity.HasIndex(e => new { e.TemplateId, e.Name }).IsUnique();
        });
    }
}
