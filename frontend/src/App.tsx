import { Navigate, Route, Routes } from "react-router-dom";

import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import AIHub from "./pages/AIHub";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Staff from "./pages/Staff";

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/ai-hub" element={<AIHub />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
