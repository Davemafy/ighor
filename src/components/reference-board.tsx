"use client";

import { useState } from "react";
import Image from "next/image";
import type { Task } from "@/core/contracts";

export function ReferenceBoard({ items }: { items: Task["candidates"] }) {
  return (
    <ol className="reference-board">
      {items.map((item, i) => (
        <Reference key={item.id} item={item} number={i + 1} />
      ))}
    </ol>
  );
}

function Reference({
  item,
  number,
}: {
  item: Task["candidates"][number];
  number: number;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <li>
      {item.imageUrl && !broken ? (
        <Image
          src={item.imageUrl}
          width={420}
          height={280}
          alt={`Provider image for ${item.name}`}
          unoptimized
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="reference-placeholder">{item.type}</div>
      )}
      <span className="reference-number">
        {String(number).padStart(2, "0")}
      </span>
      <h5>{item.name}</h5>
      <p>{item.description}</p>
      <p className="micro">
        {item.eligibility} ·{" "}
        {item.sample
          ? "illustrative reference"
          : item.cultural
            ? "provider-returned reference"
            : "user-supplied reference"}
      </p>
      {item.missing.length > 0 && (
        <p className="micro">Missing: {item.missing.join(", ")}</p>
      )}
    </li>
  );
}
