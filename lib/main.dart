import 'package:flutter/material.dart';

void main() {
  runApp(const AirCanvasApp());
}

class AirCanvasApp extends StatelessWidget {
  const AirCanvasApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'Air Canvas',
      home: Scaffold(
        body: Center(
          child: Text('Air Canvas Active'),
        ),
      ),
    );
  }
}
