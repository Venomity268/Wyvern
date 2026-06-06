"use client";

import { Button } from "@/components/ui/button";
import { CredentialForm } from "@/components/ConnectionForm";
import { EmptyState } from "@/components/layout/EmptyState";
import { KeyRound } from "lucide-react";

interface CredentialItem {
  id: string;
  label: string;
  username?: string | null;
  has_password?: number | boolean;
  has_private_key?: number | boolean;
  has_passphrase?: number | boolean;
}

interface CredentialsSectionProps {
  credentials: CredentialItem[];
  showCredForm: boolean;
  editingCred?: CredentialItem;
  onShowForm: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSubmit: (data: {
    label: string;
    username: string;
    password: string;
    privateKey: string;
    passphrase: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export function CredentialsSection({
  credentials,
  showCredForm,
  editingCred,
  onShowForm,
  onEdit,
  onDelete,
  onSubmit,
  onCancel,
}: CredentialsSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Credentials</h2>
        <Button variant="outline" onClick={onShowForm}>
          Add credential
        </Button>
      </div>
      {showCredForm && (
        <CredentialForm
          initial={
            editingCred ?
              { id: editingCred.id, label: editingCred.label, username: editingCred.username || "" }
            : undefined
          }
          hasExistingPassword={!!editingCred?.has_password}
          hasExistingPrivateKey={!!editingCred?.has_private_key}
          hasExistingPassphrase={!!editingCred?.has_passphrase}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
      {credentials.length > 0 ?
        <ul className="space-y-2">
          {credentials.map((c) => (
            <li
              key={c.id}
              className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <span className="block truncate font-medium text-foreground sm:inline">{c.label}</span>
                {c.username && (
                  <span className="mt-0.5 block text-sm text-muted-foreground sm:ml-2 sm:mt-0 sm:inline">
                    ({c.username})
                  </span>
                )}
                <span className="mt-0.5 block text-xs text-muted-foreground sm:ml-2 sm:mt-0 sm:inline">
                  {c.has_password ? "password" : ""}
                  {c.has_password && c.has_private_key ? " · " : ""}
                  {c.has_private_key ? "key" : ""}
                </span>
              </div>
              <div className="flex w-full shrink-0 gap-2 border-t border-border pt-2 sm:w-auto sm:border-0 sm:pt-0">
                <Button size="sm" variant="outline" className="flex-1 sm:flex-initial" onClick={() => onEdit(c.id)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 sm:flex-initial"
                  onClick={() => onDelete(c.id)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      : <EmptyState
          icon={<KeyRound className="h-5 w-5" />}
          title="No credentials stored"
          description="Save passwords and SSH keys to reuse across connections."
        />
      }
    </section>
  );
}
