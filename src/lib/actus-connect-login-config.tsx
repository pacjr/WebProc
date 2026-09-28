import type { ProductLoginConfig } from "@insight/product-login-system";
import { ActusConnectLogo } from "@/components/auth/ActusConnectLogo";
import actusConnectAuthHero from "@/assets/auth/actus-connect-auth-hero.png";

export const actusConnectLoginConfig: ProductLoginConfig = {
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
  authTitle: "Acesso",
  authDescription: "Entre com e-mail e senha para acessar a aplicação.",
};

export const ACTUS_CONNECT_APP_VERSION = "1.0.0";
