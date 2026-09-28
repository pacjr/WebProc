import type { ProductLoginConfig } from "@insight/product-login-system";
import { ActusConnectLogo } from "@/components/auth/ActusConnectLogo";
import actusConnectAuthHero from "@/assets/auth/actus-connect-auth-hero.png";

/** Auth card copy per Connect lifecycle surface (presentation only). */
export const ACTUS_AUTH_CARD = {
  login: {
    authTitle: "Acesso",
    authDescription: "Entre com e-mail e senha para acessar a aplicação.",
  },
  recovery: {
    authTitle: "Recuperação",
    authDescription: "Informe seu e-mail para receber as instruções de recuperação.",
  },
  newPassword: {
    authTitle: "Nova senha",
    authDescription: "Defina uma nova senha para continuar.",
  },
  activation: {
    authTitle: "Ativação",
    authDescription: "Defina sua senha para ativar sua conta.",
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
