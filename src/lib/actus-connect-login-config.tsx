import type { ProductLoginConfig } from "@insight/product-login-system";
import { ActusConnectLogo } from "@/components/auth/ActusConnectLogo";
import actusConnectAuthHero from "@/assets/auth/actus-connect-auth-hero.png";

/** Auth card copy per Connect lifecycle surface (presentation only). */
export const ACTUS_AUTH_CARD = {
  login: {
    authTitle: "",
    authDescription: "Entre com e-mail e senha para acessar a aplicação.",
  },
  recovery: {
    authTitle: "Recuperar senha",
    authDescription: "Informe seu e-mail para receber as instruções de recuperação.",
  },
  recoverySent: {
    authTitle: "Verifique seu e-mail",
    authDescription:
      "Se existir uma conta associada ao endereço informado, enviaremos as instruções para redefinição da senha.",
  },
  newPassword: {
    authTitle: "Definir nova senha",
    authDescription: "Escolha uma nova senha para continuar usando o Actus Connect.",
  },
  recoveryInvalid: {
    authTitle: "Link inválido ou expirado",
    authDescription: "Solicite uma nova redefinição de senha para continuar.",
  },
  passwordUpdated: {
    authTitle: "Senha atualizada",
    authDescription: "Sua senha foi redefinida com sucesso.",
  },
  activation: {
    authTitle: "Ativar acesso",
    authDescription: "Conclua a ativação do seu acesso ao Connect.",
  },
  activationInvalid: {
    authTitle: "Convite inválido ou expirado",
    authDescription:
      "Este link de ativação não é válido ou já expirou. Solicite um novo convite à Actus.",
  },
  activationNoAccess: {
    authTitle: "Acesso ao Connect indisponível",
    authDescription: "Não foi possível concluir o acesso ao Connect com esta conta.",
  },
} as const;

const actusConnectPresentationBase: Omit<
  ProductLoginConfig,
  "authTitle" | "authDescription"
> = {
  audience: "internal",
  productName: "Actus Connect",
  productTagline: "Relacionamento e entrada digital de demandas.",
  productDescription:
    "Da solicitação ao acompanhamento.\n\nRegistre demandas de cálculos trabalhistas, envie as informações necessárias e acompanhe o andamento pelo Actus Connect.",
  productLogo: <ActusConnectLogo />,
  hero: {
    type: "image",
    src: actusConnectAuthHero,
    alt: "Ilustração de fluxo digital: solicitação, documentos e acompanhamento de demandas trabalhistas.",
  },
  accentClassName: "from-brand-primary/15",
};

export function getActusConnectAuthPresentation(
  card: (typeof ACTUS_AUTH_CARD)[keyof typeof ACTUS_AUTH_CARD],
): ProductLoginConfig {
  return {
    ...actusConnectPresentationBase,
    ...card,
  };
}

export const actusConnectLoginConfig = getActusConnectAuthPresentation(
  ACTUS_AUTH_CARD.login,
);

export const ACTUS_CONNECT_APP_VERSION = "1.0.0";
