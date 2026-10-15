"use client";

import { API_ENDPOINTS, Role } from "@intentlock/core";
import { Badge, type BadgeTone } from "@intentlock/ui/components/badge";
import { Button } from "@intentlock/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@intentlock/ui/components/dropdown-menu";
import { Input } from "@intentlock/ui/components/input";
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelHeader,
  PanelTitle,
} from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@intentlock/ui/components/table";
import {
  Ban,
  Clock,
  KeyRound,
  Mail,
  MoreHorizontal,
  RotateCcw,
  Tags,
  TriangleAlert,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useMe } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SecretReveal } from "@/components/secret-reveal";
import { InviteMemberForm } from "@/components/team/invite-member-form";
import { ApiError, api, apiUrl } from "@/lib/api";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { LinkKind } from "@/lib/enums/link-kind.enum";
import { UiAction } from "@/lib/enums/ui-action.enum";
import { formatRelative, initials, parseGroups } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  InviteCreated,
  type InviteView,
  InviteViews,
  IssuedLink,
  type TeamMember,
  TeamMembers,
} from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const ROLE_TONE: Record<Role, BadgeTone> = {
  [Role.enum.admin]: "violet",
  [Role.enum.approver]: "info",
  [Role.enum.member]: "neutral",
};

type Revealed = { title: string; description: string; secret: string };

function linkNotice(
  kind: LinkKind,
  email: string,
  res: { link: string; emailed: boolean },
): Revealed {
  const valid = kind === LinkKind.INVITE ? "7 days" : "24 hours";
  return {
    title: `${kind} link for ${email}`,
    description: res.emailed
      ? `Also emailed to ${email}. Valid for ${valid}, single use.`
      : `Not emailed (SMTP is off or failed): send it yourself. Valid for ${valid}, single use.`,
    secret: res.link,
  };
}

function Avatar({ email, muted }: { email: string; muted?: boolean }) {
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${muted ? "bg-muted text-muted-foreground" : "bg-card"}`}
    >
      {initials(email)}
    </span>
  );
}

function SignIn({ member }: { member: TeamMember }) {
  const methods = [...(member.hasPassword ? ["password"] : []), ...(member.providers ?? [])];
  if (methods.length === 0) return <Badge tone="warning">none</Badge>;
  return (
    <span className="flex flex-wrap gap-1">
      {methods.map((m) => (
        <Badge key={m} className="capitalize">
          {m === "github" ? "GitHub" : m}
        </Badge>
      ))}
    </span>
  );
}

function MemberActions({
  member,
  onChanged,
  onEditGroups,
  onReveal,
}: {
  member: TeamMember;
  onChanged: () => void;
  onEditGroups: () => void;
  onReveal: (r: Revealed) => void;
}) {
  async function patch(body: Record<string, unknown>, done: string) {
    try {
      await api(API_ENDPOINTS.USER, z.unknown(), {
        method: HttpMethod.PATCH,
        params: { email: member.email },
        body,
      });
      toast.success(done);
    } catch (e) {
      toast.error(
        e instanceof ApiError && e.code === ApiErrorCode.USER_LIMIT_REACHED
          ? "Your license's user limit is reached."
          : "Could not update this member.",
      );
    }
    onChanged();
  }

  async function resetLink() {
    try {
      const res = await api(API_ENDPOINTS.USER_RESET_LINK, IssuedLink, {
        method: HttpMethod.POST,
        params: { email: member.email },
      });
      onReveal(linkNotice(LinkKind.RESET, member.email, res));
    } catch {
      toast.error("Could not create a reset link.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.email}`} />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Role</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={member.role}
            onValueChange={(role) =>
              role !== member.role && patch({ role }, `${member.email} is now ${String(role)}`)
            }
          >
            {Role.options.map((r) => (
              <DropdownMenuRadioItem key={r} value={r} className="capitalize">
                {r}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEditGroups}>
          <Tags /> Edit groups
        </DropdownMenuItem>
        <DropdownMenuItem onClick={resetLink}>
          <KeyRound /> Create reset link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {member.disabledAt ? (
          <DropdownMenuItem onClick={() => patch({ disabled: false }, `Enabled ${member.email}`)}>
            <UserCheck /> Enable
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              patch({ disabled: true }, `Disabled ${member.email}; their sessions ended`)
            }
          >
            <Ban /> Disable
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GroupsEditor({
  member,
  onDone,
}: {
  member: TeamMember;
  onDone: (saved: boolean) => void;
}) {
  const [value, setValue] = useState(member.groups.join(", "));
  async function save() {
    try {
      await api(API_ENDPOINTS.USER, z.unknown(), {
        method: HttpMethod.PATCH,
        params: { email: member.email },
        body: { groups: parseGroups(value) },
      });
      toast.success(`Saved groups for ${member.email}`);
      onDone(true);
    } catch {
      toast.error("Groups are lowercase letters, digits, - and _.");
    }
  }
  return (
    <form
      action={save}
      className="flex items-center gap-2"
      onKeyDown={(e) => e.key === "Escape" && onDone(false)}
    >
      <Input
        aria-label={`Groups for ${member.email}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="oncall, intern"
        className="h-8 w-48"
        autoFocus
      />
      <Button type="submit" size="sm">
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => onDone(false)}>
        Cancel
      </Button>
    </form>
  );
}

function InvitesPanel({
  invites,
  onChanged,
  onReveal,
}: {
  invites: InviteView[];
  onChanged: () => void;
  onReveal: (r: Revealed) => void;
}) {
  async function resend(invite: InviteView) {
    try {
      const res = await api(API_ENDPOINTS.INVITE_RESEND, InviteCreated, {
        method: HttpMethod.POST,
        params: { id: invite.id },
      });
      onReveal(linkNotice(LinkKind.INVITE, invite.email, res));
    } catch {
      toast.error("Could not resend the invite.");
    }
    onChanged();
  }

  async function revoke(invite: InviteView) {
    try {
      await api(API_ENDPOINTS.INVITE, z.undefined(), {
        method: HttpMethod.DELETE,
        params: { id: invite.id },
      });
      toast.success(`Revoked the invite for ${invite.email}`);
    } catch {
      toast.error("Could not revoke the invite.");
    }
    onChanged();
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Mail />
          Pending invites
          <PanelCount>{invites.length}</PanelCount>
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="overflow-hidden p-0">
        {invites.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No pending invites"
            description="Invites you send wait here until they're accepted, revoked or expire."
            className="py-8"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Email", "Role", "Invited by", "Expires", ""].map((h, i) => (
                  <TableHead key={i}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell>
                    <span className="flex items-center gap-3">
                      <Avatar email={invite.email} muted />
                      <span>
                        <span className="block font-medium">{invite.email}</span>
                        {invite.groups.length > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            {invite.groups.join(", ")}
                          </span>
                        )}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge tone={ROLE_TONE[invite.role]} className="capitalize">
                      {invite.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{invite.invitedBy ?? "—"}</TableCell>
                  <TableCell>
                    {invite.expired ? (
                      <Badge tone="danger">Expired</Badge>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="size-3.5" />
                        {formatRelative(invite.expiresAt)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => resend(invite)}>
                      <RotateCcw /> Resend
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => revoke(invite)}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelBody>
    </Panel>
  );
}

export function TeamView() {
  const me = useMe();
  const isAdmin = can(me.role, UiAction.MANAGE_TEAM);
  const members = useApi(apiUrl(API_ENDPOINTS.USERS), TeamMembers);
  const invites = useApi(isAdmin ? apiUrl(API_ENDPOINTS.INVITES) : null, InviteViews);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);

  const reload = () => {
    members.reload();
    invites.reload();
  };
  const active = members.data?.filter((m) => !m.disabledAt).length;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Team"
        description={
          isAdmin
            ? "Invite people, set their role and policy groups, and disable access. Every person an agent acts for must be on this list."
            : "The people on your Intentlock team. Ask an admin to change roles or invite someone."
        }
        actions={
          isAdmin && (
            <Button onClick={() => setInviting((v) => !v)}>
              <UserPlus /> Invite member
            </Button>
          )
        }
      />
      {revealed && (
        <SecretReveal
          title={revealed.title}
          description={revealed.description}
          secret={revealed.secret}
          onDone={() => setRevealed(null)}
        />
      )}
      {isAdmin && inviting && (
        <InviteMemberForm
          onCancel={() => setInviting(false)}
          onInvited={(r) => {
            setInviting(false);
            setRevealed(linkNotice(LinkKind.INVITE, r.email, r));
            invites.reload();
          }}
        />
      )}
      <Panel>
        <PanelHeader>
          <PanelTitle>
            <Users />
            Members
            {active !== undefined && <PanelCount>{active}</PanelCount>}
          </PanelTitle>
        </PanelHeader>
        {members.error ? (
          <PanelBody className="p-0">
            <EmptyState icon={TriangleAlert} title="Could not load the team" />
          </PanelBody>
        ) : !members.data ? (
          <PanelBody className="grid gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </PanelBody>
        ) : (
          <PanelBody className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {[
                    "Member",
                    "Role",
                    "Groups",
                    ...(isAdmin ? ["Sign-in"] : []),
                    "Status",
                    ...(isAdmin ? [""] : []),
                  ].map((h, i) => (
                    <TableHead key={i}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data.map((m) => {
                  const self = m.email === me.email;
                  return (
                    <TableRow key={m.email} className={m.disabledAt ? "opacity-60" : undefined}>
                      <TableCell>
                        <span className="flex items-center gap-3">
                          <Avatar email={m.email} />
                          <span className="font-medium">{m.email}</span>
                          {self && <Badge>You</Badge>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge tone={ROLE_TONE[m.role]} className="capitalize">
                          {m.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {editing === m.email ? (
                          <GroupsEditor
                            member={m}
                            onDone={(saved) => {
                              setEditing(null);
                              if (saved) members.reload();
                            }}
                          />
                        ) : m.groups.length ? (
                          <span className="flex flex-wrap gap-1">
                            {m.groups.map((g) => (
                              <Badge key={g}>{g}</Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <SignIn member={m} />
                        </TableCell>
                      )}
                      <TableCell>
                        {m.disabledAt ? (
                          <Badge>Disabled</Badge>
                        ) : (
                          <Badge tone="success">
                            <span aria-hidden className="size-1.5 rounded-full bg-current" />
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="w-12 text-right">
                          {!self && (
                            <MemberActions
                              member={m}
                              onChanged={members.reload}
                              onEditGroups={() => setEditing(m.email)}
                              onReveal={setRevealed}
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </PanelBody>
        )}
      </Panel>
      {isAdmin && invites.data && (
        <InvitesPanel invites={invites.data} onChanged={reload} onReveal={setRevealed} />
      )}
    </div>
  );
}
