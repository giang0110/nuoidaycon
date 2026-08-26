import type { ChildViewActivity } from '@/lib/domain/activity/child-view';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

const t = getMessages(DEFAULT_LOCALE);

/**
 * The printable worksheet — Phase 7.
 *
 * Fed a `ChildViewActivity`, the same projection the child player receives, so
 * a printed sheet can no more contain an answer key than the screen can
 * (decision A12). A parent answer sheet is a separate, clearly labelled route.
 *
 * Every activity type is printable (principle P7): screen time is optional
 * here, paper is not a second-class output.
 */
export function Worksheet({
  activity,
  childName,
}: {
  activity: ChildViewActivity;
  childName: string;
}) {
  return (
    <article className="sheet">
      <header className="sheet__header">
        <h1 className="sheet__title">{activity.title}</h1>
        <span className="sheet__meta">
          {childName} · {t.print.date}: ______________
        </span>
      </header>

      <p className="sheet__instructions">{activity.instructions}</p>

      <Body activity={activity} />

      <footer className="sheet__footer">{t.common.appName}</footer>
    </article>
  );
}

/**
 * The first row shows a solid model to read; tracing rows are grey to write over.
 *
 * Built by joining rather than interpolating: a template literal here silently
 * produced `ruled__modelruled__model--trace` and the trace styling never
 * applied — a print test caught it.
 */
function modelClass(repetition: number, tracingGuides: boolean): string {
  const classes = ['ruled__model'];
  if (repetition > 0 || tracingGuides) classes.push('ruled__model--trace');
  return classes.join(' ');
}

/** Blank ruled lines for a handwritten answer. */
function AnswerLines({ count }: { count: number }) {
  return (
    <div className="sheet__answer-lines">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} />
      ))}
    </div>
  );
}

function Body({ activity }: { activity: ChildViewActivity }) {
  switch (activity.type) {
    case 'handwriting': {
      const { items, repetitions, ruling, tracingGuides } = activity.payload;
      return (
        <section className={`ruled ruled--${ruling}`}>
          {items.map((item) =>
            Array.from({ length: repetitions }, (_, rep) => (
              <div key={`${item}-${rep}`} className="ruled__row">
                {/*
                  The first row shows the model. With tracing guides on it stays
                  visible in grey on every row so a young child has something to
                  follow; otherwise only the first row is filled and the rest are
                  blank for copying.
                */}
                {(rep === 0 || tracingGuides) && (
                  <span className={modelClass(rep, tracingGuides)}>{item}</span>
                )}
              </div>
            )),
          )}
        </section>
      );
    }

    case 'drawing_prompt':
      return (
        <>
          <section className="sheet__section">
            <p className="sheet__question">{activity.payload.prompt}</p>
            <ul className="sheet__checklist">
              {activity.payload.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <div className="sheet__drawing-box" />
        </>
      );

    case 'story_comprehension':
      return (
        <>
          <section className="sheet__section sheet__story">
            <h2 className="sheet__title" style={{ fontSize: '13pt' }}>
              {activity.payload.story.title}
            </h2>
            {activity.payload.story.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>

          {activity.payload.questions.map((q, index) => (
            <section key={q.id} className="sheet__section">
              <p className="sheet__question">
                {index + 1}. {q.prompt}
              </p>
              {q.kind === 'multiple_choice' ? (
                <ul className="sheet__choices">
                  {q.choices.map((choice) => (
                    <li key={choice.id}>{choice.text}</li>
                  ))}
                </ul>
              ) : (
                <AnswerLines count={3} />
              )}
            </section>
          ))}
        </>
      );

    case 'story_summary':
      return (
        <>
          <section className="sheet__section sheet__story">
            <h2 className="sheet__title" style={{ fontSize: '13pt' }}>
              {activity.payload.story.title}
            </h2>
            {activity.payload.story.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>
          <section className="sheet__section">
            <ul className="sheet__checklist">
              {activity.payload.guidance.promptHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
            <AnswerLines count={7} />
          </section>
        </>
      );

    case 'reflection':
      return (
        <>
          {activity.payload.questions.map((q, index) => (
            <section key={q.id} className="sheet__section">
              <p className="sheet__question">
                {index + 1}. {q.prompt}
              </p>
              <AnswerLines count={4} />
            </section>
          ))}
        </>
      );

    case 'situation_judgment':
      return (
        <>
          <section className="sheet__section">
            <p className="sheet__question">{activity.payload.scenario}</p>
            <p className="sheet__question" style={{ fontWeight: 600 }}>
              {activity.payload.question}
            </p>
          </section>

          {activity.payload.options && (
            <section className="sheet__section">
              <ul className="sheet__choices">
                {activity.payload.options.map((option) => (
                  <li key={option.id}>{option.text}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Always on the sheet, exactly as it is always on the screen. */}
          <section className="sheet__section">
            <p className="sheet__question">
              {t.play.trustedAdult}: {activity.payload.trustedAdultPath.text}
            </p>
          </section>

          <AnswerLines count={5} />
        </>
      );
  }
}
