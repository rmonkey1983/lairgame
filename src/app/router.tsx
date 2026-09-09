import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from '../pages/HomePage'
import NotFoundPage from '../pages/NotFoundPage'
import AdminGamePage from '../pages/admin/AdminGamePage'
import AdminGamesPage from '../pages/admin/AdminGamesPage'
import AdminLoginPage from '../pages/admin/AdminLoginPage'
import PlayerEntryPage from '../pages/player/PlayerEntryPage'
import PlayerShellPage from '../pages/player/PlayerShellPage'

export function AppRoutes() {
  return <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/play/:gameCode" element={<PlayerEntryPage />} />
    <Route path="/play/:gameCode/session" element={<PlayerShellPage />} />
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route path="/admin/games" element={<AdminGamesPage />} />
    <Route path="/admin/games/:gameCode" element={<AdminGamePage />} />
    <Route path="/admin" element={<Navigate to="/admin/games" replace />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
}
