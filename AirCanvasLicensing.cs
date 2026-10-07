// ==============================================================================
// AirCanvasLicensing.cs
// Windows C# Server Entitlement & Subscription Client
// Connects to ASP.NET Core Backend / Supabase source of truth
// Strictly TWO PLANS: FREE and PRO
// Gating only Pro features WITHOUT modifying any drawing, USB, TCP or mouse logic
// ==============================================================================

using System;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace AirCanvas
{
    public class AirCanvasLicensing
    {
        private static readonly Lazy<AirCanvasLicensing> _instance =
            new Lazy<AirCanvasLicensing>(() => new AirCanvasLicensing());

        public static AirCanvasLicensing Instance => _instance.Value;

        private readonly HttpClient _httpClient;
        private string _backendUrl = "http://localhost:5000";

        public string CurrentPlan { get; private set; } = "FREE";
        public bool IsPro => CurrentPlan.Equals("PRO", StringComparison.OrdinalIgnoreCase);
        public DateTime? ExpiryDate { get; private set; }

        public bool AllowAdvancedCalibration => IsPro;
        public bool AllowMultiMonitor => IsPro;
        public bool AllowAdvancedSettings => IsPro;
        public bool AllowHighPollingRate => IsPro;

        public event Action<string>? OnPlanUpdated;

        private AirCanvasLicensing()
        {
            _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        }

        public void ConfigureBackendUrl(string url)
        {
            _backendUrl = url.TrimEnd('/');
        }

        /// <summary>
        /// Query backend source of truth for user entitlement
        /// </summary>
        public async Task<bool> CheckUserEntitlementAsync(string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                SetPlan("FREE", null);
                return false;
            }

            try
            {
                var endpoint = $"{_backendUrl}/api/v1/entitlements/{userId}";
                var response = await _httpClient.GetAsync(endpoint);

                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var entitlement = JsonSerializer.Deserialize<EntitlementPayload>(content, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                    if (entitlement != null && entitlement.Plan != null)
                    {
                        DateTime? expiry = null;
                        if (!string.IsNullOrEmpty(entitlement.ExpiresAt) &&
                            DateTime.TryParse(entitlement.ExpiresAt, out var parsed))
                        {
                            expiry = parsed;
                        }

                        SetPlan(entitlement.Plan.ToUpperInvariant(), expiry);
                        return IsPro;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Licensing] Failed to contact entitlement server: {ex.Message}");
            }

            // Fallback to FREE if unverified
            SetPlan("FREE", null);
            return false;
        }

        private void SetPlan(string plan, DateTime? expiry)
        {
            CurrentPlan = (plan == "PRO") ? "PRO" : "FREE";
            ExpiryDate = expiry;
            OnPlanUpdated?.Invoke(CurrentPlan);
            Console.WriteLine($"[Licensing] Authoritative Plan: {CurrentPlan} (Pro: {IsPro})");
        }

        private class EntitlementPayload
        {
            [JsonPropertyName("plan")]
            public string? Plan { get; set; }

            [JsonPropertyName("status")]
            public string? Status { get; set; }

            [JsonPropertyName("expiresAt")]
            public string? ExpiresAt { get; set; }
        }
    }
}
