using Microsoft.EntityFrameworkCore;
using Traverse.AnalysisService.Models;

namespace Traverse.AnalysisService.Data;

public class AnalysisDbContext : DbContext
{
    public AnalysisDbContext(DbContextOptions<AnalysisDbContext> options) : base(options) { }
    
    public DbSet<AnalysisDefinition> Analyses => Set<AnalysisDefinition>();
    public DbSet<AnalysisExecution> Executions => Set<AnalysisExecution>();
    public DbSet<CalculationVersion> CalculationVersions => Set<CalculationVersion>();
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("analysis");
        
        modelBuilder.Entity<AnalysisDefinition>(entity =>
        {
            entity.ToTable("analysis_definitions");
            entity.HasKey(e => e.Id);
            
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name").IsRequired();
            entity.Property(e => e.Type).HasColumnName("type").IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.TargetPath).HasColumnName("target_path").IsRequired();
            entity.Property(e => e.Configuration).HasColumnName("configuration").HasColumnType("jsonb");
            entity.Property(e => e.OutputPath).HasColumnName("output_path").IsRequired();
            entity.Property(e => e.Schedule).HasColumnName("schedule").IsRequired();
            entity.Property(e => e.IsEnabled).HasColumnName("is_enabled").HasDefaultValue(true);
            entity.Property(e => e.OwnerId).HasColumnName("owner_id").IsRequired();
            entity.Property(e => e.Version).HasColumnName("version").HasDefaultValue(1);
            entity.Property(e => e.IsDeleted).HasColumnName("is_deleted").HasDefaultValue(false);
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            
            entity.HasIndex(e => e.Name);
            entity.HasIndex(e => e.Type);
            entity.HasIndex(e => e.TargetPath);
            entity.HasIndex(e => e.IsEnabled);
            
            entity.HasMany(e => e.Executions)
                .WithOne(x => x.Analysis)
                .HasForeignKey(x => x.AnalysisId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        
        modelBuilder.Entity<AnalysisExecution>(entity =>
        {
            entity.ToTable("analysis_executions");
            entity.HasKey(e => e.Id);
            
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.AnalysisId).HasColumnName("analysis_id");
            entity.Property(e => e.FlinkJobId).HasColumnName("flink_job_id");
            entity.Property(e => e.Status).HasColumnName("status").IsRequired();
            entity.Property(e => e.WindowStart).HasColumnName("window_start");
            entity.Property(e => e.WindowEnd).HasColumnName("window_end");
            entity.Property(e => e.InputRecords).HasColumnName("input_records");
            entity.Property(e => e.OutputRecords).HasColumnName("output_records");
            entity.Property(e => e.ErrorMessage).HasColumnName("error_message");
            entity.Property(e => e.StartedAt).HasColumnName("started_at");
            entity.Property(e => e.CompletedAt).HasColumnName("completed_at");
            
            entity.HasIndex(e => e.AnalysisId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.StartedAt);
        });

        modelBuilder.Entity<CalculationVersion>(entity =>
        {
            entity.ToTable("calculation_versions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.AnalysisId).HasColumnName("analysis_id");
            entity.Property(e => e.Version).HasColumnName("version");
            entity.Property(e => e.Configuration).HasColumnName("configuration").HasColumnType("jsonb");
            entity.Property(e => e.ChangeNote).HasColumnName("change_note");
            entity.Property(e => e.Status).HasColumnName("status").IsRequired();
            entity.Property(e => e.CreatedBy).HasColumnName("created_by").IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            entity.Property(e => e.PublishedAt).HasColumnName("published_at");
            entity.HasIndex(e => new { e.AnalysisId, e.Version }).IsUnique();
        });
    }
}
