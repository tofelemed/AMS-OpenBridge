namespace Traverse.DisplayService.Models;

/// <summary>
/// An uploaded image/SVG asset referenced by image symbols and (later) the custom graphics library.
/// Stored as bytes; the display snapshot references it by id, never inlines the data (G-CONFIG).
/// </summary>
public class MediaAsset
{
    public Guid Id { get; set; }
    public string ContentType { get; set; } = "";
    public byte[] Data { get; set; } = Array.Empty<byte>();
    public int ByteSize { get; set; }
    public string? FileName { get; set; }
    public string? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
