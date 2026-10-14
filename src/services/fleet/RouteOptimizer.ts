import type { BinSummary, RouteStop, GeoLocation } from '@/types';
import { haversineDistance } from '@/lib/calculations';

/**
 * Heuristic-based route optimization engine.
 * Ranks bins by fill level and geographical proximity using a greedy nearest-neighbor approach.
 */
export class RouteOptimizer {
  /**
   * Generates an optimized sequence of stops for a given truck capacity.
   */
  static generateOptimizedRoute(
    availableBins: BinSummary[],
    startLocation: GeoLocation,
    truckCapacityLiters: number,
    thresholdPct: number = 75
  ): { stops: RouteStop[]; totalKm: number; estVolumeLiters: number } {
    // 1. Filter bins that actually need collection
    const targetBins = availableBins.filter(b => b.fillPct >= thresholdPct || b.binStatus === 'Full');
    
    if (targetBins.length === 0) return { stops: [], totalKm: 0, estVolumeLiters: 0 };

    const unvisited = [...targetBins];
    const stops: RouteStop[] = [];
    let currentLocation = startLocation;
    let totalKm = 0;
    let currentVolume = 0;

    // 2. Greedy Nearest Neighbor with Priority Weighting
    while (unvisited.length > 0 && currentVolume < truckCapacityLiters) {
      let bestIndex = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const bin = unvisited[i];
        const distKm = haversineDistance(currentLocation.lat, currentLocation.lng, bin.location.lat, bin.location.lng);
        
        // Prevent division by zero and extreme distance penalties
        const safeDist = Math.max(distKm, 0.1); 
        
        // Score = (Fill Level / Distance) * Health Penalty
        // High fill and short distance yields highest score. Faulty sensors get slightly higher priority.
        const healthMultiplier = bin.healthScore !== null && bin.healthScore < 80 ? 1.2 : 1.0;
        const score = (bin.fillPct / safeDist) * healthMultiplier;

        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      if (bestIndex === -1) break;

      const selected = unvisited[bestIndex];
      const dist = haversineDistance(currentLocation.lat, currentLocation.lng, selected.location.lat, selected.location.lng);
      
      // Calculate estimated volume (Capacity of standard bin is ~240L, but we'll use a constant for now or use bin.meta if available)
      // Assuming a standard 240L bin for the summaries that don't have capacity mapped directly.
      const binVolume = 240 * (selected.fillPct / 100);

      // Stop if adding this bin exceeds truck capacity (allow slight overflow)
      if (currentVolume + binVolume > truckCapacityLiters * 1.1) {
        break;
      }

      totalKm += dist;
      currentVolume += binVolume;
      currentLocation = selected.location;

      stops.push({
        binId: selected.id,
        binLabel: selected.label,
        location: selected.location,
        fillPct: selected.fillPct,
        order: stops.length + 1,
        collected: false
      });

      unvisited.splice(bestIndex, 1);
    }

    // Add return trip to depot if we assume depot is startLocation
    totalKm += haversineDistance(currentLocation.lat, currentLocation.lng, startLocation.lat, startLocation.lng);

    return {
      stops,
      totalKm: Math.round(totalKm * 10) / 10,
      estVolumeLiters: Math.round(currentVolume)
    };
  }
}
