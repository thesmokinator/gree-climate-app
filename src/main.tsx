import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import "@mantine/core/styles.css";
import App from "./App";
import { LangProvider } from "./i18n";
import "./App.css";

const theme = createTheme({
  primaryColor: "teal",
  defaultRadius: "md",
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <LangProvider>
        <App />
      </LangProvider>
    </MantineProvider>
  </React.StrictMode>,
);
