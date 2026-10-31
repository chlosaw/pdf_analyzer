import { FileSearch, Loader2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { ZodSchema } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/api/client';

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
    <div className="grid min-h-dvh place-items-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2 text-lg font-semibold">
          <FileSearch className="size-6" /> PDF Analyzer
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
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
                  />
                  {errors[f.name] && <p className="text-xs text-destructive">{errors[f.name]![0]}</p>}
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
  );
}
