import { Notice, PublicFrame } from "@/components/public-frame";
export default function NotFound() { return <PublicFrame><Notice title="Page not found">That address does not lead anywhere. <a className="font-semibold text-emerald underline underline-offset-4" href="/">Go to the start</a></Notice></PublicFrame>; }
