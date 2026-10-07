// ==============================================================================
// lib/services/subscription_service.dart
// AIRCanvas Subscription & Google Play Billing Service
// Strictly enforces backend-authoritative verification before unlocking PRO
// ==============================================================================

import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/entitlement.dart';
import 'auth_service.dart';

enum PurchaseStatus {
  idle,
  purchasingInPlayStore,
  verifyingWithBackend,
  success,
  failed,
}

class SubscriptionService extends ChangeNotifier {
  static final SubscriptionService _instance = SubscriptionService._internal();
  factory SubscriptionService() => _instance;
  SubscriptionService._internal();

  // Configurable Google Play Product IDs (Do NOT hard-code in logic)
  String monthlyProductId = 'aircanvas_pro_monthly';
  String yearlyProductId = 'aircanvas_pro_yearly';

  // Configurable Backend API Base URL
  String backendBaseUrl = 'http://localhost:5000';

  // Current authoritative entitlement (Default is strictly FREE)
  Entitlement _entitlement = Entitlement.free();
  Entitlement get entitlement => _entitlement;
  bool get isPro => _entitlement.isPro;

  PurchaseStatus _purchaseStatus = PurchaseStatus.idle;
  PurchaseStatus get purchaseStatus => _purchaseStatus;

  String? _lastErrorMessage;
  String? get lastErrorMessage => _lastErrorMessage;

  /// Configure product IDs dynamically from remote config / server
  void configureProductIds({required String monthlyId, required String yearlyId}) {
    monthlyProductId = monthlyId;
    yearlyProductId = yearlyId;
    notifyListeners();
  }

  /// Sets the backend API base URL
  void setBackendBaseUrl(String url) {
    backendBaseUrl = url.replaceAll(RegExp(r'/+$'), '');
  }

  /// Fetch latest authoritative entitlement from backend source of truth
  Future<Entitlement> fetchEntitlements() async {
    final user = AuthService().currentUser;
    if (user == null) {
      _entitlement = Entitlement.free();
      notifyListeners();
      return _entitlement;
    }

    try {
      final uri = Uri.parse('$backendBaseUrl/api/v1/entitlements/${user.id}');
      final response = await http.get(
        uri,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id,
          if (AuthService().authToken != null)
            'Authorization': 'Bearer ${AuthService().authToken}',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        _entitlement = Entitlement.fromJson(data);
      } else {
        // Fallback to FREE if unauthorized or user not found
        _entitlement = Entitlement.free();
      }
    } catch (e) {
      debugPrint('[SubscriptionService] Entitlement fetch error: $e');
      // If network fails, retain cached if valid, or default to FREE
      if (_entitlement.expiresAt != null &&
          _entitlement.expiresAt!.isBefore(DateTime.now())) {
        _entitlement = Entitlement.free();
      }
    }

    notifyListeners();
    return _entitlement;
  }

  /// CRITICAL PURCHASE FLOW:
  /// 1. Trigger Google Play Billing flow
  /// 2. Google Play returns purchaseToken
  /// 3. DO NOT unlock PRO here!
  /// 4. Transmit purchaseToken to ASP.NET Core backend
  /// 5. Backend validates against Google Play Developer API
  /// 6. Backend updates Supabase database
  /// 7. Backend returns authoritative PRO Entitlement
  /// 8. Flutter updates state and unlocks PRO features
  Future<bool> handleGooglePlayPurchaseComplete({
    required String productId,
    required String purchaseToken,
    String? orderId,
  }) async {
    final user = AuthService().currentUser;
    if (user == null) {
      _lastErrorMessage = 'User must be authenticated before purchasing.';
      _purchaseStatus = PurchaseStatus.failed;
      notifyListeners();
      return false;
    }

    _purchaseStatus = PurchaseStatus.verifyingWithBackend;
    _lastErrorMessage = null;
    notifyListeners();

    try {
      final verifyUri = Uri.parse('$backendBaseUrl/api/v1/subscriptions/google-play/verify');
      final payload = jsonEncode({
        'userId': user.id,
        'productId': productId,
        'purchaseToken': purchaseToken,
        'orderId': orderId,
      });

      final response = await http.post(
        verifyUri,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id,
          if (AuthService().authToken != null)
            'Authorization': 'Bearer ${AuthService().authToken}',
        },
        body: payload,
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        final responseData = jsonDecode(response.body) as Map<String, dynamic>;
        if (responseData['success'] == true && responseData['entitlement'] != null) {
          // Backend verified successfully! Update authoritative entitlement
          _entitlement = Entitlement.fromJson(
            responseData['entitlement'] as Map<String, dynamic>,
          );
          _purchaseStatus = PurchaseStatus.success;
          notifyListeners();
          return true;
        }
      }

      final errorBody = jsonDecode(response.body);
      _lastErrorMessage = errorBody['message'] ?? 'Backend verification failed.';
      _purchaseStatus = PurchaseStatus.failed;
      notifyListeners();
      return false;
    } catch (e) {
      debugPrint('[SubscriptionService] Backend verification exception: $e');
      _lastErrorMessage = 'Network error while contacting verification server: $e';
      _purchaseStatus = PurchaseStatus.failed;
      notifyListeners();
      return false;
    }
  }

  /// Reset status back to idle
  void resetPurchaseStatus() {
    _purchaseStatus = PurchaseStatus.idle;
    _lastErrorMessage = null;
    notifyListeners();
  }
}
