import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthForm from "../components/AuthForm";
import { ApiError, login } from "../lib/api";
import { loadCurrentUser, setCurrentUser } from "../lib/session";

export default function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    loadCurrentUser()
      .then((user) => {
        if (active && user) {
          navigate("/vote", { replace: true });
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(input: { username: string; pin: string }) {
    setPending(true);
    setError(null);

    try {
      const response = await login(input);
      setCurrentUser(response.user);
      navigate("/vote", { replace: true });
    } catch (nextError) {
      setError(
        nextError instanceof ApiError ? nextError.message : "Unable to sign in",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthForm
      error={error}
      footer={
        <p>
          <Link to="/signup">Create account</Link>
        </p>
      }
      heading="Sign in"
      onSubmit={handleSubmit}
      pending={pending}
      submitLabel="Sign in"
    />
  );
}
