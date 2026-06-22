using AMS.Domain.Connectivity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AMS.Infrastructure.Persistence;

public sealed class OpcConnectionConfiguration : IEntityTypeConfiguration<OpcConnection>
{
    public void Configure(EntityTypeBuilder<OpcConnection> b)
    {
        b.ToTable("opc_connections", "configuration");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.Name).HasColumnName("name").HasMaxLength(255).IsRequired();
        b.Property(x => x.Protocol).HasColumnName("protocol").HasMaxLength(32).IsRequired();
        b.Property(x => x.Endpoint).HasColumnName("endpoint").IsRequired();
        b.Property(x => x.Username).HasColumnName("username").HasMaxLength(255);
        b.Property(x => x.PasswordEncrypted).HasColumnName("password_encrypted");
        b.Property(x => x.Enabled).HasColumnName("enabled").HasDefaultValue(true);
        b.Property(x => x.Status).HasColumnName("status").HasMaxLength(32).HasDefaultValue("Disconnected");
        b.Property(x => x.LastConnectedUtc).HasColumnName("last_connected_utc");
        b.Property(x => x.LastError).HasColumnName("last_error");
        b.Property(x => x.StreamPipesAdapterId).HasColumnName("streampipes_adapter_id").HasMaxLength(128);
        b.Property(x => x.StreamPipesPipelineId).HasColumnName("streampipes_pipeline_id").HasMaxLength(128);
        b.Property(x => x.StreamPipesAckPipelineId).HasColumnName("streampipes_ack_pipeline_id").HasMaxLength(128);
        b.Property(x => x.AuthType).HasColumnName("auth_type").HasMaxLength(32).HasDefaultValue("Anonymous");
        b.Property(x => x.PipelineStatus).HasColumnName("pipeline_status").HasMaxLength(32).HasDefaultValue("Stopped");
        b.Property(x => x.EventsPerSec).HasColumnName("events_per_sec").HasDefaultValue(0.0);
        b.Property(x => x.LastEventUtc).HasColumnName("last_event_utc");
        b.Property(x => x.CreatedUtc).HasColumnName("created_utc");
        b.Property(x => x.UpdatedUtc).HasColumnName("updated_utc");
        b.HasIndex(x => x.Name).IsUnique().HasDatabaseName("idx_opc_connections_name");
        b.HasIndex(x => x.Enabled).HasDatabaseName("idx_opc_connections_enabled");
    }
}
