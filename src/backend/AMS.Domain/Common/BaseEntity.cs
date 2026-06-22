namespace AMS.Domain.Common;

/// <summary>
/// Base class for all domain entities with audit support.
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; protected set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAt { get; protected set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; protected set; } = DateTimeOffset.UtcNow;

    private readonly List<IDomainEvent> _domainEvents = new();
    public IReadOnlyList<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    protected void AddDomainEvent(IDomainEvent domainEvent)
        => _domainEvents.Add(domainEvent);

    public void ClearDomainEvents()
        => _domainEvents.Clear();

    protected void SetUpdated()
        => UpdatedAt = DateTimeOffset.UtcNow;
}

/// <summary>
/// Marker interface for domain events (published via MediatR).
/// </summary>
public interface IDomainEvent : MediatR.INotification
{
    Guid EventId { get; }
    DateTimeOffset OccurredAt { get; }
}

/// <summary>
/// Base record for all domain events.
/// </summary>
public abstract record DomainEventBase : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}
