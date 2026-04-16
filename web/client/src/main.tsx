import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/** One-time migration from legacy hash routes (`#/map`) to History API paths (`/map`). */
{
  const { hash, pathname, search } = window.location;
  if (hash.startsWith("#/")) {
    const target = hash.slice(1);
    if (target.startsWith("/") && pathname + search !== target) {
      history.replaceState(null, "", target);
    }
  }
}

createRoot(document.getElementById("root")!).render(<App />);
