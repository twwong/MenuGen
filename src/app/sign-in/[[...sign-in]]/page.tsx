import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default async function SignInPage(
  props: PageProps<"/sign-in/[[...sign-in]]">,
) {
  const searchParams = await props.searchParams;
  const rawReturnTo = searchParams.returnTo;
  const returnTo =
    typeof rawReturnTo === "string" &&
    rawReturnTo.startsWith("/create/") &&
    !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : "/create";

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main className="creator-shell">
        <header className="creator-header">
          <Link className="brand-link" href="/">
            MenuGen
          </Link>
          <p>Private creator sign-in</p>
        </header>
        <section className="auth-gate">
          <p className="eyebrow">Managed preview only</p>
          <h1>Sign-in is not configured here.</h1>
          <p>
            The deterministic fixture workflow uses its own preview identity.
            Clerk is enabled only when its development keys are configured.
          </p>
          <Link className="secondary-link" href="/create">
            Return to creator
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="creator-shell clerk-shell">
      <header className="creator-header">
        <Link className="brand-link" href="/">
          MenuGen
        </Link>
        <p>Private creator sign-in</p>
      </header>
      <div className="clerk-panel">
        <SignIn
          fallbackRedirectUrl={returnTo}
          forceRedirectUrl={returnTo}
          routing="path"
          path="/sign-in"
          withSignUp
        />
      </div>
    </main>
  );
}
