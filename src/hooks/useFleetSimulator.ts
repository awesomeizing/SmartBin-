import { useEffect, useRef } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { haversineDistance } from '@/lib/calculations';
import { FleetService } from '@/services/fleet/FleetService';

const SIMULATION_INTERVAL = 3000; // Move every 3 seconds
const TRUCK_SPEED_KMH = 40; // 40 km/h simulation speed

export function useFleetSimulator(enabled: boolean = true) {
  const { trucks, routes, config, updateBin, updateTruck, updateRoute } = useDatabase();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!enabled || !config.simulationMode || trucks.length === 0) return;

    timerRef.current = setInterval(async () => {
      const now = Date.now();
      const elapsedHours = (now - lastUpdateRef.current) / (1000 * 60 * 60);
      lastUpdateRef.current = now;

      // Distance the truck can move in this tick
      const maxDistanceKm = TRUCK_SPEED_KMH * elapsedHours;

      for (const truck of trucks) {
        if (!truck.activeRouteId || truck.status === 'idle' || truck.status === 'maintenance') continue;

        const route = routes.find(r => r.id === truck.activeRouteId);
        if (!route || route.status === 'completed') continue;

        // Find next pending stop
        const pendingStopIndex = route.stops.findIndex((s: any) => !s.collected);
        
        if (pendingStopIndex === -1) {
          // Route completed
          console.log(`[Simulator] Truck ${truck.label} completed its route.`);
          // In a real app we'd update Firebase. For local state, we'll just log.
          continue;
        }

        const targetStop = route.stops[pendingStopIndex];
        const distToTarget = haversineDistance(truck.position.lat, truck.position.lng, targetStop.location.lat, targetStop.location.lng);

        if (distToTarget <= Math.max(maxDistanceKm, 0.05)) {
          // Reached target
          console.log(`[Simulator] Truck ${truck.label} reached ${targetStop.binLabel}. Collecting...`);
          
          // Trigger collection event
          await FleetService.recordCollectionEvent(
            truck, 
            targetStop.binId, 
            targetStop.binLabel, 
            targetStop.fillPct, 
            targetStop.fillPct * 1.5, // approx weight
            'Simulation Zone'
          );

          // Update local bin fill level to 0 immediately for visual feedback
          updateBin(targetStop.binId, {
            live: { fillPct: 0, binStatus: 'Empty' } as any
          });

          // Mark stop as collected
          const updatedStops = [...route.stops];
          updatedStops[pendingStopIndex].collected = true;
          
          updateRoute(route.id, { stops: updatedStops });

        } else {
          // Move truck towards target
          const ratio = maxDistanceKm / distToTarget;
          const newLat = truck.position.lat + (targetStop.location.lat - truck.position.lat) * ratio;
          const newLng = truck.position.lng + (targetStop.location.lng - truck.position.lng) * ratio;
          
          updateTruck(truck.id, { position: { lat: newLat, lng: newLng } });
        }
      }
    }, SIMULATION_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, config.simulationMode, trucks, routes, updateBin, updateRoute, updateTruck]);
}
