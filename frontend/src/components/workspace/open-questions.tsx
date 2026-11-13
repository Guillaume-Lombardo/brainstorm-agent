import { SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OpenQuestionItem } from "@/lib/backend/types";

/** Open questions with answer options as buttons; the recommended one stands out. */
export function OpenQuestions({
  questions,
  disabled,
  onAnswer,
}: {
  questions: OpenQuestionItem[];
  disabled: boolean;
  onAnswer: (question: OpenQuestionItem, option: string) => void;
}) {
  if (questions.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No open question for now.</p>;
  }
  return (
    <ul className="flex flex-col gap-4 p-4">
      {questions.map((question, index) => (
        <li key={question.id ?? index} className="flex flex-col gap-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-1">
            {question.blocking ? <Badge variant="destructive">Blocking</Badge> : null}
            {question.priority ? <Badge variant="outline">{question.priority}</Badge> : null}
          </div>
          <p className="font-medium">{question.question}</p>
          {question.why_it_matters ? (
            <p className="text-xs text-muted-foreground">
              Why it matters: {question.why_it_matters}
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
                    disabled={disabled}
                    onClick={() => onAnswer(question, option)}
                    data-recommended={recommended || undefined}
                  >
                    {recommended ? <SparklesIcon aria-hidden /> : null}
                    {option}
                    {recommended ? <span className="sr-only"> (recommended)</span> : null}
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Answer in the conversation.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
