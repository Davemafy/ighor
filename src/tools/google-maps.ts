import { z } from "zod";
import { readResponseText } from "./response-body";

const Place = z.object({
  id: z.string().min(1),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  googleMapsUri: z.string().url().optional(),
  websiteUri: z.string().url().optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
});

export type GooglePlace = {
  id: string;
  name: string;
  address: string;
  url: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
};
export type PlacesResult =
  | { status: "ok"; places: GooglePlace[]; requests: 1 }
  | { status: "blocked" | "error"; places: []; requests: number; warning: string };

/** Real Places (New) adapter. No fabricated locations or browser-visible key. */
export class GooglePlacesProvider {
  constructor(private readonly key: string, private readonly transport: typeof fetch = fetch) {}

  async search(text: string): Promise<PlacesResult> {
    const query = z.string().trim().min(3).max(200).parse(text);
    if (!this.key) {
      return { status: "blocked", places: [], requests: 0, warning: "Google Maps API key is not configured." };
    }
    try {
      const response = await this.transport("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.key,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location",
        },
        body: JSON.stringify({ textQuery: query, pageSize: 5, languageCode: "en" }),
      });
      if (!response.ok) {
        return { status: "error", places: [], requests: 1, warning: "Google Places rejected the search." };
      }
      const parsed = z.object({ places: z.array(Place).max(5).default([]) })
        .parse(JSON.parse(await readResponseText(response, 100_000)));
      return {
        status: "ok", requests: 1,
        places: parsed.places.map((place) => ({
          id: place.id,
          name: place.displayName?.text ?? place.id,
          address: place.formattedAddress ?? "",
          url: place.googleMapsUri ?? null,
          website: place.websiteUri ?? null,
          latitude: place.location?.latitude ?? null,
          longitude: place.location?.longitude ?? null,
        })),
      };
    } catch {
      return { status: "error", places: [], requests: 1, warning: "Google Places response was unavailable or invalid." };
    }
  }
}

export function runtimePlacesProvider() {
  return new GooglePlacesProvider(process.env.GOOGLE_MAPS_API_KEY ?? "");
}
