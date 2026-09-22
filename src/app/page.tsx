const steps = [
  {
    title: "Photograph the menu",
    body: "Use menu photos or a PDF. MenuGen keeps the original wording, prices, and order intact.",
  },
  {
    title: "Review what is uncertain",
    body: "Questionable text and translations are flagged so you can fix exceptions instead of checking everything.",
  },
  {
    title: "Browse and share",
    body: "Explore a bilingual visual menu, then share its private link with the table.",
  },
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-12">
        <a
          className="focus-visible:outline-shiso rounded-sm font-serif text-xl font-semibold tracking-[-0.02em] focus-visible:outline-2 focus-visible:outline-offset-4"
          href="#top"
        >
          MenuGen
        </a>
        <p className="text-ink-muted text-sm">Private prototype</p>
      </header>

      <section
        className="mx-auto grid w-full max-w-7xl gap-12 px-5 pt-10 pb-20 sm:px-8 md:pt-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-12 lg:pb-28"
        id="top"
      >
        <div className="flex max-w-xl flex-col justify-center">
          <p className="border-persimmon text-shiso mb-5 max-w-max border-b pb-1 text-sm font-semibold">
            Visual translation for real menus
          </p>
          <h1 className="font-serif text-5xl leading-[0.98] font-medium tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
            Understand the menu before you order.
          </h1>
          <p className="text-ink-muted mt-7 max-w-lg text-lg leading-8">
            MenuGen turns unfamiliar restaurant menus into bilingual visual
            guides—while keeping the restaurant&apos;s original words visible
            and every estimate honest.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-5">
            <a
              className="bg-shiso text-rice-paper hover:bg-shiso-dark focus-visible:outline-shiso inline-flex min-h-12 items-center justify-center px-6 py-3 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4"
              href="/create"
            >
              Create a visual menu
            </a>
            <span className="text-ink-muted max-w-52 text-sm leading-6">
              Private creator preview. Source files are temporary.
            </span>
          </div>
        </div>

        <div
          className="border-ink/15 bg-menu-paper relative border px-5 py-6 shadow-[12px_14px_0_var(--color-broth)] sm:px-8 sm:py-8"
          id="preview"
        >
          <div className="border-ink/20 flex items-start justify-between gap-6 border-b pb-5">
            <div>
              <p className="font-serif text-2xl font-semibold">晩ごはん</p>
              <p className="text-ink-muted mt-1 text-sm">Dinner menu</p>
            </div>
            <p className="font-serif text-lg">京都 · Kyoto</p>
          </div>

          <article className="grid gap-6 py-7 sm:grid-cols-[1fr_9rem] sm:items-start">
            <div>
              <div className="flex items-baseline justify-between gap-5">
                <h2 className="font-serif text-3xl leading-tight font-semibold">
                  Miso-braised mackerel
                </h2>
                <p className="shrink-0 font-semibold">¥1,280</p>
              </div>
              <p className="text-ink-muted mt-2 text-lg" lang="ja">
                鯖の味噌煮
              </p>
              <p className="text-ink-muted mt-5 max-w-md leading-7">
                Mackerel simmered in a sweet-savory miso sauce with ginger.
              </p>
              <div className="border-persimmon mt-5 border-l-2 pl-4">
                <p className="text-persimmon text-xs font-semibold">
                  Translation note
                </p>
                <p className="text-ink-muted mt-1 text-sm leading-6">
                  “Saba” is mackerel. The menu explicitly states miso and
                  ginger; no dietary claims were added.
                </p>
              </div>
            </div>

            <div>
              <div
                aria-label="Example placeholder showing where a visual estimate of the dish would appear"
                className="border-shiso/20 bg-shiso/8 grid aspect-square place-items-center border"
                role="img"
              >
                <div className="border-menu-paper bg-persimmon/75 grid h-24 w-24 place-items-center rounded-full border-[10px] shadow-[0_0_0_1px_var(--color-shiso)]">
                  <span className="bg-shiso/80 h-8 w-14 -rotate-12 rounded-[50%]" />
                </div>
              </div>
              <p className="text-shiso mt-2 text-xs font-semibold">
                AI visual estimate
              </p>
            </div>
          </article>

          <div className="border-ink/20 text-ink-muted flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-xs">
            <span>Original text preserved</span>
            <span>Price unchanged</span>
            <span>Estimate labeled</span>
          </div>
        </div>
      </section>

      <section className="border-ink/15 bg-broth/45 border-y" id="how-it-works">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
            <div>
              <h2 className="font-serif text-4xl leading-tight font-medium tracking-[-0.03em]">
                From menu photo to something you can actually use.
              </h2>
              <p className="text-ink-muted mt-5 max-w-md leading-7">
                The extraction benchmark is complete. The private creator flow
                now focuses your attention on uncertain details before any
                images are generated.
              </p>
            </div>
            <ol className="border-ink/30 border-t">
              {steps.map((step, index) => (
                <li
                  className="border-ink/30 grid gap-3 border-b py-6 sm:grid-cols-[2.5rem_12rem_1fr] sm:gap-6"
                  key={step.title}
                >
                  <span className="text-persimmon font-serif text-2xl">
                    {index + 1}
                  </span>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-ink-muted leading-7">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <footer className="text-ink-muted mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-8 text-sm sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
        <p>MenuGen · Built for diners, not restaurant ordering.</p>
        <p>
          Always confirm allergens and safety information with restaurant staff.
        </p>
      </footer>
    </main>
  );
}
