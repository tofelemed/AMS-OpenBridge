using Microsoft.EntityFrameworkCore;
using Traverse.DisplayService.Models;

namespace Traverse.DisplayService.Data;

public class DisplayDbContext : DbContext
{
    public DisplayDbContext(DbContextOptions<DisplayDbContext> options) : base(options) { }
    
    public DbSet<Display> Displays => Set<Display>();
    public DbSet<DisplayVersion> DisplayVersions => Set<DisplayVersion>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<Folder> Folders => Set<Folder>();
    public DbSet<DisplayAcl> DisplayAcls => Set<DisplayAcl>();
    public DbSet<PersonalView> PersonalViews => Set<PersonalView>();
    public DbSet<ViewFavorite> ViewFavorites => Set<ViewFavorite>();
    public DbSet<RecentDisplay> RecentDisplays => Set<RecentDisplay>();
    public DbSet<DisplayComment> DisplayComments => Set<DisplayComment>();
    
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
            entity.Property(e => e.PublishedAt).HasColumnName("published_at");
            entity.Property(e => e.PublishedBy).HasColumnName("published_by");
            entity.Property(e => e.ThumbnailSvg).HasColumnName("thumbnail_svg");
            entity.Property(e => e.ThumbnailAt).HasColumnName("thumbnail_at");
            entity.Property(e => e.Level).HasColumnName("level");
            entity.Property(e => e.DraftVersion).HasColumnName("draft_version");
            entity.Property(e => e.FolderId).HasColumnName("folder_id");
            entity.Property(e => e.Tags).HasColumnName("tags").HasColumnType("text[]");
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
            entity.Property(e => e.PublishedAt).HasColumnName("published_at");
            entity.Property(e => e.PublishedBy).HasColumnName("published_by");

            entity.HasIndex(e => new { e.DisplayId, e.Version }).IsUnique();
            entity.HasIndex(e => e.Status);
        });

        modelBuilder.Entity<MediaAsset>(entity =>
        {
            entity.ToTable("media_assets");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.ContentType).HasColumnName("content_type").IsRequired();
            entity.Property(e => e.Data).HasColumnName("data").IsRequired();
            entity.Property(e => e.ByteSize).HasColumnName("byte_size");
            entity.Property(e => e.FileName).HasColumnName("file_name");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
        });

        // ── Phase 5 governance ────────────────────────────────────────────────
        modelBuilder.Entity<Folder>(entity =>
        {
            entity.ToTable("folders");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name").IsRequired();
            entity.Property(e => e.ParentId).HasColumnName("parent_id");
            entity.Property(e => e.OwnerId).HasColumnName("owner_id");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            entity.HasIndex(e => e.ParentId);
        });

        modelBuilder.Entity<DisplayAcl>(entity =>
        {
            entity.ToTable("display_acl");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.DisplayId).HasColumnName("display_id");
            entity.Property(e => e.FolderId).HasColumnName("folder_id");
            entity.Property(e => e.PrincipalType).HasColumnName("principal_type").IsRequired();
            entity.Property(e => e.Principal).HasColumnName("principal").IsRequired();
            entity.Property(e => e.Access).HasColumnName("access").IsRequired();
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.HasIndex(e => e.DisplayId);
            entity.HasIndex(e => e.FolderId);
        });

        modelBuilder.Entity<PersonalView>(entity =>
        {
            entity.ToTable("personal_views");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.UserId).HasColumnName("user_id").IsRequired();
            entity.Property(e => e.Name).HasColumnName("name").IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.Width).HasColumnName("width");
            entity.Property(e => e.Height).HasColumnName("height");
            entity.Property(e => e.BackgroundColor).HasColumnName("background_color");
            entity.Property(e => e.Config).HasColumnName("config").HasColumnType("jsonb");
            entity.Property(e => e.SourceDisplayId).HasColumnName("source_display_id");
            entity.Property(e => e.IsShared).HasColumnName("is_shared");
            entity.Property(e => e.SharedWith).HasColumnName("shared_with").HasColumnType("text[]");
            entity.Property(e => e.IsDeleted).HasColumnName("is_deleted");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            entity.HasIndex(e => e.UserId);
        });

        modelBuilder.Entity<ViewFavorite>(entity =>
        {
            entity.ToTable("view_favorites");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.UserId).HasColumnName("user_id").IsRequired();
            entity.Property(e => e.DisplayId).HasColumnName("display_id");
            entity.Property(e => e.PersonalViewId).HasColumnName("personal_view_id");
            entity.Property(e => e.DisplayOrder).HasColumnName("display_order");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.HasIndex(e => e.UserId);
        });

        modelBuilder.Entity<RecentDisplay>(entity =>
        {
            entity.ToTable("recent_displays");
            entity.HasKey(e => new { e.UserId, e.DisplayId });
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.DisplayId).HasColumnName("display_id");
            entity.Property(e => e.AccessedAt).HasColumnName("accessed_at").HasDefaultValueSql("NOW()");
        });

        modelBuilder.Entity<DisplayComment>(entity =>
        {
            entity.ToTable("display_comments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.DisplayId).HasColumnName("display_id");
            entity.Property(e => e.Version).HasColumnName("version");
            entity.Property(e => e.Author).HasColumnName("author");
            entity.Property(e => e.Body).HasColumnName("body").IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.HasIndex(e => e.DisplayId);
        });
    }
}
