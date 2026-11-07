namespace AirCanvas.Api.Services;

public interface IGooglePlayService
{
    Task<GooglePlaySubscriptionVerification> VerifySubscriptionPurchaseAsync(string productId, string purchaseToken);
    Task<bool> AcknowledgeSubscriptionAsync(string productId, string purchaseToken);
}

public class GooglePlaySubscriptionVerification
{
    public bool IsValid { get; set; }
    public string? OrderId { get; set; }
    public DateTime? StartTime { get; set; }
    public DateTime? ExpiryTime { get; set; }
    public bool AutoRenewing { get; set; }
    public int PaymentState { get; set; }
    public string? AcknowledgementState { get; set; }
    public string? ErrorReason { get; set; }
}
