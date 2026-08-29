import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
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
    </main>
  );
}
