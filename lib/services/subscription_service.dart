// ==============================================================================
// lib/services/subscription_service.dart
// AIRCanvas Subscription & Google Play Billing Service
// Strictly enforces backend-authoritative verification before unlocking PRO
// ==============================================================================

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
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

  bool _isVerifyingPurchase = false;

  /// Configure product IDs dynamically from remote config / server
  void configureProductIds({required String monthlyId, required String yearlyId}) {
    monthlyProductId = monthlyId.trim().isNotEmpty ? monthlyId.trim() : monthlyProductId;
    yearlyProductId = yearlyId.trim().isNotEmpty ? yearlyId.trim() : yearlyProductId;
    notifyListeners();
  }

  /// Sets the backend API base URL
  void setBackendBaseUrl(String url) {
    final trimmed = url.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.isNotEmpty) {
      backendBaseUrl = trimmed;
    }
  }

  Future<({int statusCode, String body})> _sendHttpRequest({
    required String method,
    required Uri uri,
    required Map<String, String> headers,
    String? body,
    required Duration timeout,
  }) async {
    final client = HttpClient();
    client.connectionTimeout = timeout;
    try {
      final HttpClientRequest request = await client.openUrl(method, uri).timeout(timeout);
      headers.forEach((key, value) {
        request.headers.set(key, value);
      });
      if (body != null) {
        final List<int> encoded = utf8.encode(body);
        request.contentLength = encoded.length;
        request.add(encoded);
      }
      final HttpClientResponse response = await request.close().timeout(timeout);
      final String responseBody = await response.transform(utf8.decoder).join().timeout(timeout);
      return (statusCode: response.statusCode, body: responseBody);
    } finally {
      client.close(force: true);
    }
  }

  Map<String, dynamic>? _tryDecodeJsonMap(String raw) {
    if (raw.trim().isEmpty) return null;
    try {
      final dynamic decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
    } catch (_) {}
    return null;
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
      final response = await _sendHttpRequest(
        method: 'GET',
        uri: uri,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id,
          if (AuthService().authToken != null)
            'Authorization': 'Bearer ${AuthService().authToken}',
        },
        timeout: const Duration(seconds: 10),
      );

      if (response.statusCode == 200) {
        final data = _tryDecodeJsonMap(response.body);
        if (data != null) {
          _entitlement = Entitlement.fromJson(data);
        } else {
          _entitlement = Entitlement.free();
        }
      } else {
        // Fallback to FREE if unauthorized or user not found
        _entitlement = Entitlement.free();
      }
    } catch (e) {
      debugPrint('[SubscriptionService] Entitlement fetch error: $e');
      // If network fails, retain cached if valid, or default to FREE
      if (_entitlement.isExpired) {
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
    if (_isVerifyingPurchase) {
      return false;
    }

    final user = AuthService().currentUser;
    if (user == null) {
      _lastErrorMessage = 'User must be authenticated before purchasing.';
      _purchaseStatus = PurchaseStatus.failed;
      notifyListeners();
      return false;
    }

    if (productId.trim().isEmpty || purchaseToken.trim().isEmpty) {
      _lastErrorMessage = 'Invalid product ID or purchase token.';
      _purchaseStatus = PurchaseStatus.failed;
      notifyListeners();
      return false;
    }

    _isVerifyingPurchase = true;
    _purchaseStatus = PurchaseStatus.verifyingWithBackend;
    _lastErrorMessage = null;
    notifyListeners();

    try {
      final verifyUri = Uri.parse('$backendBaseUrl/api/v1/subscriptions/google-play/verify');
      final payload = jsonEncode({
        'userId': user.id,
        'productId': productId.trim(),
        'purchaseToken': purchaseToken.trim(),
        'orderId': orderId,
      });

      final response = await _sendHttpRequest(
        method: 'POST',
        uri: verifyUri,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id,
          if (AuthService().authToken != null)
            'Authorization': 'Bearer ${AuthService().authToken}',
        },
        body: payload,
        timeout: const Duration(seconds: 15),
      );

      final responseData = _tryDecodeJsonMap(response.body);

      if (response.statusCode == 200 && responseData != null) {
        if (responseData['success'] == true && responseData['entitlement'] is Map<String, dynamic>) {
          // Backend verified successfully! Update authoritative entitlement
          _entitlement = Entitlement.fromJson(
            responseData['entitlement'] as Map<String, dynamic>,
          );
          _purchaseStatus = PurchaseStatus.success;
          notifyListeners();
          return true;
        }
      }

      _lastErrorMessage = (responseData?['message'] as String?) ??
          'Backend verification failed (HTTP ${response.statusCode}).';
      _purchaseStatus = PurchaseStatus.failed;
      notifyListeners();
      return false;
    } catch (e) {
      debugPrint('[SubscriptionService] Backend verification exception: $e');
      _lastErrorMessage = 'Network error while contacting verification server: $e';
      _purchaseStatus = PurchaseStatus.failed;
      notifyListeners();
      return false;
    } finally {
      _isVerifyingPurchase = false;
    }
  }

  /// Reset status back to idle
  void resetPurchaseStatus() {
    _purchaseStatus = PurchaseStatus.idle;
    _lastErrorMessage = null;
    notifyListeners();
  }
}
