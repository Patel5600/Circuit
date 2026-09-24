import { CircuitVenueAdapter, VenueId } from "./types";
import { CircuitNativeAdapter } from "./circuit-native";
import { MeteoraDbcAdapter } from "./meteora-dbc";
import { KaminoAdapter } from "./kamino";
import { JupiterAdapter } from "./jupiter";

export * from "./types";
export * from "./circuit-native";
export * from "./meteora-dbc";
export * from "./kamino";
export * from "./jupiter";

export const VENUE_REGISTRY: Record<VenueId, CircuitVenueAdapter> = {
  "circuit-native": new CircuitNativeAdapter(),
  "meteora-dbc": new MeteoraDbcAdapter(),
  "kamino": new KaminoAdapter(),
  "jupiter": new JupiterAdapter(),
};

export function getVenueAdapter(id: VenueId): CircuitVenueAdapter {
  const adapter = VENUE_REGISTRY[id];
  if (!adapter) {
    throw new Error(`Unknown venue adapter: ${id}`);
  }
  return adapter;
}

export function listAllVenues(): CircuitVenueAdapter[] {
  return Object.values(VENUE_REGISTRY);
}
