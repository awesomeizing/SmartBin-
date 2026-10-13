/**
 * SmartBin+ — DEPRECATED
 * =============================================================================
 * Single-bin LED/buzzer/OLED handling lived here. The 4-bin build replaced it
 * with bins.h, which drives four LEDs, four multiplexed OLEDs and the shared
 * buzzer on GPIO 13.
 *
 * This file is intentionally empty. It is not included by the sketch.
 * See bins.h: updateLeds(), updateBuzzer(), updateDisplays().
 */
#ifndef SMARTBIN_INDICATORS_H
#define SMARTBIN_INDICATORS_H
#warning "indicators.h is deprecated — use bins.h (4-bin build)"
#endif
