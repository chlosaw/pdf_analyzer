import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema } from '@pdf-analyzer/shared';
import { useLogin, useMe } from '@/api/queries';
import { AuthForm } from '@/features/auth/AuthForm';

function useRedirectTarget() {
  const location = useLocation();
  return (location.state as { from?: string } | null)?.from ?? '/';
}

export function LoginPage() {
  const { data: user } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const to = useRedirectTarget();
  if (user) return <Navigate to={to} replace />;

  return (
    <AuthForm
      title="Sign in"
      description="Welcome back. Sign in to your documents."
      schema={loginSchema}
      fields={[
        { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
        { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' }
      ]}
      submitLabel="Sign in"
      pending={login.isPending}
      onSubmit={async (v) => {
        await login.mutateAsync(v);
        navigate(to, { replace: true });
      }}
      footer={
        <>
          No account?{' '}
          <Link to="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create one
          </Link>
        </>
      }
    />
  );
}
