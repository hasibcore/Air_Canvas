using AirCanvas.Api.Models;
using AirCanvas.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AirCanvas.Api.Controllers;

[ApiController]
[Route("api/v1/subscriptions")]
public class SubscriptionsController : ControllerBase
{
    private readonly IEntitlementService _entitlementService;
    private readonly ILogger<SubscriptionsController> _logger;
    private readonly IConfiguration _config;

    public SubscriptionsController(
        IEntitlementService entitlementService,
        ILogger<SubscriptionsController> logger,
        IConfiguration config)
    {
        _entitlementService = entitlementService;
        _logger = logger;
        _config = config;
    }

    /// <summary>
    /// Returns the only TWO plans in the system: FREE and PRO with their configurable feature lists.
    /// </summary>
    [HttpGet("plans")]
    public IActionResult GetPlans()
    {
        var plans = new[]
        {
            new
            {
                planCode = "FREE",
                name = "AirCanvas Free",
                description = "Default plan for every new user. Essential canvas drawing and device pairing.",
                price = "$0.00",
                features = new Dictionary<string, bool>
                {
                    { "basicDrawing", true },
                    { "advancedCalibration", false },
                    { "multiMonitor", false },
                    { "advancedSettings", false },
                    { "highPollingRate", false },
                    { "ultraLowLatency", false }
                }
            },
            new
            {
                planCode = "PRO",
                name = "AirCanvas Pro",
                description = "Paid subscription unlocking multi-monitor, advanced calibration, and 240Hz turbo mode.",
                productIds = new[]
                {
                    _config["GooglePlay:Subscriptions:MonthlyProductId"] ?? "aircanvas_pro_monthly",
                    _config["GooglePlay:Subscriptions:YearlyProductId"] ?? "aircanvas_pro_yearly"
                },
                features = new Dictionary<string, bool>
                {
                    { "basicDrawing", true },
                    { "advancedCalibration", true },
                    { "multiMonitor", true },
                    { "advancedSettings", true },
                    { "highPollingRate", true },
                    { "ultraLowLatency", true }
                }
            }
        };

        return Ok(new { success = true, plans });
    }

    /// <summary>
    /// Flutter app sends Google Play purchaseToken here for server-side verification.
    /// The Flutter client NEVER unlocks PRO client-side directly.
    /// </summary>
    [HttpPost("google-play/verify")]
    [ProducesResponseType(typeof(PurchaseVerificationResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> VerifyGooglePlayPurchase([FromBody] VerifyPurchaseRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.PurchaseToken))
        {
            return BadRequest(new { success = false, message = "Purchase token is required." });
        }

        var result = await _entitlementService.VerifyAndProcessGooglePlayPurchaseAsync(request);
        if (!result.Success)
        {
            return BadRequest(new
            {
                success = false,
                message = result.ErrorMessage ?? "Purchase verification failed."
            });
        }

        return Ok(new
        {
            success = true,
            orderId = result.OrderId,
            expiryTime = result.ExpiryTime,
            entitlement = result.Entitlement
        });
    }

    /// <summary>
    /// Google Cloud Pub/Sub Webhook for Google Play Real-Time Developer Notifications (RTDN).
    /// Automatically handles renewals, cancellations, grace periods, and expirations.
    /// </summary>
    [HttpPost("google-play/rtdn")]
    public async Task<IActionResult> HandleGooglePlayRtdnWebhook([FromBody] GooglePlayRtdnNotification notification)
    {
        try
        {
            var processed = await _entitlementService.HandleGooglePlayRtdnAsync(notification);
            return Ok(new { status = "ACKNOWLEDGED", processed });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing RTDN webhook");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
