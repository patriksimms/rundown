import { SignInButton, SignUpButton } from '@clerk/tanstack-react-start';
import { BrowserFrame } from '#/components/browser-frame';
import { Button } from '#/components/ui/button';

const claims = [
  {
    title: 'Agents build, you adjust',
    body: 'Every action in the GUI is also a site tool, so an agent can assemble the first draft and you correct it by hand.',
  },
  {
    title: 'Queries stay readable',
    body: 'Widgets compile to SQL over your own CSV and parquet files. No copies, no hidden transforms, no second warehouse.',
  },
  {
    title: 'Share without seats',
    body: 'Send a link or grant a colleague access. Viewers get the stored widgets and controls and nothing else.',
  },
];

export function LandingPage() {
  return (
    <main>
      <section className="mx-auto w-full max-w-7xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
        <div className="reveal-on-scroll max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">
            Client reporting without the rebuild
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Describe the report. Fine-tune it in the browser.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Rundown turns reporting intent into query-backed dashboards while keeping every formula,
            filter, and access rule inspectable.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <SignUpButton>
              <Button className="h-10 px-4">Create account</Button>
            </SignUpButton>
            <SignInButton>
              <Button variant="outline" className="h-10 px-4">
                Sign in
              </Button>
            </SignInButton>
          </div>
        </div>
        <BrowserFrame
          url="rundown.workers.dev/dashboards/q1-delivery"
          className="reveal-on-scroll mt-14"
        >
          <img
            src="/landing/dashboard.png"
            alt="A Rundown dashboard showing impressions, clicks, media spend and click-through rate, a delivery trend line, a bar chart by ad format and a campaign breakdown table."
            width={2880}
            height={2000}
            fetchPriority="high"
            className="h-auto w-full"
          />
        </BrowserFrame>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-3">
          {claims.map((claim) => (
            <div key={claim.title} className="reveal-on-scroll">
              <h2 className="text-lg font-semibold tracking-tight">{claim.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{claim.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
        <div className="reveal-on-scroll max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Field metadata stays yours
          </h2>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Register a file that already exists, then correct only the labels, roles and types that
            matter. Every dashboard built on that source follows.
          </p>
        </div>
        <BrowserFrame url="rundown.workers.dev/datasources" className="reveal-on-scroll mt-10">
          <img
            src="/landing/field-metadata.png"
            alt="The Rundown datasources screen listing each column of a registered file with its label, canonical name, role and type."
            width={2880}
            height={1888}
            loading="lazy"
            className="h-auto max-h-[32rem] w-full object-cover object-top"
          />
        </BrowserFrame>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6">
        <div className="reveal-on-scroll">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Point Rundown at a file you already have and see the first dashboard.
          </h2>
          <div className="mt-7">
            <SignUpButton>
              <Button className="h-10 px-4">Create account</Button>
            </SignUpButton>
          </div>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-7xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
        Rundown
      </footer>
    </main>
  );
}
