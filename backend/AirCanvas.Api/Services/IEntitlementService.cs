using AirCanvas.Api.Models;

namespace AirCanvas.Api.Services;

public interface IEntitlementService
{
    Task<EntitlementResponse> GetUserEntitlementsAsync(Guid userId);
    Task<PurchaseVerificationResult> VerifyAndProcessGooglePlayPurchaseAsync(VerifyPurchaseRequest request);
    Task<bool> HandleGooglePlayRtdnAsync(GooglePlayRtdnNotification notification);
}
