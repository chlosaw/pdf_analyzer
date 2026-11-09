import { Loader2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useStartDemo } from '@/api/queries';
import { Button } from '@/components/ui/button';

/** One click into a private sandbox with sample PDFs; no sign-up. */
export function TryDemoButton() {
  const startDemo = useStartDemo();
  const navigate = useNavigate();

  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      disabled={startDemo.isPending}
      onClick={() =>
        startDemo.mutate(undefined, {
          onSuccess: () => navigate('/', { replace: true }),
          onError: (err) => toast.error(err.message)
        })
      }
    >
      {startDemo.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {startDemo.isPending ? 'Preparing your sandbox…' : 'Try the demo, no sign-up'}
    </Button>
  );
}
