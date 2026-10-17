import { MessageSquareTextIcon, Repeat2Icon, ReplyIcon, type LucideIcon } from "lucide-react";
import type { Kind } from "../../shared/types";

export const KINDS: { kind: Kind; title: string; Icon: LucideIcon }[] = [
	{ kind: "tweets", title: "Tweets", Icon: MessageSquareTextIcon },
	{ kind: "replies", title: "Replies", Icon: ReplyIcon },
	{ kind: "retweets", title: "Retweets", Icon: Repeat2Icon },
];
