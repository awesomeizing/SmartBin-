import { db, IS_DEMO_MODE } from '@/lib/firebase';
import { ref, update, set } from 'firebase/database';
import type { CollectionRoute, Truck, CollectionEvent } from '@/types';

/**
 * Handles operations related to trucks, routing assignments, and collections.
 */
export class FleetService {
  /**
   * Dispatches a truck on a specific route.
   */
  static async dispatchRoute(truckId: string, route: CollectionRoute) {
    if (IS_DEMO_MODE) {
      console.log(`[Demo] Dispatched route ${route.id} to truck ${truckId}`);
      return;
    }

    const updates: Record<string, any> = {};
    
    // Save the route
    updates[`routes/${route.id}`] = route;
    
    // Update the truck's assignment
    updates[`trucks/${truckId}/status`] = 'en_route';
    updates[`trucks/${truckId}/activeRouteId`] = route.id;
    updates[`trucks/${truckId}/assignedRoute`] = route.stops.map(s => s.binId);
    
    await update(ref(db), updates);
  }

  /**
   * Marks a bin as collected by a specific truck.
   */
  static async recordCollectionEvent(truck: Truck, binId: string, binLabel: string, fillLevelBefore: number, wasteKg: number, zone: string) {
    const eventId = `col_${Date.now()}`;
    const event: CollectionEvent = {
      id: eventId,
      binId,
      binLabel,
      truckId: truck.id,
      truckLabel: truck.label,
      driverName: truck.driver?.name || 'Unknown',
      collectedAt: Date.now(),
      fillLevelBefore,
      fillLevelAfter: 0,
      wasteKg,
      zone
    };

    if (IS_DEMO_MODE) {
      console.log(`[Demo] Collection recorded:`, event);
      return event;
    }

    await set(ref(db, `collections/${eventId}`), event);
    
    // Update truck stats
    const truckRef = ref(db, `trucks/${truck.id}`);
    await update(truckRef, {
      todayCollections: truck.todayCollections + 1,
      currentLoadLiters: truck.currentLoadLiters + (wasteKg * 2), // approx density
      status: 'collecting'
    });
    
    return event;
  }
}
