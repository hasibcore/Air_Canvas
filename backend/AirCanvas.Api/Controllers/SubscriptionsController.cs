using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AirCanvas.Api.Models;
using AirCanvas.Api.Services;
using Microsoft.AspNetCore.Authorization;
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
    /// Flutter app sends Google Play purchaseToken here for authenticated server-side verification.
    /// Ownership is bound to the validated JWT user ID so users cannot activate purchases for arbitrary accounts.
    /// </summary>
    [Authorize]
    [HttpPost("google-play/verify")]
    [ProducesResponseType(typeof(PurchaseVerificationResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> VerifyGooglePlayPurchase([FromBody] VerifyPurchaseRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.PurchaseToken))
        {
            return BadRequest(new { success = false, message = "Purchase token is required." });
        }

        var authUserIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(authUserIdStr, out var authenticatedUserId))
        {
            return Unauthorized(new { success = false, message = "Valid user identity is required." });
        }

        if (request.UserId != Guid.Empty && request.UserId != authenticatedUserId)
        {
            return Forbid();
        }

        request.UserId = authenticatedUserId;

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
    /// Requires a configured shared webhook secret verified in constant time.
    /// </summary>
    [HttpPost("google-play/rtdn")]
    public async Task<IActionResult> HandleGooglePlayRtdnWebhook([FromBody] GooglePlayRtdnNotification notification)
    {
        var expectedSecret = _config["GooglePlay:RtdnWebhookSecret"];
        var providedSecret = Request.Headers["X-Webhook-Secret"].FirstOrDefault()
            ?? Request.Query["token"].FirstOrDefault();

        if (string.IsNullOrWhiteSpace(expectedSecret) ||
            string.IsNullOrWhiteSpace(providedSecret) ||
            !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expectedSecret),
                Encoding.UTF8.GetBytes(providedSecret)))
        {
            return Unauthorized(new { error = "Invalid or missing webhook authorization." });
        }

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
