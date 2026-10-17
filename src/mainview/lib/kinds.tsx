import { MessageSquareTextIcon, Repeat2Icon, ReplyIcon, type LucideIcon } from "lucide-react";
import type { Kind } from "../../shared/types";

export const KINDS: { kind: Kind; title: string; one: string; Icon: LucideIcon }[] = [
	{ kind: "tweets", title: "Tweets", one: "tweet", Icon: MessageSquareTextIcon },
	{ kind: "replies", title: "Replies", one: "reply", Icon: ReplyIcon },
	{ kind: "retweets", title: "Retweets", one: "retweet", Icon: Repeat2Icon },
];
