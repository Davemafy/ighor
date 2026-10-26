import { ArrowUp, LoaderCircle } from "lucide-react";
import { useId, type RefObject } from "react";

export function DiscoveryComposer({
  value,
  onChange,
  onSubmit,
  inputRef,
  disabled,
  busy,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  busy: boolean;
  compact?: boolean;
}) {
  const id = useId();

  return (
    <form
      className={`ig-composer ${compact ? "ig-composer-compact" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();

        if (value.trim() && !disabled) {
          onSubmit();
        }
      }}
    >
      <label className="ig-sr-only" htmlFor={id}>
        {compact ? "Message Igor" : "What would you like to explore?"}
      </label>
      <textarea
        ref={inputRef}
        id={id}
        rows={compact ? 1 : 2}
        maxLength={3000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          compact
            ? "Ask, explore or change direction..."
            : "Tell me what you love. Or what you have in mind..."
        }
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();

            if (value.trim() && !disabled) {
              onSubmit();
            }
          }
        }}
      />
      <div className="ig-composer-bottom">
        <span>
          {compact
            ? "Continue in your own words"
            : "Your taste is a starting point, not a box."}
        </span>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label={compact ? "Send message" : "Start exploring"}
        >
          {busy ? (
            <LoaderCircle className="ig-spin" size={20} />
          ) : (
            <ArrowUp size={23} />
          )}
        </button>
      </div>
    </form>
  );
}
