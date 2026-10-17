import { useEffect, useState } from "react";
import { CalendarDaysIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(undefined, { month: "long" }));

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const parse = (iso: string) => {
	const [y, m, d] = iso.split("-").map(Number);
	return iso ? { y: String(y), m: String(m), d: String(d) } : { y: "", m: "", d: "" };
};

type Props = {
	label: string;
	value: string; // YYYY-MM-DD or ""
	onChange: (iso: string) => void;
	minYear: number;
	maxYear: number;
};

// Month / Day / Year pickers plus a calendar, like X's advanced search.
export function DateField({ label, value, onChange, minYear, maxYear }: Props) {
	const [parts, setParts] = useState(() => parse(value));
	const [open, setOpen] = useState(false);
	useEffect(() => setParts(parse(value)), [value]);

	function set(key: "y" | "m" | "d", v: string) {
		const next = { ...parts, [key]: v };
		if (next.y && next.m && next.d) {
			const y = Number(next.y), m = Number(next.m);
			const d = Math.min(Number(next.d), daysIn(y, m)); // e.g. Feb 31 → Feb 28/29
			next.d = String(d);
			onChange(toIso(y, m, d));
		}
		setParts(next);
	}

	const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => String(maxYear - i));
	const days = Array.from({ length: parts.y && parts.m ? daysIn(Number(parts.y), Number(parts.m)) : 31 }, (_, i) => String(i + 1));
	const selected = value ? new Date(`${value}T00:00:00`) : undefined;

	return (
		<div className="grid gap-1.5">
			<span className="text-sm font-medium">{label}</span>
			<div className="flex items-center gap-2">
				<Select value={parts.m} onValueChange={(v) => set("m", v)}>
					<SelectTrigger aria-label={`${label} month`} className="min-w-0 flex-[2]"><SelectValue placeholder="Month" /></SelectTrigger>
					<SelectContent>{MONTHS.map((name, i) => <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>)}</SelectContent>
				</Select>
				<Select value={parts.d} onValueChange={(v) => set("d", v)}>
					<SelectTrigger aria-label={`${label} day`} className="min-w-0 flex-1"><SelectValue placeholder="Day" /></SelectTrigger>
					<SelectContent>{days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
				</Select>
				<Select value={parts.y} onValueChange={(v) => set("y", v)}>
					<SelectTrigger aria-label={`${label} year`} className="min-w-0 flex-[1.3]"><SelectValue placeholder="Year" /></SelectTrigger>
					<SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
				</Select>
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="icon" aria-label={`Pick ${label.toLowerCase()} date`}><CalendarDaysIcon /></Button>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-0" align="end">
						<Calendar
							mode="single"
							captionLayout="dropdown"
							selected={selected}
							defaultMonth={selected ?? new Date(maxYear, 0, 1)}
							startMonth={new Date(minYear, 0, 1)}
							endMonth={new Date(maxYear, 11, 31)}
							onSelect={(d) => {
								if (d) onChange(toIso(d.getFullYear(), d.getMonth() + 1, d.getDate()));
								setOpen(false);
							}}
						/>
					</PopoverContent>
				</Popover>
				<Button variant="ghost" size="icon-sm" aria-label={`Clear ${label.toLowerCase()} date`} disabled={!value && !parts.m && !parts.d && !parts.y}
					onClick={() => { setParts(parse("")); onChange(""); }}>
					<XIcon />
				</Button>
			</div>
		</div>
	);
}
