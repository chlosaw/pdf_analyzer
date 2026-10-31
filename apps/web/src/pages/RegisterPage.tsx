import { Link, Navigate, useNavigate } from 'react-router-dom';
import { registerSchema } from '@pdf-analyzer/shared';
import { useMe, useRegister } from '@/api/queries';
import { AuthForm } from '@/features/auth/AuthForm';

export function RegisterPage() {
  const { data: user } = useMe();
  const register = useRegister();
  const navigate = useNavigate();
  if (user) return <Navigate to="/" replace />;

  return (
    <AuthForm
      title="Create an account"
      description="Upload PDFs and ask questions about them."
      schema={registerSchema}
      fields={[
        { name: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
        { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
        { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' }
      ]}
      submitLabel="Create account"
      pending={register.isPending}
      onSubmit={async (v) => {
        await register.mutateAsync(v);
        navigate('/', { replace: true });
      }}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    />
  );
}
