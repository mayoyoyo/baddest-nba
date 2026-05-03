import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "./api";
import { clearCurrentUser } from "./session";

export function useAppLogout(): () => Promise<void> {
  const navigate = useNavigate();

  return useCallback(async () => {
    await logout();
    clearCurrentUser();
    navigate("/login", { replace: true });
  }, [navigate]);
}
