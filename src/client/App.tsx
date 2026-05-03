import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LeaderboardPage from "@/routes/LeaderboardPage";
import LoginPage from "@/routes/LoginPage";
import MePage from "@/routes/MePage";
import SignupPage from "@/routes/SignupPage";
import VotePage from "@/routes/VotePage";
import type { ReactNode } from "react";

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  // Real users go home; guests stay so they can convert via signup form.
  if (user && user.role !== "guest") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<VotePage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/me" element={<MePage />} />
            <Route
              path="/login"
              element={
                <PublicOnly>
                  <LoginPage />
                </PublicOnly>
              }
            />
            <Route
              path="/signup"
              element={
                <PublicOnly>
                  <SignupPage />
                </PublicOnly>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
