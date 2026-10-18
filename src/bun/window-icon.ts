// Electrobun embeds the app icon in the .exe (so the taskbar shows it) and ships it
// as Resources/app.ico, but never puts it on the window itself, so the title bar
// shows a blank icon on Windows. (Its native setWindowIcon export is a no-op there.)
// Load the .ico and hand it to the window with WM_SETICON.
import fs from "node:fs";
import path from "node:path";
import { dlopen, FFIType, ptr } from "bun:ffi";
import type { BrowserWindow } from "electrobun/bun";
import { RESOURCES_FOLDER } from "electrobun/bun/paths";

const WM_SETICON = 0x80, ICON_SMALL = 0, ICON_BIG = 1;
const IMAGE_ICON = 1, LR_LOADFROMFILE = 0x10;
const SM_CXICON = 11, SM_CXSMICON = 49;

export function setWindowIcon(win: BrowserWindow) {
	if (process.platform !== "win32") return;
	const icon = path.join(RESOURCES_FOLDER, "app.ico");
	if (!fs.existsSync(icon)) return;

	const user32 = dlopen("user32.dll", {
		LoadImageW: { args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32], returns: FFIType.ptr },
		SendMessageW: { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr], returns: FFIType.ptr },
		GetSystemMetrics: { args: [FFIType.i32], returns: FFIType.i32 },
	}).symbols;
	const file = Buffer.from(icon + "\0", "utf16le");
	const load = (size: number) => user32.LoadImageW(null, ptr(file), IMAGE_ICON, size, size, LR_LOADFROMFILE);

	// The native window (whose pointer is its HWND on Windows) can take a moment to exist.
	let tries = 0;
	const attempt = () => {
		const hwnd = win.ptr;
		if (!hwnd) {
			if (++tries < 40) setTimeout(attempt, 50);
			return;
		}
		const small = load(user32.GetSystemMetrics(SM_CXSMICON));
		const big = load(user32.GetSystemMetrics(SM_CXICON));
		if (small) user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, small); // title bar
		if (big) user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, big); // Alt+Tab
	};
	attempt();
}
