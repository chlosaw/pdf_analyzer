import { BookOpenCheck, History, Loader2, Quote } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { ZodSchema } from 'zod';
import { Logo } from '@/components/Logo';
import { GradientBackdrop } from '@/components/GradientBackdrop';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/api/client';
import { TryDemoButton } from './TryDemoButton';

const HIGHLIGHTS = [
  { icon: Quote, text: 'Answers cite their pages. Click one to jump there.' },
  { icon: BookOpenCheck, text: 'Ask across several documents at once.' },
  { icon: History, text: 'Your chat history is saved per document.' }
];

type FieldErrors = Record<string, string[] | undefined>;

interface Field {
  name: string;
  label: string;
  type: string;
  autoComplete: string;
}

/** Card-style form validated with the same Zod schema the API uses. */
export function AuthForm<T>({
  title,
  description,
  fields,
  schema,
  submitLabel,
  onSubmit,
  pending,
  footer
}: {
  title: string;
  description: string;
  fields: Field[];
  schema: ZodSchema<T>;
  submitLabel: string;
  onSubmit: (values: T) => Promise<unknown>;
  pending: boolean;
  footer: ReactNode;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    // Same Zod schema the server uses, so errors show before a round trip.
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return setErrors(parsed.error.flatten().fieldErrors as FieldErrors);
    setErrors({});
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      setFormError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GradientBackdrop intensity="bold" />
      <div className="relative mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1.1fr_1fr] lg:px-8">
        <section className="relative hidden lg:block">
          <Logo size="lg" />
          <h1 className="mt-10 text-6xl font-semibold leading-[1.05] tracking-tight">
            Ask your PDFs
            <br />
            <span className="italic text-primary">anything.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
            Upload a document and ask in plain language, in any language. Every answer points to the page it came from.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full border bg-card text-primary">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </section>

        <div className="mx-auto w-full max-w-sm space-y-6">
          <div className="flex justify-center lg:hidden">
            <span className="rounded-full bg-background/80 px-3 py-1 backdrop-blur">
              <Logo />
            </span>
          </div>
          <Card className="bg-card/95 shadow-xl shadow-primary/5 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-serif text-2xl">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TryDemoButton />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or with email
                <span className="h-px flex-1 bg-border" />
              </div>
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {fields.map((f) => (
                  <div key={f.name} className="space-y-2">
                    <Label htmlFor={f.name}>{f.label}</Label>
                    <Input
                      id={f.name}
                      name={f.name}
                      type={f.type}
                      autoComplete={f.autoComplete}
                      aria-invalid={!!errors[f.name]}
                      // Screen readers read the error out with the field
                      aria-describedby={errors[f.name] ? `${f.name}-error` : undefined}
                      className="bg-background"
                    />
                    {errors[f.name] && (
                      <p id={`${f.name}-error`} className="text-xs text-destructive">
                        {errors[f.name]![0]}
                      </p>
                    )}
                  </div>
                ))}
                {formError && (
                  <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {formError}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  {submitLabel}
                </Button>
              </form>
            </CardContent>
          </Card>
          <p className="text-center text-sm text-muted-foreground">{footer}</p>
        </div>
      </div>
    </div>
  );
}
