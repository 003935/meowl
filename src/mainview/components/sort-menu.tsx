import { ArrowUpDownIcon, HeartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";

export type Order = "asc" | "desc";

const OPTIONS: [Order, string][] = [
	["desc", "Newest"],
	["asc", "Oldest"],
];

type Props = {
	order: Order;
	onOrderChange: (o: Order) => void;
	popular: boolean; // most liked first; time order breaks ties
	onPopularChange: (on: boolean) => void;
};

const row = "flex cursor-pointer items-center justify-between rounded-md px-3 py-2.5 text-base font-semibold hover:bg-muted";

export function SortMenu({ order, onOrderChange, popular, onPopularChange }: Props) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant={popular ? "default" : "secondary"} className="rounded-full">
					<ArrowUpDownIcon data-icon="inline-start" /> Sort
					{popular && <HeartIcon data-icon="inline-end" className="fill-current" />}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-1.5">
				<p className="px-3 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Time</p>
				<RadioGroup value={order} onValueChange={(v) => onOrderChange(v as Order)} className="gap-0.5" aria-label="Time order">
					{OPTIONS.map(([v, label]) => (
						<Label key={v} className={row}>
							{label}
							<RadioGroupItem value={v} className="size-5" />
						</Label>
					))}
				</RadioGroup>
				<Separator className="my-1.5" />
				<Label className={row}>
					<span className="flex items-center gap-2">
						<HeartIcon className="size-4 text-pink-600 dark:text-pink-400" /> Popular
					</span>
					<Checkbox checked={popular} onCheckedChange={(v) => onPopularChange(v === true)} className="size-5" aria-label="Most liked first" />
				</Label>
			</PopoverContent>
		</Popover>
	);
}
