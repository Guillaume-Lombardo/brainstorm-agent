import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AnswerOption, OpenQuestion } from "@/lib/backend/types";

/** Open questions with answer options as buttons; the recommended one stands out. */
export function OpenQuestions({
  questions,
  disabled,
  onAnswer,
}: {
  questions: OpenQuestion[];
  disabled: boolean;
  onAnswer: (question: OpenQuestion, option: AnswerOption) => void;
}) {
  if (questions.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No open question for now.</p>;
  }
  return (
    <ul className="flex flex-col gap-4 p-4">
      {questions.map((question) => (
        <li key={question.id} className="flex flex-col gap-2 rounded-xl border p-3">
          <p className="font-medium">{question.question}</p>
          <p className="text-xs text-muted-foreground">Why it matters: {question.whyItMatters}</p>
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={option.recommended ? "default" : "outline"}
                disabled={disabled}
                onClick={() => onAnswer(question, option)}
                data-recommended={option.recommended || undefined}
              >
                {option.recommended ? <SparklesIcon aria-hidden /> : null}
                {option.label}
                {option.recommended ? <span className="sr-only"> (recommended)</span> : null}
              </Button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
