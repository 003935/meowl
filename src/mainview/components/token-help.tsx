import type { ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const code = "rounded bg-muted px-1 font-mono";

// "How do I get my auth_token?" — shared by the delete dialog and "Load from X".
export function TokenHelp({ children }: { children?: ReactNode }) {
	return (
		<Collapsible className="text-xs text-muted-foreground">
			<CollapsibleTrigger className="group inline-flex items-center gap-1 hover:text-foreground">
				<ChevronDownIcon className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
				How do I get my auth_token?
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-2">
				<ol className="ml-5 list-decimal space-y-1.5">
					<li>Open <a className="text-sky-600 hover:underline dark:text-sky-400" href="https://x.com">x.com</a> in Chrome, Edge, Safari or Firefox, logged in to the account.</li>
					<li>
						Open DevTools (<kbd className={code}>F12</kbd> or <kbd className={code}>⌥⌘I</kbd>) → <b>Application</b> (Chrome/Edge) or <b>Storage</b> (Safari/Firefox) → <b>Cookies</b> → <code className={code}>https://x.com</code>.
					</li>
					<li>Copy the <b>Value</b> of the <code className={code}>auth_token</code> row and paste it above.</li>
				</ol>
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
