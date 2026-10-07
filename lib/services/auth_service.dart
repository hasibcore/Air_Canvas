// ==============================================================================
// lib/services/auth_service.dart
// Authentication Service for AIRCanvas (Supabase Auth / JWT)
// ==============================================================================

import 'package:flutter/foundation.dart';

class AuthUser {
  final String id;
  final String email;
  final String name;

  const AuthUser({
    required this.id,
    required this.email,
    required this.name,
  });
}

class AuthService extends ChangeNotifier {
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  AuthUser? _currentUser = const AuthUser(
    id: 'user_dev_001',
    email: 'creator@aircanvas.app',
    name: 'AirCanvas Artist',
  );

  String? _authToken;

  AuthUser? get currentUser => _currentUser;
  bool get isAuthenticated => _currentUser != null;
  String? get authToken => _authToken;

  void setUser(AuthUser? user, {String? token}) {
    _currentUser = user;
    _authToken = token;
    notifyListeners();
  }

  void signOut() {
    _currentUser = null;
    _authToken = null;
    notifyListeners();
  }
}
