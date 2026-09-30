import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Auth routes reachable without a full (AAL2) session. */
function isAuthRoute(path: string) {
  return (
    path.startsWith("/login") ||
    path.startsWith("/mfa") ||
    path.startsWith("/auth")
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const authRoute = isAuthRoute(path);
  const isApi = path.startsWith("/api");
  const unauthorized = () =>
    new NextResponse("Unauthorized", { status: 401 });

  // Not signed in → APIs get 401, pages go to /login.
  if (!user) {
    if (authRoute) return response;
    if (isApi) return unauthorized();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Single-user lock: only the owner may use JARVIS.
  if (user.email?.toLowerCase() !== process.env.OWNER_EMAIL?.toLowerCase()) {
    await supabase.auth.signOut();
    if (isApi) return unauthorized();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("e", "denied");
    return NextResponse.redirect(url);
  }

  // Require 2FA on pages (enroll or challenge via /mfa) until AAL2. APIs are
  // only reachable from the already-AAL2-gated app, so they skip the redirect.
  if (!authRoute && !isApi) {
    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.currentLevel !== "aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/mfa";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
