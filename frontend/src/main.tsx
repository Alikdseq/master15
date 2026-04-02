import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CssBaseline, ThemeProvider } from "@mui/material";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./app/AuthContext";
import { mpTheme } from "./app/theme";
import { CrmRealtimeProvider } from "./realtime/CrmRealtimeContext";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={mpTheme}>
      <CssBaseline />
      <AuthProvider>
        <CrmRealtimeProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </CrmRealtimeProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
)
