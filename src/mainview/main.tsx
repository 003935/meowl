import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Toaster } from "@/components/ui/sonner";
import { api } from "@/lib/api";
import { installZoom } from "@/lib/zoom";

installZoom();

// Follow the system light/dark setting.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

// Send every https link to the system browser instead of navigating the app window.
document.addEventListener("click", (e) => {
	const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
	if (!a || !/^https:\/\//i.test(a.href)) return;
	e.preventDefault();
	api.openExternal(a.href);
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
		<Toaster position="bottom-right" />
	</StrictMode>,
);
