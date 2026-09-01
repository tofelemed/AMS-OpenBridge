using AMS.Application.Alarms;
using AMS.Domain.Alarms;
using AMS.Domain.Repositories;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;

namespace AMS.Application.Alarms.Commands;

// ============================================================
// Acknowledge Alarm Command (CQRS)
// ============================================================

public record AcknowledgeAlarmCommand(
    Guid AlarmId,
    Guid UserId,
    string Username,
    string? Comment,
    string? IpAddress,
    string? OperatorStation
) : IRequest<AcknowledgeAlarmResult>;

public record AcknowledgeAlarmResult(bool Success, string Message, DateTimeOffset? AckTime);

public class AcknowledgeAlarmCommandValidator : AbstractValidator<AcknowledgeAlarmCommand>
{
    public AcknowledgeAlarmCommandValidator()
    {
        RuleFor(x => x.AlarmId).NotEmpty().WithMessage("AlarmId is required");
        RuleFor(x => x.UserId).NotEmpty().WithMessage("UserId is required");
        RuleFor(x => x.Username).NotEmpty().MaximumLength(255);
        RuleFor(x => x.Comment).MaximumLength(2000).When(x => x.Comment is not null);
    }
}

public class AcknowledgeAlarmCommandHandler : IRequestHandler<AcknowledgeAlarmCommand, AcknowledgeAlarmResult>
{
    private readonly IUnitOfWork _uow;
    private readonly IOperatorActionPublisher _actionPublisher;
    private readonly IAlarmSignalRPublisher _publisher;
    private readonly ILogger<AcknowledgeAlarmCommandHandler> _logger;

    public AcknowledgeAlarmCommandHandler(
        IUnitOfWork uow,
        IOperatorActionPublisher actionPublisher,
        IAlarmSignalRPublisher publisher,
        ILogger<AcknowledgeAlarmCommandHandler> logger)
    {
        _uow             = uow;
        _actionPublisher = actionPublisher;
        _publisher       = publisher;
        _logger          = logger;
    }

    public async Task<AcknowledgeAlarmResult> Handle(
        AcknowledgeAlarmCommand request, CancellationToken ct)
    {
        var alarm = await _uow.ActiveAlarms.GetByIdAsync(request.AlarmId, ct);
        if (alarm is null)
            return new AcknowledgeAlarmResult(false, "Alarm not found", null);

        // Delegate acknowledgment to Flink via Kafka Operator Actions
        await _actionPublisher.PublishAcknowledgeAsync(
            alarm, request.UserId, request.Username, request.Comment, request.OperatorStation, ct);

        _logger.LogInformation(
            "ACK action published to Kafka for alarm {AlarmId} by {User}",
            request.AlarmId, request.Username);

        return new AcknowledgeAlarmResult(
            true,
            "Acknowledge command dispatched to Flink",
            null);
    }
}

// ============================================================
// Batch Acknowledge Command
// ============================================================

public record BatchAcknowledgeAlarmsCommand(
    Guid[] AlarmIds,
    Guid UserId,
    string Username,
    string? Comment,
    string? IpAddress,
    string? OperatorStation
) : IRequest<BatchAcknowledgeResult>;

public record BatchAcknowledgeResult(int SuccessCount, int FailedCount, string Message);

public class BatchAcknowledgeAlarmsValidator : AbstractValidator<BatchAcknowledgeAlarmsCommand>
{
    public BatchAcknowledgeAlarmsValidator()
    {
        RuleFor(x => x.AlarmIds).NotEmpty().Must(ids => ids.Length <= 5000)
            .WithMessage("Cannot batch acknowledge more than 5000 alarms at once");
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.Username).NotEmpty().MaximumLength(255);
    }
}

public class BatchAcknowledgeAlarmsHandler : IRequestHandler<BatchAcknowledgeAlarmsCommand, BatchAcknowledgeResult>
{
    private readonly IUnitOfWork _uow;
    private readonly IOperatorActionPublisher _actionPublisher;
    private readonly IAlarmSignalRPublisher _publisher;
    private readonly ILogger<BatchAcknowledgeAlarmsHandler> _logger;

    public BatchAcknowledgeAlarmsHandler(
        IUnitOfWork uow,
        IOperatorActionPublisher actionPublisher,
        IAlarmSignalRPublisher publisher,
        ILogger<BatchAcknowledgeAlarmsHandler> logger)
    {
        _uow             = uow;
        _actionPublisher = actionPublisher;
        _publisher       = publisher;
        _logger          = logger;
    }

    public async Task<BatchAcknowledgeResult> Handle(
        BatchAcknowledgeAlarmsCommand request, CancellationToken ct)
    {
        var successCount = 0;
        var failedCount  = 0;

        foreach (var alarmId in request.AlarmIds)
        {
            var alarm = await _uow.ActiveAlarms.GetByIdAsync(alarmId, ct);
            if (alarm is null) { failedCount++; continue; }

            if (!OpcCookieHelper.IsWritebackAckEligible(alarm))
            {
                failedCount++;
                _logger.LogWarning(
                    "ACK skipped {AlarmId} ({Source}): {Reason}",
                    alarmId, alarm.SourceName, OpcCookieHelper.AckIneligibleReason(alarm));
                continue;
            }

            try
            {
                await _actionPublisher.PublishAcknowledgeAsync(
                    alarm, request.UserId, request.Username, request.Comment, request.OperatorStation, ct);
                successCount++;
            }
            catch (Exception ex)
            {
                failedCount++;
                _logger.LogWarning(ex, "ACK dispatch failed for {AlarmId}", alarmId);
            }
        }

        _logger.LogInformation(
            "Batch ACK applied by {User}: {Success} dispatched to Kafka, {Failed} failed",
            request.Username, successCount, failedCount);

        return new BatchAcknowledgeResult(
            successCount, failedCount,
            $"{successCount} acknowledgement(s) dispatched to Flink, {failedCount} failed");
    }
}

// ============================================================
// Shelve Alarm Command
// ============================================================

public record ShelveAlarmCommand(
    Guid AlarmId,
    Guid UserId,
    string Username,
    int DurationMinutes,
    string Comment,
    string? IpAddress,
    string? OperatorStation
) : IRequest<ShelveAlarmResult>;

public record ShelveAlarmResult(bool Success, string Message, DateTimeOffset? ShelveUntil);

public class ShelveAlarmValidator : AbstractValidator<ShelveAlarmCommand>
{
    public ShelveAlarmValidator()
    {
        RuleFor(x => x.AlarmId).NotEmpty();
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.DurationMinutes).InclusiveBetween(1, 480)
            .WithMessage("Shelve duration must be 1-480 minutes (ISA-18.2 max 8 hours)");
        RuleFor(x => x.Comment).NotEmpty().WithMessage("Shelve comment is mandatory per ISA-18.2")
            .MaximumLength(2000);
    }
}

public class ShelveAlarmCommandHandler : IRequestHandler<ShelveAlarmCommand, ShelveAlarmResult>
{
    private readonly IUnitOfWork _uow;
    private readonly IAlarmSignalRPublisher _publisher;
    private readonly IOpcDcsGateway _opcGateway;
    private readonly ILogger<ShelveAlarmCommandHandler> _logger;

    public ShelveAlarmCommandHandler(
        IUnitOfWork uow,
        IAlarmSignalRPublisher publisher,
        IOpcDcsGateway opcGateway,
        ILogger<ShelveAlarmCommandHandler> logger)
    {
        _uow        = uow;
        _publisher  = publisher;
        _opcGateway = opcGateway;
        _logger     = logger;
    }

    public async Task<ShelveAlarmResult> Handle(ShelveAlarmCommand request, CancellationToken ct)
    {
        // No user-initiated transaction (NpgsqlRetryingExecutionStrategy forbids it); SaveChanges is atomic.
        try
        {
            var alarm = await _uow.ActiveAlarms.GetByIdAsync(request.AlarmId, ct);
            if (alarm is null)
                return new ShelveAlarmResult(false, "Alarm not found", null);

            var result = alarm.Shelve(request.UserId, request.DurationMinutes, request.Comment);
            if (result.IsFailure)
                return new ShelveAlarmResult(false, result.Error!, null);

            await _uow.ActiveAlarms.UpdateAsync(alarm, ct);
            await _uow.SaveChangesAsync(ct);

            await _publisher.PublishAlarmUpdatedAsync(alarm, ct);

            // Propagate shelve action to OPC DCS (Suppression)
            try
            {
                await _opcGateway.ShelveAlarmAsync(alarm.ServerId, alarm.SourceName, request.DurationMinutes, request.Comment, ct);
            }
            catch (Exception opcEx)
            {
                _logger.LogWarning(opcEx, "Failed to writeback SHELVE to OPC Gateway for alarm {AlarmId}. DB state is updated.", request.AlarmId);
            }

            return new ShelveAlarmResult(true, "Alarm shelved successfully", alarm.ShelveUntil);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to shelve alarm {AlarmId}", request.AlarmId);
            throw;
        }
    }
}

// ============================================================
// Unshelve Alarm Command (ISA-18.2 — return a shelved alarm to service)
// ============================================================

public record UnshelveAlarmCommand(
    Guid AlarmId,
    Guid UserId,
    string Reason,
    string? OperatorStation
) : IRequest<UnshelveAlarmResult>;

public record UnshelveAlarmResult(bool Success, string Message);

public class UnshelveAlarmValidator : AbstractValidator<UnshelveAlarmCommand>
{
    public UnshelveAlarmValidator()
    {
        RuleFor(x => x.AlarmId).NotEmpty();
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().WithMessage("Unshelve reason is required")
            .MaximumLength(2000);
    }
}

public class UnshelveAlarmCommandHandler : IRequestHandler<UnshelveAlarmCommand, UnshelveAlarmResult>
{
    private readonly IUnitOfWork _uow;
    private readonly IAlarmSignalRPublisher _publisher;
    private readonly ILogger<UnshelveAlarmCommandHandler> _logger;

    public UnshelveAlarmCommandHandler(
        IUnitOfWork uow,
        IAlarmSignalRPublisher publisher,
        ILogger<UnshelveAlarmCommandHandler> logger)
    {
        _uow       = uow;
        _publisher = publisher;
        _logger    = logger;
    }

    public async Task<UnshelveAlarmResult> Handle(UnshelveAlarmCommand request, CancellationToken ct)
    {
        // No user-initiated transaction (NpgsqlRetryingExecutionStrategy forbids it); SaveChanges is atomic.
        try
        {
            var alarm = await _uow.ActiveAlarms.GetByIdAsync(request.AlarmId, ct);
            if (alarm is null)
                return new UnshelveAlarmResult(false, "Alarm not found");

            var result = alarm.Unshelve(request.UserId, request.Reason);
            if (result.IsFailure)
                return new UnshelveAlarmResult(false, result.Error!);

            await _uow.ActiveAlarms.UpdateAsync(alarm, ct);
            await _uow.SaveChangesAsync(ct);
            await _publisher.PublishAlarmUpdatedAsync(alarm, ct);
            // NOTE: OPC/DCS un-suppression writeback is a follow-up (IOpcDcsGateway has no Unshelve yet).
            return new UnshelveAlarmResult(true, "Alarm unshelved successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to unshelve alarm {AlarmId}", request.AlarmId);
            throw;
        }
    }
}

// ============================================================
// Suppress Alarm Command
// ============================================================

public record SuppressAlarmCommand(
    Guid AlarmId,
    Guid UserId,
    string Reason,
    string? OperatorStation
) : IRequest<SuppressAlarmResult>;

public record SuppressAlarmResult(bool Success, string Message);

public class SuppressAlarmCommandHandler : IRequestHandler<SuppressAlarmCommand, SuppressAlarmResult>
{
    private readonly IUnitOfWork _uow;
    private readonly IAlarmSignalRPublisher _publisher;
    private readonly ILogger<SuppressAlarmCommandHandler> _logger;

    public SuppressAlarmCommandHandler(
        IUnitOfWork uow,
        IAlarmSignalRPublisher publisher,
        ILogger<SuppressAlarmCommandHandler> logger)
    {
        _uow       = uow;
        _publisher = publisher;
        _logger    = logger;
    }

    public async Task<SuppressAlarmResult> Handle(SuppressAlarmCommand request, CancellationToken ct)
    {
        // No user-initiated transaction: the DbContext uses NpgsqlRetryingExecutionStrategy,
        // which forbids manual BeginTransaction. A single SaveChangesAsync is already atomic + retriable.
        try
        {
            var alarm = await _uow.ActiveAlarms.GetByIdAsync(request.AlarmId, ct);
            if (alarm is null)
                return new SuppressAlarmResult(false, "Alarm not found");

            var result = alarm.Suppress(request.UserId, request.Reason);
            if (result.IsFailure)
                return new SuppressAlarmResult(false, result.Error!);

            await _uow.ActiveAlarms.UpdateAsync(alarm, ct);
            await _uow.SaveChangesAsync(ct);
            await _publisher.PublishAlarmUpdatedAsync(alarm, ct);
            return new SuppressAlarmResult(true, "Alarm suppressed successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to suppress alarm {AlarmId}", request.AlarmId);
            throw;
        }
    }
}

// ============================================================
// Out of Service Command
// ============================================================

public record SetAlarmOutOfServiceCommand(
    Guid AlarmId,
    Guid UserId,
    string Reason,
    string? OperatorStation
) : IRequest<SetAlarmOutOfServiceResult>;

public record SetAlarmOutOfServiceResult(bool Success, string Message);

public class SetAlarmOutOfServiceCommandHandler : IRequestHandler<SetAlarmOutOfServiceCommand, SetAlarmOutOfServiceResult>
{
    private readonly IUnitOfWork _uow;
    private readonly IAlarmSignalRPublisher _publisher;
    private readonly ILogger<SetAlarmOutOfServiceCommandHandler> _logger;

    public SetAlarmOutOfServiceCommandHandler(
        IUnitOfWork uow,
        IAlarmSignalRPublisher publisher,
        ILogger<SetAlarmOutOfServiceCommandHandler> logger)
    {
        _uow       = uow;
        _publisher = publisher;
        _logger    = logger;
    }

    public async Task<SetAlarmOutOfServiceResult> Handle(SetAlarmOutOfServiceCommand request, CancellationToken ct)
    {
        // No user-initiated transaction (NpgsqlRetryingExecutionStrategy forbids it); SaveChanges is atomic.
        try
        {
            var alarm = await _uow.ActiveAlarms.GetByIdAsync(request.AlarmId, ct);
            if (alarm is null)
                return new SetAlarmOutOfServiceResult(false, "Alarm not found");

            var result = alarm.SetOutOfService(request.UserId, request.Reason);
            if (result.IsFailure)
                return new SetAlarmOutOfServiceResult(false, result.Error!);

            await _uow.ActiveAlarms.UpdateAsync(alarm, ct);
            await _uow.SaveChangesAsync(ct);
            await _publisher.PublishAlarmUpdatedAsync(alarm, ct);
            return new SetAlarmOutOfServiceResult(true, "Alarm set out of service");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set alarm {AlarmId} out of service", request.AlarmId);
            throw;
        }
    }
}

/// <summary>
/// SignalR real-time publisher interface (implemented in API layer)
/// </summary>
public interface IAlarmSignalRPublisher
{
    Task PublishAlarmUpdatedAsync(ActiveAlarm alarm, CancellationToken ct = default);
    Task PublishBulkAlarmsUpdatedAsync(IEnumerable<ActiveAlarm> alarms, CancellationToken ct = default);
    Task PublishNewAlarmAsync(ActiveAlarm alarm, CancellationToken ct = default);
    Task PublishAlarmClearedAsync(Guid alarmId, string sourceName, DateTimeOffset clearedTime, CancellationToken ct = default);
    Task PublishFloodAlertAsync(Guid serverId, double rate, CancellationToken ct = default);
    Task PublishConnectionStatusAsync(Guid serverId, bool connected, CancellationToken ct = default);
    Task PublishAckLifecycleAsync(
        Guid alarmId,
        string commandId,
        string correlationId,
        string? lifecycleId,
        string? dcsSequenceId,
        string lifecycleState,
        string? detail,
        long timestampEpochMs,
        long? latencyMs,
        CancellationToken ct = default);
    // PublishLoopKpiAsync removed (Phase G): LoopKpiStreamJob retired.
    Task PublishAlarmKpiAsync(object payload, CancellationToken ct = default);
}

// ============================================================
// Purge lab/storm-injected active alarms (keeps live OPC simulator rows)
// ============================================================

public record PurgeLabInjectedAlarmsCommand(Guid? ServerId = null) : IRequest<PurgeLabInjectedAlarmsResult>;

public record PurgeLabInjectedAlarmsResult(int RemovedCount);

public class PurgeLabInjectedAlarmsCommandHandler : IRequestHandler<PurgeLabInjectedAlarmsCommand, PurgeLabInjectedAlarmsResult>
{
    private readonly IUnitOfWork _uow;
    private readonly ILogger<PurgeLabInjectedAlarmsCommandHandler> _logger;

    public PurgeLabInjectedAlarmsCommandHandler(IUnitOfWork uow, ILogger<PurgeLabInjectedAlarmsCommandHandler> logger)
    {
        _uow = uow;
        _logger = logger;
    }

    public async Task<PurgeLabInjectedAlarmsResult> Handle(PurgeLabInjectedAlarmsCommand request, CancellationToken ct)
    {
        var removed = await _uow.ActiveAlarms.PurgeLabInjectedAlarmsAsync(request.ServerId, ct);
        await _uow.SaveChangesAsync(ct);
        _logger.LogInformation("Purged {Count} lab-injected alarms", removed);
        return new PurgeLabInjectedAlarmsResult(removed);
    }
}

/// <summary>
/// Publishes operator lifecycle commands to Kafka traverse.alarm.operator-actions (command gateway).
/// </summary>
public interface IOperatorActionPublisher
{
    Task PublishAcknowledgeAsync(ActiveAlarm alarm, Guid userId, string username, string? comment, string? operatorStation, CancellationToken ct = default);
}

/// <summary>
/// Interface for writing actions back to the OPC Gateway/DCS
/// </summary>
public interface IOpcDcsGateway
{
    Task AcknowledgeAlarmAsync(Guid serverId, string sourceName, string? comment, CancellationToken ct = default);
    Task ShelveAlarmAsync(Guid serverId, string sourceName, int durationMinutes, string comment, CancellationToken ct = default);
}









// using AMS.Application.Alarms;
// using AMS.Domain.Alarms;
// using AMS.Domain.Repositories;
// using FluentValidation;
// using MediatR;
// using Microsoft.Extensions.Logging;

// namespace AMS.Application.Alarms.Commands;

// // ============================================================
// // Acknowledge Alarm Command (CQRS)
// // ============================================================

// public record AcknowledgeAlarmCommand(
//     Guid AlarmId,
//     Guid UserId,
//     string Username,
//     string? Comment,
//     string? IpAddress,
//     string? OperatorStation
// ) : IRequest<AcknowledgeAlarmResult>;

// public record AcknowledgeAlarmResult(bool Success, string Message, DateTimeOffset? AckTime);

// public class AcknowledgeAlarmCommandValidator : AbstractValidator<AcknowledgeAlarmCommand>
// {
//     public AcknowledgeAlarmCommandValidator()
//     {
//         RuleFor(x => x.AlarmId).NotEmpty().WithMessage("AlarmId is required");
//         RuleFor(x => x.UserId).NotEmpty().WithMessage("UserId is required");
//         RuleFor(x => x.Username).NotEmpty().MaximumLength(255);
//         RuleFor(x => x.Comment).MaximumLength(2000).When(x => x.Comment is not null);
//     }
// }

// public class AcknowledgeAlarmCommandHandler : IRequestHandler<AcknowledgeAlarmCommand, AcknowledgeAlarmResult>
// {
//     private readonly IUnitOfWork _uow;
//     private readonly IOperatorActionPublisher _actionPublisher;
//     private readonly IAlarmSignalRPublisher _publisher;
//     private readonly ILogger<AcknowledgeAlarmCommandHandler> _logger;

//     public AcknowledgeAlarmCommandHandler(
//         IUnitOfWork uow,
//         IOperatorActionPublisher actionPublisher,
//         IAlarmSignalRPublisher publisher,
//         ILogger<AcknowledgeAlarmCommandHandler> logger)
//     {
//         _uow             = uow;
//         _actionPublisher = actionPublisher;
//         _publisher       = publisher;
//         _logger          = logger;
//     }

//     public async Task<AcknowledgeAlarmResult> Handle(
//         AcknowledgeAlarmCommand request, CancellationToken ct)
//     {
//         var alarm = await _uow.ActiveAlarms.GetByIdAsync(request.AlarmId, ct);
//         if (alarm is null)
//             return new AcknowledgeAlarmResult(false, "Alarm not found", null);

//         // Delegate acknowledgment to Flink via Kafka Operator Actions
//         await _actionPublisher.PublishAcknowledgeAsync(
//             alarm, request.UserId, request.Username, request.Comment, request.OperatorStation, ct);

//         _logger.LogInformation(
//             "ACK action published to Kafka for alarm {AlarmId} by {User}",
//             request.AlarmId, request.Username);

//         return new AcknowledgeAlarmResult(
//             true,
//             "Acknowledge command dispatched to Flink",
//             null);
//     }
// }

// // ============================================================
// // Batch Acknowledge Command
// // ============================================================

// public record BatchAcknowledgeAlarmsCommand(
//     Guid[] AlarmIds,
//     Guid UserId,
//     string Username,
//     string? Comment,
//     string? IpAddress,
//     string? OperatorStation
// ) : IRequest<BatchAcknowledgeResult>;

// public record BatchAcknowledgeResult(int SuccessCount, int FailedCount, string Message);

// public class BatchAcknowledgeAlarmsValidator : AbstractValidator<BatchAcknowledgeAlarmsCommand>
// {
//     public BatchAcknowledgeAlarmsValidator()
//     {
//         RuleFor(x => x.AlarmIds).NotEmpty().Must(ids => ids.Length <= 5000)
//             .WithMessage("Cannot batch acknowledge more than 5000 alarms at once");
//         RuleFor(x => x.UserId).NotEmpty();
//         RuleFor(x => x.Username).NotEmpty().MaximumLength(255);
//     }
// }

// public class BatchAcknowledgeAlarmsHandler : IRequestHandler<BatchAcknowledgeAlarmsCommand, BatchAcknowledgeResult>
// {
//     private readonly IUnitOfWork _uow;
//     private readonly IOperatorActionPublisher _actionPublisher;
//     private readonly IAlarmSignalRPublisher _publisher;
//     private readonly ILogger<BatchAcknowledgeAlarmsHandler> _logger;

//     public BatchAcknowledgeAlarmsHandler(
//         IUnitOfWork uow,
//         IOperatorActionPublisher actionPublisher,
//         IAlarmSignalRPublisher publisher,
//         ILogger<BatchAcknowledgeAlarmsHandler> logger)
//     {
//         _uow             = uow;
//         _actionPublisher = actionPublisher;
//         _publisher       = publisher;
//         _logger          = logger;
//     }

//     public async Task<BatchAcknowledgeResult> Handle(
//         BatchAcknowledgeAlarmsCommand request, CancellationToken ct)
//     {
//         var successCount = 0;
//         var failedCount  = 0;

//         foreach (var alarmId in request.AlarmIds)
//         {
//             var alarm = await _uow.ActiveAlarms.GetByIdAsync(alarmId, ct);
//             if (alarm is null) { failedCount++; continue; }

//             if (!OpcCookieHelper.IsWritebackAckEligible(alarm))
//             {
//                 failedCount++;
//                 _logger.LogWarning(
//                     "ACK skipped {AlarmId} ({Source}): {Reason}",
//                     alarmId, alarm.SourceName, OpcCookieHelper.AckIneligibleReason(alarm));
//                 continue;
//             }

//             try
//             {
//                 await _actionPublisher.PublishAcknowledgeAsync(
//                     alarm, request.UserId, request.Username, request.Comment, request.OperatorStation, ct);
//                 successCount++;
//             }
//             catch (Exception ex)
//             {
//                 failedCount++;
//                 _logger.LogWarning(ex, "ACK dispatch failed for {AlarmId}", alarmId);
//             }
//         }

//         _logger.LogInformation(
//             "Batch ACK applied by {User}: {Success} dispatched to Kafka, {Failed} failed",
//             request.Username, successCount, failedCount);

//         return new BatchAcknowledgeResult(
//             successCount, failedCount,
//             $"{successCount} acknowledgement(s) dispatched to Flink, {failedCount} failed");
//     }
// }

// // ============================================================
// // Shelve Alarm Command
// // ============================================================

// public record ShelveAlarmCommand(
//     Guid AlarmId,
//     Guid UserId,
//     string Username,
//     int DurationMinutes,
//     string Comment,
//     string? IpAddress,
//     string? OperatorStation
// ) : IRequest<ShelveAlarmResult>;

// public record ShelveAlarmResult(bool Success, string Message, DateTimeOffset? ShelveUntil);

// public class ShelveAlarmValidator : AbstractValidator<ShelveAlarmCommand>
// {
//     public ShelveAlarmValidator()
//     {
//         RuleFor(x => x.AlarmId).NotEmpty();
//         RuleFor(x => x.UserId).NotEmpty();
//         RuleFor(x => x.DurationMinutes).InclusiveBetween(1, 480)
//             .WithMessage("Shelve duration must be 1-480 minutes (ISA-18.2 max 8 hours)");
//         RuleFor(x => x.Comment).NotEmpty().WithMessage("Shelve comment is mandatory per ISA-18.2")
//             .MaximumLength(2000);
//     }
// }

// public class ShelveAlarmCommandHandler : IRequestHandler<ShelveAlarmCommand, ShelveAlarmResult>
// {
//     private readonly IUnitOfWork _uow;
//     private readonly IAlarmSignalRPublisher _publisher;
//     private readonly IOpcDcsGateway _opcGateway;
//     private readonly ILogger<ShelveAlarmCommandHandler> _logger;

//     public ShelveAlarmCommandHandler(
//         IUnitOfWork uow,
//         IAlarmSignalRPublisher publisher,
//         IOpcDcsGateway opcGateway,
//         ILogger<ShelveAlarmCommandHandler> logger)
//     {
//         _uow        = uow;
//         _publisher  = publisher;
//         _opcGateway = opcGateway;
//         _logger     = logger;
//     }

//     public async Task<ShelveAlarmResult> Handle(ShelveAlarmCommand request, CancellationToken ct)
//     {
//         await _uow.BeginTransactionAsync(ct);
//         try
//         {
//             var alarm = await _uow.ActiveAlarms.GetByIdAsync(request.AlarmId, ct);
//             if (alarm is null)
//                 return new ShelveAlarmResult(false, "Alarm not found", null);

//             var result = alarm.Shelve(request.UserId, request.DurationMinutes, request.Comment);
//             if (result.IsFailure)
//                 return new ShelveAlarmResult(false, result.Error!, null);

//             await _uow.ActiveAlarms.UpdateAsync(alarm, ct);
//             await _uow.SaveChangesAsync(ct);
//             await _uow.CommitTransactionAsync(ct);

//             await _publisher.PublishAlarmUpdatedAsync(alarm, ct);

//             // Propagate shelve action to OPC DCS (Suppression)
//             try
//             {
//                 await _opcGateway.ShelveAlarmAsync(alarm.ServerId, alarm.SourceName, request.DurationMinutes, request.Comment, ct);
//             }
//             catch (Exception opcEx)
//             {
//                 _logger.LogWarning(opcEx, "Failed to writeback SHELVE to OPC Gateway for alarm {AlarmId}. DB state is updated.", request.AlarmId);
//             }

//             return new ShelveAlarmResult(true, "Alarm shelved successfully", alarm.ShelveUntil);
//         }
//         catch (Exception ex)
//         {
//             await _uow.RollbackTransactionAsync(ct);
//             _logger.LogError(ex, "Failed to shelve alarm {AlarmId}", request.AlarmId);
//             throw;
//         }
//     }
// }

// // ============================================================
// // Suppress Alarm Command
// // ============================================================

// public record SuppressAlarmCommand(
//     Guid AlarmId,
//     Guid UserId,
//     string Reason,
//     string? OperatorStation
// ) : IRequest<SuppressAlarmResult>;

// public record SuppressAlarmResult(bool Success, string Message);

// public class SuppressAlarmCommandHandler : IRequestHandler<SuppressAlarmCommand, SuppressAlarmResult>
// {
//     private readonly IUnitOfWork _uow;
//     private readonly IAlarmSignalRPublisher _publisher;
//     private readonly ILogger<SuppressAlarmCommandHandler> _logger;

//     public SuppressAlarmCommandHandler(
//         IUnitOfWork uow,
//         IAlarmSignalRPublisher publisher,
//         ILogger<SuppressAlarmCommandHandler> logger)
//     {
//         _uow       = uow;
//         _publisher = publisher;
//         _logger    = logger;
//     }

//     public async Task<SuppressAlarmResult> Handle(SuppressAlarmCommand request, CancellationToken ct)
//     {
//         await _uow.BeginTransactionAsync(ct);
//         try
//         {
//             var alarm = await _uow.ActiveAlarms.GetByIdAsync(request.AlarmId, ct);
//             if (alarm is null)
//                 return new SuppressAlarmResult(false, "Alarm not found");

//             var result = alarm.Suppress(request.UserId, request.Reason);
//             if (result.IsFailure)
//                 return new SuppressAlarmResult(false, result.Error!);

//             await _uow.ActiveAlarms.UpdateAsync(alarm, ct);
//             await _uow.SaveChangesAsync(ct);
//             await _uow.CommitTransactionAsync(ct);
//             await _publisher.PublishAlarmUpdatedAsync(alarm, ct);
//             return new SuppressAlarmResult(true, "Alarm suppressed successfully");
//         }
//         catch (Exception ex)
//         {
//             await _uow.RollbackTransactionAsync(ct);
//             _logger.LogError(ex, "Failed to suppress alarm {AlarmId}", request.AlarmId);
//             throw;
//         }
//     }
// }

// // ============================================================
// // Out of Service Command
// // ============================================================

// public record SetAlarmOutOfServiceCommand(
//     Guid AlarmId,
//     Guid UserId,
//     string Reason,
//     string? OperatorStation
// ) : IRequest<SetAlarmOutOfServiceResult>;

// public record SetAlarmOutOfServiceResult(bool Success, string Message);

// public class SetAlarmOutOfServiceCommandHandler : IRequestHandler<SetAlarmOutOfServiceCommand, SetAlarmOutOfServiceResult>
// {
//     private readonly IUnitOfWork _uow;
//     private readonly IAlarmSignalRPublisher _publisher;
//     private readonly ILogger<SetAlarmOutOfServiceCommandHandler> _logger;

//     public SetAlarmOutOfServiceCommandHandler(
//         IUnitOfWork uow,
//         IAlarmSignalRPublisher publisher,
//         ILogger<SetAlarmOutOfServiceCommandHandler> logger)
//     {
//         _uow       = uow;
//         _publisher = publisher;
//         _logger    = logger;
//     }

//     public async Task<SetAlarmOutOfServiceResult> Handle(SetAlarmOutOfServiceCommand request, CancellationToken ct)
//     {
//         await _uow.BeginTransactionAsync(ct);
//         try
//         {
//             var alarm = await _uow.ActiveAlarms.GetByIdAsync(request.AlarmId, ct);
//             if (alarm is null)
//                 return new SetAlarmOutOfServiceResult(false, "Alarm not found");

//             var result = alarm.SetOutOfService(request.UserId, request.Reason);
//             if (result.IsFailure)
//                 return new SetAlarmOutOfServiceResult(false, result.Error!);

//             await _uow.ActiveAlarms.UpdateAsync(alarm, ct);
//             await _uow.SaveChangesAsync(ct);
//             await _uow.CommitTransactionAsync(ct);
//             await _publisher.PublishAlarmUpdatedAsync(alarm, ct);
//             return new SetAlarmOutOfServiceResult(true, "Alarm set out of service");
//         }
//         catch (Exception ex)
//         {
//             await _uow.RollbackTransactionAsync(ct);
//             _logger.LogError(ex, "Failed to set alarm {AlarmId} out of service", request.AlarmId);
//             throw;
//         }
//     }
// }

// /// <summary>
// /// SignalR real-time publisher interface (implemented in API layer)
// /// </summary>
// public interface IAlarmSignalRPublisher
// {
//     Task PublishAlarmUpdatedAsync(ActiveAlarm alarm, CancellationToken ct = default);
//     Task PublishBulkAlarmsUpdatedAsync(IEnumerable<ActiveAlarm> alarms, CancellationToken ct = default);
//     Task PublishNewAlarmAsync(ActiveAlarm alarm, CancellationToken ct = default);
//     Task PublishAlarmClearedAsync(Guid alarmId, string sourceName, DateTimeOffset clearedTime, CancellationToken ct = default);
//     Task PublishFloodAlertAsync(Guid serverId, double rate, CancellationToken ct = default);
//     Task PublishConnectionStatusAsync(Guid serverId, bool connected, CancellationToken ct = default);
//     Task PublishAckLifecycleAsync(
//         Guid alarmId,
//         string commandId,
//         string correlationId,
//         string? lifecycleId,
//         string? dcsSequenceId,
//         string lifecycleState,
//         string? detail,
//         long timestampEpochMs,
//         long? latencyMs,
//         CancellationToken ct = default);
//     Task PublishLoopKpiAsync(object payload, CancellationToken ct = default);
//     Task PublishAlarmKpiAsync(object payload, CancellationToken ct = default);
// }

// // ============================================================
// // Purge lab/storm-injected active alarms (keeps live OPC simulator rows)
// // ============================================================

// public record PurgeLabInjectedAlarmsCommand(Guid? ServerId = null) : IRequest<PurgeLabInjectedAlarmsResult>;

// public record PurgeLabInjectedAlarmsResult(int RemovedCount);

// public class PurgeLabInjectedAlarmsCommandHandler : IRequestHandler<PurgeLabInjectedAlarmsCommand, PurgeLabInjectedAlarmsResult>
// {
//     private readonly IUnitOfWork _uow;
//     private readonly ILogger<PurgeLabInjectedAlarmsCommandHandler> _logger;

//     public PurgeLabInjectedAlarmsCommandHandler(IUnitOfWork uow, ILogger<PurgeLabInjectedAlarmsCommandHandler> logger)
//     {
//         _uow = uow;
//         _logger = logger;
//     }

//     public async Task<PurgeLabInjectedAlarmsResult> Handle(PurgeLabInjectedAlarmsCommand request, CancellationToken ct)
//     {
//         var removed = await _uow.ActiveAlarms.PurgeLabInjectedAlarmsAsync(request.ServerId, ct);
//         await _uow.SaveChangesAsync(ct);
//         _logger.LogInformation("Purged {Count} lab-injected alarms", removed);
//         return new PurgeLabInjectedAlarmsResult(removed);
//     }
// }

// /// <summary>
// /// Publishes operator lifecycle commands to Kafka traverse.alarm.operator-actions (command gateway).
// /// </summary>
// public interface IOperatorActionPublisher
// {
//     Task PublishAcknowledgeAsync(ActiveAlarm alarm, Guid userId, string username, string? comment, string? operatorStation, CancellationToken ct = default);
// }

// /// <summary>
// /// Interface for writing actions back to the OPC Gateway/DCS
// /// </summary>
// public interface IOpcDcsGateway
// {
//     Task AcknowledgeAlarmAsync(Guid serverId, string sourceName, string? comment, CancellationToken ct = default);
//     Task ShelveAlarmAsync(Guid serverId, string sourceName, int durationMinutes, string comment, CancellationToken ct = default);
// }
