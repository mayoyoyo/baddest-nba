import { useState, type FormEvent, type ReactNode } from "react";

interface AuthFormProps {
  error?: string | null;
  footer: ReactNode;
  heading: string;
  pending?: boolean;
  submitLabel: string;
  onSubmit: (input: { username: string; pin: string }) => Promise<void>;
}

export default function AuthForm({
  error,
  footer,
  heading,
  pending = false,
  submitLabel,
  onSubmit,
}: AuthFormProps) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({ username, pin });
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Baddest in the game</p>
        <h1>{heading}</h1>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Username</span>
            <input
              autoCapitalize="none"
              autoComplete="username"
              disabled={pending}
              inputMode="text"
              maxLength={24}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="username"
              required
              value={username}
            />
          </label>
          <label className="auth-field">
            <span>4 digit passcode</span>
            <input
              autoComplete="current-password"
              disabled={pending}
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              pattern="\d{4}"
              placeholder="1234"
              required
              type="password"
              value={pin}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button" disabled={pending} type="submit">
            {pending ? "Working..." : submitLabel}
          </button>
        </form>
        <div className="auth-footer">{footer}</div>
      </section>
    </main>
  );
}
