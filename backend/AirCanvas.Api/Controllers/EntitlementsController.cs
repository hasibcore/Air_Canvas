using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AirCanvas.Api.Models;
using AirCanvas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AirCanvas.Api.Controllers;

[ApiController]
[Route("api/v1/entitlements")]
public class EntitlementsController : ControllerBase
{
    private readonly IEntitlementService _entitlementService;
    private readonly ILogger<EntitlementsController> _logger;
    private readonly IConfiguration _config;

    public EntitlementsController(
        IEntitlementService entitlementService,
        ILogger<EntitlementsController> logger,
        IConfiguration config)
    {
        _entitlementService = entitlementService;
        _logger = logger;
        _config = config;
    }

    /// <summary>
    /// Returns the authoritative plan and feature entitlement for the authenticated JWT user.
    /// Only TWO plans exist: FREE and PRO. Unauthenticated callers receive FREE without header spoofing.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(EntitlementResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCurrentEntitlement()
    {
        // Only trust verified JWT claims — never trust spoofable X-User-Id headers
        var userIdStr = User.Identity?.IsAuthenticated == true
            ? (User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub"))
            : null;

        if (string.IsNullOrWhiteSpace(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
        {
            return Ok(new EntitlementResponse
            {
                Plan = "FREE",
                Status = "ACTIVE",
                Features = new EntitlementFeatures
                {
                    BasicDrawing = true,
                    AdvancedCalibration = false,
                    MultiMonitor = false,
                    AdvancedSettings = false,
                    UltraLowLatency = false,
                    HighPollingRate = false
                }
            });
        }

        var entitlement = await _entitlementService.GetUserEntitlementsAsync(userId);
        return Ok(entitlement);
    }

    /// <summary>
    /// Entitlement lookup by User ID — requires matching authenticated JWT owner or valid internal service API key.
    /// </summary>
    [HttpGet("{userId:guid}")]
    [ProducesResponseType(typeof(EntitlementResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetEntitlementByUserId(Guid userId)
    {
        var expectedServiceKey = _config["Licensing:InternalServiceApiKey"];
        var providedServiceKey = Request.Headers["X-Service-Api-Key"].FirstOrDefault();
        bool hasValidServiceKey =
            !string.IsNullOrWhiteSpace(expectedServiceKey) &&
            !string.IsNullOrWhiteSpace(providedServiceKey) &&
            CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expectedServiceKey),
                Encoding.UTF8.GetBytes(providedServiceKey));

        if (!hasValidServiceKey)
        {
            if (User.Identity?.IsAuthenticated != true)
            {
                return Unauthorized(new { error = "Authentication required." });
            }

            var authUserStr = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            if (!Guid.TryParse(authUserStr, out var authUserId) || authUserId != userId)
            {
                return Forbid();
            }
        }

        var entitlement = await _entitlementService.GetUserEntitlementsAsync(userId);
        return Ok(entitlement);
    }
}
