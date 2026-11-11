using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace AirCanvas.Api.Models;

public class VerifyPurchaseRequest
{
    [Required]
    [JsonPropertyName("userId")]
    public Guid UserId { get; set; }

    [Required]
    [JsonPropertyName("productId")]
    public string ProductId { get; set; } = string.Empty;

    [Required]
    [JsonPropertyName("purchaseToken")]
    public string PurchaseToken { get; set; } = string.Empty;

    [JsonPropertyName("orderId")]
    public string? OrderId { get; set; }
}

public class PurchaseVerificationResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public EntitlementResponse? Entitlement { get; set; }
    public string? OrderId { get; set; }
    public DateTime? ExpiryTime { get; set; }
}

public class GooglePlayRtdnNotification
{
    [JsonPropertyName("version")]
    public string? Version { get; set; }

    [JsonPropertyName("packageName")]
    public string? PackageName { get; set; }

    [JsonPropertyName("eventTimeMillis")]
    public long EventTimeMillis { get; set; }

    [JsonPropertyName("subscriptionNotification")]
    public SubscriptionNotificationPayload? SubscriptionNotification { get; set; }
}

public class SubscriptionNotificationPayload
{
    [JsonPropertyName("version")]
    public string? Version { get; set; }

    [JsonPropertyName("notificationType")]
    public int NotificationType { get; set; }

    [JsonPropertyName("purchaseToken")]
    public string PurchaseToken { get; set; } = string.Empty;

    [JsonPropertyName("subscriptionId")]
    public string SubscriptionId { get; set; } = string.Empty;
}
