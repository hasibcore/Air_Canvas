using System.Data;
using AirCanvas.Api.Models;
using Npgsql;

namespace AirCanvas.Api.Services;

public class EntitlementService : IEntitlementService
{
    private readonly IConfiguration _config;
    private readonly IGooglePlayService _googlePlayService;
    private readonly ILogger<EntitlementService> _logger;
    private readonly string _connectionString;

    public EntitlementService(
        IConfiguration config,
        IGooglePlayService googlePlayService,
        ILogger<EntitlementService> logger)
    {
        _config = config;
        _googlePlayService = googlePlayService;
        _logger = logger;
        _connectionString = _config.GetConnectionString("SupabaseDatabase") ?? string.Empty;
    }

    public async Task<EntitlementResponse> GetUserEntitlementsAsync(Guid userId)
    {
        // 1. If no DB connection configured, fallback to in-memory evaluation
        if (string.IsNullOrWhiteSpace(_connectionString) || _connectionString.Contains("YOUR_SUPABASE_PROJECT"))
        {
            return GetDefaultFreeEntitlement();
        }

        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            // Query active subscriptions joined with plans
            const string sql = @"
                SELECT s.id, s.status, s.current_period_end, p.plan_code
                FROM public.subscriptions s
                JOIN public.plans p ON s.plan_id = p.id
                WHERE s.user_id = @userId
                  AND s.status IN ('ACTIVE', 'GRACE_PERIOD')
                  AND s.current_period_end > NOW()
                ORDER BY s.current_period_end DESC
                LIMIT 1;";

            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("userId", userId);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                var planCode = reader.GetString(reader.GetOrdinal("plan_code"));
                var status = reader.GetString(reader.GetOrdinal("status"));
                var currentPeriodEnd = reader.GetDateTime(reader.GetOrdinal("current_period_end"));

                if (planCode.Equals("PRO", StringComparison.OrdinalIgnoreCase))
                {
                    return new EntitlementResponse
                    {
                        Plan = "PRO",
                        Status = status,
                        ExpiresAt = currentPeriodEnd.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                        Features = new EntitlementFeatures
                        {
                            BasicDrawing = true,
                            AdvancedCalibration = true,
                            MultiMonitor = true,
                            AdvancedSettings = true,
                            UltraLowLatency = true,
                            HighPollingRate = true
                        }
                    };
                }
            }

            return GetDefaultFreeEntitlement();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve entitlement from Supabase for user {UserId}", userId);
            return GetDefaultFreeEntitlement();
        }
    }

    public async Task<PurchaseVerificationResult> VerifyAndProcessGooglePlayPurchaseAsync(VerifyPurchaseRequest request)
    {
        _logger.LogInformation("Beginning purchase verification for User: {UserId}, Product: {ProductId}", request.UserId, request.ProductId);

        // 1. Verify with Google Play Developer API
        var verification = await _googlePlayService.VerifySubscriptionPurchaseAsync(request.ProductId, request.PurchaseToken);
        if (!verification.IsValid)
        {
            return new PurchaseVerificationResult
            {
                Success = false,
                ErrorMessage = verification.ErrorReason ?? "Google Play subscription validation failed or expired."
            };
        }

        // 2. Acknowledge with Google Play (Required within 3 days or Play refunds user!)
        await _googlePlayService.AcknowledgeSubscriptionAsync(request.ProductId, request.PurchaseToken);

        var orderId = verification.OrderId ?? request.OrderId ?? $"GPA.{Guid.NewGuid().ToString()[..12]}";
        var expiry = verification.ExpiryTime ?? DateTime.UtcNow.AddMonths(1);

        // 3. Update Database (Supabase PostgreSQL)
        if (!string.IsNullOrWhiteSpace(_connectionString) && !_connectionString.Contains("YOUR_SUPABASE_PROJECT"))
        {
            try
            {
                await using var conn = new NpgsqlConnection(_connectionString);
                await conn.OpenAsync();

                // Get Pro plan ID
                Guid proPlanId;
                const string planSql = "SELECT id FROM public.plans WHERE plan_code = 'PRO' LIMIT 1;";
                await using (var planCmd = new NpgsqlCommand(planSql, conn))
                {
                    var result = await planCmd.ExecuteScalarAsync();
                    if (result == null)
                    {
                        throw new InvalidOperationException("PRO plan is missing from database.");
                    }
                    proPlanId = (Guid)result;
                }

                // Insert purchase record idempotently (Never stores credit-card info)
                const string purchaseSql = @"
                    INSERT INTO public.purchases (
                        user_id, provider, product_id, purchase_token, order_id, 
                        purchase_state, purchase_time, expiry_time, acknowledged
                    ) VALUES (
                        @userId, 'GOOGLE_PLAY', @productId, @token, @orderId,
                        'PURCHASED', NOW(), @expiry, true
                    )
                    ON CONFLICT (purchase_token, order_id) DO NOTHING;";

                await using (var purchaseCmd = new NpgsqlCommand(purchaseSql, conn))
                {
                    purchaseCmd.Parameters.AddWithValue("userId", request.UserId);
                    purchaseCmd.Parameters.AddWithValue("productId", request.ProductId);
                    purchaseCmd.Parameters.AddWithValue("token", request.PurchaseToken);
                    purchaseCmd.Parameters.AddWithValue("orderId", orderId);
                    purchaseCmd.Parameters.AddWithValue("expiry", expiry);
                    await purchaseCmd.ExecuteNonQueryAsync();
                }

                // Upsert subscription deterministically by unique purchase_token
                const string subSql = @"
                    INSERT INTO public.subscriptions (
                        user_id, plan_id, provider, product_id, purchase_token, 
                        order_id, status, started_at, current_period_start, current_period_end, auto_renew
                    ) VALUES (
                        @userId, @planId, 'GOOGLE_PLAY', @productId, @token,
                        @orderId, 'ACTIVE', NOW(), NOW(), @expiry, @autoRenew
                    )
                    ON CONFLICT (purchase_token) DO UPDATE
                    SET status = EXCLUDED.status,
                        order_id = EXCLUDED.order_id,
                        current_period_end = EXCLUDED.current_period_end,
                        auto_renew = EXCLUDED.auto_renew,
                        updated_at = NOW();";

                await using (var subCmd = new NpgsqlCommand(subSql, conn))
                {
                    subCmd.Parameters.AddWithValue("userId", request.UserId);
                    subCmd.Parameters.AddWithValue("planId", proPlanId);
                    subCmd.Parameters.AddWithValue("productId", request.ProductId);
                    subCmd.Parameters.AddWithValue("token", request.PurchaseToken);
                    subCmd.Parameters.AddWithValue("orderId", orderId);
                    subCmd.Parameters.AddWithValue("expiry", expiry);
                    subCmd.Parameters.AddWithValue("autoRenew", verification.AutoRenewing);
                    await subCmd.ExecuteNonQueryAsync();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to persist subscription in Supabase DB for User {UserId}", request.UserId);
                return new PurchaseVerificationResult
                {
                    Success = false,
                    ErrorMessage = "Subscription verification could not be persisted."
                };
            }
        }

        // Return authoritative Pro Entitlement
        var proEntitlement = new EntitlementResponse
        {
            Plan = "PRO",
            Status = "ACTIVE",
            ExpiresAt = expiry.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            Features = new EntitlementFeatures
            {
                BasicDrawing = true,
                AdvancedCalibration = true,
                MultiMonitor = true,
                AdvancedSettings = true,
                UltraLowLatency = true,
                HighPollingRate = true
            }
        };

        return new PurchaseVerificationResult
        {
            Success = true,
            Entitlement = proEntitlement,
            OrderId = orderId,
            ExpiryTime = expiry
        };
    }

    public async Task<bool> HandleGooglePlayRtdnAsync(GooglePlayRtdnNotification notification)
    {
        var subNotification = notification?.SubscriptionNotification;
        if (subNotification == null || string.IsNullOrWhiteSpace(subNotification.PurchaseToken))
        {
            return false;
        }

        _logger.LogInformation("Received Google Play RTDN event type: {Type}", subNotification.NotificationType);

        // Map Google Play notification types:
        // 1: SUBSCRIPTION_RECOVERED -> ACTIVE
        // 2: SUBSCRIPTION_RENEWED -> ACTIVE
        // 3: SUBSCRIPTION_CANCELED -> CANCELED
        // 4: SUBSCRIPTION_PURCHASED -> ACTIVE
        // 5: SUBSCRIPTION_ON_HOLD -> ON_HOLD
        // 6: SUBSCRIPTION_IN_GRACE_PERIOD -> GRACE_PERIOD
        // 12: SUBSCRIPTION_REVOKED -> REVOKED
        // 13: SUBSCRIPTION_EXPIRED -> EXPIRED

        string? newStatus = subNotification.NotificationType switch
        {
            1 => "ACTIVE",
            2 => "ACTIVE",
            3 => "CANCELED",
            4 => "ACTIVE",
            5 => "ON_HOLD",
            6 => "GRACE_PERIOD",
            12 => "REVOKED",
            13 => "EXPIRED",
            _ => null
        };

        if (newStatus == null)
        {
            _logger.LogWarning("Ignoring unrecognized Google Play RTDN type: {Type}", subNotification.NotificationType);
            return false;
        }

        if (!string.IsNullOrWhiteSpace(_connectionString) && !_connectionString.Contains("YOUR_SUPABASE_PROJECT"))
        {
            try
            {
                await using var conn = new NpgsqlConnection(_connectionString);
                await conn.OpenAsync();

                const string updateSql = @"
                    UPDATE public.subscriptions 
                    SET status = @status,
                        canceled_at = CASE WHEN @status = 'CANCELED' AND canceled_at IS NULL THEN NOW() ELSE canceled_at END,
                        revoked_at = CASE WHEN @status = 'REVOKED' AND revoked_at IS NULL THEN NOW() ELSE revoked_at END,
                        updated_at = NOW()
                    WHERE purchase_token = @token;";

                await using var cmd = new NpgsqlCommand(updateSql, conn);
                cmd.Parameters.AddWithValue("status", newStatus);
                cmd.Parameters.AddWithValue("token", subNotification.PurchaseToken);
                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update RTDN status in Supabase.");
                return false;
            }
        }

        return true;
    }

    private static EntitlementResponse GetDefaultFreeEntitlement()
    {
        return new EntitlementResponse
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
        };
    }
}
