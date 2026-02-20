import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { StaffKioskLogin } from "@/components/auth/StaffKioskLogin";
import { AdminLogin } from "@/components/auth/AdminLogin";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { StaffGongView } from "@/components/staff/StaffGongView";

const queryClient = new QueryClient();

function AppRoutes() {
  const { userType, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Confam Pay initializing…</p>
        </div>
      </div>
    );
  }

  if (userType === "boss") {
    return (
      <Routes>
        <Route path="/*" element={<AdminDashboard />} />
      </Routes>
    );
  }

  if (userType === "staff") {
    return (
      <Routes>
        <Route path="/*" element={<StaffGongView />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <StaffKioskLogin onSuccess={() => window.location.reload()} />
        }
      />
      <Route path="/admin-login" element={<AdminLogin />} />
      {/* legacy redirect */}
      <Route path="/boss-login" element={<Navigate to="/admin-login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner richColors position="top-center" />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
