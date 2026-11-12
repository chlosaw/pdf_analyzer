import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentChatRedirect } from './pages/DocumentChatRedirect';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

// pdf.js is large; only load it when a chat (with the viewer) is opened.
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="documents/:id" element={<DocumentChatRedirect />} />
        <Route
          path="chats/:id"
          element={
            <Suspense fallback={null}>
              <ChatPage />
            </Suspense>
          }
        />
        <Route
          path="admin"
          element={
            <RequireRole role="ADMIN">
              <Suspense fallback={null}>
                <AdminPage />
              </Suspense>
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
