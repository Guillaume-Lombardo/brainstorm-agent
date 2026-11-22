import { useMessages } from "@/components/preferences/provider";
import { Badge } from "@/components/ui/badge";
import type { OpenQuestionItem } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

/** Open questions with answer options as chips; the recommended one stands out. */
export function OpenQuestions({
  questions,
  disabled,
  queueing = false,
  onAnswer,
}: {
  questions: OpenQuestionItem[];
  disabled: boolean;
  /** A turn is running: answers wait and go together in the next turn. */
  queueing?: boolean;
  onAnswer: (question: OpenQuestionItem, option: string) => void;
}) {
  const t = useMessages().questions;
  if (questions.length === 0) {
    return <p className="p-4 text-muted-foreground">{queueing ? t.noneWaiting : t.none}</p>;
  }
  return (
    <>
      {queueing ? <p className="px-4 pt-3 text-xs text-muted-foreground">{t.queueing}</p> : null}
      <ul className="divide-y px-4">
        {questions.map((question, index) => (
          <li key={question.id ?? index} className="flex flex-col gap-2 py-4">
            <div className="font-semibold text-pretty">
              <p className="inline">{question.question}</p>
              {question.blocking ? (
                <Badge variant="destructive" className="ml-2 align-text-bottom">
                  {t.blocking}
                </Badge>
              ) : null}
            </div>
            {question.why_it_matters ? (
              <p className="text-[13px] text-muted-foreground">{question.why_it_matters}</p>
            ) : null}
            {(question.options ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {(question.options ?? []).map((option) => {
                  const recommended = option === question.recommended_option;
                  return (
                    <button
                      key={option}
                      type="button"
                      // Options are model-written sentences: they wrap within the panel.
                      className={cn(
                        "max-w-full cursor-pointer rounded-md border bg-card px-2.5 py-1.5 text-left text-[13px] hover:border-primary disabled:pointer-events-none disabled:opacity-50",
                        recommended &&
                          "border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]",
                      )}
                      disabled={disabled}
                      onClick={() => onAnswer(question, option)}
                      data-recommended={recommended || undefined}
                    >
                      {recommended ? (
                        <span aria-hidden className="mr-1 text-star">
                          ★
                        </span>
                      ) : null}
                      {option}
                      {recommended ? <span className="sr-only"> ({t.recommended})</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
