import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { installPointerLayer } from "./interaction.js";

installPointerLayer();

createRoot(document.getElementById("root")).render(<App />);
