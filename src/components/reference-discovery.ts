export const referenceKinds = {
  movie: "Movies",
  tv_show: "TV shows",
  artist: "Music",
  place: "Places",
} as const;
export type ReferenceKind = keyof typeof referenceKinds;

/** A user-confirmed request, sent through the normal owned task/turn pipeline. */
export function referenceRequest(
  kind: ReferenceKind,
  taste: string,
  location: string,
) {
  const seed = taste.trim();
  const locality = location.trim();

  if (!Object.hasOwn(referenceKinds, kind)) {
    throw new Error("Choose what you want to find.");
  }

  if (!seed || seed.length > 100) {
    throw new Error("Add one reference, up to 100 characters.");
  }

  if (kind === "place" && (!locality || locality.length > 100)) {
    throw new Error("Add a city or neighborhood, up to 100 characters.");
  }

  const target = {
    movie: "movies",
    tv_show: "TV shows",
    artist: "artists and music",
    place: `places in ${locality}`,
  }[kind];

  return `Find ${target} based on my interest in ${seed}. Show the returned references so I can explore them and save the ones I like to a collection.`;
}
