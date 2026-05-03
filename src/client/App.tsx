import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./routes/LoginPage";
import AdminUploadPage from "./routes/AdminUploadPage";
import PeoplePage from "./routes/PeoplePage";
import SignupPage from "./routes/SignupPage";
import SharedLeaderboardPage from "./routes/SharedLeaderboardPage";
import UserLeaderboardPage from "./routes/UserLeaderboardPage";
import VotePage from "./routes/VotePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Navigate replace to="/vote" />} path="/" />
        <Route element={<LoginPage />} path="/login" />
        <Route element={<SignupPage />} path="/signup" />
        <Route element={<VotePage />} path="/vote" />
        <Route element={<SharedLeaderboardPage />} path="/leaderboard" />
        <Route element={<PeoplePage />} path="/people" />
        <Route element={<AdminUploadPage />} path="/admin/upload" />
        <Route element={<UserLeaderboardPage />} path="/users/:username" />
      </Routes>
    </BrowserRouter>
  );
}
