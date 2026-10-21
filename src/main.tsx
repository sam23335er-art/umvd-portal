import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { ConfirmProvider } from "./components/ui";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import { ToastProvider } from "./context/ToastContext";
import { ApiError } from "./lib/api";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError) && count < 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <SettingsProvider>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </SettingsProvider>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
);
