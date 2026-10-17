import { useState } from "react";
import { ArrowUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type Order = "asc" | "desc";

const OPTIONS: [Order, string][] = [
	["desc", "Newest"],
	["asc", "Oldest"],
];

export function SortMenu({ value, onChange }: { value: Order; onChange: (o: Order) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="secondary" size="sm" className="rounded-full">
					<ArrowUpDownIcon data-icon="inline-start" /> Sort
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-48 p-1.5">
				<RadioGroup
					value={value}
					onValueChange={(v) => { onChange(v as Order); setOpen(false); }}
					className="gap-0.5"
					aria-label="Sort order"
				>
					{OPTIONS.map(([v, label]) => (
						<Label key={v} className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2.5 text-base font-semibold hover:bg-muted">
							{label}
							<RadioGroupItem value={v} className="size-5" />
						</Label>
					))}
				</RadioGroup>
			</PopoverContent>
		</Popover>
	);
}
