using System.Text.Json.Serialization;

namespace AirCanvas.Api.Models;

/// <summary>
/// Authoritative Entitlement Contract for AIRCanvas
/// ONLY TWO PLANS: FREE and PRO
/// </summary>
public class EntitlementResponse
{
    [JsonPropertyName("plan")]
    public string Plan { get; set; } = "FREE"; // "FREE" or "PRO"

    [JsonPropertyName("status")]
    public string Status { get; set; } = "ACTIVE"; // "ACTIVE", "EXPIRED", "GRACE_PERIOD", "CANCELED"

    [JsonPropertyName("expiresAt")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ExpiresAt { get; set; }

    [JsonPropertyName("features")]
    public EntitlementFeatures Features { get; set; } = new();
}

public class EntitlementFeatures
{
    [JsonPropertyName("basicDrawing")]
    public bool BasicDrawing { get; set; } = true;

    [JsonPropertyName("advancedCalibration")]
    public bool AdvancedCalibration { get; set; } = false;

    [JsonPropertyName("multiMonitor")]
    public bool MultiMonitor { get; set; } = false;

    [JsonPropertyName("advancedSettings")]
    public bool AdvancedSettings { get; set; } = false;

    [JsonPropertyName("ultraLowLatency")]
    public bool UltraLowLatency { get; set; } = false;

    [JsonPropertyName("highPollingRate")]
    public bool HighPollingRate { get; set; } = false;
}
