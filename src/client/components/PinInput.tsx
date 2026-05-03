import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { cn } from "@/lib/cn";

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
}

export interface PinInputHandle {
  focus: () => void;
  clear: () => void;
}

// Apple/Google-style OTP input: N square boxes side-by-side. Auto-
// advance, backspace-back, paste-fills-all. Numeric-only.
export const PinInput = forwardRef<PinInputHandle, PinInputProps>(
  function PinInput(
    {
      value,
      onChange,
      onComplete,
      length = 4,
      autoFocus,
      disabled,
      ariaLabel = "PIN",
      id,
    },
    ref,
  ) {
    const refs = useRef<Array<HTMLInputElement | null>>([]);
    const digits = padDigits(value, length);

    useImperativeHandle(ref, () => ({
      focus: () => refs.current[0]?.focus(),
      clear: () => onChange(""),
    }));

    useEffect(() => {
      if (autoFocus) {
        refs.current[0]?.focus();
      }
    }, [autoFocus]);

    const setDigit = useCallback(
      (index: number, digit: string) => {
        const next = digits.slice();
        next[index] = digit;
        const joined = next.join("").replace(/[^0-9]/g, "");
        onChange(joined);
        if (joined.length === length) {
          onComplete?.(joined);
        }
      },
      [digits, length, onChange, onComplete],
    );

    function focusBox(index: number) {
      const target = refs.current[Math.max(0, Math.min(length - 1, index))];
      target?.focus();
      target?.select();
    }

    function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
      const raw = event.target.value;
      // Browsers / autofill can drop the entire PIN into one box. Detect
      // that and distribute across boxes.
      const numeric = raw.replace(/\D/g, "");
      if (!numeric) {
        setDigit(index, "");
        return;
      }
      if (numeric.length === 1) {
        setDigit(index, numeric);
        focusBox(index + 1);
        return;
      }
      // Multi-char input: spread starting at the current box.
      const next = digits.slice();
      let cursor = index;
      for (const char of numeric) {
        if (cursor >= length) break;
        next[cursor] = char;
        cursor += 1;
      }
      const joined = next.join("");
      onChange(joined);
      focusBox(Math.min(length - 1, cursor));
      if (joined.length === length) {
        onComplete?.(joined);
      }
    }

    function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
      if (event.key === "Backspace") {
        if (digits[index]) {
          // Clear the current box; stay focused so user can retype.
          event.preventDefault();
          setDigit(index, "");
          return;
        }
        // Empty box → step back and clear the previous one.
        event.preventDefault();
        focusBox(index - 1);
        setDigit(index - 1, "");
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusBox(index - 1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusBox(index + 1);
        return;
      }
    }

    function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
      const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
      if (!pasted) return;
      event.preventDefault();
      const next = pasted.slice(0, length).padEnd(length, "").slice(0, length);
      // padEnd with "" doesn't grow; keep what we have on the right.
      const merged = pasted.slice(0, length);
      onChange(merged);
      focusBox(Math.min(length - 1, merged.length));
      if (merged.length === length) {
        onComplete?.(merged);
      }
      void next; // satisfy unused-var linter
    }

    return (
      <fieldset
        className="flex justify-center gap-2"
        aria-label={ariaLabel}
        disabled={disabled}
      >
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={index === 0 ? id : undefined}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={digits[index]}
            onChange={(e) => handleChange(index, e)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={`${ariaLabel} digit ${index + 1}`}
            className={cn(
              "size-14 rounded-xl border-2 border-input bg-background text-center text-2xl font-semibold tracking-tight",
              "outline-none transition-colors",
              "focus:border-primary focus:ring-2 focus:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
        ))}
      </fieldset>
    );
  },
);

function padDigits(value: string, length: number): string[] {
  const numeric = value.replace(/\D/g, "").slice(0, length);
  return Array.from({ length }, (_, i) => numeric[i] ?? "");
}
