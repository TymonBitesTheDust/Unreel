/**
 * Google Maps Platform web services: Places (search) and Routes (driving route + ETA).
 *
 * The key comes from EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (see README). Without one, search falls back
 * to the phone's own geocoder and no route line is drawn; handing off to Google Maps or Waze still
 * works, because those apps do their own routing.
 */
import * as Location from 'expo-location';

import { decodePolyline, type LatLng } from './geo';

export const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
export const hasGoogleKey = GOOGLE_API_KEY.length > 0;

export type Place = LatLng & { name: string; address?: string };
export type Suggestion = { id: string; title: string; subtitle?: string; place?: Place };

export type Route = {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
};

async function google<T>(url: string, init: RequestInit & { fieldMask: string }): Promise<T> {
  const { fieldMask, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': fieldMask,
      ...headers,
    },
  });
  if (!res.ok) {
    let message = `Google error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {}
    throw new Error(message);
  }
  return (await res.json()) as T;
}

/** Place suggestions as the user types (Places API (New) Autocomplete). */
export async function autocomplete(
  input: string,
  near: LatLng | null,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  type Response = {
    suggestions?: {
      placePrediction?: {
        placeId: string;
        text?: { text: string };
        structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
      };
    }[];
  };
  const body: Record<string, unknown> = { input, sessionToken };
  if (near) {
    body.locationBias = { circle: { center: { latitude: near.latitude, longitude: near.longitude }, radius: 50_000 } };
    body.origin = { latitude: near.latitude, longitude: near.longitude };
  }
  const data = await google<Response>('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    body: JSON.stringify(body),
    fieldMask:
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
    signal,
  });
  return (data.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    if (!p) return [];
    return [
      {
        id: p.placeId,
        title: p.structuredFormat?.mainText?.text ?? p.text?.text ?? 'Place',
        subtitle: p.structuredFormat?.secondaryText?.text,
      },
    ];
  });
}

export async function placeDetails(placeId: string, sessionToken: string): Promise<Place> {
  type Response = {
    location?: { latitude: number; longitude: number };
    displayName?: { text: string };
    formattedAddress?: string;
  };
  const data = await google<Response>(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
    { method: 'GET', fieldMask: 'location,displayName,formattedAddress' },
  );
  if (!data.location) throw new Error('That place has no location');
  return {
    latitude: data.location.latitude,
    longitude: data.location.longitude,
    name: data.displayName?.text ?? data.formattedAddress ?? 'Destination',
    address: data.formattedAddress,
  };
}

/** Search without a Google key: the phone's geocoder (Google on Android, Apple on iOS). */
export async function geocode(query: string): Promise<Suggestion[]> {
  const results = await Location.geocodeAsync(query);
  return Promise.all(
    results.slice(0, 5).map(async (r, i) => {
      let subtitle: string | undefined;
      try {
        const [a] = await Location.reverseGeocodeAsync(r);
        if (a)
          subtitle = [a.street && [a.streetNumber, a.street].filter(Boolean).join(' '), a.city, a.country]
            .filter(Boolean)
            .join(', ');
      } catch {}
      return {
        id: `geo-${i}`,
        title: query,
        subtitle,
        place: { latitude: r.latitude, longitude: r.longitude, name: query, address: subtitle },
      };
    }),
  );
}

/** A name for a long-pressed point on the map. */
export async function describePoint(point: LatLng): Promise<Place> {
  try {
    const [a] = await Location.reverseGeocodeAsync(point);
    if (a) {
      const street = [a.street, a.streetNumber].filter(Boolean).join(' ');
      return {
        ...point,
        name: a.name || street || a.city || 'Dropped pin',
        address: [street, a.city].filter(Boolean).join(', ') || undefined,
      };
    }
  } catch {}
  return { ...point, name: 'Dropped pin' };
}

/** A traffic-aware driving route (Routes API). */
export async function computeRoute(origin: LatLng, destination: LatLng): Promise<Route> {
  type Response = {
    routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
  };
  const latLng = (p: LatLng) => ({ location: { latLng: { latitude: p.latitude, longitude: p.longitude } } });
  const data = await google<Response>('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    body: JSON.stringify({
      origin: latLng(origin),
      destination: latLng(destination),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      polylineEncoding: 'ENCODED_POLYLINE',
    }),
    fieldMask: 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
  });
  const route = data.routes?.[0];
  if (!route?.polyline?.encodedPolyline) throw new Error('No driving route found');
  return {
    coordinates: decodePolyline(route.polyline.encodedPolyline),
    distanceMeters: route.distanceMeters ?? 0,
    durationSeconds: parseInt(route.duration ?? '0', 10) || 0,
  };
}
