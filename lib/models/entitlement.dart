// ==============================================================================
// lib/models/entitlement.dart
// Authoritative Entitlement Contract for AIRCanvas
// Strictly TWO PLANS: FREE and PRO
// ==============================================================================

class EntitlementFeatures {
  final bool basicDrawing;
  final bool advancedCalibration;
  final bool multiMonitor;
  final bool advancedSettings;
  final bool ultraLowLatency;
  final bool highPollingRate;

  const EntitlementFeatures({
    this.basicDrawing = true,
    this.advancedCalibration = false,
    this.multiMonitor = false,
    this.advancedSettings = false,
    this.ultraLowLatency = false,
    this.highPollingRate = false,
  });

  factory EntitlementFeatures.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const EntitlementFeatures();
    return EntitlementFeatures(
      basicDrawing: json['basicDrawing'] as bool? ?? true,
      advancedCalibration: json['advancedCalibration'] as bool? ?? false,
      multiMonitor: json['multiMonitor'] as bool? ?? false,
      advancedSettings: json['advancedSettings'] as bool? ?? false,
      ultraLowLatency: json['ultraLowLatency'] as bool? ?? false,
      highPollingRate: json['highPollingRate'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'basicDrawing': basicDrawing,
        'advancedCalibration': advancedCalibration,
        'multiMonitor': multiMonitor,
        'advancedSettings': advancedSettings,
        'ultraLowLatency': ultraLowLatency,
        'highPollingRate': highPollingRate,
      };
}

class Entitlement {
  final String plan; // 'FREE' or 'PRO'
  final String status; // 'ACTIVE', 'EXPIRED', 'CANCELED', 'GRACE_PERIOD'
  final DateTime? expiresAt;
  final EntitlementFeatures features;

  const Entitlement({
    required this.plan,
    required this.status,
    this.expiresAt,
    required this.features,
  });

  bool get isPro => plan == 'PRO' && status == 'ACTIVE';

  factory Entitlement.free() {
    return const Entitlement(
      plan: 'FREE',
      status: 'ACTIVE',
      features: EntitlementFeatures(
        basicDrawing: true,
        advancedCalibration: false,
        multiMonitor: false,
        advancedSettings: false,
      ),
    );
  }

  factory Entitlement.fromJson(Map<String, dynamic> json) {
    DateTime? parsedExpiry;
    if (json['expiresAt'] != null) {
      parsedExpiry = DateTime.tryParse(json['expiresAt'].toString());
    }

    return Entitlement(
      plan: (json['plan'] as String? ?? 'FREE').toUpperCase(),
      status: (json['status'] as String? ?? 'ACTIVE').toUpperCase(),
      expiresAt: parsedExpiry,
      features: EntitlementFeatures.fromJson(
        json['features'] as Map<String, dynamic>?,
      ),
    );
  }

  Map<String, dynamic> toJson() => {
        'plan': plan,
        'status': status,
        if (expiresAt != null) 'expiresAt': expiresAt!.toIso8601String(),
        'features': features.toJson(),
      };
}
