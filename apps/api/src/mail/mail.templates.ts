type WelcomeTemplateInput = {
  recipientName: string;
  userIdentifier: string;
  password: string;
  loginUrl: string;
  createdByLabel: string;
};

type PasswordResetTemplateInput = {
  recipientName: string;
  username: string;
  tenantName: string;
};

type TenantWelcomeTemplateInput = {
  recipientName: string;
  tenantName: string;
  ownerEmail: string;
  initialPassword: string;
  loginUrl: string;
};

const baseEmailShell = (title: string, contentHtml: string, includeSystemFooter = true): string => `
<div style="font-family:Arial,Helvetica,sans-serif;background:#f5f7fb;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
    <h2 style="margin:0 0 16px;color:#0f172a;">${title}</h2>
    ${contentHtml}
    ${
      includeSystemFooter
        ? `<p style="margin-top:24px;color:#64748b;font-size:12px;">
      Este e-mail foi enviado automaticamente pelo sistema Drax.
    </p>`
        : ""
    }
  </div>
</div>
`;

export const buildWelcomeCredentialsTemplate = (input: WelcomeTemplateInput) => {
  const subject = "Acesso liberado ao painel Drax";
  const html = baseEmailShell(
    "Seu acesso foi criado",
    `
    <p style="margin:0 0 12px;color:#1e293b;">Olá, <strong>${input.recipientName}</strong>.</p>
    <p style="margin:0 0 12px;color:#1e293b;">
      Você já pode acessar o painel e concluir as próximas configurações.
    </p>
    <p style="margin:0 0 8px;color:#1e293b;"><strong>Usuário:</strong> ${input.userIdentifier}</p>
    <p style="margin:0 0 8px;color:#1e293b;"><strong>Senha inicial:</strong> ${input.password}</p>
    <p style="margin:12px 0 8px;color:#1e293b;">
      Para realizar seu login, acesse:
      <a href="${input.loginUrl}" target="_blank" rel="noreferrer">${input.loginUrl}</a>
    </p>
    <p style="margin:0 0 12px;color:#1e293b;">
      Seu usuário foi criado com sucesso pela <strong>${input.createdByLabel}</strong>.
    </p>
    <p style="margin:16px 0 0;color:#b45309;">
      Recomendamos alterar a senha no primeiro acesso.
    </p>
    <p style="margin:12px 0 0;color:#1e293b;">
      A equipe ${input.createdByLabel} agradece sua preferência!
    </p>
  `,
    false,
  );
  return { subject, html };
};

export const buildPasswordResetNoticeTemplate = (input: PasswordResetTemplateInput) => {
  const subject = "Senha redefinida com sucesso";
  const html = baseEmailShell(
    "Sua senha foi atualizada",
    `
    <p style="margin:0 0 12px;color:#1e293b;">Olá, <strong>${input.recipientName}</strong>.</p>
    <p style="margin:0 0 12px;color:#1e293b;">
      A senha do usuário <strong>${input.username}</strong> no assinante <strong>${input.tenantName}</strong> foi redefinida.
    </p>
    <p style="margin:0;color:#1e293b;">
      Se você não reconhece esta ação, entre em contato com o suporte imediatamente.
    </p>
  `,
  );
  return { subject, html };
};

export const buildTenantWelcomeTemplate = (input: TenantWelcomeTemplateInput) => {
  return buildWelcomeCredentialsTemplate({
    recipientName: input.recipientName,
    userIdentifier: input.ownerEmail,
    password: input.initialPassword,
    loginUrl: input.loginUrl,
    createdByLabel: "Walkup",
  });
};
