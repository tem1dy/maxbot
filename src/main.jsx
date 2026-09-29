import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MaxUI } from "@maxhub/max-ui";
import "@maxhub/max-ui/dist/styles.css";
import "./styles.css";
import App from "./App.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext.jsx";

function AppShell() {
  const { theme } = useTheme();
  return <BrowserRouter><MaxUI colorScheme={theme}><AuthProvider><App /></AuthProvider></MaxUI></BrowserRouter>;
}

createRoot(document.getElementById("root")).render(
  <ThemeProvider><AppShell /></ThemeProvider>,
);
