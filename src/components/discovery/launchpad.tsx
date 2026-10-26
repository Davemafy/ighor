import { ArrowDownLeft, ArrowUpRight, Film, Music2, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { TaskAction } from "@/core/contracts";

export function DiscoveryLaunchpad({
  composer,
  onBegin,
  disabled,
}: {
  composer: ReactNode;
  onBegin: (action: TaskAction) => void;
  disabled: boolean;
}) {
  return (
    <div className="ig-launchpad">
      <div className="ig-invitation">
        <div className="ig-eyebrow">
          <span className="ig-small-orbit" aria-hidden="true" /> FOLLOW YOUR
          CURIOSITY
        </div>
        <h1>
          A world beyond
          <br />
          your <span>usual.</span>
          <span className="ig-title-asterisk" aria-hidden="true">
            ✳
          </span>
        </h1>
        <p className="ig-invitation-copy">
          The music you love. The places you haven’t met.
          <br className="ig-desktop-break" /> Let’s see where one thing takes
          you.
        </p>
        {composer}
        <div className="ig-start-note">
          <ArrowDownLeft size={17} />
          <span>Or take a little detour.</span>
        </div>
        <div className="ig-quick-starts">
          <button
            disabled={disabled}
            type="button"
            onClick={() =>
              onBegin({
                type: "personal-profile",
                name: "You",
                artist: "Massive Attack",
              })
            }
          >
            <Music2 size={15} /> Try a Massive Attack starting point{" "}
            <ArrowUpRight size={14} />
          </button>
          <button
            disabled={disabled}
            type="button"
            onClick={() => onBegin({ type: "sample" })}
          >
            <Users size={15} /> Find common ground <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
      <div className="ig-detours" aria-label="Choose a starting point">
        <button
          className="ig-city-story"
          type="button"
          onClick={() => onBegin({ type: "place-example", city: "Chicago" })}
          disabled={disabled}
        >
          <span className="ig-story-photo" aria-hidden="true" />
          <span className="ig-story-label">
            <span className="ig-story-dot" /> A DIFFERENT WAY IN
          </span>
          <span className="ig-city-title">
            Same city.
            <br />
            <em>Different frequency.</em>
          </span>
          <span className="ig-city-caption">
            Chicago through a Radiohead sample taste.
          </span>
          <span className="ig-story-button">
            Take the detour <ArrowUpRight size={17} />
          </span>
          <span className="ig-story-index" aria-hidden="true">
            01 / 03
          </span>
        </button>
        <div className="ig-small-stories">
          <button
            type="button"
            className="ig-sound-story"
            onClick={() =>
              onBegin({
                type: "personal-profile",
                name: "You",
                artist: "Laufey",
              })
            }
            disabled={disabled}
          >
            <span className="ig-vinyl" aria-hidden="true">
              <i />
              <b>ig</b>
            </span>
            <span className="ig-small-story-copy">
              <span>
                <Music2 size={13} /> A SOUND TO FOLLOW
              </span>
              <strong>
                Love Laufey?
                <br />
                Go a little further.
              </strong>
            </span>
            <ArrowUpRight className="ig-small-story-arrow" size={19} />
          </button>
          <button
            type="button"
            className="ig-film-story"
            onClick={() =>
              onBegin({
                type: "message",
                text: "I love Radiohead and Spirited Away. Discover film references connected to these tastes.",
              })
            }
            disabled={disabled}
          >
            <span className="ig-film-art" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="ig-small-story-copy">
              <span>
                <Film size={13} /> CROSS THE DOTS
              </span>
              <strong>
                Your music taste.
                <br />A film you’d never pick.
              </strong>
            </span>
            <ArrowUpRight className="ig-small-story-arrow" size={19} />
          </button>
        </div>
        <div className="ig-detour-caption">
          <span className="ig-handwritten">One thing leads to another.</span>
          <span>Music. Film. Places. People.</span>
        </div>
      </div>
    </div>
  );
}
