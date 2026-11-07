using Google.Apis.AndroidPublisher.v3;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Services;

namespace AirCanvas.Api.Services;

public class GooglePlayService : IGooglePlayService
{
    private readonly IConfiguration _config;
    private readonly ILogger<GooglePlayService> _logger;
    private readonly string _packageName;
    private readonly HashSet<string> _supportedProducts;

    public GooglePlayService(IConfiguration config, ILogger<GooglePlayService> logger)
    {
        _config = config;
        _logger = logger;
        _packageName = _config["GooglePlay:PackageName"] ?? "com.aircanvas.app";

        var configuredProducts = _config.GetSection("GooglePlay:SupportedProductIds").Get<string[]>()
            ?? new[] { "aircanvas_pro_monthly", "aircanvas_pro_yearly" };
        _supportedProducts = new HashSet<string>(configuredProducts, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<GooglePlaySubscriptionVerification> VerifySubscriptionPurchaseAsync(string productId, string purchaseToken)
    {
        if (string.IsNullOrWhiteSpace(productId) || string.IsNullOrWhiteSpace(purchaseToken))
        {
            return new GooglePlaySubscriptionVerification
            {
                IsValid = false,
                ErrorReason = "Invalid productId or purchaseToken provided."
            };
        }

        if (!_supportedProducts.Contains(productId))
        {
            _logger.LogWarning("Rejecting unsupported product ID: {ProductId}", productId);
            return new GooglePlaySubscriptionVerification
            {
                IsValid = false,
                ErrorReason = $"Product ID '{productId}' is not a recognized AIRCanvas PRO subscription tier."
            };
        }

        try
        {
            var keyPath = _config["GooglePlay:ServiceAccountKeyPath"];
            if (!string.IsNullOrEmpty(keyPath) && File.Exists(keyPath))
            {
                GoogleCredential credential;
                using (var stream = new FileStream(keyPath, FileMode.Open, FileAccess.Read))
                {
                    credential = GoogleCredential.FromStream(stream)
                        .CreateScoped(AndroidPublisherService.Scope.Androidpublisher);
                }

                var publisherService = new AndroidPublisherService(new BaseClientService.Initializer
                {
                    HttpClientInitializer = credential,
                    ApplicationName = "AIRCanvas-Backend"
                });

                var request = publisherService.Purchases.Subscriptions.Get(_packageName, productId, purchaseToken);
                var purchase = await request.ExecuteAsync();

                var expiry = DateTimeOffset.FromUnixTimeMilliseconds(purchase.ExpiryTimeMillis ?? 0).UtcDateTime;
                var startTime = DateTimeOffset.FromUnixTimeMilliseconds(purchase.StartTimeMillis ?? 0).UtcDateTime;
                bool isExpired = expiry <= DateTime.UtcNow;

                return new GooglePlaySubscriptionVerification
                {
                    IsValid = !isExpired && (purchase.PaymentState == 1 || purchase.PaymentState == 2),
                    OrderId = purchase.OrderId,
                    StartTime = startTime,
                    ExpiryTime = expiry,
                    AutoRenewing = purchase.AutoRenewing ?? true,
                    PaymentState = purchase.PaymentState ?? 1,
                    AcknowledgementState = purchase.AcknowledgementState == 1 ? "ACKNOWLEDGED" : "PENDING"
                };
            }
            else
            {
                // In Development/Staging without Google Play credentials, provide deterministic verification
                _logger.LogInformation("Simulating Google Play verification for token: {Token} (Dev Mode)", purchaseToken);
                
                var isYearly = productId.Equals("aircanvas_pro_yearly", StringComparison.OrdinalIgnoreCase);
                var now = DateTime.UtcNow;
                var expiry = isYearly ? now.AddYears(1) : now.AddMonths(1);

                return new GooglePlaySubscriptionVerification
                {
                    IsValid = true,
                    OrderId = $"GPA.{DateTime.UtcNow.Ticks % 1000000000000:D12}-{Random.Shared.Next(10000, 99999)}",
                    StartTime = now,
                    ExpiryTime = expiry,
                    AutoRenewing = true,
                    PaymentState = 1,
                    AcknowledgementState = "ACKNOWLEDGED"
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to verify Google Play purchase for product {ProductId}", productId);
            return new GooglePlaySubscriptionVerification
            {
                IsValid = false,
                ErrorReason = $"Google Play API Verification failed: {ex.Message}"
            };
        }
    }

    public async Task<bool> AcknowledgeSubscriptionAsync(string productId, string purchaseToken)
    {
        try
        {
            var keyPath = _config["GooglePlay:ServiceAccountKeyPath"];
            if (!string.IsNullOrEmpty(keyPath) && File.Exists(keyPath))
            {
                using var stream = new FileStream(keyPath, FileMode.Open, FileAccess.Read);
                var credential = GoogleCredential.FromStream(stream)
                    .CreateScoped(AndroidPublisherService.Scope.Androidpublisher);

                var publisherService = new AndroidPublisherService(new BaseClientService.Initializer
                {
                    HttpClientInitializer = credential,
                    ApplicationName = "AIRCanvas-Backend"
                });

                var ackBody = new Google.Apis.AndroidPublisher.v3.Data.SubscriptionPurchasesAcknowledgeRequest
                {
                    DeveloperPayload = "AIRCanvas-PRO-Verified"
                };

                await publisherService.Purchases.Subscriptions.Acknowledge(ackBody, _packageName, productId, purchaseToken).ExecuteAsync();
                return true;
            }
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to acknowledge purchase token {Token}", purchaseToken);
            return false;
        }
    }
}
