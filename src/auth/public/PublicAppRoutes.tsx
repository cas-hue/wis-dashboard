import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { DashboardPage } from "@/pages/DashboardPage";

function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
            W
          </div>
          <span className="font-semibold text-sm">WorkinSociety</span>
        </div>
        <span className="text-muted-foreground text-xs ml-2">
          Recruitment Dashboard
        </span>
      </header>
      <main className="p-4 lg:p-8 max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}

export function PublicAppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
