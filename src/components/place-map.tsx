"use client";

import { useState } from "react";
import type { Task } from "@/core/contracts";

export function PlaceMap({
  task,
  onConnect,
}: {
  task: Task;
  onConnect?: (id: string) => void;
}) {
  const [focused, setFocused] = useState("");
  const points = task.candidates.filter(
    (candidate) =>
      candidate.type === "place" &&
      candidate.place?.latitude !== null &&
      candidate.place?.latitude !== undefined &&
      candidate.place.longitude !== null,
  );

  if (!points.length) {
    return null;
  }

  const lats = points.map((candidate) => candidate.place!.latitude!);
  const lons = points.map((candidate) => candidate.place!.longitude!);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const position = (lat: number, lon: number) => ({
    x: 28 + ((lon - minLon) / (maxLon - minLon || 0.01)) * 544,
    y: 28 + ((maxLat - lat) / (maxLat - minLat || 0.01)) * 264,
  });
  const selected =
    points.find((candidate) => candidate.id === focused) ?? points[0];

  return (
    <section className="place-map">
      <h3>A geographic overview</h3>
      <p className="helper">
        Provider-recorded coordinates, drawn to a shared scale. This is not
        street navigation: routes, travel times, current hours, tickets and
        availability have not been verified.
      </p>
      <svg
        viewBox="0 0 600 320"
        role="img"
        aria-label="Geographic overview of the returned places; use the numbered buttons below to select a place"
      >
        <rect x="0" y="0" width="600" height="320" fill="#eee9df" />
        {points.map((candidate, i) => {
          const point = position(
            candidate.place!.latitude!,
            candidate.place!.longitude!,
          );

          return (
            <g key={candidate.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={candidate.id === selected.id ? 15 : 11}
                fill={candidate.id === selected.id ? "#a84d24" : "#665d50"}
              />
              <text
                x={point.x}
                y={point.y + 4}
                fill="white"
                textAnchor="middle"
                fontSize="10"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-points" aria-label="Choose a mapped place">
        {points.map((candidate, i) => (
          <button
            key={candidate.id}
            aria-pressed={selected.id === candidate.id}
            onClick={() => setFocused(candidate.id)}
          >
            {i + 1}. {candidate.name}
          </button>
        ))}
      </div>
      <h4>{selected.name}</h4>
      <p>{selected.place!.address}</p>
      <p className="micro">
        Matched locality: {selected.place!.locality?.name} ·{" "}
        {selected.place!.locality?.disambiguation}. This may represent a region
        or metro rather than a city boundary.
      </p>
      <p className="micro">
        {selected.place!.latitude}, {selected.place!.longitude} ·{" "}
        {selected.freshness}
      </p>
      {onConnect && (
        <button
          className="secondary-button"
          onClick={() => onConnect(selected.id)}
        >
          Explore artists connected to this place
        </button>
      )}
      <div className="outcome-actions">
        <a
          href={`https://www.openstreetmap.org/?mlat=${selected.place!.latitude}&mlon=${selected.place!.longitude}#map=15/${selected.place!.latitude}/${selected.place!.longitude}`}
          target="_blank"
          rel="noreferrer"
        >
          Open location in OpenStreetMap
        </a>
        {selected.place!.website && (
          <a href={selected.place!.website} target="_blank" rel="noreferrer">
            Provider-reported venue website
          </a>
        )}
      </div>
    </section>
  );
}
