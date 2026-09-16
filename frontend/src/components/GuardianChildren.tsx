import { useEffect, useState } from 'react'
import { fetchGuardianChildren, type ChildActivity, type LinkedChild } from '../api/guardian'
import { entriesNoun } from '../utils/analysis'
import {
  childLabel,
  entryDateLabel,
  lastEntryLabel,
  linkedSinceLabel,
  showsStreak,
} from '../utils/children'
import { mealsNoun } from '../utils/meals'
import { pluralDays } from '../utils/reports'
import '../styles/panel.css'
import './guardianChildren.css'

/**
 * "Konto dziecka" — what a guardian can see of the account they vouched for.
 *
 * ENGAGEMENT, NOT CONTENT, AND THAT IS THE FEATURE. This card answers one
 * question: is my child still using this. How much has been written, whether a
 * run is going, when the last entry was. It shows nothing of what any of it
 * says — no mood, no emotions, no risky-behaviour flag, no report figures, no
 * entry text — and the backend does not send them (CHILD_SUMMARY_FIELDS in
 * core/account.py), so this is a line in the schema of the payload rather than
 * a rendering choice that could drift.
 *
 * The reason is clinical, not squeamish. The diary is health data a minor writes
 * about themselves, and a minor who knows a parent reads it writes a different
 * diary — which is the failure this app can least afford, and the same argument
 * the client made when she refused to let a patient cut the specialist off (see
 * pages/Reports.tsx). A guardian does not need the content to do their job: they
 * need to notice that their child has stopped, and ask them about it.
 *
 * THE CARD SAYS SO OUT LOUD. The line at the bottom is not a disclaimer to be
 * tidied away — a guardian who assumes they are reading their child's diary is
 * being misled by silence, and a guardian who knows they are not can say so to
 * the child, which is what makes the child's diary worth writing.
 *
 * ONE EXCEPTION, AND THE CLIENT MADE IT: a marker next to the child's name when
 * their last weekly report flagged three or more risky days. It is the only
 * thing here that comes from what the diary says rather than from how much of it
 * there is — which is why it says "wymaga uwagi" and not what happened. The
 * count and the reason are not in the payload at all, so this card cannot drift
 * into quoting the report without a backend change to go with the decision.
 *
 * ONE ROW PER MODULE, and that is a fix rather than a decoration. The card read
 * the psychotherapy diary and nothing else, so a minor who uses only the diet
 * module — which is the whole reason there are two — reached their guardian as
 * "0 wpisów", i.e. as an account nobody touches. Since the card exists to answer
 * "is my child still doing this", that was the one wrong answer it could give.
 * The two are counted apart rather than summed, for the reason
 * DIET_CHILD_SUMMARY_FIELDS gives: a total would be a third meaning of "wpis"
 * that no screen in the app uses.
 *
 * The line does not move with the second row. Meals are counted, never
 * described: no photo, no kind, no description, none of the emotions picked
 * beside one — and the backend sends none of them either.
 *
 * A FAILED LOAD SAYS SO. Silence would read as "no children linked" to somebody
 * who has one, which on this screen is the one wrong answer — it is the whole
 * reason they are here.
 */

const LOAD_ERROR = 'Nie udało się wczytać informacji o koncie dziecka.'

/**
 * What the marker says, and the whole of what it says.
 *
 * THE WORDING IS THE DECISION, not the icon. It tells the guardian that the last
 * report wants looking at, and it does not say what happened, how many days, or
 * on which ones — the backend does not send those either (see
 * CHILD_ATTENTION_FIELD in core/account.py). A parent who sees this is meant to
 * talk to their child or to the specialist, which they can do without reading
 * the diary; naming the reason here would make this card the first place the
 * panel quotes clinical content, and that is a decision about the scope of a
 * guardian's access rather than about a badge.
 *
 * It carries a real label rather than living in the colour: an ochre glyph says
 * nothing at all to a screen reader, and "yellow means bad" is not a message.
 */
const ATTENTION_LABEL = 'Ostatni raport wymaga uwagi'

function Figure({ value, label, title }: { value: string; label: string; title?: string }) {
  return (
    <div className="panel-figure" title={title}>
      <span className="panel-figure-value">{value}</span>
      <span className="panel-figure-label">{label}</span>
    </div>
  )
}

/**
 * One module's row of figures, under the module's own name.
 *
 * TWO ROWS RATHER THAN ONE, and the heading is what makes them readable: a
 * patient writes in two modules, the app counts them apart everywhere else (see
 * DIET_CHILD_SUMMARY_FIELDS in core/account.py), and a single "12 wpisów" would
 * leave a guardian unable to tell whether their child keeps a diary, a food
 * diary, or half of each. The headings are the names the child themselves picks
 * between on /modules, so the two screens say one thing.
 *
 * The declension of the noun travels as a function rather than as a finished
 * string, because the tile draws the number and its label as two elements —
 * `entriesNoun` and `mealsNoun` are the two callers, each the nominative of its
 * own word.
 */
function ModuleFigures({
  heading,
  activity,
  entryNoun,
  lastLabel,
}: {
  heading: string
  activity: ChildActivity
  entryNoun: (count: number) => string
  lastLabel: string
}) {
  return (
    <section className="child-module">
      <h4 className="child-module-heading">{heading}</h4>
      <div className="child-figures panel-figures">
        <Figure value={String(activity.entryCount)} label={entryNoun(activity.entryCount)} />
        {showsStreak(activity.streakDays) && (
          <Figure
            value={String(activity.streakDays)}
            label={`${pluralDays(activity.streakDays)} z rzędu`}
          />
        )}
        <Figure
          value={lastEntryLabel(activity.lastEntryDate, new Date()) ?? '—'}
          label={lastLabel}
          title={entryDateLabel(activity.lastEntryDate) ?? undefined}
        />
      </div>
    </section>
  )
}

function ChildCard({ child }: { child: LinkedChild }) {
  const linkedSince = linkedSinceLabel(child.linkedAt)
  const { activity, dietActivity } = child
  // Nothing at all in either module, which is the state a guardian most needs
  // to see. Written as "neither" rather than as a check on the psychotherapy
  // diary alone: that is exactly the bug this card had — a child who only used
  // the diet module was told on, in words, as having written nothing.
  const wroteNothing =
    activity?.entryCount === 0 && (dietActivity === null || dietActivity.entryCount === 0)

  return (
    <article className="child-card panel-card">
      <header className="child-card-header">
        <h3>
          {childLabel(child)}
          {child.needsAttention && (
            /* Inside the heading, next to the name, because the guardian's
               question is "which of my children" — a marker on the card's edge
               would answer "one of them". `role="img"` with a label, so the
               glyph is read as the sentence rather than as an exclamation mark;
               `title` gives the same words to a mouse. */
            <span
              className="child-attention"
              role="img"
              aria-label={ATTENTION_LABEL}
              title={ATTENTION_LABEL}
            >
              !
            </span>
          )}
        </h3>
        {/* The address as well as the name: two children in a family can share a
            first name on a card, and this is the value the child typed. */}
        {child.childEmail && <p className="child-card-email">{child.childEmail}</p>}
        {linkedSince && (
          <p className="child-card-linked">Powiązane z Twoim kontem od {linkedSince}</p>
        )}
      </header>

      {activity === null ? (
        /* Two different reasons for no figures, and they must not share a
           sentence. `consentsActive === false` is an account whose owner
           withdrew their RODO consents: it *has* a diary and the app has stopped
           reading it, so "to konto nie prowadzi dzienniczka" would be false —
           and it would send a worried parent looking for the wrong problem. The
           other reason is the original one: no patient row behind the link. */
        !child.consentsActive ? (
          <p className="child-card-empty">
            To konto zostało zatrzymane — dziecko wycofało zgody na przetwarzanie
            danych. Nic nie zostało usunięte, a podsumowanie wróci, jeśli zgody
            zostaną przywrócone.
          </p>
        ) : (
          <p className="child-card-empty">
            To konto nie prowadzi dzienniczka, więc nie ma tu czego podsumować.
          </p>
        )
      ) : (
        <>
          <ModuleFigures
            heading="Psychoterapia"
            activity={activity}
            entryNoun={entriesNoun}
            lastLabel="ostatni wpis"
          />

          {/* Only when the figures actually arrived: `dietActivity` is null on a
              backend that does not send them, and a row of zeroes would claim
              the child keeps no food diary on its behalf. */}
          {dietActivity && (
            <ModuleFigures
              heading="Dietetyka i psychodietetyka"
              activity={dietActivity}
              entryNoun={mealsNoun}
              lastLabel="ostatni posiłek"
            />
          )}

          {wroteNothing && (
            /* The state a guardian most needs to see, said in words rather than
               left as rows of zeroes to interpret. It names both modules,
               because it is now a claim about both. */
            <p className="child-card-note">
              Dziecko nie zapisało jeszcze żadnego wpisu ani posiłku.
            </p>
          )}
        </>
      )}

      <p className="child-card-privacy">
        Widzisz, czy dziecko korzysta z aplikacji — nie widzisz treści jego wpisów
        ani tego, co je.
      </p>
    </article>
  )
}

function GuardianChildren() {
  const [children, setChildren] = useState<LinkedChild[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true

    fetchGuardianChildren()
      .then((answer) => {
        if (live) setChildren(answer)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
    }
  }, [])

  // Nothing at all while it loads: this sits under a card the guardian may have
  // to act on, and a skeleton pushing that one down the page is worse than a
  // section that appears a moment later.
  if (loading) return null

  if (failed) {
    return (
      <section className="child-section panel-section">
        <p className="child-error" role="alert">
          {LOAD_ERROR}
        </p>
      </section>
    )
  }

  // No accepted link is the ordinary state for a guardian who has not answered
  // an invitation yet — the card above already tells them what to do, so this
  // section stays out of the way rather than repeating it.
  if (children.length === 0) return null

  return (
    <section className="child-section panel-section" aria-labelledby="child-section-heading">
      <h2 id="child-section-heading" className="panel-section-heading">
        {children.length === 1 ? 'Konto dziecka' : 'Konta dzieci'}
      </h2>
      {children.map((child) => (
        <ChildCard key={child.id} child={child} />
      ))}
    </section>
  )
}

export default GuardianChildren
