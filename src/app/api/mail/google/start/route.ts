import { NextResponse } from "next/server";
import { merchantRoute } from "@/lib/server/http";
import { consentUrl } from "@/lib/server/mail/google";
import { env } from "@/lib/server/env";
export const GET = merchantRoute((_r, m) => NextResponse.redirect(consentUrl(m.id) ?? `${env.appUrl}/app/configuration?error=${encodeURIComponent("Google sign-in is not set up on this server")}`));
