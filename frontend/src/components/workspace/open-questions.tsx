import { SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OpenQuestionItem } from "@/lib/backend/types";

/** Open questions with answer options as buttons; the recommended one stands out. */
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
  if (questions.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {queueing
          ? "Aucune autre question en attendant la fin de l'analyse."
          : "Aucune question ouverte pour le moment."}
      </p>
    );
  }
  const list = (
    <ul className="flex flex-col gap-4 p-4">
      {questions.map((question, index) => (
        <li key={question.id ?? index} className="flex flex-col gap-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-1">
            {question.blocking ? <Badge variant="destructive">Bloquante</Badge> : null}
          </div>
          <p className="font-medium">{question.question}</p>
          {question.why_it_matters ? (
            <p className="text-xs text-muted-foreground">
              Pourquoi cette question : {question.why_it_matters}
            </p>
          ) : null}
          {(question.options ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(question.options ?? []).map((option) => {
                const recommended = option === question.recommended_option;
                return (
                  <Button
                    key={option}
                    size="sm"
                    variant={recommended ? "default" : "outline"}
                    // Options are model-written sentences: let them wrap within the panel.
                    className="h-auto max-w-full py-1 text-left whitespace-normal"
                    disabled={disabled}
                    onClick={() => onAnswer(question, option)}
                    data-recommended={recommended || undefined}
                  >
                    {recommended ? <SparklesIcon aria-hidden /> : null}
                    {option}
                    {recommended ? <span className="sr-only"> (recommandé)</span> : null}
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Répondez dans la conversation.</p>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      {queueing ? (
        <p className="px-4 pt-4 text-xs text-muted-foreground">
          Analyse en cours : vos réponses partiront ensemble dès qu&apos;elle se termine.
        </p>
      ) : null}
      {list}
    </>
  );
}
