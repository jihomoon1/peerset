import { formatDate, formatMillions } from "@/lib/format";
import { HOME_EXAMPLE as ex } from "@/lib/homeExample";

const shortPeriod = (start: string, end: string) =>
  `${formatDate(start)} – ${formatDate(end)}`;

// One number with its trail: Lennox's LTM operating income, built from its filings.
// Shown on the home page and on Why PeerSet; the values are tied to the LII golden.
export function TracedExample() {
  const rows = [
    ["Fiscal year", ex.fy],
    ["+ Current YTD", ex.ytdCurrent],
    ["− Prior-year YTD", ex.ytdPrior],
  ] as const;
  return (
    <figure className="border border-foreground text-[13px] tabular-nums">
      <figcaption className="band flex items-center justify-between gap-4 px-4 py-2 text-xs font-bold tracking-wide uppercase">
        <span>One number, traced</span>
        <span className="font-normal text-muted normal-case">
          Worked example
        </span>
      </figcaption>
      <div className="flex flex-col gap-3 p-4">
        <p>
          <span className="font-semibold">{ex.company}</span>{" "}
          <span className="text-muted">
            · {ex.metric}, USD millions, LTM through {formatDate(ex.ltmEnd)}
          </span>
        </p>
        <table className="w-full border-collapse">
          <caption className="sr-only">
            How {ex.company}&apos;s last-twelve-month {ex.metric} is built from
            its filings
          </caption>
          <tbody>
            {rows.map(([label, c]) => (
              <tr key={label} className="h-9 border-b border-rule">
                <th scope="row" className="pr-3 text-left font-normal">
                  {label}
                </th>
                <td className="hidden pr-3 text-muted sm:table-cell">
                  {shortPeriod(c.start, c.end)}
                </td>
                <td className="text-right">{formatMillions(c.value)}</td>
              </tr>
            ))}
            <tr className="h-11 border-t-2 border-foreground text-base font-bold">
              <th scope="row" className="pr-3 text-left">
                = LTM
              </th>
              <td className="hidden sm:table-cell" />
              <td className="text-right text-accent">
                {formatMillions(ex.ltm)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-muted">
          <span className="font-mono">{ex.concept}</span> · {ex.form}{" "}
          <a
            href={ex.filingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2"
          >
            {ex.accession}
          </a>
        </p>
      </div>
    </figure>
  );
}
