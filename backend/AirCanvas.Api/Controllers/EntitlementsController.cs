using System.Security.Claims;
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

    public EntitlementsController(IEntitlementService entitlementService, ILogger<EntitlementsController> logger)
    {
        _entitlementService = entitlementService;
        _logger = logger;
    }

    /// <summary>
    /// Returns the authoritative plan and feature entitlement for the current user.
    /// Only TWO plans exist: FREE and PRO.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(EntitlementResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCurrentEntitlement()
    {
        // Extract authenticated user ID from JWT or header fallback
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier) 
            ?? Request.Headers["X-User-Id"].FirstOrDefault();

        if (string.IsNullOrWhiteSpace(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
        {
            // Anonymous / Unauthenticated users default to FREE plan
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
    /// Explicit entitlement lookup by User ID (used by C# Windows host and trusted clients)
    /// </summary>
    [HttpGet("{userId:guid}")]
    [ProducesResponseType(typeof(EntitlementResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetEntitlementByUserId(Guid userId)
    {
        var entitlement = await _entitlementService.GetUserEntitlementsAsync(userId);
        return Ok(entitlement);
    }
}
