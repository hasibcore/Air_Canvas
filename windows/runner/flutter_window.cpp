// ==============================================================================
// windows/runner/flutter_window.cpp
// AirCanvas Windows Native Runner & High-Precision Synthetic Pointer Injector
// Fixes: MOUSEEVENTF_MOVE Flag Inclusion on Down & Up (Prevents Streak Artifacts)
// ==============================================================================

#include <windows.h>
#include <iostream>
#include <cmath>

#define MOUSEEVENTF_VIRTUALDESKTOP 0x4000

namespace AirCanvasWindows {

void InjectMousePointer(int type, int buttons, double normX, double normY, int screenW, int screenH) {
    INPUT input = {0};
    input.type = INPUT_MOUSE;

    // Map strictly to virtual desktop range (0..65535)
    int targetX = static_cast<int>(std::round(normX * (screenW - 1)));
    int targetY = static_cast<int>(std::round(normY * (screenH - 1)));

    int absX = static_cast<int>(std::round((static_cast<double>(targetX) * 65535.0) / std::max(1, screenW - 1)));
    int absY = static_cast<int>(std::round((static_cast<double>(targetY) * 65535.0) / std::max(1, screenH - 1)));

    input.mi.dx = absX;
    input.mi.dy = absY;

    // CRITICAL FIX: MOUSEEVENTF_MOVE is ALWAYS combined with MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESKTOP
    // during type == 0 (Down) and type == 2 (Up) so cursor is guaranteed to move to (dx, dy) BEFORE
    // pressing or releasing the mouse button, eliminating streak artifacts from stale cursor coordinates.
    input.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESKTOP;

    if (type == 0) {
        // Pointer Down
        input.mi.dwFlags |= (buttons & 2) ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
    } else if (type == 2 || type == 3) {
        // Pointer Up or Cancel
        input.mi.dwFlags |= (buttons & 2) ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
    }

    SendInput(1, &input, sizeof(INPUT));
}

} // namespace AirCanvasWindows
