import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/tanstack-react-start';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-8">
      <header className="flex items-center justify-between gap-4">
        <a className="text-sm font-semibold tracking-tight text-slate-950" href="/">
          Rundown
        </a>
        <nav aria-label="Account" className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton>
              <button
                className="text-sm font-medium text-slate-700 hover:text-slate-950"
                type="button"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton>
              <button
                className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                type="button"
              >
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </nav>
      </header>

      <section className="flex flex-1 flex-col justify-center py-16">
        <p className="mb-5 text-sm font-medium text-emerald-700">Deployment healthy</p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Rundown is running.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
          This minimal TanStack Start app is ready for automatic deployment to Cloudflare Workers.
        </p>
        <a
          className="mt-8 w-fit text-sm font-medium text-slate-950 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-950"
          href="/health"
        >
          Check the health endpoint
        </a>
      </section>
    </main>
  );
}
