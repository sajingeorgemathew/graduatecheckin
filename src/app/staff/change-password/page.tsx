import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { CHANGE_PASSWORD_PATH } from "@/features/auth/constants";
import { requireStaffPage } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await requireStaffPage(CHANGE_PASSWORD_PATH, "scanner", {
    allowPasswordChangeRequired: true,
  });

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-6 py-10 sm:px-0">
      <h1 className="text-2xl font-bold text-navy">Change password</h1>
      {session.mustChangePassword ? (
        <p className="mt-3 rounded-md border border-gold bg-white p-4 text-sm text-navy/80">
          Your account is using a temporary password. Choose a new password
          before continuing to the staff tools.
        </p>
      ) : (
        <p className="mt-3 text-sm text-navy/70">
          Choose a new password for your staff account.
        </p>
      )}
      <div className="mt-6 rounded-lg border border-navy/10 bg-white p-6 shadow-sm">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
