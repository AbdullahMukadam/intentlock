import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { API_ENDPOINTS, apiPath } from "@intentlock/core";
import { z } from "zod";

import { AuditService } from "../../audit/audit.service.js";
import { AuditKind } from "../../audit/enums/audit-kind.enum.js";
import { AppPage } from "../../common/enums/app-page.enum.js";
import { newSecret, safeEqual } from "../../common/utils/crypto.util.js";
import { ENV, type Env } from "../../config/config.module.js";
import { IdentityProvider, type User } from "../../generated/prisma/client.js";
import { InvitesService } from "../../invites/invites.service.js";
import { KeysService } from "../../keys/keys.service.js";
import { orgDb } from "../../org/utils/org-db.util.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { SignInMethod } from "../enums/sign-in-method.enum.js";
import { SessionsService } from "../sessions.service.js";
import type { RequestMeta } from "../types/request-meta.type.js";
import {
  OAUTH_PROVIDERS,
  OAUTH_STATE_ISSUER,
  OAUTH_STATE_TTL_SECONDS,
  OAUTH_STATE_TYPE,
} from "./constants/oauth.constants.js";
import { OAuthError } from "./enums/oauth-error.enum.js";
import { OAuthMode } from "./enums/oauth-mode.enum.js";
import type { OAuthState } from "./types/oauth-state.type.js";
import type { ProviderIdentity } from "./types/provider-identity.type.js";
import { fetchIdentity } from "./utils/fetch-identity.util.js";
import type { OAuthProviders } from "./utils/oauth-providers.util.js";
import { pkcePair } from "./utils/pkce.util.js";

const StateClaims = z.object({
  provider: z.enum(IdentityProvider),
  state: z.string(),
  nonce: z.string(),
  verifier: z.string(),
  mode: z.enum(OAuthMode),
  invite: z.string().optional(),
});

export type CallbackResult = { redirect: string; session?: string };

const METHOD: Record<IdentityProvider, SignInMethod> = {
  [IdentityProvider.google]: SignInMethod.GOOGLE,
  [IdentityProvider.github]: SignInMethod.GITHUB,
};

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly invites: InvitesService,
    private readonly keys: KeysService,
    @Inject(OAUTH_PROVIDERS) private readonly providers: OAuthProviders,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async start(provider: IdentityProvider, mode: OAuthMode, invite?: string) {
    const config = this.config(provider);
    const { verifier, challenge } = pkcePair();
    const claims: OAuthState = {
      provider,
      state: newSecret(),
      nonce: newSecret(),
      verifier,
      mode,
      invite,
    };
    const cookie = await this.keys.signState(
      claims,
      OAUTH_STATE_TYPE,
      OAUTH_STATE_ISSUER,
      OAUTH_STATE_TTL_SECONDS,
    );
    const url = new URL(config.authorizeUrl);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: this.redirectUri(provider),
      scope: config.scope,
      state: claims.state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...(provider === IdentityProvider.google
        ? { nonce: claims.nonce, prompt: "select_account" }
        : {}),
    }).toString();
    return { url: url.toString(), cookie };
  }

  async callback(
    provider: IdentityProvider,
    query: { code?: string | undefined; state?: string | undefined; error?: string | undefined },
    stateCookie: string | undefined,
    sessionCookie: string | undefined,
    meta: RequestMeta,
  ): Promise<CallbackResult> {
    const config = this.providers[provider];
    const raw = stateCookie
      ? await this.keys.verifyState(stateCookie, OAUTH_STATE_TYPE, OAUTH_STATE_ISSUER)
      : null;
    const parsed = StateClaims.safeParse(raw);
    if (
      !config ||
      !parsed.success ||
      parsed.data.provider !== provider ||
      !query.state ||
      !safeEqual(parsed.data.state, query.state)
    ) {
      return this.fail(OAuthError.OAUTH_FAILED);
    }
    const st = parsed.data;
    const page = st.mode === OAuthMode.LINK ? AppPage.ACCOUNT : AppPage.LOGIN;
    if (query.error || !query.code) return this.fail(OAuthError.OAUTH_CANCELLED, page);

    let identity: ProviderIdentity;
    try {
      identity = await fetchIdentity(provider, config, {
        code: query.code,
        verifier: st.verifier,
        nonce: st.nonce,
        redirectUri: this.redirectUri(provider),
      });
    } catch {
      await this.auditFailure(provider, OAuthError.OAUTH_FAILED, null, meta);
      return this.fail(OAuthError.OAUTH_FAILED, page);
    }
    if (!identity.emailVerified || !identity.email) {
      await this.auditFailure(provider, OAuthError.EMAIL_NOT_VERIFIED, identity.email, meta);
      return this.fail(OAuthError.EMAIL_NOT_VERIFIED, page);
    }

    if (st.mode === OAuthMode.LINK) return this.link(provider, identity, sessionCookie);
    if (st.mode === OAuthMode.INVITE) return this.acceptInvite(provider, identity, st.invite, meta);
    return this.signIn(provider, identity, meta);
  }

  private async signIn(
    provider: IdentityProvider,
    identity: ProviderIdentity,
    meta: RequestMeta,
  ): Promise<CallbackResult> {
    const linked = await this.prisma.identity.findFirst({
      where: { provider, subject: identity.subject },
      include: { user: true },
    });
    let user: User | null = linked?.user ?? null;
    if (!linked) {
      const byEmail = await this.prisma.user.findFirst({
        where: { email: identity.email, disabledAt: null },
        include: { identities: true },
      });
      if (byEmail?.identities.some((i) => i.provider === provider)) {
        await this.auditFailure(provider, OAuthError.ALREADY_LINKED, identity.email, meta);
        return this.fail(OAuthError.ALREADY_LINKED);
      }
      if (byEmail) {
        await this.linkIdentity(byEmail, provider, identity, true);
        user = byEmail;
      }
    }
    if (!user || user.disabledAt) {
      await this.auditFailure(provider, OAuthError.NO_ACCOUNT, identity.email, meta);
      return this.fail(OAuthError.NO_ACCOUNT);
    }
    const session = await this.sessions.create(user, meta);
    await this.audit.append(user.orgId, [
      {
        kind: AuditKind.AUTH_LOGIN,
        actor: user.id,
        payload: { email: user.email, method: METHOD[provider], ip: meta.ip },
      },
    ]);
    return { redirect: this.page(AppPage.HOME), session };
  }

  private async link(
    provider: IdentityProvider,
    identity: ProviderIdentity,
    sessionCookie: string | undefined,
  ): Promise<CallbackResult> {
    const session = await this.sessions.resolveCookie(sessionCookie);
    if (!session) return this.fail(OAuthError.NOT_SIGNED_IN);
    const { user } = session;
    const existing = await this.prisma.identity.findFirst({
      where: { provider, subject: identity.subject },
    });
    if (existing && existing.userId !== user.id) {
      return this.fail(OAuthError.IDENTITY_IN_USE, AppPage.ACCOUNT);
    }
    if (!existing) {
      const mine = await orgDb(this.prisma, user.orgId).identity.findFirst({
        where: { userId: user.id, provider },
      });
      if (mine) return this.fail(OAuthError.ALREADY_LINKED, AppPage.ACCOUNT);
      await this.linkIdentity(user, provider, identity, false);
    }
    return { redirect: `${this.page(AppPage.ACCOUNT)}?linked=${provider}` };
  }

  private async acceptInvite(
    provider: IdentityProvider,
    identity: ProviderIdentity,
    token: string | undefined,
    meta: RequestMeta,
  ): Promise<CallbackResult> {
    let invite;
    try {
      invite = await this.invites.findValid(token ?? "");
    } catch {
      return this.fail(OAuthError.INVITE_INVALID);
    }
    if (invite.email !== identity.email) {
      return this.fail(OAuthError.INVITE_EMAIL_MISMATCH);
    }
    if (await this.prisma.identity.findFirst({ where: { provider, subject: identity.subject } })) {
      return this.fail(OAuthError.IDENTITY_IN_USE);
    }
    try {
      const { cookie } = await this.invites.consume(invite, {}, meta, METHOD[provider], {
        provider,
        subject: identity.subject,
        email: identity.email,
      });
      return { redirect: this.page(AppPage.HOME), session: cookie };
    } catch (e) {
      if (e instanceof HttpException) {
        const body = e.getResponse() as { error?: string };
        return this.fail(body.error ?? OAuthError.OAUTH_FAILED);
      }
      throw e;
    }
  }

  private async linkIdentity(
    user: { id: string; orgId: string; email: string },
    provider: IdentityProvider,
    identity: ProviderIdentity,
    automatic: boolean,
  ) {
    await orgDb(this.prisma, user.orgId).$transaction(async (tx) => {
      await tx.identity.create({
        data: {
          orgId: user.orgId,
          userId: user.id,
          provider,
          subject: identity.subject,
          email: identity.email,
        },
      });
      await this.audit.append(
        user.orgId,
        [
          {
            kind: AuditKind.IDENTITY_LINKED,
            actor: user.id,
            payload: { email: user.email, provider, providerEmail: identity.email, automatic },
          },
        ],
        tx,
      );
    });
  }

  private async auditFailure(
    provider: IdentityProvider,
    reason: OAuthError,
    email: string | null,
    meta: RequestMeta,
  ) {
    const org = await this.prisma.organization.findFirst();
    if (!org) return;
    await this.audit.append(org.id, [
      {
        kind: AuditKind.AUTH_LOGIN_FAILED,
        payload: { email, method: METHOD[provider], reason, ip: meta.ip },
      },
    ]);
  }

  private config(provider: IdentityProvider) {
    const config = this.providers[provider];
    if (!config) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: OAuthError.PROVIDER_DISABLED,
      });
    }
    return config;
  }

  private redirectUri(provider: IdentityProvider) {
    return `${this.env.PUBLIC_URL}/api${apiPath(API_ENDPOINTS.AUTH_OAUTH_CALLBACK, { provider })}`;
  }

  private page(page: AppPage) {
    return `${this.env.PUBLIC_URL}${page}`;
  }

  private fail(error: string, page: AppPage = AppPage.LOGIN): CallbackResult {
    return { redirect: `${this.page(page)}?error=${encodeURIComponent(error)}` };
  }
}
